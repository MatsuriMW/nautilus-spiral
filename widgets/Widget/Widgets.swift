import SwiftUI
import WidgetKit

struct Entry: TimelineEntry {
    let date: Date
    let data: WidgetData?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, data: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, data: context.isPreview ? .sample : WidgetData.load() ?? .sample))
    }

    // 内容变了插件会叫 App 刷新，这里不轮询。显示里跟时刻有关的只有中午（主线算不算过期）和半夜（甘特图的「今天」挪一格）：
    // 各排一条同样数据的，过了半夜再读一次文件
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let now = Date.now, cal = Calendar.current, data = WidgetData.load()
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 30, of: now)!
        let midnight = cal.date(byAdding: .second, value: 30, to: cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now))!)!
        let dates = [now] + (noon > now ? [noon] : []) + [midnight]
        completion(Timeline(entries: dates.map { Entry(date: $0, data: data) }, policy: .after(midnight)))
    }
}

struct MainWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "main", provider: Provider()) { entry in
            MainEntryView(entry: entry)
        }
        .configurationDisplayName(Lang.t("今天的主线", "Today's mainline"))
        .description(Lang.t("螺旋日程：日记里带 [#A] 的主线，做到第几件、下一件和它的目标；点圆圈记成做完", "Nautilus Spiral: today's mainline blocks (marked [#A]), how many are done, the next one and its goal; tap the circle to mark one done"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DoingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "doing", provider: Provider()) { entry in
            DoingEntryView(entry: entry)
        }
        .configurationDisplayName(Lang.t("在做", "Doing"))
        .description(Lang.t("螺旋日程：今天日记里 DOING 的几件，各做了多久；点圆圈记成做完", "Nautilus Spiral: the tasks in DOING in today's journal and how long each has been running; tap the circle to mark one done"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "todo", provider: Provider()) { entry in
            TodoEntryView(entry: entry)
        }
        .configurationDisplayName(Lang.t("待办", "To-dos"))
        .description(Lang.t("螺旋日程：全库没做完的 TODO、LATER 和「- [ ]」，最近改过的笔记排前面；点圆圈勾掉", "Nautilus Spiral: every open TODO, LATER and - [ ] in the vault, most recently edited notes first; tap the circle to tick one off"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct PlanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "plan", provider: Provider()) { entry in
            PlanEntryView(entry: entry)
        }
        .configurationDisplayName(Lang.t("计划甘特图", "Plan Gantt"))
        .description(Lang.t("螺旋日程：「上班计划」里写了日期的事，从这周一起画 5 周；点圆圈勾掉", "Nautilus Spiral: dated items in the plan note, drawn as five weeks from this Monday; tap the circle to tick one off"))
        .supportedFamilies([.systemLarge, .systemExtraLarge])
    }
}

struct MainEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry
    var body: some View {
        MainView(data: entry.data, medium: family != .systemSmall, now: entry.date)
            .containerBackground(.background, for: .widget)
    }
}

struct DoingEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry
    var body: some View {
        DoingView(data: entry.data, medium: family != .systemSmall, now: entry.date)
            .containerBackground(.background, for: .widget)
    }
}

struct TodoEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry
    var body: some View {
        TodoView(data: entry.data, family: family, now: entry.date)
            .containerBackground(.background, for: .widget)
    }
}

struct PlanEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry
    var body: some View {
        PlanView(data: entry.data, wide: family == .systemExtraLarge, now: entry.date)
            .containerBackground(.background, for: .widget)
    }
}

@main
struct NautilusWidgets: WidgetBundle {
    var body: some Widget {
        MainWidget()
        DoingWidget()
        TodoWidget()
        PlanWidget()
    }
}
