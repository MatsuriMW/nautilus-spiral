import SwiftUI
import WidgetKit

// ☑︎ 待办：全库还没做完的 TODO / LATER / 任务框「- [ ]」，最近改过的笔记排前面。
// 点圆圈在那篇笔记里勾掉（TODO / LATER 换成 DONE，任务框打勾），点名字跳到那一行，点别处打开今天的日记
struct TodoView: View {
    let data: WidgetData?
    let family: WidgetFamily
    var now: Date = .now

    var body: some View {
        let limit = family == .systemLarge ? 12 : 4
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Label("待办", systemImage: "checklist").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.color(0))
                Spacer()
                RefreshButton()
                if let t = data?.todo, t.total > 0 { Text("\(t.total)").font(.system(size: 18, weight: .bold, design: .rounded)).monospacedDigit() }
            }
            if let data, data.isStale(now) {
                Hint(title: "停在 \(data.today)", detail: "打开 Obsidian 就会更新")
            } else if let data, let t = data.todo, !t.rows.isEmpty {
                ForEach(t.rows.prefix(limit)) { row($0, day: data.today) }
                if t.total > limit { Text("还有 \(t.total - limit) 条").font(.system(size: 10)).foregroundStyle(.secondary) }
                Spacer(minLength: 0)
            } else if data == nil || data?.todo == nil {
                Hint.noData
            } else {
                Hint(title: "没有待办", detail: "笔记里写 TODO、LATER 或者「- [ ]」的条目会出现在这里")
            }
        }
        .widgetURL(Go.url(data?.journal))
    }

    private func row(_ r: WidgetData.TodoRow, day: String) -> some View {
        HStack(spacing: 6) {
            CheckButton(kind: "todo", text: r.label, state: "open", day: day, color: Palette.color(0), ref: r.ref)
            RowLink(r.link) {
                HStack(spacing: 6) {
                    Text(r.label).lineLimit(1)
                    if family != .systemSmall {
                        Spacer(minLength: 4)
                        Text(r.note).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
        }
        .font(.system(size: 12))
    }
}
