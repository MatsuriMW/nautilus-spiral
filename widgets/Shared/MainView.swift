import SwiftUI
import WidgetKit

// 🎯 今天的主线：小号是进度、下一件和它的目标；中号左边进度环和近 7 天，右边逐件列出。
// 点一件前面的圆圈：在日记里记成做完（做完的再点撤回）；点名字跳回日记那一行；点别处打开今天的日记
struct MainView: View {
    let data: WidgetData?
    let medium: Bool
    var now: Date = .now

    var body: some View {
        Group {
            if let data, data.isStale(now) {
                Hint(title: "主线停在 \(data.today)", detail: "打开 Obsidian 就会更新")
            } else if let data, let m = data.main, m.total > 0 {
                if medium { mediumView(m, data) } else { smallView(m, data) }
            } else if data == nil {
                Hint.noData
            } else {
                Hint(title: data?.main == nil ? "今天还没有日记" : "今天还没定主线", detail: "给最要紧的一到三件写上 [#A]（todo a）")
            }
        }
        .widgetURL(Go.url(data?.main?.next?.link ?? data?.journal))
    }

    private func header(_ m: WidgetData.Main) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Label("主线", systemImage: "target").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.main)
            Spacer()
            RefreshButton()
            Text("\(m.done)/\(m.total)").font(.system(size: 18, weight: .bold, design: .rounded)).monospacedDigit()
        }
    }

    private func goal(_ t: WidgetData.Task?) -> some View {
        Group {
            if let g = t?.goal, !g.isEmpty {
                Label(g, systemImage: "flag").font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(2)
            } else if t != nil {
                Label("还没写目标", systemImage: "flag").font(.system(size: 10)).foregroundStyle(.orange).lineLimit(1)
            }
        }
    }

    private func smallView(_ m: WidgetData.Main, _ data: WidgetData) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            header(m)
            HStack(spacing: 4) { ForEach(m.tasks) { CheckButton(kind: "main", text: $0.label, state: $0.state, day: data.today, size: 13) } }
            Spacer(minLength: 0)
            if let nx = m.next {
                Text(nx.state == "doing" ? "在做" : "下一件").font(.system(size: 10)).foregroundStyle(.secondary)
                Text(nx.label).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                goal(nx)
            } else {
                Text("今天的主线做完了 🎉").font(.system(size: 13, weight: .semibold))
            }
        }
    }

    private func mediumView(_ m: WidgetData.Main, _ data: WidgetData) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 8) {
                ZStack {
                    Circle().stroke(Palette.main.opacity(0.15), lineWidth: 7)
                    Circle().trim(from: 0, to: CGFloat(m.done) / CGFloat(max(m.total, 1)))
                        .stroke(Palette.main, style: StrokeStyle(lineWidth: 7, lineCap: .round)).rotationEffect(.degrees(-90))
                    VStack(spacing: 0) {
                        Text("\(m.done)/\(m.total)").font(.system(size: 17, weight: .bold, design: .rounded)).monospacedDigit()
                        Text("主线").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                }
                .frame(width: 70, height: 70)
                week(m, today: Dates.parse(data.today) ?? now)
            }
            .frame(width: 84)
            VStack(alignment: .leading, spacing: 5) {
                let tasks = m.tasks
                ForEach(tasks.prefix(4)) { t in
                    HStack(spacing: 6) {
                        CheckButton(kind: "main", text: t.label, state: t.state, day: data.today)
                        RowLink(t.link) {
                            Text(t.label).font(.system(size: 12, weight: t.state == "doing" ? .semibold : .regular))
                                .foregroundStyle(t.state == "done" || t.state == "failed" ? .secondary : .primary)
                                .strikethrough(t.state == "done").lineLimit(1)
                        }
                    }
                    if t.id == m.next?.id { goal(t).padding(.leading, 18) }
                }
                if tasks.count > 4 { Text("还有 \(tasks.count - 4) 件").font(.system(size: 10)).foregroundStyle(.secondary) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // 近 7 天：每天一根小柱子，高度是完成率；没定主线的日子一个灰点，最右边是今天（插件按日记日期分界算的那个今天）
    private func week(_ m: WidgetData.Main, today: Date) -> some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach((0..<7).reversed(), id: \.self) { ago in
                let key = Dates.string(Calendar.current.date(byAdding: .day, value: -ago, to: today)!)
                let day = ago == 0 ? WidgetData.Day(date: key, done: m.done, total: m.total) : m.history.first { $0.date == key }
                if let day, day.total > 0 {
                    let rate = CGFloat(day.done) / CGFloat(day.total)
                    ZStack(alignment: .bottom) {
                        Capsule().fill(Palette.main.opacity(0.15)).frame(width: 6, height: 16)
                        Capsule().fill(Palette.main.opacity(ago == 0 ? 1 : 0.7)).frame(width: 6, height: max(3, 16 * rate))
                    }
                } else {
                    Circle().fill(Color.secondary.opacity(0.3)).frame(width: 4, height: 4).frame(width: 6, height: 16, alignment: .bottom)
                }
            }
        }
    }
}

// ▶ 今天在做的：日记里 DOING 的那几件，各自做了多久（计时自己走，不用刷新）。
// 点圆圈记成做完，点名字跳回日记那一行，点别处打开今天的日记
struct DoingView: View {
    let data: WidgetData?
    let medium: Bool
    var now: Date = .now

    var body: some View {
        let limit = medium ? 4 : 3
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Label("在做", systemImage: "play.circle").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.doing)
                Spacer()
                RefreshButton()
                if let list = data?.doing, !list.isEmpty { Text("\(list.count)").font(.system(size: 18, weight: .bold, design: .rounded)).monospacedDigit() }
            }
            if let data, data.isStale(now) {
                Hint(title: "停在 \(data.today)", detail: "打开 Obsidian 就会更新")
            } else if let data, let list = data.doing, !list.isEmpty {
                ForEach(list.prefix(limit)) { row($0, day: data.today) }
                if list.count > limit { Text("还有 \(list.count - limit) 件").font(.system(size: 10)).foregroundStyle(.secondary) }
                Spacer(minLength: 0)
            } else if data == nil {
                Hint.noData
            } else {
                Hint(title: data?.doing == nil ? "今天还没有日记" : "现在没有在做的事", detail: "在日记里把一件事改成 DOING，这里就会出现")
            }
        }
        .widgetURL(Go.url(data?.journal))
    }

    private func row(_ d: WidgetData.Doing, day: String) -> some View {
        HStack(spacing: 6) {
            CheckButton(kind: "doing", text: d.label, state: "doing", day: day, color: d.main ? Palette.main : Palette.doing)
            RowLink(d.link) {
                HStack(spacing: 3) {
                    if d.main { Image(systemName: "target").font(.system(size: 9)).foregroundStyle(Palette.main) }
                    Text(d.label).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            if let s = d.start {
                Text(Date(timeIntervalSince1970: s / 1000), style: .timer)
                    .monospacedDigit().foregroundStyle(.secondary).multilineTextAlignment(.trailing).frame(width: medium ? 58 : 46, alignment: .trailing)
            }
        }
        .font(.system(size: 12))
    }
}
