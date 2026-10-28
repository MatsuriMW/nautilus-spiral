import Foundation
import os

// 螺旋日程（Obsidian 插件）写的 ~/Library/Application Support/Nautilus Spiral/widgets.json：今天的主线、今天在做的、计划笔记的甘特图。
// 内容有变化插件才写，写完用 nautilus-widgets://reload 叫这个 App 刷新小组件。
// 反方向：小组件上点「做完 / 撤回」，send() 往同一个文件夹的 inbox/ 里放一个文件，插件收了去改日记
struct WidgetData: Decodable {
    var today: String                 // 插件眼里的「今天」（按日记日期分界算），YYYY-MM-DD
    var journal: String?              // 今天的日记（还没有日记时没有）
    var main: Main?                   // 今天的日记还没有、或者主线关着时没有
    var doing: [Doing]?               // 今天日记里 DOING 的几件；还没有日记时没有
    var todo: Todo?                   // 全库没做完的 TODO / LATER / 任务框（旧版插件写的数据里没有）
    var planPath: String
    var plan: Plan?                   // 计划笔记找不到时没有

    struct Main: Decodable {
        var done: Int
        var total: Int
        var link: String              // 今天的日记
        var tasks: [Task]             // 各块里 A 级的任务，按日记里的先后
        var next: Task?               // 在做的那件，没有就是下一件没做完的（插件算好的，和点进去跳到的是同一件）
        var history: [Day]            // 前 7 天里定了主线的日子
    }
    struct Task: Decodable, Identifiable {
        var label: String
        var state: String             // done / doing / open / failed
        var goal: String?             // 这件下面「🎯 目标：」那一行
        var link: String
        var id: String { link }
    }
    struct Doing: Decodable, Identifiable {
        var label: String
        var main: Bool                // 是主线里的
        var start: Double?            // 这一段从什么时候开始（毫秒）
        var link: String
        var id: String { link }
    }
    struct Day: Decodable { var date: String; var done: Int; var total: Int }
    struct Todo: Decodable {
        var total: Int
        var rows: [TodoRow]           // 最近改过的笔记排前面，最多 30 条
    }
    struct TodoRow: Decodable, Identifiable {
        var label: String
        var note: String              // 在哪篇笔记里
        var ref: String               // 「行号:笔记路径」，勾掉时插件按它找那一行
        var link: String
        var id: String { ref }
    }
    struct Plan: Decodable {
        var title: String
        var link: String
        var rows: [Row]
    }
    struct Row: Decodable, Identifiable {
        var group: String
        var label: String
        var start: String
        var end: String
        var done: Bool
        var link: String
        var id: String { link }
    }

    static var dir: URL {
        // 小组件在沙盒里，homeDirectoryForCurrentUser 指的是沙盒容器；要读写的是真正的家目录（只开了这一个文件夹，见 Widget.entitlements）
        let home = getpwuid(getuid()).map { String(cString: $0.pointee.pw_dir) } ?? NSHomeDirectory()
        return URL(fileURLWithPath: home).appendingPathComponent("Library/Application Support/Nautilus Spiral")
    }
    static var file: URL { dir.appendingPathComponent("widgets.json") }
    private static let log = Logger(subsystem: "site.matsuri.nautilus-widgets", category: "data")

    // 读不到、解不开都写进系统日志（log show --predicate 'subsystem == "site.matsuri.nautilus-widgets"'），小组件上只显示「还没有数据」
    static func load() -> WidgetData? {
        do {
            return try JSONDecoder().decode(WidgetData.self, from: Data(contentsOf: file))
        } catch {
            log.error("读 \(file.path, privacy: .public) 失败：\(String(describing: error), privacy: .public)")
            return nil
        }
    }

    // 插件按日记日期分界算「今天」，半夜到分界之间会落后一天，不算过期
    func isStale(_ now: Date) -> Bool {
        guard let d = Dates.parse(today) else { return true }
        let n = Dates.between(d, now)
        return n >= 2 || (n == 1 && Calendar.current.component(.hour, from: now) >= 12)
    }

    // 小组件上点「做完 / 撤回」：kind = main / doing / plan，text = 那一件的名字。写进 inbox/ 交给螺旋日程去改日记（Obsidian 没开着就等下次打开）；
    // widgets.json 先就地改一下，小组件马上显示新的状态，插件改完日记会再写一遍正式的
    static func send(kind: String, text: String, done: Bool, day: String, ref: String = "") {
        let inbox = dir.appendingPathComponent("inbox")
        do {
            try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
            let cmd: [String: Any] = ["kind": kind, "text": text, "done": done, "day": day, "ref": ref]
            try JSONSerialization.data(withJSONObject: cmd).write(to: inbox.appendingPathComponent("\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(6)).json"), options: .atomic)
        } catch {
            log.error("写收件箱失败：\(String(describing: error), privacy: .public)")
            return
        }
        patch(kind: kind, text: text, done: done, ref: ref)
    }

    private static func patch(kind: String, text: String, done: Bool, ref: String) {
        guard let raw = try? Data(contentsOf: file), var root = (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any] else { return }
        let state = { (t: [String: Any]) in t["state"] as? String ?? "" }
        switch kind {
        case "main":
            guard var main = root["main"] as? [String: Any], var tasks = main["tasks"] as? [[String: Any]] else { return }
            for i in tasks.indices where tasks[i]["label"] as? String == text { tasks[i]["state"] = done ? "done" : "open" }
            main["tasks"] = tasks
            main["done"] = tasks.filter { state($0) == "done" }.count
            // 临时的「下一件」：插件改完日记会按它的规则再算一遍
            main["next"] = tasks.first { state($0) == "doing" } ?? tasks.first { state($0) != "done" && state($0) != "failed" } ?? NSNull()
            root["main"] = main
        case "doing":
            if done, let list = root["doing"] as? [[String: Any]] { root["doing"] = list.filter { $0["label"] as? String != text } }
        case "todo":
            guard done, var todo = root["todo"] as? [String: Any], let rows = todo["rows"] as? [[String: Any]] else { return }
            todo["rows"] = rows.filter { $0["ref"] as? String != ref }
            todo["total"] = max(0, (todo["total"] as? Int ?? rows.count) - 1)
            root["todo"] = todo
        case "plan":
            guard var plan = root["plan"] as? [String: Any], var rows = plan["rows"] as? [[String: Any]] else { return }
            for i in rows.indices where rows[i]["label"] as? String == text { rows[i]["done"] = done }
            plan["rows"] = rows
            root["plan"] = plan
        default:
            return
        }
        if let out = try? JSONSerialization.data(withJSONObject: root) { try? out.write(to: file, options: .atomic) }
    }
}

// 日期都是 YYYY-MM-DD，按本地时区的那一天算
enum Dates {
    static let format: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static func parse(_ s: String) -> Date? { format.date(from: s) }
    static func string(_ d: Date) -> String { format.string(from: d) }
    static func between(_ a: Date, _ b: Date) -> Int {
        Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: a), to: Calendar.current.startOfDay(for: b)).day ?? 0
    }
}

// 小组件库里的预览、插件还没写过数据时用
extension WidgetData {
    static var sample: WidgetData {
        let cal = Calendar.current, today = cal.startOfDay(for: .now)
        let d = { (n: Int) in Dates.string(cal.date(byAdding: .day, value: n, to: today)!) }
        let row = { (g: String, l: String, a: Int, b: Int, done: Bool) in Row(group: g, label: l, start: d(a), end: d(b), done: done, link: "obsidian://open?\(l)") }
        let task = { (l: String, s: String, g: String?) in Task(label: l, state: s, goal: g, link: "obsidian://open?\(l)") }
        let tasks = [task("简历改成作品集版", "done", nil), task("写第一个案例", "doing", "按「需求 → 拆解 → 交付 → 效果」写完螺旋日程这一篇"), task("录 30 秒演示", "open", nil)]
        let ago = { (m: Double) in (Date.now.timeIntervalSince1970 - m * 60) * 1000 }
        return WidgetData(
            today: d(0),
            journal: "obsidian://open",
            main: Main(done: 1, total: 3, link: "obsidian://open", tasks: tasks, next: tasks[1],
                       history: (1...6).map { Day(date: d(-$0), done: $0 % 3, total: 3) }),
            doing: [Doing(label: "写第一个案例", main: true, start: ago(42), link: "obsidian://open?a"),
                    Doing(label: "🤖 整理无锡英语试卷", main: false, start: ago(95), link: "obsidian://open?b")],
            todo: Todo(total: 23, rows: [("回复面试邀约", "2026_10_27"), ("改简历第二版", "2026_10_27"), ("买打印纸", "2026_10_26"), ("读《注意力》第三章", "读书清单"), ("整理 Eagle 素材", "AIGC 工作区"), ("约牙医", "生活杂务")]
                .enumerated().map { TodoRow(label: $1.0, note: $1.1, ref: "\($0):x", link: "obsidian://open?\($0)") }),
            planPath: "上班计划.md",
            plan: Plan(title: "上班计划", link: "obsidian://open",
                       rows: [row("材料", "简历和项目页", -2, 4, false), row("材料", "作品集三个案例", 3, 18, false),
                              row("投递", "投递第一批", 6, 20, false), row("投递", "面试", 10, 26, false),
                              row("入职", "谈 offer", 27, 27, false), row("材料", "定方向", -8, -3, true)]))
    }
}
