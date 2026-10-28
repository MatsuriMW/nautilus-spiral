import AppIntents
import SwiftUI

// 小组件上点一行前面的圆圈：做完 ↔ 撤回。交给 WidgetData.send 写进收件箱，螺旋日程收到后改日记（或者计划笔记）
struct ToggleIntent: AppIntent {
    static var title: LocalizedStringResource = "做完 / 撤回"
    static var isDiscoverable: Bool = false

    @Parameter(title: "类别") var kind: String
    @Parameter(title: "名字") var text: String
    @Parameter(title: "改成做完") var done: Bool
    @Parameter(title: "日期") var day: String
    @Parameter(title: "位置") var ref: String   // 待办用：「行号:笔记路径」

    init() {}
    init(kind: String, text: String, done: Bool, day: String, ref: String = "") {
        self.kind = kind
        self.text = text
        self.done = done
        self.day = day
        self.ref = ref
    }

    func perform() async throws -> some IntentResult {
        WidgetData.send(kind: kind, text: text, done: done, day: day, ref: ref)
        return .result()
    }
}

// 小组件右上角的刷新：叫螺旋日程马上重算一遍（Obsidian 没开着就只是重读一下现有的数据）。按钮跑完 WidgetKit 自己会刷新小组件
struct RefreshIntent: AppIntent {
    static var title: LocalizedStringResource = "刷新"
    static var isDiscoverable: Bool = false
    func perform() async throws -> some IntentResult {
        WidgetData.send(kind: "refresh", text: "", done: false, day: "")
        return .result()
    }
}

struct RefreshButton: View {
    @Environment(\.plainLinks) private var plain
    var body: some View {
        let icon = Image(systemName: "arrow.clockwise").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary)
        if plain { icon } else { Button(intent: RefreshIntent()) { icon }.buttonStyle(.plain) }
    }
}

// 一行前面的圆圈：没做完的点了记成做完，做完的点了撤回。state = done / doing / open / failed（没做成，打叉）。
// 画 PNG 预览时（plainLinks）ImageRenderer 画不了按钮，只画图标
struct CheckButton: View {
    @Environment(\.plainLinks) private var plain
    let kind: String
    let text: String
    let state: String
    let day: String
    var size: CGFloat = 12
    var color: Color = Palette.main
    var ref: String = ""

    var body: some View {
        let icon = Image(systemName: state == "done" ? "checkmark.circle.fill" : state == "doing" ? "circle.lefthalf.filled" : state == "failed" ? "xmark.circle" : "circle")
            .font(.system(size: size))
            .foregroundStyle(color)
        if plain {
            icon
        } else {
            Button(intent: ToggleIntent(kind: kind, text: text, done: state != "done", day: day, ref: ref)) { icon }
                .buttonStyle(.plain)
        }
    }
}
