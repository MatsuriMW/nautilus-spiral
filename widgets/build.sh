#!/bin/zsh
# 编译螺旋日程的小组件 App，装进 ~/Applications，让系统的小组件库认出它。
# 要有 Xcode、XcodeGen（brew install xcodegen），钥匙串里要有一张「Apple Development」证书（Xcode 里登录 Apple ID 就有，免费账号也行）。
# 团队号默认从证书里读，读错了用 TEAM=XXXXXXXXXX ./build.sh 指定
set -e
cd "${0:A:h}"
TEAM="${TEAM:-$(security find-certificate -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU=\([A-Z0-9]*\).*/\1/p')}"
[ -n "$TEAM" ] || { echo "钥匙串里没找到 Apple Development 证书：先在 Xcode → 设置 → Accounts 登录 Apple ID"; exit 1; }
xcodegen generate --quiet
xcodebuild -project NautilusWidgets.xcodeproj -scheme NautilusWidgets -configuration Release -derivedDataPath build DEVELOPMENT_TEAM="$TEAM" -quiet build
APP=~/Applications/NautilusWidgets.app BUILT=build/Build/Products/Release/NautilusWidgets.app
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
mkdir -p ~/Applications
rm -rf "$APP"
ditto "$BUILT" "$APP"
# 编译出来的那份也会被系统登记，小组件库里就有两个一样的：只留装好的这份
pluginkit -r "$BUILT/Contents/PlugIns/NautilusWidgetsExtension.appex" 2>/dev/null || true
"$LSR" -u "$BUILT" 2>/dev/null || true
"$LSR" -f "$APP"
pluginkit -a "$APP/Contents/PlugIns/NautilusWidgetsExtension.appex" 2>/dev/null || true
# 已经在跑的小组件进程不会自己换成新版本，留着它会拿旧代码读新数据（读不懂就一直显示「还没有数据」）；
# 宿主 App 开着预览窗口时也一直不退，链接会被旧代码接走
pkill -f NautilusWidgetsExtension || true
pkill -f "NautilusWidgets.app/Contents/MacOS/NautilusWidgets" || true
open -g "nautilus-widgets://reload"
echo "装好了：$APP"
echo "右键桌面 →「编辑小组件」→ 搜「螺旋日程」；Obsidian 里螺旋日程的设置打开「给小组件导出数据」"
