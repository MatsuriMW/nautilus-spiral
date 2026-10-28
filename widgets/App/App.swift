import AppKit
import SwiftUI
import WidgetKit

// 小组件的宿主 App，平时不常驻：
// · 螺旋日程写完新数据后用 nautilus-widgets://reload 把它叫起来：刷新小组件，两秒后自己退出
// · 双击打开：刷新一次，开一个窗口，看两个小组件现在的样子和怎么加到桌面
// · NautilusWidgets --render <目录>：把每个尺寸画成 PNG（浅色、深色各一张），检查样子用
@main
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--render"), i + 1 < args.count {
            render(into: URL(fileURLWithPath: args[i + 1]))
            exit(0)
        }
        // 被 nautilus-widgets://reload 叫起来的：刷新交给 application(_:open:)，这里只管到时候退出
        if note.userInfo?[NSApplication.launchIsDefaultUserInfoKey] as? Bool == false { quitSoon(); return }
        WidgetCenter.shared.reloadAllTimelines()
        showWindow()
    }

    // 小组件上点的链接先送到这里（WidgetKit 把小组件里的链接交给宿主 App）：nautilus-widgets://open?url=… 拆出里面的
    // obsidian:// 转给 Obsidian；别的网址原样转出去。只有 reload 才刷新小组件
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            if url.scheme == "nautilus-widgets" {
                if url.host == "open", let s = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "url" })?.value, let target = URL(string: s) {
                    NSWorkspace.shared.open(target)
                } else {
                    WidgetCenter.shared.reloadAllTimelines()
                }
            } else {
                NSWorkspace.shared.open(url)
            }
        }
        if window == nil { quitSoon() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func quitSoon() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if self.window == nil { NSApp.terminate(nil) } }
    }

    private func showWindow() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 840, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        w.title = "螺旋日程 · 小组件"
        w.contentView = NSHostingView(rootView: Gallery(data: WidgetData.load()))
        w.center()
        w.makeKeyAndOrderFront(nil)
        NSApp.activate()
        window = w
    }

    @MainActor private func render(into dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        // 真数据一份，示例数据一份（真数据里今天可能还没有主线、计划可能是空的）
        for (name, view) in Gallery.previews(WidgetData.load()) + Gallery.previews(.sample).map({ ("sample-" + $0.0, $0.1) }) {
            for scheme in [ColorScheme.light, .dark] {
                let r = ImageRenderer(content: view.environment(\.colorScheme, scheme).environment(\.plainLinks, true).padding(12).background(scheme == .dark ? Color.black : Color(white: 0.92)))
                r.scale = 2
                guard let tiff = r.nsImage?.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { continue }
                try? png.write(to: dir.appendingPathComponent("\(name)-\(scheme == .dark ? "dark" : "light").png"))
            }
        }
    }
}

// 窗口里的内容：怎么加小组件 + 各个尺寸现在的样子
struct Gallery: View {
    let data: WidgetData?

    // 和桌面上小组件差不多大（点）：小号 170×170，中号 364×170，大号 364×382，特大号 764×382
    static func previews(_ data: WidgetData?) -> [(String, AnyView)] {
        func card<V: View>(_ v: V, _ w: CGFloat, _ h: CGFloat) -> AnyView {
            AnyView(v.padding(16).frame(width: w, height: h).background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous)))
        }
        return [
            ("main-small", card(MainView(data: data, medium: false), 170, 170)),
            ("main-medium", card(MainView(data: data, medium: true), 364, 170)),
            ("doing-small", card(DoingView(data: data, medium: false), 170, 170)),
            ("doing-medium", card(DoingView(data: data, medium: true), 364, 170)),
            ("todo-small", card(TodoView(data: data, family: .systemSmall), 170, 170)),
            ("todo-medium", card(TodoView(data: data, family: .systemMedium), 364, 170)),
            ("todo-large", card(TodoView(data: data, family: .systemLarge), 364, 382)),
            ("plan-large", card(PlanView(data: data, wide: false), 364, 382)),
            ("plan-xl", card(PlanView(data: data, wide: true), 764, 382)),
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("加到桌面：右键桌面 →「编辑小组件」→ 搜「螺旋日程」，把「今天的主线」「在做」「待办」「计划甘特图」拖出来。\n加到侧栏：点屏幕右上角的时间打开通知中心 → 最下面「编辑小组件」。\n数据来自 Obsidian 的螺旋日程（设置里打开「给小组件导出数据」），有变化时会自动刷新。")
                    .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                let p = Self.previews(data)
                HStack(alignment: .top, spacing: 16) { p[0].1; p[1].1 }
                HStack(alignment: .top, spacing: 16) { p[2].1; p[3].1 }
                HStack(alignment: .top, spacing: 16) { p[4].1; p[5].1 }
                HStack(alignment: .top, spacing: 16) { p[6].1; p[7].1 }
                p[8].1
            }
            .padding(20)
        }
        .background(Color(white: 0.5, opacity: 0.12))
    }
}
