import SwiftUI
import WidgetKit

// 📅 计划甘特图：从这周一起画 5 周。计划笔记里写了日期的列表项一条一行，按分组上色；
// 只有一个日期的画成菱形；做完的画淡；过了截止还没做完的画成红色。点一行跳回计划笔记的那一行
struct PlanView: View {
    let data: WidgetData?
    let wide: Bool                     // 特大号：标签宽一点，每天都标日期
    var now: Date = .now

    private let days = 35
    private var today: Date { Calendar.current.startOfDay(for: now) }
    private var first: Date {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        return cal.dateInterval(of: .weekOfYear, for: today)?.start ?? today
    }
    private func date(_ i: Int) -> Date { Calendar.current.date(byAdding: .day, value: i, to: first)! }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Label(data?.plan?.title ?? "计划", systemImage: "calendar").font(.system(size: 13, weight: .semibold))
                Spacer()
                Text("\(short(first)) – \(short(date(days - 1)))").font(.system(size: 10)).foregroundStyle(.secondary).monospacedDigit()
            }
            if let plan = data?.plan {
                let rows = plan.rows.filter { r in
                    guard let a = Dates.parse(r.start), let b = Dates.parse(r.end) else { return false }
                    return b >= first && a <= date(days - 1)
                }
                if rows.isEmpty { Hint(title: "这 5 周没有排上日期的事", detail: "在「\(plan.title)」的列表项里写上 🛫 开始、📅 截止日期") }
                else { chart(rows) }
            } else if let data {
                Hint(title: "没找到计划笔记", detail: "螺旋日程设置里的「计划笔记」是 \(data.planPath)")
            } else {
                Hint.noData
            }
        }
        .widgetURL(Go.url(data?.plan?.link))
    }

    private enum Line: Identifiable {
        case group(String, Color)
        case row(WidgetData.Row, Color)
        var id: String {
            switch self {
            case .group(let g, _): "g:" + g
            case .row(let r, _): r.id
            }
        }
        var isRow: Bool { if case .row = self { true } else { false } }
        var height: CGFloat { isRow ? 17 : 13 }
    }

    // 按分组第一次出现的先后排，同一组的行挨在一起，每组前面一行组名
    private func lines(_ rows: [WidgetData.Row]) -> [Line] {
        let groups = rows.map(\.group).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        return groups.enumerated().flatMap { i, g -> [Line] in
            let c = Palette.color(i)
            return (g.isEmpty ? [] : [.group(g, c)]) + rows.filter { $0.group == g }.map { .row($0, c) }
        }
    }

    private func chart(_ rows: [WidgetData.Row]) -> some View {
        GeometryReader { geo in
            let labelW: CGFloat = wide ? 150 : 86, axisH: CGFloat = wide ? 25 : 15
            let dayW = (geo.size.width - labelW) / CGFloat(days)
            let all = lines(rows)
            let fit = fitting(all, height: geo.size.height - axisH)
            ZStack(alignment: .topLeading) {
                grid(labelW: labelW, dayW: dayW, height: geo.size.height)
                VStack(alignment: .leading, spacing: 0) {
                    axis(labelW: labelW, dayW: dayW).frame(height: axisH)
                    ForEach(all.prefix(fit)) { line in
                        switch line {
                        case .group(let g, let c):
                            HStack(spacing: 4) {
                                Circle().fill(c).frame(width: 5, height: 5)
                                Text(g).font(.system(size: 9.5, weight: .semibold)).foregroundStyle(.secondary).lineLimit(1)
                            }
                            .frame(height: line.height)
                        case .row(let r, let c):
                            HStack(spacing: 0) {
                                // 圆圈：点了在计划笔记里勾上（再点取消）；名字和条点了跳回计划笔记那一行
                                CheckButton(kind: "plan", text: r.label, state: r.done ? "done" : "open", day: data?.today ?? "", size: 9, color: c)
                                    .frame(width: 14)
                                RowLink(r.link) { row(r, color: c, labelW: labelW - 14, dayW: dayW) }
                            }
                            .frame(height: line.height)
                        }
                    }
                    if fit < all.count {
                        Text("还有 \(all[fit...].filter(\.isRow).count) 条…")
                            .font(.system(size: 9)).foregroundStyle(.secondary).padding(.leading, 9)
                    }
                }
                Rectangle().fill(Color.red.opacity(0.8))   // 今天（一定在这 5 周里：从这周一画起）
                    .frame(width: 1.5, height: geo.size.height - axisH + 2)
                    .offset(x: labelW + (CGFloat(index(of: today)) + 0.5) * dayW - 0.75, y: axisH - 2)
            }
        }
    }

    // 放得下几行：留一行给「还有 N 条」
    private func fitting(_ all: [Line], height: CGFloat) -> Int {
        var h: CGFloat = 0
        for (i, l) in all.enumerated() {
            h += l.height
            if h > height - (i == all.count - 1 ? 0 : 12) { return i }
        }
        return all.count
    }

    private func row(_ r: WidgetData.Row, color: Color, labelW: CGFloat, dayW: CGFloat) -> some View {
        let a = max(0, index(r.start) ?? 0), e = index(r.end) ?? days - 1, b = min(days - 1, e)
        let late = !r.done && e < index(of: today)
        let fill = late ? Color.red : color
        return HStack(spacing: 0) {
            Text(r.label)
                .font(.system(size: wide ? 11.5 : 10.5))
                .foregroundStyle(r.done ? .secondary : .primary)
                .strikethrough(r.done)
                .lineLimit(1)
                .frame(width: labelW - 4, alignment: .leading)
                .padding(.leading, 4)
            ZStack(alignment: .leading) {
                if r.start == r.end {
                    Rectangle().fill(fill.opacity(r.done ? 0.35 : 0.95))
                        .frame(width: 7, height: 7).rotationEffect(.degrees(45))
                        .offset(x: (CGFloat(a) + 0.5) * dayW - 3.5)
                } else {
                    RoundedRectangle(cornerRadius: 3).fill(fill.opacity(r.done ? 0.3 : 0.85))
                        .frame(width: max(3, CGFloat(b - a + 1) * dayW - 2), height: 9)
                        .offset(x: CGFloat(a) * dayW + 1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // 周末打底色，每周一一条竖线
    private func grid(labelW: CGFloat, dayW: CGFloat, height: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(0..<days, id: \.self) { i in
                let wd = Calendar.current.component(.weekday, from: date(i))
                if wd == 1 || wd == 7 {
                    Rectangle().fill(Color.primary.opacity(0.05)).frame(width: dayW, height: height).offset(x: labelW + CGFloat(i) * dayW)
                }
                if wd == 2 {
                    Rectangle().fill(Color.primary.opacity(0.12)).frame(width: 0.5, height: height).offset(x: labelW + CGFloat(i) * dayW)
                }
            }
        }
    }

    // 日期轴：每周一标「月/日」；特大号下面再一行，每天的号数，今天标红
    private func axis(labelW: CGFloat, dayW: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(0..<days, id: \.self) { i in
                let d = date(i), isToday = i == index(of: today)
                if Calendar.current.component(.weekday, from: d) == 2 {
                    Text(short(d)).font(.system(size: 8.5, weight: .semibold)).monospacedDigit().fixedSize()
                        .foregroundStyle(isToday && !wide ? Color.red : Color.secondary)
                        .offset(x: labelW + CGFloat(i) * dayW + 2)
                }
                if wide {
                    Text("\(Calendar.current.component(.day, from: d))")
                        .font(.system(size: 8.5, weight: isToday ? .bold : .regular)).monospacedDigit()
                        .foregroundStyle(isToday ? Color.red : Color.secondary)
                        .frame(width: dayW)
                        .offset(x: labelW + CGFloat(i) * dayW, y: 11)
                }
            }
        }
    }

    // 第几天（从这周一算起，可以是负的、也可以超出 5 周，画的时候再夹住）
    private func index(_ s: String) -> Int? { Dates.parse(s).map(index(of:)) }
    private func index(of d: Date) -> Int { Dates.between(first, d) }
    private func short(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.month, .day], from: d)
        return "\(c.month!)/\(c.day!)"
    }
}

enum Palette {
    static let main = Color(red: 0.18, green: 0.62, blue: 0.27)          // 螺旋日程的主线绿 #2f9e44
    static let doing = Color(red: 0.91, green: 0.35, blue: 0.05)         // 在做：橙
    private static let list: [Color] = [
        Color(red: 0.11, green: 0.49, blue: 0.84),                        // 蓝
        main,
        Color(red: 0.91, green: 0.35, blue: 0.05),                        // 橙
        Color(red: 0.68, green: 0.24, blue: 0.79),                        // 紫
        Color(red: 0.05, green: 0.52, blue: 0.60),                        // 青
        Color(red: 0.84, green: 0.20, blue: 0.42),                        // 玫红
    ]
    static func color(_ i: Int) -> Color { list[i % list.count] }
}

// 小组件里一行可以点；画 PNG 预览时（--render）ImageRenderer 画不了 Link，换成普通视图
struct PlainLinksKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var plainLinks: Bool {
        get { self[PlainLinksKey.self] }
        set { self[PlainLinksKey.self] = newValue }
    }
}

// 小组件里的链接一律包一层 nautilus-widgets://open?url=…：点下去先到宿主 App，由它转给 Obsidian
// （直接放 obsidian:// 的话，WidgetKit 把它交给宿主 App 就没下文了，点了没反应）
enum Go {
    static func url(_ s: String?) -> URL? {
        guard let s, !s.isEmpty, var c = URLComponents(string: "nautilus-widgets://open") else { return nil }
        c.queryItems = [URLQueryItem(name: "url", value: s)]
        return c.url
    }
}

struct RowLink<Content: View>: View {
    @Environment(\.plainLinks) private var plain
    let url: String
    let content: Content
    init(_ url: String, @ViewBuilder content: () -> Content) {
        self.url = url
        self.content = content()
    }
    var body: some View {
        if plain { content } else { Link(destination: Go.url(url) ?? URL(string: "obsidian://")!) { content } }
    }
}

struct Hint: View {
    let title: String
    let detail: String
    static let noData = Hint(title: "还没有数据", detail: "Obsidian 设置 → 第三方插件 → 螺旋日程 →「🗓 macOS 小组件」，打开「给小组件导出数据」")
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Spacer(minLength: 0)
            Text(title).font(.system(size: 13, weight: .semibold))
            Text(detail).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
