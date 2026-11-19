import Foundation

// 小组件的界面语言跟着 macOS 的系统语言走：系统是中文就中文，其余一律英文。
// 和插件那边的 T(zh, en) 一个做法：两种文案写在用它的地方，不用 .lproj / 字符串目录，改的时候一眼能对上。
enum Lang {
    static let isChinese = (Locale.preferredLanguages.first ?? "en").lowercased().hasPrefix("zh")

    static func t(_ zh: String, _ en: String) -> String { isChinese ? zh : en }
}
