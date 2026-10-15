const OB = require("obsidian");
const { Plugin, ItemView, PluginSettingTab, Setting, TFile, moment, debounce } = OB;

const VIEW_TYPE = "nautilus-spiral";
const DEFAULTS = {
  dayStart: 8,          // 螺旋从几点开始
  dayEnd: 32,           // 螺旋和排程到几点结束，超过 24 表示次日凌晨（32 = 次日早上 8 点；个人作息夜里会一直干活，早上七八点才睡）
  dayCutoff: 8,         // 日记的日期分界：这个时刻之前还算前一天。存的是小时数，可以带小数（4.5 = 04:30）；设置里按 24 小时制的时刻填
  defaultDur: 15,       // 没写时长的任务按多少分钟算
  folder: "日记",
  format: "YYYY_MM_DD",
  priorityMarkers: "[[important]], [[重要]], ⭐, ‼️",
  doneTimes: {},        // { "2026_09_29": { "任务文字": 872 } }，在 Bike 里改成 DONE 时记下的完成时间（分钟）
  autoOpened: false,
  showAi: true,         // 显示人机协作（各个 Agent 的协作时长和 token）
  aiAgents: { claude: true, codex: true, workbuddy: true },   // 主力 AI 工具：开着的才读它的会话日志、画进螺旋、算 token、自动记进日记
  googleCal: false,       // 读 Google 日历里的事件当固定事件（只读，走 Google Calendar API）
  googleClientId: "",     // 你自己在 Google Cloud 里建的 OAuth 客户端（桌面应用）的 ID；客户端密钥和刷新令牌不放在这儿，在系统钥匙串里
  showUnrecorded: true,   // 过去没有任何记录的时间在螺旋上画成斜纹，容量条第一行的悬停提示里写「有记录 / 没记录」
  showDayReview: true,    // 列表里的「📋 当日复盘」：这一天每件任务的预计和实际，逐件对照
  dayReviewFolded: true,  // 当日复盘默认收着，标题上带结论
  statusBar: true,        // 状态栏常驻：正在做什么、做了多久；没在做时显示今天的容量
  pomoMinutes: 45,        // 一件事连着做了这么久，状态栏的计时变红（只提示，不打断）。0 = 不提示
  forgottenMinutes: 120,  // 计时开了这么久，状态栏提醒「检查计时」（不替你停）。0 = 不提醒
  clockToNote: false,     // 你手动做的时段也写回日记：任务不再是 DOING 时，在它下面写一行「⏱ 实际时段」
  lineProgress: true,     // 编辑器里 DOING 的那一行下面显示一行字符进度条（你写的进度 / 监听到的 Agent 会话 / 按预估时长）
  agentStatus: true,      // 状态栏多一格：挂在大纲上的 Agent 会话几个在跑、几个在等你，点一下跳到等你的那一行
  resultBack: true,       // 绑着会话的任务（下面有「🔗」行的）：会话答完一轮或者归档了，把它最后说的话写成任务下面的一行「💬」
  resultMax: 200,         // 「💬」行最多写多少个字，多的截掉
  uiSound: true,          // 界面上的小音效：开始做、做完、停下、回放起止各一声很轻的合成音（Obsidian 不在最前面时不响）
  workLog: {},          // { "2026_09_30": { "任务文字": [[开始, 结束 | null]] } }：任务每一段「进行中」的时间（null = 还在做），中断再续就是好几段
  dayBounds: {},        // { "2026_09_30": { start: 610, end: 1650 } }：在螺旋上拖出来的这天实际开始 / 结束时间（分钟，凌晨 > 1440）
  trackGames: true,     // 记录游戏时间（每分钟看一眼有没有在玩）
  gameProcs: "Hearthstone, steamapps/common",   // 进程路径里含这些词 = 在玩（steamapps/common 下的按游戏文件夹名记）
  gameFrontApps: "Steam",                       // 这些 App 只有在最前面时才算（Steam 客户端后台常驻，不能一开着就算）
  openTodayOnStartup: true,    // 启动 Obsidian 时打开今天的日记（按 dayCutoff 算「今天」）
  revealOnStartup: true,       // 启动时把左侧栏切到螺旋日程
  minChunk: 25,         // 最短一段（分钟）：切开的任务每段至少这么长；不够切成两段的整块排，放不下就跳到下一个空档，后面的小任务往前补位。0 = 照旧切开填满
  calendar: false,      // 读 macOS「日历」里的事件当固定事件（只读）
  calendarSkip: "",     // 不读这些日历，逗号分隔
  focus: true,          // ▶ 开始做时顺带开一段 Raycast 专注
  focusMinutes: 0,      // 专注多久：0 = 按条目上写的时长（没写按默认任务时长；写了进度按还剩的），填 25 = 固定番茄钟
  focusCategories: "social, gaming",   // Raycast Focus 的屏蔽类别，留空 = 不带类别和模式参数
  focusMode: "block",                  // block = 只屏蔽这些类别；allow = 只允许这些类别
  focusAutoComplete: true,             // 那件任务不再是 DOING（做完 / 改回 TODO / 挪走）时结束专注
  focusAsk: true,                      // 专注到点弹窗问「做完了吗」：做完了 / 再来一轮 / 先停下
  focusSession: null,                  // 进行中的这一轮专注：{ tasks: [{ key, label, path, start }], start, end, minutes, round }（毫秒）；几件并行就是几条线
  doingLimit: 3,        // 同时最多几件 DOING：再开始一件，就把最早开始的那件改成 PAUSED。0 = 不限
  staleHours: 3,        // DOING 超过几小时没动过（这一行和下面的子项都没改）就改成 PAUSED。0 = 不管
  doingTouch: {},       // { workKey: { sig, at } }：每件 DOING 最后一次被动过的时刻
  breakWords: "吃饭, 锻炼",   // 日记里新写一条只有这几个字的条目 = 去吃饭 / 锻炼了：所有 DOING 改成 PAUSED，计时停
  breakApps: "Obsidian, Claude, Terminal, iTerm2, Ghostty, Warp",
  breakMinAway: 20,     // 吃饭 / 锻炼至少多久（分钟）才开始判断「回来了」
  parallelDoing: true,
  showReview: true,     // 列表底部「📏 预估 vs 实际」，容量条上「按以往约多久」
  reviewDays: 30,       // 复盘看最近几天（计时记录保留 45 天）  // 几件 DOING 并行排：一起从现在开始，重叠在同一段时间里，只占最长那件的时间   // 在这些 App 里持续操作几分钟 = 回来了，问要不要切回 DOING
  breakState: null,     // { word, since, path, keys, labels, focus, active }：正在吃饭 / 锻炼
  focusDirs: "🧩 工具, 🎬 创作, 💼 工作",   // 开一轮专注时选的大方向（逗号分隔，最多 4 个，开头可以带一个表情）
  discordChannel: "",   // 提醒中枢：不用你回答的提醒发到 Discord 的哪个频道（本机 notify-discord 脚本认的频道名）；空着 = 不发，只在本机弹
  discordCmd: "~/.local/bin/notify-discord",
  askVia: "dialog",     // 到点问做完没有：dialog = 弹到最前面的系统对话框；notification = 带按钮的系统通知（试验：要系统允许本机编的小 App 发通知）
  notifySound: "Pop",   // 在本机弹提醒时响哪个声音：系统声音的名字（/System/Library/Sounds 里的，Pop、Glass、Ping…）或一个声音文件的路径；空 = 不响
  autoLogIdle: 40,      // 会话多少分钟没动静，就把它那一行从 DOING 改成 PAUSED
  weeklyDirs: true,     // 每周日晚上发一条「本周方向」回顾（Telegram，没有就 Discord）
  weeklySent: "",       // 发过的最近一周，比如 2026-W41
  dirLog: {},           // { "2026_10_11": { "Obsidian 改造": 133, "": 20 } }：每天各个大方向的分钟数（"" = 没归方向的）
  autoLog: false,       // 自动把 Claude / Codex / WorkBuddy 会话按 DOING / DONE / PAUSED 记进今天的日记，用时按会话真正在动的时段算
  autoLogEvery: 20,     // 每隔几分钟整理一次
  autoLogCli: "auto",             // 判断用哪个命令行：auto = 本机有 claude 就用 claude，没有就用 codex
  autoLogModel: "haiku",          // 判断「做的是什么事、做完没有」用哪个模型（claude 命令行的 --model）
  claudePath: "~/.local/bin/claude",
  codexPath: "codex",             // codex 命令行在哪：只写名字就到登录 shell 的 PATH 里找
  autoLogCodexModel: "",          // 用 codex 判断时的模型（codex exec 的 -m）；空 = Codex 自己的默认
  autoLogNotify: true,  // 自动记成 DONE / PAUSED 时发一条带按钮的通知，不对可以在通知上改
  autoLogArchiveDone: true,   // 在 Claude 桌面 app 里归档了的会话，它那一行记成 DONE
  autoLogSince: 0,      // 开启自动记录的时刻（毫秒）：这之前就停了的会话不补记
  autoLogState: {},     // { "2026_10_11": { 会话号: { key, label, dir, status, min, created, parkedAt, hold, gone, skip } } }
};

// ---------------- 解析 ----------------

const LIST_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const STAMP_RE = /^\*\*(\d{1,2})[:：](\d{2})\*\*\s*/;           // 你习惯的 **07:37** 记录时间
const CHECKBOX_RE = /^\[([ xX\/\-])\]\s*/;
const KEYWORD_RE = /^(TODO|DOING|LATER|NOW|PAUSED|WAITING|WAIT|SUSPENDED|IN-PROGRESS|DONE|CANCELED|CANCELLED|FAILED)\s+/;
const TIME = String.raw`(\d{1,2})(?:[:：](\d{2})|点(?:(半)|(\d{1,2})分?)?)`;
const RANGE_RE = new RegExp(String.raw`(?<![\d:：])${TIME}\s*(?:-|–|—|~|～|到|至)\s*(?:${TIME}|(\d{1,2})(?![\d:：点]))`);
const SINGLE_RE = new RegExp(String.raw`(?<![\d:：])${TIME}(?![\d])`);
const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function tokenMinutes(h, mm, half, cnMin) {
  const m = mm !== undefined ? +mm : half ? 30 : cnMin !== undefined ? +cnMin : 0;
  return +h * 60 + m;
}

// 凌晨的时间（比如 01:44、04:30）属于前一天的日记，算到当天夜里
function normalize(t, cfg) {
  const cutoff = Math.min(cfg.dayCutoff ?? Math.max(0, cfg.dayEnd - 24), cfg.dayStart) * 60;
  if (t < cutoff) return t + 1440;
  if (t < cfg.dayStart * 60 && t + 1440 <= cfg.dayEnd * 60) return t + 1440;
  return t;
}

function parseDuration(text) {
  let m;
  if ((m = /(\d+(?:\.\d+)?)\s*(?:h|小时)\s*(\d+)\s*(?:m|min|分钟)(?![a-zA-Z])/.exec(text))) return Math.round(+m[1] * 60 + +m[2]);
  if ((m = /(\d+(?:\.\d+)?)\s*(?:[~～\-–到至]\s*(\d+(?:\.\d+)?)\s*)?(hrs|hr|h|个小时|小时|mins|min|m|分钟)(?![a-zA-Z])/.exec(text))) {
    const v = m[2] ? +m[2] : +m[1];                   // 写成 25～30 分钟的按上限算
    return Math.round(/h|小时/.test(m[3]) ? v * 60 : v);
  }
  // 先认「一个半小时」再认「半小时」，不然一个半小时会被当成半小时
  if ((m = /([一两二三四五六])个?(半)?小时/.exec(text))) return CN_NUM[m[1]] * 60 + (m[2] ? 30 : 0);
  if (/半个?小时/.test(text)) return 30;
  return null;
}

// 进度：单独写的「40%」「1/3」（分母不超过 10，免得把 9/30 这种日期当进度）「三分之一」「一半」
const PROG_END = String.raw`(?=$|[\s，,。；;)）])`;
const PROG_PCT_RE = new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*[%％]` + PROG_END);
const PROG_FRAC_RE = new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})` + PROG_END);
const PROG_CN_RE = /([一二两三四五六七八九十\d]+)分之([一二两三四五六七八九十\d]+)/;
const PROG_HALF_RE = new RegExp(String.raw`(?:^|\s)(?:做了|完成了?)?一半` + PROG_END);
const CN_DIGIT = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function parseProgress(text) {
  let m;
  if ((m = PROG_PCT_RE.exec(text)) && +m[1] <= 100) return +m[1] / 100;
  if ((m = PROG_FRAC_RE.exec(text)) && +m[2] > 0 && +m[2] <= 10 && +m[1] <= +m[2]) return +m[1] / +m[2];
  if ((m = PROG_CN_RE.exec(text))) {
    const b = CN_DIGIT[m[1]] ?? +m[1], a = CN_DIGIT[m[2]] ?? +m[2];
    if (b > 0 && a <= b) return a / b;
  }
  if (PROG_HALF_RE.test(text)) return 0.5;
  return null;
}
const stripProgress = (s) => (parseProgress(s) == null ? s : s.replace(PROG_PCT_RE, " ").replace(PROG_FRAC_RE, " ").replace(PROG_CN_RE, "").replace(PROG_HALF_RE, " "));
// 工作时段按这个键记：去掉「← 2026_09_30」这种挪过来的尾巴，挪到第二天还是同一件事
const workKey = (label) => label.replace(/\s*←\s*\S+\s*$/, "").trim();

// 去掉行里写的时长（3h、30m、一个半小时），Telegram Inbox 用它把「done 写稿 2h」的 2h 换进原来那条任务
const stripDuration = (s) => s
  .replace(/(?:\bfor\s+|做了|用了|花了)?\d+(?:\.\d+)?\s*(?:h|小时)\s*\d+\s*(?:m|min|分钟)(?![a-zA-Z])/g, "")
  .replace(/(?:\bfor\s+|做了|用了|花了)?\d+(?:\.\d+)?\s*(?:[~～\-–到至]\s*\d+(?:\.\d+)?\s*)?(?:hrs|hr|h|个小时|小时|mins|min|m|分钟)(?![a-zA-Z])/g, "")
  .replace(/(?:[一两二三四五六]个?半?|半)个?小时(?!候)/g, "")
  .replace(/\s+/g, " ").trim();

function cleanLabel(s) {
  return s
    .replace(RANGE_RE, "").replace(SINGLE_RE, "")
    .replace(/(?:\bfor\s+|做了|用了|花了)?\d+(?:\.\d+)?\s*(?:h|小时)\s*\d+\s*(?:m|min|分钟)(?![a-zA-Z])/g, "")
    .replace(/(?:\bfor\s+|做了|用了|花了)?\d+(?:\.\d+)?\s*(?:[~～\-–到至]\s*\d+(?:\.\d+)?\s*)?(?:hrs|hr|h|个小时|小时|mins|min|m|分钟)(?![a-zA-Z])/g, "")
    .replace(/(?:[一两二三四五六]个?半?|半)个?小时(?!候)/g, "")
    .replace(/\s+([，,。；;])/g, "$1")
    .replace(/[，,]\s*$|^\s*[，,]/g, "")
    .replace(/!?\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/!?\[\[([^\]]*)\]\]/g, (m, p) => p.split("#")[0])
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[[^\[\]]+::[^\]]*\]/g, "")
    .replace(/\s\^[A-Za-z0-9-]+\s*$/, "")
    .replace(/\[#[ABC]\]\s*/g, "")   // TODOseq / Logseq 的优先级
    .replace(/==|\*\*|~~|`/g, "")
    .replace(/[📅🛫✅⭐⏳]\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 任务下面的「🔗」行：这件任务绑在哪个 Agent 会话上。绑定写在日记正文里，这一块挪到哪、发到哪天、改了字都还认；想解除就把这一行删掉。
//   Claude 的写成链接「- 🔗 [Claude：会话标题](claude://resume?session=会话号)」，点了在 Claude 桌面版里打开那个会话；
//   别的 Agent 没有这种链接，会话号写在反引号里「- 🔗 Codex：会话标题 `会话号`」
const LINK_LINE_RE = /^\s*[-*+]\s+🔗/;
const SID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const claudeLink = (sid) => `claude://resume?session=${sid}`;
function linkLine(indent, agent, title, sid) {
  const name = String(title || "").replace(/[\[\]()`\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "会话";
  return agent === "claude" ? `${indent}- 🔗 [Claude：${name}](${claudeLink(sid)})` : `${indent}- 🔗 ${agent === "codex" ? "Codex" : agent === "workbuddy" ? "WorkBuddy" : agent}：${name} \`${sid}\``;
}
// 读一行「🔗」：{ sid, agent }，不是就返回 null
function parseLink(line) {
  if (!LINK_LINE_RE.test(line)) return null;
  const m = SID_RE.exec(line);
  if (!m) return null;
  return { sid: m[0], agent: /🔗\s*\[?\s*Codex/i.test(line) ? "codex" : /🔗\s*\[?\s*WorkBuddy/i.test(line) ? "workbuddy" : "claude" };
}
// 第 n 行那一项的直接子项（和它第一个子项同一层缩进的）里，第一个让 pick 返回东西的那一行：{ line, ...pick 返回的 }，没有返回 null
function childMark(lines, n, pick) {
  const width = (l) => /^\s*/.exec(l)[0].replace(/\t/g, "    ").length;
  const base = width(lines[n]);
  let child = -1;
  for (let i = n + 1; i < lines.length && i <= n + 40; i++) {
    if (!lines[i].trim()) continue;
    const w = width(lines[i]);
    if (w <= base) break;
    if (child < 0) child = w;
    if (w !== child) continue;
    const l = pick(lines[i]);
    if (l) return { line: i, ...l };
  }
  return null;
}
// 第 n 行那一项自己的「🔗」行：只认它的直接子项，子任务下面的 🔗 是子任务的。返回 { line, sid, agent } 或 null
function linkUnder(lines, n) {
  return childMark(lines, n, parseLink);
}
// 第 i 行（一行记号）挂在哪一项下面：往上找缩进更浅的第一个列表项，返回行号，没有返回 -1
function markOwner(lines, i) {
  const width = (l) => /^\s*/.exec(l)[0].replace(/\t/g, "    ").length;
  const ind = width(lines[i]);
  for (let j = i - 1; j >= 0; j--) if (lines[j].trim() && LIST_RE.test(lines[j]) && width(lines[j]) < ind) return j;
  return -1;
}

// 任务下面的「💬」行：绑着的那个会话最后说的话——做完时的结论，或者它停下来等你回答的那一句。机器写的，会话每答完一轮换成新的一句。
// 和 🔗 / ⏱ 一样是记号行：解析日记、状态音效都跳过它，发给 Agent 的话里也不带它。你自己想留话，别用 💬 开头
const RESULT_LINE_RE = /^\s*[-*+]\s+💬/;
// 正在做的任务行：DOING / NOW / IN-PROGRESS 或者 [/]
const DOING_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\*\*\d{1,2}[:：]\d{2}\*\*\s*)?(?:\[\/\]\s|(?:DOING|NOW|IN-PROGRESS)(?=\s|$))/;
// 会话的一条回复压成一行能放进日记的字：代码块不要，标题、列表符号、引用符号去掉，连成一行；
// 会在库里生出东西的写法（#标签、[[双链]]、==高亮==、%%注释%%、$公式$、HTML 标签）都转义掉；太长就在句子结尾处截断
function resultText(raw, max = 200) {
  let t = String(raw || "")
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ")
    .replace(/\d{12,}/g, "…")
    .replace(/\s+/g, " ").trim();
  const cap = Math.max(40, +max || 200);
  if ([...t].length > cap) {
    const cut = [...t].slice(0, cap).join("");
    const stop = Math.max(...["。", "！", "？", "；", ". ", "! ", "? "].map((c) => cut.lastIndexOf(c)));
    t = (stop > cap * 0.5 ? cut.slice(0, stop + 1) : cut).trim() + "…";
  }
  return t.replace(/\[\[/g, "\\[\\[").replace(/(^|[^\w&\\])#(?=[^\s#])/g, "$1\\#").replace(/==/g, "\\=\\=").replace(/%%/g, "\\%\\%").replace(/\$/g, "\\$").replace(/</g, "\\<").replace(/\s\^(?=[A-Za-z0-9-]+$)/, " \\^");
}
// 面板里显示「💬」那句话：去掉为日记加的转义和 Markdown 记号（**加粗**、`代码`、[文字](链接) 只留文字）
const plainSaid = (s) => String(s || "").replace(/\\(.)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
function resultUnder(lines, n) {
  return childMark(lines, n, (l) => (RESULT_LINE_RE.test(l) ? {} : null));
}
// 把会话 sid 最后说的话写到它绑着的那件任务下面：已经有「💬」行就换掉，没有就接在「🔗」行后面。
// 这篇文字里没有这个会话的「🔗」行、或者写的和原来一样，原样返回
function resultInto(text, sid, said) {
  if (!said || !text.includes(sid)) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => { const k = parseLink(l); return k && k.sid === sid; });
  const n = at < 0 ? -1 : markOwner(lines, at);
  if (n < 0) return text;
  const line = `${/^\s*/.exec(lines[at])[0]}- 💬 ${said}`;
  const had = resultUnder(lines, n);
  if (had) { if (lines[had.line] === line) return text; lines[had.line] = line; }
  else lines.splice(at + 1, 0, line);
  return lines.join("\n");
}
// 任务下面的「🤖 子代理」行：绑着的那个会话派出去的 subagent、在它上面开过的 side chat，各是什么结果。机器写的，和 💬 同时写、同时换：
//   - 🤖 子代理 3：查 runTmux ✓ 16k、查 sendToTwitter ✓ 12k、查 cue() ✗ 停了 · side chat 1
// 和 🔗 / ⏱ / 💬 一样是记号行。只认「🤖 子代理」「🤖 side chat」开头的：日记整理收机器行的主题母块（顶格的「- 🤖 主题 · 6 条」）不是它
const SUB_LINE_RE = /^\s*[-*+]\s+🤖\s*(?:子代理|side chat)/;
const isSubMark = (s) => /^🤖\s*(?:子代理|side chat)/.test(s);
function subUnder(lines, n) {
  return childMark(lines, n, (l) => (SUB_LINE_RE.test(l) ? {} : null));
}
// 把「🤖」行写到会话 sid 绑着的那件任务下面：已经有就换掉，没有就接在「💬」行（没有就是「🔗」行）后面。mark 是空的不动
function subInto(text, sid, mark) {
  if (!mark || !text.includes(sid)) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => { const k = parseLink(l); return k && k.sid === sid; });
  const n = at < 0 ? -1 : markOwner(lines, at);
  if (n < 0) return text;
  const line = `${/^\s*/.exec(lines[at])[0]}- 🤖 ${mark}`;
  const had = subUnder(lines, n);
  if (had) { if (lines[had.line] === line) return text; lines[had.line] = line; }
  else { const said = resultUnder(lines, n); lines.splice(said && said.line > at ? said.line + 1 : at + 1, 0, line); }
  return lines.join("\n");
}
// 一篇日记里所有的「🔗」行：Map(会话号 → 它挂在哪件任务上（任务名）)
function linkMap(text, cfg) {
  const lines = text.split("\n"), out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const l = parseLink(lines[i]);
    if (!l) continue;
    const ind = /^\s*/.exec(lines[i])[0].replace(/\t/g, "    ").length;
    for (let j = i - 1; j >= 0; j--) {
      if (!lines[j].trim() || !LIST_RE.test(lines[j]) || /^\s*/.exec(lines[j])[0].replace(/\t/g, "    ").length >= ind) continue;
      const it = parseJournal(lines[j].replace(/^\s+/, ""), cfg).find((x) => x.kind === "task");
      if (it) out.set(l.sid, workKey(it.label));
      break;
    }
  }
  return out;
}

// 任务下面那一行「⏱ 00:45–00:58、04:02–05:10 · 共 1h21m · 48k tok · Claude」读回来（最后的 Claude 可以是指向那个会话的链接）：
//   { segs: [[开始, 结束]…], total: 合计分钟（没写就是 null）, who: 谁记的（"Claude" / "Claude / Codex"，你自己做的没有）, partial: 段数太多只写了后面几段 }
// 机器写的是上面这个样子；你自己改、自己写的也认：时段之间用顿号、逗号、分号、空格都行，起止之间用 – - ~ 到 都行，合计写「共 57m」「共 1小时21分」都行
function parseClock(s, cfg) {
  const segs = [];
  for (const m of s.matchAll(/(\d{1,2})[:：](\d{2})\s*(?:[–—~～-]|到|至)\s*(\d{1,2})[:：](\d{2})/g)) {
    const a = normalize(+m[1] * 60 + +m[2], cfg);
    let b = normalize(+m[3] * 60 + +m[4], cfg);
    if (b < a) b += 1440;
    if (b > a) segs.push([a, b]);
  }
  if (!segs.length) return null;
  const tm = /共\s*(?:(\d+)\s*(?:h|小时))?\s*(?:(\d+)\s*(?:m|min|分钟?))?/.exec(s);
  const total = tm && (tm[1] || tm[2]) ? (+tm[1] || 0) * 60 + (+tm[2] || 0) : null;
  // 最后一个「·」后面要是没有数字，就是谁记的。写成链接的（[Claude](claude://resume?session=…)）取链接上的字，会话号另外拿出来
  const sm = /\]\([^)]*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[^)]*\)/.exec(s);
  const tail = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").split(/\s[·•]\s/).pop().trim();
  const who = /\d/.test(tail) || tail.startsWith("⏱") ? "" : tail;
  // 「· 48k tok」：这几段里 Agent 用掉的 token（产出 + 读入），机器写的
  const km = /([\d.]+)\s*([kKmM]?)\s*tok\b/.exec(s);
  const tok = km ? Math.round(+km[1] * ({ k: 1e3, m: 1e6 }[km[2].toLowerCase()] || 1)) : null;
  return { segs: unionSegs(segs), total, who, tok, sid: sm ? sm[1] : "", partial: /^⏱\uFE0F?\s*…/.test(s) };
}

function parseJournal(content, cfg) {
  const prio = cfg.priorityMarkers.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const items = [];
  const lines = content.split("\n");
  let inCode = false;
  lines.forEach((raw, line) => {
    if (/^\s*```/.test(raw)) { inCode = !inCode; return; }
    if (inCode) return;
    const lm = LIST_RE.exec(raw);
    if (!lm) return;
    let s = lm[2];
    if (s.startsWith("🔗") || s.startsWith("💬") || isSubMark(s)) return;   // 任务下面的「🔗 绑定的会话」「💬 会话最后说的话」「🤖 子代理」是记号，不是事件也不是任务（里面带着时间也不算）
    if (s.startsWith("⏱")) {
      // 任务下面的「⏱ 实际时段」是记录，不是事件也不是任务。读出来挂到它上面那件任务上（往上找缩进更浅的第一行）
      const c = parseClock(s, cfg), ind = lm[1].replace(/\t/g, "    ").length;
      if (c) for (let j = items.length - 1; j >= 0; j--) if (items[j].indent < ind) { if (items[j].kind === "task" && !items[j].clock) items[j].clock = c; break; }
      return;
    }
    let stamp = null, state = "none", cb = null, kw = null;
    // 时间戳、复选框、关键词三者前后顺序不固定（「**07:37** DONE …」「[x] **01:44** …」都有）
    for (let i = 0; i < 3; i++) {
      let m;
      if (stamp === null && (m = STAMP_RE.exec(s))) { stamp = normalize(tokenMinutes(m[1], m[2]), cfg); s = s.slice(m[0].length); continue; }
      if (!cb && (m = CHECKBOX_RE.exec(s))) {
        cb = m;
        state = m[1] === " " || m[1] === "/" ? "open" : m[1] === "-" ? "drop" : "done";
        s = s.slice(m[0].length);
        continue;
      }
      if (!kw && (m = KEYWORD_RE.exec(s))) {
        kw = m;
        state = /DONE/.test(m[1]) ? "done" : /CANCEL|FAILED/.test(m[1]) ? "drop" : "open";
        s = s.slice(m[0].length);
        continue;
      }
      break;
    }
    if (state === "drop") return;
    if (kw) s = s.replace(/^\[#[ABC]\]\s*/, "");   // 优先级（TODO [#A] …）不挡住后面的时刻
    const doing = kw && /DOING|NOW|IN-PROGRESS/.test(kw[1]) || (cb && cb[1] === "/");
    const suspended = !!kw && /^(WAIT|SUSPENDED)/.test(kw[1]);   // WAITING / SUSPENDED = 搁置：短期不推，今天不排、不占容量，做过的时间和进度留着
    const paused = !!kw && kw[1] === "PAUSED";                     // PAUSED = 暂停：只是停一下，照常排，接着做时剩余时间扣掉做过的
    const progress = state === "none" ? null : parseProgress(s);
    let label = state === "none" ? s : stripProgress(s);
    for (const p of prio) label = label.split(p).join("");
    label = cleanLabel(label) || s.trim();
    const indent = lm[1].replace(/\t/g, "    ").length;
    const base = { line, indent, label, state, doing: !!doing, suspended, paused, progress, prio: prio.some((p) => s.includes(p)), stamp };

    // 紧跟在关键词后面的时间是「记录」：DONE 18:02 = 几点做完；DONE 14:00-15:30 = 实际花在这段；DOING 14:05 = 几点开始做的
    if (state !== "none") {
      const lr = new RegExp("^" + RANGE_RE.source).exec(s);
      const ls = !lr && new RegExp("^" + SINGLE_RE.source).exec(s);
      if (state === "done" && lr) {
        const start = normalize(tokenMinutes(lr[1], lr[2], lr[3], lr[4]), cfg);
        let end = normalize(lr[5] !== undefined ? tokenMinutes(lr[5], lr[6], lr[7], lr[8]) : +lr[9] * 60, cfg);
        if (end <= start) end += 720;
        // est = 写着的预估（DONE 14:05-14:20 写周报 15分钟 里的 15 分钟），复盘「预估 vs 实际」用
        items.push({ ...base, kind: "task", dur: end - start, explicitDur: true, doneAt: end, actual: [start, end], est: parseDuration(s.slice(lr[0].length)) });
        return;
      }
      // 「DONE 10-12 hsy」这种只写整点的时间段，只在紧跟关键词的位置认
      const br = !lr && state === "done" && /^(\d{1,2})\s*(?:-|–|~|～|到|至)\s*(\d{1,2})(?![\d:：点])/.exec(s);
      if (br && +br[1] <= 24 && +br[2] <= 24) {
        const start = normalize(+br[1] * 60, cfg);
        let end = normalize(+br[2] * 60, cfg);
        if (end <= start) end += 720;
        items.push({ ...base, kind: "task", dur: end - start, explicitDur: true, doneAt: end, actual: [start, end], est: parseDuration(s.slice(br[0].length)) });
        return;
      }
      // DONE 18:02 写稿 2h：这里的 2h 是做了多久（Telegram 的 done 写稿 2h），不是预估
      if (state === "done" && ls) {
        const at = normalize(tokenMinutes(ls[1], ls[2], ls[3], ls[4]), cfg);
        items.push({ ...base, kind: "task", dur: parseDuration(s.slice(ls[0].length)) ?? cfg.defaultDur, explicitDur: parseDuration(s.slice(ls[0].length)) != null, doneAt: at });
        return;
      }
      // SUSPENDED 17:12 / PAUSED 17:12 / WAITING 17:12：后面的时刻是当初开始做的记录，不是约好的时间，不当事件
      if (state === "open" && !doing && (suspended || paused) && ls) {
        const d = parseDuration(s.slice(ls[0].length));
        items.push({ ...base, kind: "task", dur: d ?? cfg.defaultDur, explicitDur: d != null });
        return;
      }
      if (state === "open" && doing && ls) {
        const startedAt = normalize(tokenMinutes(ls[1], ls[2], ls[3], ls[4]), cfg);
        items.push({ ...base, kind: "task", dur: parseDuration(s.slice(ls[0].length)) ?? cfg.defaultDur, explicitDur: parseDuration(s.slice(ls[0].length)) != null, startedAt });
        return;
      }
    }

    const rm = RANGE_RE.exec(s);
    if (rm) {
      const start = normalize(tokenMinutes(rm[1], rm[2], rm[3], rm[4]), cfg);
      let end = rm[5] !== undefined ? tokenMinutes(rm[5], rm[6], rm[7], rm[8]) : +rm[9] * 60;
      end = normalize(end, cfg);
      if (end <= start) end += 720;                 // 「3:00-5」这种按下午理解
      items.push({ ...base, kind: "event", start, end });
      return;
    }
    if (state === "none") {
      if (stamp !== null) items.push({ ...base, kind: "log", start: stamp });
      return;
    }
    const dur = parseDuration(s) ?? cfg.defaultDur;
    const single = SINGLE_RE.exec(s);
    if (single) {
      const start = normalize(tokenMinutes(single[1], single[2], single[3], single[4]), cfg);
      items.push({ ...base, kind: "event", start, end: start + dur, pinned: true });
      return;
    }
    items.push({ ...base, kind: "task", dur, explicitDur: parseDuration(s) != null, est: state === "done" ? parseDuration(s) : null });
  });
  // 父任务下面还挂着子任务、自己又没写时长：时间算在子任务上，父任务不重复占
  items.forEach((t, i) => {
    if (t.kind !== "task" || t.state !== "open" || t.explicitDur === true || t.startedAt != null) return;
    for (let j = i + 1; j < items.length && items[j].indent > t.indent; j++) {
      if (items[j].kind === "task") { t.container = true; break; }
    }
  });
  return items;
}

// ---------------- 排程 ----------------

function subtract(intervals, busy) {
  let out = intervals;
  for (const [b0, b1] of busy) {
    const next = [];
    for (const [a0, a1] of out) {
      if (b1 <= a0 || b0 >= a1) { next.push([a0, a1]); continue; }
      if (b0 > a0) next.push([a0, b0]);
      if (b1 < a1) next.push([b1, a1]);
    }
    out = next;
  }
  return out;
}

// 把记下来的工作时段（cfg.workLog）挂到任务上，排程之前调：
//   t.worked = 这天做过的几段；t.spentToday / t.spentBefore = 这天 / 前几天（挪过来之前）做掉的分钟
// 返回这天记了时段、但任务行已经不在日记里的（做到一半挪去明天了），螺旋上照样画出来
function applyWork(items, cfg, dayKey, now, dayRel, bounds = {}) {
  const log = cfg.workLog || {};
  const today = log[dayKey] || {};
  const E = bounds.end ?? cfg.dayEnd * 60;
  const sum = (segs) => segs.reduce((n, [a, b]) => n + b - a, 0);
  const close = (segs, est) => segs.map(([a, b]) => [a, b ?? (dayRel === 0 ? now : Math.min(E, a + est))]).filter(([a, b]) => b > a);
  const seen = new Set();
  for (const t of items) {
    if (t.kind !== "task") continue;
    const k = workKey(t.label);
    seen.add(k);
    let segs = close(today[k] || [], t.dur);
    // 手写了「DOING 14:05」但没被记到（比如那会儿 Obsidian 没开）：按写的算
    if (!segs.length && t.startedAt != null && t.state === "open") segs = close([[t.startedAt, null]], t.dur);
    // 日记里这件任务下面那一行 ⏱ 是正本：机器记的实际时段写在那儿，你觉得不对也是在那儿改。
    // 任务没在做的时候就按那一行写的算，插件自己的计时记录只当它的底稿（那份只留 45 天，换台电脑也没有）。
    // 三种情况不按它：正在做的（还在往下记，那一行是上次停下时写的）；段数太多只写了后面几段、而计时记录还在的；
    // 带「← 日期」的（从别的日子挪过来的，它带着的 ⏱ 说的是原来那天）
    const noted = t.clock && !(t.doing && t.state === "open") && !(t.clock.partial && segs.length) && !/←\s*\S+\s*$/.test(t.label) ? t.clock : null;
    if (noted) segs = noted.segs.map(([a, b]) => [a, b]);
    t.worked = segs;
    // 合计按那一行写的「共 …」：写的时候挨得近的几段并成了一段，照段落加会多出中间的空隙
    t.spentToday = noted && noted.total != null ? noted.total : sum(segs);
    t.spentBefore = 0;
    for (const d in log) if (d < dayKey && log[d][k]) t.spentBefore += sum(log[d][k].filter(([, b]) => b != null));
  }
  return Object.entries(today).filter(([k]) => !seen.has(k)).map(([k, segs]) => ({ label: k, line: 0, segs: close(segs, 30) })).filter((o) => o.segs.length);
}

// 把 need 分钟填进空档（free 会被改掉），填出来的段落追加到 segs，返回没填下的分钟。
// min > 0：每段（包括最后一段）至少 min 分钟。不够切成两段的任务整块放，最早放得下的空档才放，
// 前面放不下的空档留给后面的小任务往前补位；切开时尾巴不足 min 就让前一段少拿一点。min = 0：从最早的空档起切开填满
function fill(free, need, min, segs) {
  for (let i = 0; i < free.length && need > 0;) {
    const [a, b] = free[i];
    let take = Math.min(need, b - a);
    if (min > 0 && take < need) {
      if (need - take < min) take = need - min;
      if (take < min) { i++; continue; }
    }
    segs.push([a, a + take]);
    need -= take;
    if (a + take >= b) free.splice(i, 1);
    else { free[i] = [a + take, b]; i++; }
  }
  return need;
}

// bounds = 这天实际的开始 / 结束（螺旋上拖出来的），没设就用设置里的 dayStart / dayEnd
function schedule(items, cfg, now, dayRel, bounds = {}) {
  const S = bounds.start ?? cfg.dayStart * 60, E = bounds.end ?? cfg.dayEnd * 60;
  // 今天从「现在」开始排；过去的日子没做完的都算排不下；以后的日子从一早开始排
  const from = dayRel === 0 ? Math.min(Math.max(now, S), E) : dayRel < 0 ? E : S;
  const events = items.filter((i) => i.kind === "event");
  const busy = events.map((e) => [Math.max(e.start, from), Math.min(e.end, E)]).filter(([a, b]) => b > a);
  let free = subtract([[from, E]], busy);
  const available = free.reduce((s, [a, b]) => s + b - a, 0);

  const open = items.filter((i) => i.kind === "task" && i.state === "open" && !i.container && !i.suspended);
  const queue = [...open.filter((t) => t.doing), ...open.filter((t) => !t.doing)];
  let demand = 0;
  for (const t of queue) {
    t.segments = [];
    let need = t.dur;
    if (t.worked) {
      // 做过的几段先画出来（中断再续就是好几段），剩下的接着往后排：
      // 写了进度按进度算（3h 40% = 还剩 1h48m），没写就用 预估 − 已经做掉的（含前几天），至少留 5 分钟
      for (const [a, b] of t.worked) if (b > S) t.segments.push([Math.max(a, S), b]);
      const spent = t.spentToday + t.spentBefore;
      if (t.progress != null) need = t.dur * (1 - t.progress);
      else if (spent > 0) need = Math.max(5, t.dur - spent);
    } else if (t.startedAt != null && dayRel === 0 && t.startedAt < from) {
      // 没调 applyWork 的（任务提醒插件）：写了开始时间的 DOING，已经做掉的那段画出来
      t.segments.push([Math.max(t.startedAt, S), from]);
      need = Math.max(5, t.dur - (from - t.startedAt));
    }
    t.workedN = t.segments.length;   // 前面这几段是做过的，后面是排的
    t.remaining = need;
  }
  // 进行中的几件并行：一起从现在开始，重叠在同一段时间里，只占最长那件的时间（三件各 25 分钟只占 25 分钟）；
  // 每件画在自己的那条线上（lane）。关掉 parallelDoing 就和其它待办一样首尾相接
  const doing = queue.filter((t) => t.doing);
  const parallel = cfg.parallelDoing !== false && doing.length > 1;
  if (parallel) {
    const span = Math.max(...doing.map((t) => t.remaining));
    const win = [];
    fill(free, span, 0, win);
    demand += span;
    doing.forEach((t, lane) => {
      t.lane = lane;
      let need = t.remaining;
      for (const [a, b] of win) {
        if (need <= 0) break;
        const take = Math.min(need, b - a);
        t.segments.push([a, a + take]);
        need -= take;
      }
      t.overflow = need;
    });
  }
  for (const t of queue) {
    if (parallel && t.doing) continue;
    demand += t.remaining;
    // 进行中的从现在接着做，照旧切开填；其余的每段至少 minChunk 分钟
    t.overflow = fill(free, t.remaining, t.doing ? 0 : cfg.minChunk ?? 0, t.segments);
  }
  const eventLeft = unionSegs(busy).reduce((s, [a, b]) => s + b - a, 0);   // 重叠的事件按并集算，同一分钟不重复算
  // 没排进去的分钟。总量超了是一回事（overflow），总量够、但没有一段连续空档放得下是另一回事，容量条上分开报
  const unplaced = (parallel ? Math.max(...doing.map((t) => t.overflow)) : 0) + queue.filter((t) => !(parallel && t.doing)).reduce((n, t) => n + t.overflow, 0);
  const suspended = items.filter((i) => i.kind === "task" && i.state === "open" && i.suspended);
  for (const t of suspended) t.remaining = t.progress != null ? t.dur * (1 - t.progress) : Math.max(5, t.dur - ((t.spentToday || 0) + (t.spentBefore || 0)));
  // free = 排完以后还空着的时段（螺旋上悬停能看到每段空档多长）
  return { from, available, demand, overflow: Math.max(0, demand - available), unplaced, free: free.map(([a, b]) => [a, b]), eventLeft, queue, suspended };
}

// ---------------- 界面上的小音效 ----------------
// 现合成的短音，不带声音文件。type = 波形，notes = [频率, 响多久]，一个接一个响；attack = 每个音淡入多久（秒，越长越柔）。
// 这些音一天要听很多遍：音量压低，最常听的 DONE 不往高处、亮处走。
// 任务状态各有各的声音，分两种情绪：
//   往前走的（TODO / DOING / DONE）：正弦、三角波，音往上走；DONE 落在主音上，低一点、软一点；
//   停下来的、没成的（PAUSED / WAITING / SUSPENDED / CANCELLED / FAILED）：音往下落，越往后越低，波形也越糙（方波、锯齿波）。
const SOUNDS = {
  TODO:      { type: "triangle", notes: [[523, 0.09]] },                              // 记下一件：干净的一声
  DOING:     { type: "sine",     notes: [[523, 0.08], [784, 0.13]] },                 // 开始做：往上跳五度
  DONE:      { type: "sine",     notes: [[392, 0.09], [523, 0.22]], vol: 0.85, attack: 0.03 },   // 做完：轻轻往上落到主音（sol → do），起音慢一点，不刺耳
  PAUSED:    { type: "sine",     notes: [[587, 0.08], [494, 0.14]], vol: 0.8 },       // 停一下：轻轻落一步，还会回来
  WAITING:   { type: "sine",     notes: [[494, 0.09], [494, 0.12]], vol: 0.8 },       // 等别人：同一个音敲两下，悬着
  SUSPENDED: { type: "sine",     notes: [[392, 0.10], [294, 0.18]], vol: 0.8 },       // 搁置：往下落四度
  CANCELLED: { type: "square",   notes: [[330, 0.08], [247, 0.16]], vol: 0.45 },      // 不做了：方波，短促地落下去
  FAILED:    { type: "sawtooth", notes: [[196, 0.10], [147, 0.22]], vol: 0.5 },       // 没成：锯齿波，最低最沉
  CLEAR:     { type: "triangle", notes: [[440, 0.06]], vol: 0.6 },                    // 关键词去掉了
  tick:      { type: "triangle", notes: [[880, 0.045]], vol: 0.5 },                   // 点了一下
  play:      { type: "sine",     notes: [[392, 0.07], [523, 0.07], [784, 0.16]] },    // 回放开始
  stop:      { type: "sine",     notes: [[784, 0.08], [523, 0.20]] },                 // 回放结束，回到现在
  log:       { type: "sine",     notes: [[523, 0.06], [659, 0.06], [784, 0.14]], vol: 0.8 },   // 把会话整理进日记了
};
const SOUND_VOLUME = 0.10;
let audioCtx = null;
function blip(name) {
  const spec = SOUNDS[name];
  if (!spec) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx({ latencyHint: "interactive" });
    if (audioCtx.state === "suspended") audioCtx.resume();
    let t = audioCtx.currentTime + 0.005;
    const vol = SOUND_VOLUME * (spec.vol ?? 1);
    for (const [freq, len] of spec.notes) {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);                       // 淡入淡出，不然开头结尾会「啪」一下
      gain.gain.linearRampToValueAtTime(vol, t + (spec.attack ?? 0.012));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += len * 0.85;
    }
  } catch (e) { /* 没有声音设备就不响 */ }
}

// 任务状态一变就响一声，不管是谁改的（TODOseq 里点关键词、⌘/、看板、手敲）：只看那一行的关键词从什么变成了什么。
// kwSnapshot：一篇笔记里每一行的状态，Map(去掉关键词和时间以后的正文 → 关键词)，没有关键词的行是 ""；同样的正文出现两次分不清是哪一行，记成 null 不管
const KW_SOUND = { TODO: "TODO", LATER: "TODO", DOING: "DOING", NOW: "DOING", "IN-PROGRESS": "DOING", DONE: "DONE", PAUSED: "PAUSED", WAITING: "WAITING", WAIT: "WAITING", SUSPENDED: "SUSPENDED", CANCELED: "CANCELLED", CANCELLED: "CANCELLED", FAILED: "FAILED" };
// kwLine：一行的状态 { kw, body }；空行、只有关键词没有正文的行、⏱ / 🔗 / 💬 / 🤖 子代理 记号行返回 null
function kwLine(raw) {
  let s = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^\s+/, "").replace(STAMP_RE, "");
  let kw = "";
  const cb = CHECKBOX_RE.exec(s);
  if (cb) { kw = cb[1] === " " ? "TODO" : cb[1] === "/" ? "DOING" : cb[1] === "-" ? "CANCELLED" : "DONE"; s = s.slice(cb[0].length); }
  const m = /^(TODO|DOING|LATER|NOW|PAUSED|WAITING|WAIT|SUSPENDED|IN-PROGRESS|DONE|CANCELED|CANCELLED|FAILED)(?=\s|$)\s*/.exec(s);
  if (m) { kw = m[1]; s = s.slice(m[0].length); }
  // 关键词后面跟着的时刻 / 时间段是记录，会跟着状态一起变，不算正文
  // 优先级（[#A]）在时刻前后都可能出现，也不算正文
  s = s.replace(/^\[#[ABC]\]\s*/, "").replace(/^\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?\s*/, "").replace(/^\[#[ABC]\]\s*/, "").trim();
  if (!s || s.startsWith("⏱") || s.startsWith("🔗") || s.startsWith("💬") || isSubMark(s)) return null;
  return { kw, body: s };
}
function kwSnapshot(content) {
  const out = new Map();
  let inCode = false, count = 0;
  for (const raw of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) { inCode = !inCode; continue; }
    if (inCode || !raw.trim() || ++count > 6000) continue;
    const r = kwLine(raw);
    if (r) out.set(r.body, out.has(r.body) ? null : r.kw);
  }
  return out;
}
// 编辑器里同一行改动前后两个样子，是不是一次状态切换：是就返回 { body, from, to }，不是返回 null。
//   正文没变、关键词变了：⌘/、点 TODOseq 的关键词；
//   手敲关键词：敲完最后那一下，改动前的那行是「敲了一半的关键词 + 正文」
function kwLineChange(oldRaw, newRaw) {
  const a = kwLine(oldRaw), b = kwLine(newRaw);
  if (!a || !b || a.kw === b.kw) return null;
  if (a.body === b.body) return { body: b.body, from: a.kw, to: b.kw };
  if (!a.kw && b.kw && a.body.endsWith(b.body)) {
    const typed = a.body.slice(0, a.body.length - b.body.length).trim();
    if (typed && b.kw.startsWith(typed)) return { body: b.body, from: "", to: b.kw };
  }
  return null;
}
// 前后两份快照里，哪几行的状态变了：[{ body, from, to }]。新写的行、删掉的行不算
function kwChanges(prev, cur) {
  const out = [];
  for (const [body, kw] of cur) {
    const was = prev.get(body);
    if (kw !== null && was !== undefined && was !== null && was !== kw) out.push({ body, from: was, to: kw });
  }
  return out;
}
// 一次改了好几行时只响一声，响最要紧的那个
const KW_RANK = ["DONE", "FAILED", "CANCELLED", "DOING", "SUSPENDED", "WAITING", "PAUSED", "TODO", "CLEAR"];
const kwCue = (changes) => changes.map((c) => (c.to ? KW_SOUND[c.to] || "CLEAR" : "CLEAR")).sort((a, b) => KW_RANK.indexOf(a) - KW_RANK.indexOf(b))[0] || "";

// ---------------- 容量 · 没记录的时间 · 当日复盘 ----------------
// 这三样的判定规则照 Roam 上的 Nautilus Log（MIT，github.com/404KSG/roam-nautilus-log 的 log-core.js / timing-core.js），数字的口径和它一致。

// 容量：
//   已计划 demand = 没做完的待办还要多久
//   可安排 available / totalAvailable = 从现在到收工还能安排的时间 / 全天扣掉事件以后能安排的时间
//   事件 fixed / totalFixed = 还没过去的事件时间 / 全天的事件时间（重叠的按并集算）
//   状态三选一：超载 overload（已计划 > 可安排）→ 空档不足 unplaced（总量够，没有连续空档放得下）→ 余量 free
//   剩余 left = 余量 ÷ 全天可安排的时间，百分数；有余量就至少 1%，不会把一点点余量显示成 0
//   burning = 现在这一分钟流掉的是事件时间还是可安排的时间（只有今天、在时段里才有）
function capacity(items, plan, cfg, now, dayRel, bounds = {}) {
  const S = bounds.start ?? cfg.dayStart * 60, E = bounds.end ?? cfg.dayEnd * 60;
  const events = items.filter((i) => i.kind === "event");
  const totalFixed = unionSegs(events.map((e) => [Math.max(e.start, S), Math.min(e.end, E)]).filter(([a, b]) => b > a)).reduce((n, [a, b]) => n + b - a, 0);
  const totalAvailable = Math.max(0, E - S - totalFixed);
  const available = plan.available, demand = plan.demand;
  const overload = Math.max(0, demand - available), free = Math.max(0, available - demand);
  const unplaced = Math.round(plan.unplaced || 0);
  const whole = totalAvailable > 0 ? totalAvailable : available;
  const left = Math.min(100, free > 0 ? Math.max(1, whole > 0 ? Math.round(free / whole * 100) : 0) : 0);
  const status = overload > 0 ? { key: "overload", label: "超载", value: overload }
    : unplaced > 0 ? { key: "fragmented", label: "空档不足", value: unplaced }
    : { key: "remaining", label: "余量", value: free };
  const tone = overload > 0 || unplaced > 0 ? "warning" : free > 0 ? "positive" : "neutral";
  const burning = dayRel === 0 && now >= S && now < E ? (events.some((e) => e.state !== "done" && now >= e.start && now < e.end) ? "events" : "available") : null;
  return { available, totalAvailable, fixed: plan.eventLeft, totalFixed, demand, overload, free, unplaced, left, status, tone, burning };
}
const capSummary = (c) => `已计划 ${dur(c.demand)} · ${c.status.label} ${dur(c.status.value)} · 剩余 ${c.left}%`;

// 已经过去的时间里没有任何记录的那几段：[S, min(E, upto)] 减去有记录的区间的并集。
// 它只是排程上的事实，不等于那段时间被浪费了
function pastGaps(S, E, upto, occupied) {
  const end = Math.min(E, upto);
  if (!(end > S)) return [];
  return subtract([[S, end]], unionSegs(occupied.map(([a, b]) => [Math.max(a, S), Math.min(b, end)]).filter(([a, b]) => b > a)));
}

// 当日复盘：这一天每件任务的预计和实际，按日记里的顺序逐件列。
//   已对比 compared   = 做完了，也记到了实际用时 → 偏差 = 实际 − 预计（正数 = 比预计多用）
//   未计时 not-tracked = 做完了，没记到实际用时（写「未计时」，不写 0）
//   进行中 live        = 没做完，正在做，已经有用时
//   已暂停 paused      = 没做完，没在做，做过一阵
//   未开始 not-started = 没做完，还没有用时
//   未预估 no-estimate = 这一行从来没进过计划（自动记的 🤖 行，或者「DONE 18:02 写稿 2h」这种直接记做了多久的），只列实际，不拿默认时长去比
// 汇总只算「已对比」的那几件，两边是同一批任务；在做的、停着的不影响偏差。预计 = 行上写的时长，没写按默认任务时长（排程也是按它排的）
// 固定事件不算（时间段是约定，不是预估）；带子任务的大项、复习卡片不算。live = 这一天是不是今天
function dayReview(items, cfg, { live = false, auto = new Set() } = {}) {
  const rows = [];
  for (const t of items) {
    if (t.kind !== "task" || t.container || isReview(t)) continue;
    const done = t.state === "done";
    const worked = t.worked || [];
    const noPlan = auto.has(workKey(t.label)) || t.label.startsWith(AUTO_MARK.trim()) || (done && !(t.est > 0) && t.explicitDur === true && !t.actual);
    const planned = noPlan ? null : done ? (t.est > 0 ? t.est : cfg.defaultDur) : t.dur;
    // 实际：记下来的那几段和 DONE 后面写的时段合起来（重叠只算一次）；直接写了做多久的按写的
    let actual = Math.floor(unionMin([...worked, ...(done && t.actual ? [t.actual] : [])]));
    if (!actual && noPlan && done && t.explicitDur === true && !t.actual && !auto.has(workKey(t.label))) actual = Math.round(t.dur);
    const state = done ? (actual > 0 ? (planned == null ? "no-estimate" : "compared") : "not-tracked")
      : live && t.doing && actual > 0 ? "live" : actual > 0 ? "paused" : "not-started";
    rows.push({ item: t, label: t.label, done, state, plannedMinutes: planned, actualMinutes: actual, varianceMinutes: state === "compared" ? actual - planned : null });
  }
  const compared = rows.filter((r) => r.state === "compared");
  const plannedMinutes = compared.reduce((n, r) => n + r.plannedMinutes, 0), actualMinutes = compared.reduce((n, r) => n + r.actualMinutes, 0);
  return { rows, summary: { totalCount: rows.length, completedCount: rows.filter((r) => r.done).length, comparedCount: compared.length, plannedMinutes, actualMinutes, varianceMinutes: actualMinutes - plannedMinutes } };
}
const signed = (m) => (m > 0 ? `+${dur(m)}` : m < 0 ? `−${dur(-m)}` : "±0");
const reviewLine = (s) => `已完成 ${s.completedCount}/${s.totalCount} · 已对比 ${s.comparedCount} 件：预计 ${dur(s.plannedMinutes)} · 实际 ${dur(s.actualMinutes)} · 偏差 ${signed(s.varianceMinutes)}`;
// 状态栏上的计时：分:秒，过了一小时是 时:分:秒
const elapsedText = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`; };
let hatchSeq = 0;   // 每个螺旋的斜纹图案一个号，几个视图同时开着不串

// ---------------- 工具 ----------------

const pad = (n) => String(n).padStart(2, "0");
const clock = (t) => `${pad(Math.floor(t / 60) % 24)}:${pad(Math.round(t % 60))}`;
// 「日记日期分界」这类按 24 小时制填的时刻 ↔ 小时数（可以带小数）。认「8」「8.5」「08:00」「4:30」「23：30」，不认就返回 null；范围 00:00–23:59
function parseHourClock(v) {
  const s = String(v ?? "").trim().replace(/：/g, ":");
  let m, h = null;
  if ((m = /^(\d{1,2}):(\d{1,2})$/.exec(s))) { if (+m[2] < 60) h = +m[1] + +m[2] / 60; }
  else if (/^\d{1,2}(\.\d+)?$/.test(s)) h = +s;
  return h != null && h >= 0 && h < 24 ? Math.round(h * 60) / 60 : null;
}
const fmtHourClock = (h) => clock(Math.round((+h || 0) * 60));
// 第二大脑每日回顾记进日记的复习：「DONE 14:10-14:12 复习卡片 23 张（…）」。螺旋上画成青色，顶部汇总张数和用时
const REVIEW_RE = /^复习卡片\s*(\d+)\s*张/;
const isReview = (t) => t.kind === "task" && t.state === "done" && REVIEW_RE.test(t.label || "");
function dur(m) {
  m = Math.round(m);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h${r}m` : `${h}h`) : `${r}m`;
}
const svgEl = (tag, attrs, parent) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
};

const splitList = (s) => (s || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);

// 跑一个外部程序，不管退出码都把输出交回来
function run(cmd, args, timeout = 20000) {
  return new Promise((res) => require("child_process").execFile(cmd, args, { timeout, maxBuffer: 16e6 },
    (e, stdout, stderr) => res({ code: e ? (e.code ?? 1) : 0, stdout: String(stdout || ""), stderr: String(stderr || (e && e.message) || "") })));
}

// 拆开一行任务：列表符号（连同 **07:37** 记录点）、复选框和关键词去掉，关键词后面紧跟的时刻（DOING 14:05）单独拿出来
function splitTask(raw) {
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(raw);
  if (!m) return null;
  let [, prefix, rest] = m;
  const st = STAMP_RE.exec(rest);
  if (st) { prefix += st[0]; rest = rest.slice(st[0].length); }   // **07:37** 记录点留在原位
  const cb = CHECKBOX_RE.exec(rest);
  if (cb) rest = rest.slice(cb[0].length);
  const kw = KEYWORD_RE.exec(rest);
  if (kw) rest = rest.slice(kw[0].length);
  // 优先级（[#A]）先拿出来，时刻读完再放回正文开头：改状态时写成 DOING 14:05 [#A] …
  const pr = kw && /^\[#[ABC]\]\s*/.exec(rest);
  if (pr) rest = rest.slice(pr[0].length);
  let since = null;
  const t = kw && /^(\d{1,2})[:：](\d{2})(?![\d:：]|\s*[-–~～到至])\s*/.exec(rest);
  if (t) { since = `${pad(+t[1])}:${t[2]}`; rest = rest.slice(t[0].length); }
  if (pr) rest = `${pr[0].trim()} ${rest}`;
  return { prefix, rest, since, kw: kw ? kw[1] : null, cb: cb ? cb[1] : null };
}
// 写法和 ⌘/ 任务状态快切一样：DOING HH:MM … → DONE HH:MM-HH:MM …（复选框也改成关键词，⌘/ 才能接着切）
function toDoing(raw) { const p = splitTask(raw); return p ? `${p.prefix}DOING ${moment().format("HH:mm")} ${p.rest}` : raw; }
function toDone(raw, since, end) { const p = splitTask(raw); return p ? `${p.prefix}DONE ${p.since ?? since}-${end} ${p.rest}` : raw; }
function toTodo(raw) { const p = splitTask(raw); return p ? `${p.prefix}TODO ${p.rest}` : raw; }
function toPaused(raw) { const p = splitTask(raw); return p ? `${p.prefix}PAUSED ${p.rest}` : raw; }

// 这一行是不是「吃饭」「锻炼」：去掉时间、时长、标点、表情后只剩这几个字（没有别的汉字和英文字母）。
// 没关键词或者 DOING 的才算（TODO 吃饭 是计划，不是现在去吃）；写了时间段、而且开始时间离现在还远的也是计划。返回命中的词
function breakWord(raw, words, cfg, now) {
  const p = splitTask(raw);
  if (!p || p.cb || (p.kw && !/^(DOING|NOW|IN-PROGRESS)$/.test(p.kw))) return null;
  const it = parseJournal(raw, cfg)[0];
  if (it && it.kind === "event" && it.start - now > 15) return null;
  const text = stripDuration(p.rest.replace(/\[#[ABC]\]/g, " ").replace(RANGE_RE, " ").replace(SINGLE_RE, " ")).replace(/[^\p{Script=Han}A-Za-z]/gu, "");
  return words.includes(text) ? text : null;
}

// 一件任务「动过没有」看这一行加上它下面所有子项
function subtree(lines, n) {
  const ind = (l) => /^\s*/.exec(l)[0].replace(/\t/g, "    ").length;
  const base = ind(lines[n]), out = [lines[n]];
  for (let i = n + 1; i < lines.length; i++) {
    if (lines[i].trim() && ind(lines[i]) <= base) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

// 这件任务专注多久：条目上写了 10min 就是 10 分钟；没写按默认任务时长；写了进度（2h 40%）按还剩的；设置里填了固定时长就用固定的
function focusMinutes(t, cfg) {
  if (cfg.focusMinutes > 0) return cfg.focusMinutes;
  if (t.progress != null) return Math.max(5, Math.round(t.dur * (1 - t.progress)));
  return Math.max(1, Math.round(t.dur));
}

// 系统对话框（osascript）：Obsidian 在后台也会弹到最前面。返回点的按钮，没回答（超时）返回 ""
const asStr = (x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
async function dialog(msg, buttons, def, wait) {
  const script = `activate\ndisplay dialog ${asStr(msg)} with title "螺旋日程" buttons {${buttons.map(asStr).join(", ")}} default button ${asStr(def)} giving up after ${wait}`;
  const r = await run("/usr/bin/osascript", ["-e", script], (wait + 60) * 1000);
  if (/gave up:true/.test(r.stdout)) return "";
  return (/button returned:([^,\n]*)/.exec(r.stdout) || [])[1] || "";
}
// 多选列表：返回勾上的那几项；点取消返回 []；没回答（半小时超时）返回 null
async function pickList(prompt, items, ok, cancel, defaults = []) {
  const def = defaults.length ? ` default items {${defaults.map(asStr).join(", ")}}` : "";
  const script = `activate\nset r to choose from list {${items.map(asStr).join(", ")}} with title "螺旋日程" with prompt ${asStr(prompt)}${def} OK button name ${asStr(ok)} cancel button name ${asStr(cancel)} with multiple selections allowed and empty selection allowed\nif r is false then return "__CANCEL__"\nset AppleScript's text item delimiters to linefeed\nreturn r as text`;
  const r = await run("/usr/bin/osascript", ["-e", script], 1800e3);
  if (r.code !== 0) return null;
  const out = r.stdout.replace(/\n$/, "");
  return out === "__CANCEL__" ? [] : out ? out.split("\n") : [];
}
const groupBy = (tasks) => { const m = new Map(); for (const t of tasks) (m.get(t.path) || m.set(t.path, []).get(t.path)).push(t); return m; };
const breakIcon = (w) => (/饭|餐|夜宵/.test(w) ? "🍚" : /锻炼|运动|健身|跑|球/.test(w) ? "🏃" : /睡|眯/.test(w) ? "😴" : "☕");

// ---------------- 带按钮的系统通知 ----------------
// Obsidian 自己发的通知（new Notification）带不了按钮。这里在本机编一个很小的通知 App（和读日历的小助手一样，第一次用时编译，
// 放在 ~/Library/Caches/nautilus-spiral/），通知上可以带几个按钮，点了哪个它就把那个按钮的字打印出来。
// 第一次会弹「“螺旋日程”想给你发通知」，要点允许。横幅样式下按钮在通知上悬停、点「选项」里；
// 到「系统设置 → 通知 → 螺旋日程」把样式改成「提醒」，通知就一直留在屏幕上、按钮直接露着。
// 直接运行里面的可执行文件，系统不认它是个 App，会直接拒绝发通知；得用 open 启动，所以结果不走标准输出，写到一个文件里。
//   open -n -W 螺旋日程.app --args <结果文件> <标题> <正文> <等多少秒> [按钮1 按钮2 …]
//   结果文件里是：点的按钮 / __click__（点了通知本身）/ 空（没理）/ __denied__（没给权限）
const NOTIFY_SWIFT = String.raw`import AppKit
import UserNotifications

let all = Array(CommandLine.arguments.dropFirst())
let resultFile = all.first ?? ""
let args = Array(all.dropFirst())
let myId = UUID().uuidString
let outDir = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Caches/nautilus-spiral/notify")
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func finish(_ s: String, _ code: Int32 = 0) -> Never {
  if !resultFile.isEmpty { try? s.write(toFile: resultFile, atomically: true, encoding: .utf8) }
  UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [myId])
  try? FileManager.default.removeItem(atPath: outDir + "/" + myId)
  exit(code)
}

final class Delegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  var timer: Timer?
  func applicationDidFinishLaunching(_ n: Notification) {
    // 点了一条早就没人等的通知，系统会把这个 App 重新叫起来：没有参数，直接退
    guard args.count >= 3 else { exit(0) }
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    let wait = Double(args[2]) ?? 600
    DispatchQueue.main.asyncAfter(deadline: .now() + wait + 20) { finish("") }
    center.requestAuthorization(options: [.alert, .sound]) { ok, _ in
      if !ok { finish("__denied__", 2) }
      let actions = Array(args.dropFirst(3))
      let cat = "naut." + actions.joined(separator: "|")
      center.getNotificationCategories { old in
        var cats = old.filter { $0.identifier != cat }
        cats.insert(UNNotificationCategory(identifier: cat,
          actions: actions.enumerated().map { UNNotificationAction(identifier: "a\($0.offset)", title: $0.element, options: []) },
          intentIdentifiers: [], options: [.customDismissAction]))
        center.setNotificationCategories(cats)
        let c = UNMutableNotificationContent()
        c.title = args[0]
        c.body = args[1]
        c.categoryIdentifier = cat
        c.userInfo = ["actions": actions]   // 按钮的字跟着通知走，哪个进程收到回答都认得
        center.add(UNNotificationRequest(identifier: myId, content: c, trigger: nil)) { err in
          if err != nil { finish("__error__", 3) }
        }
      }
    }
    // 同时发了好几条时，系统可能把回答交给另一个进程：回答都写到文件里，各自认领自己的
    timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
      if let s = try? String(contentsOfFile: outDir + "/" + myId, encoding: .utf8) { finish(s) }
    }
  }
  func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler h: @escaping (UNNotificationPresentationOptions) -> Void) {
    h([.banner, .list])
  }
  func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler h: @escaping () -> Void) {
    let id = r.notification.request.identifier
    let actions = (r.notification.request.content.userInfo["actions"] as? [String]) ?? []
    var out = ""
    if r.actionIdentifier == UNNotificationDefaultActionIdentifier { out = "__click__" }
    else if r.actionIdentifier.hasPrefix("a"), let i = Int(r.actionIdentifier.dropFirst()), i < actions.count { out = actions[i] }
    try? out.write(toFile: outDir + "/" + id, atomically: true, encoding: .utf8)
    h()
    if id == myId { finish(out) }
  }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
`;
const NOTIFY_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>md.obsidian.nautilus-spiral.notify</string>
<key>CFBundleName</key><string>螺旋日程</string>
<key>CFBundleDisplayName</key><string>螺旋日程</string>
<key>CFBundleExecutable</key><string>spiral-notify</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
<key>LSMinimumSystemVersion</key><string>11.0</string>
</dict></plist>
`;
// 通知要认 App 的身份，光一个可执行文件发不了：编好以后包成 .app、本机签个名。返回这个 .app 的路径
let notifyApp = null;
function notifyTool() {
  if (!notifyApp) notifyApp = (async () => {
    const fs = require("fs"), path = require("path");
    const bin = await swiftTool("notify", NOTIFY_SWIFT);
    const app = bin + ".app", exe = path.join(app, "Contents/MacOS/spiral-notify");
    if (fs.existsSync(exe)) return app;
    await fs.promises.mkdir(path.dirname(exe), { recursive: true });
    await fs.promises.copyFile(bin, exe);
    await fs.promises.chmod(exe, 0o755);
    await fs.promises.writeFile(path.join(app, "Contents/Info.plist"), NOTIFY_PLIST);
    const r = await run("/usr/bin/codesign", ["--force", "--sign", "-", app], 60000);
    if (r.code !== 0) { await fs.promises.rm(app, { recursive: true, force: true }); throw new Error("通知小助手签名失败：" + r.stderr.slice(0, 300)); }
    return app;
  })().catch((e) => { notifyApp = null; throw e; });
  return notifyApp;
}

// ---------------- Claude 桌面 app 里归档了哪些会话 ----------------
// app 给每个会话存一份 claude-code-sessions/<账号>/<组织>/local_….json，归档只是把里面的 isArchived 设成 true，
// 会话记录（~/.claude/projects 里的 .jsonl）原样留着。返回归档了的会话号（cliSessionId，和 .jsonl 的文件名是同一个）。
// cache：路径 → { mtime, sid, archived }，没变的文件不重读；一周没动过的文件不看（自动记录的状态只留几天）
async function archivedSessions(cache) {
  const os = require("os"), path = require("path"), fs = require("fs");
  const home = os.homedir();
  const base = process.platform === "darwin" ? path.join(home, "Library/Application Support")
    : process.platform === "win32" ? (process.env.APPDATA || path.join(home, "AppData/Roaming"))
    : (process.env.XDG_CONFIG_HOME || path.join(home, ".config"));
  const out = new Set();
  const walk = async (dir, depth) => {
    let ents;
    try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 3) await walk(p, depth + 1); continue; }
      if (!e.isFile() || !/^local_.*\.json$/.test(e.name)) continue;
      let st;
      try { st = await fs.promises.stat(p); } catch (err) { continue; }
      if (st.mtimeMs < Date.now() - 7 * 864e5) continue;
      let c = cache.get(p);
      if (!c || c.mtime !== st.mtimeMs) {
        c = { mtime: st.mtimeMs, sid: "", archived: false };
        try {
          const d = JSON.parse(await fs.promises.readFile(p, "utf8"));
          c.sid = String(d.cliSessionId || "");
          c.archived = d.isArchived === true;
        } catch (err) { c.mtime = 0; }   // app 正好在写这个文件：下一轮再读
        cache.set(p, c);
      }
      if (c.archived && c.sid) out.add(c.sid);
    }
  };
  await walk(path.join(base, "Claude", "claude-code-sessions"), 0);
  return out;
}

// ---------------- Claude 桌面版的 side chat ----------------
// side chat 是在一个 Code 会话上开的只读分叉。桌面 app 为它起一个 claude 进程：
//   claude … --resume=<父会话号> --fork-session --no-session-persistence --tools=Read,Grep,Glob
// 不落盘：没有自己的 .jsonl，app 的会话清单里也没有它，所以只能看进程——进程在就是开着，关掉进程就没了。
// 问了什么、在答还是等你、用了多少 token 都读不到。返回 Map(父会话号 → [{ pid, since }])
function sideChats() {
  return new Promise((resolve) => {
    const out = new Map();
    if (process.platform === "win32") return resolve(out);
    require("child_process").execFile("/bin/ps", ["-axo", "pid=,etime=,command="], { maxBuffer: 16 << 20 }, (err, text) => {
      if (err) return resolve(out);
      for (const line of String(text).split("\n")) {
        // 外面那层 disclaimer 包装带着同样的参数，只认真正的 claude 进程
        if (!line.includes("--fork-session") || !line.includes("--no-session-persistence") || line.includes("disclaimer")) continue;
        const r = /--resume[= ]([0-9a-f]{8}-[0-9a-f-]{27})/.exec(line);
        if (!r) continue;
        const [pid, et] = line.trim().split(/\s+/);
        // etime：[[天-]时:]分:秒
        const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(et || "");
        const age = m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + +m[3] * 60 + +m[4]) * 1000 : 0;
        (out.get(r[1]) || out.set(r[1], []).get(r[1])).push({ pid: +pid, since: Date.now() - age });
      }
      resolve(out);
    });
  });
}

// ---------------- 调一次本机的 claude 命令行 ----------------
// 自动记日记时用它判断「这个会话做的是什么事、做完没有」。-p 一问一答：不留会话记录（不然它自己也会被当成一个会话记进来）、
// 不带工具、不读个人设置里的钩子和插件。用的是命令行自己的登录。返回它说的话
function runClaude(prompt, { bin = "~/.local/bin/claude", model = "haiku", system = "", timeout = 120 } = {}) {
  const os = require("os"), path = require("path"), fs = require("fs");
  return new Promise((resolve, reject) => {
    const cwd = path.join(os.homedir(), "Library/Caches/nautilus-spiral/autolog");
    try { fs.mkdirSync(cwd, { recursive: true }); } catch (e) { /* 建不出来就让下面 spawn 报错 */ }
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "project", "--tools", "", "--system-prompt", system || "你是一个只输出 JSON 的整理助手。"];
    if (model) args.push("--model", model);
    const env = { ...process.env, PATH: [path.join(os.homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":") };
    let child;
    try { child = require("child_process").spawn(bin.replace(/^~(?=\/)/, os.homedir()), args, { cwd, env }); }
    catch (e) { return reject(new Error(`启动 claude 失败：${e.message}`)); }
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`claude 等了 ${timeout} 秒没回来`)); }, timeout * 1000);
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`启动 claude 失败：${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      let d;
      try { d = JSON.parse(out); } catch (e) { return reject(new Error((err || out || `claude 退出码 ${code}`).trim().slice(0, 300))); }
      if (d.is_error) return reject(new Error(String(d.result || "claude 返回错误").slice(0, 300)));
      resolve(String(d.result || ""));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// 主力是 Codex、本机没有 claude 的：用 codex exec 问同一个问题。--ephemeral 不留会话文件（不然它自己也会被当成一个会话记进来），
// 沙箱只读；回答让它写到一个临时文件里再读回来。用的是 codex 命令行自己的登录
let codexBin = null;   // 找到过的 codex 路径
function findCodex(bin) {
  const os = require("os");
  const b = String(bin || "codex").replace(/^~(?=\/)/, os.homedir());
  if (b.includes("/")) return Promise.resolve(b);
  if (codexBin) return Promise.resolve(codexBin);
  // 从访达启动的 Obsidian 拿不到终端里的 PATH：先看几个常见的安装位置（Homebrew、npm 全局、nvm），再问登录 shell
  const fs = require("fs"), path = require("path"), home = os.homedir();
  const spots = [path.join(home, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".npm-global/bin"), path.join(home, ".volta/bin"), path.join(home, ".bun/bin")];
  try { for (const v of fs.readdirSync(path.join(home, ".nvm/versions/node")).sort().reverse()) spots.push(path.join(home, ".nvm/versions/node", v, "bin")); } catch (e) { /* 没装 nvm */ }
  for (const d of spots) { const p = path.join(d, b); if (fs.existsSync(p)) return Promise.resolve(codexBin = p); }
  return new Promise((resolve) => {
    require("child_process").execFile(process.env.SHELL || "/bin/zsh", ["-lic", `command -v ${shq(b)}`], { timeout: 15000 }, (e, out) => {
      const hit = String(out || "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("/")).pop();
      resolve(hit ? (codexBin = hit) : b);
    });
  });
}
async function runCodex(prompt, { bin = "codex", model = "", system = "", timeout = 180 } = {}) {
  const os = require("os"), path = require("path"), fs = require("fs");
  const exe = await findCodex(bin);
  const cwd = path.join(os.homedir(), "Library/Caches/nautilus-spiral/autolog");
  try { fs.mkdirSync(cwd, { recursive: true }); } catch (e) { /* 建不出来就让下面 spawn 报错 */ }
  const outFile = path.join(cwd, `codex-${Date.now()}.txt`);
  const args = ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "-o", outFile];
  if (model) args.push("-m", model);
  args.push("-");   // 问题从标准输入给
  // codex 是个 node 脚本，node 多半和它装在同一个目录里
  const env = { ...process.env, PATH: [path.dirname(exe), path.join(os.homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":") };
  return new Promise((resolve, reject) => {
    let child;
    try { child = require("child_process").spawn(exe, args, { cwd, env }); }
    catch (e) { return reject(new Error(`启动 codex 失败：${e.message}`)); }
    let err = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (d) => { err += d; });
    const clean = () => fs.promises.unlink(outFile).catch(() => {});
    const timer = setTimeout(() => { child.kill(); clean(); reject(new Error(`codex 等了 ${timeout} 秒没回来`)); }, timeout * 1000);
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`启动 codex 失败：${e.message}`)); });
    child.on("close", async (code) => {
      clearTimeout(timer);
      let text = "";
      try { text = await fs.promises.readFile(outFile, "utf8"); } catch (e) { /* 没写出来 = 出错了 */ }
      clean();
      if (!text.trim()) return reject(new Error((err.trim().split("\n").pop() || `codex 退出码 ${code}`).slice(0, 300)));
      resolve(text);
    });
    child.stdin.write((system || "你是一个只输出 JSON 的整理助手。") + "\n\n" + prompt);
    child.stdin.end();
  });
}
// 自动记日记问哪个命令行：设置里指定了就用指定的；auto = 本机有 claude 就用 claude，没有就用 codex
function runJudge(prompt, cfg) {
  const os = require("os"), fs = require("fs");
  const claude = cfg.claudePath || "~/.local/bin/claude";
  const which = cfg.autoLogCli === "claude" || cfg.autoLogCli === "codex" ? cfg.autoLogCli : fs.existsSync(claude.replace(/^~(?=\/)/, os.homedir())) ? "claude" : "codex";
  return which === "codex" ? runCodex(prompt, { bin: cfg.codexPath || "codex", model: cfg.autoLogCodexModel || "" })
    : runClaude(prompt, { bin: claude, model: cfg.autoLogModel || "haiku" });
}

// 两篇文字前后不一样的那一段，换成编辑器的一次改动（光标和滚动位置不乱，⌘Z 一步撤销）。一样就返回 null
function diffLines(before, after) {
  const a = before.split("\n"), b = after.split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  if (s === ea && s === eb) return null;
  const mid = b.slice(s, eb);
  if (ea < a.length) return { from: { line: s, ch: 0 }, to: { line: ea, ch: 0 }, text: mid.map((l) => l + "\n").join("") };
  const end = { line: a.length - 1, ch: a[a.length - 1].length };
  if (s > 0) return { from: { line: s - 1, ch: a[s - 1].length }, to: end, text: mid.map((l) => "\n" + l).join("") };
  return { from: { line: 0, ch: 0 }, to: end, text: mid.join("\n") };
}
const unionSegs = (segs) => {
  const out = [];
  for (const [a, b] of [...segs].sort((x, y) => x[0] - y[0])) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
};
const durTag = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? (m % 60) + "m" : ""}` : `${Math.max(1, Math.round(m))}m`);   // 写在行尾的时长：45m、1h20m
const AUTO_MARK = "🤖 ";   // 自动记的行开头带这个

// 模型起的名字要能原样写成一行任务：去掉会被当成时间、时长、格式标记、挪动标记的写法
function safeLabel(s, cfg) {
  let t = stripDuration(String(s || "").replace(/[\r\n←`*=~\[\]]/g, " ").replace(/^\s*(?:[-*+]\s+)?(?:TODO|DOING|DONE|SUSPENDED|PAUSED)\s+/i, "")
    .replace(/(\d)[:：](\d)/g, "$1.$2").replace(/(\d)点/g, "$1 点")).replace(/[。；;，,\s]+$/, "").trim();
  const it = parseJournal(`- TODO ${t}`, cfg)[0];
  if (!it || it.kind !== "task") t = t.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  return t;
}

// ---------------- macOS 日历（只读） ----------------
// 用 EventKit 读系统「日历」App 里的事件（iCloud、Exchange、订阅的日历都在里面），只读，不改日历。
// 读日历的小助手是下面这段 Swift：第一次用时在本机编译到 ~/Library/Caches/nautilus-spiral/（要有 Xcode 命令行工具），
// 由 Obsidian 启动，所以第一次会弹「“Obsidian”想要访问你的日历」。
//   calendar-xxx <开始毫秒> <结束毫秒>  → 事件 JSON；calendar-xxx --calendars → 日历列表
const CAL_SWIFT = String.raw`import EventKit
import Foundation

func out(_ obj: Any) {
  let data = (try? JSONSerialization.data(withJSONObject: obj, options: [])) ?? Data("[]".utf8)
  FileHandle.standardOutput.write(data)
}
func hex(_ c: CGColor?) -> String {
  guard let c = c, let space = CGColorSpace(name: CGColorSpace.sRGB),
        let rgb = c.converted(to: space, intent: .defaultIntent, options: nil),
        let p = rgb.components, p.count >= 3 else { return "" }
  return String(format: "#%02x%02x%02x", Int(p[0] * 255), Int(p[1] * 255), Int(p[2] * 255))
}

var status = EKEventStore.authorizationStatus(for: .event)
if status == .notDetermined {
  let sem = DispatchSemaphore(value: 0)
  EKEventStore().requestFullAccessToEvents { _, _ in sem.signal() }
  sem.wait()
  status = EKEventStore.authorizationStatus(for: .event)
}
if status != .fullAccess {
  out(["error": "denied", "status": status.rawValue])
  exit(2)
}
let store = EKEventStore()
let args = CommandLine.arguments
if args.count > 1 && args[1] == "--calendars" {
  out(store.calendars(for: .event).map { ["title": $0.title, "source": $0.source.title, "color": hex($0.cgColor)] })
  exit(0)
}
guard args.count >= 3, let a = Double(args[1]), let b = Double(args[2]) else {
  out(["error": "usage"])
  exit(1)
}
let pred = store.predicateForEvents(withStart: Date(timeIntervalSince1970: a / 1000), end: Date(timeIntervalSince1970: b / 1000), calendars: nil)
var list: [[String: Any]] = []
for e in store.events(matching: pred) {
  if e.status == .canceled { continue }
  // 我拒绝了的邀请不算
  if let me = e.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined { continue }
  list.append([
    "id": e.eventIdentifier ?? "",
    "title": e.title ?? "",
    "start": e.startDate.timeIntervalSince1970 * 1000,
    "end": e.endDate.timeIntervalSince1970 * 1000,
    "allDay": e.isAllDay,
    "calendar": e.calendar.title,
    "color": hex(e.calendar.cgColor),
    "location": e.location ?? "",
  ])
}
out(list)
`;

// 小助手二：看一眼现在的状态。idle = 键盘鼠标多少秒没动；front = 最前面的 App；
// panel = Raycast 专注的悬浮小窗在不在（专注进行时屏幕上有个 Raycast 的高 40 左右、层级 ≥ 100 的小窗，点完成就没了）
const PROBE_SWIFT = String.raw`import AppKit
import CoreGraphics

let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
let front = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
var panel = false
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list where (w[kCGWindowOwnerName as String] as? String) == "Raycast" {
  let layer = (w[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let h = (b["Height"] as? NSNumber)?.doubleValue ?? 0
  if layer >= 100 && h >= 30 && h <= 60 { panel = true }
}
let obj: [String: Any] = ["idle": idle, "front": front, "panel": panel]
FileHandle.standardOutput.write((try? JSONSerialization.data(withJSONObject: obj, options: [])) ?? Data("{}".utf8))
`;

// 编译 Swift 小助手到 ~/Library/Caches/nautilus-spiral/<名字>-<源码哈希>，源码一改就重新编译
const swiftBins = new Map();
function swiftTool(name, src) {
  if (!swiftBins.has(name)) swiftBins.set(name, (async () => {
    const fs = require("fs"), path = require("path"), os = require("os");
    const hash = require("crypto").createHash("md5").update(src).digest("hex").slice(0, 10);
    const dir = path.join(os.homedir(), "Library/Caches/nautilus-spiral");
    const bin = path.join(dir, `${name}-${hash}`);
    if (fs.existsSync(bin)) return bin;
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(`${bin}.swift`, src);
    const r = await run("/usr/bin/swiftc", ["-O", "-o", bin, `${bin}.swift`], 300000);
    if (r.code !== 0 || !fs.existsSync(bin)) throw new Error("编译小助手失败（需要 Xcode 命令行工具：xcode-select --install）\n" + r.stderr.slice(0, 500));
    return bin;
  })().catch((e) => { swiftBins.delete(name); throw e; }));
  return swiftBins.get(name);
}

class MacCalendar {
  constructor() {
    this.cache = new Map();   // "2026-10-07" -> { at, items, allDay, error }
    this.busy = new Set();
  }

  async call(args) {
    const r = await run(await swiftTool("calendar", CAL_SWIFT), args.map(String));
    let data;
    try { data = JSON.parse(r.stdout); } catch (e) { throw new Error(r.stderr || "日历小助手没有输出"); }
    if (data && data.error === "denied") throw new Error("没有日历权限：到「系统设置 → 隐私与安全性 → 日历」里给 Obsidian 打开「完全访问」");
    if (data && data.error) throw new Error(data.error);
    return data;
  }
}

// ---------------- Google 日历（只读） ----------------
// 走 Google Calendar API。用的是你自己在 Google Cloud 里建的 OAuth 客户端（类型选「桌面应用」），插件不带任何公共的密钥。
// 连接：在本机临时开一个只听 127.0.0.1 的端口，浏览器里登录、同意以后 Google 把授权码送回这个端口（带 PKCE），换成令牌。
// 申请的权限只有 calendar.readonly。刷新令牌和客户端密钥放进 Obsidian 的密钥存储（系统钥匙串），不写进 data.json；老版本 Obsidian 没有密钥存储才退回 data.json。
// 读出来的事件整理成和 macOS 日历同一个样子：{ id, title, start, end（毫秒）, allDay, calendar, color, location, url, source: "google" }
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
class GoogleCalendar {
  // host = { get(id), set(id, value)：存取密钥；clientId()；http(req) → { status, json }；open(url) }。分开是为了能单独测
  constructor(host) {
    this.host = host;
    this.access = null;      // { token, until }
    this.cals = null;        // { at, list }
  }
  connected() { return !!this.host.get("refresh"); }

  // 浏览器里要打开的授权地址
  authUrl(redirect, challenge, state) {
    const q = new URLSearchParams({ client_id: this.host.clientId(), redirect_uri: redirect, response_type: "code", scope: GOOGLE_SCOPE,
      code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent", state });
    return "https://accounts.google.com/o/oauth2/v2/auth?" + q.toString();
  }

  // 连接：开端口 → 开浏览器 → 等授权码 → 换令牌。timeout 秒内没完成就算了
  async connect(timeout = 300) {
    if (!this.host.clientId() || !this.host.get("secret")) throw new Error("先填客户端 ID 和客户端密钥");
    const crypto = require("crypto"), http = require("http");
    const b64 = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const verifier = b64(crypto.randomBytes(48)), state = b64(crypto.randomBytes(16));
    const challenge = b64(crypto.createHash("sha256").update(verifier).digest());
    const server = http.createServer();
    await new Promise((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", ok); });
    const redirect = `http://127.0.0.1:${server.address().port}`;
    try {
      const code = await new Promise((ok, bad) => {
        const timer = setTimeout(() => bad(new Error("等了太久，没有收到授权")), timeout * 1000);
        server.on("request", (req, res) => {
          const u = new URL(req.url, redirect);
          if (!u.searchParams.has("code") && !u.searchParams.has("error")) { res.writeHead(404); res.end(); return; }
          const good = u.searchParams.get("state") === state && u.searchParams.has("code");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!doctype html><meta charset="utf-8"><title>螺旋日程</title><body style="font:16px/1.6 -apple-system,sans-serif;text-align:center;padding-top:18vh">${good ? "连上了，可以关掉这个页面，回到 Obsidian。" : "没有连上：" + (u.searchParams.get("error") || "授权信息对不上") + "。回到 Obsidian 再试一次。"}</body>`);
          clearTimeout(timer);
          good ? ok(u.searchParams.get("code")) : bad(new Error(u.searchParams.get("error") === "access_denied" ? "你在浏览器里拒绝了授权" : "授权信息对不上：" + (u.searchParams.get("error") || "state 不一致")));
        });
        this.host.open(this.authUrl(redirect, challenge, state));
      });
      const r = await this.host.http({ url: "https://oauth2.googleapis.com/token", method: "POST", contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({ client_id: this.host.clientId(), client_secret: this.host.get("secret"), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirect }).toString() });
      if (r.status !== 200 || !r.json.refresh_token) throw new Error("换令牌失败：" + ((r.json && (r.json.error_description || r.json.error)) || r.status));
      this.host.set("refresh", r.json.refresh_token);
      this.access = { token: r.json.access_token, until: Date.now() + (r.json.expires_in - 60) * 1000 };
      this.cals = null;
    } finally { server.close(); }
  }

  disconnect() { this.host.set("refresh", ""); this.access = null; this.cals = null; }

  async token() {
    if (this.access && Date.now() < this.access.until) return this.access.token;
    const refresh = this.host.get("refresh");
    if (!refresh) throw new Error("还没连接 Google 账号");
    const r = await this.host.http({ url: "https://oauth2.googleapis.com/token", method: "POST", contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({ client_id: this.host.clientId(), client_secret: this.host.get("secret"), refresh_token: refresh, grant_type: "refresh_token" }).toString() });
    if (r.status !== 200 || !r.json.access_token) {
      // 授权被撤销或者过期了：要重新连接
      if (r.json && r.json.error === "invalid_grant") { this.host.set("refresh", ""); throw new Error("Google 的授权失效了，到设置里重新连接"); }
      throw new Error("刷新 Google 令牌失败：" + ((r.json && (r.json.error_description || r.json.error)) || r.status));
    }
    this.access = { token: r.json.access_token, until: Date.now() + (r.json.expires_in - 60) * 1000 };
    return this.access.token;
  }

  async api(path, params = {}) {
    const r = await this.host.http({ url: `https://www.googleapis.com/calendar/v3${path}?${new URLSearchParams(params).toString()}`, method: "GET", headers: { Authorization: "Bearer " + await this.token() } });
    if (r.status === 401) { this.access = null; throw new Error("Google 说令牌无效，下一次会重新取"); }
    if (r.status !== 200) throw new Error("Google 日历：" + ((r.json && r.json.error && r.json.error.message) || r.status));
    return r.json;
  }

  // 账号下的日历：[{ id, title, color, primary, shown }]。shown = 在 Google 日历界面里勾着显示的。十分钟读一次
  async calendars() {
    if (this.cals && Date.now() - this.cals.at < 600e3) return this.cals.list;
    const list = [];
    let pageToken = "";
    do {
      const d = await this.api("/users/me/calendarList", { maxResults: "250", ...(pageToken ? { pageToken } : {}) });
      for (const c of d.items || []) list.push({ id: c.id, title: c.summaryOverride || c.summary || c.id, color: c.backgroundColor || "", primary: !!c.primary, shown: c.selected !== false && !c.hidden });
      pageToken = d.nextPageToken || "";
    } while (pageToken);
    this.cals = { at: Date.now(), list };
    return list;
  }

  // from ~ to（毫秒）之间的事件。只读界面里勾着显示的日历；取消了的、你拒绝了的不要
  async events(from, to, skip = new Set()) {
    const out = [];
    for (const cal of await this.calendars()) {
      if (!cal.shown || skip.has(cal.title)) continue;
      let pageToken = "";
      do {
        const d = await this.api(`/calendars/${encodeURIComponent(cal.id)}/events`, { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250", ...(pageToken ? { pageToken } : {}) });
        for (const e of d.items || []) { const x = GoogleCalendar.event(e, cal); if (x) out.push(x); }
        pageToken = d.nextPageToken || "";
      } while (pageToken);
    }
    return out;
  }

  // Google 的一条事件 → 螺旋用的样子。全天事件给的是日期（2026-10-13，结束那天不含），按本地时区的 0 点算
  static event(e, cal) {
    if (!e || e.status === "cancelled" || !e.start || !e.end) return null;
    if ((e.attendees || []).some((a) => a.self && a.responseStatus === "declined")) return null;
    const allDay = !!e.start.date;
    const at = (x) => (x.date ? new Date(x.date + "T00:00:00").getTime() : Date.parse(x.dateTime));
    const start = at(e.start), end = at(e.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { id: e.id || "", title: e.summary || "", start, end, allDay, calendar: cal.title, color: cal.color, location: e.location || "", url: e.htmlLink || "", source: "google" };
  }
}
// ---------------- 人机协作：Claude Code 的本地会话日志 ----------------
// ~/.claude/projects/**/*.jsonl，每条 assistant 消息带 usage。按日记日（dayCutoff 分界）汇总成：
//   协作时长 = 有 Claude 在干活的墙钟时间（几个窗口同时开只算一次）；Claude 工时 = 各会话活跃时间相加（并行就多于协作时长）
//   产出 = output tokens（含思考）；读入 = input + cache 写入（新读进来的文件、命令输出）；
//   缓存命中 cache_read 只是每轮把上下文重读一遍，量最大但不代表干了活，只放在悬停提示里
// Claude Code 默认 30 天删会话日志，所以汇总结果另存一份（ai-usage.json），日志删了历史还在。
const AI_IDLE = 5;          // 同一会话两次活动间隔不超过 5 分钟，中间算在干活（跑长命令、等你确认都在内）
const AI_FRESH_DAYS = 14;   // 最近这么多天的汇总会随日志重算，更早的定格不再改
const AI_STORE_V = 4;       // ai-usage.json 的格式版本；升级时用现存日志把所有日子重算一遍（2 = 加了每个会话的明细 list，3 = 明细里加了工作目录 cwd，4 = 加了会话来自哪（Claude 桌面版 / 终端））

const fmtKey = (d, cfg) => cfg.format.replace("YYYY", d.getFullYear()).replace("MM", pad(d.getMonth() + 1)).replace("DD", pad(d.getDate()));

function aiDay(ms, cfg) {
  const cutoff = cfg.dayCutoff ?? Math.max(0, cfg.dayEnd - 24);
  const d = new Date(ms - cutoff * 3600e3);
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { key: fmtKey(d, cfg), t: (ms - mid) / 60000 };   // t 和螺旋同一个坐标：当天 0 点起的分钟数，凌晨会超过 1440
}

// 会话来自哪个 Agent（各读各的日志目录），螺旋和列表上各用各的颜色：Claude 橙、Codex 淡蓝、WorkBuddy 绿
const AI_AGENTS = { claude: "Claude", codex: "Codex", workbuddy: "WorkBuddy" };
const aiAgent = (x) => (x && AI_AGENTS[x.agent] ? x.agent : "claude");   // 旧记录没写来源的都是 Claude
// 设置里开着的那几个（主力 AI 工具），没设过就是全开
const aiOn = (cfg) => Object.keys(AI_AGENTS).filter((k) => !(cfg && cfg.aiAgents) || cfg.aiAgents[k] !== false);
const codexHome = () => process.env.CODEX_HOME || require("path").join(require("os").homedir(), ".codex");
// 这个会话是在哪开的
const aiWhere = (x) => {
  const a = aiAgent(x), app = x.app || "";
  if (a === "claude") return app === "cli" ? "终端" : "Claude 桌面版";   // 终端里的 Claude Code；其余（claude-desktop 或者旧记录不知道来源的）按桌面版
  if (a === "codex") return /desktop/i.test(app) ? "Codex 桌面版" : /tui|cli|exec/i.test(app) ? "Codex 终端" : "Codex";
  return AI_AGENTS[a];
};

// 存下的一天汇总里只留开着的那几个 Agent。存的那份不动，用的时候再筛：关掉一个再打开，它的历史还在
function aiPick(day, cfg) {
  if (!day) return null;
  const on = new Set(aiOn(cfg));
  const by = day.by || { claude: { wall: day.wall, agent: day.agent, out: day.out, segs: day.segs } };   // 旧记录没分 Agent，都是 Claude
  const keep = Object.keys(by).filter((k) => on.has(k));
  if (keep.length === Object.keys(by).length) return day;
  if (!keep.length) return null;
  const list = (day.list || []).filter((x) => on.has(aiAgent(x)));
  const segs = unionSegs(keep.flatMap((k) => by[k].segs.map(([a, b]) => [a, b])));
  // 分 Agent 记了的数就按 Agent 加，早先没分开记的（调用次数、读入、指令数）只能照整天的给
  const sum = (f) => (keep.every((k) => by[k][f] != null) ? keep.reduce((n, k) => n + by[k][f], 0) : day[f]);
  const proj = {};
  for (const [name, p] of Object.entries(day.proj || {})) {
    const agents = Object.fromEntries(Object.entries(p.agents || {}).filter(([k]) => on.has(k)));
    const min = Object.values(agents).reduce((n, m) => n + m, 0), out = list.filter((x) => x.dir === name).reduce((n, x) => n + x.out, 0);
    if (min || out) proj[name] = { min, out, agents };
  }
  const models = {};
  if (keep.every((k) => by[k].models)) for (const k of keep) for (const [m, v] of Object.entries(by[k].models)) models[m] = (models[m] || 0) + v;
  return { ...day, by: Object.fromEntries(keep.map((k) => [k, by[k]])), list, segs, proj, sessions: list.length,
    wall: Math.round(segs.reduce((n, [a, b]) => n + b - a, 0)), agent: sum("agent"), out: sum("out"), calls: sum("calls"), fresh: sum("fresh"), cached: sum("cached"), prompts: sum("prompts"),
    models: keep.every((k) => by[k].models) ? models : day.models };
}

function aiProject(cwd) {
  if (!cwd) return "?";
  if (/\/WorkBuddy\/\d{4}-\d\d-\d\d/.test(cwd)) return "WorkBuddy";   // WorkBuddy 每个对话一个按时间起名的目录，合成一个
  const p = cwd.split("/.claude/worktrees/")[0].replace(/\/+$/, "");
  return p === require("os").homedir() ? "~" : p.split("/").pop() || p;
}

// 真的是你敲的指令（不是工具结果、斜杠命令、系统注入）：返回指令原文，不是就返回空串
function aiIsPrompt(d) {
  if (d.isMeta || d.isSidechain) return false;
  const c = d.message && d.message.content;
  const text = typeof c === "string" ? c : Array.isArray(c) && !c.some((b) => b.type === "tool_result") ? c.filter((b) => b.type === "text").map((b) => b.text).join("") : "";
  return text.trim() && !/^\s*(<(command-|local-command|system-reminder|task-notification|ci-monitor)|\[Request interrupted)/.test(text) ? text.trim() : "";
}

// 一次工具调用用一句短话说出来（任务行下面「它眼下在干什么」）
function aiStep(name, input) {
  const i = input || {}, n = String(name || "");
  const base = (x) => String(x || "").split("/").pop();
  const cut = (x) => { x = String(x || "").replace(/\s+/g, " ").trim(); return x.length > 36 ? x.slice(0, 35) + "…" : x; };
  if (/^(Bash|shell|local_shell_call|exec_command|shell_command)$/.test(n)) return cut(i.description || (Array.isArray(i.command) ? i.command[i.command.length - 1] : i.command || i.cmd) || "跑命令");
  if (/^(Edit|MultiEdit|NotebookEdit|apply_patch)$/.test(n)) return cut(`改 ${base(i.file_path || i.notebook_path) || "文件"}`);
  if (n === "Write") return cut(`写 ${base(i.file_path)}`);
  if (n === "Read") return cut(`读 ${base(i.file_path)}`);
  if (n === "Grep" || n === "Glob") return cut(`找 ${i.pattern || ""}`);
  if (n === "Agent" || n === "Task") return cut(`派出去：${i.description || ""}`);
  if (n === "WebSearch") return cut(`搜 ${i.query || ""}`);
  if (n === "WebFetch") return "读网页";
  if (n === "Skill") return cut(`用技能 ${i.skill || ""}`);
  return cut(n.startsWith("mcp__") ? n.split("__").pop() : n);
}
// Agent 自己列的待办做到第几步：[[状态, 这一步叫什么]…] → { done, total, cur }
const todoOf = (pairs) => {
  if (!pairs.length) return null;
  const cur = (pairs.find(([st]) => st === "in_progress") || [])[1] || "";
  return { done: pairs.filter(([st]) => st === "completed").length, total: pairs.length, cur: String(cur).replace(/\s+/g, " ").slice(0, 36) };
};

class AiUsage {
  constructor(cfg) {
    this.cfg = cfg;
    this.live = new Map();    // 会话号 -> { agent, at, state, step, todo }：这个会话眼下在干什么，只在内存里（见 liveOf）
    this.files = new Map();   // path -> { size, offset, days: Map(key -> { sess: Map(sid -> {proj, ts[], text}), prompts }), msgs: Map(id -> 用量), titles: Map(sid -> 标题) }
    this.titles = new Map();  // Codex 的会话标题（不在会话文件里，另外读）
    this.subs = new Map();    // 会话号 -> Map(agentId -> 子代理)：这个会话派出去的 subagent，见 subOf
  }

  // ---- Claude Code 的 subagent ----
  // 会话派一个 subagent，日志另起一个文件：<会话号>/subagents/agent-<agentId>.jsonl，每行 isSidechain、sessionId 还是父会话的；
  // 旁边的 agent-<agentId>.meta.json 写着 { description, agentType, requestShape: foreground / background }。
  // 在跑 / 跑完看它自己最后一行：最后一条回复 end_turn 了就是跑完；后台派的跑完、出错、被停掉，父会话还会收到一条
  // <task-notification>（<status>completed / failed / killed</status>），按那条为准。token 和会话一样算产出 + 读入
  subOf(sid, id) {
    let m = this.subs.get(sid);
    if (!m) this.subs.set(sid, m = new Map());
    let r = m.get(id);
    if (!r) m.set(id, r = { id, desc: "", type: "", bg: false, start: 0, at: 0, state: "run", step: "", end: "", endAt: 0, tok: new Map() });
    return r;
  }
  subsOf(sid) {
    return [...(this.subs.get(sid) || new Map()).values()].filter((r) => r.start).sort((a, b) => a.start - b.start);
  }
  async subMeta(p, r) {
    try {
      const m = JSON.parse(await require("fs").promises.readFile(p.replace(/\.jsonl$/, ".meta.json"), "utf8"));
      r.desc = String(m.description || ""); r.type = String(m.agentType || ""); r.bg = m.requestShape === "background";
    } catch (e) { /* 老版本没有 meta：描述等父会话的通知或者干脆不写 */ }
  }
  subLine(fc, d, ms) {
    const r = this.subOf(fc.sid, fc.sub);
    if (!r.start || ms < r.start) r.start = ms;
    if (ms < r.at) return;
    r.at = ms;
    if (r.end && ms > r.endAt) r.end = "";   // 结束以后又动了：父会话给它续了一句话
    const c = d.message && d.message.content;
    // 新版的 subagent 用 SubagentHandback 把报告交回去：交了就算跑完，后面那条「已送达」的工具结果不算又动了
    if (d.type === "user") { if (!r.end && !r.handed) r.state = "run"; return; }
    const stop = d.message && d.message.stop_reason;
    const tools = (Array.isArray(c) ? c : []).filter((b) => b.type === "tool_use");
    if (tools.length) r.handed = tools.some((b) => b.name === "SubagentHandback");
    if (!r.end) r.state = r.handed || stop === "end_turn" || stop === "stop_sequence" ? "done" : "run";
    for (const b of tools) if (b.name !== "SubagentHandback") r.step = aiStep(b.name, b.input);
    const u = d.message && d.message.usage;
    if (u && d.message.id) r.tok.set(d.message.id, (u.output_tokens || 0) + (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0));
  }
  // 父会话收到的「后台任务结束了」：只管 subagent 的（后台命令也发这种通知，没有对应子代理的不管）
  subNotice(sid, text, ms) {
    const id = (/<task-id>([^<]+)<\/task-id>/.exec(text) || [])[1], st = (/<status>([^<]+)<\/status>/.exec(text) || [])[1];
    if (!id || !st) return;
    const known = this.subs.get(sid) && this.subs.get(sid).get(id), sum = /<summary>Agent "([^"]*)"/.exec(text);
    if (!known && !sum) return;
    const r = this.subOf(sid, id);
    if (!r.desc && sum) r.desc = sum[1];
    if (!r.start) r.start = ms;
    if (ms < r.endAt) return;
    r.end = st; r.endAt = ms; r.at = Math.max(r.at, ms);
    r.state = st === "completed" ? "done" : "fail";
  }
  // 会话自己的那个日志文件（不是它的 subagent 文件，也不是抄了它历史的 side chat）
  fileOf(sid) {
    for (const [p, fc] of this.files) if (fc.agent === "claude" && !fc.sub && fc.id === sid) return p;
    return "";
  }
  // 父会话目录下新冒出来的 subagent 文件：轮询时找一下（全量扫描一分钟才一趟，等不及）
  async watchNew(sids) {
    const fs = require("fs"), path = require("path"), touched = new Set();
    for (const sid of sids) {
      const p = this.fileOf(sid);
      if (!p) continue;
      const want = [];
      try { for (const f of await fs.promises.readdir(path.join(path.dirname(p), sid, "subagents"))) if (/^agent-.+\.jsonl$/.test(f)) want.push(path.join(path.dirname(p), sid, "subagents", f)); } catch (e) { /* 没派过 */ }
      for (const q of want) {
        if (this.files.has(q)) continue;
        let st;
        try { st = await fs.promises.stat(q); } catch (e) { continue; }
        await this.readNew(q, "claude", st, touched);
      }
    }
    return touched;
  }

  // [目录, 哪个 Agent]；只给设置里开着的那几个 Agent 的目录，关掉的不读
  static roots(cfg) {
    const os = require("os"), path = require("path");
    const home = os.homedir();
    const r = [[path.join(home, ".claude/projects"), "claude"], [path.join(home, ".config/claude/projects"), "claude"]];
    for (const d of (process.env.CLAUDE_CONFIG_DIR || "").split(",").filter(Boolean)) r.push([path.join(d, "projects"), "claude"]);
    // Codex 归档一个会话，是把它的文件从 sessions 挪进 archived_sessions：两边都读，归档了的会话历史才不会断
    r.push([path.join(codexHome(), "sessions"), "codex"], [path.join(codexHome(), "archived_sessions"), "codex"], [path.join(home, ".workbuddy/projects"), "workbuddy"]);
    const on = new Set(aiOn(cfg)), seen = new Set();
    return r.filter(([d, a]) => on.has(a) && !seen.has(d) && seen.add(d));
  }

  // 在 Codex 里归档了哪些会话：archived_sessions 里的文件名带着会话号
  static async codexArchived() {
    const out = new Set();
    let names = [];
    try { names = await require("fs").promises.readdir(require("path").join(codexHome(), "archived_sessions")); } catch (e) { /* 没归档过 */ }
    for (const f of names) { const m = /([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/.exec(f); if (m) out.add(m[1]); }
    return out;
  }

  // Codex 的会话标题在 ~/.codex/session_index.jsonl：一行一个 { id, thread_name }，改名就再追加一行。没起过名的会话这里没有
  async codexTitles() {
    const fs = require("fs"), p = require("path").join(codexHome(), "session_index.jsonl");
    try {
      const st = await fs.promises.stat(p);
      if (st.mtimeMs === this._idxAt) return;
      this._idxAt = st.mtimeMs;
      for (const line of (await fs.promises.readFile(p, "utf8")).split("\n")) {
        if (!line) continue;
        try { const d = JSON.parse(line); if (d.id && d.thread_name) this.titles.set(d.id, String(d.thread_name)); } catch (e) { /* 正在写的半截行 */ }
      }
    } catch (e) { /* 没有这个文件 */ }
  }

  // 会话眼下的状态，任务行下面的进度条「监听」的就是它：
  //   state = run 在跑（你刚发了话、它在调工具）/ wait 这一轮答完了，等你；step = 最近一步在干什么；
  //   todo = 它自己列的待办做到第几步（Claude 的 TodoWrite / TaskCreate、Codex 的 update_plan），没列就是 null，那就没有百分比可看
  // 续接的会话会把旧消息抄进新文件，时间比已经见过的早的不管
  liveOf(sid, agent, ms) {
    let v = this.live.get(sid);
    if (!v) this.live.set(sid, v = { agent, at: 0, state: "run", step: "", todo: null });
    if (ms < v.at) return null;
    v.at = ms;
    return v;
  }
  liveClaude(d, sid, ms) {
    const v = this.liveOf(sid, "claude", ms);
    if (!v) return;
    const c = d.message && d.message.content;
    if (d.type === "user") {
      const stopped = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("") : "";
      v.state = /^\s*\[Request interrupted/.test(stopped) ? "wait" : "run";
      return;
    }
    const stop = d.message && d.message.stop_reason;
    v.state = stop === "end_turn" || stop === "stop_sequence" ? "wait" : "run";
    for (const b of Array.isArray(c) ? c : []) {
      if (b.type !== "tool_use") continue;
      const i = b.input || {};
      if (b.name === "TodoWrite" && Array.isArray(i.todos)) v.todo = todoOf(i.todos.map((t) => [t.status, t.activeForm || t.content]));
      else if (b.name === "TaskCreate") { (v.tasks ||= { made: 0, st: new Map() }).made++; v.todo = this.taskTodo(v.tasks); }
      else if (b.name === "TaskUpdate" && i.taskId != null) { (v.tasks ||= { made: 0, st: new Map() }).st.set(String(i.taskId), i.status || v.tasks.st.get(String(i.taskId)) || ""); v.todo = this.taskTodo(v.tasks); }
      else v.step = aiStep(b.name, i);
    }
  }
  taskTodo(tk) {
    const sts = [...tk.st.values()], gone = sts.filter((x) => x === "deleted").length;
    const total = Math.max(tk.made, tk.st.size) - gone;
    return total > 0 ? { done: sts.filter((x) => x === "completed").length, total, cur: "" } : null;
  }
  liveCodex(d, p, sid, ms) {
    const v = this.liveOf(sid, "codex", ms);
    if (!v) return;
    if (d.type === "event_msg") {
      if (p.type === "task_complete" || p.type === "turn_aborted") v.state = "wait";
      else if (p.type === "task_started" || p.type === "user_message") v.state = "run";
      return;
    }
    if (p.type !== "function_call" && p.type !== "custom_tool_call" && p.type !== "local_shell_call") return;
    v.state = "run";
    let a = {};
    try { a = typeof p.arguments === "string" ? JSON.parse(p.arguments) : p.arguments || p.action || {}; } catch (e) { /* 参数不是 JSON 就只报工具名 */ }
    if (p.name === "update_plan" && Array.isArray(a.plan)) v.todo = todoOf(a.plan.map((x) => [x.status, x.step]));
    else v.step = aiStep(p.name || p.type, a);
  }

  // 把一个日志文件新追加的部分读进来（读过的不重读）
  async readNew(p, agent, st, touched) {
    const fs = require("fs"), path = require("path");
    let fc = this.files.get(p);
    // Codex / WorkBuddy 一个文件就是一个会话，文件名里带会话号
    if (!fc || st.size < fc.size) {
      this.files.set(p, fc = { size: 0, offset: 0, days: new Map(), msgs: new Map(), titles: new Map(), agent,
        sid: (/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/.exec(p) || [])[1] || path.basename(p, ".jsonl") });
      fc.id = fc.sid;   // 这个文件自己的会话号（Codex 的子线程会把 sid 换成主线程的）
      // Claude 的 subagent 文件（<会话号>/subagents/agent-<id>.jsonl）挂在父会话名下：轮询父会话时一起读
      const sm = agent === "claude" && /([0-9a-f]{8}-[0-9a-f-]{27})[\\/]subagents[\\/]agent-([^\\/]+)\.jsonl$/.exec(p);
      if (sm) { fc.sid = fc.id = sm[1]; fc.sub = sm[2]; await this.subMeta(p, this.subOf(sm[1], sm[2])); }
      // Codex 归档时文件换了位置：原来那个位置读过的那份不要了，免得同一个会话算两遍
      if (agent === "codex") for (const [q, o] of this.files) if (q !== p && o.agent === "codex" && o.id === fc.id) this.files.delete(q);
    }
    const fh = await fs.promises.open(p, "r");
    try {
      const buf = Buffer.alloc(st.size - fc.offset);
      await fh.read(buf, 0, buf.length, fc.offset);
      fc.size = st.size;
      const end = buf.lastIndexOf(10);
      if (end < 0) return;
      fc.offset += end + 1;
      const lines = buf.toString("utf8", 0, end).split("\n");
      for (let i = 0; i < lines.length; i++) {
        this.ingest(lines[i], fc, touched);
        if (i % 3000 === 2999) await new Promise((r) => setTimeout(r, 0));   // 大文件分段，别把界面卡住
      }
    } finally { await fh.close(); }
  }

  // 只看这几个会话的日志有没有新内容（任务行下面的进度条用，比整个扫一遍轻得多）。读到新东西就返回碰到的日记日，没有返回 null
  async poll(sids) {
    const fs = require("fs"), touched = await this.watchNew(sids);
    let got = touched.size > 0;
    for (const [p, fc] of [...this.files]) {
      if (!sids.has(fc.sid) && !sids.has(fc.id)) continue;
      let st;
      try { st = await fs.promises.stat(p); } catch (e) { continue; }
      if (st.size === fc.size) continue;
      await this.readNew(p, fc.agent, st, touched);
      got = true;
    }
    return got ? touched : null;
  }

  // 读 mtime >= since 的日志；读过的文件只读新追加的部分。返回这次碰到的日记日
  async scan(since = 0) {
    const fs = require("fs"), path = require("path");
    const touched = new Set();
    const walk = async (dir, depth) => {
      let ents;
      try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return []; }
      const out = [];
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && depth < 4) out.push(...await walk(p, depth + 1));
        else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
      }
      return out;
    };
    if (aiOn(this.cfg).includes("codex")) await this.codexTitles();
    for (const [root, agent] of AiUsage.roots(this.cfg)) {
      for (const p of await walk(root, 0)) {
        let st;
        try { st = await fs.promises.stat(p); } catch (e) { continue; }
        let fc = this.files.get(p);
        if (!fc && st.mtimeMs < since) continue;
        if (fc && st.size === fc.size) continue;
        await this.readNew(p, agent, st, touched);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return touched;
  }

  // 这个会话在 ms 这一刻有动静
  touchSess(fc, touched, ms, sid, cwd, app) {
    const { key, t } = aiDay(ms, this.cfg);
    touched.add(key);
    let day = fc.days.get(key);
    if (!day) fc.days.set(key, day = { sess: new Map(), prompts: 0 });
    let s = day.sess.get(sid);
    if (!s) day.sess.set(sid, s = { proj: aiProject(cwd), cwd: cwd || "", app: app || "", agent: fc.agent, ts: [], text: "" });
    s.ts.push(t);
    return { key, day, s };
  }
  addPrompt(day, s, text) {
    day.prompts++;
    if (s.text.length < 300) s.text += (s.text ? " / " : "") + text.replace(/\s+/g, " ").slice(0, 300 - s.text.length);
  }

  // WorkBuddy：~/.workbuddy/projects/<目录>/<会话号>.jsonl。message / reasoning / function_call 各一行，时间是毫秒数；
  // 用量挂在 providerData.usage 上，同一条回复的几行共用 messageId
  ingestWorkbuddy(line, fc, touched) {
    if (!line) return;
    let d;
    try { d = JSON.parse(line); } catch (e) { return; }
    if (d.type === "ai-title") { if (d.aiTitle) fc.titles.set(fc.sid, d.aiTitle); return; }
    if (!["message", "reasoning", "function_call", "function_call_result"].includes(d.type) || !+d.timestamp) return;
    const { key, day, s } = this.touchSess(fc, touched, +d.timestamp, fc.sid, d.cwd, "workbuddy");
    const lv = this.liveOf(fc.sid, "workbuddy", +d.timestamp);
    if (lv) lv.state = d.type === "message" && d.role === "assistant" ? "wait" : "run";
    if (d.type === "message" && d.role === "user") {
      const text = (Array.isArray(d.content) ? d.content : []).filter((b) => b && b.type === "input_text").map((b) => b.text || "").join("")
        .replace(/<system-reminder[\s\S]*?<\/system-reminder>/g, "").trim();
      if (text) this.addPrompt(day, s, text);
    }
    const pd = d.providerData || {}, u = pd.usage;
    if (u && pd.messageId) {
      const cached = (u.inputTokensDetails || []).reduce((k, x) => k + ((x && x.cached_tokens) || 0), 0);
      fc.msgs.set("wb:" + pd.messageId, { key, sid: fc.sid, proj: s.proj, model: pd.requestModelName || pd.model,
        out: u.outputTokens || 0, fresh: Math.max(0, (u.inputTokens || 0) - cached), cached });
    }
  }

  // Codex：~/.codex/sessions/年/月/日/rollout-…-<会话号>.jsonl。token_count 事件给的是累计用量，取和上一次的差
  ingestCodex(line, fc, touched) {
    if (!line) return;
    let d;
    try { d = JSON.parse(line); } catch (e) { return; }
    const p = d.payload || {};
    if (d.type === "session_meta") {
      fc.cwd = p.cwd || ""; fc.app = p.originator || "codex";
      // 子线程（自动审查之类）不单算一个会话：它的时间和 token 记在主线程名下
      if (p.thread_source === "subagent" && p.parent_thread_id) fc.sid = String(p.parent_thread_id);
      return;
    }
    if (d.type === "turn_context") { if (p.model) fc.model = p.model; return; }
    const ms = Date.parse(d.timestamp);
    if (!ms || (d.type !== "event_msg" && d.type !== "response_item")) return;
    const { key, day, s } = this.touchSess(fc, touched, ms, fc.sid, fc.cwd, fc.app);
    this.liveCodex(d, p, fc.sid, ms);
    if (d.type === "response_item" && p.type === "message" && p.role === "user") {
      const text = (Array.isArray(p.content) ? p.content : []).filter((b) => b && b.type === "input_text").map((b) => b.text || "").join("").trim();
      if (text && !text.startsWith("<")) this.addPrompt(day, s, text);   // < 开头的是环境说明，不是你敲的
    }
    const t = d.type === "event_msg" && p.type === "token_count" && p.info && p.info.total_token_usage;
    if (t) {
      const prev = fc.tot || { out: 0, fresh: 0, cached: 0 };
      const cur = { out: t.output_tokens || 0, fresh: Math.max(0, (t.input_tokens || 0) - (t.cached_input_tokens || 0)), cached: t.cached_input_tokens || 0 };
      const m = { key, sid: fc.sid, proj: s.proj, model: fc.model, out: Math.max(0, cur.out - prev.out), fresh: Math.max(0, cur.fresh - prev.fresh), cached: Math.max(0, cur.cached - prev.cached) };
      if (m.out || m.fresh || m.cached) fc.msgs.set(`codex:${fc.id || fc.sid}:${fc.msgs.size}`, m);
      fc.tot = cur;
    }
  }

  ingest(line, fc, touched) {
    if (fc.agent === "workbuddy") return this.ingestWorkbuddy(line, fc, touched);
    if (fc.agent === "codex") return this.ingestCodex(line, fc, touched);
    // 父会话正忙时，subagent 的结束通知先进排队（queue-operation），再作为附件（queued_command）塞进下一轮，不是 user 行
    if (line && line.indexOf("<task-notification>") >= 0 && line.indexOf('"type":"user"') < 0 && line.indexOf('"isSidechain":true') < 0) {
      let q;
      try { q = JSON.parse(line); } catch (e) { return; }
      const text = q.type === "queue-operation" && q.operation === "enqueue" ? q.content : q.attachment && q.attachment.type === "queued_command" ? q.attachment.prompt : "";
      if (typeof text === "string" && text.startsWith("<task-notification>") && q.sessionId) this.subNotice(q.sessionId, text, Date.parse(q.timestamp) || 0);
      return;
    }
    if (!line || (line.indexOf('"type":"assistant"') < 0 && line.indexOf('"type":"user"') < 0 && line.indexOf('"type":"custom-title"') < 0)) return;
    let d;
    try { d = JSON.parse(line); } catch (e) { return; }
    if (d.type === "custom-title") { if (d.customTitle) fc.titles.set(d.sessionId, d.customTitle); return; }
    if (d.type !== "assistant" && d.type !== "user") return;
    const ms = Date.parse(d.timestamp);
    if (!ms) return;
    const { key, t } = aiDay(ms, this.cfg);
    touched.add(key);
    let day = fc.days.get(key);
    if (!day) fc.days.set(key, day = { sess: new Map(), prompts: 0 });
    const proj = aiProject(d.cwd);
    const sid = d.sessionId || "?";
    let s = day.sess.get(sid);
    if (!s) day.sess.set(sid, s = { proj, cwd: d.cwd || "", app: d.entrypoint || "", agent: "claude", ts: [], text: "" });
    s.ts.push(t);
    if (!d.isSidechain && !d.isMeta) this.liveClaude(d, sid, ms);
    if (fc.sub && d.isSidechain) this.subLine(fc, d, ms);
    else if (d.type === "user" && !d.isSidechain) {
      const c = d.message && d.message.content;
      if (typeof c === "string" && c.startsWith("<task-notification>")) this.subNotice(sid, c, ms);
    }
    if (d.type === "user") {
      const text = aiIsPrompt(d);
      if (text) {
        day.prompts++;
        // 留一点你发的原话：把会话对上任务、自动记日记起名字时用
        if (s.text.length < 300) s.text += (s.text ? " / " : "") + text.replace(/\s+/g, " ").slice(0, 300 - s.text.length);
      }
      return;
    }
    const u = d.message && d.message.usage;
    if (!u || !d.message.id) return;
    // 一条回复按内容块拆成好几行、每行都带 usage：按 message.id 去重，留最后一行（最完整）
    fc.msgs.set(d.message.id + ":" + (d.requestId || ""), { key, sid, proj: s.proj, model: d.message.model,
      out: u.output_tokens || 0, fresh: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), cached: u.cache_read_input_tokens || 0 });
  }

  summary(key) {
    const sess = new Map(), titles = new Map(this.titles), asked = {};
    let prompts = 0;
    for (const fc of this.files.values()) {
      for (const [sid, t] of fc.titles) titles.set(sid, t);
      const day = fc.days.get(key);
      if (!day) continue;
      prompts += day.prompts;
      asked[fc.agent || "claude"] = (asked[fc.agent || "claude"] || 0) + day.prompts;
      for (const [sid, s] of day.sess) {
        const cur = sess.get(sid);
        if (cur) { cur.ts.push(...s.ts); if (cur.text.length < 300 && s.text) cur.text += " / " + s.text; }
        else sess.set(sid, { proj: s.proj, cwd: s.cwd, app: s.app, agent: aiAgent(s), ts: [...s.ts], text: s.text, segs: [], min: 0, out: 0, fresh: 0, cached: 0 });
      }
    }
    if (!sess.size) return null;
    // by = 按 Agent 分：{ claude: { wall, agent, out, segs } }
    const res = { wall: 0, agent: 0, sessions: sess.size, prompts, calls: 0, out: 0, fresh: 0, cached: 0, segs: [], proj: {}, models: {}, list: [], by: {} };
    const spans = [];
    const union = (list) => {
      const out = [];
      for (const [a, b] of [...list].sort((x, y) => x[0] - y[0])) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
      return out;
    };
    for (const s of sess.values()) {
      s.ts.sort((a, b) => a - b);
      let a = s.ts[0], b = a + 1;
      const g = (res.by[s.agent] ||= { wall: 0, agent: 0, out: 0, segs: [], calls: 0, fresh: 0, cached: 0, prompts: asked[s.agent] || 0, models: {} });
      const push = () => {
        spans.push([a, b]); s.segs.push([a, b]); s.min += b - a; res.agent += b - a; g.agent += b - a; g.segs.push([a, b]);
        const pj = (res.proj[s.proj] ||= { min: 0, out: 0 });
        pj.min += b - a;
        (pj.agents ||= {})[s.agent] = (pj.agents[s.agent] || 0) + b - a;
      };
      for (const t of s.ts.slice(1)) {
        if (t - b <= AI_IDLE) b = Math.max(b, t);
        else { push(); a = t; b = t + 1; }
      }
      push();
    }
    spans.sort((x, y) => x[0] - y[0]);
    for (const [a, b] of spans) {
      const last = res.segs[res.segs.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b); else res.segs.push([a, b]);
    }
    res.wall = res.segs.reduce((s, [a, b]) => s + b - a, 0);
    const seen = new Set();
    for (const fc of this.files.values()) for (const [id, m] of fc.msgs) {
      if (m.key !== key || seen.has(id)) continue;   // 续接的会话会把旧消息抄进新文件，跨文件也去重
      seen.add(id);
      res.calls++; res.out += m.out; res.fresh += m.fresh; res.cached += m.cached;
      (res.proj[m.proj] ||= { min: 0, out: 0 }).out += m.out;
      const live = m.model && m.model !== "<synthetic>";
      if (sess.has(m.sid)) {
        const g = res.by[sess.get(m.sid).agent];
        const ss = sess.get(m.sid);
        ss.out += m.out; ss.fresh += m.fresh; ss.cached += m.cached; g.out += m.out; g.calls++; g.fresh += m.fresh; g.cached += m.cached;
        if (live) g.models[m.model] = (g.models[m.model] || 0) + m.out;
      }
      if (live) res.models[m.model] = (res.models[m.model] || 0) + m.out;
    }
    res.wall = Math.round(res.wall); res.agent = Math.round(res.agent);
    res.segs = res.segs.map(([a, b]) => [Math.round(a), Math.round(b)]);
    for (const p of Object.values(res.proj)) { p.min = Math.round(p.min); for (const k in p.agents || {}) p.agents[k] = Math.round(p.agents[k]); }
    for (const g of Object.values(res.by)) {
      g.segs = union(g.segs).map(([a, b]) => [Math.round(a), Math.round(b)]);
      g.wall = g.segs.reduce((k, [a, b]) => k + b - a, 0);
      g.agent = Math.round(g.agent);
    }
    // 每个会话一行：标题、开头说的话、目录、活跃的时段
    for (const [sid, s] of sess) res.list.push({ sid, agent: s.agent, dir: s.proj, cwd: s.cwd || "", app: s.app || "", title: titles.get(sid) || "", text: s.text.slice(0, 300),
      min: Math.round(s.min), out: s.out, fresh: s.fresh, cached: s.cached, segs: s.segs.map(([a, b]) => [Math.round(a), Math.round(b)]) });
    return res;
  }

  // 把碰到的日子写进汇总库；AI_FRESH_DAYS 天以前、库里已经有的日子定格不改（那时的日志可能已被 Claude Code 清掉一部分）
  merge(store, touched, force = false) {
    const t0 = new Date();
    t0.setDate(t0.getDate() - AI_FRESH_DAYS);
    const frozen = fmtKey(t0, this.cfg);
    let changed = false;
    for (const key of touched) {
      if (store.days[key] && key < frozen && !force) continue;
      const s = this.summary(key);
      if (s && JSON.stringify(s) !== JSON.stringify(store.days[key])) { store.days[key] = s; changed = true; }
    }
    return changed;
  }
}

// 几段时间合起来一共多少分钟（重叠的只算一次）
function unionMin(segs) {
  let min = 0, end = -Infinity;
  for (const [a, b] of [...segs].sort((x, y) => x[0] - y[0])) if (b > end) { min += b - Math.max(a, end); end = b; }
  return min;
}

const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
// token 消耗 = 产出 + 读入。缓存命中（每轮重读上下文）不算进去，那个数大得多，也不代表干了多少活
const tokUsed = (x) => (x ? (x.out || 0) + (x.fresh || 0) : 0);

// 一件任务做的那几段里，有哪些 Claude 会话在干活：会话的活跃时段和任务做的时段重叠 ≥ 2 分钟。
// 几条线并行时，同一个会话会同时挂在几件任务上
// 光看时间会把同时开着的无关会话也算进来，所以再看一眼内容：会话标题 / 你发的话里出现了任务名里的词（英文单词、中文两字词），就算「相关」，排在前面
function aiFor(segs, list, label = "") {
  const words = new Set([...(label.toLowerCase().match(/[a-z0-9][a-z0-9.+-]{2,}/g) || [])]);
  for (const run of label.match(/\p{Script=Han}+/gu) || []) for (let i = 0; i + 1 < run.length; i++) words.add(run.slice(i, i + 2));
  const out = [];
  for (const x of list || []) {
    let ov = 0;
    for (const [a, b] of segs || []) for (const [c, d] of x.segs || []) ov += Math.max(0, Math.min(b, d) - Math.max(a, c));
    if (ov < 2) continue;
    const hay = `${x.title || ""} ${x.text || ""}`.toLowerCase();
    let hit = 0;
    for (const w of words) if (hay.includes(w)) hit++;
    out.push({ ...x, overlap: Math.round(ov), related: words.size > 0 && hit >= Math.min(2, words.size) });
  }
  return out.sort((a, b) => b.related - a.related || b.overlap - a.overlap);
}

const shq = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;

// Claude 会话列表：看看那会儿 Claude 在做什么，一键回到那个会话。groups = [{ name, sub, list }]，一组一件任务
class AiSessionsModal extends OB.Modal {
  constructor(app, title, groups) { super(app); this.title = title; this.groups = groups; }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("naut-ai-modal");
    contentEl.createEl("h3", { text: this.title });
    contentEl.createDiv({ cls: "naut-proj-note", text: "「在 Claude 里打开」用 claude://resume 在 Claude 桌面版里打开那个会话；「在终端里继续」在会话的工作目录里运行 claude --resume（Codex 的会话是 codex resume）。WorkBuddy 的会话要回它自己的窗口里找。" });
    for (const g of this.groups) {
      if (g.name) {
        const h = contentEl.createDiv({ cls: "naut-ai-group" });
        h.createSpan({ text: g.name });
        if (g.sub) h.createSpan({ cls: "naut-muted", text: ` · ${g.sub}` });
      }
      const rel = g.list.filter((x) => x.related), weak = g.list.filter((x) => !x.related);
      if (!rel.length) contentEl.createDiv({ cls: "naut-proj-note", text: weak.length ? "没有看起来相关的会话（标题和你发的话里都没有任务名里的词）" : "这段时间里没有 Agent 会话" });
      for (const x of rel) this.session(contentEl, x);
      // 只是时间重叠的会话收起来，要看再点开
      if (weak.length) {
        const more = contentEl.createEl("details", { cls: "naut-ai-more" });
        more.createEl("summary", { text: `同一时段的其它会话（${weak.length}）` });
        for (const x of weak) this.session(more, x);
      }
    }
  }
  session(parent, x) {
    const agent = aiAgent(x);
    const box = parent.createDiv({ cls: `naut-ai-sess naut-by-${agent}` + (x.related ? "" : " is-weak") });
    const first = (x.text || "").split(" / ")[0];
    box.createDiv({ cls: "naut-ai-sess-title", text: x.title || first.slice(0, 120) || "（没有标题）" });
    if (x.title && first) box.createDiv({ cls: "naut-ai-sess-text", text: first.slice(0, 200) });
    const cli = agent === "codex" || x.app === "cli";   // 默认按钮给哪个：Codex 和终端里的 Claude Code 回终端，其余回 Claude 桌面版
    const when = x.overlap != null ? `和这件重叠 ${dur(x.overlap)}` : x.stopped ? `最后在 ${clock(x.lastAt)}` : `${clock(x.lastAt)} 还在动`;
    box.createDiv({ cls: "naut-ai-sess-meta", text: `${aiWhere(x)} · ${x.cwd || x.dir} · ${when} · 这个会话当天 ${dur(x.min)} · 消耗 ${fmtTok(tokUsed(x))} tok（产出 ${fmtTok(x.out)}${x.fresh != null ? ` · 读入 ${fmtTok(x.fresh)}` : ""}）` });
    if (agent === "workbuddy") return;
    const cmd = (x.cwd ? `cd ${shq(x.cwd)} && ` : "") + (agent === "codex" ? `codex resume ${x.sid}` : `claude --resume ${x.sid}`);
    const bar = box.createDiv({ cls: "naut-ai-sess-btns" });
    if (agent === "claude") {
      const desk = bar.createEl("button", { cls: cli ? "" : "mod-cta", text: "在 Claude 里打开" });
      desk.onclick = () => { require("child_process").execFile("/usr/bin/open", [`claude://resume?session=${x.sid}`], () => {}); this.close(); };
    }
    const term = bar.createEl("button", { cls: cli ? "mod-cta" : "", text: "在终端里继续" });
    term.onclick = () => { run("/usr/bin/osascript", ["-e", `tell application "Terminal"\nactivate\ndo script ${asStr(cmd)}\nend tell`]); this.close(); };
    bar.createEl("button", { text: "复制命令" }).onclick = async () => { await navigator.clipboard.writeText(cmd); new OB.Notice("已复制：" + cmd); };
  }
  onClose() { this.contentEl.empty(); }
}

// ⌃⌥V「现在怎样」：一眼看清这会儿在做什么、今天还排得下吗、接下来是什么。
// 上面是时刻和今天过了多少；中间三块数字是容量；下面依次是在做的（计时每秒走）、接下来、今天的成绩；最下面一排是这会儿最可能要按的
class StatusModal extends OB.Modal {
  constructor(app, plugin, data) { super(app); this.plugin = plugin; this.d = data; }
  onOpen() {
    const { contentEl, d, plugin } = this;
    this.modalEl.addClass("naut-status-modal");
    contentEl.empty();
    let i = 0;
    const rise = (el) => { el.style.setProperty("--naut-i", String(i++)); return el; };
    const go = (item) => { plugin.sound("tick"); this.close(); if (d.file) plugin.openItem(d.file, item); };
    const short = (label) => label.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1").replace(/\s*←\s*\S+\s*$/, "");

    // 时刻 + 今天过了多少
    const head = rise(contentEl.createDiv({ cls: "naut-st-head" }));
    this.clockEl = head.createDiv({ cls: "naut-st-clock", text: moment().format("HH:mm") });
    const hr = head.createDiv({ cls: "naut-st-headright" });
    hr.createDiv({ cls: "naut-st-date", text: d.date.format("M月D日 dddd") });
    const frac = Math.max(0, Math.min(1, (d.now - d.S) / (d.E - d.S)));
    hr.createDiv({ cls: "naut-st-sub", text: `${clock(d.S)} → ${d.E >= 1440 ? "次日 " : ""}${clock(d.E)} · 已过 ${Math.round(frac * 100)}%` });
    const day = rise(contentEl.createDiv({ cls: "naut-st-day" }));
    day.createDiv({ cls: "naut-st-day-fill", attr: { style: `width:${(frac * 100).toFixed(1)}%` } });
    day.createDiv({ cls: "naut-st-day-now", attr: { style: `left:${(frac * 100).toFixed(1)}%` } });

    if (!d.file) {
      rise(contentEl.createDiv({ cls: "naut-st-empty", text: `今天（${d.dayKey}）还没有日记` }));
    } else {
      // 容量：三块数字 + 一行预算
      const C = d.C;
      const tiles = rise(contentEl.createDiv({ cls: "naut-st-tiles" }));
      const tile = (label, value, tone, tip) => { const t = tiles.createDiv({ cls: `naut-st-tile is-${tone}`, attr: tip ? { "aria-label": tip } : {} }); t.createDiv({ cls: "naut-st-tile-v", text: value }); t.createDiv({ cls: "naut-st-tile-l", text: label }); };
      tile("已计划", dur(C.demand), "neutral", "没做完的待办一共还要多久");
      tile(C.status.label, dur(C.status.value), C.status.key === "remaining" ? (C.free > 0 ? "positive" : "neutral") : "warning", C.status.key === "overload" ? "已计划的比可安排的时间多出这么多" : C.status.key === "fragmented" ? "总时间够，但没有一段连续的空档放得下" : "排完已计划的以后还空着这么多");
      tile("剩余", `${C.left}%`, C.tone, "余量 ÷ 全天可安排的时间");
      rise(contentEl.createDiv({ cls: "naut-st-budget", text: `${C.burning === "available" ? "🔥 " : ""}可安排 ${dur(C.available)} / ${dur(C.totalAvailable)} · ${C.burning === "events" ? "🔥 " : ""}事件 ${dur(C.fixed)} / ${dur(C.totalFixed)}` }));

      // 在做的
      const sec = (title, n) => rise(contentEl.createDiv({ cls: "naut-st-sec" })).createSpan({ text: n != null ? `${title} ${n}` : title });
      const row = (cls, left, label, right, item) => {
        const r = rise(contentEl.createDiv({ cls: `naut-st-row ${cls}` }));
        r.createSpan({ cls: "naut-st-left", text: left });
        r.createSpan({ cls: "naut-st-label", text: label });
        const rt = r.createSpan({ cls: "naut-st-right", text: right });
        if (item) r.onclick = () => go(item);
        return rt;
      };
      this.timers = [];
      if (d.session || d.brk || d.doing.length) sec("在做", d.doing.length || null);
      if (d.session) for (const t of d.session.tasks) {
        const el = row("is-focus", "⏱", `专注 · ${short(t.label)}`, "", null);
        this.timers.push(() => el.setText(Date.now() < t.end ? `还剩 ${dur(Math.ceil((t.end - Date.now()) / 60e3))}` : "到点了"));
      }
      if (d.brk) row("is-break", breakIcon(d.brk.word), `${d.brk.word}中 · ${moment(d.brk.since).format("HH:mm")} 起`, dur(Math.max(1, Math.round((Date.now() - d.brk.since) / 60e3))), null);
      for (const x of d.doing) {
        const el = row("is-doing" + (x.auto ? " is-auto" : ""), "", short(x.item.label), "", x.item);
        if (x.since) this.timers.push(() => el.setText(elapsedText(Date.now() - x.since)));
        else el.setText(x.spent >= 1 ? `已做 ${dur(x.spent)}` : "进行中");
      }

      // 接下来（固定事件和排进去的待办，按时间）
      const upcoming = [...d.events.map((e) => ({ at: Math.max(e.start, d.now), kind: "event", item: e, right: `${clock(e.start)}–${clock(e.end)}` })),
        ...d.next.map((t) => ({ at: t.segments[t.workedN][0], kind: t.prio ? "prio" : "task", item: t, right: t.remaining < t.dur - 1 ? `剩 ${dur(t.remaining)}` : dur(t.dur) }))].sort((a, b) => a.at - b.at).slice(0, 6);
      if (upcoming.length) sec("接下来");
      for (const u of upcoming) row(`is-${u.kind}`, u.kind === "event" && u.item.start <= d.now ? "进行中" : clock(u.kind === "event" ? u.item.start : u.at), (u.item.paused ? "⏸ " : "") + short(u.item.label), u.right, u.item);
      if (d.over.length) row("is-over", "—", `排不下 ${d.over.length} 件：${d.over.slice(0, 3).map((t) => short(t.label)).join("、")}${d.over.length > 3 ? "…" : ""}`, "", d.over[0]);
      if (d.suspended.length) row("is-paused", "💤", `搁置 ${d.suspended.length} 件：${d.suspended.slice(0, 3).map((t) => short(t.label)).join("、")}${d.suspended.length > 3 ? "…" : ""}`, "", d.suspended[0]);
      if (!d.doing.length && !d.session && !upcoming.length && !d.over.length) rise(contentEl.createDiv({ cls: "naut-st-empty", text: "今天没有排着的事了" }));

      // 今天的成绩
      sec("今天");
      const chips = rise(contentEl.createDiv({ cls: "naut-st-chips" }));
      const chip = (text, cls = "") => chips.createSpan({ cls: `naut-st-chip ${cls}`, text });
      chip(`✅ 做完 ${d.done} · 还有 ${d.open}`);
      if (d.review && d.review.comparedCount) chip(`📋 偏差 ${signed(d.review.varianceMinutes)}`, d.review.varianceMinutes > 0 ? "is-over" : "");
      if (d.ai) { const c = chip(""); for (const k of Object.keys(AI_AGENTS)) if (d.ai.by && d.ai.by[k] && d.ai.by[k].wall) c.createSpan({ cls: `naut-sw naut-bg-${k}` }); c.appendText(`🤖 协作 ${dur(d.ai.wall)} · ${fmtTok(d.ai.out)} tok`); }
      if (d.games) chip(`🎮 ${dur(d.games)}`);
    }

    // 这会儿最可能要按的
    const bar = rise(contentEl.createDiv({ cls: "naut-st-btns" }));
    const btn = (text, key, fn, cta) => { const b = bar.createEl("button", { cls: cta ? "mod-cta" : "", text }); if (key) b.createSpan({ cls: "naut-kbd", text: key }); b.onclick = () => { plugin.sound("tick"); this.close(); fn(); }; };
    if (d.file && d.next.length && !d.doing.length) btn("▶ 开始下一件", plugin.hotkeyText("start-next"), () => plugin.startNext(), true);
    btn("打开螺旋", plugin.hotkeyText("open"), () => plugin.activate(), !(d.file && d.next.length && !d.doing.length));
    btn("🤖 整理进日记", plugin.hotkeyText("auto-log"), () => plugin.logNow());
    btn("Agent 会话", plugin.hotkeyText("doing-ai"), () => plugin.showDoingAi());

    const tick = () => { this.clockEl.setText(moment().format("HH:mm")); for (const f of this.timers || []) f(); };
    tick();
    this.timer = window.setInterval(tick, 1000);
  }
  onClose() { window.clearInterval(this.timer); this.contentEl.empty(); }
}

// 手填这天实际的开始（起床）/ 结束（收工）时间，和拖螺旋上的绿 / 红把手是一回事。留空 = 用设置里的默认
// 写法：10:30、10：30、1030、10点半、10点20、10；凌晨收工写 2:30 也行，算到当天夜里
function parseClockInput(s) {
  s = s.trim().replace(/\s+/g, "");
  let m;
  if (!(m = new RegExp(`^${TIME}$`).exec(s)) && !(m = /^(\d{1,2})(?:[.](\d{2}))?$/.exec(s)) && !(m = /^(\d{1,2})(\d{2})$/.exec(s))) return null;
  const min = m[2] !== undefined ? +m[2] : m[4] !== undefined ? +m[4] : 0;
  if (+m[1] > 31 || min >= 60) return null;
  return tokenMinutes(m[1], m[2], m[3], m[4]);
}

class BoundsModal extends OB.Modal {
  constructor(app, plugin, date) { super(app); this.plugin = plugin; this.date = date; }
  onOpen() {
    const { contentEl } = this;
    const cfg = this.plugin.settings;
    const dayKey = this.date.format(cfg.format);
    const b = (cfg.dayBounds || {})[dayKey] || {};
    const S = cfg.dayStart * 60, E = cfg.dayEnd * 60;
    const isToday = this.date.isSame(this.plugin.today(), "day");
    contentEl.addClass("naut-bounds-modal");
    contentEl.createEl("h3", { text: `${this.date.format("M月D日 ddd")} · 起床和收工` });
    const inputs = {};
    const row = (kind, name, def) => {
      const r = contentEl.createDiv({ cls: "naut-bounds-row" });
      r.createSpan({ cls: "naut-bounds-name", text: name });
      const inp = r.createEl("input", { type: "text", placeholder: kind === "end" ? "还没收工就空着" : `默认 ${clock(def)}` });
      inp.value = b[kind] != null ? clock(b[kind]) : "";
      inputs[kind] = inp;
      if (isToday) r.createEl("button", { text: "现在" }).onclick = () => { inp.value = moment().format("HH:mm"); inp.focus(); };
      r.createEl("button", { text: "默认" }).onclick = () => { inp.value = ""; inp.focus(); };
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); save(); } });
    };
    row("start", "☀️ 起床", S);
    row("end", "🌙 收工", E);
    contentEl.createDiv({ cls: "naut-proj-note", text: "两项都可以空着：只填起床也行，收工等真收工了再填（或者 Telegram 发「睡了」）。空着就按原来的默认算。写法：10:30、1030、10点半；凌晨收工写 2:30，算到当天夜里。" });
    const err = contentEl.createDiv({ cls: "naut-bounds-err" });
    const bar = contentEl.createDiv({ cls: "naut-ai-sess-btns" });
    const read = (kind) => {
      const v = inputs[kind].value;
      if (!v.trim()) return { t: null };
      const p = parseClockInput(v);
      if (p == null) return { bad: `看不懂「${v.trim()}」，写成 10:30 或 10点半` };
      // 起床照写的算，比螺旋起点还早就按起点记（和 Telegram「起了」一样）；收工凌晨的算到当天夜里（写 26:30 也行）
      const t = kind === "end" && p < 1440 ? normalize(p, cfg) : p;
      return { t: Math.max(S, Math.min(E, t)), clamped: t < S || t > E };
    };
    const save = async () => {
      const st = read("start"), en = read("end");
      if (st.bad || en.bad) { err.setText(st.bad || en.bad); return; }
      const s1 = st.t ?? S, e1 = en.t ?? E;
      if (e1 - s1 < 30) { err.setText(`收工 ${clock(e1)} 得比起床 ${clock(s1)} 晚至少半小时`); return; }
      const all = (cfg.dayBounds ||= {});
      const nb = {};
      if (st.t != null) nb.start = st.t;
      if (en.t != null) nb.end = en.t;
      if (Object.keys(nb).length) all[dayKey] = nb; else delete all[dayKey];
      await this.plugin.saveData(cfg);
      this.plugin.refresh();
      const note = [st, en].some((x) => x.clamped) ? `（超出螺旋 ${clock(S)}–${clock(E)} 的部分按边上算）` : "";
      new OB.Notice(`${this.date.format("M/D")} ☀️ ${clock(s1)} → 🌙 ${clock(e1)}${note}`);
      this.close();
    };
    bar.createEl("button", { cls: "mod-cta", text: "保存" }).onclick = save;
    bar.createEl("button", { text: "取消" }).onclick = () => this.close();
    setTimeout(() => inputs.start.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

// ⌃⌥S 快捷面板：螺旋日程的所有操作，打几个字就能找到，右边是各自的快捷键
// 开一轮专注：只选大方向（最多 4 个）和时长，不列一条条任务。数字键 1–4 选方向，← → 换时长，↵ 开始
const DIR_COLORS = ["var(--naut-task)", "var(--naut-ai-claude)", "var(--naut-ai-workbuddy)", "var(--naut-game)"];
const DIR_MINS = [25, 50, 90];
class FocusModal extends OB.Modal {
  constructor(app, plugin, why, done) {
    super(app);
    this.plugin = plugin;
    this.why = why || {};
    this.done = done;
    this.pick = null;
  }
  onOpen() {
    const { contentEl, plugin } = this;
    const cfg = plugin.settings;
    this.modalEl.addClass("naut-focus-modal");
    const dirs = plugin.dirs();
    const stats = plugin.dirStats();
    let cur = Math.max(0, dirs.findIndex((d) => d.name === cfg.lastDir));
    let mins = DIR_MINS.includes(cfg.lastDirMinutes) ? cfg.lastDirMinutes : DIR_MINS[0];
    contentEl.createDiv({ cls: "naut-fm-title", text: "开一轮专注" });
    contentEl.createDiv({ cls: "naut-fm-sub", text: this.why.app
      ? `你在「${this.why.app}」待了 ${dur(Math.max(1, Math.round((this.why.stay || 0) / 60)))}。选一个方向，回来干活：`
      : "选这一轮的大方向就行。具体做了哪几件不用勾，Agent 会话会自动记进日记、算进用时。" });
    const grid = contentEl.createDiv({ cls: "naut-fm-grid" });
    const cards = dirs.map((d, i) => {
      const card = grid.createDiv({ cls: "naut-fm-card", attr: { style: `--c:${DIR_COLORS[i % DIR_COLORS.length]};--naut-i:${i}` } });
      card.createSpan({ cls: "naut-fm-key", text: String(i + 1) });
      card.createDiv({ cls: "naut-fm-emoji", text: d.emoji });
      card.createDiv({ cls: "naut-fm-name", text: d.name });
      card.createDiv({ cls: "naut-fm-today", text: stats[d.name] ? `今天 ${dur(stats[d.name])}` : "今天还没开始" });
      card.onclick = () => { cur = i; paint(); };
      card.ondblclick = () => go();
      return card;
    });
    const chips = contentEl.createDiv({ cls: "naut-fm-chips" });
    const chipEls = DIR_MINS.map((m) => {
      const c = chips.createEl("button", { cls: "naut-fm-chip", text: `${m} 分钟` });
      c.onclick = () => { mins = m; paint(); };
      return c;
    });
    const bar = contentEl.createDiv({ cls: "naut-fm-bar" });
    bar.createEl("button", { cls: "naut-fm-no", text: "不用了" }).onclick = () => this.close();
    const ok = bar.createEl("button", { cls: "naut-fm-go" });
    const paint = () => {
      cards.forEach((c, i) => c.toggleClass("is-on", i === cur));
      chipEls.forEach((c, i) => c.toggleClass("is-on", DIR_MINS[i] === mins));
      this.modalEl.style.setProperty("--c", DIR_COLORS[cur % DIR_COLORS.length]);
      ok.setText(`▶ ${dirs[cur].name} · ${mins} 分钟`);
    };
    const go = () => { this.pick = { dir: dirs[cur], minutes: mins }; this.close(); };
    ok.onclick = go;
    this.scope.register([], "Enter", () => { go(); return false; });
    dirs.forEach((d, i) => this.scope.register([], String(i + 1), () => { cur = i; paint(); return false; }));
    const step = (n) => { mins = DIR_MINS[(DIR_MINS.indexOf(mins) + n + DIR_MINS.length) % DIR_MINS.length]; paint(); return false; };
    this.scope.register([], "ArrowLeft", () => step(-1));
    this.scope.register([], "ArrowRight", () => step(1));
    this.scope.register([], "ArrowUp", () => { cur = (cur + dirs.length - 1) % dirs.length; paint(); return false; });
    this.scope.register([], "ArrowDown", () => { cur = (cur + 1) % dirs.length; paint(); return false; });
    paint();
  }
  onClose() {
    this.contentEl.empty();
    this.done(this.pick);
  }
}

// 选一个会话绑到任务上：最近三天有动静的，今天的在前、最近在动的在前；归档了的不列
class BindModal extends OB.FuzzySuggestModal {
  constructor(app, list, today, current, done) {
    super(app);
    this.list = list; this.today = today; this.current = current; this.done = done;
    this.setPlaceholder("绑到哪个会话…（搜标题、你发的第一句话、目录）");
  }
  getItems() { return this.list; }
  getItemText(x) {
    const first = (x.text || "").split(" / ")[0];
    const when = x.day === this.today ? clock(x.segs[x.segs.length - 1][1]) : x.day.replace(/\D+/g, "-").slice(5);
    return `${x.sid === this.current ? "🔗 " : ""}${x.title || first.slice(0, 40) || "（没有标题）"}　${aiWhere(x)} · ${x.dir} · ${when} · ${fmtTok(tokUsed(x))} tok`;
  }
  onChooseItem(x) { this.done(x); }
}

class QuickPanel extends OB.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder("螺旋日程：要做什么？");
    this.view = app.workspace.getActiveViewOfType(OB.MarkdownView);   // 打开面板前所在的编辑器（开始光标所在的任务要用）
  }
  getItems() { return this.plugin.actions().filter((a) => !a.hidden && (!a.when || a.when()) && (!a.editor || this.view)); }
  getItemText(a) { return a.name; }
  renderSuggestion(m, el) {
    el.addClass("naut-quick-item");
    el.createSpan({ text: m.item.name });
    const k = this.plugin.hotkeyText(m.item.id);
    if (k) el.createEl("kbd", { cls: "naut-kbd", text: k });
  }
  onChooseItem(a) { if (a.editor) a.run(this.view.editor, this.view); else a.run(); }
}

// ---------------- 视图 ----------------

class SpiralView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.offset = 0;   // 相对今天偏移几天；0 = 跟着今天走
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "螺旋日程"; }
  getIcon() { return "orbit"; }

  async onOpen() {
    this.containerEl.children[1].addClass("naut-root");
    this._enter = true;
    await this.render();
  }

  // 换到相对今天第 n 天：重画，并放一次入场动效
  go(n) { this.stopPlay(); this.offset = n; this._enter = true; return this.render(); }

  // 回放一整天：6 秒里把「现在」从这天的开头扫到结尾，螺旋和列表按那个时刻重排，放完回到真实的现在。只是重画，不改日记
  play() {
    if (this._play != null) return;
    const cfg = this.plugin.settings;
    const b = (cfg.dayBounds || {})[this.date().format(cfg.format)] || {};
    const S = b.start ?? cfg.dayStart * 60, E = b.end ?? cfg.dayEnd * 60;
    const t0 = performance.now();
    let busy = false;
    const tick = (ts) => {
      const p = Math.min(1, (ts - t0) / 6000);
      if (p >= 1) { this.stopPlay(); this.plugin.sound("stop"); this._enter = true; this.render(); return; }   // 放完回到现在，再放一次入场
      const m = Math.floor(S + p * (E - S));
      if (m !== this._play && !busy) { this._play = m; busy = true; this.render().finally(() => { busy = false; }); }
      this._playRaf = window.requestAnimationFrame(tick);
    };
    this._play = S;
    this._playRaf = window.requestAnimationFrame(tick);
    this.plugin.sound("play");
    this.render();
  }
  stopPlay() {
    if (this._playRaf) window.cancelAnimationFrame(this._playRaf);
    this._playRaf = 0;
    this._play = null;
  }
  async onClose() { this.stopPlay(); }

  date() { return this.plugin.today().add(this.offset, "days"); }
  path() { return this.plugin.journalPath(this.date()); }

  async render() {
    const root = this.containerEl.children[1];
    const cfg = this.plugin.settings;
    const date = this.date();
    const file = this.app.vault.getAbstractFileByPath(this.path());
    const aiStore = cfg.showAi !== false ? await this.plugin.aiUsage() : null;
    const gameLog = cfg.trackGames !== false ? await this.plugin.gameLog() : null;
    root.empty();
    // 入场动效只在打开视图、换一天时放一次；每分钟的刷新和日记改动直接换成新的，不闪
    const enter = !!this._enter;
    this._enter = false;
    root.toggleClass("naut-enter", enter);
    root.toggleClass("naut-playing", this._play != null);
    root.onclick = (e) => { if (e.target && e.target.closest && e.target.closest(".naut-seg, .naut-hit, .naut-gap, .naut-slot, .naut-log, .naut-row, .naut-ai-col, .naut-proj-head")) this.plugin.sound("tick"); };
    root.removeClass("naut-has-hot");

    const head = root.createDiv({ cls: "naut-head" });
    const prev = head.createEl("button", { text: "‹" });
    head.createSpan({ cls: "naut-date", text: date.format("M月D日 ddd") });
    const next = head.createEl("button", { text: "›" });
    const today = head.createEl("button", { text: "今天" });
    prev.onclick = () => this.go(this.offset - 1);
    next.onclick = () => this.go(this.offset + 1);
    today.onclick = () => this.go(0);
    today.disabled = this.offset === 0;
    // 这天实际的起床 / 收工：点开手填（和拖螺旋上的把手一样）
    {
      const b = (cfg.dayBounds || {})[date.format(cfg.format)] || {};
      const set = b.start != null || b.end != null;
      const btn = head.createEl("button", { cls: "naut-bounds-btn" + (set ? " is-set" : ""), text: `☀️${b.start != null ? clock(b.start) : "--:--"}–🌙${b.end != null ? clock(b.end) : "--:--"}`,
        attr: { "aria-label": set ? "这天实际的起床 / 收工，点一下改" : "还没设起床 / 收工（现在是默认），点一下填" } });
      btn.onclick = () => new BoundsModal(this.app, this.plugin, date).open();
    }

    if (!(file instanceof TFile)) {
      root.createDiv({ cls: "naut-empty", text: `还没有 ${this.path()}` });
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    {
      const pb = head.createEl("button", { cls: "naut-playback", attr: { "aria-label": "回放一整天（只是重画，不改日记）" } });
      if (OB.setIcon) OB.setIcon(pb, "play"); else pb.setText("⏵");
      pb.disabled = this._play != null;
      pb.onclick = () => this.play();
    }
    const items = parseJournal(content, cfg);
    const cal = this.plugin.withCalendar(items, date);   // macOS 日历里的事件并进来当固定事件
    const dayKey = date.format(cfg.format);
    const done = cfg.doneTimes[dayKey] || {};
    const nowM = moment();
    // 回放时 this._play 是模拟的「现在」：这一天按那个时刻重排、重画，像它就是今天一样
    const playing = this._play != null;
    const now = playing ? this._play : normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    const realRel = this.offset === 0 ? 0 : this.offset < 0 ? -1 : 1;
    const dayRel = playing ? 0 : realRel;
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    const orphans = applyWork(items, cfg, dayKey, now, dayRel, bounds);   // 这天做过、但任务行已经挪走的
    // 回放：模拟的时刻以后才做的那些段先不算
    if (playing) for (const t of items) if (t.worked) { t.worked = t.worked.map(([a, b]) => [a, Math.min(b, now)]).filter(([a, b]) => b > a); t.spentToday = t.worked.reduce((k, [a, b]) => k + b - a, 0); }
    const plan = schedule(items, cfg, now, dayRel, bounds);
    const S = cfg.dayStart * 60, E = cfg.dayEnd * 60;
    const S1 = bounds.start ?? S, E1 = bounds.end ?? E;   // 这天实际的开始 / 结束

    for (const t of items) {
      if (t.kind === "task" && t.state === "done") {
        // 完成时间的来源，按可信度：DONE 后面手写的时间 > **07:37** 时间戳 > 插件看到它变成 DONE 的时刻
        const at = t.doneAt ?? t.stamp ?? done[t.label];
        // 没写时长、但记到了做的时段：时长按实际做的算（含前几天做掉的）
        const spent = t.spentToday + t.spentBefore;
        if (!t.explicitDur && !t.actual && spent >= 1) t.dur = Math.round(spent);
        t.doneAt = at ?? (t.worked.length ? t.worked.at(-1)[1] : null);
        // 画在哪：记下来的那几段「进行中」+ DONE 14:00-15:30 写的时段（任务归位插件写的只是最后一段，中断之前的几段在记录里）
        //        都没有就用完成时刻往前推一个时长
        if (t.actual && t.worked.length) {
          const all = [...t.worked, t.actual].sort((a, b) => a[0] - b[0]);
          t.segments = [];
          for (const [a, b] of all) { const last = t.segments.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else t.segments.push([a, b]); }
          t.dur = Math.round(unionMin(t.segments) + t.spentBefore);
        } else t.segments = t.actual ? [t.actual] : t.worked.length ? t.worked : at != null ? [[Math.max(S, at - t.dur), at]] : [];
      }
    }

    // 容量条
    const cap = root.createDiv({ cls: "naut-cap" });
    const total = Math.max(plan.available, plan.demand) || 1;
    const bar = cap.createDiv({ cls: "naut-bar" });
    const fit = Math.min(plan.demand, plan.available);
    bar.createDiv({ cls: "naut-bar-task", attr: { style: `width:${(fit / total) * 100}%` } });
    bar.createDiv({ cls: "naut-bar-free", attr: { style: `width:${((plan.available - fit) / total) * 100}%` } });
    if (plan.overflow) bar.createDiv({ cls: "naut-bar-over", attr: { style: `width:${(plan.overflow / total) * 100}%` } });
    // 进度条下面只留一眼能看完的几行，每行左边一格图标、文字对齐：
    //   📋 排得下吗（已计划 · 余量 / 超载 / 空档不足 · 剩余百分之几）；可安排的时间正在流逝时图标换成会闪的 🔥
    //   🤖 Agent 这一天干了多少（协作时长 · token）
    //   正在发生的事（专注中、吃饭中）各另起一行；日历读不到时说一声
    // 细账（可安排和事件两笔预算、按以往的校准、各个大方向、复习、游戏、有没有记录）都收进这两行的悬停提示，不再各占一行；
    // 全天事件下面「固定事件」里有，这里不列。鼠标划过螺旋时，上面那一行详情照旧（见 hover）
    const C = capacity(items, plan, cfg, now, dayRel, bounds);
    const row = (cls, icon, title, iconCls = "") => {
      const r = cap.createDiv({ cls: "naut-cap-row" + (cls ? " " + cls : ""), attr: title ? { title } : {} });
      r.createSpan({ cls: "naut-cap-ico" + (iconCls ? " " + iconCls : ""), text: icon });
      return r.createSpan({ cls: "naut-cap-val" });
    };
    const ai = aiStore && aiPick(aiStore.days[dayKey], cfg);
    // 这天用了哪几个 Agent（按 Claude / Codex / WorkBuddy 的固定顺序）；旧记录没分 Agent 的都算 Claude
    const agents = !ai ? [] : ai.by ? Object.keys(AI_AGENTS).filter((k) => ai.by[k] && ai.by[k].segs.length).map((k) => [k, ai.by[k]]) : [["claude", { segs: ai.segs, wall: ai.wall, out: ai.out }]];
    const games = (gameLog && gameLog.days[dayKey]) || [];
    // 📝 已经过去、没有任何记录的时间（螺旋上画成斜纹）。你记的 = 事件、做完的任务、做过的时段；机器记的 = Agent 会话、游戏。今天算到现在，过去的日子算整天
    const upto = dayRel === 0 ? Math.min(Math.max(now, S1), E1) : dayRel < 0 ? E1 : S1;
    const mine = [...items.filter((i) => i.kind === "event").map((e) => [e.start, e.end]),
      ...items.filter((i) => i.kind === "task" && i.state === "done").flatMap((t) => t.segments || []),
      ...plan.queue.flatMap((t) => t.segments.slice(0, t.workedN)), ...plan.suspended.flatMap((t) => t.worked || []), ...orphans.flatMap((o) => o.segs)];
    const gaps = cfg.showUnrecorded !== false ? pastGaps(S1, E1, upto, [...mine, ...(ai ? ai.segs : []), ...games.map(([a, b]) => [a, b])]) : [];

    // 📋 这一天的细账，放在悬停提示里
    const notes = [
      `可安排 ${dur(C.available)} / ${dur(C.totalAvailable)}：从现在到收工还能安排的时间 / 全天扣掉事件以后能安排的时间`,
      `事件 ${dur(C.fixed)} / ${dur(C.totalFixed)}：还没过去的事件时间 / 全天的事件时间（重叠的只算一次）`,
      C.status.key === "overload" ? "超载：已计划的比可安排的时间多出这么多" : C.status.key === "fragmented" ? "空档不足：总时间够，但没有一段连续的空档放得下，这么多分钟没排进去" : "余量：排完已计划的以后还空着这么多",
      "剩余：余量 ÷ 全天可安排的时间",
    ];
    if (C.burning) notes.push(C.burning === "available" ? "🔥 可安排的时间正在流逝" : "🔥 事件时间正在流逝");
    // 按以往预估的准头校准一下：近 30 天整体多用 / 少用了多少
    const rv = cfg.showReview !== false && dayRel >= 0 ? this.plugin.reviewData() : null;
    if (rv && rv.n >= 10 && Math.abs(rv.ratio - 1) >= 0.15 && plan.demand >= 15) notes.push(`按以往约 ${dur(plan.demand * rv.ratio)}：近 ${rv.days} 天做完的 ${rv.n} 件里，实际用时是预估的 ${rv.ratio.toFixed(2)} 倍`);
    // 🃏 复习卡片（第二大脑的每日回顾记进日记的，每张按「复习用时」秒算）
    const reviews = items.filter(isReview);
    if (reviews.length) notes.push(`🃏 复习 ${reviews.reduce((k, t) => k + +(REVIEW_RE.exec(t.label) || [0, 0])[1], 0)} 张 · ${dur(reviews.reduce((k, t) => k + (t.dur || 0), 0))}（螺旋上的青色段）`);
    // 🎮 游戏时间（插件每分钟看一眼在不在玩，记在 game-log.json）
    if (games.length) {
      const by = {};
      for (const [a, b, n] of games) by[n] = (by[n] || 0) + b - a;
      notes.push(`🎮 游戏 ${dur(unionMin(games))}` + (Object.keys(by).length > 1 || !by.Steam ? "：" + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, m]) => `${n} ${dur(m)}`).join(" · ") : "") + "（螺旋内圈的绿线）");
    }
    if (cfg.showUnrecorded !== false && upto - S1 >= 10) {
      const past = upto - S1, len = (segs) => segs.reduce((k, [a, b]) => k + b - a, 0);
      const none = len(gaps), byMe = past - len(pastGaps(S1, E1, upto, mine));
      notes.push(`📝 已过去 ${dur(past)} · 有记录 ${dur(past - none)}（${Math.round((past - none) / past * 100)}%）· 没记录 ${dur(none)}：你记的 ${dur(byMe)}，只有机器记的 ${dur(past - none - byMe)}；没记录的画成斜纹`);
    }
    const plan1 = row("naut-cap-plan", C.burning === "available" ? "🔥" : "📋", notes.join("\n"), C.burning === "available" ? "naut-burn" : "");
    plan1.createSpan({ text: `已计划 ${dur(C.demand)} · ` });
    plan1.createSpan({ cls: C.status.key === "remaining" ? "naut-cap-ok" : "naut-over-text", text: `${C.status.label} ${dur(C.status.value)}` });
    plan1.createSpan({ cls: `naut-left is-${C.tone}`, text: ` · 剩余 ${C.left}%` });

    // 🤖 人机协作：这一天 Agent 干了多少（口径见设置里「人机协作」一节）；各个大方向也收在它的悬停提示里
    if (ai) {
      const models = Object.entries(ai.models).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${fmtTok(n)}`).join("、");
      const only = agents.length === 1 ? AI_AGENTS[agents[0][0]] : "";
      const ds = this.plugin.dirStats(dayKey), dl = this.plugin.dirs().filter((d) => ds[d.name]);
      const line = row("naut-cap-ai", "🤖", [
        `协作 ${dur(ai.wall)}：有 ${only || "Agent"} 在干活的时间，几个窗口同时开只算一次（螺旋内圈的细线，一个 Agent 一种颜色）`,
        agents.length > 1 ? "各 Agent：" + agents.map(([k, g]) => `${AI_AGENTS[k]} ${dur(g.wall)}`).join(" / ") : "",
        `${only || "Agent"} 工时 ${dur(ai.agent)}：${ai.sessions} 个会话各自的活跃时间相加${ai.agent > ai.wall * 1.1 ? `，平均 ${(ai.agent / ai.wall).toFixed(1)} 路并行` : ""}`,
        `消耗 ${fmtTok(tokUsed(ai))} tok = 产出 + 读入${agents.length > 1 ? "：" + agents.map(([k, g]) => `${AI_AGENTS[k]} ${fmtTok(tokUsed(g))}`).join(" / ") : ""}`,
        `产出 ${fmtTok(ai.out)}：${only || "Agent"} 写出来的 token（含思考），${ai.calls} 次调用`,
        `读入 ${fmtTok(ai.fresh)}：新读进来的文件、命令输出`,
        `缓存命中 ${fmtTok(ai.cached)}：每轮重读上下文，不算工作量`,
        `指令 ${ai.prompts}：你亲手发的消息`,
        models && `模型：${models}`,
        dl.length ? "🧭 各方向：" + dl.map((d) => `${d.name} ${dur(ds[d.name])}`).join(" · ") : "",
      ].filter(Boolean).join("\n"));
      line.createSpan({ text: `协作 ${dur(ai.wall)} · ${fmtTok(tokUsed(ai))} tok` });
      for (const [k] of agents) line.createSpan({ cls: `naut-sw naut-bg-${k}` });
    }
    // ⏱ 正在专注的这一轮
    const fs = this.plugin.session();
    if (fs && realRel === 0 && !playing) {
      const line = cap.createDiv({ cls: "naut-focus-line" });
      const leftOf = (t) => Math.max(0, Math.ceil((t.end - Date.now()) / 60e3));
      const one = (t) => `${t.label} ${leftOf(t) ? `还剩 ${dur(leftOf(t))}` : "到点了"}${fs.tasks.length === 1 ? ` / ${dur(t.minutes)}` : ""}${t.round > 1 ? `（第 ${t.round} 轮）` : ""}`;
      line.createSpan({ text: `⏱ ${fs.tasks.length > 1 ? `${fs.tasks.length} 条线 · ` : ""}${fs.tasks.map(one).join(" · ")}`, attr: { title: fs.tasks.map((t) => `· ${t.label}：${dur(t.minutes)} 一轮，${moment(t.end).format("HH:mm")} 到点`).join("\n") } });
      const stop = line.createEl("button", { cls: "naut-focus-stop", text: "结束", attr: { title: "提前结束这一轮：问你做完了没有" } });
      stop.onclick = () => this.plugin.askDone(fs);
    }
    // 🍚 吃饭 / 锻炼中
    const bk = cfg.breakState;
    if (bk && realRel === 0 && !playing) {
      const line = cap.createDiv({ cls: "naut-focus-line naut-break-line" });
      line.createSpan({ text: `${breakIcon(bk.word)} ${bk.word}中 · ${moment(bk.since).format("HH:mm")} 起 · ${dur(Math.max(1, Math.round((Date.now() - bk.since) / 60e3)))}${bk.keys.length ? ` · 暂停了 ${bk.keys.length} 件` : ""}`, attr: { title: bk.labels.map((l) => "· " + l).join("\n") } });
      const back = line.createEl("button", { cls: "naut-focus-stop", text: "回来了", attr: { title: "现在就问要不要切回 DOING" } });
      back.onclick = () => { bk.asking = false; this.plugin.askBack(bk); };
    }
    // 📅 日历读不到时说明原因（全天事件本身在下面「固定事件」里）
    if (cal && cal.error) row("is-error", "📅", cal.error).setText(cal.error.split("\n")[0]);

    // 鼠标划到螺旋的哪一段，这一行立刻显示那一段的时间和做的事（不等系统的悬停提示），位置固定在螺旋上方
    const hover = root.createDiv({ cls: "naut-hover" });
    const hov = (el, time, text, sub) => {
      el.addEventListener("mouseenter", () => {
        hover.empty();
        hover.createSpan({ cls: "naut-hover-time", text: time });
        hover.createSpan({ cls: "naut-hover-text", text });
        if (sub) hover.createSpan({ cls: "naut-hover-sub", text: sub });
      });
      el.addEventListener("mouseleave", () => hover.empty());
      return el;
    };
    // 细线不好瞄准：上面再叠一条看不见的粗线接鼠标
    const fat = (d, vis) => {
      const hit = svgEl("path", { d, class: "naut-hit" }, svg);
      hit.addEventListener("mouseenter", () => vis.classList.add("is-hot"));
      hit.addEventListener("mouseleave", () => vis.classList.remove("is-hot"));
      return hit;
    };

    // 螺旋
    const size = 320, c = size / 2, R0 = 146, R1 = 42;
    const ang = (t) => ((t / 60) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
    const rad = (t) => R0 - (R0 - R1) * (Math.min(Math.max(t, S), E) - S) / (E - S);
    const pt = (t, dr = 0) => [c + (rad(t) + dr) * Math.cos(ang(t)), c + (rad(t) + dr) * Math.sin(ang(t))];
    const arc = (a, b, dr = 0) => {
      a = Math.max(a, S); b = Math.min(b, E);
      if (b <= a) return null;
      // 每 2 分钟左右取一个点，匀着分：最后一小截不会特别短，线段两头切出来的口子才是正的
      const n = Math.max(1, Math.ceil((b - a) / 2));
      let d = "";
      for (let i = 0; i <= n; i++) d += (i ? " L " : "M ") + pt(a + (b - a) * i / n, dr).map((v) => v.toFixed(2)).join(" ");
      return d;
    };
    const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "naut-svg" });
    root.appendChild(svg);
    // 入场时各段按自己的时刻先后出来：从早上往夜里，跟着轨道一路画过去
    const late = (el, t) => { if (enter && el) el.style.setProperty("--naut-d", `${Math.round(60 + 640 * (Math.min(Math.max(t, S), E) - S) / (E - S))}ms`); return el; };
    // 鼠标停在螺旋的一段或列表的一行上：同一件事的线段和那一行一起亮，其余的线段淡下去
    const linked = new Map();
    const link = (item, el) => {
      const all = linked.get(item) || linked.set(item, []).get(item);
      all.push(el);
      el.addEventListener("mouseenter", () => { if (all.some((x) => x instanceof SVGElement)) root.addClass("naut-has-hot"); for (const x of all) x.classList.add("is-hot"); });
      el.addEventListener("mouseleave", () => { root.removeClass("naut-has-hot"); for (const x of all) x.classList.remove("is-hot"); });
    };
    // 这天实际开始之前、结束之后的一段画成虚线
    svgEl("path", { d: arc(S1, E1), class: "naut-track", pathLength: 1 }, svg);
    if (S1 > S) svgEl("path", { d: arc(S, S1), class: "naut-off" }, svg);
    if (E1 < E) svgEl("path", { d: arc(E1, E), class: "naut-off" }, svg);
    // 没有记录的过去：斜纹
    if (gaps.length) {
      const pid = `naut-hatch-${++hatchSeq}`;
      const pat = svgEl("pattern", { id: pid, width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, svgEl("defs", {}, svg));
      svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 7, class: "naut-hatch-stripe" }, pat);
      for (const [a, b] of gaps) {
        const d = arc(a, b);
        if (d) hov(svgEl("path", { d, class: "naut-gap", stroke: `url(#${pid})` }, svg), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, "没有记录");
      }
    }
    // 排完以后还空着的时段：鼠标划过去显示这段空档几点到几点、多长。过去的日子没有空档可用，不画
    if (dayRel >= 0) for (const [a, b] of plan.free) {
      const d = b - a >= 1 ? arc(a, b) : null;
      const cur = dayRel === 0 && a <= now && now < b;
      if (d) hov(svgEl("path", { d, class: "naut-slot" + (cur ? " is-now" : "") }, svg), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, cur ? "当前可用" : "可用空档");
    }
    for (let h = Math.ceil(S / 60); h <= E / 60; h++) {
      const [x, y] = pt(h * 60, 13);
      const tx = late(svgEl("text", { x, y, class: "naut-hour" }, svg), h * 60);
      tx.textContent = String(h % 24);
    }
    const aiName = (x) => x.title || (x.text || "").split(" / ")[0].slice(0, 40) || x.dir;
    // 内圈细线：各个 Agent 在干活的时段，一个 Agent 一圈、各用各的颜色
    agents.forEach(([k, g], lane) => {
      for (const [a, b] of g.segs) {
        const d = arc(a, Math.max(b, a + 3), -10 - 4.5 * lane);
        if (!d) continue;
        const vis = late(svgEl("path", { d, class: `naut-ai naut-by-${k}`, pathLength: 1 }, svg), a);
        // 这一段里是哪几个会话在动
        const names = (ai.list || []).filter((x) => aiAgent(x) === k && x.segs.some(([c0, c1]) => Math.min(b, c1) - Math.max(a, c0) >= 1)).sort((x, y) => y.min - x.min).map(aiName);
        hov(fat(d, vis), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, `${AI_AGENTS[k]} 在干活`, names.length ? names.slice(0, 2).join("、") + (names.length > 2 ? ` 等 ${names.length} 个会话` : "") : "");
      }
    });
    // 再往里一圈：游戏时间
    for (const [a, b, n] of games) {
      const d = arc(a, Math.max(b, a + 3), -10 - 4.5 * Math.max(1, agents.length) - 1.5);
      if (!d) continue;
      const vis = late(svgEl("path", { d, class: "naut-game", pathLength: 1 }, svg), a);
      hov(fat(d, vis), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, `🎮 ${n}`);
    }
    // 再往里一圈：复习卡片（第二大脑每日回顾记进日记的那几段），和主轨道上的复习段同一个青色
    const revN = (t) => +(REVIEW_RE.exec(t.label) || [0, 0])[1];
    const revs = items.filter(isReview);
    for (const t of revs) for (const [a, b] of t.segments || []) {
      const d = arc(a, Math.max(b, a + 3), -10 - 4.5 * Math.max(1, agents.length) - 6);
      if (!d) continue;
      const vis = late(svgEl("path", { d, class: "naut-rev", pathLength: 1 }, svg), a);
      hov(fat(d, vis), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, `🃏 复习卡片 ${revN(t)} 张`);
    }
    // 这件任务做过的那几段里，Claude 在干什么
    const aiMemo = new Map();
    const aiOf = (item) => {
      if (!ai || !ai.list || item.kind === "event" || item.cal) return [];
      if (!aiMemo.has(item)) {
        const segs = item.segs || (item.state === "done" ? item.segments : item.workedN != null ? item.segments.slice(0, item.workedN) : item.worked);
        aiMemo.set(item, aiFor(segs, ai.list, item.label));
      }
      return aiMemo.get(item);
    };
    const LANE = [0, 5, -5, 9, -9, 13];   // 并行的几件 DOING 各画一条线，沿螺旋错开一点
    const perMin = (t) => 2 * Math.PI * rad(t) / 720;   // 这一圈上一分钟有几个像素
    const drawSeg = (a, b, cls, item) => {
      // 够长的段两头各让出 0.8 像素，挨着的两段之间留一条缝；太短的不让，免得缩没了
      const k = perMin((a + b) / 2), gap = (b - a) * k > 6 ? 0.8 / k : 0;
      const d = arc(a + gap, b - gap, LANE[item.lane || 0] ?? 0);
      if (!d) return;
      const p = late(svgEl("path", { d, class: `naut-seg ${cls}`, pathLength: 1 }, svg), a);
      link(item, p);
      if (item.cal && item.cal.color) p.style.stroke = item.cal.color;   // 日历事件用日历自己的颜色
      const rel = aiOf(item).filter((x) => x.related);
      // 做这段时是哪个会话在干活；会话明细已经没了的（过了十几天），按日记里 ⏱ 那一行写的是谁记的
      hov(p, `${clock(a)}–${clock(b)} · ${dur(b - a)}`, workKey(item.label), [item.cal ? `📅 ${item.cal.calendar}` : "", rel.length ? `🤖 ${rel.map(aiName).slice(0, 2).join("、")}` : item.clock && item.clock.who ? `🤖 ${item.clock.who}` : ""].filter(Boolean).join(" · "));
      p.addEventListener("click", () => this.plugin.openItem(file, item));
    };
    for (const e of items.filter((i) => i.kind === "event")) drawSeg(e.start, e.end, e.state === "done" ? "naut-event naut-done-event" : e.prio ? "naut-prio" : "naut-event", e);
    for (const t of items.filter((i) => i.kind === "task" && i.state === "done")) for (const [a, b] of t.segments) drawSeg(a, b, isReview(t) ? "naut-done naut-review" : "naut-done", t);
    // 没做完的：做过的几段画淡一点，后面排的画实的
    for (const t of plan.queue) t.segments.forEach(([a, b], i) => drawSeg(a, b, (t.prio ? "naut-prio" : "naut-task") + (i < t.workedN ? " naut-worked" : t.doing && dayRel === 0 ? " naut-live" : ""), t));
    for (const t of plan.suspended) for (const [a, b] of t.worked || []) drawSeg(a, b, "naut-task naut-worked", t);
    for (const o of orphans) for (const [a, b] of o.segs) drawSeg(a, b, "naut-task naut-worked", o);
    for (const l of items.filter((i) => i.kind === "log")) {
      if (l.start < S || l.start > E) continue;
      const [x, y] = pt(l.start);
      hov(late(svgEl("circle", { cx: x, cy: y, r: 2.6, class: "naut-log" }, svg), l.start), clock(l.start), l.label);
    }
    if (dayRel === 0 && now >= S && now <= E) {
      const [x0, y0] = [c + 27 * Math.cos(ang(now)), c + 27 * Math.sin(ang(now))];   // 从中间的时间外面起，不压着字
      const [x1, y1] = [c + (R0 + 10) * Math.cos(ang(now)), c + (R0 + 10) * Math.sin(ang(now))];
      const g = svgEl("g", { class: "naut-now-g" }, svg);
      svgEl("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "naut-now" }, g);
      const [px, py] = pt(now);
      svgEl("circle", { cx: px, cy: py, r: 4, class: "naut-now-halo" }, g);
      svgEl("circle", { cx: px, cy: py, r: 4, class: "naut-now-dot" }, g);
    }
    // 起止把手：沿着螺旋拖 = 改这天实际的开始 / 结束时间（5 分钟一格），双击恢复默认
    const handle = (kind, t0) => {
      const [x, y] = pt(t0);
      const h = svgEl("circle", { cx: x, cy: y, r: 6, class: `naut-handle naut-handle-${kind}` }, svg);
      const name = kind === "start" ? "开始" : "结束";
      svgEl("title", {}, h).textContent = `这天实际${name} ${clock(t0)}${bounds[kind] == null ? "（默认）" : ""}\n拖动调整，双击恢复默认`;
      const label = svgEl("text", { x, y, class: "naut-handle-label" }, svg);
      const nearest = (ev) => {
        const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
        let best = t0, bd = Infinity;
        for (let t = S; t <= E; t += 5) { const [px, py] = pt(t); const d = (px - p.x) ** 2 + (py - p.y) ** 2; if (d < bd) { bd = d; best = t; } }
        return best;
      };
      let cur = t0;
      h.addEventListener("pointerdown", (ev) => { ev.preventDefault(); ev.stopPropagation(); this.plugin.dragging = true; h.setPointerCapture(ev.pointerId); });
      h.addEventListener("pointermove", (ev) => {
        if (!this.plugin.dragging || !h.hasPointerCapture(ev.pointerId)) return;
        cur = kind === "start" ? Math.min(nearest(ev), E1 - 30) : Math.max(nearest(ev), S1 + 30);
        const [nx, ny] = pt(cur);
        h.setAttribute("cx", nx); h.setAttribute("cy", ny);
        label.setAttribute("x", nx); label.setAttribute("y", ny - 11);
        label.textContent = clock(cur);
      });
      const end = () => {
        if (!this.plugin.dragging) return;
        this.plugin.dragging = false;
        if (cur !== t0) this.plugin.setBounds(dayKey, kind, cur);   // 没挪动就不重绘，不然双击会被打断
      };
      h.addEventListener("pointerup", end);
      h.addEventListener("pointercancel", end);
      h.addEventListener("lostpointercapture", end);
      h.addEventListener("dblclick", () => this.plugin.setBounds(dayKey, kind, null));
    };
    handle("start", S1);
    handle("end", E1);
    const center = svgEl("text", { x: c, y: c + 4, class: "naut-center" }, svg);
    center.textContent = dayRel === 0 ? clock(now) : date.format("M/D");
    // 中间时间下面：这天一共复习了几张卡
    const revTotal = revs.reduce((k, t) => k + revN(t), 0);
    if (revTotal) hov(svgEl("text", { x: c, y: c + 19, class: "naut-center-rev" }, svg), `${revs.length} 轮`, `🃏 这天复习了 ${revTotal} 张卡片`).textContent = `🃏 ${revTotal}`;

    // 列表
    const list = root.createDiv({ cls: "naut-list" });
    const section = (title, rows) => {
      if (!rows.length) return;
      list.createDiv({ cls: "naut-sec", text: title });
      for (const r of rows) {
        const row = list.createDiv({ cls: `naut-row ${r.cls}` });
        link(r.item, row);
        if (r.item.cal && r.item.cal.color) row.style.borderLeftColor = r.item.cal.color;
        row.createSpan({ cls: "naut-time", text: r.time });
        const lab = row.createSpan({ cls: "naut-label", text: (r.item.paused ? "⏸ " : "") + (r.item.cal ? "📅 " : "") + r.item.label,
          attr: r.item.cal ? { title: `日历：${r.item.cal.calendar}${r.item.cal.location ? " · " + r.item.cal.location : ""}` } : {} });
        const sess = aiOf(r.item);
        if (sess.length) {
          const rel = sess.filter((x) => x.related).length;
          const badge = row.createSpan({ cls: "naut-ai-badge" + (rel ? "" : " is-weak"), text: `🤖${rel || sess.length}`,
            attr: { title: `这件做的时候 Agent 在：\n${sess.map((x) => `${x.related ? "· " : "  （同时段）"}${aiName(x)}（${dur(x.overlap)}）`).join("\n")}\n点开看详情、接着那个会话做` } });
          badge.onclick = (e) => { e.stopPropagation(); new AiSessionsModal(this.app, `「${r.item.label}」期间的 Agent 会话`, [{ list: sess }]).open(); };
        }
        row.createSpan({ cls: "naut-dur", text: r.dur, attr: r.tip ? { title: r.tip } : {} });
        if (r.play) {
          const t = r.item;
          const tip = `${t.doing ? "" : "改成 DOING，"}专注 ${dur(focusMinutes(t, cfg))}${cfg.focus ? "（Raycast Focus）" : ""}，到点问你做完没有`;
          const b = row.createEl("button", { cls: "naut-play", text: "▶", attr: { title: tip } });
          b.onclick = (e) => { e.stopPropagation(); this.plugin.startTask(file, t); };
        }
        row.onclick = () => this.plugin.openItem(file, r.item);
      }
    };
    const events = items.filter((i) => i.kind === "event").sort((a, b) => a.start - b.start);
    section("固定事件", events.map((e) => ({ item: e, cls: e.state === "done" ? "is-done" : "is-event", time: `${clock(e.start)}–${clock(e.end)}`, dur: dur(e.end - e.start) })));
    // 进度：写了 40% / 1/3 按写的；没写但做过，按 已做 / 预估 估一个
    const spentOf = (t) => (t.spentToday || 0) + (t.spentBefore || 0);
    const pctOf = (t) => (t.progress != null ? Math.round(t.progress * 100) : spentOf(t) >= 1 ? Math.min(99, Math.round(spentOf(t) / (spentOf(t) + t.remaining) * 100)) : null);
    // 自动记的行没有预估时长，不显示「百分之几 · 还剩多久」，只显示已经做了多久
    const autoKeys = this.plugin.autoKeys(dayKey);
    const durText = (t) => (autoKeys.has(workKey(t.label)) && t.state === "open" ? `已做 ${dur(Math.max(1, Math.round(spentOf(t))))}` : pctOf(t) == null ? dur(t.dur) : `${pctOf(t)}% · 剩 ${dur(t.remaining)}`);
    const tipOf = (t) => (pctOf(t) == null ? "" : `预估 ${dur(t.dur)}${spentOf(t) >= 1 ? ` · 已做 ${dur(spentOf(t))}（今天 ${dur(t.spentToday)}${t.spentBefore >= 1 ? `，之前 ${dur(t.spentBefore)}` : ""}）` : ""}${t.progress != null ? ` · 进度是你写的 ${pctOf(t)}%` : ""}`);
    // 按排到的时间先后列（小任务补位到前面的空档，会排在列表里靠后的大任务前面）
    const placed = plan.queue.filter((t) => t.segments.length > t.workedN).sort((a, b) => a.segments[a.workedN][0] - b.segments[b.workedN][0]);
    section("接下来", placed.map((t) => ({
      item: t, cls: (t.prio ? "is-prio" : "is-task") + (t.doing && dayRel === 0 ? " is-doing" : ""),
      time: t.doing && dayRel === 0 ? "进行中" : clock(t.segments[t.workedN][0]) + (t.overflow ? " 起" : ""),
      dur: durText(t), tip: tipOf(t), play: realRel === 0 && !playing,
    })));
    const over = plan.queue.filter((t) => t.overflow);
    section(dayRel < 0 ? "没做完" : "排不下", over.map((t) => ({ item: t, cls: "is-over", time: "—", dur: t.segments.length > t.workedN ? `缺 ${dur(t.overflow)}` : durText(t), tip: tipOf(t) })));
    section("💤 搁置", plan.suspended.map((t) => ({ item: t, cls: "is-susp", time: "💤", dur: durText(t), tip: tipOf(t) })));
    section("做过 · 已挪走", orphans.map((o) => ({ item: o, cls: "is-done", time: `${clock(o.segs[0][0])}–${clock(o.segs.at(-1)[1])}`, dur: dur(o.segs.reduce((n, [a, b]) => n + b - a, 0)) })));
    const doneTasks = items.filter((i) => i.kind === "task" && i.state === "done").sort((a, b) => (a.doneAt ?? 1e9) - (b.doneAt ?? 1e9));
    section(`已完成 ${doneTasks.length}`, doneTasks.map((t) => ({
      item: t, cls: isReview(t) ? "is-done is-review" : "is-done",
      time: t.actual ? `${clock(t.actual[0])}–${clock(t.actual[1])}` : t.doneAt != null ? clock(t.doneAt) : "—",
      dur: dur(t.dur),
    })));

    if (ai || aiStore && realRel === 0) this.renderAi(list, aiStore, date, ai);
    if (cfg.showDayReview !== false && realRel <= 0 && !playing) this.renderDayReview(list, items, file, dayKey, realRel === 0);
    if (cfg.showReview !== false && realRel === 0) this.renderReview(list);

    // 入场时列表一行行浮上来（--naut-i = 第几行，最多错开到第 18 行）
    const stagger = () => { if (enter) Array.from(list.children).forEach((el, i) => { if (!el.style.getPropertyValue("--naut-i")) el.style.setProperty("--naut-i", String(Math.min(i, 18))); }); };
    stagger();
  }

  // 🤖 人机协作：按项目分 + 近 7 天
  renderAi(list, store, date, ai) {
    const cfg = this.plugin.settings;
    const sec = list.createDiv({ cls: "naut-sec naut-sec-ai", text: "🤖 人机协作" });
    // 手动整理一次：把今天的 Agent 会话记进日记（和自动记日记是同一件事，不用等它的间隔）
    if (date.isSame(this.plugin.today(), "day")) {
      const b = sec.createEl("button", { cls: "naut-log-now", text: "整理进日记", attr: { "aria-label": "现在把今天的 Agent 会话整理进日记：在动的记成 DOING，停了的记成 PAUSED，归档了的记成 DONE" } });
      b.onclick = async (e) => { e.stopPropagation(); b.disabled = true; b.setText("整理中…"); try { await this.plugin.logNow(); } finally { b.disabled = false; b.setText("整理进日记"); } };
      if (cfg.autoLog && this.plugin._autoErr) list.createDiv({ cls: "naut-proj-note naut-auto-err", text: `⚠ 自动记日记上一轮没问到模型：${this.plugin._autoErr}`,
        attr: { title: "给会话起名字、对上日记里的行要问一次模型，用的是本机的 claude 或 codex 命令行。可以到设置里换一个命令行，或者点「整理进日记」先用会话标题记上" } });
    }
    if (ai) {
      const rows = Object.entries(ai.proj).filter(([, p]) => p.out >= 1000 || p.min >= 2).sort((a, b) => b[1].out - a[1].out).slice(0, 5);
      for (const [name, p] of rows) {
        const main = Object.entries(p.agents || {}).sort((a, b) => b[1] - a[1])[0];
        const row = list.createDiv({ cls: `naut-row naut-ai-row naut-by-${main ? main[0] : "claude"}`, attr: main && Object.keys(p.agents).length > 1 ? { title: Object.entries(p.agents).map(([k, m]) => `${AI_AGENTS[k]} ${dur(m)}`).join(" · ") } : {} });
        row.createSpan({ cls: "naut-time", text: dur(p.min) });
        row.createSpan({ cls: "naut-label", text: name });
        row.createSpan({ cls: "naut-dur", text: fmtTok(p.out) });
        // 点一下：这个项目这天有哪几个会话，能直接回去
        row.onclick = () => {
          const sess = (ai.list || []).filter((x) => x.dir === name && x.segs && x.segs.length).sort((x, y) => y.min - x.min).map((x) => ({ ...x, related: true, stopped: true, lastAt: x.segs[x.segs.length - 1][1] }));
          if (sess.length) new AiSessionsModal(this.app, `「${name}」这天的 Agent 会话`, [{ list: sess }]).open();
        };
      }
    }
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = date.clone().subtract(i, "days");
      days.push({ d, s: aiPick(store.days[d.format(cfg.format)], cfg) });
    }
    const max = Math.max(60, ...days.map((x) => (x.s ? x.s.wall : 0)));
    const had = days.filter((x) => x.s);
    const week = list.createDiv({ cls: "naut-ai-week" });
    for (const { d, s } of days) {
      const col = week.createDiv({ cls: "naut-ai-col" + (d.isSame(date, "day") ? " is-cur" : ""), attr: { title: s ? `${d.format("M/D ddd")}  协作 ${dur(s.wall)} · 工时 ${dur(s.agent)} · 产出 ${fmtTok(s.out)} · ${s.prompts} 条指令` : `${d.format("M/D ddd")}  没用 Agent` } });
      const bar = col.createDiv({ cls: "naut-ai-bar", attr: { style: `height:${s ? Math.max(2, (s.wall / max) * 100) : 0}%` } });
      const parts = !s ? [] : s.by ? Object.keys(AI_AGENTS).filter((k) => s.by[k] && s.by[k].wall).map((k) => [k, s.by[k].wall]) : [["claude", 1]];
      for (const [k, w] of parts) bar.createDiv({ cls: `naut-ai-part naut-bg-${k}`, attr: { style: `flex-grow:${w}` } });
      col.createDiv({ cls: "naut-ai-day", text: d.format("dd") });
    }
    const sum = (k) => had.reduce((n, x) => n + x.s[k], 0);
    list.createDiv({ cls: "naut-proj-note", text: had.length ? `近 7 天：${had.length} 天在用 · 协作 ${dur(sum("wall"))} · 产出 ${fmtTok(sum("out"))} tok · 日均 ${dur(sum("wall") / 7)}` : "近 7 天还没有 Agent 会话记录" });
  }

  // 📋 当日复盘：这一天每件任务的预计和实际，逐件对照（规则见 dayReview）。默认收着，标题上带结论
  renderDayReview(list, items, file, dayKey, live) {
    const cfg = this.plugin.settings;
    const r = dayReview(items, cfg, { live, auto: this.plugin.autoKeys(dayKey) });
    if (!r.rows.length) return;
    const s = r.summary, open = cfg.dayReviewFolded === false;
    const head = list.createDiv({ cls: "naut-sec naut-proj-head naut-dayrev-head", text: `${open ? "▾" : "▸"} 📋 ${live ? "今日" : "当日"}复盘 · 已完成 ${s.completedCount}/${s.totalCount}${s.comparedCount ? ` · 偏差 ${signed(s.varianceMinutes)}` : ""}` });
    head.onclick = () => { cfg.dayReviewFolded = open; this.plugin.saveSoon(); this.render(); };
    if (!open) return;
    list.createDiv({ cls: "naut-proj-note", text: s.comparedCount ? `已对比 ${s.comparedCount} 件：预计 ${dur(s.plannedMinutes)} · 实际 ${dur(s.actualMinutes)} · 偏差 ${signed(s.varianceMinutes)}` : "还没有能对比的：做完了、也记到了实际用时的才算",
      attr: { title: "偏差 = 实际 − 预计，只算做完了、也记到了实际用时的任务，两边是同一批。在做的、停着的照样列在下面，但不影响偏差。预计没写的按默认任务时长" } });
    const NAME = { compared: "已对比", live: "进行中", paused: "已暂停", "not-tracked": "未计时", "not-started": "未开始", "no-estimate": "未预估" };
    for (const x of r.rows) {
      const row = list.createDiv({ cls: `naut-row naut-dayrev is-${x.state}` + (x.varianceMinutes > 0 ? " is-over-est" : "") });
      row.createSpan({ cls: "naut-time", text: x.state === "compared" ? signed(x.varianceMinutes) : NAME[x.state] });
      row.createSpan({ cls: "naut-label", text: x.label });
      row.createSpan({ cls: "naut-dur", text: [x.plannedMinutes != null ? `预计 ${dur(x.plannedMinutes)}` : "", x.actualMinutes > 0 ? `实际 ${dur(x.actualMinutes)}` : x.state === "not-tracked" ? "未计时" : ""].filter(Boolean).join(" · ") });
      row.onclick = () => this.plugin.openItem(file, x.item);
    }
  }
  // 📏 预估 vs 实际：近 30 天做完的、写了预估、也记到了实际用时的任务
  renderReview(list) {
    const r = this.plugin.reviewData();
    if (!r || !r.n) return;
    const cfg = this.plugin.settings;
    const open = !cfg.reviewFolded;
    const head = list.createDiv({ cls: "naut-sec naut-proj-head naut-review-head", text: `${open ? "▾" : "▸"} 📏 预估 vs 实际 · 近 ${r.days} 天` });
    head.onclick = () => { cfg.reviewFolded = open; this.plugin.saveSoon(); this.render(); };
    if (!open) return;
    const how = (x) => (Math.abs(x - 1) < 0.05 ? "基本准" : `${x > 1 ? "多用" : "少用"} ${Math.round(Math.abs(x - 1) * 100)}%`);
    list.createDiv({ cls: "naut-proj-note", text: `${r.n} 件：预估 ${dur(r.sumE)} · 实际 ${dur(r.sumA)} · 整体${how(r.ratio)}` });
    list.createDiv({ cls: "naut-proj-note", text: `估短 ${r.over} 件 · 估长 ${r.under} 件 · 差不多 ${r.n - r.over - r.under} 件（±20% 以内）· 一件一般是预估的 ${r.median.toFixed(1)} 倍`,
      attr: { title: "只算做完的、写了预估时长、也记到了实际用时（DONE 开始-结束，或者 DOING 时的计时）的任务" } });
    const row = (time, label, durText, tip, onclick) => {
      const el = list.createDiv({ cls: "naut-row naut-review-row" });
      el.createSpan({ cls: "naut-time", text: time });
      el.createSpan({ cls: "naut-label", text: label });
      el.createSpan({ cls: "naut-dur", text: durText, attr: tip ? { title: tip } : {} });
      if (onclick) el.onclick = onclick;
    };
    if (r.cats.length) list.createDiv({ cls: "naut-proj-note", text: "按标签 / 链接分：" });
    for (const c of r.cats) row(`×${c.ratio.toFixed(1)}`, c.cat, `${c.n} 件`, `预估 ${dur(c.e)} · 实际 ${dur(c.a)} · ${how(c.ratio)}`);
    if (r.worst.length) list.createDiv({ cls: "naut-proj-note", text: "估得最短的几件：" });
    for (const w of r.worst) row(`×${(w.actual / w.est).toFixed(1)}`, w.label, `${dur(w.est)}→${dur(w.actual)}`, `${w.day} · 预估 ${dur(w.est)}，实际 ${dur(w.actual)}`,
      () => { const f = this.app.vault.getAbstractFileByPath(w.path); if (f instanceof TFile) this.plugin.openLine(f, w.line); });
  }

}

// ---------------- 插件 ----------------

module.exports = class NautilusSpiral extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.states = new Map();   // path -> Map(label -> state)，用来发现「刚改成 DONE」
    this.cal = new MacCalendar();
    this.gcal = new GoogleCalendar({
      get: (id) => this.secret(`google-${id}`),
      set: (id, value) => this.secret(`google-${id}`, value),
      clientId: () => String(this.settings.googleClientId || "").trim(),
      http: async (req) => { const r = await OB.requestUrl({ ...req, throw: false }); let json = null; try { json = r.json; } catch (e) { /* 不是 JSON */ } return { status: r.status, json: json || {} }; },
      open: (url) => window.open(url),
    });
    this.core = { parseJournal, parseDuration, parseProgress, stripProgress, stripDuration, applyWork, workKey, schedule, fill, normalize };   // 给「任务提醒」插件复用
    this.saveSoon = debounce(() => this.saveData(this.settings), 1000, true);
    this.refresh = debounce(() => { if (!this.dragging) this.views().forEach((v) => v.render()); }, 300, true);   // 正在拖把手时不重绘
    this.pruneDoneTimes();
    this.aiStorePath = `${this.manifest.dir}/ai-usage.json`;
    this.gameLogPath = `${this.manifest.dir}/game-log.json`;
    this.registerInterval(window.setInterval(() => this.pollGames(), 60 * 1000));

    this.registerView(VIEW_TYPE, (leaf) => new SpiralView(leaf, this));
    this.addRibbonIcon("orbit", "螺旋日程", () => this.activate());
    // 命令和快捷面板（⌃⌥S）都从这张表来；默认快捷键都在 ⌃⌥ 下面，Obsidian 设置 → 快捷键里可以改
    let nm = (s) => s;   // 命令名
    for (const a of this.actions()) {
      const cmd = { id: a.id, name: nm(a.name) };
      if (a.key) cmd.hotkeys = [a.key];
      if (a.editor) cmd.editorCallback = (editor, view) => a.run(editor, view);
      else if (a.when) cmd.checkCallback = (check) => { if (!a.when()) return false; if (!check) a.run(); return true; };
      else cmd.callback = () => a.run();
      this.addCommand(cmd);
    }
    // 专注到点了没有：每 10 秒看一眼（用时间戳比，电脑睡眠醒来也不会漏）；上次没回答就关了 Obsidian 的，重新问
    if (this.session()) { const s = this.settings.focusSession; s.asked = false; s.noPanel = true; for (const t of s.tasks) t.asked = false; }   // 重启后不再看悬浮窗，到点照样问
    if (this.settings.breakState) this.settings.breakState.asking = false;
    this.registerInterval(window.setInterval(() => this.tickFocus(), 10 * 1000));
    this.registerInterval(window.setInterval(() => this.checkStale().catch((e) => console.error("[螺旋日程] 检查 DOING 失败", e)), 60 * 1000));
    this.registerInterval(window.setInterval(() => this.tickBreak().catch((e) => console.error("[螺旋日程] 检查回来没有失败", e)), 30 * 1000));
    // 外部脚本（~/bin/app-idle-focus.sh：在同一个 App 里待久了）叫螺旋日程来问：这一轮专注做哪几件
    //   open -g "obsidian://nautilus-focus?app=Obsidian&stay=300"
    this.registerObsidianProtocolHandler("nautilus-focus", (p) => this.suggestFocus(p.app || "", +p.stay || 0).catch((e) => console.error("[螺旋日程] 专注提议失败", e)));
    this.addSettingTab(new SpiralSettings(this.app, this));
    this.setupStatusBar();
    this.setupAgentBar();

    // 在日历里点某一天（或打开任何一篇日记），螺旋跟着切到那一天
    this.registerEvent(this.app.workspace.on("file-open", (f) => {
      if (!(f instanceof TFile) || !f.path.startsWith(this.settings.folder + "/")) return;
      const d = moment(f.basename, this.settings.format, true);
      if (!d.isValid()) return;
      const offset = d.startOf("day").diff(this.today(), "days");
      for (const v of this.views()) if (v.offset !== offset) v.go(offset);
    }));
    this.registerEvent(this.app.vault.on("modify", (f) => this.onFileChange(f)));
    // 任务状态切换的音效：全库的笔记都看（TODOseq 的任务列表、看板改的不一定是日记）
    this.kw = new Map();   // path -> kwSnapshot
    this.registerEvent(this.app.vault.on("modify", (f) => this.onAnyModify(f)));
    this.registerEditorExtension(this.kwLiveExtension());   // 编辑器里一改就响，不等写盘
    // DOING 的那一行下面的字符进度条；每 10 秒看一眼监听着的会话有没有新动静
    this.registerEditorExtension(this.lineProgressExtension());
    this.registerInterval(window.setInterval(() => this.progPoll().catch((e) => console.error("[螺旋日程] 进度条刷新失败", e)), 10 * 1000));
    this.addCommand({ id: "bind-session", name: nm("把这一行绑定到一个 Agent 会话…（进度条只听它）"), editorCallback: (editor) => this.bindSession(editor) });
    this.addCommand({ id: "unbind-session", name: nm("解除这一行和 Agent 会话的绑定"), editorCallback: (editor) => this.bindSession(editor, true) });
    this.registerEvent(this.app.workspace.on("file-open", (f) => this.kwBaseline(f)));
    this.app.workspace.onLayoutReady(() => this.app.workspace.iterateAllLeaves((l) => { if (l.view && l.view.file) this.kwBaseline(l.view.file); }));
    this.registerEvent(this.app.vault.on("create", (f) => this.onFileChange(f)));
    this.registerInterval(window.setInterval(() => this.refresh(), 60 * 1000));
    this.registerInterval(window.setInterval(() => { this.autoLogTick(); this.weeklyTick(); }, 60 * 1000));

    this.app.workspace.onLayoutReady(async () => {
      const f = this.app.vault.getAbstractFileByPath(this.journalPath(this.today()));
      if (f instanceof TFile) this.observe(f, await this.app.vault.read(f), false);
      if (!this.settings.autoOpened) {
        this.settings.autoOpened = true;
        this.saveSoon();
        this.activate();
      }
      // 启动页：今天的日记 + 左侧栏显示螺旋日程（其它插件恢复布局也在这时候，稍等一下再切，免得被盖掉）
      window.setTimeout(async () => {
        try {
          if (this.settings.openTodayOnStartup) await this.openToday(true);
          if (this.settings.revealOnStartup) await this.activate(false);
        } catch (e) { console.error("[螺旋日程] 启动页失败", e); }
      }, 600);
    });
  }


  // ---- 给 Telegram Inbox（自用版）用的：手机上问「现在该干嘛」、报「睡了 / 起了」 ----

  // 容量速览（和 KM 的 HUD 同一份内容）
  async capacityText() {
    const cfg = this.settings;
    const date = this.today();
    const dayKey = date.format(cfg.format);
    const file = this.app.vault.getAbstractFileByPath(this.journalPath(date));
    if (!(file instanceof TFile)) return `今天（${dayKey}）还没有日记`;
    const items = parseJournal(await this.app.vault.read(file), cfg);
    this.withCalendar(items, date);
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    applyWork(items, cfg, dayKey, now, 0, bounds);
    const plan = schedule(items, cfg, now, 0, bounds);
    const C = capacity(items, plan, cfg, now, 0, bounds);
    const lines = [`${C.tone === "warning" ? "⚠️ " : ""}${capSummary(C)}`, `可安排 ${dur(C.available)} / ${dur(C.totalAvailable)} · 事件 ${dur(C.fixed)} / ${dur(C.totalFixed)}`];
    const next = plan.queue.filter((t) => t.segments.length > t.workedN).sort((a, b) => a.segments[a.workedN][0] - b.segments[b.workedN][0]).slice(0, 5);
    if (next.length) lines.push("", "接下来：", ...next.map((t) => `${t.doing ? "进行中" : clock(t.segments[t.workedN][0])}  ${t.label}（${t.remaining < t.dur - 1 ? "剩 " + dur(t.remaining) : dur(t.dur)}）`));
    const over = plan.queue.filter((t) => t.overflow);
    if (over.length) lines.push("", "排不下：", ...over.map((t) => `· ${t.label}`));
    if (plan.suspended.length) lines.push("", "⏸ 挂起：" + plan.suspended.map((t) => t.label).join("、"));
    const tail = await this.dayTail(dayKey, items);
    if (tail.length) lines.push("", ...tail);
    return lines.join("\n");
  }

  // 发到 Telegram 的图文版（HTML 格式）：「?」的回复和「任务提醒」每天定时推送共用
  async telegramReport(title = "螺旋日程") {
    const cfg = this.settings;
    const date = this.today();
    const dayKey = date.format(cfg.format);
    const H = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nowM = moment();
    const head = `🌀 <b>${H(title)}</b> · ${date.format("M月D日")} 周${"日一二三四五六"[date.day()]} · ${nowM.format("HH:mm")}`;
    const file = this.app.vault.getAbstractFileByPath(this.journalPath(date));
    if (!(file instanceof TFile)) return `${head}\n\n📭 今天还没有日记`;
    const items = parseJournal(await this.app.vault.read(file), cfg);
    this.withCalendar(items, date);
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    applyWork(items, cfg, dayKey, now, 0, bounds);
    const plan = schedule(items, cfg, now, 0, bounds);
    const S = bounds.start ?? cfg.dayStart * 60, E = bounds.end ?? cfg.dayEnd * 60;

    const bar = (p, n = 10) => { const k = Math.round(Math.max(0, Math.min(1, p)) * n); return "▓".repeat(k) + "░".repeat(n - k); };
    const pct = (p) => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
    // 🕐…🕛 整点、🕜…🕧 半点
    const clockIcon = (t) => { t = ((t % 1440) + 1440) % 1440; const h = Math.floor(t / 60) % 12 || 12; return String.fromCodePoint((t % 60 >= 30 ? 0x1f55c : 0x1f550) + h - 1); };
    // 任务名：双链 / 链接只留文字，「← 2026_10_02」写成「↩ 10-02」，太长截断
    const L = (t, n = 36) => {
      let s = t.label.replace(/\s*←\s*\[*(\d{4})_(\d{2})_(\d{2})\]*/, " ↩ $2-$3")
        .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
      if ([...s].length > n) s = [...s].slice(0, n).join("") + "…";
      return (t.prio ? "‼️ " : "") + H(s);
    };
    const spent = (t) => (t.spentToday || 0) + (t.spentBefore || 0);

    const lines = [head, "━━━━━━━━━━━━━━━"];
    lines.push(`🕰 ${clock(S)} → ${E >= 1440 ? "次日 " : ""}${clock(E)}  ${bar((now - S) / (E - S))}  今天已过 ${pct((now - S) / (E - S))}`);
    const C = capacity(items, plan, cfg, now, 0, bounds);
    lines.push(`⏳ 可安排 <b>${dur(C.available)}</b> · 📋 已计划 <b>${dur(C.demand)}</b> · ` +
      `${C.status.key === "overload" ? "🔴" : C.status.key === "fragmented" ? "🟠" : "🟢"} ${C.status.label} <b>${dur(C.status.value)}</b> · 剩余 ${C.left}%`);
    const tasks = items.filter((i) => i.kind === "task" && !i.container);
    const done = tasks.filter((i) => i.state === "done");
    const openN = tasks.filter((i) => i.state === "open").length;
    lines.push(`✅ 做完 <b>${done.length}</b> · ⬜ 还剩 <b>${openN}</b>  ${bar(done.length / (done.length + openN || 1))}  ${pct(done.length / (done.length + openN || 1))}`);

    // ⭐ 正在做：专注、吃饭锻炼、DOING
    const doing = plan.queue.filter((t) => t.doing);
    const s = this.session();
    const b = cfg.breakState;
    if (doing.length || s || b) {
      lines.push("", "⭐ <b>正在做</b>");
      if (s) lines.push(`⏱ 专注中 · ${s.tasks.map((t) => `${H(t.label)} ${Date.now() < t.end ? `还剩 ${dur(Math.ceil((t.end - Date.now()) / 60e3))}` : "到点了"}`).join("；")}`);
      if (b) lines.push(`${breakIcon(b.word)} ${H(b.word)}中 · ${moment(b.since).format("HH:mm")} 起，${dur(Math.max(1, Math.round((Date.now() - b.since) / 60e3)))}`);
      for (const t of doing) {
        const p = t.progress != null ? t.progress : spent(t) / (spent(t) + t.remaining || 1);
        lines.push(`⭐ <b>${L(t)}</b>`, `      ${bar(p, 8)} ${spent(t) >= 1 ? `已做 ${dur(spent(t))} · ` : ""}剩 ${dur(t.remaining)}`);
      }
    }
    const paused = tasks.filter((t) => t.state === "open" && t.paused);
    if (paused.length) lines.push(`⏸ 暂停：${paused.map((t) => L(t, 16)).join("、")}`);

    // ⏭ 接下来（按排到的时间）
    const next = plan.queue.filter((t) => !t.doing && t.segments.length > t.workedN)
      .sort((a, c) => a.segments[a.workedN][0] - c.segments[c.workedN][0]).slice(0, 5);
    if (next.length) {
      lines.push("", "⏭ <b>接下来</b>");
      for (const t of next) {
        const at = t.segments[t.workedN][0];
        lines.push(`${clockIcon(at)} <code>${clock(at)}</code> ${L(t)} · ${t.remaining < t.dur - 1 ? `剩 ${dur(t.remaining)}` : dur(t.dur)}`);
      }
    }
    const events = items.filter((i) => i.kind === "event" && i.state !== "done" && !i.pinned && i.end > now).sort((a, c) => a.start - c.start).slice(0, 4);
    if (events.length) {
      lines.push("", "📅 <b>固定安排</b>");
      for (const e of events) lines.push(`${e.start <= now ? "🔴" : "🔔"} <code>${clock(e.start)}–${clock(e.end)}</code> ${L(e)}`);
    }
    const over = plan.queue.filter((t) => t.overflow);
    if (over.length) {
      lines.push("", `🚫 <b>排不下</b>（${over.length} 件）`);
      lines.push(...over.slice(0, 5).map((t) => `▫️ ${L(t)}`));
      if (over.length > 5) lines.push(`▫️ …还有 ${over.length - 5} 件`);
    }
    if (plan.suspended.length) lines.push("", `💤 搁置 ${plan.suspended.length} 件：${plan.suspended.slice(0, 4).map((t) => L(t, 14)).join("、")}${plan.suspended.length > 4 ? "…" : ""}`);
    const recent = done.filter((t) => t.stamp != null).sort((a, c) => c.stamp - a.stamp).slice(0, 3);
    if (recent.length) lines.push("", `🎉 刚做完：${recent.map((t) => L(t, 16)).join("、")}`);
    const tail = (await this.dayTail(dayKey, items)).slice(1);   // 第一行「做完几件」上面已经有了
    if (tail.length) lines.push("", ...tail.map(H));
    lines.push("", "<i>💬 回「?」随时看 · 「睡了」「起了」记作息</i>");
    return lines.join("\n");
  }

  // 螺旋图截成 PNG（Uint8Array）：离屏照常画一遍视图（offset = 相对今天几天，今天按日界算），把样式写进 SVG 再画到 canvas 上
  async spiralPng(offset = 0, px = 1080) {
    const host = document.body.createDiv({ cls: "naut-snap" });
    host.setAttr("style", "position:fixed;left:-10000px;top:0;width:420px;pointer-events:none;");
    host.createDiv();
    host.createDiv({ cls: "naut-root" });
    try {
      const v = Object.create(SpiralView.prototype);
      Object.assign(v, { app: this.app, plugin: this, offset, containerEl: host });
      await v.render();
      const svg = host.querySelector("svg.naut-svg");
      if (!svg) return null;
      const props = ["fill", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-dasharray", "opacity", "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline"];
      for (const el of [svg, ...svg.querySelectorAll("*")]) {
        if (el.tagName === "title") continue;
        const cs = getComputedStyle(el);
        el.setAttribute("style", props.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(";"));
      }
      svg.querySelectorAll("title").forEach((t) => t.remove());
      const bg = getComputedStyle(host.children[1]).getPropertyValue("--background-primary").trim() || "#fff";
      svg.setAttribute("width", px); svg.setAttribute("height", px);
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error("螺旋图画不出来")); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg)); });
      const pad = Math.round(px * 0.04);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = px + pad * 2;
      const g = canvas.getContext("2d");
      g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(img, pad, pad, px, px);
      const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { host.remove(); }
  }

  // 发一张今天的螺旋图，再发文字（html = Telegram 的 HTML 格式）。文字不长就直接当图片说明，一条发完；
  // 画图或发图失败就只发文字。返回 true = 发出去了
  async tgSendWithSpiral(token, chatId, text, { html = true } = {}) {
    const api = (m) => `https://api.telegram.org/bot${token}/${m}`;
    const plain = html ? text.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : text;
    const fits = [...plain].length <= 1000;   // 图片说明最多 1024 字
    let sentPhoto = false;
    try {
      const png = await this.spiralPng(0);
      if (png) {
        const boundary = "----naut" + Date.now().toString(16);
        const enc = new TextEncoder();
        const field = (k, v) => enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
        const parts = [field("chat_id", chatId)];
        if (fits && text) { parts.push(field("caption", text)); if (html) parts.push(field("parse_mode", "HTML")); }
        parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="spiral.png"\r\nContent-Type: image/png\r\n\r\n`), png, enc.encode(`\r\n--${boundary}--\r\n`));
        const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of parts) { body.set(p, o); o += p.length; }
        await OB.requestUrl({ url: api("sendPhoto"), method: "POST", contentType: `multipart/form-data; boundary=${boundary}`, body: body.buffer });
        sentPhoto = true;
        if (fits) return true;
      }
    } catch (e) { console.error("[nautilus-spiral] 螺旋图发不出去，只发文字", e); }
    if (!text) return sentPhoto;
    await OB.requestUrl({ url: api("sendMessage"), method: "POST", contentType: "application/json",
      body: JSON.stringify({ chat_id: chatId, text, ...(html ? { parse_mode: "HTML" } : {}) }) });
    return true;
  }

  // 这天的成绩单：做完几件、人机协作、游戏
  async dayTail(dayKey, items) {
    const out = [];
    const done = items.filter((i) => i.kind === "task" && i.state === "done").length;
    const open = items.filter((i) => i.kind === "task" && i.state === "open" && !i.container).length;
    out.push(`✅ 做完 ${done} 件 · 还有 ${open} 件没做完`);
    // 当日复盘：预计和实际差多少（只算做完、也记到了用时的）
    if (this.settings.showDayReview !== false) {
      const isToday = dayKey === this.today().format(this.settings.format);
      if (items.some((i) => i.kind === "task" && i.worked === undefined)) { const m = moment(); applyWork(items, this.settings, dayKey, normalize(m.hours() * 60 + m.minutes(), this.settings), isToday ? 0 : -1, (this.settings.dayBounds || {})[dayKey] || {}); }
      const s = dayReview(items, this.settings, { live: isToday, auto: this.autoKeys(dayKey) }).summary;
      if (s.comparedCount) out.push(`📋 已对比 ${s.comparedCount} 件：预计 ${dur(s.plannedMinutes)} · 实际 ${dur(s.actualMinutes)} · 偏差 ${signed(s.varianceMinutes)}`);
    }
    const ai = this.settings.showAi !== false && aiPick((await this.aiUsage()).days[dayKey], this.settings);
    if (ai) out.push(`🤖 协作 ${dur(ai.wall)} · Agent 工时 ${dur(ai.agent)} · 产出 ${fmtTok(ai.out)} tok`);
    const games = this.settings.trackGames !== false && (await this.gameLog()).days[dayKey];
    if (games && games.length) out.push(`🎮 游戏 ${dur(unionMin(games))}`);
    return out;
  }

  // 「睡了」= 把这天的结束时间设成消息发出的时刻，还开着的工作时段在那一刻收掉；「起了」= 设这天的开始时间。
  // 时间按消息发出的时刻算（ms），不是 Obsidian 收到的时刻。返回一段回执
  async markDay(kind, ms = Date.now()) {
    const cfg = this.settings;
    const S = cfg.dayStart * 60, E = cfg.dayEnd * 60;
    const d = new Date(ms);
    if (kind === "wake") {
      // 起床算在日历上的这一天；比螺旋起点（dayStart）还早就按起点记
      const dayKey = fmtKey(d, cfg);
      const t = Math.max(S, Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
      await this.setBounds(dayKey, "start", t);
      // 前一天「睡了」记下的结束时刻（凌晨的会超过 1440）→ 睡了多久
      const pe = ((cfg.dayBounds || {})[fmtKey(new Date(ms - 864e5), cfg)] || {}).end;
      const slept = pe != null ? d.getHours() * 60 + d.getMinutes() + 1440 - pe : null;
      const sleepLine = slept != null && slept >= 60 && slept <= 20 * 60 ? `😴 ${clock(pe)} 睡 → ${clock(d.getHours() * 60 + d.getMinutes())} 起，睡了 ${dur(slept)}${slept < 6 * 60 ? "，有点少" : slept >= 8 * 60 ? "，睡得挺足 👍" : ""}\n` : "";
      return `☀️ ${clock(t)} 开始\n${sleepLine}\n` + (await this.capacityText());
    }
    const { key: dayKey, t: raw } = aiDay(ms, cfg);   // 凌晨睡的算前一天
    const work = (cfg.workLog || {})[dayKey] || {};
    for (const segs of Object.values(work)) for (const seg of segs) if (seg[1] == null) seg[1] = Math.max(seg[0], Math.round(raw));
    const t = Math.min(E, Math.max(S + 30, Math.round(raw / 5) * 5));
    await this.setBounds(dayKey, "end", t);
    const file = this.app.vault.getAbstractFileByPath(`${cfg.folder}/${dayKey}.md`);
    const items = file instanceof TFile ? parseJournal(await this.app.vault.read(file), cfg) : [];
    const b = cfg.dayBounds[dayKey] || {};
    return [`🌙 ${clock(t)} 收工 · 今天 ${clock(b.start ?? S)}–${clock(t)}`, ...(await this.dayTail(dayKey, items))].join("\n");
  }

  // ---- 快捷操作：命令、默认快捷键、快捷面板共用一张表 ----
  actions() {
    const ca = (key) => ({ modifiers: ["Ctrl", "Alt"], key });
    return [
      { id: "quick-panel", name: "快捷面板（螺旋日程的所有操作）", key: ca("S"), run: () => new QuickPanel(this.app, this).open(), hidden: true },
      { id: "status", name: "现在怎样：专注、在做的、容量、接下来", key: ca("V"), run: () => this.showStatus() },
      { id: "doing-ai", name: "正在做的事的 Agent 会话", key: ca("C"), run: () => this.showDoingAi() },
      { id: "agent-panel", name: "Agent 会话面板：在跑的、在等你的（状态栏 🤖 那一格点开的那个）", key: ca("A"), run: () => {
        if (this.settings.agentStatus === false) { new OB.Notice("设置里「状态栏的 Agent 汇总」关着，先打开它"); return; }
        this.toggleAgentPop();
      } },
      { id: "start-here", name: "开始光标所在的任务（改成 DOING + 专注）", key: { modifiers: ["Mod", "Shift"], key: "Enter" }, editor: true, run: (editor, view) => this.startAtCursor(editor, view) },
      { id: "start-next", name: "开始下一件（改成 DOING + 专注）", key: ca("N"), run: () => this.startNext() },
      { id: "suggest-focus", name: "开一轮专注（选一个大方向）", key: ca("F"), run: () => this.suggestFocus("", 0) },
      { id: "weekly-dirs", name: "发一条本周方向回顾", run: async () => new OB.Notice(await this.sendWeekly(), 8000) },
      { id: "notify-test", name: "测试带按钮的系统通知（试验）", run: async () => {
        this._noNotify = 0;
        new OB.Notice("发了一条测试通知，在通知上点「收到」（横幅样式下要悬停后点「选项」）");
        const r = await this.ask("螺旋日程 · 测试通知", "看到这条就说明通了。点「收到」试试按钮", ["收到", "不用了"], 60);
        new OB.Notice(r == null ? "发不出去：系统没允许「螺旋日程」发通知。到「系统设置 → 通知 → 螺旋日程」打开「允许通知」，或者在通知中心里找到它的授权请求点「允许」。在那之前到点提醒照旧弹对话框" : r === "" ? "通知发出去了，但没点按钮（60 秒到了）" : r === "__click__" ? "收到：你点的是通知本身" : `收到：你点了「${r}」`, 10000);
      } },
      { id: "auto-log", name: "手动记日志：现在把 Agent 会话整理进今天的日记", key: ca("L"), run: () => this.logNow() },
      { id: "focus-end", name: "结束这一轮专注（问做完了没有）", key: ca("E"), when: () => !!this.session(), run: () => this.askDone(this.session()) },
      { id: "break-back", name: "吃饭 / 锻炼回来了（问要不要切回 DOING）", key: ca("B"), when: () => !!this.settings.breakState, run: () => { this.settings.breakState.asking = false; this.askBack(this.settings.breakState); } },
      { id: "review", name: "预估 vs 实际（复盘）", key: ca("R"), run: () => this.showReview() },
      { id: "open", name: "打开螺旋日程", key: ca("O"), run: () => this.activate() },
      { id: "day-bounds", name: "设置今天的起床 / 收工时间", key: ca("T"), run: () => new BoundsModal(this.app, this, this.today()).open() },
      { id: "open-today", name: "打开今天的日记（凌晨按日界算前一天）", run: () => this.openToday() },
      { id: "calendar-refresh", name: "重新读取日历（macOS 日历 / Google 日历）", run: () => { this.cal.cache.clear(); this.gcal.cals = null; this.refresh(); } },
    ];
  }

  // 某条命令现在的快捷键（自己改过的优先），显示成 ⌃⌥C
  hotkeyText(id) {
    const hm = this.app.hotkeyManager;
    const full = `${this.manifest.id}:${id}`;
    const k = (hm?.customKeys?.[full] || hm?.getDefaultHotkeys?.(full) || [])[0];
    if (!k) return "";
    const mod = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Mod: "⌘", Meta: "⌘" };
    const order = ["Ctrl", "Alt", "Shift", "Mod", "Meta"];
    return [...k.modifiers].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((m) => mod[m] || m).join("") + ({ Enter: "↵", " ": "Space" }[k.key] || k.key.toUpperCase());
  }

  // ⌃⌥V 现在怎样：这一轮专注每条线还剩多久、吃饭中、在做的、容量和接下来
  async showStatus() {
    new StatusModal(this.app, this, await this.statusData()).open();
  }

  // ⌃⌥V 面板要的东西，一次备齐
  async statusData() {
    const cfg = this.settings, date = this.today(), dayKey = date.format(cfg.format);
    const m = moment(), now = normalize(m.hours() * 60 + m.minutes(), cfg);
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    const S = bounds.start ?? cfg.dayStart * 60, E = bounds.end ?? cfg.dayEnd * 60;
    const d = { date, dayKey, now, S, E, file: this.todayFile(), session: this.session(), brk: cfg.breakState, doing: [], suspended: [], next: [], over: [], events: [], C: null, done: 0, open: 0, review: null, ai: null, gaps: null };
    if (!d.file) return d;
    const items = parseJournal(await this.app.vault.cachedRead(d.file), cfg);
    this.withCalendar(items, date);
    applyWork(items, cfg, dayKey, now, 0, bounds);
    const plan = schedule(items, cfg, now, 0, bounds);
    d.C = capacity(items, plan, cfg, now, 0, bounds);
    const auto = this.autoKeys(dayKey);
    const base = moment(dayKey, cfg.format).valueOf();
    const work = (cfg.workLog || {})[dayKey] || {};
    const open = items.filter((t) => t.kind === "task" && t.state === "open" && !t.container);
    d.doing = open.filter((t) => t.doing).map((t) => {
      const seg = (work[workKey(t.label)] || []).find((s) => s[1] == null);
      return { item: t, auto: auto.has(workKey(t.label)), since: seg ? base + seg[0] * 60e3 : null, spent: t.spentToday };
    });
    d.suspended = plan.suspended;   // 搁置的不排；暂停的（PAUSED）照常排，在「接下来」里带个 ⏸
    d.next = plan.queue.filter((t) => !t.doing && t.segments.length > t.workedN).sort((a, b) => a.segments[a.workedN][0] - b.segments[b.workedN][0]).slice(0, 5);
    d.over = plan.queue.filter((t) => t.overflow);
    d.events = items.filter((i) => i.kind === "event" && i.end > now).sort((a, b) => a.start - b.start).slice(0, 3);
    const tasks = items.filter((i) => i.kind === "task" && !i.container);
    d.done = tasks.filter((i) => i.state === "done").length;
    d.open = open.length;
    d.review = cfg.showDayReview !== false ? dayReview(items, cfg, { live: true, auto }).summary : null;
    d.ai = cfg.showAi !== false ? aiPick((await this.aiUsage()).days[dayKey], cfg) : null;
    const games = cfg.trackGames !== false ? ((await this.gameLog()).days[dayKey] || []) : [];
    d.games = games.length ? unionMin(games) : 0;
    return d;
  }

  // ⌃⌥C 正在做的事（DOING，加上这一轮专注里的）各自期间的 Claude 会话；再加上最近 15 分钟还在动、没对上任何一件的会话
  async showDoingAi() {
    const cfg = this.settings;
    const file = this.todayFile();
    if (!file) { new OB.Notice("今天还没有日记"); return; }
    if (OB.Platform?.isDesktopApp && !this._aiBusy) await this.scanAi();   // 先读一遍最新的会话日志
    const key = this.today().format(cfg.format);
    const ai = aiPick((await this.aiUsage()).days[key], cfg);
    const items = parseJournal(await this.app.vault.read(file), cfg);
    const m = moment();
    const now = normalize(m.hours() * 60 + m.minutes(), cfg);
    applyWork(items, cfg, key, now, 0, (cfg.dayBounds || {})[key] || {});
    const s = this.session();
    const inFocus = new Set(s ? s.tasks.map((t) => t.key) : []);
    const doing = items.filter((t) => t.kind === "task" && t.state === "open" && (t.doing || inFocus.has(workKey(t.label))));
    const groups = [], matched = new Set();
    for (const t of doing) {
      const list = aiFor(t.worked, ai?.list, t.label);
      for (const x of list) if (x.related) matched.add(x.sid);
      groups.push({ name: `▶ ${t.label}`, sub: t.spentToday >= 1 ? `今天做了 ${dur(t.spentToday)}` : "", list });
    }
    const live = (ai?.list || []).filter((x) => !matched.has(x.sid) && (x.segs || []).some(([, b]) => b >= now - 15))
      .map((x) => ({ ...x, related: true, lastAt: Math.max(...x.segs.map(([, b]) => b)) }));
    if (live.length) {
      const ids = new Set(live.map((x) => x.sid));
      for (const g of groups) g.list = g.list.filter((x) => x.related || !ids.has(x.sid));
      groups.push({ name: "🟢 现在还在跑、没对上哪件的会话", list: live });
    }
    if (!doing.length && !live.length) { new OB.Notice("现在没有在做的事，也没有在跑的 Agent 会话"); return; }
    new AiSessionsModal(this.app, "正在做的事 · Agent 会话", groups).open();
  }

  // ⌃⌥R 打开螺旋，展开并滚到「📏 预估 vs 实际」
  async showReview() {
    await this.activate();
    this.settings.reviewFolded = false;
    this.saveSoon();
    const v = this.views()[0];
    if (!v) return;
    v.offset = 0;
    await v.render();
    const head = v.containerEl.querySelector(".naut-review-head");
    if (head) head.scrollIntoView({ block: "start", behavior: "smooth" });
    else new OB.Notice("还没有够条件的任务：要做完、写了预估、也记到了实际用时");
  }

  // ---- 预估 vs 实际 ----

  // 复盘数据：先交缓存（同步），过期（10 分钟）了在后台重算，算完有变化再重画
  reviewData() {
    if (!this._review || Date.now() - this._review.at > 600e3) {
      if (!this._reviewBusy) {
        this._reviewBusy = true;
        this.computeReview(this.settings.reviewDays || 30)
          .then((data) => { const changed = JSON.stringify(data) !== JSON.stringify(this._review?.data); this._review = { at: Date.now(), data }; if (changed) this.refresh(); })
          .catch((e) => console.error("[螺旋日程] 预估复盘失败", e))
          .finally(() => { this._reviewBusy = false; });
      }
    }
    return this._review?.data || null;
  }

  // 近 days 天做完的任务里：写了预估（15分钟、2h）、也记到了实际用时的。实际 = DONE 开始-结束 和 DOING 时记的几段合起来（重叠只算一次），加上挪过来之前做掉的
  async computeReview(days) {
    const cfg = this.settings;
    const rows = [];
    for (let i = 0; i < days; i++) {
      const d = this.today().subtract(i, "days");
      const f = this.app.vault.getAbstractFileByPath(this.journalPath(d));
      if (!(f instanceof TFile)) continue;
      const text = await this.app.vault.cachedRead(f);
      const lines = text.split("\n");
      const key = d.format(cfg.format);
      const items = parseJournal(text, cfg);
      applyWork(items, cfg, key, 0, -1, {});
      for (const t of items) {
        if (t.kind !== "task" || t.state !== "done" || !(t.est > 0)) continue;
        const segs = [...(t.worked || []), ...(t.actual ? [t.actual] : [])];
        if (!segs.length) continue;
        const actual = Math.round(unionMin(segs) + (t.spentBefore || 0));
        if (actual < 1) continue;
        const raw = lines[t.line] || "";
        // 分类：行里的 #标签 和 [[链接]]（日记日期的链接不算）
        const cats = [...raw.matchAll(/#([^\s#\[\],，。;；:：]+)/gu)].map((m) => "#" + m[1])
          .concat([...raw.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()).filter((x) => !/^\d{4}[-_]\d{2}[-_]\d{2}$/.test(x)));
        rows.push({ day: key, path: f.path, line: t.line, label: t.label, est: t.est, actual, cats: [...new Set(cats)] });
      }
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));   // 别把界面卡住
    }
    if (!rows.length) return { n: 0, days };
    const sumE = rows.reduce((n, r) => n + r.est, 0), sumA = rows.reduce((n, r) => n + r.actual, 0);
    const ratios = rows.map((r) => r.actual / r.est).sort((a, b) => a - b);
    const byCat = new Map();
    for (const r of rows) for (const c of r.cats) { const v = byCat.get(c) || { n: 0, e: 0, a: 0 }; v.n++; v.e += r.est; v.a += r.actual; byCat.set(c, v); }
    const cats = [...byCat].filter(([, v]) => v.n >= 2).map(([cat, v]) => ({ cat, ...v, ratio: v.a / v.e }))
      .sort((x, y) => Math.abs(Math.log(y.ratio)) - Math.abs(Math.log(x.ratio))).slice(0, 5);
    const worst = rows.filter((r) => r.actual > r.est * 1.2).sort((x, y) => (y.actual - y.est) - (x.actual - x.est)).slice(0, 3);
    return { n: rows.length, days, sumE, sumA, ratio: sumA / sumE, median: ratios[Math.floor(ratios.length / 2)],
      over: rows.filter((r) => r.actual > r.est * 1.2).length, under: rows.filter((r) => r.actual < r.est * 0.8).length, cats, worst };
  }

  // 密钥（Google 的刷新令牌、客户端密钥）：放进 Obsidian 的密钥存储，那里用的是系统钥匙串，不进 data.json、不跟着库同步。
  // 给了 value 就是存（空串 = 删掉）。老版本 Obsidian 没有密钥存储，才退回 data.json 的 secrets
  secret(id, value) {
    const key = `nautilus-spiral-${id}`, store = this.app.secretStorage;
    if (store && typeof store.getSecret === "function") {
      if (value === undefined) return store.getSecret(key) || "";
      if (value) store.setSecret(key, value); else if (typeof store.deleteSecret === "function") store.deleteSecret(key); else store.setSecret(key, "");
      return value;
    }
    const bag = (this.settings.secrets ||= {});
    if (value === undefined) return bag[key] || "";
    if (value) bag[key] = value; else delete bag[key];
    this.saveSoon();
    return value;
  }
  // ---- macOS 日历 ----

  useMacCal() { return !!this.settings.calendar && !!(OB.Platform && OB.Platform.isMacOS && OB.Platform.isDesktopApp); }
  useGoogleCal() { return !!this.settings.googleCal && this.gcal.connected(); }

  // 这天的日历事件（macOS「日历」和 Google 日历，开了哪个读哪个）：先交缓存（同步），过期了在后台重读，读完有变化再重画。两个都没开返回 null
  calendarFor(date) {
    if (!this.useMacCal() && !this.useGoogleCal()) return null;
    const key = date.format("YYYY-MM-DD");
    const c = this.cal.cache.get(key);
    if (!c || Date.now() - c.at > 120000) this.loadCalendar(date.clone(), key);
    return c || null;
  }

  async loadCalendar(date, key) {
    if (this.cal.busy.has(key)) return;
    this.cal.busy.add(key);
    const prev = this.cal.cache.get(key);
    let next;
    try {
      const cfg = this.settings;
      const mid = date.clone().startOf("day").valueOf();
      const skip = new Set(splitList(cfg.calendarSkip));
      const items = [], allDay = [];
      const seen = new Set();   // 同一件事出现在好几个日历里（比如两份节假日日历）：只留一份
      const from = mid + cfg.dayStart * 60e3 * 60, to = mid + cfg.dayEnd * 60e3 * 60;
      // 两个来源各读各的，一个读不出来不耽误另一个；同一件事两边都有（比如 Google 日历也同步进了 macOS「日历」）只留一份
      const raw = [], errors = [];
      if (this.useMacCal()) try { raw.push(...await this.cal.call([from, to])); } catch (e) { errors.push(String(e.message || e)); }
      if (this.useGoogleCal()) try { raw.push(...await this.gcal.events(from, to, skip)); } catch (e) { errors.push(String(e.message || e)); }
      for (const e of raw) {
        if (skip.has(e.calendar)) continue;
        const sig = `${e.title}|${e.allDay ? "" : e.start + "-" + e.end}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        if (e.allDay) { if (e.start < mid + 864e5 && e.end > mid) allDay.push(e); continue; }   // 读的范围跨到次日凌晨，次日的全天事件不算
        // 和日记同一个坐标：这天 0 点起的分钟数，过了午夜 > 1440
        const start = Math.round((e.start - mid) / 60e3), end = Math.round((e.end - mid) / 60e3);
        if (end <= start) continue;
        items.push({ kind: "event", state: "none", label: e.title || "（无标题）", start, end, line: -1, indent: 0, prio: false, cal: e });
      }
      next = { at: Date.now(), items, allDay, ...(errors.length ? { error: errors.join("；") } : {}) };
    } catch (e) {
      console.error("[螺旋日程] 读取日历失败", e);
      next = { at: Date.now(), items: [], allDay: [], error: String(e.message || e) };
    } finally {
      this.cal.busy.delete(key);
    }
    this.cal.cache.set(key, next);
    const sig = (c) => c && JSON.stringify([c.items.map((i) => [i.label, i.start, i.end, i.cal.color]), c.allDay.map((e) => e.title), c.error]);
    if (sig(prev) !== sig(next)) this.refresh();
  }

  // 把日历事件并进日记解析出来的条目（日记里已经手写了同一件事的就不重复）。返回这天的日历缓存，没开返回 null
  withCalendar(items, date) {
    const c = this.calendarFor(date);
    if (!c) return null;
    for (const e of c.items) {
      const dup = items.some((i) => i.kind === "event" && Math.abs(i.start - e.start) <= 5 && (i.label.includes(e.label) || e.label.includes(i.label)));
      if (!dup) items.push({ ...e });
    }
    return c;
  }

  openItem(file, item) {
    if (item.cal && item.cal.url) window.open(item.cal.url);   // Google 日历的事件：在浏览器里打开它
    else if (item.cal) require("child_process").execFile("/usr/bin/open", ["-b", "com.apple.iCal"], () => {});   // macOS 日历的事件：打开「日历」App
    else this.openLine(file, item.line);
  }

  // ---- ▶ 开始做：时间记录 + 番茄钟（+ Raycast Focus） ----
  // 开始 = 这一行改成 DOING HH:MM，按条目上写的时长开一轮专注。专注中再开始别的 = 加入这一轮：几条线并行，
  // 每条线各记各的时间（三件一起做了 25 分钟，每件都记 25 分钟；一天的总时长按重叠合并算一次）。
  // 到点问做完没有：做完了 → DONE 开始-结束；再来一轮 → 同样时长再来；先停下 → PAUSED（做过的时间留在计时里）
  // 这几处，加上下面的硬规则，是螺旋日程会写日记的地方，都只改那几行

  // 进行中的这一轮专注。每条线 { key, label, path, start, minutes, end, round }：各自倒计时，哪条先到点就先单独问哪条，别的线照常走。
  // Raycast 专注同一时间只能开一段，所以只开一段，覆盖到最晚那条线到点（rcEnd）
  session() {
    const s = this.settings.focusSession;
    if (!s) return s;
    if (!s.tasks) { s.tasks = [{ key: s.key, label: s.label, path: s.path, start: s.start }]; delete s.key; delete s.label; delete s.path; }   // 旧格式
    if (!s.tasks.length) { this.settings.focusSession = null; return null; }
    for (const t of s.tasks) { t.minutes ??= s.minutes; t.end ??= s.end; t.round ??= s.round || 1; }
    s.rcEnd ??= s.end;
    s.end = Math.max(...s.tasks.map((t) => t.end));
    return s;
  }

  // 一条线
  line(path, label, minutes) {
    const now = Date.now();
    return { key: workKey(label), label, path, start: now, minutes, end: now + minutes * 60e3, round: 1 };
  }

  // 螺旋上点 ▶
  async startTask(file, item) {
    if (!item.doing) {
      const ok = await this.editTask(file.path, workKey(item.label), toDoing, item.line);
      if (!ok) { new OB.Notice(`日记里找不到「${item.label}」这一行（刚改过？），没有开始`); return; }
    }
    this.begin(file.path, item.label, focusMinutes(item, this.settings));
  }

  // 快捷键：开始光标所在的那一行（任何笔记里的列表项都行，没有关键词的当 TODO）
  startAtCursor(editor, view) {
    const n = editor.getCursor().line;
    const raw = editor.getLine(n);
    const it = parseJournal(raw, this.settings)[0];
    if (it && it.kind === "task" && it.state === "done") { new OB.Notice("这一条已经做完了"); return; }
    const doing = it && it.kind === "task" && it.state === "open" && it.doing;
    const next = doing ? raw : toDoing(raw);
    const t = parseJournal(next, this.settings)[0];
    if (!t || t.kind !== "task") { new OB.Notice("光标所在的这一行不是列表项"); return; }
    if (!doing) editor.setLine(n, next);   // 编辑器里直接改：⌘Z 一步撤销
    this.begin(view.file.path, t.label, focusMinutes(t, this.settings));
  }

  // 命令：开始螺旋上排在最前面、还没开始的那件
  async startNext() {
    const cfg = this.settings;
    const date = this.today();
    const dayKey = date.format(cfg.format);
    const file = this.app.vault.getAbstractFileByPath(this.journalPath(date));
    if (!(file instanceof TFile)) { new OB.Notice("今天还没有日记"); return; }
    const items = parseJournal(await this.app.vault.read(file), cfg);
    this.withCalendar(items, date);
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    applyWork(items, cfg, dayKey, now, 0, bounds);
    const plan = schedule(items, cfg, now, 0, bounds);
    const next = plan.queue.filter((t) => !t.doing && t.segments.length > t.workedN).sort((a, b) => a.segments[a.workedN][0] - b.segments[b.workedN][0])[0];
    if (!next) { new OB.Notice("没有排着的待办了"); return; }
    await this.startTask(file, next);
  }

  // 没在专注：开一轮；正在专注：加入这一轮，并行，按它自己的时长倒计时
  begin(path, label, minutes) {
    const cfg = this.settings;
    const key = workKey(label);
    this.touch(key);
    if (cfg.breakState) { cfg.breakState = null; this.saveData(cfg); }   // 吃完回来自己开始干活了：不用再问
    const s = this.session();
    if (s && !s.asked) {
      if (!s.tasks.some((t) => t.key === key)) { s.tasks.push(this.line(path, label, minutes)); this.extendRaycast(s); }
      this.saveData(cfg);
      new OB.Notice(`➕ ${label} 加入这一轮 · ${s.tasks.length} 条线并行 · 这一条 ${dur(minutes)}`);
      this.refresh();
      return;
    }
    this.startSession([this.line(path, label, minutes)]);
  }

  // 开一轮专注：每条线自己计时（到点问做完没有），设置里开着就同时开一段 Raycast Focus
  startSession(tasks) {
    const cfg = this.settings;
    const s = (cfg.focusSession = { tasks, start: Date.now(), rcEnd: 0, asked: false });
    this.extendRaycast(s, true);
    this.saveData(cfg);
    new OB.Notice(`▶ ${tasks.map((t) => `${t.label} ${dur(t.minutes)}${t.round > 1 ? `（第 ${t.round} 轮）` : ""}`).join(" + ")}`);
    this.refresh();
  }

  // Raycast 专注覆盖到最晚那条线到点：开一段；后来加进来的线超出了现在这段，就结束重开一段
  extendRaycast(s, fresh = false) {
    const cfg = this.settings;
    s.end = Math.max(...s.tasks.map((t) => t.end));
    if (!cfg.focus || (!fresh && s.end <= s.rcEnd + 30e3)) return;
    // raycast://focus/start?goal=…&duration=秒&categories=…&mode=block|allow（Raycast 文档里的 Focus Deeplink）
    const q = [`goal=${encodeURIComponent(s.tasks.map((t) => t.label).join(" + "))}`, `duration=${Math.max(60, Math.round((s.end - Date.now()) / 1000))}`];
    const cats = splitList(cfg.focusCategories).map((c) => c.replace(/\s+/g, "")).join(",");
    if (cats) q.push(`categories=${cats}`, `mode=${cfg.focusMode === "allow" ? "allow" : "block"}`);
    const url = "raycast://focus/start?" + q.join("&");
    if (!fresh && s.rcEnd > Date.now()) { this.openUrl("raycast://focus/complete"); window.setTimeout(() => this.openUrl(url), 1500); }
    else this.openUrl(url);
    Object.assign(s, { rcEnd: s.end, rcStart: Date.now(), panelSeen: false, miss: 0, noPanel: false });
  }

  // 每 10 秒：哪条线到点了；开着 Raycast 专注的话，看看是不是在 Raycast 里提前点了完成
  async tickFocus() {
    const s = this.session();
    if (s && !s.asked && !this._asking) {
      const due = s.tasks.find((t) => !t.asked && Date.now() >= t.end);
      if (due) { this.askLine(s, due); return; }
      // 只在 Raycast 专注这一段进行中时看悬浮窗；开始 1 分钟还没见过悬浮窗（Raycast 没开起来 / 关了悬浮窗）就不再看
      if (this.settings.focus && !s.noPanel && Date.now() < s.rcEnd) {
        if (!s.panelSeen && Date.now() - (s.rcStart || s.start) > 60e3) s.noPanel = true;
        else await this.watchRaycast(s);
      }
    }
    // 螺旋上「还剩几分钟」变了才重画
    const left = s ? s.tasks.map((t) => Math.ceil((t.end - Date.now()) / 60e3)).join() : null;
    if (left !== this._focusLeft) { this._focusLeft = left; this.refresh(); }
  }

  // Raycast 的专注小窗比它该结束的时刻早消失（连着两次、离结束还有半分钟以上、人在电脑前）= 你在 Raycast 里点了完成：这一轮的几条线都记成 DONE
  async watchRaycast(s) {
    if (this._probing) return;
    this._probing = true;
    try {
      const p = await this.probe();
      if (!p || this.settings.focusSession !== s || s.asked) return;
      if (p.panel) { s.panelSeen = true; s.miss = 0; return; }
      if (!s.panelSeen || Date.now() > s.rcEnd - 30e3 || p.idle > 300) return;
      if ((s.miss = (s.miss || 0) + 1) < 2) return;
      s.asked = true;
      const tasks = s.tasks;
      this.endSession(s);
      await this.finish(tasks, Date.now());
      this.notify("✅ 在 Raycast 里完成了", tasks.map((t) => t.label).join("、"));
    } finally { this._probing = false; }
  }

  async probe() {
    try { return JSON.parse((await run(await swiftTool("probe", PROBE_SWIFT), [])).stdout); }
    catch (e) { console.error("[螺旋日程] 读取状态失败", e); return null; }
  }

  // 一条线到点：弹系统对话框单独问这一条（Obsidian 在后台也看得到），别的线照常走
  async askLine(s, t) {
    const cfg = this.settings;
    this._asking = true;
    t.asked = true;
    this.saveData(cfg);
    try {
      if (cfg.focusAsk === false) { this.dropFromSession([t.key]); return; }
      run("/usr/bin/afplay", ["/System/Library/Sounds/Glass.aiff"]);
      this.toDiscord(`⏱ **专注到点** · ${t.label}（${dur(t.minutes)}${t.round > 1 ? ` · 第 ${t.round} 轮` : ""}）`);
      const others = s.tasks.filter((x) => x !== t && !x.asked);
      const msg = `这一条 ${dur(t.minutes)}${t.round > 1 ? `（第 ${t.round} 轮）` : ""}` +
        (others.length ? `\n另外 ${others.length} 条线还在走：${others.map((x) => `${x.label}（还剩 ${dur(Math.max(1, Math.ceil((x.end - Date.now()) / 60e3)))}）`).join("、")}` : "") + (t.dir ? "\n接着来吗？" : "\n做完了吗？");
      const btn = t.dir ? await this.choose(`专注到点 · ${t.label}`, msg, ["收工", "换个方向", "再来一轮"], "再来一轮", 1800)
        : await this.choose(`专注到点 · ${t.label}`, msg, ["先停下", "再来一轮", "做完了"], "做完了", 1800);
      if (this.settings.focusSession !== s || !s.tasks.includes(t)) return;   // 等回答的时候已经手动改了状态 / 这一轮结束了
      const at = Date.now();
      // 结束时刻：到点后 10 分钟内回答按回答的时刻，再晚多半是人走开了，按到点的时刻
      const end = at - t.end <= 10 * 60e3 ? at : t.end;
      // 大方向那条线：不对应日记里的哪一行，只管接着来还是收工
      if (t.dir && btn !== "再来一轮") {
        this.dropFromSession([t.key]);
        if (btn === "换个方向") this.suggestFocus("", 0);
        else if (!btn) new OB.Notice(`⏱ 「${t.label}」这一轮到点了`);
        return;
      }
      if (btn === "做完了") { this.dropFromSession([t.key]); await this.finish([t], end); }
      else if (btn === "再来一轮") {
        Object.assign(t, { asked: false, round: t.round + 1, end: at + t.minutes * 60e3 });
        this.extendRaycast(s);
        this.saveData(cfg);
        new OB.Notice(`▶ ${t.label} · 第 ${t.round} 轮 · ${dur(t.minutes)}`);
        this.refresh();
      } else if (btn === "先停下") { this.dropFromSession([t.key]); await this.editTasks(t.path, [t.key], toPaused); }
      else { this.dropFromSession([t.key]); new OB.Notice(`⏱ 「${t.label}」到点了，没有回答，还是 DOING`); }
    } finally { this._asking = false; }
  }

  // 提前点「结束」：整轮一起问。几条线时先勾做完的，再问剩下的
  async askDone(s) {
    const cfg = this.settings;
    if (s.asked) return;
    s.asked = true;
    this.saveData(cfg);
    if (cfg.focus) this.openUrl("raycast://focus/complete");
    if (cfg.focusAsk === false || s.tasks.every((t) => t.dir)) { this.endSession(s); return; }   // 只有大方向的一轮：直接结束，不用问做完没有
    run("/usr/bin/afplay", ["/System/Library/Sounds/Glass.aiff"]);
    const lines = s.tasks.filter((t) => !t.asked && !t.dir);
    const head = `提前结束 · 这一轮 ${dur(Math.max(1, Math.round((Date.now() - s.start) / 60e3)))}`;
    let done = [], next = "";
    if (lines.length === 1) {
      next = await dialog(`${head}\n\n${lines[0].label}\n\n做完了吗？`, ["先停下", "再来一轮", "做完了"], "做完了", 1800);
      if (next === "做完了") done = lines;
    } else {
      const picked = await pickList(`${head}\n\n${lines.length} 条线并行，勾上做完了的：`, lines.map((t) => t.label), "就这些做完了", "都没做完");
      done = lines.filter((t) => (picked || []).includes(t.label));
      const rest = lines.filter((t) => !done.includes(t));
      if (picked != null && rest.length) next = await dialog(`还有 ${rest.length} 件没做完：\n${rest.map((t) => "· " + t.label).join("\n")}`, ["先停下", "再来一轮"], "再来一轮", 1800);
    }
    if (cfg.focusSession !== s) return;   // 等回答的时候已经手动改了状态 / 开了别的
    const at = Date.now();
    const rest = lines.filter((t) => !done.includes(t));
    this.endSession(s);
    if (done.length) await this.finish(done, at);
    if (!rest.length) return;
    if (next === "再来一轮") this.startSession(rest.map((t) => ({ ...t, asked: false, round: t.round + 1, end: at + t.minutes * 60e3 })));
    else if (next === "先停下") { for (const [path, ts] of groupBy(rest)) await this.editTasks(path, ts.map((t) => t.key), toPaused); }
    else if (!done.length) new OB.Notice(`⏱ 专注结束了，没有回答，还是 DOING：${rest.map((t) => t.label).join("、")}`);
  }

  // 记成 DONE 开始-结束：开始用 DOING 后面写的时刻，没写用开始这条线的时刻
  async finish(tasks, endMs) {
    tasks = tasks.filter((t) => !t.dir && t.path);   // 大方向那条线不对应日记里的行
    if (!tasks.length) return;
    const end = moment(endMs).format("HH:mm");
    for (const [path, ts] of groupBy(tasks)) {
      for (const t of ts) await this.editTask(path, t.key, (raw) => toDone(raw, moment(t.start).format("HH:mm"), end));
    }
    new OB.Notice(`✅ ${tasks.map((t) => t.label).join("、")}`);
  }

  endSession(s) {
    if (this.settings.focusSession === s) this.settings.focusSession = null;
    this.saveData(this.settings);
    this.refresh();
  }

  // 这几条线不在专注里了（做完了 / 被规则暂停 / 手动改了状态）：从这一轮拿掉；拿空了这一轮就结束，Raycast 专注还没到点的一起结束
  dropFromSession(keys) {
    const s = this.session();
    if (!s) return;
    const left = s.tasks.filter((t) => !keys.includes(t.key));
    if (left.length === s.tasks.length) return;
    s.tasks = left;
    if (!left.length) {
      if (this.settings.focus && this.settings.focusAutoComplete !== false && Date.now() < s.rcEnd - 30e3) this.openUrl("raycast://focus/complete");
      this.settings.focusSession = null;
    } else s.end = Math.max(...left.map((t) => t.end));
    this.saveData(this.settings);
    this.refresh();
  }

  // ---- 硬规则：同时最多 3 件 DOING、3 小时没动就暂停、吃饭 / 锻炼全暂停 ----

  touch(key) {
    const all = (this.settings.doingTouch ||= {});
    all[key] = { sig: all[key]?.sig ?? null, at: Date.now() };
  }

  todayFile() {
    const f = this.app.vault.getAbstractFileByPath(this.journalPath(this.today()));
    return f instanceof TFile ? f : null;
  }

  // 日记改了之后（observe 之后调，prev = 改之前的任务状态）
  async enforce(file, content, prev) {
    const cfg = this.settings;
    if (!prev || file.path !== this.todayFile()?.path) return;
    const lines = content.split("\n");
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);

    // 新写了一条「吃饭」「锻炼」
    const words = splitList(cfg.breakWords);
    const brk = lines.map((l) => breakWord(l, words, cfg, now)).filter(Boolean);
    const seen = this._breakSeen;
    this._breakSeen = brk;
    if (seen && brk.length > seen.length && !cfg.breakState) { await this.startBreak(brk[brk.length - 1], file); return; }

    const auto = this.autoKeys(file.basename);
    const doing = parseJournal(content, cfg).filter((i) => i.kind === "task" && i.state === "open" && i.doing && !auto.has(workKey(i.label)));
    const born = doing.filter((i) => !prev.get(i.label)?.doing);
    if (!born.length) return;
    for (const t of born) this.touch(workKey(t.label));
    if (cfg.breakState) { cfg.breakState = null; this.saveData(cfg); this.refresh(); }   // 吃完自己开始干活了：不用再问
    // 超过上限：最早开始的那几件改成 PAUSED
    if (!(cfg.doingLimit > 0) || doing.length <= cfg.doingLimit) return;
    const work = (cfg.workLog || {})[file.basename] || {};
    const since = (t) => (work[workKey(t.label)] || []).find((x) => x[1] == null)?.[0] ?? t.startedAt ?? 1e6 + t.line;
    // 正在专注的几件排到最后才动：先暂停不在这一轮里、最早开始的
    const fs = this.session();
    const inFocus = (t) => !!fs && !fs.asked && fs.tasks.some((x) => x.key === workKey(t.label));
    const victims = doing.filter((t) => !born.includes(t)).sort((a, b) => inFocus(a) - inFocus(b) || since(a) - since(b)).slice(0, doing.length - cfg.doingLimit);
    if (!victims.length) return;
    await this.pause(file, victims);
    this.notify(`⏸ 同时在做超过 ${cfg.doingLimit} 件`, `已暂停最早开始的：${victims.map((t) => t.label).join("、")}`, file, victims[0].line,
      victims.length === 1 ? { "换成暂停别的": () => this.openLine(file, victims[0].line) } : {});
  }

  async pause(file, tasks) {
    const keys = tasks.map((t) => workKey(t.label));
    this.dropFromSession(keys);
    await this.editTasks(file.path, keys, toPaused);
  }

  // 每分钟：DOING 超过 staleHours 小时没动过（这一行和子项都没改、也不在专注里）→ PAUSED
  async checkStale() {
    const cfg = this.settings;
    const file = this.todayFile();
    if (!file) return;
    const text = await this.app.vault.cachedRead(file);
    const lines = text.split("\n");
    const touch = (cfg.doingTouch ||= {});
    const s = this.session();
    const now = Date.now(), seen = new Set(), stale = [];
    let changed = false;
    const auto = this.autoKeys(file.basename);
    for (const t of parseJournal(text, cfg)) {
      if (t.kind !== "task" || t.state !== "open" || !t.doing || auto.has(workKey(t.label))) continue;
      const k = workKey(t.label), sig = subtree(lines, t.line);
      seen.add(k);
      if (!touch[k] || touch[k].sig !== sig) { touch[k] = { sig, at: touch[k] && touch[k].sig == null ? touch[k].at : now }; changed = true; }
      const focused = s && !s.asked && s.tasks.some((x) => x.key === k);
      if (cfg.staleHours > 0 && !focused && now - touch[k].at > cfg.staleHours * 3600e3) stale.push(t);
    }
    for (const k of Object.keys(touch)) if (!seen.has(k)) { delete touch[k]; changed = true; }
    if (changed) this.saveSoon();
    if (!stale.length) return;
    await this.pause(file, stale);
    const keys = stale.map((t) => workKey(t.label));
    this.notify(`⏸ 超过 ${cfg.staleHours} 小时没动`, `已暂停：${stale.map((t) => t.label).join("、")}`, file, stale[0].line,
      { "还在做，切回 DOING": async () => { for (const k of keys) this.touch(k); await this.editTasks(file.path, keys, toDoing); } });
  }

  // 吃饭 / 锻炼：所有 DOING 改成 PAUSED，专注停掉（记下还剩多久），等你回来
  async startBreak(word, file) {
    const cfg = this.settings;
    const auto = this.autoKeys(file.basename);
    const doing = parseJournal(await this.app.vault.read(file), cfg).filter((i) => i.kind === "task" && i.state === "open" && i.doing && !auto.has(workKey(i.label)));
    const s = this.session();
    let focus = null;
    if (s && !s.asked) {
      focus = { tasks: s.tasks.filter((t) => !t.asked).map((t) => ({ ...t, left: Math.max(1, Math.ceil((t.end - Date.now()) / 60e3)) })) };
      s.asked = true;
      if (cfg.focus) this.openUrl("raycast://focus/complete");
      this.endSession(s);
    }
    cfg.breakState = { word, since: Date.now(), path: file.path, keys: doing.map((t) => workKey(t.label)), labels: doing.map((t) => t.label), focus, active: 0 };
    if (doing.length) await this.editTasks(file.path, cfg.breakState.keys, toPaused);
    await this.saveData(cfg);
    this.notify(`${breakIcon(word)} ${word}：计时暂停`, doing.length ? `已暂停 ${doing.length} 件：${doing.map((t) => t.label).join("、")}` : "现在没有在做的事");
    this.refresh();
  }

  // ---- 给 Telegram Inbox 用的：手机上说「去吃饭了」「吃完了」 ----
  // 开始：和日记里写「吃饭」一样（DOING 全部暂停、专注停掉），时间按消息发出的时刻；返回 { already, b }
  async tgBreakStart(word, ms = Date.now()) {
    const cfg = this.settings;
    if (cfg.breakState) return { already: true, b: cfg.breakState };
    const file = this.todayFile();
    if (file) await this.startBreak(word, file);
    else cfg.breakState = { word, since: ms, path: null, keys: [], labels: [], focus: null, active: 0 };
    cfg.breakState.since = ms;
    await this.saveData(cfg);
    return { already: false, b: cfg.breakState };
  }
  // 结束：不弹窗，直接把还是 PAUSED 的切回 DOING、专注接着开；日记里「**12:30** 吃饭」那一行改成「12:30-13:10 吃饭」，螺旋上画成一段
  async tgBreakEnd(ms = Date.now()) {
    const cfg = this.settings;
    const b = cfg.breakState;
    if (!b) return null;
    cfg.breakState = null;
    if (b.path && b.keys.length) {
      await this.editTasks(b.path, b.keys, (raw) => (splitTask(raw)?.kw === "PAUSED" ? toDoing(raw) : raw));
      for (const k of b.keys) this.touch(k);
    }
    if (b.focus && b.focus.tasks.length) this.startSession(b.focus.tasks.map((t) => ({ ...t, asked: false, end: Date.now() + t.left * 60e3 })));
    const from = moment(b.since).format("HH:mm"), to = moment(ms).format("HH:mm");
    const f = b.path && this.app.vault.getAbstractFileByPath(b.path);
    if (f instanceof TFile) {
      const esc = b.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^(\\s*-\\s+)\\*\\*${from}\\*\\*\\s+(${esc}.*)$`);
      await this.app.vault.process(f, (txt) => {
        const ls = txt.split("\n");
        for (let i = ls.length - 1; i >= 0; i--) { const m = re.exec(ls[i]); if (m) { ls[i] = `${m[1]}${from}-${to} ${m[2]}`; break; } }
        return ls.join("\n");
      });
    }
    await this.saveData(cfg);
    this.refresh();
    return { word: b.word, from, to, mins: Math.max(1, Math.round((ms - b.since) / 60e3)), labels: b.labels, focus: !!(b.focus && b.focus.tasks.length) };
  }

  // 每 30 秒：吃饭 / 锻炼至少 breakMinAway（20）分钟后，在 Obsidian、Claude 等 App 里持续操作满 3 分钟 = 回来了
  async tickBreak() {
    const b = this.settings.breakState;
    if (!b || b.asking || Date.now() - b.since < (this.settings.breakMinAway ?? 20) * 60e3) return;
    const p = await this.probe();
    if (!p || this.settings.breakState !== b) return;
    const apps = splitList(this.settings.breakApps).map((a) => a.toLowerCase());
    if (p.idle <= 30 && apps.some((a) => p.front.toLowerCase().includes(a))) b.active++;
    else if (p.idle > 90) b.active = 0;
    if (b.active >= 6) await this.askBack(b);
  }

  async askBack(b) {
    const cfg = this.settings;
    if (b.asking) return;
    b.asking = true;
    const away = dur(Math.max(1, Math.round((Date.now() - b.since) / 60e3)));
    if (!b.keys.length && !b.focus) { cfg.breakState = null; this.saveData(cfg); this.notify(`欢迎回来`, `${b.word} ${away}`); this.refresh(); return; }
    this.notify(`欢迎回来 · ${b.word} ${away}`, `要把 ${b.keys.length} 件切回 DOING 吗？`);
    run("/usr/bin/afplay", ["/System/Library/Sounds/Glass.aiff"]);
    const msg = `欢迎回来 · ${b.word} ${away}\n\n要把这 ${b.keys.length} 件切回 DOING 吗？\n${b.labels.map((l) => "· " + l).join("\n")}` +
      (b.focus && b.focus.tasks.length ? `\n\n专注接着开：${b.focus.tasks.map((t) => `${t.label} 还剩 ${dur(t.left)}`).join("、")}` : "");
    const btn = await dialog(msg, ["先不用", "切回来"], "切回来", 900);
    if (cfg.breakState !== b) return;
    if (!btn) { b.asking = false; b.active = 0; this.saveData(cfg); return; }   // 没回答：人又走了，过会儿再问
    cfg.breakState = null;
    if (btn === "切回来") {
      // 只切还是 PAUSED 的（吃饭时手动改过的不动）
      await this.editTasks(b.path, b.keys, (raw) => (splitTask(raw)?.kw === "PAUSED" ? toDoing(raw) : raw));
      for (const k of b.keys) this.touch(k);
      if (b.focus && b.focus.tasks.length) this.startSession(b.focus.tasks.map((t) => ({ ...t, asked: false, end: Date.now() + t.left * 60e3 })));
    }
    this.saveData(cfg);
    this.refresh();
  }

  // 系统通知；点一下跳到那一行
  // 提醒中枢：把一条提醒发到 Discord（走本机的 notify-discord 脚本，Webhook 地址在钥匙串里）。没配频道或者没发出去返回 false
  async toDiscord(text) {
    const cfg = this.settings;
    const ch = (cfg.discordChannel || "").trim();
    if (!ch || !(OB.Platform && OB.Platform.isDesktopApp)) return false;
    const bin = (cfg.discordCmd || "~/.local/bin/notify-discord").replace(/^~(?=\/)/, require("os").homedir());
    const r = await run(bin, ["--as", "螺旋日程", ch, text], 20000);
    if (r.code !== 0) console.error("[螺旋日程] 发到 Discord 失败", (r.stderr || r.stdout).slice(0, 300));
    return r.code === 0;
  }

  // 提醒分两种：不用你回答的（暂停了、欢迎回来、做完了）进 Discord，进去了就不在本机再弹一遍；
  // 带按钮要你点的（actions = { 按钮上的字: 点了做什么 }）本机照弹，Discord 里留一份记录
  // 几秒之内连着来的提醒先攒着，标题一样的折成一条再发
  notify(title, body, file, line, actions = {}) {
    (this._nq ||= []).push({ title, body, file, line, actions });
    window.clearTimeout(this._nqTimer);
    this._nqTimer = window.setTimeout(() => this.flushNotify(), 4000);
  }
  flushNotify() {
    const q = this._nq || [];
    this._nq = [];
    const groups = new Map();
    for (const x of q) (groups.get(x.title) || groups.set(x.title, []).get(x.title)).push(x);
    for (const [title, list] of groups) {
      const body = [...new Set(list.map((x) => x.body))].join("\n");
      const actions = Object.assign({}, ...list.map((x) => x.actions));
      const keys = Object.keys(actions);
      const { file, line } = list[0];
      this.toDiscord(`**${title}**\n${body}`).then(async (sent) => {
        if (sent && !keys.length) return;
        // 带按钮的：试验里的按钮通知开着就用它，否则在本机弹一条普通通知（点一下跳到日记那一行）
        const r = keys.length && this.settings.askVia === "notification" ? await this.ask(title, body, keys, 600) : null;
        if (r && actions[r]) return actions[r]();
        if (r === "__click__" && file) { run("/usr/bin/open", ["-a", "Obsidian"]); this.openLine(file, line ?? 0); }
        if (r == null) this.local(title, body, file, line);
      });
    }
  }
  // 提示音
  ding() {
    const s = String(this.settings.notifySound ?? "Pop").trim();
    if (s) run("/usr/bin/afplay", [s.includes("/") ? s.replace(/^~(?=\/)/, require("os").homedir()) : `/System/Library/Sounds/${s}.aiff`]);
  }
  // 在本机弹一条通知并响一声，点一下跳到日记那一行
  local(title, body, file, line) {
    this.ding();
    try {
      const n = new Notification(title, { body: body.replace(/\*\*/g, ""), silent: true });
      if (file) n.onclick = () => { window.focus(); this.openLine(file, line ?? 0); };
    } catch (e) { new OB.Notice(`${title}\n${body}`, 8000); }
  }
  // 发一条不用你回答的提醒：配了 Discord 就发到 Discord，没配或者没发出去就在本机弹
  say(title, body, file, line) {
    this.toDiscord(`**${title}**\n${body}`).then((sent) => { if (!sent) this.local(title, body, file, line); });
  }

  // 改一篇笔记的几行：开在编辑器里就在编辑器里改（光标不跳，⌘Z 能撤销），没开就改文件。fn(lines) 直接改数组，返回改了几行
  async editFile(file, fn) {
    let view = null;
    this.app.workspace.iterateAllLeaves((l) => { if (!view && l.view instanceof OB.MarkdownView && l.view.file?.path === file.path && l.view.getMode() === "source") view = l.view; });
    if (view) {
      const ed = view.editor;
      const before = ed.getValue().split("\n"), lines = [...before];
      const n = fn(lines);
      if (!n) return 0;
      const changes = [];
      lines.forEach((l, i) => { if (l !== before[i]) changes.push({ from: { line: i, ch: 0 }, to: { line: i, ch: before[i].length }, text: l }); });
      ed.transaction({ changes });
      return n;
    }
    let n = 0;
    await this.app.vault.process(file, (text) => {
      const lines = text.split("\n");
      n = fn(lines);
      return n ? lines.join("\n") : text;
    });
    return n;
  }

  // 改几件任务：按 workKey 找还没做完的那几条（hint = 原来的行号，同名的有好几条时优先它）；只改这几行
  async editTasks(path, keys, fn, hint) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return 0;
    return this.editFile(file, (lines) => {
      const open = parseJournal(lines.join("\n"), this.settings).filter((i) => i.kind === "task" && i.state === "open");
      let n = 0;
      for (const k of keys) {
        const hits = open.filter((i) => workKey(i.label) === k).map((i) => i.line);
        const at = hits.includes(hint) ? hint : hits[0];
        if (at == null) continue;
        const next = fn(lines[at]);
        if (next !== lines[at]) { lines[at] = next; n++; }
      }
      return n;
    });
  }
  async editTask(path, key, fn, hint) { return (await this.editTasks(path, [key], fn, hint)) > 0; }

  // 后台打开链接，不把焦点抢走
  openUrl(url, background = true) {
    require("child_process").execFile("/usr/bin/open", background ? ["-g", url] : [url], (e) => { if (e) new OB.Notice(`打不开 ${url.split("?")[0]}：${e.message}`); });
  }

  async setBounds(dayKey, kind, t) {
    const all = (this.settings.dayBounds ||= {});
    const b = (all[dayKey] ||= {});
    if (t == null) delete b[kind]; else b[kind] = t;
    if (!Object.keys(b).length) delete all[dayKey];
    await this.saveData(this.settings);
    this.refresh();
  }

  async gameLog() {
    if (!this._games) {
      try { this._games = JSON.parse(await this.app.vault.adapter.read(this.gameLogPath)); } catch (e) { this._games = { days: {} }; }
    }
    return this._games;
  }

  // 每分钟看一眼在不在玩：进程路径含 gameProcs 的词（Steam 游戏按 steamapps/common 下的文件夹名记），或者 gameFrontApps 在最前面
  async pollGames() {
    if (this.settings.trackGames === false || !(OB.Platform && OB.Platform.isDesktopApp)) return;
    try {
      const { execFile } = require("child_process");
      const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { maxBuffer: 16e6 }, (e, out) => res(e ? "" : out)));
      const split = (s) => (s || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      const names = new Set();
      const procs = (await run("/bin/ps", ["-axo", "comm="])).split("\n");
      for (const term of split(this.settings.gameProcs)) {
        for (const p of procs) {
          if (!p.toLowerCase().includes(term.toLowerCase())) continue;
          const steam = /steamapps\/common\/([^/]+)/.exec(p);
          names.add(steam ? steam[1] : term);
        }
      }
      const fronts = split(this.settings.gameFrontApps);
      if (fronts.length) {
        const m = /"LSDisplayName"="([^"]*)"/.exec(await run("/bin/sh", ["-c", 'lsappinfo info -only name "$(lsappinfo front)"']));
        const f = m && fronts.find((x) => x.toLowerCase() === m[1].toLowerCase());
        if (f) names.add(f);
      }
      if (!names.size) return;
      const { key, t } = aiDay(Date.now(), this.settings);
      const log = await this.gameLog();
      const day = (log.days[key] ||= []);
      const now = Math.round(t);
      for (const n of names) {
        const last = day.filter((s) => s[2] === n).at(-1);
        if (last && now - last[1] <= 3) last[1] = now + 1;   // 一分钟看一次，隔得不远就接上
        else day.push([now, now + 1, n]);
      }
      await this.app.vault.adapter.write(this.gameLogPath, JSON.stringify(log));
      this.refresh();
    } catch (e) {
      console.error("[螺旋日程] 游戏时间记录失败", e);
    }
  }

  // 人机协作汇总：先用存下的（手机上也能看），再在后台读 Claude Code 日志更新，至多一分钟一次
  async aiUsage() {
    if (!this.aiStore) {
      try { this.aiStore = JSON.parse(await this.app.vault.adapter.read(this.aiStorePath)); } catch (e) { this.aiStore = { days: {} }; }
    }
    if (OB.Platform && OB.Platform.isDesktopApp && !this._aiBusy && Date.now() - (this._aiAt || 0) > 55000) this.scanAi();
    return this.aiStore;
  }

  async scanAi() {
    this._aiBusy = true;
    try {
      const ai = (this._ai ||= new AiUsage(this.settings));
      // 头一回（或汇总格式升级后）把现存日志全读一遍补历史；之后重启只读最近改过的
      const upgrade = this.aiStore.v !== AI_STORE_V;
      const since = this.aiStore.backfilled && !upgrade ? Date.now() - (AI_FRESH_DAYS + 2) * 864e5 : 0;
      const touched = await ai.scan(ai.files.size ? Date.now() - 2 * 864e5 : since);
      const changed = ai.merge(this.aiStore, touched, upgrade) || !this.aiStore.backfilled || upgrade || this._aiDirty;
      this._aiDirty = false;
      this.aiStore.backfilled = true;
      this.aiStore.v = AI_STORE_V;
      if (changed) {
        await this.app.vault.adapter.write(this.aiStorePath, JSON.stringify(this.aiStore));
        this.refresh();
      }
    } catch (e) {
      console.error("[螺旋日程] 人机协作统计失败", e);
    } finally {
      this._aiBusy = false;
      this._aiAt = Date.now();
    }
  }

  // ---------------- 状态栏 ----------------
  // 照 Nautilus Log 的顶栏：在做事时显示最近开始的那件做了多久、几件在做；连着做过了番茄钟的阈值，计时变红；
  // 开了太久像是忘了关，提醒检查。这两样都只是提示，不替你停。没在做时显示今天的容量。每秒只换文字，不读日记
  setupStatusBar() {
    if (typeof this.addStatusBarItem !== "function") return;
    const el = (this.statusEl = this.addStatusBarItem());
    el.addClass("naut-status", "mod-clickable");
    el.setAttr("aria-label", "单击：打开螺旋日程 · ⌥ 单击：到日记里正在做的那一行 · ⇧ 单击：在旁边分栏打开今天的日记");
    el.setAttr("data-tooltip-position", "top");
    el.addEventListener("click", (ev) => this.statusClick(ev).catch((e) => console.error("[螺旋日程] 状态栏", e)));
    this.registerInterval(window.setInterval(() => this.tickStatus(), 1000));
    this.registerInterval(window.setInterval(() => this.refreshCapacity(), 60 * 1000));
    this.app.workspace.onLayoutReady(() => this.refreshCapacity());
  }

  // ---------------- 状态栏：Agent 汇总 ----------------
  // 眼下挂在大纲上的 Agent 会话：开着的笔记和今天的日记里，下面有「🔗」行的任务，加上 DOING 的行自动对上的会话。
  // 做完、取消了的任务不算，归档了的会话不算，这次打开 Obsidian 以来没读到过动静的也不算。
  // 返回 [{ path, line, label, sid, agent, state }]：state = run 在跑 / wait 这一轮答完了在等你 / quiet 没答完但好几分钟没动静（多半停在要你点「允许」）
  async agentScan() {
    const cfg = this.settings, out = [], seen = new Set(), arch = this._archived || new Set(), on = aiOn(cfg), done = (this._agentDone = new Set());
    if (cfg.agentStatus === false || cfg.showAi === false || !this._ai) return out;
    const docs = [], paths = new Set();
    this.app.workspace.iterateAllLeaves((l) => {
      const v = l.view;
      if (!(v instanceof OB.MarkdownView) || !v.file || !v.editor || paths.has(v.file.path)) return;
      paths.add(v.file.path);
      docs.push([v.file.path, v.editor.getValue()]);
    });
    const today = this.todayFile();
    if (today && !paths.has(today.path)) try { docs.push([today.path, await this.app.vault.cachedRead(today)]); } catch (e) { /* 读不到就不算 */ }
    for (const [path, text] of docs) {
      if (text.length > 2e6 || !(text.includes("🔗") || /DOING|NOW|IN-PROGRESS|\[\/\]/.test(text))) continue;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const link = parseLink(lines[i]);
        // 有 🔗 的任务等扫到它的 🔗 行再算；没有 🔗 的 DOING 行看它自动对上了哪个会话
        const owner = link ? markOwner(lines, i) : DOING_LINE_RE.test(lines[i]) && !linkUnder(lines, i) ? i : -1;
        if (owner < 0) continue;
        const k = kwLine(lines[owner]);
        if (!k || /^(DONE|CANCELED|CANCELLED|FAILED)$/.test(k.kw)) { if (link) done.add(link.sid); continue; }
        let sid = link && link.sid, agent = link && link.agent;
        if (!link) {
          const it = parseJournal(lines[owner].replace(/^\s+/, ""), cfg).find((x) => x.kind === "task" && x.doing);
          const x = it && this.progSession(workKey(it.label));
          if (!x) continue;
          sid = x.sid; agent = aiAgent(x);
        }
        const lv = this._ai.live.get(sid);
        if (!lv || seen.has(sid) || arch.has(sid) || !on.includes(agent)) continue;
        seen.add(sid);
        out.push({ path, line: owner, label: k.body, sid, agent, state: lv.state === "wait" ? "wait" : (Date.now() - lv.at) / 60e3 <= AI_IDLE ? "run" : "quiet" });
      }
    }
    return out;
  }
  setupAgentBar() {
    if (typeof this.addStatusBarItem !== "function") return;
    const el = (this.agentEl = this.addStatusBarItem());
    el.addClass("naut-agents", "mod-clickable");
    el.setAttr("data-tooltip-position", "top");
    el.setText("🤖");
    el.addClass("is-idle");
    // 单击：在它正上方弹出所有在跑的、最新三个在等你的会话；⌥ 单击：直接跳到日记里等你的那一行
    el.addEventListener("click", (ev) => {
      if (ev.altKey) { this.closeAgentPop(); this.agentClick().catch((e) => console.error("[螺旋日程] 状态栏 Agent", e)); return; }
      this.toggleAgentPop();
    });
    this.register(() => this.closeAgentPop(true));
  }
  // 状态栏 🤖 那一格和它的面板看的会话：最近一天里所有在跑、在等你的 Claude Code 会话，桌面版 Code 标签里的、终端里的 claude 都算
  // （用户 2026-10-14 定的：只管 Claude Code，普通聊天本机也没有日志）。不管它在大纲里有没有挂一行，挂了的带上是哪一行（点了能跳过去）。
  // 不算：归档了的；在大纲里挂的那一行已经做完 / 取消的；别的程序拉起来的后台会话（第一句话是机器塞的「<…>」）、没标题也没说过话的。
  // 返回按最后动静从新到旧排好的 [{ sid, agent, state: run / wait / quiet, at, label, title, path?, line?, x }]
  agentSessions(bound = []) {
    const cfg = this.settings, out = [];
    if (cfg.agentStatus === false || cfg.showAi === false || !this._ai) return out;
    const arch = this._archived || new Set(), done = this._agentDone || new Set(), now = Date.now();
    const byLine = new Map(bound.map((a) => [a.sid, a]));
    for (const [sid, lv] of this._ai.live) {
      const agent = lv.agent || "claude";
      if (agent !== "claude" || !lv.at || now - lv.at > 24 * 3600e3 || arch.has(sid) || done.has(sid)) continue;
      const x = this.agentRecord(sid), raw = x ? x.title || String(x.text || "").split(" / ")[0] : "";
      const title = /^\s*</.test(raw) ? "" : raw.trim();
      if (!title && !byLine.has(sid)) continue;
      const b = byLine.get(sid);
      const state = lv.state === "wait" ? "wait" : (now - lv.at) / 60e3 <= AI_IDLE ? "run" : "quiet";
      out.push({ sid, agent, state, at: lv.at, label: b ? b.label : title, title, path: b ? b.path : "", line: b ? b.line : -1, x });
    }
    return out.sort((a, b) => b.at - a.at);
  }
  // 状态栏那一格常驻一行：有在跑的就显示最新的那个在跑的，没有就显示最新一个在等你的；都没有写「空闲」
  tickAgents() {
    const el = this.agentEl;
    if (!el) return;
    const off = this.settings.agentStatus === false;
    el.toggle(!off);
    if (off) return this.closeAgentPop(true);
    const list = this._agentList || [];
    const runs = list.filter((a) => a.state === "run"), waits = list.filter((a) => a.state !== "run");
    const head = runs[0] || waits[0];
    const word = { run: "在跑", wait: "等你", quiet: "没动静" };
    const short = (s) => { const c = [...String(s || "")]; return c.length > 18 ? c.slice(0, 18).join("") + "…" : c.join(""); };
    const text = head ? `🤖 ${word[head.state]} · ${short(head.label)}${list.length > 1 ? ` · 另 ${list.length - 1} 个` : ""}` : "🤖 空闲";
    // 在跑 / 等你的个数变了：轻轻跳一下（只换了标题不跳）
    const key = `${runs.length}/${waits.length}`;
    if (this._agentKey != null && this._agentKey !== key) { el.removeClass("is-bump"); void el.offsetWidth; el.addClass("is-bump"); }
    this._agentKey = key;
    if (el.getText() !== text) el.setText(text);
    el.toggleClass("is-waiting", !runs.length && waits.length > 0);
    el.toggleClass("is-idle", !head);
    el.setAttr("aria-label", head ? `${runs.length ? `${runs.length} 个在跑` : ""}${runs.length && waits.length ? " · " : ""}${waits.length ? `${waits.length} 个在等你` : ""}\n单击看详情 · ⌥ 单击跳到日记里等你的那一行` : "最近一天没有在跑或在等你的会话");
    if (this._agentPop) this.renderAgentPop();   // 面板开着就跟着刷新
  }
  // ⌥ 单击：跳到日记里等你的那一行；有好几个就轮着跳；没有在等的就跳到在跑的（只看在大纲里挂了一行的会话）
  async agentClick() {
    const list = this._agents || [], waiting = list.filter((a) => a.state !== "run"), pool = waiting.length ? waiting : list;
    if (!pool.length) return;
    return this.jumpToAgent(pool[(this._agentAt = ((this._agentAt ?? -1) + 1) % pool.length)]);
  }

  // ---------- 状态栏 Agent 那一格的详情面板 ----------
  // 所有在跑的会话、最新三个在等你的会话，一个一张卡片：状态、标题（挂在大纲里的用那一行的字）、哪个 Agent、桌面版还是终端、
  // 自己列的待办做到第几步、眼下在干什么、多久没动静、用了多少 token、几点开始的；在等你的再带上它最后说的那句话
  toggleAgentPop() { if (this._agentPop) this.closeAgentPop(); else this.openAgentPop(); }
  openAgentPop() {
    if (!this.agentEl) return;
    const doc = this.agentEl.ownerDocument;
    this._agentPop = doc.body.createDiv({ cls: "naut-agent-pop" });
    this.renderAgentPop();
    this.sound("tick");   // 和点螺旋、点列表同一声「嗒」
    const away = (ev) => { if (this._agentPop && !this._agentPop.contains(ev.target) && !this.agentEl.contains(ev.target)) this.closeAgentPop(); };
    const esc = (ev) => { if (ev.key === "Escape") this.closeAgentPop(); };
    doc.addEventListener("mousedown", away, true);
    doc.addEventListener("keydown", esc, true);
    this._agentPopOff = () => { doc.removeEventListener("mousedown", away, true); doc.removeEventListener("keydown", esc, true); };
  }
  closeAgentPop(now = false) {
    const pop = this._agentPop;
    if (!pop) return;
    this._agentPop = null;
    if (this._agentPopOff) this._agentPopOff();
    if (now) return pop.remove();
    pop.addClass("is-leaving");
    window.setTimeout(() => pop.remove(), 160);
  }
  // 这个会话最近 7 天里最后一天的记录（标题、从哪个 App 开的、活跃时段）
  agentRecord(sid) {
    const days = this.aiStore ? this.aiStore.days : {};
    for (const k of Object.keys(days).sort().slice(-7).reverse()) {
      const x = ((aiPick(days[k], this.settings) || {}).list || []).find((s) => s.sid === sid);
      if (x) return x;
    }
    return null;
  }
  renderAgentPop() {
    const pop = this._agentPop;
    if (!pop) return;
    const keepScroll = pop.scrollTop, first = !pop.childElementCount;
    pop.empty();
    pop.toggleClass("is-static", !first);   // 每 10 秒刷新时卡片不再重新播入场
    const list = this._agentList || [];
    const runs = list.filter((a) => a.state === "run"), waits = list.filter((a) => a.state !== "run");
    const shown = [...runs, ...waits.slice(0, 3)];
    const word = { run: "在跑", wait: "等你", quiet: "没动静" };
    const head = pop.createDiv({ cls: "naut-ap-head" });
    head.createSpan({ cls: "naut-ap-title", text: "🤖 Agent 会话" });
    head.createSpan({ cls: "naut-ap-count", text: [runs.length ? `${runs.length} 在跑` : "", waits.length ? `${waits.length} 等你` : ""].filter(Boolean).join(" · ") });
    if (!shown.length) pop.createDiv({ cls: "naut-ap-empty", text: "最近一天没有在跑或在等你的会话" });
    const body = pop.createDiv({ cls: "naut-ap-list" });
    shown.forEach((a, i) => {
      const lv = this._ai && this._ai.live.get(a.sid), x = a.x;
      const card = body.createDiv({ cls: `naut-ap-card is-${a.state}` + (a.path ? " is-bound" : ""), attr: { style: `--naut-i:${i}` } });
      const top = card.createDiv({ cls: "naut-ap-top" });
      top.createSpan({ cls: `naut-ap-dot naut-bg-${a.agent}` });
      top.createSpan({ cls: `naut-ap-state is-${a.state}`, text: word[a.state] });
      top.createSpan({ cls: "naut-ap-label", text: a.label, attr: { title: a.label } });
      const ago = Math.max(0, Math.round((Date.now() - a.at) / 60e3));
      top.createSpan({ cls: "naut-ap-ago", text: ago < 1 ? "刚刚" : ago >= 1440 ? `${Math.floor(ago / 1440)} 天前` : `${dur(ago)}前` });
      // 哪个 App 开的（桌面版 / 终端），挂在大纲里的再带上会话自己的标题
      card.createDiv({ cls: "naut-ap-line", text: [x ? aiWhere(x) : AI_AGENTS[a.agent] || a.agent, a.path && a.title && a.title !== a.label ? a.title : ""].filter(Boolean).join(" · ") });
      // 进度：它自己列的待办做到第几步，眼下在干什么
      const todo = lv && lv.todo && lv.todo.total ? lv.todo : null;
      const step = lv && a.state === "run" ? (todo && todo.cur) || lv.step : "";
      if (todo || step) card.createDiv({ cls: "naut-ap-line naut-ap-step", text: "▸ " + [todo ? `${todo.done}/${todo.total} 步` : "", step].filter(Boolean).join(" · ") });
      if (todo) card.createDiv({ cls: "naut-ap-bar" }).createDiv({ cls: `naut-ap-fill naut-bg-${a.agent}`, attr: { style: `transform:scaleX(${todo.done / todo.total})` } });
      // 在等你的：它最后说的那句话（和日记里「💬」那一行同一份；没挂在大纲里的去会话日志里读）
      if (a.state !== "run") {
        const said = this._resCache && this._resCache.get(a.sid);
        const el = card.createDiv({ cls: "naut-ap-said" });
        if (said && said.said) el.setText(plainSaid(said.said));
        else this.agentSaid(a, el);
      }
      const facts = [], tok = this.progTokens(a.sid);
      if (tok) facts.push(`${fmtTok(tok)} tok`);
      if (x && x.segs && x.segs.length) facts.push(`${clock(x.segs[0][0])} 起`, `动了 ${dur(Math.max(1, Math.round(x.min || unionMin(x.segs))))}`);
      if (a.path) facts.push(a.path.split("/").pop().replace(/\.md$/, ""));
      if (facts.length) card.createDiv({ cls: "naut-ap-line naut-ap-facts", text: facts.join(" · ") });
      const acts = card.createDiv({ cls: "naut-ap-acts" });
      const btn = (text, fn) => { const b = acts.createEl("button", { text }); b.onclick = (ev) => { ev.stopPropagation(); fn(); }; };
      const open = () => require("child_process").execFile("/usr/bin/open", [`claude://resume?session=${a.sid}`], () => {});
      if (a.path) btn("跳到这一行", () => { this.closeAgentPop(); this.jumpToAgent(a).catch(() => {}); });
      if (a.agent === "claude") btn("打开会话", () => { this.closeAgentPop(); open(); });
      card.onclick = () => { this.closeAgentPop(); if (a.path) this.jumpToAgent(a).catch(() => {}); else if (a.agent === "claude") open(); };
    });
    if (waits.length > 3) pop.createDiv({ cls: "naut-ap-more", text: `另有 ${waits.length - 3} 个在等你` });
    pop.scrollTop = keepScroll;
    // 贴着状态栏那一格的正上方，右边对齐
    const r = this.agentEl.getBoundingClientRect(), de = pop.ownerDocument.documentElement;
    pop.style.bottom = `${Math.max(8, de.clientHeight - r.top + 6)}px`;
    pop.style.right = `${Math.max(8, de.clientWidth - r.right)}px`;
  }
  // 没挂在大纲里的会话：去它的会话日志里读最后一条回复，压成一行（读过的同一轮不再读）
  agentSaid(a, el) {
    const cache = (this._saidCache ||= new Map()), c = cache.get(a.sid);
    if (c && c.at === a.at) { el.setText(c.said); return; }
    this.sessionTail({ sid: a.sid, agent: a.agent }).then((t) => {
      const said = t && t.full ? plainSaid(resultText(t.full, this.settings.resultMax)) : "";
      cache.set(a.sid, { at: a.at, said });
      if (el.isConnected) { if (said) el.setText(said); else el.remove(); }
    }).catch(() => el.remove());
  }
  // 跳到这个会话挂着的那一行：扫的时候到现在行可能挪过，按会话的 🔗 行、再按正文重新找一遍
  async jumpToAgent(t) {
    const file = this.app.vault.getAbstractFileByPath(t.path);
    if (!(file instanceof TFile)) return;
    // 扫的时候到现在行可能挪过：按会话的 🔗 行、再按正文重新找一遍
    let line = t.line;
    try {
      const lines = (await this.app.vault.cachedRead(file)).split("\n");
      const at = lines.findIndex((l) => { const k = parseLink(l); return k && k.sid === t.sid; });
      const owner = at >= 0 ? markOwner(lines, at) : lines.findIndex((l) => { const k = kwLine(l); return k && k.body === t.label; });
      if (owner >= 0) line = owner;
    } catch (e) { /* 读不到就用扫的时候的行号 */ }
    await this.openLine(file, line);
  }

  tickStatus() {
    const el = this.statusEl, cfg = this.settings;
    if (!el) return;
    el.toggle(cfg.statusBar !== false);
    if (cfg.statusBar === false) return;
    const dayKey = this.today().format(cfg.format);
    const base = moment(dayKey, cfg.format).valueOf();   // 这篇日记那天的 0 点；计时记录里的分钟数从这儿起算
    const over = (ms, min) => min > 0 && ms >= min * 60e3;
    // 开着的计时：最近开始的那件排最前
    const open = Object.entries((cfg.workLog || {})[dayKey] || {}).map(([k, segs]) => [k, (segs.find((s) => s[1] == null) || [])[0]]).filter(([, a]) => a != null).sort((x, y) => y[1] - x[1]);
    const fs = this.session();
    let text, overdue = false, forgotten = false, warning = false;
    this._statusKey = open.length ? open[0][0] : null;
    if (open.length) {
      const ms = Date.now() - (base + open[0][1] * 60e3);
      overdue = over(ms, cfg.pomoMinutes ?? 45);
      forgotten = over(ms, cfg.forgottenMinutes ?? 120);
      const name = open[0][0].replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");
      text = `${forgotten ? "⚠ 检查计时 · " : "▶ "}${elapsedText(ms)} · ${[...name].length > 16 ? [...name].slice(0, 16).join("") + "…" : name}${open.length > 1 ? ` · ${open.length} 件` : ""}`;
    } else if (fs) {
      // 只选了方向的一轮专注：正计时
      const ms = Date.now() - Math.min(...fs.tasks.map((t) => t.start || fs.start || Date.now()));
      overdue = over(ms, cfg.pomoMinutes ?? 45);
      text = `⏱ ${elapsedText(ms)} · 专注`;
    } else {
      text = this._capText ? `🌀 ${this._capText}` : "🌀";
      warning = !!this._capWarn;
    }
    // Agent 会话几个在跑、几个在等你，另有一格（见 tickAgents）；那一格关了，这里照旧报自动记着的行里有几件 Agent 在做
    const st = cfg.agentStatus === false ? this.states.get(this.journalPath(this.today())) : null;
    if (st) {
      const auto = this.autoKeys(dayKey);
      const k = auto.size ? [...st].filter(([l, c]) => c.doing && auto.has(workKey(l))).length : 0;
      if (k) text += ` · 🤖${k}`;
    }
    if (el.getText() !== text) el.setText(text);
    el.toggleClass("is-overdue", overdue);
    el.toggleClass("is-forgotten", forgotten);
    el.toggleClass("is-warning", warning);
  }

  // 没在做事时状态栏显示的那句容量：一分钟算一次，日记改了也算一次
  async refreshCapacity() {
    try {
      const cfg = this.settings;
      const file = this.todayFile();
      if (!file || cfg.statusBar === false) { this._capText = ""; this._capWarn = false; return; }
      const dayKey = file.basename;
      const items = parseJournal(await this.app.vault.cachedRead(file), cfg);
      this.withCalendar(items, this.today());
      const m = moment(), now = normalize(m.hours() * 60 + m.minutes(), cfg), bounds = (cfg.dayBounds || {})[dayKey] || {};
      applyWork(items, cfg, dayKey, now, 0, bounds);
      const C = capacity(items, schedule(items, cfg, now, 0, bounds), cfg, now, 0, bounds);
      this._capText = capSummary(C);
      this._capWarn = C.tone === "warning";
    } catch (e) { console.error("[螺旋日程] 状态栏容量", e); }
  }

  async statusClick(ev) {
    if (!ev.altKey && !ev.shiftKey) return this.activate();
    const file = this.todayFile();
    if (!file) { new OB.Notice("今天还没有日记"); return; }
    let line = 0;
    if (this._statusKey) {
      const it = parseJournal(await this.app.vault.cachedRead(file), this.settings).find((i) => i.kind === "task" && i.state === "open" && workKey(i.label) === this._statusKey);
      if (it) line = it.line;
    }
    if (ev.shiftKey) await this.app.workspace.getLeaf("split").openFile(file, { eState: { line } });
    else await this.openLine(file, line);
  }

  // ---------------- 你手动做的时段写回日记 ----------------
  // 设置里打开才写。一件任务不再是 DOING（做完、暂停、改回 TODO）时，把它今天做过的几段写在它下面那一行 ⏱ 里，
  // 和自动记的行同一种写法。这样实际用时就留在日记正文里，不靠插件自己的计时记录（那份只留 45 天）
  queueClock(file, keys) {
    this._clockKeys = new Set([...(this._clockKeys || []), ...keys]);
    window.clearTimeout(this._clockTimer);
    this._clockTimer = window.setTimeout(() => this.flushClock(file).catch((e) => console.error("[螺旋日程] 写回实际时段失败", e)), 1500);
  }
  async flushClock(file, tries = 0) {
    const keys = [...(this._clockKeys || [])];
    if (!keys.length) return;
    const work = (this.settings.workLog || {})[file.basename] || {};
    const auto = this.autoKeys(file.basename);   // 自动记着的行由自动记日记自己写
    const base = await this.readJournal(file);
    let text = base;
    for (const k of keys) {
      const segs = auto.has(k) ? [] : (work[k] || []).filter((s) => s[1] != null);
      if (segs.length) text = this.autoClock(text, k, segs, "");
    }
    if (await this.writeJournal(file, base, text)) this._clockKeys = new Set();
    else if (tries < 3) this._clockTimer = window.setTimeout(() => this.flushClock(file, tries + 1).catch(() => {}), 2000);   // 你正好在改日记：等一下再写
  }
  // ---------------- 带按钮的系统通知 ----------------

  // 发一条带按钮的系统通知，等你点。返回点的按钮；"__click__" = 点了通知本身；"" = 没理；
  // null = 这台机器发不了（不是 macOS / 小助手没编出来 / 没给通知权限），一小时内不再试
  async ask(title, body, actions = [], wait = 600) {
    if (!(OB.Platform && OB.Platform.isMacOS) || (this._noNotify && Date.now() - this._noNotify < 3600e3)) return null;
    try {
      const fs = require("fs"), path = require("path");
      const dir = path.join(require("os").homedir(), "Library/Caches/nautilus-spiral/notify");
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      // -n 每条通知一个进程，-W 等它退出（点了按钮 / 到时间），-g 不抢焦点
      await run("/usr/bin/open", ["-n", "-W", "-g", await notifyTool(), "--args", file, title, body, String(wait), ...actions], (wait + 60) * 1000);
      let out = "__error__";
      try { out = await fs.promises.readFile(file, "utf8"); fs.promises.unlink(file).catch(() => {}); } catch (e) { /* 没写出结果 = 没跑起来 */ }
      if (out === "__click__") return out;
      if (out.startsWith("__")) { this._noNotify = Date.now(); return null; }
      return out;
    } catch (e) {
      console.error("[螺旋日程] 通知小助手用不了", e);
      this._noNotify = Date.now();
      return null;
    }
  }

  // 问一个要你选的问题：先发带按钮的通知（不抢焦点）；点了通知本身、或者这台机器发不了通知，再弹系统对话框。没理返回 ""
  async choose(title, body, buttons, def, wait) {
    if (this.settings.askVia !== "dialog") {
      const r = await this.ask(title, body, [def, ...buttons.filter((b) => b !== def).reverse()], wait);
      if (r != null && r !== "__click__") return r;
    }
    return dialog(`${title}\n${body}`, buttons, def, wait);
  }

  // ---------------- 大方向 ----------------

  // 设置里写的几个大方向（最多 4 个）：「🧩 Obsidian 改造」→ { emoji, name }
  dirs() {
    const list = splitList(this.settings.focusDirs).slice(0, 4).map((s) => {
      const m = /^(\p{Extended_Pictographic}\uFE0F?)\s*(.+)$/u.exec(s);
      return m ? { emoji: m[1], name: m[2].trim() } : { emoji: "🎯", name: s };
    });
    // 方向会变：不够 4 个的位置，用最近 7 天自动记日记时归出来、花时间最多的方向补上
    for (const name of this.seenDirs(7)) { if (list.length >= 4) break; if (!list.some((d) => d.name === name)) list.push({ emoji: "🧭", name }); }
    return list.length ? list : [{ emoji: "🎯", name: "专注" }];
  }
  // 最近几天用过的方向名，花时间多的在前
  seenDirs(days) {
    const log = this.settings.dirLog || {}, by = {};
    for (const k of Object.keys(log).sort().slice(-days)) for (const [d, m] of Object.entries(log[k])) if (d) by[d] = (by[d] || 0) + m;
    return Object.keys(by).sort((a, b) => by[b] - by[a]);
  }
  // 给小模型参考的方向名：设置里写的 + 最近两周用过的
  knownDirs() {
    const conf = splitList(this.settings.focusDirs).map((s) => s.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "").trim()).filter(Boolean);
    return [...new Set([...conf, ...this.seenDirs(14)])].slice(0, 12);
  }

  // 每周方向回顾：这一周（周一到周日，按日记日算）各个大方向花了多久、占多少，和上一周比。没有数据返回 null
  weeklyDirs(ref = this.today()) {
    const cfg = this.settings, log = cfg.dirLog || {};
    const start = ref.clone().startOf("isoWeek");
    const sum = (from) => {
      const by = {};
      let days = 0;
      for (let i = 0; i < 7; i++) {
        const d = log[from.clone().add(i, "days").format(cfg.format)];
        if (!d) continue;
        days++;
        for (const [k, m] of Object.entries(d)) by[k] = (by[k] || 0) + m;
      }
      return { by, days };
    };
    const cur = sum(start), prev = sum(start.clone().subtract(7, "days"));
    const total = Object.values(cur.by).reduce((k, m) => k + m, 0);
    if (!total) return null;
    const rows = Object.entries(cur.by).filter(([k, m]) => k && m).sort((a, b) => b[1] - a[1]);
    const pct = (m) => Math.round(m / total * 100);
    const lines = [`🧭 本周方向 · ${start.format("M/D")}–${start.clone().add(6, "days").format("M/D")}（有记录的 ${cur.days} 天）`, ""];
    for (const [name, m] of rows) lines.push(`${"▇".repeat(Math.max(1, Math.round(m / total * 12)))} ${name}　${dur(m)}　${pct(m)}%${prev.days ? (prev.by[name] ? `（上周 ${dur(prev.by[name])}）` : "（上周没有）") : ""}`);
    if (cur.by[""]) lines.push(`▫️ 没归到方向的　${dur(cur.by[""])}　${pct(cur.by[""])}%`);
    lines.push("", `合计 ${dur(total)}。只算了 Agent 会话里的时间，不经过 Claude / Codex / WorkBuddy 做的事不在里面。`, "下周想把哪个方向调多、哪个调少？");
    return lines.join("\n");
  }
  // 用 Telegram Companion 的机器人给你发一条文字：令牌和你的聊天号都从它的设置里读，螺旋日程自己不存。没装或者还没和机器人说过话，返回 false
  async toTelegram(text) {
    const ps = this.app.plugins.plugins;
    const tp = ps["telegram-companion"] || ps["telegram-inbox-local"];
    const token = tp?.settings?.token, chat = tp?.settings?.owner_chat_id;
    if (!token || !chat) return false;
    try {
      await OB.requestUrl({ url: `https://api.telegram.org/bot${token}/sendMessage`, method: "POST", contentType: "application/json", body: JSON.stringify({ chat_id: chat, text }) });
      return true;
    } catch (e) { console.error("[螺旋日程] Telegram 没发出去", e); return false; }
  }
  // 发出去：装了 Telegram Companion 就用它的机器人发，没有就发 Discord，再没有就只在 Obsidian 里显示
  async sendWeekly() {
    const text = this.weeklyDirs();
    if (!text) return "这一周还没有按方向记下来的时间";
    if (await this.toTelegram(text)) return "发到 Telegram 了";
    if (await this.toDiscord(text)) return "发到 Discord 了";
    new OB.Notice(text, 20000);
    return "Telegram 和 Discord 都没发出去，先显示在这里";
  }
  // 周日晚上 9 点以后（按日记日算，过了零点还算周日）发一次
  weeklyTick() {
    const cfg = this.settings;
    if (cfg.weeklyDirs === false) return;
    const day = this.today(), nowM = moment(), h = nowM.hours() + nowM.minutes() / 60;
    const week = day.format("GGGG-[W]WW");
    if (day.isoWeekday() !== 7 || (h < 21 && h >= (cfg.dayCutoff ?? 8)) || cfg.weeklySent === week || this._weeklyBusy) return;
    this._weeklyBusy = true;
    this.sendWeekly().then(() => { cfg.weeklySent = week; return this.saveData(cfg); }).catch((e) => console.error("[螺旋日程] 每周方向回顾没发出去", e)).finally(() => { this._weeklyBusy = false; });
  }

  // 这一天各个大方向花了多久（分钟）：自动记进日记的会话各归到哪个方向，同一方向几个会话同时开只算一次
  dirStats(dayKey = this.today().format(this.settings.format)) {
    const st = (this.settings.autoLogState || {})[dayKey] || {};
    const day = this.aiStore && aiPick(this.aiStore.days[dayKey], this.settings);
    const by = {};
    for (const x of (day && day.list) || []) {
      const rec = st[x.sid];
      if (rec && rec.dir && !rec.skip && !rec.gone) (by[rec.dir] ||= []).push(...x.segs);
    }
    const out = {};
    for (const k in by) out[k] = Math.round(unionSegs(by[k]).reduce((n, [a, b]) => n + b - a, 0));
    return out;
  }

  // 提议开一轮专注：弹一个框选大方向和时长（不列一条条任务）。已经在专注、或者在吃饭 / 锻炼时不问。
  // 用时不在这里按条目记了：具体做了什么、各用了多久，由「自动记日记」按 Agent 会话记
  async suggestFocus(app, stay) {
    const cfg = this.settings;
    const s = this.session();
    if (this._suggesting || (s && !s.asked) || cfg.breakState) {
      if (!app && s && !s.asked) new OB.Notice("已经在专注了");
      return;
    }
    this._suggesting = true;
    try {
      if (app) await run("/usr/bin/open", ["-a", "Obsidian"]);   // 从别的 App 里被叫出来的：把 Obsidian 拿到前面再弹框
      const pick = await new Promise((ok) => new FocusModal(this.app, this, { app, stay }, ok).open());
      if (!pick || this.session()?.asked === false) return;
      cfg.lastDir = pick.dir.name;
      cfg.lastDirMinutes = pick.minutes;
      const now = Date.now();
      this.startSession([{ key: "§" + pick.dir.name, label: `${pick.dir.emoji} ${pick.dir.name}`, path: null, dir: true, start: now, minutes: pick.minutes, end: now + pick.minutes * 60e3, round: 1 }]);
    } finally { this._suggesting = false; }
  }

  // ---------------- 自动把 Agent 会话记进今天的日记 ----------------
  // 每隔一阵看一眼今天有哪些 Claude / Codex / WorkBuddy 会话在动：
  //   · 新会话：让小模型看标题、你说的话、最后一条回复，起一个短名字，并看它是不是日记里已有的某一行（是就接在那一行上，不是就新写一行）
  //   · 还在动 = DOING；停了一阵 = PAUSED（暂停），小模型看着像做完了的只提醒，回复里明说要你做的事另记成 TODO
  //   · 你在 Claude 桌面 app 里把会话归档了 = 做完了，它那一行记成 DONE（前几天记下、还挂着的行也补上）
  //   · 用时按会话真正在动的时段算，写进计时记录（workLog），螺旋和列表照常统计；新写的 DONE 行尾带上时长
  // 你自己改过状态、或者删掉的行，之后不再管。状态记在 autoLogState：{ 日记日: { 会话号: { key, label, dir, status, min, … } } }

  autoState(dayKey) { return ((this.settings.autoLogState ||= {})[dayKey] ||= {}); }
  // 这一天由自动记录管着计时的那些行（不走「改成 DOING 就开始计时」那一套，也不受 DOING 上限和超时暂停管）
  autoKeys(dayKey) {
    const st = (this.settings.autoLogState || {})[dayKey] || {};
    return new Set(Object.values(st).filter((r) => r.key && !r.skip && !r.gone).map((r) => r.key));
  }

  journalView(file) {
    let view = null;
    this.app.workspace.iterateAllLeaves((l) => { if (!view && l.view instanceof OB.MarkdownView && l.view.file?.path === file.path && l.view.getMode() === "source") view = l.view; });
    return view;
  }
  async readJournal(file) {
    const v = this.journalView(file);
    return v ? v.editor.getValue() : this.app.vault.read(file);
  }
  // 整篇换成 next，只动前后不一样的那几行。base = 算 next 时依据的原文；这期间日记又被改过就不写，返回 false
  async writeJournal(file, base, next) {
    if (base === next) return true;
    const v = this.journalView(file);
    if (v) {
      if (v.editor.getValue() !== base) return false;
      const ch = diffLines(base, next);
      if (ch) v.editor.transaction({ changes: [ch] });
      return true;
    }
    let ok = false;
    await this.app.vault.process(file, (cur) => { ok = cur === base; return ok ? next : cur; });
    return ok;
  }
  // 把一块放进日记：装了「任务归位」就按状态进各自的分区，没装就接在最后
  placeBlock(text, blockLines) {
    const core = this.app.plugins.plugins["done-to-top"]?.core;
    if (core && core.addBlock) return core.addBlock(text, blockLines);
    return text.replace(/\s*$/, "\n") + blockLines.join("\n") + "\n";
  }

  // 这个会话最近说了什么：你发的最后几句 + 最后一条回复的结尾
  async sessionTail(x) {
    const fs = require("fs");
    const agent = aiAgent(x);
    let best = null;
    for (const [p, fc] of (this._ai ? this._ai.files : new Map())) {
      if ((fc.agent || "claude") !== agent) continue;
      // Claude：会话自己的那个文件优先。subagent 的文件、抄了它全部历史的 side chat / 续接文件里也有它的行，而且可能更大，读那些会读到空的或旧的
      const own = agent === "claude" && !fc.sub && fc.id === x.sid;
      const hit = own || (agent === "claude" ? !fc.sub && [...fc.days.values()].some((d) => d.sess.has(x.sid)) : fc.sid === x.sid);
      if (hit && (!best || (own && !best.own) || (own === best.own && fc.size > best.size))) best = { p, size: fc.size, own };
    }
    const out = { prompts: [], last: "", full: "" };
    if (!best) return out;
    const len = Math.min(best.size, 400 * 1024);
    const buf = Buffer.alloc(len);
    const fh = await fs.promises.open(best.p, "r");
    try { await fh.read(buf, 0, len, best.size - len); } finally { await fh.close(); }
    const lines = buf.toString("utf8").split("\n");
    if (len < best.size) lines.shift();   // 从中间读起，第一行是半截
    const texts = (list, type) => (Array.isArray(list) ? list : []).filter((b) => b && b.type === type).map((b) => b.text || "").join("\n").trim();
    for (const line of lines) {
      if (!line) continue;
      let d;
      try { d = JSON.parse(line); } catch (e) { continue; }
      if (agent === "claude") {
        if (d.sessionId !== x.sid || d.isSidechain) continue;
        if (d.type === "user") { const t = aiIsPrompt(d); if (t) out.prompts.push(t); }
        else if (d.type === "assistant") { const t = texts(d.message && d.message.content, "text"); if (t) out.last = t; }
      } else if (agent === "workbuddy") {
        if (d.type !== "message") continue;
        if (d.role === "user") { const t = texts(d.content, "input_text").replace(/<system-reminder[\s\S]*?<\/system-reminder>/g, "").trim(); if (t) out.prompts.push(t); }
        else { const t = texts(d.content, "output_text"); if (t) out.last = t; }
      } else {
        const p = d.payload || {};
        if (d.type === "response_item" && p.type === "message" && p.role === "user") { const t = texts(p.content, "input_text"); if (t && !t.startsWith("<")) out.prompts.push(t); }
        else if (d.type === "event_msg" && p.type === "task_complete" && p.last_agent_message) out.last = String(p.last_agent_message);
      }
    }
    // 一长串数字（卡号、密钥之类）不往外带
    const clip = (s) => s.replace(/\d{12,}/g, "…").replace(/\s+/g, " ").trim();
    out.full = out.last.slice(0, 8000);   // 最后一条回复的原文（结果回写用，见 resultText）
    out.prompts = out.prompts.slice(-4).map((t) => clip(t).slice(0, 160));
    out.last = clip(out.last).slice(-700);
    return out;
  }

  // 让小模型看这几个会话：各起一个短名字、对上日记里已有的哪一行、归哪个大方向；停了的再看是不是其实做完了、有没有要你做的后续。
  // 返回 Map(会话号 → { label, matchKey, done, dir, todos, skip })；模型没回或者回得不对，返回空 Map，下一轮再问
  async autoAsk(ask, open, fallback = false) {
    const cfg = this.settings;
    const dirs = this.knownDirs();
    const tails = await Promise.all(ask.map(({ x }) => this.sessionTail(x).catch(() => ({ prompts: [], last: "" }))));
    const ids = new Map();
    const blocks = ask.map(({ x, active }, i) => {
      const id = "s" + (i + 1), t = tails[i];
      ids.set(id, x.sid);
      return [`#${id} [${AI_AGENTS[aiAgent(x)]}] 标题：${x.title || "（没有）"}；累计 ${x.min} 分钟；现在：${active ? "还在进行" : "已经停了"}`,
        x.text ? `开头说的：${x.text.replace(/\d{12,}/g, "…").slice(0, 200)}` : "",
        t.prompts.length ? `最近说的：${t.prompts.join(" / ")}` : "",
        t.last ? `最后一条回复的结尾：${t.last}` : ""].filter(Boolean).join("\n");
    });
    const prompt = [
      "下面是用户今天和 AI 助手的几个工作会话，以及他今天日记里还没做完的任务行。请把每个会话整理成一条任务记录。",
      "",
      "【日记里还没做完的任务行】（编号: 状态 文字）",
      open.length ? open.map((i, n) => `${n + 1}: ${i.doing ? "DOING" : i.suspended ? "SUSPENDED" : i.paused ? "PAUSED" : "TODO"} ${workKey(i.label)}`).join("\n") : "（没有）",
      "",
      `【已有的大方向】${dirs.join(" / ") || "（还没有）"}`,
      "",
      "【会话】",
      blocks.join("\n\n"),
      "",
      "只输出一个 JSON 数组，每个会话一项，不要解释、不要代码块：",
      '[{"id":"s1","label":"…","match":null,"done":false,"dir":"…","todos":[],"skip":false}]',
      "字段：",
      "- label：这件事是什么，不超过 20 个字的中文短语（动词开头，比如「给螺旋日程加悬停文字」），不要带时间、时长、状态词和标点结尾。",
      "- match：只有当上面某一行写的就是「这个会话里 AI 在替用户做的那件工作本身」时，才填那一行的编号。那一行如果是留给用户本人的动作（看一眼、看效果、确认、拍板、自己跑命令、发出去、阅读、装到手机上之类），哪怕话题一样也不能匹配，填 null。拿不准一律填 null。",
      "- done：只对已经停了的会话有意义。最后的回复明确表明这件事整个做完了，填 true；做到一半、还在等用户、报错没解决、说了以后再继续，都填 false。",
      "- dir：这件事归到哪个大方向。优先用上面已有的名字；都不合适时自己起一个不超过 6 个字的方向名（比如「投资研究」「健康」），同一类事要用同一个名字。纯粹的杂事填空字符串。",
      "- todos：只在会话已经停了时填。回复里明确说了要用户本人去做或拍板的事，每条不超过 30 个字，最多 1 条，只列不做就卡住的那一件，顺带一提的、可做可不做的不列；没有就是空数组。不要自己发挥。上面的任务行里已经有意思相同的（换了说法也算），就不要再列。",
      "- skip：一两句闲聊或问答、没有实际做事的会话填 true。",
    ].join("\n");
    let raw;
    try { raw = await runJudge(prompt, cfg); }
    catch (e) {
      console.error("[螺旋日程] 自动记日记：问模型失败", e);
      this._autoErr = String(e.message || e);
      const out = new Map();
      // 手动整理时模型问不到（没登录、额度用完…）：先用会话自己的标题当名字记上，不去对日记里已有的行、也不分方向。总比不记强；
      // 自动的那种不这么做，等下一轮模型回来了再问
      if (fallback) for (const { x } of ask) {
        const label = safeLabel(x.title || (x.text || "").split(" / ")[0], cfg).slice(0, 40);
        if (label) out.set(x.sid, { label, matchKey: null, done: false, dir: "", todos: [], skip: false });
      }
      return out;
    }
    const out = new Map();
    try {
      const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
      for (const a of arr) {
        const sid = ids.get(String(a.id));
        if (!sid) continue;
        const label = safeLabel(a.label, cfg).slice(0, 40);
        const m = Number.isInteger(a.match) && open[a.match - 1] ? open[a.match - 1] : null;
        out.set(sid, {
          label, matchKey: m ? workKey(m.label) : null, done: a.done === true,
          dir: String(a.dir || "").replace(/[\s,，]+/g, " ").trim().slice(0, 12),
          todos: (Array.isArray(a.todos) ? a.todos : []).map((t) => safeLabel(t, cfg).slice(0, 50)).filter(Boolean).slice(0, 1),
          skip: !!a.skip || (!label && !m),
        });
      }
      this._autoErr = "";
    } catch (e) { console.error("[螺旋日程] 自动记日记：模型回的不是 JSON", raw); this._autoErr = "模型回的不是 JSON"; }
    return out;
  }

  // 手动整理一次（⌃⌥L、螺旋上「人机协作」旁边的按钮、⌃⌥V 面板里的按钮）：和自动记日记是同一套，不用开着自动、也不用等间隔。
  // 自动的那种一轮最多问 8 个会话，剩下的等下一轮；手动的接着问到问完为止
  async logNow() {
    const changes = [];
    let error = "";
    for (let round = 0; round < 5; round++) {
      const r = await this.autoLogRun({ fallback: true });
      changes.push(...r.changes);
      error = r.error || "";
      if (error || r.asked < 8) break;
    }
    this._autoAt = Date.now();
    if (changes.length) this.sound("log");
    new OB.Notice(error && !changes.length ? `没整理成：${error}` : changes.length ? `整理进日记了：\n${changes.join("\n")}${error ? `\n（模型没问到，新会话先用它自己的标题记的：${error}）` : ""}` : "没有要改的：会话都已经记过了，或者还太短（不到 3 分钟）", 9000);
    this.refresh();
    return { changes, error };
  }
  // 这一行现在是什么状态：done / doing / paused / suspended / open（TODO）；找不到返回 null
  autoFind(text, key) {
    const hits = parseJournal(text, this.settings).filter((i) => i.kind === "task" && workKey(i.label) === key);
    const it = hits.find((i) => i.state === "open") || hits[0];
    return it ? { it, cur: it.state === "done" ? "done" : it.doing ? "doing" : it.paused ? "paused" : it.suspended ? "suspended" : "open" } : null;
  }
  // 这一行是机器自己停下的：机器写的 PAUSED（rec.autoPaused），或者改成暂停之前记的老 SUSPENDED。你自己改成 PAUSED 的不算
  autoParked(rec, cur) { return cur === "suspended" || (cur === "paused" && !!rec.autoPaused); }

  // 把一个会话对应的那一行改成 DOING 或 PAUSED（机器自己只在这两个之间切）；status = "done" 只在你把会话归档了的时候用：
  // 写成「DONE 最后有动静的时刻」，不写起止时间段（中间断过的会话，时间段会把空档也算进去），实际用时看下面的 ⏱ 子项。
  // 那一行不存在而且是新会话，就新写一行。x = 这个会话这一天的记录，前几天的明细没了就是 null（DONE 后面不写时刻）
  autoLine(text, rec, x, status) {
    const lines = text.split("\n");
    const found = this.autoFind(text, rec.key);
    const first = x ? x.segs[0][0] : 0;
    const done = (body) => `DONE ${x ? clock(x.segs[x.segs.length - 1][1]) + " " : ""}${body}`;
    if (!found) {
      if (!rec.fresh) return { text, gone: true };
      return { text: this.placeBlock(text, [status === "doing" ? `- DOING ${clock(first)} ${rec.label}` : status === "done" ? `- ${done(rec.label)}` : `- PAUSED ${rec.label}`]) };
    }
    const { it } = found;
    const raw = lines[it.line];
    const p = splitTask(raw);
    if (!p) return { text };
    // 自己写的行文字是定的；接在你写的行上就留着你的原话，只去掉开头的时间段
    const body = rec.created ? rec.label : p.rest.replace(/^\d{1,2}[:：]\d{2}\s*[-–~～到至]\s*\d{1,2}[:：]\d{2}\s*/, "");
    const next = status === "doing" ? `${p.prefix}DOING ${p.since && p.kw === "DOING" ? p.since : clock(rec.created ? first : x.segs[x.segs.length - 1][0])} ${body}`
      : status === "done" ? p.prefix + done(body) : `${p.prefix}PAUSED ${body}`;
    if (next === raw) return { text };
    // 顶格的行换了状态要挪到那个状态的分区里（连同子项）；缩进的子项原地改
    const core = this.app.plugins.plugins["done-to-top"]?.core;
    if (core && core.dropBlocks && core.zoneOf && !/^\s/.test(raw) && core.zoneOf(raw) !== core.zoneOf(next)) {
      const block = subtree(lines, it.line).split("\n");
      while (block.length > 1 && !block[block.length - 1].trim()) block.pop();
      const dropped = core.dropBlocks(text, [block]);
      if (dropped !== text) return { text: core.addBlock(dropped, [next, ...block.slice(1)]) };
    }
    lines[it.line] = next;
    return { text: lines.join("\n") };
  }

  // 实际做的时段写在那一行下面的第一个子项里（⏱ 开头，解析日记时跳过这种行）：⏱ 00:45–00:58、04:02–05:10 · 共 1h21m · 48k tok · Claude
  // tok = 这一行名下的会话当天用掉的 token（产出 + 读入），你自己做的没有；sid = 只有一个 Claude 会话时它的会话号，谁记的那两个字就写成能点回那个会话的链接
  // 隔了不到 10 分钟的两段并成一段写，免得太碎；太多段只写最后 8 段
  autoClock(text, key, segs, who, tok = 0, sid = "") {
    const found = this.autoFind(text, key);
    if (!found || !segs.length) return text;
    const lines = text.split("\n");
    const at = found.it.line;
    const shown = [];
    for (const [a, b] of segs) { const last = shown[shown.length - 1]; if (last && a - last[1] <= 10) last[1] = Math.max(last[1], b); else shown.push([a, b]); }
    const total = Math.round(segs.reduce((n, [a, b]) => n + b - a, 0));
    const indent = /^\s*/.exec(lines[at])[0] + "\t";
    const line = `${indent}- ⏱ ${shown.length > 8 ? "… " : ""}${shown.slice(-8).map(([a, b]) => `${clock(a)}–${clock(b)}`).join("、")} · 共 ${durTag(total)}${tok ? ` · ${fmtTok(tok)} tok` : ""}${who ? " · " + (sid && who === AI_AGENTS.claude ? `[${who}](${claudeLink(sid)})` : who) : ""}`;
    // 这个会话的「🔗」行不用留了：会话是哪个，已经写在 ⏱ 行末尾的链接里
    if (sid) { const l = linkUnder(lines, at); if (l && l.sid === sid) lines.splice(l.line, 1); }
    const base = /^\s*/.exec(lines[at])[0].replace(/\t/g, "    ").length;
    for (let i = at + 1; i < lines.length; i++) {
      if (lines[i].trim() && /^\s*/.exec(lines[i])[0].replace(/\t/g, "    ").length <= base) break;
      if (/^\s*[-*+]\s+⏱/.test(lines[i])) { if (lines[i] === line) return text; lines[i] = line; return lines.join("\n"); }
    }
    lines.splice(at + 1, 0, line);
    return lines.join("\n");
  }

  // 前几天记下、到现在还挂着（DOING / 机器停下的 PAUSED，以及以前记的 SUSPENDED）的行：会话归档了，就在它当天的日记里补成 DONE。
  // 你自己改成 TODO / PAUSED 的不动。返回改了的（给提醒用）；日记正好在被改的那一天这一轮跳过，下一轮再来
  async autoArchivePast(arch, todayKey, dry, report) {
    const cfg = this.settings;
    const out = [];
    for (const dayKey of Object.keys(cfg.autoLogState || {})) {
      if (dayKey === todayKey) continue;
      const hits = Object.entries(cfg.autoLogState[dayKey]).filter(([sid, r]) => arch.has(sid) && r.key && !r.skip && !r.gone && (r.status === "doing" || this.autoParked(r, r.status)));
      if (!hits.length) continue;
      const file = this.app.vault.getAbstractFileByPath(`${cfg.folder}/${dayKey}.md`);
      if (!(file instanceof TFile)) continue;
      const base = await this.readJournal(file);
      let text = base;
      const list = (this.aiStore && aiPick(this.aiStore.days[dayKey], cfg) || {}).list || [];
      const work = (cfg.workLog || {})[dayKey] || {};
      const after = [];
      for (const [sid, rec] of hits) {
        const found = this.autoFind(text, rec.key);
        if (!found) { after.push(() => { rec.gone = true; }); continue; }
        if (found.cur !== "doing" && !this.autoParked(rec, found.cur)) { after.push(() => { rec.status = found.cur; delete rec.autoPaused; }); continue; }
        const x = list.find((s) => s.sid === sid && s.segs && s.segs.length) || null;
        text = this.autoLine(text, rec, x, "done").text;
        const segs = (work[rec.key] || []).filter((s) => s[1] != null);
        if (segs.length) text = this.autoClock(text, rec.key, segs, x ? AI_AGENTS[aiAgent(x)] : "", tokUsed(x), x && aiAgent(x) === "claude" ? x.sid : "");
        const name = workKey(rec.label).replace(AUTO_MARK, "");
        after.push(() => { rec.status = "done"; delete rec.autoPaused; });
        out.push(`${name}（${dayKey.replace(/\D+/g, "-").slice(5)}）`);
        report.changes.push(`DONE（已归档，${dayKey}）：${rec.label}`);
      }
      if (dry) continue;
      if (await this.writeJournal(file, base, text)) after.forEach((f) => f());
      else out.splice(0, out.length, ...out.filter((s) => !s.endsWith(`（${dayKey.replace(/\D+/g, "-").slice(5)}）`)));
    }
    return out;
  }

  // dry = 只算不写，返回打算怎么改（report.diff）
  // fallback = 模型问不到时用会话标题先记上（手动整理时用）
  async autoLogRun({ dry = false, fallback = false } = {}) {
    const cfg = this.settings;
    const report = { asked: 0, changes: [], error: "" };
    if (this._autoBusy || !(OB.Platform && OB.Platform.isDesktopApp)) return report;
    this._autoBusy = true;
    let dayKey = "", snap = null;
    try {
      const file = this.todayFile();
      if (!file) return report;
      await this.aiUsage();
      if (!this._aiBusy) await this.scanAi();
      dayKey = file.basename;
      const day = this.aiStore && aiPick(this.aiStore.days[dayKey], cfg);
      if (!day || !day.list) return report;
      const nowM = moment();
      const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
      const idle = Math.max(5, cfg.autoLogIdle || 40);
      const st = this.autoState(dayKey);
      snap = JSON.stringify(st);
      const since = cfg.autoLogSince ? aiDay(cfg.autoLogSince, cfg) : null;
      const lastOf = (x) => x.segs[x.segs.length - 1][1];
      // 你在 Claude 桌面 app 或 Codex 里归档了的会话 = 做完了
      const arch = cfg.autoLogArchiveDone !== false ? await archivedSessions(this._archCache ||= new Map()).catch(() => new Set()) : new Set();
      if (cfg.autoLogArchiveDone !== false && aiOn(cfg).includes("codex")) for (const sid of await AiUsage.codexArchived()) arch.add(sid);
      const todo = [], live = [];
      for (const x of day.list) {
        if (!x.segs || !x.segs.length) continue;
        const last = lastOf(x), active = now - last <= idle;
        const rec = st[x.sid];
        if (rec && (rec.skip || rec.gone)) continue;
        if (!rec) {
          if (since && (since.key > dayKey || (since.key === dayKey && last < since.t))) continue;   // 开启之前就停了的会话不补记
          if (x.min < 3) continue;   // 刚开头 / 一两句问答，先不记
          todo.push({ x, active, fresh: true });
        } else if (rec.status === "doing" && !active && !rec.asked && !arch.has(x.sid)) todo.push({ x, active, rec });   // 刚停下来：问一次是不是其实做完了、有没有要你做的（归档了的不用问）
        else live.push({ x, active, rec });
      }
      // 0. 日记里已经用「🔗」行绑好的新会话：是哪一行已经写明了，不用问小模型，直接接在那一行上
      const linked = linkMap(await this.readJournal(file), cfg);
      const bound = todo.filter((t) => t.fresh && linked.has(t.x.sid)), unbound = todo.filter((t) => !(t.fresh && linked.has(t.x.sid)));
      // 1. 新会话、刚停下来的会话：问小模型（一次最多 8 个，多的下一轮）
      const ask = unbound.slice(0, 8);
      let ans = new Map();
      if (ask.length) {
        // 能接上去的行：还没做完的任务。带子任务的大项不算，自己记的「要你做的后续」也不算
        const open = parseJournal(await this.readJournal(file), cfg).filter((i) => i.kind === "task" && i.state === "open" && !i.container && !(i.label.startsWith(AUTO_MARK.trim()) && !i.doing && !i.paused && !i.suspended)).slice(0, 60);
        ans = await this.autoAsk(ask, open, fallback);
        report.asked = ask.length;
        report.error = this._autoErr || "";
      }
      for (const t of bound) ans.set(t.x.sid, { label: "", matchKey: linked.get(t.x.sid), done: false, dir: "", todos: [], skip: false });
      // 归档了、又是「🔗」绑着的会话：先把它最后说的话读出来，下面标 DONE 时一起写成「💬」行（🔗 行到时候就收掉了）
      const said = new Map();
      if (cfg.resultBack !== false) for (const x of day.list) if (arch.has(x.sid) && linked.has(x.sid)) {
        const t = await this.sessionTail(x).catch(() => null);
        if (t && t.full) said.set(x.sid, resultText(t.full, cfg.resultMax));
      }
      // 2. 照着改日记（从这里到写回之间不等别的东西，免得你正好在打字）
      const base = await this.readJournal(file);
      let text = base;
      const work = ((cfg.workLog ||= {})[dayKey] ||= {});
      const digest = { doing: [], paused: [], done: [], archived: [], todo: [] };
      const clocks = new Set();
      for (const { x, active, fresh } of [...bound, ...ask, ...unbound.slice(8), ...live]) {
        const a = ans.get(x.sid);
        const last = lastOf(x);
        let rec = st[x.sid];
        if (fresh) {
          if (!a) continue;
          if (a.skip) { st[x.sid] = { skip: true }; continue; }
          // 对上了日记里的行：那一行要么已经在做（DOING / PAUSED / SUSPENDED），要么这个会话现在还在动（你看得到它变成 DOING）。
          // 第一次见到就已经停了的会话不去碰你写的 TODO，另记一行
          let m = a.matchKey && parseJournal(text, cfg).find((i) => i.kind === "task" && i.state === "open" && !i.container && workKey(i.label) === a.matchKey);
          if (m && !active && !m.doing && !m.paused && !m.suspended) m = null;
          if (!m && !a.label) { st[x.sid] = { skip: true }; continue; }
          const label = m ? m.label : AUTO_MARK + a.label;
          const probe = parseJournal(`- TODO ${label}`, cfg)[0];   // 这一行写进日记后会被读成什么名字，就按什么名字记
          rec = st[x.sid] = { key: workKey(probe && probe.label ? probe.label : label), label, created: !m, dir: a.dir, status: m ? (m.doing ? "doing" : m.paused ? "paused" : m.suspended ? "suspended" : "open") : null, fresh: !m };
          // 接手你正在计时的行：之前开着的那一段收在这个会话开始的时刻，之后的用时按会话真正在动的时段算
          const seg = (work[rec.key] || []).find((s) => s[1] == null);
          if (seg) { seg[1] = Math.max(seg[0], Math.min(now, x.segs[0][0])); if (seg[1] - seg[0] < 1) work[rec.key].splice(work[rec.key].indexOf(seg), 1); }
        }
        rec.min = x.min;
        if (a) { rec.asked = !active; if (a.dir && !rec.dir) rec.dir = a.dir; }
        if (active) delete rec.asked;
        const found = this.autoFind(text, rec.key);
        if (!found && !rec.fresh) { rec.gone = true; report.changes.push(`不再管：${rec.label}（这一行没了）`); continue; }
        const cur = found ? found.cur : null;
        // 你自己标成 DONE 的：到此为止，把实际时段补在下面
        if (cur === "done") { if (rec.status !== "done") clocks.add(rec.key); rec.status = "done"; continue; }
        // 你手动改过状态：照你改的记。你停下的，要等会话有了新动静才改回 DOING；你改成 DOING 的，两小时内不因为会话没动就暂停
        if (rec.status && cur !== rec.status) {
          if (cur === "doing") rec.hold = Date.now() + 2 * 3600e3; else rec.parkedAt = now;
          rec.status = cur; delete rec.autoPaused;
        }
        const name = workKey(rec.label).replace(AUTO_MARK, "");
        // 你把这个会话归档了：算做完，标 DONE，实际时段补在下面。你自己改回 TODO / PAUSED 的行不动
        if (arch.has(x.sid) && (fresh || cur === "doing" || this.autoParked(rec, cur))) {
          text = resultInto(this.autoLine(text, rec, x, "done").text, x.sid, said.get(x.sid));
          rec.status = "done"; delete rec.fresh; delete rec.parkedAt; delete rec.hold; delete rec.autoPaused;
          clocks.add(rec.key);
          digest.archived.push(`${name}（${dur(x.min)}）`);
          report.changes.push(`DONE（已归档）：${rec.label}（${dur(x.min)}）`);
          continue;
        }
        if (active && cur !== "doing" && !(rec.parkedAt != null && last <= rec.parkedAt)) {
          const r = this.autoLine(text, rec, x, "doing");
          text = r.text; rec.status = "doing"; delete rec.parkedAt; delete rec.fresh; delete rec.autoPaused;
          digest.doing.push(name);
          report.changes.push(`DOING：${rec.label}`);
        } else if (!active && (cur === "doing" || rec.fresh) && !(rec.hold && Date.now() < rec.hold)) {
          const r = this.autoLine(text, rec, x, "paused");
          text = r.text; rec.status = "paused"; rec.autoPaused = true; rec.parkedAt = last; delete rec.fresh;
          clocks.add(rec.key);
          digest.paused.push(`${name}（${dur(x.min)}）`);
          report.changes.push(`PAUSED：${rec.label}（${dur(x.min)}）`);
        }
        // 模型看着像是整个做完了：只提醒，不替你标 DONE
        if (a && !active && a.done && !rec.doneHint) { rec.doneHint = true; digest.done.push(`${name}（${dur(x.min)}）`); report.changes.push(`看着做完了：${rec.label}`); }
        // 回复里明说要你做的后续：记一条 TODO（一个会话只记一次）
        if (a && !active && a.todos.length && !rec.todosAdded) {
          const have = parseJournal(text, cfg).filter((i) => i.kind === "task").map((i) => workKey(i.label));
          for (const t of a.todos) {
            const tags = t.match(/[A-Z]{2,}-\d+/g) || [];
            if (have.some((k) => k.includes(t) || (tags.length && tags.every((id) => k.includes(id))))) continue;
            text = this.placeBlock(text, [`- TODO ${AUTO_MARK}${t}`]);
            digest.todo.push(t);
            report.changes.push(`TODO：${t}`);
          }
          rec.todosAdded = true;
        }
      }
      // 3. 用时：各个会话真正在动的时段，记到它那一行名下（同一行接了几个会话就并起来）；暂停和做完的，时段写进日记正文
      const byKey = new Map(), who = new Map(), toks = new Map(), sids = new Map();
      for (const x of day.list) {
        const rec = st[x.sid];
        if (!rec || rec.skip || rec.gone || !rec.key) continue;
        toks.set(rec.key, (toks.get(rec.key) || 0) + tokUsed(x));
        (sids.get(rec.key) || sids.set(rec.key, []).get(rec.key)).push(aiAgent(x) === "claude" ? x.sid : "");
        (byKey.get(rec.key) || byKey.set(rec.key, []).get(rec.key)).push(...x.segs);
        (who.get(rec.key) || who.set(rec.key, new Set()).get(rec.key)).add(AI_AGENTS[aiAgent(x)]);
      }
      const merged = new Map();
      for (const [k, segs] of byKey) merged.set(k, unionSegs([...(work[k] || []).filter((s) => s[1] != null), ...segs].map(([a, b]) => [a, b])));
      for (const k of clocks) if (merged.has(k)) text = this.autoClock(text, k, merged.get(k), [...who.get(k)].join(" / "), toks.get(k) || 0, (sids.get(k) || []).length === 1 ? sids.get(k)[0] : "");
      report.diff = diffLines(base, text);
      if (!dry) this._muteUntil = Date.now() + 4000;
      if (dry) { await this.autoArchivePast(arch, dayKey, true, report); cfg.autoLogState[dayKey] = JSON.parse(snap); return report; }
      if (!(await this.writeJournal(file, base, text))) {
        cfg.autoLogState[dayKey] = JSON.parse(snap);   // 日记正好被改了：这一轮不算，下一轮重来
        report.error = "日记正在被改，这一轮没写";
        return report;
      }
      for (const [k, segs] of merged) work[k] = segs;
      if (arch.size) digest.archived.push(...await this.autoArchivePast(arch, dayKey, false, report));
      // 各个大方向今天花了多久，另存一份给每周回顾用（会话的明细只留最近几天）
      (cfg.dirLog ||= {})[dayKey] = { ...this.dirStats(dayKey), "": Math.max(0, Math.round((day.wall || 0) - Object.values(this.dirStats(dayKey)).reduce((n, m) => n + m, 0))) };
      for (const k of Object.keys(cfg.dirLog).sort().slice(0, -70)) delete cfg.dirLog[k];
      for (const k of Object.keys(cfg.autoLogState).sort().slice(0, -4)) delete cfg.autoLogState[k];
      await this.saveData(cfg);
      this.refresh();
      if (cfg.autoLogNotify !== false) this.autoDigest(digest, idle);
      return report;
    } catch (e) {
      console.error("[螺旋日程] 自动记日记失败", e);
      if (snap && dayKey) cfg.autoLogState[dayKey] = JSON.parse(snap);
      report.error = String(e.message || e);
      return report;
    } finally { this._autoBusy = false; }
  }

  // 这一轮改了什么，同一类的折在一起，合成一条发出去
  autoDigest(d, idle) {
    const sec = (head, list) => (list.length ? `**${head}（${list.length} 件）**\n${list.map((s) => "· " + s).join("\n")}` : "");
    const parts = [
      sec("▶ 在做", d.doing),
      sec(`⏸ ${idle} 分钟没动，先暂停了`, d.paused),
      sec("📦 会话归档了，记成做完", d.archived),
      sec("✅ 看着像是做完了，要标 DONE 自己改一下", d.done),
      sec("📌 记了要你做的", d.todo),
    ].filter(Boolean);
    if (!parts.length) return;
    this.say("🤖 螺旋日程整理了日记", parts.join("\n\n"), this.todayFile(), 0);
  }

  // 每分钟看一眼：到了间隔就整理一次
  autoLogTick() {
    const cfg = this.settings;
    if (!cfg.autoLog || Date.now() - (this._autoAt || 0) < Math.max(5, cfg.autoLogEvery || 20) * 60e3) return;
    this._autoAt = Date.now();
    this.autoLogRun().catch((e) => console.error("[螺旋日程] 自动记日记失败", e));
  }

  views() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v) => v instanceof SpiralView);
  }

  // 「今天」的日记：凌晨 dayCutoff 点前还算前一天
  today() {
    const m = moment();
    const cutoff = this.settings.dayCutoff ?? Math.max(0, this.settings.dayEnd - 24);
    if (m.hours() * 60 + m.minutes() < cutoff * 60) m.subtract(1, "day");
    return m.startOf("day");
  }

  journalPath(m) {
    return `${this.settings.folder}/${m.format(this.settings.format)}.md`;
  }

  async activate(focus = true) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeftLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: focus });
    }
    if (focus) this.app.workspace.revealLeaf(leaf);
    else {
      // 只把左侧栏展开、切到螺旋日程这个标签，焦点留在日记上
      if (this.app.workspace.leftSplit.collapsed) this.app.workspace.leftSplit.expand();
      const group = leaf.parent;
      if (group && typeof group.selectTab === "function") group.selectTab(leaf);
      else this.app.workspace.revealLeaf(leaf);
    }
  }

  // 打开「今天」的日记：在当前页打开（替换当前页，不新开标签）；当前页是钉住的才开新标签；没有就建一篇。
  // 启动时（reuse）已经有标签开着它就切过去，免得恢复工作区后多出一个一样的标签
  async openToday(reuse = false) {
    const d = this.today();
    const path = this.journalPath(d);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      file = await this.app.vault.create(path, `---\njournal: 每日\njournal-date: ${d.format("YYYY-MM-DD")}\n---\n`);
    }
    let open = null;
    if (reuse) this.app.workspace.iterateRootLeaves((l) => { if (!open && l.view?.file?.path === path) open = l; });
    const cur = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const target = open || (cur && !cur.getViewState().pinned ? cur : this.app.workspace.getLeaf("tab"));
    if (target.view?.file?.path !== path) await target.openFile(file);
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }

  async onFileChange(f) {
    if (!(f instanceof TFile) || !f.path.startsWith(this.settings.folder + "/")) return;
    const content = await this.app.vault.read(f);
    const prev = this.states.get(f.path);
    this.observe(f, content, true);
    this.enforce(f, content, prev).catch((e) => console.error("[螺旋日程] 规则执行失败", e));
    if (this.statusEl && f.path === this.journalPath(this.today())) this.refreshCapacity();
    if (this.views().some((v) => v.path() === f.path)) this.refresh();
  }

  // 对比上一次看到的状态（不写回日记）：
  //   · 待办变成 DONE：把「现在」记为完成时间
  //   · 今天的日记里，任务变成 DOING / 不再是 DOING：记一段工作时间（workLog）。中断再续 = 好几段；
  //     DOING 后面手写了开始时间按写的；改成 DONE 时手写了完成时间按写的
  observe(file, content, record) {
    const items = parseJournal(content, this.settings);
    const cur = new Map();
    for (const i of items) if (i.kind === "task") cur.set(i.label, { state: i.state, doing: i.doing && i.state === "open", startedAt: i.startedAt, doneAt: i.doneAt, dur: i.dur });
    const prev = this.states.get(file.path);
    this.states.set(file.path, cur);
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), this.settings);
    const isToday = file.basename === this.today().format(this.settings.format);
    let changed = false;

    if (isToday) {
      const auto = this.autoKeys(file.basename);   // 自动记录管着的行：用时按会话在动的时段另记，这里不给它开计时
      const log = (this.settings.workLog ||= {});
      const work = (log[file.basename] ||= {});
      const openSeg = (k) => (work[k] || []).find((x) => x[1] == null);
      const closed = new Set();   // 这一回收掉了哪几件的时段
      const stop = (k, at) => {
        const seg = openSeg(k);
        if (!seg) return;
        seg[1] = Math.max(seg[0], at);
        if (seg[1] - seg[0] < 1) work[k].splice(work[k].indexOf(seg), 1);   // 不到一分钟的不记
        if (!work[k].length) delete work[k];
        changed = true;
        closed.add(k);
      };
      if (!record || !prev) {
        // 刚启动：上次没收尾的时段，对应的任务已经不在做了，按半小时封顶收掉
        const doingKeys = new Set([...cur].filter(([, c]) => c.doing).map(([l]) => workKey(l)));
        for (const k of Object.keys(work)) if (openSeg(k) && !doingKeys.has(k)) stop(k, Math.min(now, openSeg(k)[0] + 30));
        // 正在做、但没有开着的时段（Obsidian 关着的时候改成 DOING 的）：写了开始时间按写的，没写从现在算
        for (const [label, c] of cur) if (c.doing && !openSeg(workKey(label)) && !auto.has(workKey(label))) { (work[workKey(label)] ||= []).push([c.startedAt ?? now, null]); changed = true; }
      } else {
        // 进行中的任务改了字：把记下的时段跟着挪到新名字下面，算同一件事
        const gone = [...prev].filter(([l, p]) => p.doing && !cur.has(l)).map(([l]) => l);
        const born = [...cur].filter(([l, c]) => c.doing && !prev.has(l)).map(([l]) => l);
        const renamed = gone.length === 1 && born.length === 1 ? [workKey(gone[0]), workKey(born[0])] : null;
        if (renamed && renamed[0] !== renamed[1] && work[renamed[0]]) {
          work[renamed[1]] = [...(work[renamed[1]] || []), ...work[renamed[0]]];
          delete work[renamed[0]];
          changed = true;
        }
        for (const [label, c] of cur) {
          const k = workKey(label), p = prev.get(label);
          if (c.doing && !openSeg(k) && !auto.has(k) && !(renamed && renamed[1] === k && work[k])) { (work[k] ||= []).push([c.startedAt ?? now, null]); changed = true; }
          if (c.doing && c.startedAt != null && openSeg(k) && openSeg(k)[0] !== c.startedAt && (!p || p.startedAt !== c.startedAt)) { openSeg(k)[0] = c.startedAt; changed = true; }
          if (!c.doing && p && p.doing) stop(k, c.state === "done" && c.doneAt != null ? c.doneAt : now);
        }
        // 进行中的任务行没了（删了 / 挪去明天）：收掉。隔了 6 小时以上多半是睡了一觉才挪的，按预估时长封顶
        if (!renamed) for (const l of gone) {
          const k = workKey(l), seg = openSeg(k);
          if (seg) stop(k, now - seg[0] > 360 ? seg[0] + prev.get(l).dur : now);
        }
        // 正在专注的那件：改了名字跟着走；还没到点就手动改成 DONE / TODO（或挪走）：这一轮提前结束，不再弹窗问
        const fs = this.session();
        if (fs && !fs.asked) {
          for (const t of fs.tasks) if (renamed && t.path === file.path && t.key === renamed[0]) { t.key = renamed[1]; t.label = born[0]; changed = true; }
          const off = fs.tasks.filter((t) => t.path === file.path && [...prev].some(([l, p]) => p.doing && workKey(l) === t.key) && ![...cur].some(([l, c]) => c.doing && workKey(l) === t.key));
          if (off.length) window.setTimeout(() => this.dropFromSession(off.map((t) => t.key)), 0);
        }
      }
      if (closed.size && record && this.settings.clockToNote) this.queueClock(file, [...closed]);
      if (!Object.keys(work).length) delete log[file.basename];
    }

    if (record && prev) {
      const day = (this.settings.doneTimes[file.basename] ||= {});
      for (const [label, c] of cur) {
        if (c.state === "done" && prev.get(label)?.state === "open" && day[label] == null) { day[label] = now; changed = true; }
        if (c.state === "open" && day[label] != null) { delete day[label]; changed = true; }
      }
    }
    if (changed) this.saveSoon();
  }

  // 任务状态变了响一声（规则见 kwSnapshot）。头一回见到这篇笔记只记下来不响；一下子变了一片的是同步、批量整理，不是你在点，也不响；
  // 机器自己整理日记（自动记日记）的那几秒不响
  watchKeywords(file, content) {
    const cur = kwSnapshot(content), prev = this.kw.get(file.path);
    this.kw.delete(file.path);
    this.kw.set(file.path, cur);
    if (this.kw.size > 80) this.kw.delete(this.kw.keys().next().value);   // 只留最近碰过的几十篇
    if (!prev || Date.now() < (this._muteUntil || 0)) return;
    const changes = this.kwFresh(file.path, kwChanges(prev, cur));
    if (changes.length && changes.length <= 3) this.sound(kwCue(changes));
  }
  // 编辑器里的改动（⌘/、点关键词、手敲）当场就响：写盘要等停手两秒，等它再响就不跟手了。
  // 只看落在一行之内的改动，一次动了三行以上的、整段替换的（粘贴、同步、重新载入）不管，那些留给写盘那一路
  kwLiveExtension() {
    const { EditorView } = require("@codemirror/view");
    return EditorView.updateListener.of((u) => {
      if (!u.docChanged || this.settings.uiSound === false) return;
      const a = u.startState.doc, b = u.state.doc, changes = [];
      let lines = 0;
      u.changes.iterChangedRanges((fa, ta, fb, tb) => {
        if (++lines > 3) return;
        const la = a.lineAt(fa), lb = b.lineAt(fb);
        if (ta > la.to || tb > lb.to) { lines = 99; return; }
        const c = kwLineChange(la.text, lb.text);
        if (c) changes.push(c);
      });
      if (!changes.length || lines > 3 || Date.now() < (this._muteUntil || 0)) return;
      const info = u.state.field(OB.editorInfoField, false);
      const fresh = this.kwFresh(info && info.file ? info.file.path : "", changes);
      if (fresh.length) this.sound(kwCue(fresh));
    });
  }
  // 同一行的同一次变化，编辑器和写盘两路都会看到（前后差两秒），只响一次：记下每一行上次响的是变成什么，一分钟内再报同一个就不响
  kwFresh(path, changes) {
    const now = Date.now(), heard = (this.kwHeard ||= new Map());
    for (const [k, v] of heard) if (now - v.at > 60000) heard.delete(k);
    return changes.filter((c) => {
      const k = path + "\n" + c.body, was = heard.get(k);
      heard.set(k, { to: c.to, at: now });
      return !(was && was.to === c.to);
    });
  }
  async onAnyModify(f) {
    if (!(f instanceof TFile) || f.extension !== "md" || this.settings.uiSound === false) return;
    try { this.watchKeywords(f, await this.app.vault.cachedRead(f)); } catch (e) { /* 读不到就算了 */ }
  }
  // 打开一篇笔记时先记下它每一行的状态，之后在里面切换才有得比
  async kwBaseline(f) {
    if (!(f instanceof TFile) || f.extension !== "md" || this.kw.has(f.path) || this.settings.uiSound === false) return;
    try { this.kw.set(f.path, kwSnapshot(await this.app.vault.cachedRead(f))); } catch (e) { /* 读不到就算了 */ }
  }

  // ---------------- 任务行下面的进度条 ----------------
  // 编辑器里 DOING（或 [/]）的那一行下面显示一行字符进度条，像命令行那样用 # 填。数从哪来，按这个顺序：
  //   1. 你自己写在这一行里的进度：60%、2/3、三分之一、一半
  //   2. 监听对上的那个 Agent 会话：它自己列了待办，就按做完几步算；没列就没有百分比，# 来回走表示它在跑
  //   3. 这一行写了预估时长、又有开始时刻：按已经做了多久算
  // 对上了会话，后面还写它眼下的状态（在跑 / 等你回复 / 多久没动静）、最近一步在干什么、用了多少 token。
  // 会话怎么对上：自动记日记记下的那一行；不然看重名（会话标题和这一行一样），或者你发过去的话里带着这一行的字
  lineStatus(raw, link = null) {
    const cfg = this.settings;
    const cache = (this._progCache ||= new Map());
    let it = cache.get(raw);
    if (it === undefined) {
      it = parseJournal(raw.replace(/^\s+/, ""), cfg).find((i) => i.kind === "task" && i.doing) || null;
      if (cache.size > 300) cache.clear();
      cache.set(raw, it);
    }
    if (!it) return null;
    const label = workKey(it.label);
    const x = cfg.showAi !== false ? this.progSession(label, link) : null;
    const lv = x && this._ai ? this._ai.live.get(x.sid) : null;
    // 你把这个会话归档了 = 做完了：进度拉满，稍后这一行自动记成 DONE（见 progFinish）
    const archived = !!(x && cfg.autoLogArchiveDone !== false && this._archived && this._archived.has(x.sid));
    const nowM = moment(), now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    let pct = null, lead = "", mode = "";
    if (archived) pct = 1;
    else if (it.progress != null) pct = it.progress;
    else if (lv && lv.todo && lv.todo.total) { pct = lv.todo.done / lv.todo.total; lead = `${lv.todo.done}/${lv.todo.total} 步`; }
    else if (it.explicitDur && it.startedAt != null && now >= it.startedAt) {
      const spent = now - it.startedAt;
      pct = Math.min(1, spent / it.dur);
      lead = spent > it.dur ? `${dur(spent)} / ${dur(it.dur)} · 超 ${dur(spent - it.dur)}` : `${dur(spent)} / ${dur(it.dur)}`;
    }
    const parts = lead ? [lead] : [];
    if (x) {
      (this._progSids ||= new Set()).add(x.sid);
      const quiet = lv ? Math.max(0, Math.round((Date.now() - lv.at) / 60e3)) : null;
      const state = archived ? "已归档" : !lv ? "" : lv.state === "wait" ? "等你回复" : quiet <= AI_IDLE ? "在跑" : `${dur(quiet)} 没动静`;
      mode = lv && lv.state === "run" && quiet <= AI_IDLE ? "run" : "wait";
      parts.push(`${x.bound ? "绑定" : "监听"} ${AI_AGENTS[aiAgent(x)]}${state ? " · " + state : ""}`);
      const step = !archived && lv && lv.state === "run" ? (lv.todo && lv.todo.cur) || lv.step : "";
      if (step) parts.push(step);
      const tok = this.progTokens(x.sid);
      if (tok) parts.push(`${fmtTok(tok)} tok`);
    }
    if (pct == null && !x) return null;
    const kids = x && !archived ? this.progKids(x.sid, lv) : null;
    if (kids && kids.sum) parts.push(kids.sum);
    return { pct, mode: pct != null ? "bar" : mode, agent: x ? aiAgent(x) : "", tail: parts.join(" · "), rows: kids ? kids.rows : [], finish: archived ? { sid: x.sid, label } : null,
      tip: [archived ? "这个会话归档了，这一行马上记成 DONE" : it.progress != null ? "进度是你写在这一行里的" : pct != null && lead.includes("步") ? "进度按这个会话自己列的待办算" : pct != null ? "进度按预估时长算" : "这个会话没有列待办，看不出做到百分之几",
        x ? `${x.bound ? "手动绑定的会话" : "监听的会话"}：${x.title || (x.text || "").slice(0, 40) || x.sid}（${aiWhere(x)}）` : ""].filter(Boolean).join("\n") };
  }
  // 一个 subagent 眼下算什么：{ st: run 在跑 / quiet 好久没动静 / done 跑完 / fail 出错或停了, word: 显示的字 }。
  // 前台派的 subagent，父会话这一轮都答完了它还没收尾，是被打断了（你按了停）
  kidState(r, parentWait) {
    const quiet = (Date.now() - r.at) / 60e3;
    if (r.state === "done") return { st: "done", word: "跑完" };
    if (r.state === "fail") return { st: "fail", word: r.end === "failed" ? "出错" : "停了" };
    if (quiet <= AI_IDLE) return { st: "run", word: "在跑" };
    if (!r.bg && parentWait) return { st: "fail", word: "停了" };
    return { st: "quiet", word: `${dur(Math.round(quiet))} 没动静` };
  }
  kidName(r) {
    return resultText(r.desc || r.type || "子代理", 40).replace(/、/g, "，");
  }
  // 这个会话派出去的 subagent、开着的 side chat，画在进度条下面：在跑的都画，跑完 / 停了的留 20 分钟，最多 5 行。
  // 返回 { sum: 进度条末尾那一截「🤖 2 跑 1 完 · side chat 1」, rows: [{ text, st }] }，什么都没有返回 null
  progKids(sid, lv) {
    const ai = this._ai;
    if (!ai) return null;
    const now = Date.now(), parentWait = !lv || lv.state === "wait";
    const kids = ai.subsOf(sid).map((r) => ({ r, ...this.kidState(r, parentWait) }))
      .filter((k) => (now - k.r.at) / 60e3 < (k.st === "done" || k.st === "fail" ? 20 : 30));
    const sides = (this._side && this._side.get(sid)) || [];
    if (!kids.length && !sides.length) return null;
    const busy = kids.filter((k) => k.st === "run" || k.st === "quiet").sort((a, b) => a.r.start - b.r.start);
    const over = kids.filter((k) => k.st === "done" || k.st === "fail").sort((a, b) => b.r.at - a.r.at);
    const tokOf = (r) => [...r.tok.values()].reduce((n, v) => n + v, 0);
    const rows = [...busy, ...over].map((k) => {
      const tok = tokOf(k.r);
      return { st: k.st, text: `↳ ${k.r.desc || k.r.type || "子代理"} · ${k.word}${k.st === "run" && k.r.step ? " · " + k.r.step : ""}${tok ? " · " + fmtTok(tok) : ""}` };
    });
    // side chat 只知道开着、开了多久（见 sideChats）
    for (const s of sides) rows.push({ st: "wait", text: `↳ side chat · 开着 · ${dur(Math.max(1, Math.round((now - s.since) / 60e3)))}` });
    const shown = rows.length > 5 ? [...rows.slice(0, 4), { st: "more", text: `↳ … 还有 ${rows.length - 4} 个` }] : rows;
    const n = (f) => kids.filter(f).length, bits = [];
    if (n((k) => k.st === "run" || k.st === "quiet")) bits.push(`${n((k) => k.st === "run" || k.st === "quiet")} 跑`);
    if (n((k) => k.st === "done")) bits.push(`${n((k) => k.st === "done")} 完`);
    if (n((k) => k.st === "fail")) bits.push(`${n((k) => k.st === "fail")} 停`);
    const sum = [bits.length ? "🤖 " + bits.join(" ") : "", sides.length ? `side chat ${sides.length}` : ""].filter(Boolean).join(" · ");
    return { sum, rows: shown };
  }
  // 写进日记的「🤖」行（见 subInto）：这个会话派过的所有 subagent（最近 4 个写名字）、开过几个 side chat。都没有返回空串
  subMark(sid, parentWait = true) {
    const subs = this._ai ? this._ai.subsOf(sid) : [], opened = (this._sideSeen && this._sideSeen.get(sid)) || new Set();
    if (!subs.length && !opened.size) return "";
    const tokOf = (r) => [...r.tok.values()].reduce((n, v) => n + v, 0);
    const items = subs.slice(-4).map((r) => {
      const k = this.kidState(r, parentWait), tok = tokOf(r);
      return `${this.kidName(r)} ${k.st === "done" ? "✓" + (tok ? " " + fmtTok(tok) : "") : k.st === "fail" ? "✗ " + k.word : "⋯ 在跑"}`;
    });
    const open = ((this._side && this._side.get(sid)) || []).length;
    const side = opened.size ? `side chat ${opened.size}${open ? `（${open} 个开着）` : ""}` : "";
    const head = subs.length ? `子代理 ${subs.length}${subs.length > 4 ? "（最近 4 个）" : ""}：${items.join("、")}` : "";
    return [head, side].filter(Boolean).join(" · ");
  }
  // 这一行对上的是哪个会话：下面有「🔗」行的（link = 那一行读出来的 { sid, agent }）优先，绑了就只听它，那个会话今天没动静也照样认；
  // 没绑的在今天有动静的会话里找，几个都对得上取最近在动的
  progSession(label, link = null) {
    const cfg = this.settings, dayKey = this.today().format(cfg.format);
    if (link && link.sid && aiOn(cfg).includes(link.agent || "claude")) {
      const days = this.aiStore ? this.aiStore.days : {};
      for (const k of Object.keys(days).sort().slice(-7).reverse()) {
        const hit = (days[k].list || []).find((x) => x.sid === link.sid);
        if (hit) return { ...hit, bound: true };
      }
      return { sid: link.sid, agent: link.agent || "claude", title: "", text: "", app: "", bound: true };
    }
    // 今天的会话清单几秒内重复用（一屏上有好几行 DOING，各问一遍）
    let c = this._progDay;
    if (!c || c.key !== dayKey || c.store !== this.aiStore || Date.now() - c.at > 5000) {
      const day = this.aiStore && aiPick(this.aiStore.days[dayKey], cfg);
      c = this._progDay = { key: dayKey, store: this.aiStore, at: Date.now(), list: ((day && day.list) || []).filter((x) => x.segs && x.segs.length) };
    }
    const list = c.list;
    if (!list.length) return null;
    const st = (cfg.autoLogState || {})[dayKey] || {};
    let hits = list.filter((x) => { const r = st[x.sid]; return r && r.key === label && !r.skip && !r.gone; });
    if (!hits.length) {
      const norm = (v) => String(v || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
      const want = norm(label);
      if (want.length >= 4) hits = list.filter((x) => { const t = norm(x.title); return (t.length >= 4 && (t === want || t.includes(want) || (t.length >= 6 && want.includes(t)))) || norm(x.text).includes(want); });
    }
    const lastOf = (x) => x.segs[x.segs.length - 1][1];
    return hits.sort((a, b) => lastOf(b) - lastOf(a))[0] || null;
  }
  // 这个会话最近 7 天一共用掉多少 token（产出 + 读入）
  progTokens(sid) {
    const days = this.aiStore ? this.aiStore.days : {};
    let n = 0;
    for (const k of Object.keys(days).sort().slice(-7)) for (const x of days[k].list || []) if (x.sid === sid) n += tokUsed(x);
    return n;
  }
  lineProgressExtension() {
    const { ViewPlugin, Decoration, WidgetType } = require("@codemirror/view");
    const { RangeSetBuilder, StateEffect } = require("@codemirror/state");
    const plugin = this, W = 20;
    const refresh = (this.progEffect = StateEffect.define());
    const DOING_LINE = DOING_LINE_RE;
    const resultOld = Decoration.line({ class: "naut-said" }), resultNew = Decoration.line({ class: "naut-said is-new" });
    // 画一遍：有百分比的，# 从上次的格数一格一格长到新的格数，百分数跟着跳；没有百分比、会话在跑的，三个 # 来回走
    const paint = (el, info) => {
      const doc = el.ownerDocument, win = doc.defaultView || window;
      if (!el._bar) {
        for (const k of ["bar", "pct", "tail"]) { el["_" + k] = doc.createElement("span"); el["_" + k].className = "naut-prog-" + k; el.appendChild(el["_" + k]); }
        el._n = 0; el._i = 0;
      }
      win.clearInterval(el._timer);
      el._timer = 0;
      el.dataset.mode = info.mode;
      el.dataset.agent = info.agent;
      el.title = info.tip;
      el._tail.textContent = (info.mode === "bar" ? "  " : " ") + info.tail;
      // 进度条下面：这个会话派出去的 subagent、开着的 side chat，一个一行
      const rows = info.rows || [];
      if (rows.length && !el._kids) { el._kids = doc.createElement("span"); el._kids.className = "naut-prog-kids"; el.appendChild(el._kids); }
      if (el._kids) {
        el._kids.replaceChildren(...rows.map((r) => { const k = doc.createElement("span"); k.className = "naut-prog-kid"; k.dataset.st = r.st; k.textContent = r.text; return k; }));
        el._kids.style.display = rows.length ? "" : "none";
      }
      if (info.mode === "bar") {
        const to = Math.max(0, Math.min(W, Math.round(info.pct * W)));
        const show = (n) => { el._bar.textContent = "[" + "#".repeat(n) + "-".repeat(W - n) + "]"; el._pct.textContent = " " + Math.round(n === to ? info.pct * 100 : n / W * 100) + "%"; };
        show(el._n);
        if (el._n !== to) el._timer = win.setInterval(() => {
          if (!el.isConnected) { win.clearInterval(el._timer); return; }
          el._n += el._n < to ? 1 : -1;
          show(el._n);
          if (el._n === to) win.clearInterval(el._timer);
        }, 28);
      } else if (info.mode === "run") {
        const show = () => { const a = Array(W).fill(" "); for (let k = 0; k < 3; k++) { const q = el._i % (W + 3) - k; if (q >= 0 && q < W) a[q] = "#"; } el._bar.textContent = "[" + a.join("") + "]"; };
        el._pct.textContent = "";
        show();
        el._timer = win.setInterval(() => { if (!el.isConnected) { win.clearInterval(el._timer); return; } el._i++; show(); }, 110);
      } else {
        el._bar.textContent = "[" + "·".repeat(W) + "]";
        el._pct.textContent = "";
      }
    };
    class ProgWidget extends WidgetType {
      constructor(info) { super(); this.info = info; this.sig = JSON.stringify(info); }
      eq(other) { return other.sig === this.sig; }
      toDOM(view) {
        const el = view.dom.ownerDocument.createElement("span");
        el.className = "naut-prog";
        el.setAttribute("aria-hidden", "true");
        paint(el, this.info);
        return el;
      }
      updateDOM(dom) { if (!dom._bar) return false; paint(dom, this.info); return true; }
      destroy(dom) { (dom.ownerDocument.defaultView || window).clearInterval(dom._timer); }
      ignoreEvent() { return true; }
    }
    const build = (view) => {
      const b = new RangeSetBuilder();
      if (plugin.settings.lineProgress === false) return b.finish();
      const doc = view.state.doc;
      let last = -1;
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = doc.lineAt(pos);
          if (line.number > last && line.length < 2000 && DOING_LINE.test(line.text)) {
            let info = null;
            try {
              // 这一项下面几行里有没有「🔗」行（绑定写在正文里）
              const below = [line.text];
              for (let n = line.number + 1; n <= doc.lines && n <= line.number + 12; n++) below.push(doc.line(n).text);
              info = plugin.lineStatus(line.text, linkUnder(below, 0));
            } catch (e) { console.error("[螺旋日程] 进度条", e); }
            if (info && info.finish) plugin.progQueueDone(view, info.finish);
            if (info) b.add(line.to, line.to, Decoration.widget({ widget: new ProgWidget(info), side: 1 }));
          } else if (line.number > last && RESULT_LINE_RE.test(line.text)) {
            // 「💬」行：颜色放淡；刚写上来的两秒多底色亮一下再褪掉
            const said = line.text.replace(/^\s*[-*+]\s+💬\s*/, ""), at = plugin._resFresh && plugin._resFresh.get(said);
            b.add(line.from, line.from, at && Date.now() - at < 2600 ? resultNew : resultOld);
          } else if (line.number > last && SUB_LINE_RE.test(line.text)) {
            b.add(line.from, line.from, resultOld);   // 「🤖 子代理」行：和 💬 一样放淡
          }
          last = line.number;
          pos = line.to + 1;
        }
      }
      return b.finish();
    };
    return ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = build(view); }
      update(u) { if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))) this.decorations = build(u.view); }
    }, { decorations: (v) => v.decorations });
  }
  // 监听着的那几个会话有新动静就读进来，然后让各个编辑器把进度条重画一遍（没变的那几条不会动）
  async progPoll() {
    const s = this.settings;
    if ((s.lineProgress === false && s.resultBack === false && s.agentStatus === false) || this._progBusy || document.hidden) return;
    this._progBusy = true;
    try {
      if (this.settings.showAi !== false && OB.Platform && OB.Platform.isDesktopApp) {
        await this.aiUsage();
        // 要盯的会话：画着进度条的那几行对上的，加上开着的笔记里所有「🔗」行绑着的（它们答完了要回写结果）
        const recent = this._ai ? [...this._ai.live].filter(([, v]) => Date.now() - v.at < 30 * 60e3).map(([sid]) => sid) : [];
        const sids = new Set([...(this._progSids || []), ...this.linkScan().map((h) => h.sid), ...(this._agents || []).map((a) => a.sid), ...recent]);
        if (this._ai && sids && sids.size && !this._aiBusy) {
          this._aiBusy = true;
          try {
            const touched = await this._ai.poll(sids);
            if (touched && this._ai.merge(this.aiStore, touched)) this._aiDirty = true;
          } finally { this._aiBusy = false; }
        }
        if (sids && sids.size) this._archived = await this.progArchived();
      }
      this.progRefresh();
      await this.resultSync();
      const was = new Map((this._agents || []).map((a) => [a.sid, a.state]));
      this._agents = await this.agentScan();
      this._agentList = this.agentSessions(this._agents);
      this.tickAgents();
      // 有会话刚答完一轮、轮到你了：敲两下（和 WAITING 同一个音；Obsidian 不在最前面时不响）
      if (this._agents.some((a) => a.state === "wait" && was.get(a.sid) === "run")) this.sound("WAITING");
    } finally { this._progBusy = false; }
  }

  // ---------------- 结果回写 ----------------
  // 开着的笔记里所有的「🔗」行：[{ cm, path, sid, agent }]。同一篇笔记开在几个标签页里只算一个
  linkScan() {
    const out = [], seen = new Set();
    this.app.workspace.iterateAllLeaves((l) => {
      const v = l.view, cm = v instanceof OB.MarkdownView && v.editor && v.editor.cm;
      if (!cm || !v.file || seen.has(v.file.path) || cm.state.doc.length > 2e6) return;
      seen.add(v.file.path);
      const text = cm.state.doc.toString();
      if (!text.includes("🔗")) return;
      for (const line of text.split("\n")) { const k = parseLink(line); if (k) out.push({ cm, path: v.file.path, ...k }); }
    });
    return out;
  }
  // 「🔗」绑着的会话答完了一轮（在等你）或者归档了：把它最后说的话写成同一件任务下面的「💬」行，下一轮答完再换成新的。
  // 只动开着的编辑器，不进撤销记录（⌘Z 撤的是你自己的改动）；你正在用输入法打字的那一下不写，等下一轮；没开着的笔记等你打开它时补上
  async resultSync() {
    const cfg = this.settings;
    if (cfg.resultBack === false || cfg.showAi === false || !this._ai || this._resBusy) return;
    this._resBusy = true;
    try {
      const arch = this._archived || new Set(), cache = (this._resCache ||= new Map()), on = aiOn(cfg), todo = new Map();
      for (const h of this.linkScan()) {
        if (!on.includes(h.agent)) continue;
        const lv = this._ai.live.get(h.sid);
        if (!arch.has(h.sid) && !(lv && lv.state === "wait")) continue;   // 还在跑的不写：半路上说的话不是结论
        const at = lv ? lv.at : 0;
        let c = cache.get(h.sid);
        if (!c || c.at !== at || c.max !== cfg.resultMax) {
          const t = await this.sessionTail({ sid: h.sid, agent: h.agent }).catch(() => null);
          cache.set(h.sid, c = { at, max: cfg.resultMax, said: t && t.full ? resultText(t.full, cfg.resultMax) : "" });
        }
        // 同时写「🤖」行：这个会话派过的 subagent、开过的 side chat（都没有就不写）
        const mark = this.subMark(h.sid, true);
        if (c.said || mark) (todo.get(h.cm) || todo.set(h.cm, []).get(h.cm)).push([h.sid, c.said, mark]);
      }
      for (const [cm, list] of todo) {
        if (!cm.dom.isConnected || cm.composing) continue;
        const text = cm.state.doc.toString();
        let next = text;
        for (const [sid, said, mark] of list) { const was = next; next = resultInto(next, sid, said); if (next !== was) (this._resFresh ||= new Map()).set(said, Date.now()); next = subInto(next, sid, mark); }
        if (next === text) continue;
        this.cmReplace(cm, text, next, false);
      }
    } finally { this._resBusy = false; }
  }
  // 把编辑器里的文字从 text 换成 next，只改变了的那几行（有「块去向」就用它的按行比对，中间折叠着的块不会被展开），没有就整段换。
  // history = false：这次改动不进撤销记录
  cmReplace(cm, text, next, history = true) {
    const dtt = this.app.plugins.plugins["done-to-top"];
    const doc = cm.state.doc, at = (p) => doc.line(p.line + 1).from + p.ch;
    let changes;
    if (dtt && dtt.core && dtt.core.diffChanges) changes = dtt.core.diffChanges(text, next).map((c) => ({ from: at(c.from), to: at(c.to), insert: c.text }));
    else {
      let a = 0, bEnd = text.length, nEnd = next.length;
      while (a < bEnd && a < nEnd && text[a] === next[a]) a++;
      while (bEnd > a && nEnd > a && text[bEnd - 1] === next[nEnd - 1]) { bEnd--; nEnd--; }
      changes = [{ from: a, to: bEnd, insert: next.slice(a, nEnd) }];
    }
    cm.dispatch(history ? { changes } : { changes, annotations: require("@codemirror/state").Transaction.addToHistory.of(false) });
  }
  // 归档了哪些会话：Claude 桌面 app 里归档的、Codex 里归档的（和自动记日记用的是同一份判定，受同一个开关管）
  // 顺带看一眼哪些会话上开着 side chat（this._side，见 sideChats；_sideSeen 记这次打开 Obsidian 以来每个会话开过几个），不受「归档 = 做完」那个开关管
  async progArchived() {
    const cfg = this.settings, out = new Set();
    try { this._side = await sideChats(); } catch (e) { this._side = new Map(); }
    const seen = (this._sideSeen ||= new Map());
    for (const [sid, list] of this._side) for (const s of list) (seen.get(sid) || seen.set(sid, new Set()).get(sid)).add(s.pid);
    if (cfg.autoLogArchiveDone === false) return out;
    try { for (const sid of await archivedSessions(this._archCache ||= new Map())) out.add(sid); } catch (e) { /* 读不到就当没归档 */ }
    if (aiOn(cfg).includes("codex")) try { for (const sid of await AiUsage.codexArchived()) out.add(sid); } catch (e) { /* 同上 */ }
    return out;
  }
  // 归档了的会话对着的那一行：先让进度条走到 100% 停一下，再把这一行记成 DONE。一个会话的一行只试一次
  progQueueDone(cm, finish) {
    const key = finish.sid + "\n" + finish.label;
    const tried = (this._progDoneTried ||= new Set());
    if (tried.has(key)) return;
    tried.add(key);
    // 先把会话最后说的话写成「💬」行（记 DONE 时 🔗 行就收掉了，之后找不到是哪个会话），再记 DONE
    window.setTimeout(() => this.resultSync().catch(() => {}).then(() => { try { this.progFinish(cm, finish); } catch (e) { console.error("[螺旋日程] 归档后记 DONE 失败", e); } }), 1600);
  }
  // 和自动记日记里「归档 = 做完」是同一套写法：DONE 后面写会话最后有动静的时刻，顶格的行挪到 DONE 区，实际时段和 token 写在下面的 ⏱ 行里
  progFinish(cm, { sid, label }) {
    if (!cm.dom.isConnected) return;
    const cfg = this.settings, text = cm.state.doc.toString();
    const found = this.autoFind(text, label);
    if (!found || found.cur !== "doing") return;   // 这一行已经不是 DOING 了（你自己改了、挪走了）：不碰
    const day = this.aiStore && aiPick(this.aiStore.days[this.today().format(cfg.format)], cfg);
    const x = ((day && day.list) || []).find((s) => s.sid === sid && s.segs && s.segs.length) || null;
    let next = this.autoLine(text, { key: label, label, created: false }, x, "done").text;
    if (x) next = this.autoClock(next, label, x.segs, AI_AGENTS[aiAgent(x)], tokUsed(x), aiAgent(x) === "claude" ? x.sid : "");
    if (next === text) return;
    const info = cm.state.field(OB.editorInfoField, false);
    this.kwFresh(info && info.file ? info.file.path : "", [{ body: (kwLine(text.split("\n")[found.it.line] || "") || {}).body || label, to: "DONE" }]);   // 这一声在这里响，别让写盘那一路再响一遍
    this.cmReplace(cm, text, next);
    this.sound("DONE");
    new OB.Notice(`✅ 会话归档了：「${label.replace(AUTO_MARK, "").slice(0, 24)}」记成 DONE`);
  }

  // 手动把光标所在的任务和一个会话绑起来（off = 解除）：在这一行下面写一行「🔗」。绑定就是日记里的这一行字，删掉它就解除了
  bindSession(editor, off = false) {
    const cfg = this.settings;
    const n = editor.getCursor().line, raw = editor.getLine(n);
    const it = parseJournal(raw.replace(/^\s+/, ""), cfg).find((i) => i.kind === "task");
    if (!it) { new OB.Notice("光标要放在一行任务上（TODO / DOING… 开头的列表项）"); return; }
    const lines = editor.getValue().split("\n");
    const had = linkUnder(lines, n);
    if (off) {
      if (!had) { new OB.Notice("这一行下面没有「🔗」绑定"); return; }
      editor.transaction({ changes: [{ from: { line: had.line - 1, ch: lines[had.line - 1].length }, to: { line: had.line, ch: lines[had.line].length }, text: "" }] });
      this.progRefresh();
      new OB.Notice("已解除绑定，这一行回到按名字自动对会话");
      return;
    }
    const days = this.aiStore ? this.aiStore.days : {}, keys = Object.keys(days).sort().slice(-3), seen = new Map();
    for (const k of keys) for (const x of ((aiPick(days[k], cfg) || {}).list || [])) if (x.segs && x.segs.length) seen.set(x.sid, { ...x, day: k });
    const arch = this._archived || new Set();
    const list = [...seen.values()].filter((x) => !arch.has(x.sid)).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.segs[b.segs.length - 1][1] - a.segs[a.segs.length - 1][1]));
    if (!list.length) { new OB.Notice("最近三天没有读到 Agent 会话"); return; }
    new BindModal(this.app, list, keys[keys.length - 1], had && had.sid, (x) => {
      if (editor.getLine(n) !== raw) { new OB.Notice("这一行在这期间变了，没有绑，请再来一次"); return; }
      const now = editor.getValue().split("\n"), cur = linkUnder(now, n);
      const title = x.title || (x.text || "").split(" / ")[0];
      const line = linkLine(/^\s*/.exec(raw)[0] + "\t", aiAgent(x), title, x.sid);
      editor.transaction({ changes: [cur
        ? { from: { line: cur.line, ch: 0 }, to: { line: cur.line, ch: now[cur.line].length }, text: line }
        : { from: { line: n, ch: raw.length }, to: { line: n, ch: raw.length }, text: "\n" + line }] });
      (this._progSids ||= new Set()).add(x.sid);
      this.progRefresh();
      new OB.Notice(`🔗 已绑定：${title.slice(0, 30) || x.sid.slice(0, 8)}${it.doing ? "" : "\n这一行是 DOING 的时候才显示进度条"}`);
    }).open();
  }
  progRefresh() {
    if (!this.progEffect) return;
    this._progSids = new Set();
    this.app.workspace.iterateAllLeaves((l) => {
      const cm = l.view instanceof OB.MarkdownView && l.view.editor && l.view.editor.cm;
      if (cm) cm.dispatch({ effects: this.progEffect.of(null) });
    });
  }

  // 界面上的小音效（设置里可以关）。Obsidian 不在最前面时不响：那时候日记多半是别的东西在改
  sound(name) {
    if (this.settings.uiSound !== false && document.hasFocus()) blip(name);
  }

  pruneDoneTimes() {
    const cutoff = moment().subtract(45, "days");
    for (const store of [this.settings.doneTimes, (this.settings.workLog ||= {})]) for (const k of Object.keys(store)) {
      const d = moment(k, this.settings.format, true);
      if (!d.isValid() || d.isBefore(cutoff) || !Object.keys(store[k]).length) delete store[k];
    }
  }

  async openLine(file, line) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line } });
  }

  onunload() {}
};

class SpiralSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  // 关掉设置时：「不读这些日历」改过就清缓存重读
  hide() {
    if (this.skipWas !== undefined && this.skipWas !== this.plugin.settings.calendarSkip) { this.plugin.cal.cache.clear(); this.plugin.refresh(); }
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const num = (name, desc, key, min, max) => new Setting(containerEl).setName(name).setDesc(desc).addText((t) => t
      .setValue(String(s[key]))
      .onChange(async (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) return;
        s[key] = n;
        await this.plugin.saveData(s);
        this.plugin.refresh();
      }));
    num("一天从几点开始", "螺旋的起点（0–23）", "dayStart", 0, 23);
    num("一天到几点结束", "螺旋和排程到几点为止，超过 24 表示次日凌晨，比如 32 = 次日早上 8 点", "dayEnd", 12, 36);
    // 日期分界按 24 小时制的时刻填。别的插件（日记整理、块去向、任务提醒…）的「今天」都读这一项
    new Setting(containerEl).setName("日记日期分界").setDesc("这个时刻之前还算前一天的日记。按 24 小时制写：08:00、4:30、23:30 都行，只写一个数也行（8 = 08:00）。日记整理、块去向、任务提醒这些配套插件算「今天是哪一篇日记」时都跟着这一项")
      .addText((t) => {
        t.setPlaceholder("08:00").setValue(fmtHourClock(s.dayCutoff ?? 8)).onChange(async (v) => {
          const h = parseHourClock(v);
          t.inputEl.toggleClass("naut-bad-input", h == null);
          if (h == null) return;
          s.dayCutoff = h;
          await this.plugin.saveData(s);
          this.plugin.refresh();
        });
        // 离开输入框时写成统一的样子（8 → 08:00）；填得不对就退回现在的值
        t.inputEl.addEventListener("blur", () => { t.inputEl.removeClass("naut-bad-input"); t.setValue(fmtHourClock(s.dayCutoff ?? 8)); });
      });
    num("默认任务时长（分钟）", "没写时长的任务按这个算", "defaultDur", 1, 240);
    const text = (name, desc, key) => new Setting(containerEl).setName(name).setDesc(desc).addText((t) => t
      .setValue(s[key])
      .onChange(async (v) => { s[key] = v.trim(); await this.plugin.saveData(s); this.plugin.refresh(); }));
    text("日记文件夹", "", "folder");
    text("日记文件名格式", "moment.js 格式", "format");
    text("重要标记", "任务里含有这些文字就标成红色，用逗号分隔", "priorityMarkers");
    new Setting(containerEl).setName("DOING 并行排").setDesc("几件 DOING 一起从现在开始，重叠在同一段时间里，只占最长那件的时间；关掉就首尾相接")
      .addToggle((t) => t.setValue(s.parallelDoing !== false).onChange(async (v) => { s.parallelDoing = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    num("最短一段（分钟）", "任务被事件隔开时每段至少这么长；不够切成两段的任务整块排，放不下就跳到下一个空档，后面的小任务往前补位。0 = 照旧切开填满", "minChunk", 0, 240);

    containerEl.createEl("h3", { text: "macOS 日历" });
    new Setting(containerEl).setName("读 macOS 日历").setDesc("把「日历」App 里的事件当固定事件排进螺旋（只读，不改日历）。第一次打开会在本机编译一个读日历的小助手（要有 Xcode 命令行工具），并弹出日历权限请求，选「允许」")
      .addToggle((t) => t.setValue(!!s.calendar).onChange(async (v) => { s.calendar = v; this.plugin.cal.cache.clear(); await this.plugin.saveData(s); this.plugin.refresh(); this.display(); }));
    if (s.calendar) {
      text("不读这些日历", "日历名称，逗号分隔，比如：中国大陆节假日, 生日", "calendarSkip");
      const names = new Setting(containerEl).setName("本机的日历").setDesc("点「列出」看看有哪些日历");
      names.addButton((b) => b.setButtonText("列出").onClick(async () => {
        try {
          const cals = await this.plugin.cal.call(["--calendars"]);
          names.setDesc(cals.map((c) => `${c.title}（${c.source}）`).join("、") || "一个日历也没有");
        } catch (e) { names.setDesc(String(e.message || e)); }
      }));
    }
    this.skipWas = s.calendarSkip;

    containerEl.createEl("h3", { text: "Google 日历" });
    containerEl.createEl("p", { cls: "setting-item-description", text: "把 Google 日历里的事件当固定事件排进螺旋（只读，不改日历），和 macOS 日历可以同时开，同一件事只留一份。要用你自己在 Google Cloud 里建的 OAuth 客户端：新建项目 → 启用 Google Calendar API → 「凭据」里新建 OAuth 客户端 ID，应用类型选「桌面应用」→ 把客户端 ID 和密钥填到下面 → 点「连接」。申请的权限只有读日历；密钥和令牌存在系统钥匙串里，不写进插件的 data.json。" });
    new Setting(containerEl).setName("读 Google 日历").setDesc("只读界面里勾着显示的日历；上面「不读这些日历」对它也管用")
      .addToggle((t) => t.setValue(!!s.googleCal).onChange(async (v) => { s.googleCal = v; this.plugin.cal.cache.clear(); await this.plugin.saveData(s); this.plugin.refresh(); this.display(); }));
    if (s.googleCal) {
      const g = this.plugin.gcal;
      new Setting(containerEl).setName("客户端 ID").setDesc("形如 1234567890-xxxx.apps.googleusercontent.com")
        .addText((t) => t.setValue(s.googleClientId || "").onChange(async (v) => { s.googleClientId = v.trim(); await this.plugin.saveData(s); }));
      new Setting(containerEl).setName("客户端密钥").setDesc(this.plugin.secret("google-secret") ? "已经存好了。要换就重新填" : "填了以后存进系统钥匙串，这里不再显示")
        .addText((t) => { t.inputEl.type = "password"; t.setPlaceholder(this.plugin.secret("google-secret") ? "••••••••" : "GOCSPX-…").onChange((v) => { if (v.trim()) this.plugin.secret("google-secret", v.trim()); }); });
      const conn = new Setting(containerEl).setName(g.connected() ? "已连接" : "还没连接").setDesc(g.connected() ? "授权存在系统钥匙串里。想换账号或者不用了，点「断开」" : "点「连接」会打开浏览器，登录 Google 并同意读日历，然后自动回到这里");
      if (g.connected()) {
        conn.addButton((b) => b.setButtonText("列出日历").onClick(async () => {
          try { conn.setDesc((await g.calendars()).map((c) => `${c.title}${c.shown ? "" : "（界面里没勾，不读）"}`).join("、") || "一个日历也没有"); } catch (e) { conn.setDesc(String(e.message || e)); }
        }));
        conn.addButton((b) => b.setButtonText("断开").onClick(() => { g.disconnect(); this.plugin.cal.cache.clear(); this.plugin.refresh(); this.display(); }));
      } else {
        conn.addButton((b) => b.setCta().setButtonText("连接").onClick(async () => {
          b.setDisabled(true).setButtonText("等浏览器里授权…");
          try { await g.connect(); new OB.Notice("Google 日历连上了"); this.plugin.cal.cache.clear(); this.plugin.refresh(); }
          catch (e) { new OB.Notice("没连上：" + String(e.message || e), 8000); }
          this.display();
        }));
      }
    }

    containerEl.createEl("h3", { text: "▶ 开始做 · 番茄钟 · Raycast Focus" });
    containerEl.createEl("p", { cls: "setting-item-description", text: "螺旋上点 ▶，或在任务那一行按 ⌘⇧↵：这一行改成 DOING HH:MM，按条目上写的时长（10min、15分钟）专注一轮；到点问你做完没有，做完了就改成 DONE 开始-结束。" });
    num("专注多久（分钟）", "0 = 按条目上写的时长（没写按「默认任务时长」，写了进度按还剩的）；填 25 = 每轮固定 25 分钟", "focusMinutes", 0, 600);
    new Setting(containerEl).setName("到点问做完没有").setDesc("弹系统对话框：做完了（改成 DONE 开始-结束）/ 再来一轮 / 先停下（改回 TODO）。关掉就只计时，不问")
      .addToggle((t) => t.setValue(s.focusAsk !== false).onChange(async (v) => { s.focusAsk = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("同时开 Raycast 专注").setDesc("用 raycast://focus/start 开一段同样时长的 Raycast Focus，屏蔽分心的 App 和网站")
      .addToggle((t) => t.setValue(s.focus !== false).onChange(async (v) => { s.focus = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    text("屏蔽类别", "Raycast Focus 的类别，逗号分隔（比如 social, gaming）；留空 = 不带类别，用 Raycast 自己的设置", "focusCategories");
    new Setting(containerEl).setName("类别的用法").setDesc("屏蔽 = 只挡上面这些类别；只允许 = 除了这些类别都挡")
      .addDropdown((d) => d.addOption("block", "屏蔽").addOption("allow", "只允许").setValue(s.focusMode || "block")
        .onChange(async (v) => { s.focusMode = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("提前做完时结束 Raycast 专注").setDesc("还没到点就把那件任务改成 DONE / TODO（或挪去明天）时，用 raycast://focus/complete 结束这段专注")
      .addToggle((t) => t.setValue(s.focusAutoComplete !== false).onChange(async (v) => { s.focusAutoComplete = v; await this.plugin.saveData(s); }));
    text("开一轮专注时的大方向", "逗号分隔，最多 4 个，开头可以带一个表情。⌃⌥F 弹出来的框里只选方向和时长，不列一条条任务；这一轮只计时，具体做了什么由下面的「自动记日记」记", "focusDirs");
    new Setting(containerEl).setName("到点怎么问").setDesc("带按钮的系统通知：不抢焦点，在通知上点「做完了 / 再来一轮 / 先停下」（第一次要允许「螺旋日程」发通知；想让它一直留在屏幕上，到「系统设置 → 通知 → 螺旋日程」把样式改成「提醒」）。对话框：弹到最前面，不回答不走")
      .addDropdown((d) => d.addOption("dialog", "系统对话框").addOption("notification", "带按钮的系统通知（试验）").setValue(s.askVia || "dialog")
        .onChange(async (v) => { s.askVia = v; await this.plugin.saveData(s); }));
    text("提醒发到 Discord 的哪个频道", "填本机 notify-discord 脚本认的频道名（比如 routine）。不用你回答的提醒（自动暂停、欢迎回来、自动记成做完 / 暂停、专注到点）发到这个频道，发出去了就不在本机再弹一遍；要你点按钮的照旧在本机弹。空着 = 不发", "discordChannel");
    containerEl.createEl("h3", { text: "🤖 自动记日记" });
    containerEl.createEl("p", { cls: "setting-item-description", text: "每隔一阵看一眼今天的 Claude / Codex / WorkBuddy 会话：还在动的记成 DOING，停了一阵的记成 PAUSED（暂停），回复里明说要你做的事记成 TODO；DONE 由你自己改，或者把会话归档。能对上日记里已有的行就改那一行，对不上就新写一行（开头带 🤖）。用时按会话真正在动的时段算。你自己改过状态或者删掉的行，之后不再管。" });
    new Setting(containerEl).setName("自动把 Agent 会话记进今天的日记").setDesc("打开的这一刻之前就停了的会话不补记")
      .addToggle((t) => t.setValue(!!s.autoLog).onChange(async (v) => { s.autoLog = v; if (v) s.autoLogSince = Date.now(); await this.plugin.saveData(s); }));
    num("每隔几分钟整理一次", "", "autoLogEvery", 5, 240);
    num("多久没动算停了（分钟）", "会话这么久没有动静，就把它那一行从 DOING 改成 PAUSED，并把实际做的时段写在这一行下面（⏱ 开头的子项）；又动了改回 DOING", "autoLogIdle", 5, 600);
    new Setting(containerEl).setName("归档的会话记成 DONE").setDesc("在 Claude 桌面 app 或 Codex 里把一个会话归档，就当这件事做完了：它那一行改成 DONE，完成时刻取会话最后有动静的时候，前几天还挂着的行也一起补上。你自己改回 TODO / PAUSED 的行不动。app 里开了「自动归档」的话，归档不代表做完，把这一项关掉")
      .addToggle((t) => t.setValue(s.autoLogArchiveDone !== false).onChange(async (v) => { s.autoLogArchiveDone = v; await this.plugin.saveData(s); }));
    text("本机提醒的提示音", "系统声音的名字（Pop、Glass、Ping、Tink、Submarine…）或者一个声音文件的路径；空着不响", "notifySound");
    new Setting(containerEl).setName("每周方向回顾").setDesc("周日晚上 9 点以后发一条：这一周各个大方向花了多久、占多少、和上周比。装了 Telegram Companion 就用它的机器人发，没有就发 Discord")
      .addToggle((t) => t.setValue(s.weeklyDirs !== false).onChange(async (v) => { s.weeklyDirs = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("用哪个命令行判断").setDesc("给会话起名字、对上日记里的行、看有没有要你做的后续，要问一次模型。自动 = 本机有 claude 就用 claude，没有就用 codex；用的是命令行自己的登录。只在出现新会话、或者会话停下来时问一次，一次很短")
      .addDropdown((d) => d.addOption("auto", "自动").addOption("claude", "claude（Claude Code）").addOption("codex", "codex（Codex CLI）").setValue(s.autoLogCli || "auto")
        .onChange(async (v) => { s.autoLogCli = v; await this.plugin.saveData(s); }));
    text("用 claude 判断时的模型", "claude 命令行的 --model，比如 haiku、sonnet", "autoLogModel");
    text("claude 命令路径", "本机 Claude Code 的命令行（要先登录过）", "claudePath");
    text("用 codex 判断时的模型", "codex exec 的 -m；空着 = Codex 自己的默认模型", "autoLogCodexModel");
    text("codex 命令路径", "本机 Codex 的命令行（要先登录过）。只写 codex 就到登录 shell 的 PATH 里找，找不到再填完整路径", "codexPath");
    new Setting(containerEl).setName("改了日记就告诉我").setDesc("每次整理把改了什么合成一条发出来（在做的、暂停的、归档后记成做完的、看着像做完了的、记了要你做的，各折成一组）")
      .addToggle((t) => t.setValue(s.autoLogNotify !== false).onChange(async (v) => { s.autoLogNotify = v; await this.plugin.saveData(s); }));
    containerEl.createEl("h3", { text: "硬规则（只管今天的日记）" });
    num("同时最多几件 DOING", "再开始一件时，把最早开始的那件改成 PAUSED，并发系统通知。0 = 不限", "doingLimit", 0, 20);
    num("DOING 多久没动就暂停（小时）", "这一行和它下面的子项都没改过、也不在专注里，超过这么久就改成 PAUSED，并发系统通知。0 = 不管", "staleHours", 0, 48);
    text("吃饭 / 锻炼的词", "新写一条只有这几个字的条目（逗号分隔），所有 DOING 改成 PAUSED、专注停掉，等你回来", "breakWords");
    num("吃饭 / 锻炼至少多久（分钟）", "这么久以内不判断「回来了」，吃饭保守估计也得 20 分钟", "breakMinAway", 0, 240);
    text("回来了的判断：在这些 App 里持续操作", "吃饭 / 锻炼过了上面这个时间以后，在这些 App 里连续操作满 3 分钟就算回来了，弹窗问要不要切回 DOING", "breakApps");
    containerEl.createEl("h3", { text: "其它" });
    new Setting(containerEl).setName("预估 vs 实际").setDesc("列表底部显示近一段时间预估准不准（按标签 / 链接分），容量条上按这个比例给一个「按以往约多久」")
      .addToggle((t) => t.setValue(s.showReview !== false).onChange(async (v) => { s.showReview = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    num("复盘看最近几天", "插件自己的计时记录留 45 天；再往前的日子，靠日记里任务下面那一行 ⏱ 算实际用时", "reviewDays", 7, 365);
    new Setting(containerEl).setName("当日复盘").setDesc("列表里的「📋 今日复盘」：这一天每件任务的预计和实际，逐件对照。只有做完、也记到了实际用时的才算进偏差")
      .addToggle((t) => t.setValue(s.showDayReview !== false).onChange(async (v) => { s.showDayReview = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    new Setting(containerEl).setName("显示没记录的时间").setDesc("已经过去、既没有事件和任务记录、也没有 Agent 会话的时间，在螺旋上画成斜纹，容量条第一行的悬停提示里写「有记录 / 没记录」各多少")
      .addToggle((t) => t.setValue(s.showUnrecorded !== false).onChange(async (v) => { s.showUnrecorded = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    new Setting(containerEl).setName("实际时段写回日记").setDesc("你手动做的任务不再是 DOING 时，在它下面写一行「⏱ 14:05–14:40、15:10–15:32 · 共 57m」，和自动记的行同一种写法。实际用时就留在日记正文里，不只存在插件的计时记录里")
      .addToggle((t) => t.setValue(!!s.clockToNote).onChange(async (v) => { s.clockToNote = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("状态栏").setDesc("右下角常驻一格：在做事时显示最近开始的那件做了多久，没在做时显示今天的容量。单击打开螺旋日程，⌥ 单击到日记里那一行，⇧ 单击在旁边分栏打开今天的日记")
      .addToggle((t) => t.setValue(s.statusBar !== false).onChange(async (v) => { s.statusBar = v; await this.plugin.saveData(s); this.plugin.refreshCapacity(); }));
    new Setting(containerEl).setName("任务行下面的进度条").setDesc("编辑器里 DOING 的那一行下面显示一行字符进度条 [#####-----] 45%。进度取你写在这一行里的 60%、2/3、一半；没写就看对上的 Agent 会话（它自己列了待办才有百分比，没列只显示在跑还是等你、眼下那一步、用了多少 token）；再不然按预估时长算")
      .addToggle((t) => t.setValue(s.lineProgress !== false).onChange(async (v) => { s.lineProgress = v; await this.plugin.saveData(s); this.plugin.progRefresh(); }));
    new Setting(containerEl).setName("状态栏的 Agent 汇总").setDesc("右下角常驻一格：有在跑的会话就显示最新那个在跑的，没有就显示最新一个在等你回复的。范围是最近一天所有的 Claude Code 会话（桌面版的 Code 会话、终端里的 claude 都算），归档了的、日记里那一行已经做完的不算。单击弹出所有在跑的和最新三个在等你的，⌥ 单击跳到日记里等你的那一行")
      .addToggle((t) => t.setValue(s.agentStatus !== false).onChange(async (v) => { s.agentStatus = v; await this.plugin.saveData(s); this.plugin._agents = await this.plugin.agentScan(); this.plugin._agentList = this.plugin.agentSessions(this.plugin._agents); this.plugin.tickAgents(); }));
    new Setting(containerEl).setName("会话的结论写回任务下面").setDesc("任务下面有「🔗」行（绑着一个 Agent 会话）时：会话答完一轮或者被归档了，把它最后说的话写成这件任务下面的一行「💬」，下一轮答完再换成新的；它派过 subagent、开过 side chat 的，再写一行「🤖 子代理」。只在这篇笔记开着的时候写；想让它停就关掉这一项，或者删掉那一行 🔗")
      .addToggle((t) => t.setValue(s.resultBack !== false).onChange(async (v) => { s.resultBack = v; await this.plugin.saveData(s); }));
    num("「💬」行最多多少字", "多的在句子结尾处截断。完整的回复点 🔗 行回到会话里看", "resultMax", 40, 2000);
    new Setting(containerEl).setName("界面音效").setDesc("开始做、做完、停下、回放起止各一声很轻的合成音。Obsidian 不在最前面时不响；提醒用的提示音在上面单独设")
      .addToggle((t) => t.setValue(s.uiSound !== false).onChange(async (v) => { s.uiSound = v; await this.plugin.saveData(s); if (v) this.plugin.sound("done"); }));
    num("番茄钟阈值（分钟）", "一件事连着做了这么久，状态栏的计时变红。只是提示，不会打断。0 = 不提示", "pomoMinutes", 0, 600);
    num("忘了关计时的提醒（分钟）", "计时开了这么久，状态栏提醒「检查计时」。不会替你停。0 = 不提醒", "forgottenMinutes", 0, 1440);
    new Setting(containerEl).setName("启动时打开今天的日记").setDesc("按上面的「日记日期分界」算今天：已经开着就切过去，没开就开一个新标签，还没有这篇就新建")
      .addToggle((t) => t.setValue(s.openTodayOnStartup !== false).onChange(async (v) => { s.openTodayOnStartup = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("启动时左侧栏显示螺旋日程").setDesc("展开左侧栏并切到螺旋日程标签（Wiki、文件列表等标签还在，点图标切换）")
      .addToggle((t) => t.setValue(s.revealOnStartup !== false).onChange(async (v) => { s.revealOnStartup = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("显示人机协作").setDesc("读下面开着的那几个 AI 工具在本机的会话日志，在容量条下面「🤖」那一行显示当天协作时长和 token（悬停看细账），螺旋内圈画出它们在干活的时段；汇总另存在插件目录的 ai-usage.json")
      .addToggle((t) => t.setValue(s.showAi !== false).onChange(async (v) => { s.showAi = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    containerEl.createEl("h3", { text: "🤖 主力 AI 工具" });
    containerEl.createEl("p", { cls: "setting-item-description", text: "平时主要用哪几个，就开哪几个。开着的才会读它的会话日志、画进螺旋、算 token、自动记进日记；关掉的不再读，已经汇总进来的历史留着但不显示，重新打开就回来。" });
    {
      const fs = require("fs"), path = require("path"), home = require("os").homedir();
      const where = { claude: [".claude/projects", "Claude Code 和 Claude 桌面版里的 Code 会话"], codex: [".codex/sessions", "Codex 桌面版和 codex 命令行，时长和 token 都读"], workbuddy: [".workbuddy/projects", "WorkBuddy 桌面版"] };
      for (const k of Object.keys(AI_AGENTS)) {
        const [dir, what] = where[k];
        const found = fs.existsSync(path.join(k === "codex" ? codexHome() : home, k === "codex" ? "sessions" : dir));
        new Setting(containerEl).setName(AI_AGENTS[k]).setDesc(`${what}。日志在 ~/${dir}${found ? "" : "（这台机器上还没有这个目录）"}`)
          .addToggle((t) => t.setValue(aiOn(s).includes(k)).onChange(async (v) => {
            s.aiAgents = { ...Object.fromEntries(Object.keys(AI_AGENTS).map((a) => [a, aiOn(s).includes(a)])), [k]: v };
            await this.plugin.saveData(s);
            this.plugin._ai = null;   // 换了要读的目录：把最近的日志重读一遍
            this.plugin._aiAt = 0;
            this.plugin.refresh();
          }));
      }
    }
    new Setting(containerEl).setName("记录游戏时间").setDesc("每分钟看一眼在不在玩，螺旋最里面一圈画绿线；记在插件目录的 game-log.json。只在 Obsidian 开着时记录")
      .addToggle((t) => t.setValue(s.trackGames !== false).onChange(async (v) => { s.trackGames = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    text("游戏进程关键词", "进程路径里含这些词就算在玩，逗号分隔；steamapps/common 会按游戏文件夹名分开记", "gameProcs");
    text("在最前面才算的 App", "这些 App 常驻后台，只有切到最前面时才算游戏时间，比如 Steam 客户端", "gameFrontApps");
  }
}

module.exports.core = { parseHourClock, fmtHourClock, resultText, resultInto, resultUnder, markOwner, RESULT_LINE_RE, SUB_LINE_RE, subInto, subUnder, sideChats, parseJournal, parseDuration, parseProgress, applyWork, workKey, schedule, fill, normalize, toDoing, toDone, toTodo, toPaused, breakWord, subtree, focusMinutes, DEFAULTS, AiUsage, aiOn, aiPick, fmtTok, unionMin, capacity, capSummary, pastGaps, dayReview, parseClock, GoogleCalendar, kwSnapshot, kwChanges, kwCue, kwLine, kwLineChange, aiStep, todoOf, tokUsed, linkLine, parseLink, linkUnder, linkMap, SOUNDS };
