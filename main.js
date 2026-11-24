const OB = require("obsidian");
const { Plugin, ItemView, PluginSettingTab, Setting, TFile, moment, debounce } = OB;
// 界面语言跟着 Obsidian：中文界面显示中文，其余一律英文（新版有 getLanguage()，旧版看 moment 的语言）
const ZH = String(OB.getLanguage?.() || moment.locale() || "en").toLowerCase().startsWith("zh");
const T = (zh, en) => (ZH ? zh : en);

const VIEW_TYPE = "nautilus-spiral";
const DEFAULTS = {
  dayStart: 8,          // 螺旋从几点开始
  dayEnd: 32,           // 螺旋和排程到几点结束，超过 24 表示次日凌晨（32 = 次日早上 8 点；个人作息夜里会一直干活，早上七八点才睡）
  dayCutoff: 8,         // 日记的日期分界：这个时刻之前还算前一天。存的是小时数，可以带小数（4.5 = 04:30）；设置里按 24 小时制的时刻填
  defaultDur: 15,       // 没写时长的任务按多少分钟算
  journalAuto: true,    // 日记目录 / 文件名格式自动检测（和 Agent Deck 同一套规则）；设置里手填过就关掉
  folder: T("日记", "Journal"),
  format: "YYYY_MM_DD",
  priorityMarkers: "[[important]], [[重要]], ⭐, ‼️",
  doneTimes: {},        // { "2026_09_29": { "任务文字": 872 } }，在 Bike 里改成 DONE 时记下的完成时间（分钟）
  autoOpened: false,
  showAi: true,         // 显示人机协作（各个 Agent 的协作时长和 token）
  aiAgents: { claude: true, codex: true, workbuddy: true, dsh: true, antigravity: true },   // 追踪哪几个 Agent：开着的才读它的会话日志、画进螺旋、算 token
  dshApiPort: 0,        // DSH 的 dsh-token-usage-stats API 端口：0 = 自动从 lsof 找；插件没开时保留库里上次的数
  aiPrimary: "claude",  // 主力 Agent：全量追踪（历史、跨天补记、状态栏）；其余开着的只追踪今天有动静的会话
  googleCal: false,       // 读 Google 日历里的事件当固定事件（只读，走 Google Calendar API）
  googleClientId: "",     // 你自己在 Google Cloud 里建的 OAuth 客户端（桌面应用）的 ID；客户端密钥和刷新令牌不放在这儿，在系统钥匙串里
  showUnrecorded: true,   // 过去没有任何记录的时间在螺旋上画成斜纹，容量条第一行的悬停提示里写「有记录 / 没记录」
  showDayReview: true,    // 列表里的「📋 当日复盘」：这一天每件任务的预计和实际，逐件对照
  dayReviewFolded: true,  // 当日复盘默认收着，标题上带结论
  statusBar: true,        // 状态栏常驻：正在做什么、做了多久；没在做时显示今天的容量
  pomoMinutes: 45,        // 一件事连着做了这么久，状态栏的计时变红（只提示，不打断）。0 = 不提示
  forgottenMinutes: 120,  // 计时开了这么久，状态栏提醒「检查计时」（不替你停）。0 = 不提醒
  clockToNote: false,     // 你手动做的时段也写回日记：任务不再是 DOING 时，在它下面写一行「⏱ 实际时段」
  showMain: true,         // 主线：块里带 [#A] 的任务是这一天的主线（最多 3 块），面板最上面列出来、先排、单独上色，状态栏和提醒都盯着它
  mainNudge: "15:00, 22:00",   // 到这几个时刻主线还没做完、手上也没在做主线，提醒一次（逗号分隔，空 = 不提醒）
  mainLog: {},            // { "2026_10_20": { done: 2, total: 3 } }：每天主线的完成情况（留 90 天）
  mainClosed: "",         // 最近一次「一天结束」结算到了哪一天（这一天的前一天已经写进日记属性）
  mainNudged: {},         // { "2026_10_20": [900] }：今天已经提醒过的时刻
  widgets: false,         // 给 macOS 小组件导出数据：今天的主线、计划甘特图（配套的小组件 App 在仓库的 widgets/ 里，要自己编译安装）
  widgetPlan: T("上班计划.md", "Plan.md"),  // 甘特图画哪篇计划：列表项里写了 🛫 开始 / ⏳ 计划 / 📅 截止日期的各画一条；没有这一篇就新建一篇
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
  doingLimit: 3,        // 同时最多几件 DOING：再开始一件，就把最早开始的那件改成 PAUSED。0 = 不限
  staleHours: 3,        // DOING 超过几小时没动过（这一行和下面的子项都没改）就改成 PAUSED。0 = 不管
  doingTouch: {},       // { workKey: { sig, at } }：每件 DOING 最后一次被动过的时刻
  parallelDoing: true,
  showReview: true,     // 列表底部「📏 预估 vs 实际」，容量条上「按以往约多久」
  reviewDays: 30,       // 复盘看最近几天（计时记录保留 45 天）  // 几件 DOING 并行排：一起从现在开始，重叠在同一段时间里，只占最长那件的时间
  discordChannel: "",   // 提醒中枢：不用你回答的提醒发到 Discord 的哪个频道（本机 notify-discord 脚本认的频道名）；空着 = 不发，只在本机弹
  discordCmd: "~/.local/bin/notify-discord",
  askVia: "dialog",     // 带按钮提醒的方式：dialog = 默认通知；notification = 带按钮的系统通知（试验：要系统允许本机编的小 App 发通知）
  notifySound: "Pop",   // 在本机弹提醒时响哪个声音：系统声音的名字（/System/Library/Sounds 里的，Pop、Glass、Ping…）或一个声音文件的路径；空 = 不响
  colors: {},           // { main: "#rrggbb" }：设置里改过的颜色，没改过的不存，用 COLORS 的默认值
  pomodoro: { preset: "25", customMinutes: 45, active: null },   // 番茄钟：preset = "15"|"25"|"custom"，active = { id, dayKey, start, end, minutes, task }
  pomodoroHistory: {},  // { "2026_11_21": [{ start, end, minutes, label }] }：每天已完成的番茄钟记录（留 45 天）
};
// 螺旋上各类的颜色（设置里能改）：[设置里的名字, 默认值]。默认值和 styles.css 开头的一致；Agent 的颜色跟各家自己的界面走，不放进来
const COLORS = {
  main: [T("主线", "Mainline"), "#cf4d4a"],
  event: [T("固定事件", "Fixed events"), "#d9a441"],
  task: [T("待办", "To-dos"), "#5c86b4"],
  prio: [T("重要 / 超出", "Important / over"), "#c8635f"],
  review: [T("复习卡片", "Flashcard review"), "#4ca3b3"],
  game: [T("游戏时间", "Gaming"), "#9c6496"],
};

// ---------------- 解析 ----------------

const LIST_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const STAMP_RE = /^\*\*(\d{1,2})[:：](\d{2})\*\*\s*/;           // 你习惯的 **07:37** 记录时间
const CHECKBOX_RE = /^\[([ xX\/\-])\]\s*/;
const KW_ALT = "TODO|DOING|LATER|NOW|PAUSED|TOREVIEW|HITLIMIT|NEEDOK|QUEUED|ERRORED|DELEGATED|WAITING|WAIT|SUSPENDED|IN-PROGRESS|DONE|CANCELED|CANCELLED|FAILED|YES|NO|MAYBE";   // 认得的状态关键词，下面几个正则共用。YES 同 DONE、NO 同 CANCELLED、MAYBE 同 WAITING（和 TODOseq、块去向、日记整理一致）
const KEYWORD_RE = new RegExp(`^(${KW_ALT})\\s+`);
const SHORT_KW_RE = new RegExp(`^(${KW_ALT})`, "i");
// 优先级简写：关键字后面紧跟 a / b / c（todoa 写稿），或者隔空格（todo a 写稿、doing b）。隔空格的，字母后面要么没字了、要么紧跟中文、
// 要么空格后面不是英文字母（todo a book 是英文句子，不算）。和块去向的 prioShort 同一条规则；TODOseq 在光标离开那一行时才改成 TODO [#A]
function prioShort(s, re) {
  const k = re.exec(s);
  if (!k) return null;
  const r = s.slice(k[0].length);
  const m = /^([abcABC])(?=$|[\s:：]|[^\x00-\x7f])/.exec(r) || /^[ \t]+([abcABC])(?=$|[^\x00-\x7f]|[ \t]+(?![ \tA-Za-z]))/.exec(r);
  return m && { kw: k[1].toUpperCase(), prio: m[1].toUpperCase(), rest: r.slice(m[0].length).replace(/^[\s:：]+/, "") };
}
const TIME = String.raw`(\d{1,2})(?:[:：](\d{2})|点(?:(半)|(\d{1,2})分?)?)`;
const RANGE_RE = new RegExp(String.raw`(?<![\d:：])${TIME}\s*(?:-|–|—|~|～|到|至)\s*(?:${TIME}|(\d{1,2})(?![\d:：点]))`);
const SINGLE_RE = new RegExp(String.raw`(?<![\d:：])${TIME}(?![\d])`);
const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

// 「todos：」母块：一行只写「- todos：」（大小写、全角半角冒号都认，冒号后面可以接说明），它下面直接挂着的那一层子条目没写关键词的也当 TODO：
//   照样排程、计时、改状态，改状态时关键词才真正写进那一行（1. 写稿 → 1. DOING 14:05 写稿）。子条目自己写了关键词 / 复选框的照它自己的；
//   再往下一层是子条目的细节，不算。TODOseq、块去向认的是同一套写法
const TODOS_HEAD_RE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\*\*)?todos(?:\*\*)?\s*(?:[:：]|$)/i;
const TODOS_KID_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/;
const indW = (l) => /^\s*/.exec(l)[0].replace(/\t/g, "    ").length;
const TODOS_KW_RE = new RegExp(`^(?:${KW_ALT}|TODOFORAI|TODO4AI|TODO2AI|TODOTOAI)(?=\\s|$)`, "i");
function todosKidRest(rest) {
  const s = rest.replace(STAMP_RE, "");
  return !!s.trim() && !CHECKBOX_RE.test(s) && !TODOS_KW_RE.test(s)
    && !/^-{3,}\s*$/.test(s) && !isMarkText(s);
}
// 读的时候在这些子条目的列表符号后面补一个 TODO（只在内存里补，不写回）
const withTodo = (l) => l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+(?:\*\*\d{1,2}[:：]\d{2}\*\*\s*)?)/, "$1TODO ");
function withTodos(lines) {
  if (!lines.some((l) => TODOS_HEAD_RE.test(l))) return lines;
  const out = lines.slice(), stack = [];   // stack：上面还没合上的列表项 { w, head }
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) { inCode = !inCode; continue; }
    if (inCode || !l.trim()) continue;
    const m = TODOS_KID_RE.exec(l);
    if (!m) continue;
    const w = indW(l);
    while (stack.length && stack[stack.length - 1].w >= w) stack.pop();
    if (stack.length && stack[stack.length - 1].head && todosKidRest(m[2])) out[i] = withTodo(l);
    stack.push({ w, head: TODOS_HEAD_RE.test(l) });
  }
  return out;
}

function tokenMinutes(h, mm, half, cnMin) {
  const m = mm !== undefined ? +mm : half ? 30 : cnMin !== undefined ? +cnMin : 0;
  return +h * 60 + m;
}

const journalDayCutoff = (cfg) => cfg.dayCutoff ?? Math.max(0, cfg.dayEnd - 24);

// 显示时把落在过午夜那一圈的时刻挪到对应的视觉位置。
function normalize(t, cfg) {
  const cutoff = Math.min(journalDayCutoff(cfg), cfg.dayStart) * 60;
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
// 这一行写的是哪种进度：{ re: 认出它的那条正则, v: 0–1, cn: 是不是中文分数 }，没写返回 null
function progMatch(text) {
  let m;
  if ((m = PROG_PCT_RE.exec(text)) && +m[1] <= 100) return { re: PROG_PCT_RE, v: +m[1] / 100 };
  if ((m = PROG_FRAC_RE.exec(text)) && +m[2] > 0 && +m[2] <= 10 && +m[1] <= +m[2]) return { re: PROG_FRAC_RE, v: +m[1] / +m[2] };
  if ((m = PROG_CN_RE.exec(text))) {
    const b = CN_DIGIT[m[1]] ?? +m[1], a = CN_DIGIT[m[2]] ?? +m[2];
    if (b > 0 && a <= b) return { re: PROG_CN_RE, v: a / b, cn: true };
  }
  if (PROG_HALF_RE.test(text)) return { re: PROG_HALF_RE, v: 0.5 };
  return null;
}
function parseProgress(text) { const h = progMatch(text); return h ? h.v : null; }
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
    .replace(/%%\s*(←[^%]*?)\s*%%/g, "$1")   // 日记整理藏成注释的「%%← 2026_10_15%%」还原成「← 2026_10_15」，下面认「←」尾巴的地方照旧
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
    .replace(/[📅🛫✅⭐⏳]\s*\d{4}-\d{2}-\d{2}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 任务下面的「🔗」行：这件任务绑在哪个 Agent 会话上。绑定写在日记正文里，这一块挪到哪、发到哪天、改了字都还认；想解除就把这一行删掉。
//   Claude 的写成链接「- 🔗 [Claude：会话标题](claude://resume?session=会话号)」，点了在 Claude 桌面版里打开那个会话；
//   DeepSeek Harness 目前只有 dsh://open（打开客户端），会话号留在反引号里；Codex / WorkBuddy 也只有会话号
const LINK_LINE_RE = /^\s*[-*+]\s+🔗/;
const SID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const claudeLink = (sid) => `claude://resume?session=${sid}`;
function linkLine(indent, agent, title, sid) {
  const name = String(title || "").replace(/[\[\]()`\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || T("会话", "Session");
  if (agent === "dsh") return `${indent}- 🔗 [DeepSeek Harness：${name}](dsh://open) \`${sid}\``;
  return agent === "claude" ? `${indent}- 🔗 [Claude：${name}](${claudeLink(sid)})` : `${indent}- 🔗 ${agent === "codex" ? "Codex" : agent === "workbuddy" ? "WorkBuddy" : agent === "antigravity" ? "Antigravity" : agent}：${name} \`${sid}\``;
}
// 读一行「🔗」：{ sid, agent }，不是就返回 null
function parseLink(line) {
  if (!LINK_LINE_RE.test(line)) return null;
  const m = SID_RE.exec(line);
  if (!m) return null;
  const agent = /🔗\s*\[?\s*Codex/i.test(line) ? "codex" : /🔗\s*\[?\s*WorkBuddy/i.test(line) ? "workbuddy" : /🔗\s*\[?\s*(DeepSeek Harness|DSH)/i.test(line) ? "dsh" : /🔗\s*\[?\s*Antigravity/i.test(line) ? "antigravity" : "claude";
  return { sid: m[0], agent };
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

// Agent 会话的 DOING 中间态（Agent Deck 按会话状态自动切，交互和 PAUSED 一样，⌘/ 或点一下回 DOING）：
//   TOREVIEW = 对话不再有新内容了（答完了 / 被你打断了 / 好几分钟没动静，后台派的 subagent 也都跑完了）；
//   NEEDOK   = 停在「允许吗？」权限提示上（靠 agent-wait 钩子的记号认，TODOseq 显示成 NEEDOK?）；
//   ERRORED  = 这一轮以一条不是限额的 API 报错结束（过载、断网、认证失败、上下文满了）；
//   HITLIMIT = 撞了用量限额（TODOseq 显示成 HITLIMIT!）；QUEUED = 撞了限额、limit-resume 已经把它排进续跑队列，到点自己接着跑。
//   计时和 PAUSED 一样停着，进度条照画
//   DELEGATED = 块去向委派给 Agent 的（⌥⌘D）：会话在跑时保持 DELEGATED，停下来照上面切，再动起来回 DOING
const AGENT_KW_RE = /^(TOREVIEW|HITLIMIT|NEEDOK|QUEUED|ERRORED|DELEGATED)$/;
// 任务状态关键词 → 统一状态名（颜色与 Agent Deck / Logseq Style Tasks 的 keyword.css 一致）
const KW_STATUS = {
  TODO: "todo", LATER: "todo",
  DOING: "doing", NOW: "doing", "IN-PROGRESS": "doing",
  DONE: "done", YES: "done",
  PAUSED: "paused",
  WAITING: "waiting", WAIT: "waiting", MAYBE: "waiting",
  SUSPENDED: "suspended",
  TOREVIEW: "toreview",
  NEEDOK: "needok",
  ERRORED: "errored",
  HITLIMIT: "hitlimit",
  QUEUED: "queued",
  DELEGATED: "delegated",
};
// Agent Deck 实时会话状态 → 任务状态名
const DECK_STATE_STATUS = {
  run: "doing",
  wait: "toreview",
  "needs-approval": "needok",
  error: "errored",
  limit: "hitlimit",
  queued: "queued",
};
function taskStatus(item, deckState = null) {
  if (!item) return null;
  if (item.cal && item.cal.color) return null;
  if (item.kind === "task" && item.state === "done" && isReview(item)) return null;
  const kw = item.kw ? KW_STATUS[String(item.kw).toUpperCase()] || null : null;
  const live = deckState ? DECK_STATE_STATUS[deckState] || null : null;
  if (live && item.state === "open" && (!kw || kw === "doing" || kw === "delegated" || kw === "todo")) return live;
  return kw;
}
function statusCls(item, prefix, deckState = null) {
  const st = taskStatus(item, deckState);
  if (!st) return "";
  if (st === "todo" && (item.main || item.mainA || item.prio || item.kind === "event")) return "";
  return ` ${prefix}${st}`;
}
const indentWidthOf = (t) => { let w = 0; for (const c of /^[ \t]*/.exec(t)[0]) w += c === "\t" ? 4 : 1; return w; };
// 1.6.0 写过的「🤖 子代理 3：… ✓ 16k」汇总行：日记里留下的照旧当记号行跳过
const isSubMark = (s) => /^🤖\s*(?:子代理|side chat)/.test(s);

// 任务下面那一行「⏱ 00:45–00:58、04:02–05:10 · 共 1h21m · 48k tok · Claude」读回来（最后的 Claude 可以是指向那个会话的链接）：
//   { segs: [[开始, 结束]…], total: 合计分钟（没写就是 null）, who: 谁记的（"Claude" / "Claude / Codex"，你自己做的没有）, partial: 段数太多只写了后面几段 }
// 机器写的是上面这个样子；你自己改、自己写的也认：时段之间用顿号、逗号、分号、空格都行，起止之间用 – - ~ 到 都行，合计写「共 57m」「共 1小时21分」都行（英文界面写的是「total 57m」，也认）
function parseClock(s, cfg) {
  const segs = [];
  for (const m of s.matchAll(/(\d{1,2})[:：](\d{2})\s*(?:[–—~～-]|到|至)\s*(\d{1,2})[:：](\d{2})/g)) {
    const a = normalize(+m[1] * 60 + +m[2], cfg);
    let b = normalize(+m[3] * 60 + +m[4], cfg);
    if (b < a) b += 1440;
    if (b > a) segs.push([a, b]);
  }
  if (!segs.length) return null;
  const tm = /(?:共|\btotal)\s*(?:(\d+)\s*(?:h|小时))?\s*(?:(\d+)\s*(?:m|min|分钟?))?/.exec(s);
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

const BLOCK_ID_RE = /^\^[\w-]+\s*$/;
// 共享行首前缀解析：时间戳、复选框、关键词（含 prioShort 简写）顺序不固定，parseJournal 与 mainOf 共用
function parseStatusPrefix(s, kwRe = KEYWORD_RE, shortRe = SHORT_KW_RE) {
  let stamp = null, cb = null, kw = null, prio = null;
  for (let i = 0; i < 3; i++) {
    let m;
    if (!stamp && (m = STAMP_RE.exec(s))) { stamp = m; s = s.slice(m[0].length); continue; }
    if (!cb && (m = CHECKBOX_RE.exec(s))) { cb = m; s = s.slice(m[0].length); continue; }
    if (!kw) {
      const ps = prioShort(s, shortRe);
      if (ps) { prio = ps.prio; s = `${ps.kw} [#${ps.prio}] ${ps.rest}`; }
    }
    if (!kw && (m = kwRe.exec(s))) { kw = m; s = s.slice(m[0].length); continue; }
    break;
  }
  const kwName = kw ? kw[1].toUpperCase() : (cb ? (cb[1] === "/" ? "DOING" : cb[1] === " " ? "TODO" : cb[1] === "-" ? "CANCELLED" : "DONE") : null);
  return { rest: s, stamp, cb, kw, kwName, prio };
}
// 共享祖先栈推进：同缩进或更浅时出栈，取最顶层非 TODO 祖先控制源
function stepAnc(anc, indent, selfOverride) {
  while (anc.length && anc[anc.length - 1].indent >= indent) anc.pop();
  const inherited = anc.length ? anc[anc.length - 1].override : null;
  anc.push({ indent, override: inherited || selfOverride });
  return inherited;
}

// ---------------- 日记在哪：目录 / 文件名格式的自动检测 ----------------
// 规则和 Agent Deck 的 detectJournalFormat 一样，两个插件算出来的「今天是哪一篇」不会打架：
//   设置里手填的优先（journalAuto 关掉）；没手填就按 Obsidian 核心「日记」插件 → Periodic Notes → 翻一遍库猜。
// 翻库猜：日期命名的文件最多的那一处；一样多的，优先今天/昨天还在写的那处。
const GUESS_FORMATS = ["YYYY_MM_DD", "YYYY-MM-DD", "YYYYMMDD", "YYYY.MM.DD", "YYYY年MM月DD日", "YYYY年M月D日", "YYYY/MM/YYYY-MM-DD", "YYYY/YYYY-MM-DD", "YYYY-MM/YYYY-MM-DD", "YYYY/MM/DD"];
const FMT_TOKEN_RE = /\[[^\]]*\]|YYYY|YY|MM|M|DD|D/g;
function formatRegex(fmt) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = "", last = 0;
  for (const mt of fmt.matchAll(FMT_TOKEN_RE)) {
    out += esc(fmt.slice(last, mt.index));
    const tk = mt[0];
    out += tk[0] === "[" ? esc(tk.slice(1, -1)) : tk === "YYYY" ? "\\d{4}" : tk === "M" || tk === "D" ? "\\d{1,2}" : "\\d{2}";
    last = mt.index + tk.length;
  }
  return new RegExp("^" + out + esc(fmt.slice(last)) + "$");
}
// 没有 obsidian 的 moment 时（单元测试）也能算出日期名
function fmtDate(d, fmt) {
  if (moment) return moment(d).format(fmt);
  const p2 = (n) => String(n).padStart(2, "0");
  const map = { YYYY: d.getFullYear(), YY: p2(d.getFullYear() % 100), MM: p2(d.getMonth() + 1), M: d.getMonth() + 1, DD: p2(d.getDate()), D: d.getDate() };
  return fmt.replace(FMT_TOKEN_RE, (tk) => (tk[0] === "[" ? tk.slice(1, -1) : map[tk]));
}
const trimSlash = (s) => String(s || "").trim().replace(/^\/+|\/+$/g, "");
// 目录为空 = 库根目录：那时候「在日记目录里」就是路径里没有斜杠
const inJournalDir = (path, folder) => (folder ? path.startsWith(folder + "/") : !path.includes("/"));
const joinFolder = (folder, name) => (folder ? `${folder}/${name}` : name);

let _jdet = null;   // 60 秒缓存：翻一遍库不便宜，设置没变就复用
function detectJournal(app, cfg) {
  const auto = cfg.journalAuto !== false;
  const key = `${auto}|${cfg.folder}|${cfg.format}`;
  if (_jdet && _jdet.app === app && _jdet.key === key && Date.now() - _jdet.at < 60e3) return _jdet;
  let hit = null;
  if (auto) {
    try {
      const dn = app?.internalPlugins?.getPluginById?.("daily-notes");
      if (dn?.enabled) hit = { folder: trimSlash(dn.instance?.options?.folder), format: String(dn.instance?.options?.format || "YYYY-MM-DD"), from: T("Obsidian 的「日记」插件", "Obsidian Daily notes") };
    } catch (e) { /* 没装也没有 */ }
    if (!hit) {
      try {
        const pn = app?.plugins?.plugins?.["periodic-notes"]?.settings?.daily;
        if (pn?.enabled) hit = { folder: trimSlash(pn.folder), format: String(pn.format || "YYYY-MM-DD"), from: "Periodic Notes" };
      } catch (e) { /* 没装也没有 */ }
    }
    if (!hit) {
      let files = [];
      try { files = (app?.vault?.getFiles?.() || []).map((f) => f.path.replace(/\.md$/, "")); } catch (e) { files = []; }
      if (files.length) {
        const set = new Set(files), cands = [];
        for (const fmt of GUESS_FORMATS) {
          const re = formatRegex(fmt), byDir = new Map();
          for (const p of files) {
            const cut = p.lastIndexOf("/");
            const name = cut < 0 ? p : p.slice(cut + 1);
            if (!re.test(name)) continue;
            const dir = cut < 0 ? "" : p.slice(0, cut);
            byDir.set(dir, (byDir.get(dir) || 0) + 1);
          }
          for (const [dir, n] of byDir) cands.push({ fmt, dir, n });
        }
        const now = new Date();
        for (const c of cands) c.recent = [0, 1, 2].filter((i) => set.has(joinFolder(c.dir, fmtDate(new Date(now.getTime() - i * 864e5), c.fmt)))).length;
        cands.sort((a, b) => b.recent - a.recent || b.n - a.n);
        const best = cands[0];
        if (best && (best.recent > 0 || best.n >= 3)) hit = { folder: best.dir, format: best.fmt, from: T(`「${best.dir || "库根目录"}」里 ${best.n} 篇按日期命名的日记`, `${best.n} date-named notes in ${best.dir || "the vault root"}`) };
      }
    }
  }
  const fallbackFolder = trimSlash(cfg.folder);
  const out = {
    folder: hit ? hit.folder : fallbackFolder,
    format: hit ? hit.format : String(cfg.format || "").trim() || "YYYY_MM_DD",
    from: hit ? hit.from : auto ? T("默认", "Default") : T("手动设置", "Set manually"),
  };
  _jdet = { ...out, key, app, at: Date.now() };
  return _jdet;
}

// 历史日期缓存辅助：过去一天的日记定稿后，文件内容、设置与日历/AI 快照未变时直接复用计算结果并跳过冗余重绘
function fastHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function isPastDate(date, today) {
  if (!date || !today) return false;
  return date.format("YYYY-MM-DD") < today.format("YYYY-MM-DD");
}
function calendarSig(cal) {
  if (!cal) return "";
  return JSON.stringify([
    (cal.items || []).map((i) => [i.label, i.start, i.end, i.cal?.color || ""]),
    (cal.allDay || []).map((e) => e.title),
    cal.error || "",
  ]);
}
function pastDayComputeSig({ dayKey, content, cfg, cal }) {
  return JSON.stringify([
    dayKey,
    content.length,
    fastHash(content),
    cfg.dayStart,
    cfg.dayEnd,
    cfg.dayCutoff,
    cfg.defaultDur,
    cfg.showMain !== false,
    (cfg.dayBounds || {})[dayKey] || null,
    (cfg.doneTimes || {})[dayKey] || null,
    (cfg.workLog || {})[dayKey] || null,
    calendarSig(cal),
  ]);
}
function pastDayRenderSig({ computeSig, cfg, aiDay, gameDay, deckCount }) {
  return JSON.stringify([
    computeSig,
    cfg.showAi !== false,
    cfg.trackGames !== false,
    cfg.showUnrecorded !== false,
    !!cfg.dayReviewFolded,
    !!cfg.reviewFolded,
    cfg.aiPrimary || "",
    cfg.aiAgents || null,
    aiDay ? [aiDay.wall, aiDay.out, aiDay.fresh, aiDay.cached, aiDay.calls, aiDay.sessions] : null,
    gameDay ? gameDay.map((g) => `${g[0]}-${g[1]}:${g[2] || ""}`) : null,
    deckCount || 0,
  ]);
}

function parseJournal(content, cfg) {
  const prio = cfg.priorityMarkers.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const items = [];
  const lines = withTodos(content.split("\n"));   // todos 母块下面没写关键词的子条目当 TODO
  const anc = [];   // 祖先列表项栈：{ indent, override }，母块为非 TODO 状态时覆盖下面带状态的子块
  let inCode = false;
  lines.forEach((raw, line) => {
    if (/^\s*```/.test(raw)) { inCode = !inCode; return; }
    if (inCode) return;
    const lm = LIST_RE.exec(raw);
    if (!lm) { if (raw.trim() && !BLOCK_ID_RE.test(raw)) anc.length = 0; return; }
    let s = lm[2];
    if (s.startsWith("🔗") || s.startsWith("💬") || s.startsWith("📋") || s.startsWith("❓") || isSubMark(s) || isGoal(s)) return;   // 任务下面的「🔗 绑定的会话」「💬 会话最后说的话」「📋 步骤/轮次进度」「❓ 追问」「🤖 子代理」「🎯 目标」是记号，不是事件也不是任务（里面带着时间也不算）
    if (s.startsWith("⏱")) {
      // 任务下面的「⏱ 实际时段」是记录，不是事件也不是任务。读出来挂到它上面那件任务上（往上找缩进更浅的第一行）
      const c = parseClock(s, cfg), ind = lm[1].replace(/\t/g, "    ").length;
      if (c) for (let j = items.length - 1; j >= 0; j--) if (items[j].indent < ind) {
        if (items[j].kind === "task" && !items[j].clock) {
          items[j].clock = c;
          if (items[j].state === "done" && items[j].est == null && items[j].explicitDur && !items[j].actual) items[j].est = items[j].dur;
        }
        break;
      }
      return;
    }
    const indent = lm[1].replace(/\t/g, "    ").length;
    const p = parseStatusPrefix(s);
    s = p.rest;
    const stamp = p.stamp ? normalize(tokenMinutes(p.stamp[1], p.stamp[2]), cfg) : null;
    let kwName = p.kwName;
    let state = !kwName ? "none" : /DONE|^YES$/.test(kwName) ? "done" : /CANCEL|FAILED|^NO$/.test(kwName) ? "drop" : "open";
    let doing = !!(kwName && /DOING|NOW|IN-PROGRESS/.test(kwName));
    let suspended = !!(kwName && /^(WAIT|SUSPENDED|MAYBE)/.test(kwName));   // WAITING / SUSPENDED / MAYBE = 搁置：短期不推，今天不排、不占容量，做过的时间和进度留着
    let paused = !!(kwName && (kwName === "PAUSED" || AGENT_KW_RE.test(kwName)));   // PAUSED = 暂停：只是停一下，照常排，接着做时剩余时间扣掉做过的；TOREVIEW / NEEDOK / ERRORED / HITLIMIT / QUEUED 同
    let agentKw = kwName && AGENT_KW_RE.test(kwName) ? kwName : null;
    if (p.kw) s = s.replace(/^\[#[ABC]\]\s*/, "");   // 优先级（TODO [#A] …）不挡住后面的时刻
    let labelPreview = state === "none" ? s : stripProgress(s);
    for (const pr of prio) labelPreview = labelPreview.split(pr).join("");
    labelPreview = cleanLabel(labelPreview) || s.trim();
    // 母块无状态或为 TODO 时不覆盖子块；母块为其他状态（DOING / DONE / SUSPENDED / PAUSED / CANCELLED 等）时，下面带状态的子块以母块状态为准
    const selfOverride = state !== "none" && KW_STATUS[kwName] !== "todo"
      ? { line, label: labelPreview, state, kw: kwName, doing, suspended, paused, agentKw }
      : null;
    const inherited = stepAnc(anc, indent, selfOverride);
    let inheritedFrom = null, inheritedLabel = null;
    if (inherited && state !== "none") {
      state = inherited.state;
      kwName = inherited.kw;
      doing = inherited.doing;
      suspended = inherited.suspended;
      paused = inherited.paused;
      agentKw = inherited.agentKw;
      inheritedFrom = inherited.line;
      inheritedLabel = inherited.label;
    }
    if (state === "drop") return;
    const progress = state === "none" ? null : parseProgress(s);
    const label = labelPreview;
    const auto = state !== "none" && /^(?:\[#[ABC]\]\s*)*🤖/.test(s);   // 这一行是自动记的（Agent 回写的）
    const base = { line, indent, label, state, kw: kwName, doing: !!doing, suspended, paused, agentKw, progress, prio: prio.some((p) => s.includes(p)), stamp, ...(auto ? { auto: true } : {}), ...(inheritedFrom != null ? { inheritedFrom, inheritedLabel } : {}) };

    // 紧跟在关键词后面的时间是「记录」：DONE 18:02 = 几点做完；DONE 14:00-15:30 = 实际花在这段；DOING 14:05 = 几点开始做的
    if (state !== "none") {
      const ts = s.replace(/^(?:🤖\s*|\[#[ABC]\]\s*)+/, "");   // 自动记的「🤖 」和优先级记号不挡住紧跟在关键词后面的时间
      const lr = new RegExp("^" + RANGE_RE.source).exec(ts);
      const ls = !lr && new RegExp("^" + SINGLE_RE.source).exec(ts);
      if (state === "done" && lr) {
        const start = normalize(tokenMinutes(lr[1], lr[2], lr[3], lr[4]), cfg);
        let end = normalize(lr[5] !== undefined ? tokenMinutes(lr[5], lr[6], lr[7], lr[8]) : +lr[9] * 60, cfg);
        if (end <= start) end += 1440;   // 06:42-08:19 这种：分界前的开始时刻归到了前一天，结束时刻要跟着跨过来
        // est = 写着的预估（DONE 14:05-14:20 写周报 15分钟 里的 15 分钟），复盘「预估 vs 实际」用
        items.push({ ...base, kind: "task", dur: end - start, explicitDur: true, doneAt: end, actual: [start, end], est: parseDuration(ts.slice(lr[0].length)) });
        return;
      }
      // 「DONE 10-12 hsy」这种只写整点的时间段，只在紧跟关键词的位置认
      const br = !lr && state === "done" && /^(\d{1,2})\s*(?:-|–|~|～|到|至)\s*(\d{1,2})(?![\d:：点])/.exec(ts);
      if (br && +br[1] <= 24 && +br[2] <= 24) {
        const start = normalize(+br[1] * 60, cfg);
        let end = normalize(+br[2] * 60, cfg);
        if (end <= start) end += 720;
        items.push({ ...base, kind: "task", dur: end - start, explicitDur: true, doneAt: end, actual: [start, end], est: parseDuration(ts.slice(br[0].length)) });
        return;
      }
      // DONE 18:02 写稿 2h：这里的 2h 是做了多久（Telegram 的 done 写稿 2h），不是预估
      if (state === "done" && ls) {
        const at = normalize(tokenMinutes(ls[1], ls[2], ls[3], ls[4]), cfg);
        items.push({ ...base, kind: "task", dur: parseDuration(ts.slice(ls[0].length)) ?? cfg.defaultDur, explicitDur: parseDuration(ts.slice(ls[0].length)) != null, doneAt: at });
        return;
      }
      // SUSPENDED 17:12 / PAUSED 17:12 / WAITING 17:12 / PAUSED 🤖 19:17-19:23：后面的时刻是当初开始做的记录，不是约好的时间，不当事件
      if (state === "open" && (doing || suspended || paused) && (lr || ls)) {
        const m = lr || ls;
        const d = parseDuration(ts.slice(m[0].length));
        // 自动记的行「TOREVIEW 🤖 21:59-00:06」：这一段就是这回事真实占用的时间（AI 回传的那个时间），
        // 整段算一块、没写时长时也当时长；几件同时在跑就叠着画
        let span = null;
        if (lr && auto) {
          const a = normalize(tokenMinutes(lr[1], lr[2], lr[3], lr[4]), cfg);
          let b = normalize(lr[5] !== undefined ? tokenMinutes(lr[5], lr[6], lr[7], lr[8]) : +lr[9] * 60, cfg);
          if (b < a) b += 1440;   // 06:42-08:19 这种：分界前的时刻归到了前一天，结束时刻要跟着跨过来
          span = b > a ? [a, b] : null;
        }
        const startedAt = doing ? normalize(tokenMinutes(m[1], m[2], m[3], m[4]), cfg) : undefined;
        items.push({ ...base, kind: "task", dur: d ?? (span ? span[1] - span[0] : cfg.defaultDur), explicitDur: d != null, ...(startedAt !== undefined ? { startedAt } : {}), ...(span ? { aiSpan: span } : {}) });
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

// ---------------- 主线 ----------------
// 主线 = 这一天最要紧的几件，和块去向（done-to-top）core 里 isMainBlock 同一条规则：顶格块里有一条任务（自己那一行或任何一层子项）
// 带 [#A]，或者写的是简写「todo a 写稿」，这一整块就是一个主线块。一天最多 MAIN_MAX 块，按日记里的先后取前几块；
// 多出来的不算（日记整理会把它们降成 [#B]）。完成率按块里 A 级的任务算：做完几件 / 一共几件，取消了的不算进去
const MAIN_MAX = 3;
const MAIN_KW_RE = new RegExp(`^(TODOFORAI|TODO4AI|TODO2AI|TODOTOAI|${KW_ALT})`, "i");
const MAIN_KW_FULL_RE = new RegExp(`^(TODOFORAI|TODO4AI|TODO2AI|TODOTOAI|${KW_ALT})\\s+`);
const mainStateOf = (kwName) => (/DONE|^YES$/.test(kwName) ? "done" : /CANCEL|^NO$/.test(kwName) ? "drop" : /FAILED/.test(kwName) ? "failed" : /DOING|NOW|IN-PROGRESS/.test(kwName) ? "doing" : "open");
// 一行任务是不是 A 级：返回 { state: done / doing / open / failed / drop, label }，不是就返回 null。
// FAILED = 没做成：算进一共几件、不算做完，也不再当「下一件」；CANCELLED 才是不算进去
function mainTask(raw) {
  const lm = LIST_RE.exec(raw);
  if (!lm) return null;
  const p = parseStatusPrefix(lm[2], MAIN_KW_FULL_RE, MAIN_KW_RE);
  if (!p.kwName) return null;
  if (p.prio ? p.prio !== "A" : !p.rest.includes("[#A]")) return null;
  return { state: mainStateOf(p.kwName), label: cleanLabel(stripProgress(p.rest.replace(/\[#A\]\s*/g, ""))) || p.rest.trim() };
}
// 返回 { blocks: [{ line, end, label, tasks: [{ line, label, state }], done, total }], over: [多出来的块的标题], tasks: 各块的 A 级任务拍平, done, total }
function mainOf(content) {
  const lines = withTodos(content.split("\n")), blocks = [], over = [];   // todos 母块下面没写关键词的 [#A] 子条目也算，和 parseJournal 一样
  const anc = [];   // 与 parseJournal 共享同一套祖先栈规则：非 TODO 母块状态覆盖下面带状态的 [#A] 子块
  let cur = null, inCode = false;
  const close = () => {
    if (!cur) return;
    if (cur.tasks.length) {
      if (blocks.length < MAIN_MAX) blocks.push(cur);
      else over.push(cur.label);
    }
    cur = null;
  };
  lines.forEach((raw, i) => {
    if (/^\s*```/.test(raw)) inCode = !inCode;
    let inherited = null;
    if (!inCode) {
      const lm = LIST_RE.exec(raw);
      if (lm) {
        const ind = lm[1].replace(/\t/g, "    ").length;
        const p = parseStatusPrefix(lm[2], MAIN_KW_FULL_RE, MAIN_KW_RE);
        const selfOverride = p.kwName && KW_STATUS[p.kwName] !== "todo" && !/^TODO(?:FOR|4|2|TO)AI$/.test(p.kwName) ? mainStateOf(p.kwName) : null;
        inherited = stepAnc(anc, ind, selfOverride);
      } else if (raw.trim() && !BLOCK_ID_RE.test(raw)) {
        anc.length = 0;
      }
    }
    let t = !inCode && mainTask(raw);
    if (t && inherited) t = { ...t, state: inherited };
    if (!inCode && raw.trim() && !/^\s/.test(raw) && !BLOCK_ID_RE.test(raw)) {   // 顶格的块 ID 那一行跟着上一块
      close();
      const lm = LIST_RE.exec(raw);
      if (!lm || /^[-*+]\s+-{3,}\s*$/.test(raw)) return;
      cur = { line: i, tasks: [], label: t ? t.label : cleanLabel(stripProgress(lm[2].replace(STAMP_RE, "").replace(/^(?:TODO|DOING|LATER|NOW|PAUSED|WAITING|WAIT|SUSPENDED|DONE)\s+/i, "").replace(CHECKBOX_RE, ""))) || lm[2].trim() };
    }
    if (!cur) return;
    cur.end = i + 1;
    if (t && t.state !== "drop") cur.tasks.push({ line: i, ...t });
  });
  close();
  const done = (ts) => ts.filter((t) => t.state === "done").length, tasks = blocks.flatMap((b) => b.tasks);
  for (const b of blocks) { b.done = done(b.tasks); b.total = b.tasks.length; }
  return { blocks, over, tasks, done: done(tasks), total: tasks.length };
}
// 给 parseJournal 的条目打上主线记号：main = 在主线块里（排程时排在 DOING 后面、别的待办前面），mainA = 它自己就是 A 级的那一行
function markMain(items, M) {
  const a = new Set(M.tasks.map((t) => t.line));
  for (const it of items) {
    if (it.kind !== "task" && it.kind !== "event") continue;
    if (M.blocks.some((b) => it.line >= b.line && it.line < b.end)) it.main = true;
    if (a.has(it.line)) it.mainA = true;
  }
  return items;
}
// 下一件该做的主线：在做的排前面，然后按日记里的先后
function mainNext(M) {
  const open = M.tasks.filter((t) => t.state !== "done" && t.state !== "failed");
  return open.find((t) => t.state === "doing") || open[0] || null;
}
// ●◐○✕：做完 / 在做 / 没开始 / 没做成，一件 A 级任务一个
const mainPips = (M) => M.tasks.map((t) => (t.state === "done" ? "●" : t.state === "doing" ? "◐" : t.state === "failed" ? "✕" : "○")).join("");

// 主线任务的目标：这件任务下面的一行「- 🎯 目标：做到什么程度算完」（英文界面写成「🎯 Goal: …」）。和 🔗 / ⏱ 一样是记号行，不是任务也不是事件（里面写了时刻也不算），
// 状态音效不响；块去向把这一块发给 Agent 时照常带上，目标正好当它的验收标准
const GOAL_RE = /^🎯\s*(?:目标|Goal)\s*[:：]\s*(.*)$/iu;
const isGoal = (s) => GOAL_RE.test(s);
const isMarkText = (s) => /^(?:⏱|🔗|💬)/.test(s) || isSubMark(s) || isGoal(s);
// 第 n 行那件任务自己的目标（只认直接子项）：{ line, text }，没写返回 null
function goalUnder(lines, n) {
  return childMark(lines, n, (l) => { const m = LIST_RE.exec(l), g = m && GOAL_RE.exec(m[2]); return g ? { text: g[1].trim() } : null; });
}
// 把进度写进这一行任务：已经写了的（40%、1/3、三分之一、一半，按 parseProgress 认的那一个）换掉，没写就加在行尾（块 ID、%% 注释、← 日期这些尾巴前面）
function withProgress(raw, pct) {
  const p = `${Math.max(0, Math.min(100, Math.round(pct)))}%`, swap = (re) => raw.replace(re, (x) => x.replace(/\S[\s\S]*$/, p));
  const h = progMatch(raw);
  if (h) return h.cn ? raw.replace(h.re, p) : swap(h.re);
  const tail = /(?:\s+(?:\^[\w-]+|%%[^%]*%%|←\s*\S+))+\s*$/.exec(raw);
  return tail ? `${raw.slice(0, tail.index)} ${p}${raw.slice(tail.index)}` : `${raw.replace(/\s+$/, "")} ${p}`;
}
// 小组件上点「做完」：DOING 14:05 写稿 → DONE 14:05-15:30 写稿；还没开始的记成 DONE 15:30（几点做完）
function markDone(raw, now) {
  const p = splitTask(raw);
  return !p ? raw : p.since ? `${p.prefix}DONE ${p.since}-${now} ${p.rest}` : `${p.prefix}DONE ${now} ${p.rest}`;
}
// 撤回：改回 TODO，DONE 后面记的时刻 / 时段一起去掉（留着会被当成计划的时间）
function markUndone(raw) {
  const p = splitTask(raw);
  return p ? `${p.prefix}TODO ${p.rest.replace(/^\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?\s*/, "")}` : raw;
}
// 计划笔记里的一行：勾上 / 取消勾选框（写的是关键词就换关键词），记上 / 去掉 ✅ 日期（Tasks 插件的写法）
function planDone(raw, done, day) {
  let s = raw.replace(/\s*✅\uFE0F?\s*\d{4}-\d{2}-\d{2}/u, "");
  s = s.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/, (x, a) => `${a}[${done ? "x" : " "}]`)
    .replace(/^(\s*(?:[-*+]|\d+[.)])\s+)(?:TODO|DOING|DONE)\s+/, (x, a) => `${a}${done ? "DONE" : "TODO"} `);
  return done ? `${s.replace(/\s+$/, "")} ✅ ${day}` : s;
}
// ---------------- 小组件：待办 ----------------
// 一篇笔记里还没做完的任务：列表项写了 TODO / LATER，或者是 Markdown 任务框「- [ ]」（代码块里的不算）。返回 [{ line, label }]
const OPEN_TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\*\*\d{1,2}[:：]\d{2}\*\*\s*)?)(TODO|LATER|\[ \])\s+(.*)$/;
function openTasks(content) {
  const out = [];
  let inCode = false;
  content.split("\n").forEach((raw, line) => {
    if (/^\s*```/.test(raw)) { inCode = !inCode; return; }
    const m = !inCode && OPEN_TASK_RE.exec(raw);
    // Tasks 插件的日期（🛫 2026-10-26 📅 …）和优先级记号先去掉：cleanLabel 是给日记写的，不认它们，会把 emoji 拆成半个
    const rest = m && m[3].replace(/[🛫⏳📅✅➕❌]\uFE0F?\s*\d{4}-\d{2}-\d{2}/gu, "").replace(/[⏫🔼🔽🔺⏬🔁]\uFE0F?/gu, "").trim();
    if (rest) out.push({ line, label: cleanLabel(stripProgress(rest)) || rest });
  });
  return out;
}
// 小组件上勾掉一条待办：任务框打勾，TODO / LATER 换成 DONE
const todoDone = (raw) => raw.replace(OPEN_TASK_RE, (x, a, k, rest) => `${a}${k === "[ ]" ? "[x]" : "DONE"} ${rest}`);
// 没有计划笔记时新建的那一篇
const planTemplate = (today) => [
  T("- 说明：这一篇是螺旋日程「计划甘特图」小组件画的计划，改这里，桌面上的甘特图跟着变", "- About: the \"Plan Gantt\" widget of Nautilus Spiral draws the plan in this note. Edit it here and the Gantt chart on your desktop follows"),
  T("\t- 写法：任务行写短标题加 🛫 开始、📅 截止，只写一个日期的是那一天的节点；做完勾上（或写 ✅ 日期）；细节写在下一级，小组件不画；顶格那一行是分组", "\t- How to write it: give each task line a short title plus 🛫 start and 📅 due; a line with only one date is a milestone on that day; check it off when done (or write ✅ date); details go one level down and are not drawn; top-level lines are groups"),
  T("- 这几天", "- Next few days"),
  T(`\t- [ ] 第一件事 🛫 ${today.format("YYYY-MM-DD")} 📅 ${today.clone().add(4, "days").format("YYYY-MM-DD")}`, `\t- [ ] First thing 🛫 ${today.format("YYYY-MM-DD")} 📅 ${today.clone().add(4, "days").format("YYYY-MM-DD")}`),
  T(`\t- [ ] 一个节点 📅 ${today.clone().add(7, "days").format("YYYY-MM-DD")}`, `\t- [ ] A milestone 📅 ${today.clone().add(7, "days").format("YYYY-MM-DD")}`),
  "",
].join("\n");

// ---------------- 小组件：计划甘特图 ----------------
// 计划笔记里写了日期的列表项各画一条：🛫 开始、⏳ 计划、📅 截止（Tasks 插件的写法），只写了一个日期的是那一天的一个点。
// 分组 = 上面最近的标题，或者最近的一个没写日期的顶格列表项。做完了 = DONE、[x] 或者带 ✅ 日期
// 返回 [{ group, label, start, end, done, line }]，日期是 YYYY-MM-DD
const GANTT_DATE_RE = /([🛫⏳📅✅])️?\s*(\d{4}-\d{2}-\d{2})/gu;
// 计划里的字照原样留着（「聊 30 分钟」不是时长），只去掉日期、关键词、优先级、标签和链接的壳
const ganttLabel = (s) => s.replace(GANTT_DATE_RE, "").replace(KEYWORD_RE, "").replace(CHECKBOX_RE, "")
  .replace(/[⏫🔼🔽🔺⏬🔁]️?/gu, "").replace(/(^|\s)#[^\s#]+/g, "$1")
  .replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/==|\*\*|~~|`/g, "")
  .replace(/\s+/g, " ").trim();
function ganttOf(content) {
  const rows = [];
  let group = "";
  content.split("\n").forEach((raw, line) => {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) { group = ganttLabel(h[1]); return; }
    const lm = LIST_RE.exec(raw);
    if (!lm) return;
    const d = {};
    for (const m of lm[2].matchAll(GANTT_DATE_RE)) d[m[1]] = m[2];
    const label = ganttLabel(lm[2]);
    const a = d["🛫"] || d["⏳"] || d["📅"], b = d["📅"] || d["⏳"] || a;
    if (!a) { if (!lm[1]) group = label; return; }
    rows.push({ group, label, start: a < b ? a : b, end: a < b ? b : a, done: !!d["✅"] || /^(?:DONE\s|\[[xX]\])/.test(lm[2]), line });
  });
  return rows;
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
    // 自动记的行上那段「🤖 21:59-00:06」是 AI 回传的真实占用：整段算一块（几件同时跑就叠着），
    // ⏱ 行只当明细，不再把它拆成一小块一小块
    if (t.aiSpan) segs = [t.aiSpan];
    t.worked = segs;
    // 合计按那一行写的「共 …」：写的时候挨得近的几段并成了一段，照段落加会多出中间的空隙
    t.spentToday = t.aiSpan ? sum(segs) : noted && noted.total != null ? noted.total : sum(segs);
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
  // 在做的先排，然后是主线块里的，再是别的待办（各自按日记里的先后）
  const queue = [...open.filter((t) => t.doing), ...open.filter((t) => !t.doing && t.main), ...open.filter((t) => !t.doing && !t.main)];
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
  const suspended = items.filter((i) => i.kind === "task" && i.state === "open" && !i.container && i.suspended);
  for (const t of suspended) t.remaining = t.progress != null ? t.dur * (1 - t.progress) : Math.max(5, t.dur - ((t.spentToday || 0) + (t.spentBefore || 0)));
  // free = 排完以后还空着的时段（螺旋上悬停能看到每段空档多长）
  return { from, available, demand, overflow: Math.max(0, demand - available), unplaced, free: free.map(([a, b]) => [a, b]), eventLeft, queue, suspended };
}

// ---------------- 轻量化番茄钟（预订未来时段） ----------------

function pomoMinutes(pomo) {
  const p = pomo || {};
  if (p.preset === "15") return 15;
  if (p.preset === "custom") return Math.min(240, Math.max(1, Math.round(Number(p.customMinutes) || 45)));
  return 25;
}

function pomoTimeRange(rec, cfg) {
  if (!rec || !Number.isFinite(rec.start) || !Number.isFinite(rec.end) || rec.end <= rec.start) return null;
  const d = new Date(rec.start);
  const startMin = normalize(d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, cfg);
  const spanMin = Math.max(0.5, (rec.end - rec.start) / 60e3);
  return [startMin, startMin + spanMin];
}

function pomoSplit(startMin, endMin, nowMin) {
  if (endMin <= startMin) return { elapsed: null, reserved: null };
  if (nowMin <= startMin) return { elapsed: null, reserved: [startMin, endMin] };
  if (nowMin >= endMin) return { elapsed: [startMin, endMin], reserved: null };
  return { elapsed: [startMin, nowMin], reserved: [nowMin, endMin] };
}

function pomoFormatLeft(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  moved:     { type: "triangle", notes: [[440, 0.05], [349, 0.10]], vol: 0.5, attack: 0.02 },   // 块去向挪到顶上（不标 DONE）：轻轻往下落一下，不亮
  DELEGATED: { type: "sine",     notes: [[392, 0.05], [587, 0.12]], vol: 0.6, attack: 0.02 },   // 交给 AI：往上递一下，比 DOING 低、轻
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
const KW_SOUND = { TODO: "TODO", LATER: "TODO", DOING: "DOING", NOW: "DOING", "IN-PROGRESS": "DOING", DONE: "DONE", PAUSED: "PAUSED", TOREVIEW: "WAITING", NEEDOK: "WAITING", ERRORED: "FAILED", HITLIMIT: "SUSPENDED", QUEUED: "SUSPENDED", DELEGATED: "DELEGATED", WAITING: "WAITING", WAIT: "WAITING", SUSPENDED: "SUSPENDED", CANCELED: "CANCELLED", CANCELLED: "CANCELLED", FAILED: "FAILED", YES: "DONE", NO: "CANCELLED", MAYBE: "WAITING" };
// kwLine：一行的状态 { kw, body }；空行、只有关键词没有正文的行、⏱ / 🔗 / 💬 / 🤖 子代理 记号行返回 null
const KW_LINE_RE = new RegExp(`^(${KW_ALT})(?=\\s|$)\\s*`);
function kwLine(raw) {
  let s = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^\s+/, "").replace(STAMP_RE, "");
  let kw = "";
  const cb = CHECKBOX_RE.exec(s);
  if (cb) { kw = cb[1] === " " ? "TODO" : cb[1] === "/" ? "DOING" : cb[1] === "-" ? "CANCELLED" : "DONE"; s = s.slice(cb[0].length); }
  const m = KW_LINE_RE.exec(s);
  if (m) { kw = m[1]; s = s.slice(m[0].length); }
  // 关键词后面跟着的时刻 / 时间段是记录，会跟着状态一起变，不算正文
  // 优先级（[#A]）在时刻前后都可能出现，也不算正文
  s = s.replace(/^\[#[ABC]\]\s*/, "").replace(/^\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?\s*/, "").replace(/^\[#[ABC]\]\s*/, "").trim();
  if (!s || isMarkText(s)) return null;
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
const KW_RANK = ["DONE", "FAILED", "CANCELLED", "DELEGATED", "DOING", "SUSPENDED", "WAITING", "PAUSED", "TODO", "CLEAR"];
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
  const status = overload > 0 ? { key: "overload", label: T("超载", "Overload"), value: overload }
    : unplaced > 0 ? { key: "fragmented", label: T("空档不足", "No gap fits"), value: unplaced }
    : { key: "remaining", label: T("余量", "Spare"), value: free };
  const tone = overload > 0 || unplaced > 0 ? "warning" : free > 0 ? "positive" : "neutral";
  const burning = dayRel === 0 && now >= S && now < E ? (events.some((e) => e.state !== "done" && now >= e.start && now < e.end) ? "events" : "available") : null;
  return { available, totalAvailable, fixed: plan.eventLeft, totalFixed, demand, overload, free, unplaced, left, status, tone, burning };
}
const capSummary = (c) => T(`已计划 ${dur(c.demand)} · ${c.status.label} ${dur(c.status.value)} · 剩余 ${c.left}%`, `Planned ${dur(c.demand)} · ${c.status.label} ${dur(c.status.value)} · ${c.left}% free`);

// 已经过去的时间里没有任何记录的那几段：[S, min(E, upto)] 减去有记录的区间的并集。
// 它只是排程上的事实，不等于那段时间被浪费了
function pastGaps(S, E, upto, occupied) {
  const end = Math.min(E, upto);
  if (!(end > S)) return [];
  return subtract([[S, end]], unionSegs(occupied.map(([a, b]) => [Math.max(a, S), Math.min(b, end)]).filter(([a, b]) => b > a)));
}

// 自动记的 🤖 任务（或 Agent Deck 当前托管的行）：没手写预估时长与进度时，有用时的显示实际已做时长，不算出假的「99% · 剩 5m」
function isAutoTask(t, autoKeys = null) {
  if (!t || t.kind !== "task") return false;
  return !!(t.auto || (t.label && t.label.startsWith(AUTO_MARK.trim())) || (autoKeys && autoKeys.has(workKey(t.label))));
}
function formatTaskDur(t, autoKeys = null) {
  if (!t) return "";
  const spent = (t.spentToday || 0) + (t.spentBefore || 0);
  if (isAutoTask(t, autoKeys) && t.state === "open" && !t.explicitDur && t.progress == null && (spent >= 1 || (autoKeys && autoKeys.has(workKey(t.label))))) {
    return T(`已做 ${dur(Math.max(1, Math.round(spent)))}`, `${dur(Math.max(1, Math.round(spent)))} done`);
  }
  const pct = t.progress != null ? Math.round(t.progress * 100) : spent >= 1 ? Math.min(99, Math.round(spent / (spent + t.remaining) * 100)) : null;
  return pct == null ? dur(t.dur) : T(`${pct}% · 剩 ${dur(t.remaining)}`, `${pct}% · ${dur(t.remaining)} left`);
}
function formatTaskTip(t, autoKeys = null) {
  if (!t || (isAutoTask(t, autoKeys) && !t.explicitDur && t.progress == null)) return "";
  const spent = (t.spentToday || 0) + (t.spentBefore || 0);
  const pct = t.progress != null ? Math.round(t.progress * 100) : spent >= 1 ? Math.min(99, Math.round(spent / (spent + t.remaining) * 100)) : null;
  return pct == null ? "" : T(`预估 ${dur(t.dur)}${spent >= 1 ? ` · 已做 ${dur(spent)}（今天 ${dur(t.spentToday)}${t.spentBefore >= 1 ? `，之前 ${dur(t.spentBefore)}` : ""}）` : ""}${t.progress != null ? ` · 进度是你写的 ${pct}%` : ""}`, `Estimate ${dur(t.dur)}${spent >= 1 ? ` · ${dur(spent)} done (${dur(t.spentToday)} today${t.spentBefore >= 1 ? `, ${dur(t.spentBefore)} before` : ""})` : ""}${t.progress != null ? ` · progress ${pct}% as you wrote it` : ""}`);
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
const useClockTotal = (t) => !t.aiSpan && t.clock && t.clock.total != null && !(t.doing && t.state === "open") && !(t.clock.partial && (t.worked || []).length) && !/←\s*\S+\s*$/.test(t.label);
function dayReview(items, cfg, { live = false, auto = new Set() } = {}) {
  const rows = [];
  for (const t of items) {
    if (t.kind !== "task" || t.container || isReview(t)) continue;
    const done = t.state === "done";
    const worked = t.worked || [];
    const noPlan = auto.has(workKey(t.label)) || t.label.startsWith(AUTO_MARK.trim()) || (done && !(t.est > 0) && t.explicitDur === true && !t.actual);
    const planned = noPlan ? null : done ? (t.est > 0 ? t.est : cfg.defaultDur) : t.dur;
    // 实际：记下来的那几段和 DONE 后面写的时段合起来（重叠只算一次）；直接写了做多久的按写的
    let actual = useClockTotal(t) ? Math.floor(t.clock.total) : Math.floor(unionMin([...worked, ...(done && t.actual ? [t.actual] : [])]));
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
const reviewLine = (s) => T(`已完成 ${s.completedCount}/${s.totalCount} · 已对比 ${s.comparedCount} 件：预计 ${dur(s.plannedMinutes)} · 实际 ${dur(s.actualMinutes)} · 偏差 ${signed(s.varianceMinutes)}`, `Done ${s.completedCount}/${s.totalCount} · compared ${s.comparedCount}: estimated ${dur(s.plannedMinutes)} · actual ${dur(s.actualMinutes)} · off by ${signed(s.varianceMinutes)}`);
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
// 老一些的限额报错没带 resetsAt，只在文字里写「resets 4:20am」「resets 1pm」「resets Oct 18, 9am」：取 at 之后最近的那个时刻（毫秒），读不出返回 0
function resetFromText(text, at) {
  const m = /resets\s+(?:([A-Z][a-z]{2})\s+(\d{1,2}),?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(String(text || ""));
  if (!m) return 0;
  let h = +m[3] % 12 + (/pm/i.test(m[5]) ? 12 : 0);
  const t = moment(at).hours(h).minutes(+(m[4] || 0)).seconds(0).milliseconds(0);
  const mon = m[1] ? "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[1].toLowerCase()) / 3 : -1;   // 月份按英文缩写自己对：Obsidian 里的 moment 是中文语言环境
  if (mon >= 0 && Number.isInteger(mon)) { t.month(mon).date(+m[2]); if (t.valueOf() < at) t.add(1, "year"); }
  else if (!m[1] && t.valueOf() <= at) t.add(1, "day");
  return t.valueOf();
}
const CANON_KW = { LATER: "TODO", NOW: "DOING", "IN-PROGRESS": "DOING", WAIT: "WAITING", MAYBE: "WAITING", YES: "DONE", CANCELED: "CANCELLED", NO: "CANCELLED" };
const canonKw = (kw) => { const u = String(kw || "").toUpperCase(); return CANON_KW[u] || u; };
function splitTask(raw) {
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(raw);
  if (!m) return null;
  let [, prefix, rest] = m;
  const st = STAMP_RE.exec(rest);
  if (st) { prefix += st[0]; rest = rest.slice(st[0].length); }   // **07:37** 记录点留在原位
  const cb = CHECKBOX_RE.exec(rest);
  if (cb) rest = rest.slice(cb[0].length);
  const ps = prioShort(rest, SHORT_KW_RE);
  if (ps) rest = `${ps.kw} [#${ps.prio}] ${ps.rest}`;   // 简写 todo a 写稿 → TODO [#A] 写稿
  const kw = KEYWORD_RE.exec(rest);
  if (kw) rest = rest.slice(kw[0].length);
  const kwUpper = kw ? kw[1].toUpperCase() : null;
  const kwCanon = kwUpper ? canonKw(kwUpper) : null;
  // 🤖 与优先级（[#A]）先暂存，剥完紧跟的记录时刻/时段后再放回正文开头：改状态时写成 DOING 14:05 🤖 [#A] …
  const leads = [];
  if (kw) {
    let lm;
    while ((lm = /^(🤖|\[#[ABC]\])\s*/.exec(rest))) { leads.push(lm[1]); rest = rest.slice(lm[0].length); }
  }
  let since = null, range = null;
  // 仅非 TODO 状态（DONE / DOING / PAUSED / SUSPENDED / WAITING 等）紧跟的时刻/时段是状态记录，切状态时剥离；TODO 后的时刻属于固定事件预约时间，保留不动
  if (kw && kwCanon !== "TODO") {
    const rg = /^(\d{1,2}[:：]\d{2}\s*[-–~～到至]\s*\d{1,2}[:：]\d{2})\s*/.exec(rest);
    if (rg) {
      if (kwCanon === "DONE") range = rg[1];
      rest = rest.slice(rg[0].length);
    } else {
      const t = /^(\d{1,2})[:：](\d{2})(?![\d:：]|\s*[-–~～到至])\s*/.exec(rest);
      if (t) {
        if (kwCanon !== "DONE") since = `${pad(+t[1])}:${t[2]}`;
        rest = rest.slice(t[0].length);
      }
    }
  }
  if (leads.length) rest = `${leads.join(" ")} ${rest}`;
  return { prefix, rest, since, range, kw: kwUpper, cb: cb ? cb[1] : null };
}
// 写法和 ⌘/ 任务状态快切一样：DOING HH:MM … → DONE HH:MM-HH:MM …（复选框也改成关键词，⌘/ 才能接着切）
function toDoing(raw) { const p = splitTask(raw); return p ? `${p.prefix}DOING ${moment().format("HH:mm")} ${p.rest}` : raw; }
function toDone(raw, since, end) { const p = splitTask(raw); return p ? `${p.prefix}DONE ${p.since ?? since}-${end} ${p.rest}` : raw; }
function toTodo(raw) { const p = splitTask(raw); return p ? `${p.prefix}TODO ${p.rest}` : raw; }
function toPaused(raw) { const p = splitTask(raw); return p ? `${p.prefix}PAUSED ${p.rest}` : raw; }
function toKeyword(raw, kw, nowStr = moment().format("HH:mm")) {
  const p = splitTask(raw);
  if (!p) return raw;
  const target = String(kw || "TODO").toUpperCase();
  if (p.kw && canonKw(p.kw) === canonKw(target)) return raw;
  if (target === "DOING") return `${p.prefix}DOING ${nowStr} ${p.rest}`;
  if (target === "DONE") return `${p.prefix}DONE ${p.since && p.since !== nowStr ? `${p.since}-${nowStr}` : nowStr} ${p.rest}`;
  return `${p.prefix}${target} ${p.rest}`;
}
// 「接下来」面板点击循环：原状态 → DONE → SUSPENDED → 原状态
function cycleUpNextStatus(raw, origRaw = null, nowStr = moment().format("HH:mm")) {
  const p = splitTask(raw);
  if (!p) return { nextRaw: raw, nextKw: null, origRaw };
  const cur = canonKw(p.kw || (p.cb === "x" || p.cb === "X" ? "DONE" : p.cb === "/" ? "DOING" : "TODO"));
  if (cur === "DONE") {
    return { nextRaw: toKeyword(raw, "SUSPENDED", nowStr), nextKw: "SUSPENDED", origRaw: origRaw ?? raw };
  }
  if (cur === "SUSPENDED") {
    if (origRaw != null) {
      const op = splitTask(origRaw);
      const okw = canonKw(op?.kw || (op?.cb === "/" ? "DOING" : op?.cb === "x" || op?.cb === "X" ? "DONE" : "TODO"));
      return { nextRaw: origRaw, nextKw: okw, origRaw: null };
    }
    return { nextRaw: toKeyword(raw, "TODO", nowStr), nextKw: "TODO", origRaw: null };
  }
  return { nextRaw: toKeyword(raw, "DONE", nowStr), nextKw: "DONE", origRaw: raw };
}
function taskPriority(raw) {
  const m = /\[#([ABC])\]/.exec(String(raw || ""));
  if (m) return m[1];
  const lm = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(String(raw || ""));
  if (!lm) return "";
  let rest = lm[2].replace(STAMP_RE, "").replace(CHECKBOX_RE, "");
  const ps = prioShort(rest, SHORT_KW_RE);
  return ps ? ps.prio : "";
}
function toPriority(raw, prio) {
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(String(raw || ""));
  if (!m) return raw;
  let [, head, rest] = m;
  const st = STAMP_RE.exec(rest);
  if (st) { head += st[0]; rest = rest.slice(st[0].length); }
  const cb = CHECKBOX_RE.exec(rest);
  if (cb) { head += cb[0]; rest = rest.slice(cb[0].length); }
  const ps = prioShort(rest, SHORT_KW_RE);
  if (ps) rest = `${ps.kw} [#${ps.prio}] ${ps.rest}`;
  const kw = KEYWORD_RE.exec(rest);
  if (kw) {
    head += kw[0];
    rest = rest.slice(kw[0].length);
    const rg = /^(\d{1,2}[:：]\d{2}\s*[-–~～到至]\s*\d{1,2}[:：]\d{2}\s*)/.exec(rest);
    if (rg) { head += rg[0]; rest = rest.slice(rg[0].length); }
    else {
      const tm = /^(\d{1,2}[:：]\d{2}(?![\d:：]|\s*[-–~～到至])\s*)/.exec(rest);
      if (tm) { head += tm[0]; rest = rest.slice(tm[0].length); }
    }
    const ai = /^(🤖\s*)/.exec(rest);
    if (ai) { head += ai[0]; rest = rest.slice(ai[0].length); }
  }
  rest = rest.replace(/\[#[ABC]\]\s*/g, "").trimStart();
  const target = ["A", "B", "C"].includes(String(prio || "").toUpperCase()) ? String(prio).toUpperCase() : "";
  return target ? `${head}[#${target}] ${rest}` : `${head}${rest}`;
}
const UP_NEXT_MENU_GROUPS = [
  [
    ["TODO", T("TODO · 待办", "TODO · To-do")],
    ["DOING", T("DOING · 进行中", "DOING · Doing")],
    ["DONE", T("DONE · 已完成", "DONE · Done")],
    ["PAUSED", T("PAUSED · 暂停", "PAUSED · Paused")],
    ["WAITING", T("WAITING · 等待", "WAITING · Waiting")],
    ["SUSPENDED", T("SUSPENDED · 搁置", "SUSPENDED · Suspended")],
    ["CANCELLED", T("CANCELLED · 取消", "CANCELLED · Cancelled")],
  ],
];
const UP_NEXT_PRIORITY_ITEMS = [
  ["A", T("[#A] 重要 · 主线", "[#A] High · Mainline")],
  ["B", T("[#B] 较重要", "[#B] Medium")],
  ["C", T("[#C] 一般", "[#C] Low")],
  ["", T("清除重要程度", "Clear priority")],
];

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

const asStr = (x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

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
<key>CFBundleName</key><string>${T("螺旋日程", "Nautilus Spiral")}</string>
<key>CFBundleDisplayName</key><string>${T("螺旋日程", "Nautilus Spiral")}</string>
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
    if (r.code !== 0) { await fs.promises.rm(app, { recursive: true, force: true }); throw new Error(T("通知小助手签名失败：", "Could not sign the notification helper: ") + r.stderr.slice(0, 300)); }
    return app;
  })().catch((e) => { notifyApp = null; throw e; });
  return notifyApp;
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
    if (r.code !== 0 || !fs.existsSync(bin)) throw new Error(T("编译小助手失败（需要 Xcode 命令行工具：xcode-select --install）\n", "Could not compile the helper (it needs the Xcode command line tools: xcode-select --install)\n") + r.stderr.slice(0, 500));
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
    try { data = JSON.parse(r.stdout); } catch (e) { throw new Error(r.stderr || T("日历小助手没有输出", "The calendar helper returned nothing")); }
    if (data && data.error === "denied") throw new Error(T("没有日历权限：到「系统设置 → 隐私与安全性 → 日历」里给 Obsidian 打开「完全访问」", "No calendar access: in System Settings → Privacy & Security → Calendars, give Obsidian Full Access"));
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
    if (!this.host.clientId() || !this.host.get("secret")) throw new Error(T("先填客户端 ID 和客户端密钥", "Fill in the client ID and client secret first"));
    const crypto = require("crypto"), http = require("http");
    const b64 = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const verifier = b64(crypto.randomBytes(48)), state = b64(crypto.randomBytes(16));
    const challenge = b64(crypto.createHash("sha256").update(verifier).digest());
    const server = http.createServer();
    await new Promise((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", ok); });
    const redirect = `http://127.0.0.1:${server.address().port}`;
    try {
      const code = await new Promise((ok, bad) => {
        const timer = setTimeout(() => bad(new Error(T("等了太久，没有收到授权", "Waited too long without receiving authorization"))), timeout * 1000);
        server.on("request", (req, res) => {
          const u = new URL(req.url, redirect);
          if (!u.searchParams.has("code") && !u.searchParams.has("error")) { res.writeHead(404); res.end(); return; }
          const good = u.searchParams.get("state") === state && u.searchParams.has("code");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!doctype html><meta charset="utf-8"><title>${T("螺旋日程", "Nautilus Spiral")}</title><body style="font:16px/1.6 -apple-system,sans-serif;text-align:center;padding-top:18vh">${good ? T("连上了，可以关掉这个页面，回到 Obsidian。", "Connected. You can close this page and go back to Obsidian.") : T("没有连上：", "Not connected: ") + (u.searchParams.get("error") || T("授权信息对不上", "authorization does not match")) + T("。回到 Obsidian 再试一次。", ". Go back to Obsidian and try again.")}</body>`);
          clearTimeout(timer);
          good ? ok(u.searchParams.get("code")) : bad(new Error(u.searchParams.get("error") === "access_denied" ? T("你在浏览器里拒绝了授权", "You declined authorization in the browser") : T("授权信息对不上：", "Authorization does not match: ") + (u.searchParams.get("error") || T("state 不一致", "state mismatch"))));
        });
        this.host.open(this.authUrl(redirect, challenge, state));
      });
      const r = await this.host.http({ url: "https://oauth2.googleapis.com/token", method: "POST", contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({ client_id: this.host.clientId(), client_secret: this.host.get("secret"), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirect }).toString() });
      if (r.status !== 200 || !r.json.refresh_token) throw new Error(T("换令牌失败：", "Could not exchange the token: ") + ((r.json && (r.json.error_description || r.json.error)) || r.status));
      this.host.set("refresh", r.json.refresh_token);
      this.access = { token: r.json.access_token, until: Date.now() + (r.json.expires_in - 60) * 1000 };
      this.cals = null;
    } finally { server.close(); }
  }

  disconnect() { this.host.set("refresh", ""); this.access = null; this.cals = null; }

  async token() {
    if (this.access && Date.now() < this.access.until) return this.access.token;
    const refresh = this.host.get("refresh");
    if (!refresh) throw new Error(T("还没连接 Google 账号", "No Google account connected yet"));
    const r = await this.host.http({ url: "https://oauth2.googleapis.com/token", method: "POST", contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({ client_id: this.host.clientId(), client_secret: this.host.get("secret"), refresh_token: refresh, grant_type: "refresh_token" }).toString() });
    if (r.status !== 200 || !r.json.access_token) {
      // 授权被撤销或者过期了：要重新连接
      if (r.json && r.json.error === "invalid_grant") { this.host.set("refresh", ""); throw new Error(T("Google 的授权失效了，到设置里重新连接", "Google authorization has expired; reconnect in settings")); }
      throw new Error(T("刷新 Google 令牌失败：", "Could not refresh the Google token: ") + ((r.json && (r.json.error_description || r.json.error)) || r.status));
    }
    this.access = { token: r.json.access_token, until: Date.now() + (r.json.expires_in - 60) * 1000 };
    return this.access.token;
  }

  async api(path, params = {}) {
    const r = await this.host.http({ url: `https://www.googleapis.com/calendar/v3${path}?${new URLSearchParams(params).toString()}`, method: "GET", headers: { Authorization: "Bearer " + await this.token() } });
    if (r.status === 401) { this.access = null; throw new Error(T("Google 说令牌无效，下一次会重新取", "Google says the token is invalid; a new one will be fetched next time")); }
    if (r.status !== 200) throw new Error(T("Google 日历：", "Google Calendar: ") + ((r.json && r.json.error && r.json.error.message) || r.status));
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
const DSH_TOUCH = new Set(["user/message", "assistant/message", "tool/call", "tool/result", "turn/start", "turn/end", "step/start", "step/end"]);   // DSH 日志里算「这一刻在动」的事件
const AI_FRESH_DAYS = 14;   // 最近这么多天的汇总会随日志重算，更早的定格不再改
const AI_STORE_V = 5;       // ai-usage.json 的格式版本；升级时用现存日志把所有日子重算一遍（5 = 加入 DeepSeek Harness 与 Antigravity 直接会话日志汇总）

const fmtKey = (d, cfg) => cfg.format.replace("YYYY", d.getFullYear()).replace("MM", pad(d.getMonth() + 1)).replace("DD", pad(d.getDate()));

function aiDay(ms, cfg) {
  const cutoff = journalDayCutoff(cfg);
  const d = new Date(ms - cutoff * 3600e3);
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { key: fmtKey(d, cfg), t: (ms - mid) / 60000 };   // t 和螺旋同一个坐标：当天 0 点起的分钟数，凌晨会超过 1440
}

// 会话来自哪个 Agent（各读各的日志目录），螺旋和列表上各用各的颜色：Claude 橙、Codex 黑、WorkBuddy 青绿、DeepSeek 蓝、Antigravity 彩虹渐变
const AI_AGENTS = { claude: "Claude", codex: "Codex", workbuddy: "WorkBuddy", dsh: "DeepSeek Harness", antigravity: "Antigravity" };
const aiAgent = (x) => (x && AI_AGENTS[x.agent] ? x.agent : "claude");   // 旧记录没写来源的都是 Claude
// 主力 Agent：全量追踪；没设过是 Claude
const aiPrimary = (cfg) => (cfg && AI_AGENTS[cfg.aiPrimary] ? cfg.aiPrimary : "claude");
// 设置里开着的那几个，没设过就是全开；主力总是开着
const aiOn = (cfg) => Object.keys(AI_AGENTS).filter((k) => !(cfg && cfg.aiAgents) || cfg.aiAgents[k] !== false || k === aiPrimary(cfg));
const codexHome = () => process.env.CODEX_HOME || require("path").join(require("os").homedir(), ".codex");
// 这个会话是在哪开的
const aiWhere = (x) => {
  const a = aiAgent(x), app = x.app || "";
  if (a === "claude") return app === "cli" ? T("终端", "Terminal") : T("Claude 桌面版", "Claude desktop");   // 终端里的 Claude Code；其余（claude-desktop 或者旧记录不知道来源的）按桌面版
  if (a === "codex") return /desktop/i.test(app) ? T("Codex 桌面版", "Codex desktop") : /tui|cli|exec/i.test(app) ? T("Codex 终端", "Codex terminal") : "Codex";
  if (a === "dsh") return "DeepSeek Harness";
  if (a === "antigravity") return "Antigravity";
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

// Session totals stay on the recorded date. Only the spiral's display coordinates wrap.
function projectAiDay(raw, cfg) {
  const day = aiPick(raw, cfg);
  if (!day) return null;
  const start = cfg.dayStart * 60;
  const project = (segs) => (segs || []).flatMap(([a, b]) => {
    const shifted = normalize(a, cfg);
    if (shifted === a) return [[a, b]];
    const split = Math.min(b, start);
    return [...(split < b ? [[split, b]] : []), [shifted, split + shifted - a]];
  });
  const entry = (row) => ({ ...row, segs: project(row.segs) });
  return {
    ...entry(day),
    by: day.by && Object.fromEntries(Object.entries(day.by).map(([agent, row]) => [agent, entry(row)])),
    list: (day.list || []).map(entry),
  };
}

// 同一天的两份汇总拼成一份（两份里的 Agent 不重叠）：主力重算的那份 + 库里留着的非主力那份
function aiJoin(a, b) {
  if (!a || !b) return a || b || null;
  const segs = unionSegs([...(a.segs || []), ...(b.segs || [])].map(([x, y]) => [x, y]));
  const proj = JSON.parse(JSON.stringify(a.proj || {}));
  for (const [n, p] of Object.entries(b.proj || {})) {
    const q = (proj[n] ||= { min: 0, out: 0 });
    q.min += p.min || 0; q.out += p.out || 0;
    for (const [k, m] of Object.entries(p.agents || {})) (q.agents ||= {})[k] = (q.agents[k] || 0) + m;
  }
  const models = { ...(a.models || {}) };
  for (const [m, v] of Object.entries(b.models || {})) models[m] = (models[m] || 0) + v;
  const add = (f) => (a[f] || 0) + (b[f] || 0), list = [...(a.list || []), ...(b.list || [])];
  return { ...a, by: { ...(a.by || {}), ...(b.by || {}) }, list, sessions: list.length, segs, wall: Math.round(segs.reduce((n, [x, y]) => n + y - x, 0)), proj, models,
    agent: add("agent"), out: add("out"), fresh: add("fresh"), cached: add("cached"), calls: add("calls"), prompts: add("prompts") };
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
  if (/^(Bash|shell|local_shell_call|exec_command|shell_command)$/i.test(n)) return cut(i.description || (Array.isArray(i.command) ? i.command[i.command.length - 1] : i.command || i.cmd) || T("跑命令", "Running a command"));
  if (/^(Edit|MultiEdit|NotebookEdit|apply_patch|str_replace_editor)$/i.test(n)) return cut(T(`改 ${base(i.file_path || i.notebook_path || i.path) || "文件"}`, `Editing ${base(i.file_path || i.notebook_path || i.path) || "a file"}`));
  if (/^(Write|create_file)$/i.test(n)) return cut(T(`写 ${base(i.file_path || i.path)}`, `Writing ${base(i.file_path || i.path)}`));
  if (/^(Read|view)$/i.test(n)) return cut(T(`读 ${base(i.file_path || i.path)}`, `Reading ${base(i.file_path || i.path)}`));
  if (/^(Grep|Glob|search)$/i.test(n)) return cut(T(`找 ${i.pattern || i.query || ""}`, `Searching ${i.pattern || i.query || ""}`));
  if (/^(Agent|Task|subagent)$/i.test(n)) return cut(T(`派出去：${i.description || ""}`, `Delegating: ${i.description || ""}`));
  if (/^(WebSearch|web_search)$/i.test(n)) return cut(T(`搜 ${i.query || ""}`, `Searching the web for ${i.query || ""}`));
  if (/^(WebFetch|web_fetch)$/i.test(n)) return T("读网页", "Reading a web page");
  if (n === "Skill") return cut(T(`用技能 ${i.skill || ""}`, `Using skill ${i.skill || ""}`));
  if (/^todo/i.test(n)) return T("整理待办", "Updating to-dos");
  return cut(n.startsWith("mcp__") ? n.split("__").pop() : n);
}
// Agent 自己列的待办做到第几步：[[状态, 这一步叫什么]…] → { done, total, cur }
const todoOf = (pairs) => {
  if (!pairs.length) return null;
  const cur = (pairs.find(([st]) => st === "in_progress") || [])[1] || "";
  return { done: pairs.filter(([st]) => st === "completed").length, total: pairs.length, cur: String(cur).replace(/\s+/g, " ").slice(0, 36) };
};

// ---------------- DeepSeek Harness：读 dsh-token-usage-stats 的 API ----------------
// DSH 桌面版每次启动会随机开一个本机端口；插件把跨会话的 token 统计算好后放在
// /api/token-usage-stats。螺旋只取结果，不再自己解 ~/.dsh/sessions 里的 zstd 日志。
// 端口用 lsof 找监听中的 DeepSeek 进程；也可以在设置里写死 dshApiPort。
function dshApiPorts(cfg) {
  return new Promise((resolve) => {
    const ports = [];
    if (cfg && +cfg.dshApiPort > 0) ports.push(+cfg.dshApiPort);
    const cp = require("child_process");
    const bin = process.platform === "darwin" ? "/usr/sbin/lsof" : "lsof";
    cp.execFile(bin, ["-nP", "-iTCP", "-sTCP:LISTEN"], { timeout: 5000, maxBuffer: 4 << 20 }, (err, out) => {
      if (!err && out) {
        for (const line of out.split("\n")) {
          if (!/^DeepSeek\s/.test(line) || !/\(LISTEN\)/.test(line)) continue;
          const m = /:(\d+)\s+\(LISTEN\)/.exec(line);
          if (m && !ports.includes(+m[1])) ports.push(+m[1]);
        }
      }
      resolve(ports);
    });
  });
}
function dshApiGet(port, path, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = require("http").get({ host: "127.0.0.1", port, path, timeout, headers: { accept: "application/json" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}
// 插件的一天 → 螺旋的 by.dsh：产出 = output，读入 = uncached input + cache write，缓存命中单列；
// 活跃时段只能用插件的按小时桶近似（插件只存聚合，不存每一步的时间）
async function dshApiDay(port, cfg, key) {
  const m = /^(\d{4})[_-](\d{2})[_-](\d{2})$/.exec(key);
  if (!m) return null;
  const cutoff = Number.isFinite(cfg.dayCutoff) ? cfg.dayCutoff : 8;
  const from = new Date(+m[1], +m[2] - 1, +m[3], Math.floor(cutoff), Math.round((cutoff % 1) * 60)).getTime();
  const to = from + 864e5 - 1;
  const snap = await dshApiGet(port, `/api/token-usage-stats?from=${from}&to=${to}&granularity=hour`);
  const t = snap.totals || {};
  const out = t.outputTokens || 0, fresh = (t.uncachedInputTokens || 0) + (t.cacheWriteTokens || 0), cached = t.cacheReadTokens || 0;
  if (!(out || fresh || cached || t.requestCount)) return null;
  const mid = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const segs = [];
  for (const b of snap.series || []) {
    const u = b.totals || {};
    if (!((u.outputTokens || 0) + (u.uncachedInputTokens || 0) + (u.cacheReadTokens || 0))) continue;
    // 插件只给按小时聚合，没有每一步的时刻：在每个有用量的小时中点画一分钟，够在螺旋内圈留个记号，
    // 不把整小时都算成「在干活」（否则 DSH 的协作时长会虚高好几个小时）
    const at = Math.max(cutoff * 60, Math.min(cutoff * 60 + 1439, (b.startTime + 18e5 - mid) / 60000));
    segs.push([at, at + 1]);
  }
  const wall = segs.length;
  const models = {};
  for (const x of snap.models || []) models[x.model] = (models[x.model] || 0) + ((x.totals && x.totals.outputTokens) || 0);
  const list = (snap.topSessions || []).map((x) => {
    const u = x.totals || {};
    const at = aiDay(x.lastTime || from, cfg).t;
    return { sid: x.id, agent: "dsh", dir: "DeepSeek Harness", cwd: "", app: "dsh", title: x.title || "", text: "", min: 0,
      out: u.outputTokens || 0, fresh: (u.uncachedInputTokens || 0) + (u.cacheWriteTokens || 0), cached: u.cacheReadTokens || 0, segs: [[at, at + 1]] };
  });
  const ds = { wall, agent: wall, out, fresh, cached, segs: segs.map(([a, b]) => [Math.round(a), Math.round(b)]),
    calls: t.requestCount || 0, prompts: 0, models };
  return { wall, agent: wall, sessions: list.length, prompts: 0, calls: t.requestCount || 0, out, fresh, cached,
    segs: ds.segs, proj: { "DeepSeek Harness": { min: wall, out, agents: { dsh: wall } } }, models, list, by: { dsh: ds } };
}

class AiUsage {
  constructor(cfg) {
    this.cfg = cfg;
    this.live = new Map();    // 会话号 -> { agent, at, state, step, todo }：这个会话眼下在干什么，只在内存里（见 liveOf）
    this.files = new Map();   // path -> { size, offset, days: Map(key -> { sess: Map(sid -> {proj, ts[], text}), prompts }), msgs: Map(id -> 用量), titles: Map(sid -> 标题) }
    this.titles = new Map();  // Codex 的会话标题（不在会话文件里，另外读）
    this.dshApi = new Map();  // 日记日 -> dsh-token-usage-stats 给的那一天的汇总（螺旋只接收这个）
    this._dshApiKeys = new Set();   // 已经从 API 取过的日子；历史只取一次，今天每次都取
    this._dshPort = 0;        // 上次找到的 DSH 端口，下次先试它
  }

  // DSH：从 dsh-token-usage-stats 的 /api/token-usage-stats 取一天（或几天）的汇总。
  // 取不到就返回空集合，merge 时保留库里原来的 DSH 数，不会把已有记录冲掉
  async fetchDshApi(days) {
    if (!days.length) return new Set();
    const ports = await dshApiPorts(this.cfg);
    if (this._dshPort && !ports.includes(this._dshPort)) ports.unshift(this._dshPort);
    let port = 0;
    for (const p of ports) {
      try { await dshApiGet(p, `/api/token-usage-stats?from=${Date.now() - 36e5}&to=${Date.now()}&granularity=hour`, 5000); port = p; break; }
      catch (e) { /* 不是 DSH，或者插件没开 */ }
    }
    if (!port) { this._dshPort = 0; return new Set(); }
    this._dshPort = port;
    const touched = new Set();
    for (const key of days) {
      try {
        const day = await dshApiDay(port, this.cfg, key);
        if (day) { this.dshApi.set(key, day); this._dshApiKeys.add(key); touched.add(key); }
      } catch (e) { /* 这一天取不到就保留原来的 */ }
    }
    return touched;
  }
  // 历史日子只取一次，今天每次扫描都重取（文件还在长）
  dshDays(n) {
    const today = aiDay(Date.now(), this.cfg).key, out = [];
    for (let i = 0; i < n; i++) {
      const key = aiDay(Date.now() - i * 864e5, this.cfg).key;
      if (key === today || !this._dshApiKeys.has(key)) out.push(key);
    }
    return out;
  }

  // 不是主力的 Agent 追踪最近 AI_FRESH_DAYS 天（含今天和近 7 天柱状图），更早的不翻；主力的照常全读
  stale(agent, ms) {
    if (agent === aiPrimary(this.cfg)) return false;
    const now = Date.now();
    if (!this._todayAt || now - this._todayAt > 60e3) {
      this._todayKey = aiDay(now, this.cfg).key;
      this._freshKey = aiDay(now - AI_FRESH_DAYS * 864e5, this.cfg).key;
      this._todayAt = now;
    }
    return aiDay(ms, this.cfg).key < this._freshKey;
  }

  // [目录, 哪个 Agent]；只给设置里开着的那几个 Agent 的目录，关掉的不读
  static roots(cfg) {
    const os = require("os"), path = require("path");
    const home = os.homedir();
    const dshHome = process.env.DSH_HOME || path.join(home, ".dsh");
    const r = [[path.join(home, ".claude/projects"), "claude"], [path.join(home, ".config/claude/projects"), "claude"]];
    for (const d of (process.env.CLAUDE_CONFIG_DIR || "").split(",").filter(Boolean)) r.push([path.join(d, "projects"), "claude"]);
    // Codex 归档一个会话，是把它的文件从 sessions 挪进 archived_sessions：两边都读，归档了的会话历史才不会断
    r.push(
      [path.join(codexHome(), "sessions"), "codex"],
      [path.join(codexHome(), "archived_sessions"), "codex"],
      [path.join(home, ".workbuddy/projects"), "workbuddy"],
      [path.join(dshHome, "sessions"), "dsh"],
      [path.join(home, ".gemini/antigravity/brain"), "antigravity"],
    );
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
  //   todo = Claude 列的待办做到第几步（TodoWrite / TaskCreate / TaskUpdate）；
  //   turns = 和你来回对话到第几轮（其余 Agent 以及没列 TaskCreate 的 Claude 会话按轮次显示「第 N 轮」）
  // 续接的会话会把旧消息抄进新文件，时间比已经见过的早的不管
  liveOf(sid, agent, ms) {
    let v = this.live.get(sid);
    if (!v) this.live.set(sid, v = { agent, at: 0, state: "run", step: "", todo: null, turns: 0, _waitReply: false });
    if (ms < v.at) return null;
    v.at = ms;
    return v;
  }
  bumpTurn(v) {
    if (!v) return;
    if (!v.turns || v._waitReply !== true) {
      v.turns = (v.turns || 0) + 1;
      v._waitReply = true;
    }
  }
  endTurn(v) {
    if (v) v._waitReply = false;
  }
  liveClaude(d, sid, ms) {
    const v = this.liveOf(sid, "claude", ms);
    if (!v) return;
    // 撞了用量限额：这一轮以一条限额报错结束（和 limit-resume 认的是同一条），文字是「You've hit your session / weekly limit · resets 4:20am (…)」。
    // 额度是整个账号的，几个在跑的会话会在同一刻各收到一条，所以会成批变 HITLIMIT。state = limit，resets = 额度几点恢复（毫秒），week = 是不是周额度
    if (d.isApiErrorMessage && d.error === "rate_limit") {
      const q = d.quotaLimits || (d.apiErrorParams || {}).rate_limit_info || {};
      const text = (Array.isArray(d.message && d.message.content) ? d.message.content : []).map((b) => b.text || "").join("");
      v.state = "limit";
      v.resets = q.resetsAt ? (q.resetsAt < 1e12 ? q.resetsAt * 1000 : q.resetsAt) : resetFromText(text, ms);
      v.week = q.rateLimitType ? /seven_day|week/.test(q.rateLimitType) : /weekly/i.test(text);
      return;
    }
    // 别的 API 报错（server_error 断网 / 过载、authentication_failed、invalid_request 里的上下文满了…）：这一轮也是以它结束的，state = error，err = 报错的头一句
    if (d.isApiErrorMessage) {
      const text = (Array.isArray(d.message && d.message.content) ? d.message.content : []).map((b) => b.text || "").join("");
      v.state = "error";
      v.err = text.replace(/\s+/g, " ").replace(/^API Error:\s*/, "").trim().slice(0, 80) || d.error || "";
      return;
    }
    const c = d.message && d.message.content;
    if (d.type === "user") {
      const stopped = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("") : "";
      v.state = /^\s*\[Request interrupted/.test(stopped) ? "wait" : "run";
      if (aiIsPrompt(d)) this.bumpTurn(v);
      return;
    }
    this.endTurn(v);
    const stop = d.message && d.message.stop_reason;
    v.state = stop === "end_turn" || stop === "stop_sequence" ? "wait" : "run";
    for (const b of Array.isArray(c) ? c : []) {
      if (b.type !== "tool_use") continue;
      const i = b.input || {};
      if (b.name === "TodoWrite" && Array.isArray(i.todos)) v.todo = todoOf(i.todos.map((t) => [t.status, t.activeForm || t.content]));
      else if (b.name === "TaskCreate") {
        const tk = (v.tasks ||= { seq: 0, list: [] });
        const id = String(i.id || i.taskId || ++tk.seq);
        const label = String(i.activeForm || i.subject || i.title || i.content || i.description || "").replace(/\s+/g, " ").trim().slice(0, 36);
        tk.list.push({ id, status: String(i.status || "pending"), label });
        v.todo = this.taskTodo(tk);
      } else if (b.name === "TaskUpdate" && (i.taskId != null || i.id != null)) {
        const tk = (v.tasks ||= { seq: 0, list: [] });
        const rawId = String(i.taskId ?? i.id);
        let item = tk.list.find((x) => x.id === rawId);
        if (!item && /^\d+$/.test(rawId)) item = tk.list[+rawId - 1];
        if (!item) { item = { id: rawId, status: "pending", label: "" }; tk.list.push(item); }
        if (i.status) item.status = String(i.status);
        const label = String(i.activeForm || i.subject || i.title || i.content || "").replace(/\s+/g, " ").trim().slice(0, 36);
        if (label) item.label = label;
        v.todo = this.taskTodo(tk);
      } else v.step = aiStep(b.name, i);
    }
  }
  taskTodo(tk) {
    const alive = (tk.list || []).filter((x) => x.status !== "deleted" && x.status !== "cancelled");
    if (!alive.length) return null;
    const done = alive.filter((x) => x.status === "completed" || x.status === "done").length;
    const curItem = alive.find((x) => x.status === "in_progress") || alive.find((x) => x.status !== "completed" && x.status !== "done");
    return { done, total: alive.length, cur: curItem ? curItem.label || "" : "" };
  }
  liveCodex(d, p, sid, ms) {
    const v = this.liveOf(sid, "codex", ms);
    if (!v) return;
    if (d.type === "event_msg") {
      if (p.type === "task_complete" || p.type === "turn_aborted") { v.state = "wait"; this.endTurn(v); }
      else if (p.type === "error") { v.state = "error"; v.err = String(p.message || "").replace(/\s+/g, " ").trim().slice(0, 80); }
      else if (p.type === "task_started" || p.type === "user_message") v.state = "run";
      return;
    }
    if (p.type === "message" && p.role === "assistant") { this.endTurn(v); return; }
    if (p.type !== "function_call" && p.type !== "custom_tool_call" && p.type !== "local_shell_call") return;
    v.state = "run";
    this.endTurn(v);
    let a = {};
    try { a = typeof p.arguments === "string" ? JSON.parse(p.arguments) : p.arguments || p.action || {}; } catch (e) { /* 参数不是 JSON 就只报工具名 */ }
    v.step = aiStep(p.name || p.type, a);
  }

  // 把一个日志文件新追加的部分读进来（读过的不重读）
  async readNew(p, agent, st, touched) {
    const fs = require("fs"), path = require("path");
    if (agent === "dsh") return this.readDsh(p, st, touched);   // zstd 压的，整份解压，见 readDsh
    let fc = this.files.get(p);
    // Codex / WorkBuddy / Antigravity 一个文件就是一个会话，路径或文件名里带会话号
    if (!fc || st.size < fc.size) {
      this.files.set(p, fc = { size: 0, offset: 0, days: new Map(), msgs: new Map(), titles: new Map(), agent,
        sid: (/([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(p) || [])[1] || path.basename(p, ".jsonl") });
      fc.id = fc.sid;   // 这个文件自己的会话号（Codex 的子线程会把 sid 换成主线程的）
      // Claude 的 subagent 文件（<会话号>/subagents/agent-<id>.jsonl）用量归入父会话
      const sm = agent === "claude" && /([0-9a-f]{8}-[0-9a-f-]{27})[\\/]subagents[\\/]agent-([^\\/]+)\.jsonl$/.exec(p);
      if (sm) { fc.sid = fc.id = sm[1]; fc.sub = sm[2]; }
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

  // 读 mtime >= since 的日志；读过的文件只读新追加的部分。返回这次碰到的日记日
  async scan(since = 0) {
    const fs = require("fs"), path = require("path");
    const touched = new Set();
    const walk = async (dir, depth, agent) => {
      let ents;
      try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return []; }
      const out = [];
      for (const e of ents) {
        if (agent === "antigravity" && e.isDirectory() && /^(steps|chunks|browser_sandbox|scratch|media)$/.test(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory() && depth < 4) out.push(...await walk(p, depth + 1, agent));
        else if (e.isFile() && (agent === "antigravity" ? e.name === "transcript.jsonl" : /\.jsonl(\.zstd|\.zst)?$/.test(e.name))) out.push(p);
      }
      return out;
    };
    if (aiOn(this.cfg).includes("codex")) await this.codexTitles();
    for (const [root, agent] of AiUsage.roots(this.cfg)) {
      for (const p of await walk(root, 0, agent)) {
        let st;
        try { st = await fs.promises.stat(p); } catch (e) { continue; }
        let fc = this.files.get(p);
        if (!fc && (st.mtimeMs < since || this.stale(agent, st.mtimeMs))) continue;   // 非主力今天没动过的文件不读
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
    if (!["message", "reasoning", "function_call", "function_call_result"].includes(d.type) || !+d.timestamp || this.stale("workbuddy", +d.timestamp)) return;
    const { key, day, s } = this.touchSess(fc, touched, +d.timestamp, fc.sid, d.cwd, "workbuddy");
    const lv = this.liveOf(fc.sid, "workbuddy", +d.timestamp);
    if (lv) lv.state = d.type === "message" && d.role === "assistant" ? "wait" : "run";
    if (d.type === "message" && d.role === "user") {
      const text = (Array.isArray(d.content) ? d.content : []).filter((b) => b && b.type === "input_text").map((b) => b.text || "").join("")
        .replace(/<system-reminder[\s\S]*?<\/system-reminder>/g, "").trim();
      if (text) {
        this.addPrompt(day, s, text);
        this.bumpTurn(lv);
      }
    } else if (d.type === "message" && d.role === "assistant") {
      this.endTurn(lv);
    } else if (d.type === "function_call" && lv) {
      this.endTurn(lv);
      lv.step = aiStep(d.name, d.arguments || d.input || {});
    }
    const pd = d.providerData || {}, u = pd.usage;
    if (u && pd.messageId) {
      const cached = (u.inputTokensDetails || []).reduce((k, x) => k + ((x && x.cached_tokens) || 0), 0);
      fc.msgs.set("wb:" + pd.messageId, { key, sid: fc.sid, proj: s.proj, model: pd.requestModelName || pd.model,
        out: u.outputTokens || 0, fresh: Math.max(0, (u.inputTokens || 0) - cached), cached });
    }
  }

  // DeepSeek Harness：<DSH_HOME>/sessions/<工程>/session-<号>/session.v4.jsonl.zstd。
  // 文件是 zstd 压的，而且由很多帧拼起来，只能整份解；每行一个事件，时间在事件自己的 time 上。
  // 文件还在写的时候末尾可能是半帧：这一轮先跳过，下一轮再读。压缩后的文件没法从中间接着读，所以每次变了就整份重算。
  async readDsh(p, st, touched) {
    const fs = require("fs"), path = require("path");
    let fc = this.files.get(p);
    if (!fc || st.size < fc.size) {
      const dir = path.basename(path.dirname(p));
      const base = path.basename(p).replace(/\.jsonl(\.zstd|\.zst)?$/, "");
      const sid = /^session-/.test(dir) ? dir : (/([0-9a-f]{8}-[0-9a-f-]{27})/.exec(base) || [])[1] || base;
      this.files.set(p, fc = { size: 0, offset: 0, days: new Map(), msgs: new Map(), titles: new Map(), agent: "dsh", sid, id: sid, cwd: "", app: "dsh" });
    }
    let text;
    try { text = Buffer.from(dshUnzstd(await fs.promises.readFile(p))).toString("utf8"); }
    catch (e) { return; }   // 正在写，末尾半帧；下一轮再读
    fc.size = st.size;
    fc.days = new Map();
    fc.msgs = new Map();
    fc.titles = new Map();
    fc.cwd = "";
    this.live.delete(fc.sid);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      this.ingestDsh(lines[i], fc, touched);
      if (i % 2000 === 1999) await new Promise((r) => setTimeout(r, 0));
    }
  }

  // DSH 的一行：session 头、标题、你发的原话、assistant/message（带这一轮的用量）、工具调用和轮次结束。
  // 你发话 / 开始一轮 / 开始一步 / 调工具都算在动；一轮结束算等你。subagent 的用量已经算在父会话的 assistant/message 里，不另读
  ingestDsh(line, fc, touched) {
    if (!line) return;
    let d;
    try { d = JSON.parse(line); } catch (e) { return; }
    const t = d.type, data = d.data || {}, ms = +d.time || 0;
    if (t === "session") {
      fc.sid = fc.id = d.id || fc.sid;
      fc.cwd = d.cwd || fc.cwd;
      fc.app = "dsh";
      fc.createdAt = d.createdAt || fc.createdAt;
      return;
    }
    if (!ms) return;
    if (t === "session/title") {
      const title = data.title;
      if (title) fc.titles.set(fc.sid, String(title));
      return;
    }
    if (!DSH_TOUCH.has(t) || this.stale("dsh", ms)) return;
    const { key, day, s } = this.touchSess(fc, touched, ms, fc.sid, fc.cwd, "dsh");
    const v = this.liveOf(fc.sid, "dsh", ms);
    // 只算你亲手发的话：runtime context、技能目录、时间快照、审批提示都不是 prompt
    if (t === "user/message") {
      const content = data.message ? data.message.content : data.content;
      const text = (Array.isArray(content) ? content : []).filter((b) => b && b.type === "text").map((b) => b.text || "").join("").trim();
      if (text && data.source && data.source.kind === "user") {
        this.addPrompt(day, s, text);
        if (v) { v.state = "run"; this.bumpTurn(v); }
      }
      return;
    }
    if (t === "turn/start" || t === "step/start") {
      if (v) { v.state = "run"; v.err = ""; }
      return;
    }
    if (t === "tool/call") {
      if (!v) return;
      v.state = "run";
      this.endTurn(v);
      let a = {};
      try { a = typeof data.arguments === "string" ? JSON.parse(data.arguments) : data.arguments || {}; } catch (e) { /* 参数不是 JSON 就只报工具名 */ }
      v.step = aiStep(data.name, a);
      return;
    }
    if (t === "assistant/message") {
      const msg = data.message || {};
      if (v) {
        v.state = "run";
        this.endTurn(v);
        for (const b of Array.isArray(msg.content) ? msg.content : []) if (b.type === "tool-call" || b.type === "tool_use") v.step = aiStep(b.name, b.arguments || b.input);
      }
      const model = (msg.source && msg.source.model) || fc.model;
      if (model) fc.model = model;
      const u = data.usage;
      if (!u || !(u.outputTokens || u.inputTokens || u.cacheReadTokens || u.cacheWriteTokens)) return;
      const id = msg.id || `dsh:${fc.sid}:${d.seq ?? fc.msgs.size}`;
      fc.msgs.set("dsh:" + id, { key, sid: fc.sid, proj: s.proj, model,
        out: u.outputTokens || 0, fresh: (u.inputTokens || 0) + (u.cacheWriteTokens || 0), cached: u.cacheReadTokens || 0 });
      return;
    }
    if (t === "turn/end") {
      if (!v) return;
      this.endTurn(v);
      const reason = data.reason || {};
      v.state = reason.kind === "error" ? "error" : "wait";
      v.err = reason.kind === "error" ? String((reason.error && reason.error.message) || "").slice(0, 120) : "";
      v.todo = null;
    }
  }

  // Google Antigravity：~/.gemini/antigravity/brain/<会话号>/.system_generated/logs/transcript.jsonl
  ingestAntigravity(line, fc, touched) {
    if (!line) return;
    let d;
    try { d = JSON.parse(line); } catch (e) { return; }
    const ms = Date.parse(d.created_at || d.timestamp || "") || 0;
    if (!ms || (d.type !== "USER_INPUT" && d.type !== "PLANNER_RESPONSE" && d.type !== "TOOL_RESPONSE") || this.stale("antigravity", ms)) return;
    if (d.type === "PLANNER_RESPONSE" && !fc.cwd && Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        const a = tc.args || tc.arguments || {};
        const fp = a.Path || a.TargetFile || a.DirectoryPath || "";
        if (typeof fp === "string" && fp.startsWith("/")) { fc.cwd = require("path").dirname(fp); break; }
      }
    }
    const { key, day, s } = this.touchSess(fc, touched, ms, fc.sid, fc.cwd || "Antigravity", "antigravity");
    const v = this.liveOf(fc.sid, "antigravity", ms);
    if (d.type === "USER_INPUT") {
      let raw = String(d.content || "");
      const ur = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i.exec(raw);
      const text = (ur ? ur[1] : raw.replace(/<CONTEXT_SUMMARY>[\s\S]*?<\/CONTEXT_SUMMARY>/gi, "").replace(/<system-reminder[\s\S]*?<\/system-reminder>/gi, "")).trim();
      if (text) {
        if (!fc.titles.has(fc.sid)) fc.titles.set(fc.sid, text.split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 60) || text.slice(0, 60));
        this.addPrompt(day, s, text);
        fc._inChars = (fc._inChars || 0) + text.length;
        if (v) { v.state = "run"; v.step = T("思考中", "Thinking"); this.bumpTurn(v); }
      }
      return;
    }
    if (d.type === "PLANNER_RESPONSE") {
      const calls = Array.isArray(d.tool_calls) ? d.tool_calls : [];
      if (v) {
        this.endTurn(v);
        if (calls.length) {
          const ask = calls.find((c) => /ask_question|notify_user/i.test(c.name || ""));
          if (ask) {
            v.state = "wait";
            v.step = T("等你回答", "Waiting for your answer");
          } else {
            v.state = "run";
            const last = calls[calls.length - 1], n = String(last.name || "").replace(/^default_api:/, ""), a = last.args || last.arguments || {};
            if (n === "run_command") v.step = aiStep("Bash", { description: a.toolSummary || a.CommandLine });
            else if (n === "edit_file" || n === "replace_file_content" || n === "multi_replace_file_content") v.step = aiStep("Edit", { path: a.Path || a.TargetFile });
            else if (n === "write_file" || n === " write_to_file") v.step = aiStep("Write", { path: a.Path || a.TargetFile });
            else if (n === "read_file" || n === "view_file") v.step = aiStep("Read", { path: a.Path || a.AbsolutePath });
            else v.step = aiStep(n, a);
          }
        } else {
          v.state = "wait";
          v.step = "";
        }
      }
      const outChars = String(d.content || "").length + String(d.thinking || "").length + calls.reduce((n, tc) => n + JSON.stringify(tc.args || tc.arguments || {}).length, 0);
      const inChars = fc._inChars || 0;
      fc._inChars = 0;
      const outTok = Math.ceil(outChars / 3.5), inTok = Math.ceil(inChars / 3.5);
      if (outTok || inTok) {
        fc.msgs.set(`ag:${fc.sid}:${d.step_index ?? fc.msgs.size}`, { key, sid: fc.sid, proj: s.proj, model: "antigravity", out: outTok, fresh: inTok, cached: 0 });
      }
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
    if (this.stale("codex", ms)) {
      // 今天以前的不记，但 token_count 是累计数，基数要跟着走，不然今天第一条会把以前的全算进来
      const t = d.type === "event_msg" && p.type === "token_count" && p.info && p.info.total_token_usage;
      if (t) fc.tot = { out: t.output_tokens || 0, fresh: Math.max(0, (t.input_tokens || 0) - (t.cached_input_tokens || 0)), cached: t.cached_input_tokens || 0 };
      return;
    }
    const { key, day, s } = this.touchSess(fc, touched, ms, fc.sid, fc.cwd, fc.app);
    this.liveCodex(d, p, fc.sid, ms);
    if (d.type === "response_item" && p.type === "message" && p.role === "user") {
      const text = (Array.isArray(p.content) ? p.content : []).filter((b) => b && b.type === "input_text").map((b) => b.text || "").join("").trim();
      if (text && !text.startsWith("<")) {
        this.addPrompt(day, s, text);   // < 开头的是环境说明，不是你敲的
        this.bumpTurn(this.live.get(fc.sid));
      }
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
    if (fc.agent === "dsh") return this.ingestDsh(line, fc, touched);
    if (fc.agent === "antigravity") return this.ingestAntigravity(line, fc, touched);
    if (!line || (line.indexOf('"type":"assistant"') < 0 && line.indexOf('"type":"user"') < 0 && line.indexOf('"type":"custom-title"') < 0)) return;
    let d;
    try { d = JSON.parse(line); } catch (e) { return; }
    if (d.type === "custom-title") { if (d.customTitle) fc.titles.set(d.sessionId, d.customTitle); return; }
    if (d.type !== "assistant" && d.type !== "user") return;
    const ms = Date.parse(d.timestamp);
    if (!ms || this.stale("claude", ms)) return;
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
    if (!sess.size) return this.dshApi.get(key) || null;
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
    const dsh = !(res.by && res.by.dsh) ? this.dshApi.get(key) : null;
    return dsh ? aiJoin(res, dsh) : res;
  }

  // 把碰到的日子写进汇总库；AI_FRESH_DAYS 天以前、库里已经有的日子定格不改（那时的日志可能已被 Claude Code 清掉一部分）
  merge(store, touched, force = false) {
    const t0 = new Date();
    t0.setDate(t0.getDate() - AI_FRESH_DAYS);
    const frozen = fmtKey(t0, this.cfg);
    let changed = false;
    for (const key of touched) {
      if (store.days[key] && key < frozen && !force) continue;
      let s = this.summary(key);
      // 以前的日子：非主力的动静已经不读了，重算出来的只有主力的；库里原来记下的非主力那份接着留（这次读到了的 Agent 用新算的）
      const old = store.days[key];
      if (old && key < aiDay(Date.now(), this.cfg).key) {
        const keep = Object.keys(AI_AGENTS).filter((k) => k !== aiPrimary(this.cfg) && !(s && s.by && s.by[k]));
        const part = keep.length ? aiPick(old, { aiAgents: Object.fromEntries(Object.keys(AI_AGENTS).map((k) => [k, keep.includes(k)])), aiPrimary: keep[0] }) : null;
        if (part && part.by && keep.some((k) => part.by[k])) s = aiJoin(s, part);
      }
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

// 内圈按实际相交时长列出会话；token 保持本日会话合计，不按分钟摊算。
function aiSegmentSessions(list, agent, start, end) {
  return (list || []).filter((x) => aiAgent(x) === agent).map((x) => ({ ...x,
    overlap: unionMin((x.segs || []).map(([a, b]) => [Math.max(start, a), Math.min(end, b)]).filter(([a, b]) => b > a)),
  })).filter((x) => x.overlap > 0).sort((a, b) => b.overlap - a.overlap || (b.min || 0) - (a.min || 0));
}
function aiHoverSession(x, meta = {}, current = true) {
  const clean = (v, max = 160) => String(v || "").replace(/```[\s\S]*?(?:```|$)/g, " ").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\s*[-*+]\s+/gm, "").replace(/\s*\^[a-z0-9-]+\s*$/i, "").replace(/\s+/g, " ").trim().slice(0, max);
  const m = current ? meta : {};
  const rounds = Array.isArray(m.rounds) ? m.rounds : [];
  const done = rounds.filter((r) => r.summary || (r.doneAt && r.said)).slice(-1)[0];
  const todo = aiAgent(x) === "claude" && m.todo;
  return { title: clean(m.title || x.title || (x.text || "").split(" / ")[0] || x.dir, 400),
    state: m.state || null,
    progress: todo?.total ? T(`${todo.done}/${todo.total} 步${todo.cur ? ` · ${clean(todo.cur, 70)}` : ""}`, `${todo.done}/${todo.total} steps${todo.cur ? ` · ${clean(todo.cur, 70)}` : ""}`) : m.turns > 0 ? T(`第 ${m.turns} 轮`, `Turn ${m.turns}`) : "",
    step: clean(m.step, 100), model: clean(m.model || x.model, 100), cwd: m.cwd || x.cwd || "",
    reply: current ? clean(done?.summary || done?.said || m.lastText, 100) : "",
  };
}

const shq = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;

// Claude 会话列表：看看那会儿 Claude 在做什么，一键回到那个会话。groups = [{ name, sub, list }]，一组一件任务
class AiSessionsModal extends OB.Modal {
  constructor(plugin, title, groups) { super(plugin.app); this.plugin = plugin; this.title = title; this.groups = groups; }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("naut-ai-modal");
    contentEl.createEl("h3", { text: this.title });
    if (typeof this.plugin.agentDeck()?.openSessionBySid !== "function") {
      contentEl.createDiv({ cls: "naut-proj-note", text: T("可用客户端、终端和复制选项由会话来源决定。", "Client, terminal, and copy options depend on the session source.") });
    }
    for (const g of this.groups) {
      if (g.name) {
        const h = contentEl.createDiv({ cls: "naut-ai-group" });
        h.createSpan({ text: g.name });
        if (g.sub) h.createSpan({ cls: "naut-muted", text: ` · ${g.sub}` });
      }
      const rel = g.list.filter((x) => x.related), weak = g.list.filter((x) => !x.related);
      if (!rel.length) contentEl.createDiv({ cls: "naut-proj-note", text: weak.length ? T("没有看起来相关的会话（标题和你发的话里都没有任务名里的词）", "No session looks related (no word from the task name appears in a title or in what you sent)") : T("这段时间里没有 Agent 会话", "No agent sessions in this period") });
      for (const x of rel) this.session(contentEl, x);
      // 只是时间重叠的会话收起来，要看再点开
      if (weak.length) {
        const more = contentEl.createEl("details", { cls: "naut-ai-more" });
        more.createEl("summary", { text: T(`同一时段的其它会话（${weak.length}）`, `Other sessions in the same period (${weak.length})`) });
        for (const x of weak) this.session(more, x);
      }
    }
  }
  session(parent, x) {
    const agent = aiAgent(x);
    const box = parent.createDiv({ cls: `naut-ai-sess naut-by-${agent}` + (x.related ? "" : " is-weak") });
    const first = (x.text || "").split(" / ")[0];
    box.createDiv({ cls: "naut-ai-sess-title", text: x.title || first.slice(0, 120) || T("（没有标题）", "(untitled)") });
    if (x.title && first) box.createDiv({ cls: "naut-ai-sess-text", text: first.slice(0, 200) });
    const viaDeck = typeof this.plugin.agentDeck()?.openSessionBySid === "function";
    const cli = agent === "codex" || x.app === "cli";
    const when = x.overlap != null ? T(`和这件重叠 ${dur(x.overlap)}`, `Overlaps this task by ${dur(x.overlap)}`) : x.stopped ? T(`最后在 ${clock(x.lastAt)}`, `Last active ${clock(x.lastAt)}`) : T(`${clock(x.lastAt)} 还在动`, `Still active at ${clock(x.lastAt)}`);
    box.createDiv({ cls: "naut-ai-sess-meta", text: T(`${aiWhere(x)} · ${x.cwd || x.dir} · ${when} · 这个会话当天 ${dur(x.min)} · 消耗 🗄 ${fmtTok(tokUsed(x))} tok（产出 ${fmtTok(x.out)}${x.fresh != null ? ` · 读入 ${fmtTok(x.fresh)}` : ""}）`, `${aiWhere(x)} · ${x.cwd || x.dir} · ${when} · ${dur(x.min)} in this session that day · used 🗄 ${fmtTok(tokUsed(x))} tok (output ${fmtTok(x.out)}${x.fresh != null ? ` · input ${fmtTok(x.fresh)}` : ""})`) });
    const bar = box.createDiv({ cls: "naut-ai-sess-btns" });
    if (viaDeck) {
      bar.createEl("button", { cls: "mod-cta", text: T("打开会话", "Open session") }).onclick = () => {
        this.plugin.openAgentSession(x.sid, agent);
        this.close();
      };
    }
    if (agent === "dsh") {
      // DSH 目前只有 dsh://open（打开客户端），不能定位到某个会话，所以另给一个复制会话号
      if (!viaDeck) bar.createEl("button", { cls: "mod-cta", text: T("打开 DeepSeek Harness", "Open DeepSeek Harness") }).onclick = () => { require("child_process").execFile("/usr/bin/open", ["dsh://open"], () => {}); this.close(); };
      bar.createEl("button", { text: T("复制会话号", "Copy session ID") }).onclick = async () => { await navigator.clipboard.writeText(x.sid); new OB.Notice(T("已复制：", "Copied: ") + x.sid); };
      return;
    }
    if (agent === "workbuddy" || agent === "antigravity") {
      bar.createEl("button", { text: T("复制会话号", "Copy session ID") }).onclick = async () => { await navigator.clipboard.writeText(x.sid); new OB.Notice(T("已复制：", "Copied: ") + x.sid); };
      return;
    }
    const cmd = (x.cwd ? `cd ${shq(x.cwd)} && ` : "") + (agent === "codex" ? `codex resume ${x.sid}` : `claude --resume ${x.sid}`);
    if (agent === "claude") {
      const desk = bar.createEl("button", { cls: cli || viaDeck ? "" : "mod-cta", text: T("在 Claude 里打开", "Open in Claude") });
      desk.onclick = () => { require("child_process").execFile("/usr/bin/open", [`claude://resume?session=${x.sid}`], () => {}); this.close(); };
    }
    const term = bar.createEl("button", { cls: cli && !viaDeck ? "mod-cta" : "", text: T("在终端里继续", "Continue in terminal") });
    term.onclick = () => { run("/usr/bin/osascript", ["-e", `tell application "Terminal"\nactivate\ndo script ${asStr(cmd)}\nend tell`]); this.close(); };
    bar.createEl("button", { text: T("复制命令", "Copy command") }).onclick = async () => { await navigator.clipboard.writeText(cmd); new OB.Notice(T("已复制：", "Copied: ") + cmd); };
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
    hr.createDiv({ cls: "naut-st-date", text: d.date.format(T("M月D日 dddd", "dddd, MMM D")) });
    const frac = Math.max(0, Math.min(1, (d.now - d.S) / (d.E - d.S)));
    hr.createDiv({ cls: "naut-st-sub", text: T(`${clock(d.S)} → ${d.E >= 1440 ? "次日 " : ""}${clock(d.E)} · 已过 ${Math.round(frac * 100)}%`, `${clock(d.S)} → ${d.E >= 1440 ? "next day " : ""}${clock(d.E)} · ${Math.round(frac * 100)}% gone`) });
    const day = rise(contentEl.createDiv({ cls: "naut-st-day" }));
    day.createDiv({ cls: "naut-st-day-fill", attr: { style: `width:${(frac * 100).toFixed(1)}%` } });
    day.createDiv({ cls: "naut-st-day-now", attr: { style: `left:${(frac * 100).toFixed(1)}%` } });

    if (!d.file) {
      rise(contentEl.createDiv({ cls: "naut-st-empty", text: T(`今天（${d.dayKey}）还没有日记`, `No daily note for today (${d.dayKey}) yet`) }));
    } else {
      // 容量：三块数字 + 一行预算
      const C = d.C;
      const tiles = rise(contentEl.createDiv({ cls: "naut-st-tiles" }));
      const tile = (label, value, tone, tip) => { const t = tiles.createDiv({ cls: `naut-st-tile is-${tone}`, attr: tip ? { "aria-label": tip } : {} }); t.createDiv({ cls: "naut-st-tile-v", text: value }); t.createDiv({ cls: "naut-st-tile-l", text: label }); };
      tile(T("已计划", "Planned"), dur(C.demand), "neutral", T("没做完的待办一共还要多久", "Time still needed for unfinished to-dos"));
      tile(C.status.label, dur(C.status.value), C.status.key === "remaining" ? (C.free > 0 ? "positive" : "neutral") : "warning", C.status.key === "overload" ? T("已计划的比可安排的时间多出这么多", "How far planned work exceeds the time you can schedule") : C.status.key === "fragmented" ? T("总时间够，但没有一段连续的空档放得下", "Enough time in total, but no single free gap is long enough") : T("排完已计划的以后还空着这么多", "Time still free after everything planned is placed"));
      tile(T("剩余", "Free"), `${C.left}%`, C.tone, T("余量 ÷ 全天可安排的时间", "Spare ÷ schedulable time for the whole day"));
      rise(contentEl.createDiv({ cls: "naut-st-budget", text: T(`${C.burning === "available" ? "🔥 " : ""}可安排 ${dur(C.available)} / ${dur(C.totalAvailable)} · ${C.burning === "events" ? "🔥 " : ""}事件 ${dur(C.fixed)} / ${dur(C.totalFixed)}`, `${C.burning === "available" ? "🔥 " : ""}Schedulable ${dur(C.available)} / ${dur(C.totalAvailable)} · ${C.burning === "events" ? "🔥 " : ""}Events ${dur(C.fixed)} / ${dur(C.totalFixed)}`) }));

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
      if (d.doing.length) sec(T("在做", "Doing"), d.doing.length);
      for (const x of d.doing) {
        const el = row("is-doing" + (x.auto ? " is-auto" : ""), "", short(x.item.label), "", x.item);
        if (x.since) this.timers.push(() => el.setText(elapsedText(Date.now() - x.since)));
        else el.setText(x.spent >= 1 ? T(`已做 ${dur(x.spent)}`, `${dur(x.spent)} done`) : T("进行中", "In progress"));
      }

      // 接下来（固定事件和排进去的待办，按时间）
      const upcoming = [...d.events.map((e) => ({ at: Math.max(e.start, d.now), kind: "event", item: e, right: `${clock(e.start)}–${clock(e.end)}` })),
        ...d.next.map((t) => ({ at: t.segments[t.workedN][0], kind: t.prio ? "prio" : "task", item: t, right: t.remaining < t.dur - 1 ? T(`剩 ${dur(t.remaining)}`, `${dur(t.remaining)} left`) : dur(t.dur) }))].sort((a, b) => a.at - b.at).slice(0, 6);
      if (upcoming.length) sec(T("接下来", "Up next"));
      for (const u of upcoming) row(`is-${u.kind}`, u.kind === "event" && u.item.start <= d.now ? T("进行中", "Now") : clock(u.kind === "event" ? u.item.start : u.at), (u.item.paused ? "⏸ " : "") + short(u.item.label), u.right, u.item);
      if (d.over.length) row("is-over", "—", T(`排不下 ${d.over.length} 件：${d.over.slice(0, 3).map((t) => short(t.label)).join("、")}${d.over.length > 3 ? "…" : ""}`, `${d.over.length} won't fit: ${d.over.slice(0, 3).map((t) => short(t.label)).join(", ")}${d.over.length > 3 ? "…" : ""}`), "", d.over[0]);
      if (d.suspended.length) row("is-paused", "💤", T(`搁置 ${d.suspended.length} 件：${d.suspended.slice(0, 3).map((t) => short(t.label)).join("、")}${d.suspended.length > 3 ? "…" : ""}`, `${d.suspended.length} parked: ${d.suspended.slice(0, 3).map((t) => short(t.label)).join(", ")}${d.suspended.length > 3 ? "…" : ""}`), "", d.suspended[0]);
      if (!d.doing.length && !upcoming.length && !d.over.length) rise(contentEl.createDiv({ cls: "naut-st-empty", text: T("今天没有排着的事了", "Nothing else scheduled today") }));

      // 今天的成绩
      sec(T("今天", "Today"));
      const chips = rise(contentEl.createDiv({ cls: "naut-st-chips" }));
      const chip = (text, cls = "") => chips.createSpan({ cls: `naut-st-chip ${cls}`, text });
      chip(T(`✅ 做完 ${d.done} · 还有 ${d.open}`, `✅ ${d.done} done · ${d.open} open`));
      if (d.review && d.review.comparedCount) chip(T(`📋 偏差 ${signed(d.review.varianceMinutes)}`, `📋 Off by ${signed(d.review.varianceMinutes)}`), d.review.varianceMinutes > 0 ? "is-over" : "");
      if (d.ai) { const c = chip(""); for (const k of Object.keys(AI_AGENTS)) if (d.ai.by && d.ai.by[k] && d.ai.by[k].wall) c.createSpan({ cls: `naut-sw naut-bg-${k}` }); c.appendText(T(`🤖 协作 ${dur(d.ai.wall)} · 🗄 ${fmtTok(d.ai.out)} tok`, `🤖 Agents ${dur(d.ai.wall)} · 🗄 ${fmtTok(d.ai.out)} tok`)); }
      if (d.games) chip(`🎮 ${dur(d.games)}`);
    }

    // 这会儿最可能要按的
    const bar = rise(contentEl.createDiv({ cls: "naut-st-btns" }));
    const btn = (text, key, fn, cta) => { const b = bar.createEl("button", { cls: cta ? "mod-cta" : "", text }); if (key) b.createSpan({ cls: "naut-kbd", text: key }); b.onclick = () => { plugin.sound("tick"); this.close(); fn(); }; };
    btn(T("打开螺旋", "Open spiral"), plugin.hotkeyText("open"), () => plugin.activate(), true);
    btn(T("Agent 会话", "Agent sessions"), plugin.hotkeyText("doing-ai"), () => plugin.showDoingAi());

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
    contentEl.createEl("h3", { text: T(`${this.date.format("M月D日 ddd")} · 起床和收工`, `${this.date.format("ddd, MMM D")} · Start and end of day`) });
    const inputs = {};
    const row = (kind, name, def) => {
      const r = contentEl.createDiv({ cls: "naut-bounds-row" });
      r.createSpan({ cls: "naut-bounds-name", text: name });
      const inp = r.createEl("input", { type: "text", placeholder: kind === "end" ? T("还没收工就空着", "Leave empty until you stop for the day") : T(`默认 ${clock(def)}`, `Default ${clock(def)}`) });
      inp.value = b[kind] != null ? clock(b[kind]) : "";
      inputs[kind] = inp;
      if (isToday) r.createEl("button", { text: T("现在", "Now") }).onclick = () => { inp.value = moment().format("HH:mm"); inp.focus(); };
      r.createEl("button", { text: T("默认", "Default") }).onclick = () => { inp.value = ""; inp.focus(); };
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); save(); } });
    };
    row("start", T("☀️ 起床", "☀️ Start"), S);
    row("end", T("🌙 收工", "🌙 End"), E);
    contentEl.createDiv({ cls: "naut-proj-note", text: T("两项都可以空着：只填起床也行，收工等真收工了再填（或者 Telegram 发「睡了」）。空着就按原来的默认算。写法：10:30、1030、10点半；凌晨收工写 2:30，算到当天夜里。", "Both can be left empty: fill in the start now and the end once you actually stop. Empty means the default. Write 10:30 or 1030; if you stop after midnight, write 2:30 and it counts toward that same night.") });
    const err = contentEl.createDiv({ cls: "naut-bounds-err" });
    const bar = contentEl.createDiv({ cls: "naut-ai-sess-btns" });
    const read = (kind) => {
      const v = inputs[kind].value;
      if (!v.trim()) return { t: null };
      const p = parseClockInput(v);
      if (p == null) return { bad: T(`看不懂「${v.trim()}」，写成 10:30 或 10点半`, `Can't read "${v.trim()}"; write it as 10:30 or 1030`) };
      // 起床照写的算，比螺旋起点还早就按起点记（和 Telegram「起了」一样）；收工凌晨的算到当天夜里（写 26:30 也行）
      const t = kind === "end" && p < 1440 ? normalize(p, cfg) : p;
      return { t: Math.max(S, Math.min(E, t)), clamped: t < S || t > E };
    };
    const save = async () => {
      const st = read("start"), en = read("end");
      if (st.bad || en.bad) { err.setText(st.bad || en.bad); return; }
      const s1 = st.t ?? S, e1 = en.t ?? E;
      if (e1 - s1 < 30) { err.setText(T(`收工 ${clock(e1)} 得比起床 ${clock(s1)} 晚至少半小时`, `End ${clock(e1)} must be at least half an hour after start ${clock(s1)}`)); return; }
      const all = (cfg.dayBounds ||= {});
      const nb = {};
      if (st.t != null) nb.start = st.t;
      if (en.t != null) nb.end = en.t;
      if (Object.keys(nb).length) all[dayKey] = nb; else delete all[dayKey];
      await this.plugin.saveData(cfg);
      this.plugin.refresh();
      const note = [st, en].some((x) => x.clamped) ? T(`（超出螺旋 ${clock(S)}–${clock(E)} 的部分按边上算）`, ` (anything outside the spiral's ${clock(S)}–${clock(E)} is clamped to its edge)`) : "";
      new OB.Notice(`${this.date.format("M/D")} ☀️ ${clock(s1)} → 🌙 ${clock(e1)}${note}`);
      this.close();
    };
    bar.createEl("button", { cls: "mod-cta", text: T("保存", "Save") }).onclick = save;
    bar.createEl("button", { text: T("取消", "Cancel") }).onclick = () => this.close();
    setTimeout(() => inputs.start.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

// 主线任务开始前先定目标：做到什么程度算完。done(text)：定下来的目标；没写就关掉的是 ""
class GoalModal extends OB.Modal {
  constructor(app, label, done) { super(app); this.label = label; this.done = done; this.text = ""; }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("naut-focus-modal", "naut-goal-modal");
    contentEl.createDiv({ cls: "naut-fm-title", text: T("🎯 先定目标", "🎯 Set a goal first") });
    contentEl.createDiv({ cls: "naut-fm-sub", text: T(`主线「${this.label}」做到什么程度算完成？写一句能验收的话，开始以后就照着它做。`, `When is the mainline task "${this.label}" done? Write one sentence you can check against, and work toward it once you start.`) });
    const input = contentEl.createEl("textarea", { cls: "naut-goal-input", attr: { rows: "3", placeholder: T("比如：简历 PDF 投出 3 份，项目页的二维码能扫开", "e.g. Resume PDF sent to 3 companies; the QR code on the project page scans") } });
    const bar = contentEl.createDiv({ cls: "naut-goal-btns" });
    const later = bar.createEl("button", { text: T("先不开始", "Not yet") });
    const ok = bar.createEl("button", { cls: "mod-cta", text: T("定下来，开始", "Set it and start") });
    const go = () => {
      const t = input.value.replace(/\s+/g, " ").trim();
      if (!t) { input.addClass("naut-bad-input"); input.focus(); return; }
      this.text = t;
      this.close();
    };
    ok.onclick = go;
    later.onclick = () => this.close();
    input.addEventListener("input", () => input.removeClass("naut-bad-input"));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
    window.setTimeout(() => input.focus(), 30);
  }
  onClose() { this.contentEl.empty(); this.done(this.text); }
}

class PomodoroDoneModal extends OB.Modal {
  constructor(app, plugin, rec, opts = {}) { super(app); this.plugin = plugin; this.rec = rec; this.opts = opts || {}; }
  onOpen() {
    const { contentEl } = this;
    const rec = this.rec;
    const early = !!this.opts.early;
    const elapsedMin = Math.max(0, Math.floor(Number(this.opts.elapsedMin) || 0));
    const logged = early ? (this.opts.logged !== false && elapsedMin >= 1) : (this.opts.logged !== false);
    this.modalEl.addClass("naut-pomo-modal");
    const title = early
      ? (logged
        ? T(`🍅 番茄钟已结束（已做 ${dur(elapsedMin)}）`, `🍅 Pomodoro stopped (${dur(elapsedMin)})`)
        : T("🍅 番茄钟已结束", "🍅 Pomodoro stopped"))
      : T(`🍅 番茄钟完成（${dur(rec.minutes)}）`, `🍅 Pomodoro done (${dur(rec.minutes)})`);
    contentEl.createDiv({ cls: "naut-fm-title", text: title });
    const sub = early && rec.task
      ? (logged
        ? T(`刚才在「${rec.task.label}」上做了 ${dur(elapsedMin)}，已写入实际用时。要标为 DONE、先停下还是保持进行中？`, `Logged ${dur(elapsedMin)} for "${rec.task.label}" to the note. Mark DONE, pause, or keep DOING?`)
        : T(`刚才「${rec.task.label}」未满 1 分钟，未记入用时。要标为 DONE、先停下还是保持进行中？`, `Under 1 minute for "${rec.task.label}", not logged. Mark DONE, pause, or keep DOING?`))
      : rec.task
        ? (logged
          ? T(`刚才预订给「${rec.task.label}」的 ${dur(rec.minutes)} 已经走完，已写入实际用时。要标为 DONE、先停下还是再来一轮？`, `Your ${dur(rec.minutes)} block for "${rec.task.label}" is complete and logged to the note. Mark DONE, pause, or start another round?`)
          : T(`刚才预订给「${rec.task.label}」的 ${dur(rec.minutes)} 已经走完。要标为 DONE、先停下还是再来一轮？`, `Your ${dur(rec.minutes)} block for "${rec.task.label}" is complete. Mark DONE, pause, or start another round?`))
        : T(`预订的 ${dur(rec.minutes)} 已经兑现，已记入今天的番茄轨迹。`, `Your ${dur(rec.minutes)} block is complete and recorded on today's spiral.`);
    contentEl.createDiv({ cls: "naut-fm-sub", text: sub });
    const bar = contentEl.createDiv({ cls: "naut-goal-btns" });
    if (rec.task) {
      bar.createEl("button", { text: T("先停下", "Pause") }).onclick = async () => {
        this.close();
        await this.plugin.pausePomodoroTask(rec.task);
      };
    } else {
      bar.createEl("button", { text: T("收工", "Close") }).onclick = () => this.close();
    }
    if (early) {
      bar.createEl("button", { text: T("保持进行中", "Keep DOING") }).onclick = async () => {
        this.close();
        if (rec.task) await this.plugin.resumePomodoroDoing(rec.task, rec.dayKey);
      };
    } else {
      bar.createEl("button", { text: T("再来一轮", "Another round") }).onclick = async () => {
        this.close();
        await this.plugin.startPomodoro(rec.minutes, rec.task ? { ref: rec.task } : null);
      };
    }
    if (rec.task) {
      bar.createEl("button", { cls: "mod-cta", text: T("标为 DONE", "Mark DONE") }).onclick = async () => {
        this.close();
        await this.plugin.completePomodoroTask(rec.task);
      };
    }
  }
  onClose() {
    if (this.plugin?._pomoModalTask?.key === this.rec?.task?.key) this.plugin._pomoModalTask = null;
    this.contentEl.empty();
  }
}

class QuickPanel extends OB.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder(T("螺旋日程：要做什么？", "Nautilus Spiral: what to do?"));
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
  getDisplayText() { return T("螺旋日程", "Nautilus Spiral"); }
  getIcon() { return "orbit"; }

  async onOpen() {
    this.containerEl.children[1].addClass("naut-root");
    this._enter = true;
    await this.render();
  }

  // 换到相对今天第 n 天：重画，并放一次入场动效
  go(n) { this.stopPlay(); this._agentHoverExpanded = null; this.offset = n; this._enter = true; return this.render(); }

  // 回放一整天：2.8 秒里把「现在」从这天的开头干脆利落地扫到结尾，螺旋指针、拖尾、内圈与任务段按连续帧原地重排，放完回到真实的现在。只是重画，不改日记
  async play() {
    if (this._play != null) { this.stopPlay(); this.plugin.sound("stop"); this.render(); return; }
    const cfg = this.plugin.settings;
    const b = (cfg.dayBounds || {})[this.date().format(cfg.format)] || {};
    const S = b.start ?? cfg.dayStart * 60, E = b.end ?? cfg.dayEnd * 60;
    const ease = (p) => 0.35 * p + 0.65 * (0.5 - 0.5 * Math.cos(Math.PI * p));
    this._play = S;
    this.plugin.sound("play");
    await this.render();
    if (this._play == null) return;
    const t0 = performance.now(), durMs = 2800;
    const tick = (ts) => {
      if (this._play == null) return;
      const p = Math.min(1, (ts - t0) / durMs);
      if (p >= 1) { this.stopPlay(); this.plugin.sound("stop"); this.render(); return; }
      const now = S + ease(p) * (E - S);
      this._play = now;
      if (this._playStep) this._playStep(now);
      this._playRaf = window.requestAnimationFrame(tick);
    };
    this._playRaf = window.requestAnimationFrame(tick);
  }
  stopPlay() {
    if (this._playRaf) window.cancelAnimationFrame(this._playRaf);
    this._playRaf = 0;
    this._play = null;
    this._playStep = null;
  }
  _hideDotTip() {
    this._dotTipAc?.abort();
    this._dotTipAc = null;
    this._dotTip?.remove();
    this._dotTip = null;
  }
  _showDotTip(el, text) {
    this._hideDotTip();
    const tip = document.body.createDiv({ cls: "naut-dot-tip", text });
    this._dotTip = tip;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - tw - 8));
    const top = r.bottom + 6 + th <= window.innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - th - 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    const ac = (this._dotTipAc = new AbortController());
    const hide = () => this._hideDotTip();
    window.addEventListener("scroll", hide, { capture: true, once: true, signal: ac.signal });
    window.addEventListener("blur", hide, { once: true, signal: ac.signal });
    window.addEventListener("pointerdown", hide, { capture: true, once: true, signal: ac.signal });
  }
  _clearPomoTimer() {
    if (this._pomoTimer) { window.clearInterval(this._pomoTimer); this._pomoTimer = null; }
  }
  async onClose() { this._clearPomoTimer(); this._hideDotTip(); this.stopPlay(); this._lastPastRenderKey = null; }

  date() { return this.plugin.today().add(this.offset, "days"); }
  path() { return this.plugin.journalPath(this.date()); }

  async render({ force = false } = {}) {
    const seq = (this._renderSeq = (this._renderSeq || 0) + 1);
    const root = this.containerEl.children[1];
    const cfg = this.plugin.settings;
    const date = this.date();
    const dayKey = date.format(cfg.format);
    const file = this.app.vault.getAbstractFileByPath(this.path());
    const playing = this._play != null;
    const realRel = this.offset === 0 ? 0 : this.offset < 0 ? -1 : 1;
    const isPastStatic = realRel < 0 && !playing;
    const aiStore = cfg.showAi !== false ? await this.plugin.aiUsage({ skipScan: isPastStatic || playing }) : null;
    if (seq !== this._renderSeq) return;
    const gameLog = cfg.trackGames !== false ? await this.plugin.gameLog() : null;
    if (seq !== this._renderSeq) return;
    const content = file instanceof TFile ? await this.plugin.readLiveContent(file) : null;
    if (seq !== this._renderSeq) return;
    const calSnap = file instanceof TFile ? this.plugin.calendarFor(date) : null;
    const aiDayRaw = aiStore?.days?.[dayKey] || null;
    const gameDayRaw = (gameLog && gameLog.days[dayKey]) || null;
    const deckBindings = file instanceof TFile ? this.plugin.deckJournalBindings(dayKey, file.path) : null;
    const computeSig = isPastStatic && content != null ? pastDayComputeSig({ dayKey, content, cfg, cal: calSnap }) : null;
    const pastRenderKey = isPastStatic && computeSig != null
      ? pastDayRenderSig({ computeSig, cfg, aiDay: aiDayRaw, gameDay: gameDayRaw, deckCount: deckBindings ? deckBindings.size : 0 })
      : null;
    // 历史日期输入指纹未变且不是切天入场/强制刷新时，跳过整棵 DOM 重建（避免每分钟定时器与后台会话事件触发闪烁和重算）
    if (pastRenderKey && !force && !this._enter && this._lastPastRenderKey === pastRenderKey && root.childElementCount > 0) return;
    this._lastPastRenderKey = pastRenderKey;
    clearTimeout(this._hoverClose);
    this._clearPomoTimer();
    this._hideDotTip();
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
    head.createSpan({ cls: "naut-date", text: date.format(T("M月D日 ddd", "ddd, MMM D")) });
    const next = head.createEl("button", { text: "›" });
    const today = head.createEl("button", { text: T("今天", "Today") });
    prev.onclick = () => this.go(this.offset - 1);
    next.onclick = () => this.go(this.offset + 1);
    today.onclick = () => this.go(0);
    today.disabled = this.offset === 0;
    // 这天实际的起床 / 收工：点开手填（和拖螺旋上的把手一样）
    {
      const b = (cfg.dayBounds || {})[date.format(cfg.format)] || {};
      const set = b.start != null || b.end != null;
      const btn = head.createEl("button", { cls: "naut-bounds-btn" + (set ? " is-set" : ""), text: `☀️${b.start != null ? clock(b.start) : "--:--"}–🌙${b.end != null ? clock(b.end) : "--:--"}`,
        attr: { "aria-label": set ? T("这天实际的起床 / 收工，点一下改", "Actual start / end of this day; click to change") : T("还没设起床 / 收工（现在是默认），点一下填", "No start / end set for this day (using the defaults); click to fill in") } });
      btn.onclick = () => new BoundsModal(this.app, this.plugin, date).open();
    }

    if (!(file instanceof TFile)) {
      root.createDiv({ cls: "naut-empty", text: T(`还没有 ${this.path()}`, `${this.path()} doesn't exist yet`) });
      return;
    }
    {
      const pb = head.createEl("button", { cls: "naut-playback" + (playing ? " is-playing" : ""), attr: { "aria-label": playing ? T("停止回放", "Stop playback") : T("回放一整天（只是重画，不改日记）", "Play back the whole day (just redraws; the note is not changed)") } });
      if (OB.setIcon) OB.setIcon(pb, "play"); else pb.setText("⏵");
      pb.onclick = () => this.play();
    }
    const nowM = moment();
    const realNow = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    // 回放时 this._play 是模拟的「现在」：这一天按那个时刻重排、重画，像它就是今天一样
    const now = playing ? this._play : realNow;
    const dayRel = playing ? 0 : realRel;
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    const S = cfg.dayStart * 60, E = cfg.dayEnd * 60;
    const S1 = bounds.start ?? S, E1 = bounds.end ?? E;   // 这天实际的开始 / 结束
    let items, M, cal, orphans, plan;
    const cachedDay = isPastStatic && !force && computeSig != null ? this.plugin.pastDayCache?.get(dayKey) : null;
    if (cachedDay && cachedDay.sig === computeSig) {
      ({ items, M, cal, orphans, plan } = cachedDay);
    } else {
      items = parseJournal(content, cfg);
      M = mainOf(cfg.showMain !== false ? content : "");
      markMain(items, M);   // 主线块里的任务排程时排在 DOING 后面，螺旋上换主线的颜色
      cal = this.plugin.withCalendar(items, date);   // macOS 日历里的事件并进来当固定事件
      const done = cfg.doneTimes[dayKey] || {};
      orphans = applyWork(items, cfg, dayKey, realNow, realRel, bounds);   // 这天做过、但任务行已经挪走的

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
          if (playing) t._fullSegments = (t.segments || []).map(([a, b]) => [a, b]);
        } else if (playing && t.worked) {
          t._fullWorked = t.worked.map(([a, b]) => [a, b]);
        }
      }
      if (playing) {
        for (const o of orphans) o._fullSegs = o.segs.map(([a, b]) => [a, b]);
        for (const t of items) if (t._fullWorked) { t.worked = t._fullWorked.map(([a, b]) => [a, Math.min(b, now)]).filter(([a, b]) => b > a); t.spentToday = t.worked.reduce((k, [a, b]) => k + b - a, 0); }
        for (const o of orphans) if (o._fullSegs) o.segs = o._fullSegs.map(([a, b]) => [a, Math.min(b, now)]).filter(([a, b]) => b > a);
      }
      plan = schedule(items, cfg, now, dayRel, bounds);

      if (isPastStatic && computeSig != null && this.plugin.pastDayCache) {
        this.plugin.pastDayCache.delete(dayKey);
        this.plugin.pastDayCache.set(dayKey, { sig: computeSig, items, M, cal, orphans, plan });
        if (this.plugin.pastDayCache.size > 60) {
          const oldest = this.plugin.pastDayCache.keys().next().value;
          if (oldest !== undefined) this.plugin.pastDayCache.delete(oldest);
        }
      }
    }

    // 容量条
    const cap = root.createDiv({ cls: "naut-cap" });
    const total = Math.max(plan.available, plan.demand) || 1;
    const bar = cap.createDiv({ cls: "naut-bar" });
    const fit = Math.min(plan.demand, plan.available);
    const barTask = bar.createDiv({ cls: "naut-bar-task", attr: { style: `width:${(fit / total) * 100}%` } });
    const barFree = bar.createDiv({ cls: "naut-bar-free", attr: { style: `width:${((plan.available - fit) / total) * 100}%` } });
    const barOver = bar.createDiv({ cls: "naut-bar-over", attr: { style: `width:${plan.overflow ? (plan.overflow / total) * 100 : 0}%` } });
    // 进度条下面只留一眼能看完的几行，每行左边一格图标、文字对齐：
    //   📋 排得下吗（已计划 · 余量 / 超载 / 空档不足 · 剩余百分之几）；可安排的时间正在流逝时图标换成会闪的 🔥
    //   🤖 Agent 这一天干了多少（协作时长 · token）
    //   日历读不到时另起一行说一声
    // 细账（可安排和事件两笔预算、按以往的校准、各个大方向、复习、游戏、有没有记录）都收进这两行的悬停提示，不再各占一行；
    // 全天事件下面「固定事件」里有，这里不列。鼠标划过螺旋时，上面那一行详情照旧（见 hover）
    const C = capacity(items, plan, cfg, now, dayRel, bounds);
    const row = (cls, icon, title, iconCls = "") => {
      const r = cap.createDiv({ cls: "naut-cap-row" + (cls ? " " + cls : ""), attr: title ? { title } : {} });
      r.createSpan({ cls: "naut-cap-ico" + (iconCls ? " " + iconCls : ""), text: icon });
      return r.createSpan({ cls: "naut-cap-val" });
    };
    const ai = projectAiDay(aiStore?.days?.[dayKey], cfg);
    const agentDeck = this.plugin.agentDeck();
    const journalLines = content.split("\n");
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
      T(`可安排 ${dur(C.available)} / ${dur(C.totalAvailable)}：从现在到收工还能安排的时间 / 全天扣掉事件以后能安排的时间`, `Schedulable ${dur(C.available)} / ${dur(C.totalAvailable)}: time you can still schedule from now until the end of day / schedulable time for the whole day after events`),
      T(`事件 ${dur(C.fixed)} / ${dur(C.totalFixed)}：还没过去的事件时间 / 全天的事件时间（重叠的只算一次）`, `Events ${dur(C.fixed)} / ${dur(C.totalFixed)}: event time not yet past / event time for the whole day (overlaps count once)`),
      C.status.key === "overload" ? T("超载：已计划的比可安排的时间多出这么多", "Overload: how far planned work exceeds the time you can schedule") : C.status.key === "fragmented" ? T("空档不足：总时间够，但没有一段连续的空档放得下，这么多分钟没排进去", "No gap fits: enough time in total, but no single free gap is long enough; this many minutes could not be placed") : T("余量：排完已计划的以后还空着这么多", "Spare: time still free after everything planned is placed"),
      T("剩余：余量 ÷ 全天可安排的时间", "Free: spare ÷ schedulable time for the whole day"),
    ];
    if (C.burning) notes.push(C.burning === "available" ? T("🔥 可安排的时间正在流逝", "🔥 Schedulable time is slipping away") : T("🔥 事件时间正在流逝", "🔥 Event time is slipping away"));
    // 按以往预估的准头校准一下：近 30 天整体多用 / 少用了多少
    const rv = cfg.showReview !== false && dayRel >= 0 ? this.plugin.reviewData() : null;
    if (rv && rv.n >= 10 && Math.abs(rv.ratio - 1) >= 0.15 && plan.demand >= 15) notes.push(T(`按以往约 ${dur(plan.demand * rv.ratio)}：近 ${rv.days} 天做完的 ${rv.n} 件里，实际用时是预估的 ${rv.ratio.toFixed(2)} 倍`, `About ${dur(plan.demand * rv.ratio)} going by your history: over the last ${rv.days} days, ${rv.n} finished tasks took ${rv.ratio.toFixed(2)}× their estimates`));
    // 🃏 复习卡片（第二大脑的每日回顾记进日记的，每张按「复习用时」秒算）
    const reviews = items.filter(isReview);
    if (reviews.length) notes.push(T(`🃏 复习 ${reviews.reduce((k, t) => k + +(REVIEW_RE.exec(t.label) || [0, 0])[1], 0)} 张 · ${dur(reviews.reduce((k, t) => k + (t.dur || 0), 0))}（螺旋上的青色段）`, `🃏 Review ${reviews.reduce((k, t) => k + +(REVIEW_RE.exec(t.label) || [0, 0])[1], 0)} cards · ${dur(reviews.reduce((k, t) => k + (t.dur || 0), 0))} (the cyan segments on the spiral)`));
    // 🎮 游戏时间（插件每分钟看一眼在不在玩，记在 game-log.json）
    if (games.length) {
      const by = {};
      for (const [a, b, n] of games) by[n] = (by[n] || 0) + b - a;
      notes.push(T(`🎮 游戏 ${dur(unionMin(games))}`, `🎮 Gaming ${dur(unionMin(games))}`) + (Object.keys(by).length > 1 || !by.Steam ? T("：", ": ") + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, m]) => `${n} ${dur(m)}`).join(" · ") : "") + T("（螺旋内圈的细线）", " (thin lines on the inner rings)"));
    }
    if (cfg.showUnrecorded !== false && upto - S1 >= 10) {
      const past = upto - S1, len = (segs) => segs.reduce((k, [a, b]) => k + b - a, 0);
      const none = len(gaps), byMe = past - len(pastGaps(S1, E1, upto, mine));
      notes.push(T(`📝 已过去 ${dur(past)} · 有记录 ${dur(past - none)}（${Math.round((past - none) / past * 100)}%）· 没记录 ${dur(none)}：你记的 ${dur(byMe)}，只有机器记的 ${dur(past - none - byMe)}；没记录的画成斜纹`, `📝 ${dur(past)} gone · ${dur(past - none)} recorded (${Math.round((past - none) / past * 100)}%) · ${dur(none)} unrecorded: ${dur(byMe)} by you, ${dur(past - none - byMe)} only by the machine; unrecorded time is hatched`));
    }
    const plan1 = row("naut-cap-plan", C.burning === "available" ? "🔥" : "📋", notes.join("\n"), C.burning === "available" ? "naut-burn" : "");
    const planDemandEl = plan1.createSpan({ text: T(`已计划 ${dur(C.demand)} · `, `Planned ${dur(C.demand)} · `) });
    const planStatusEl = plan1.createSpan({ cls: C.status.key === "remaining" ? "naut-cap-ok" : "naut-over-text", text: `${C.status.label} ${dur(C.status.value)}` });
    const planLeftEl = plan1.createSpan({ cls: `naut-left is-${C.tone}`, text: T(` · 剩余 ${C.left}%`, ` · ${C.left}% free`) });

    // 🎯 主线：做到第几件、下一件是什么；悬停看每一块和近 7 天的完成率；点一下跳到下一件。今天还没定主线的，直说
    if (cfg.showMain !== false && (M.blocks.length || dayRel >= 0)) {
      const nx = mainNext(M), hist = this.plugin.mainHistory(date);
      const tip = [
        T(`主线：块里带 [#A]（简写 todo a）的任务，一天最多 ${MAIN_MAX} 块，按日记里的先后取。排程时排在 DOING 后面、别的待办前面`, `Mainline: tasks whose block carries [#A] (short form: todo a), at most ${MAIN_MAX} blocks a day, taken in note order. Scheduled after DOING and before other to-dos`),
        ...M.blocks.map((b) => `${b.done === b.total ? "●" : b.tasks.some((t) => t.state === "doing") ? "◐" : "○"} ${b.label}${b.total > 1 ? T(`（${b.done}/${b.total}）`, ` (${b.done}/${b.total})`) : ""}`),
        M.over.length ? T(`⚠ 多了 ${M.over.length} 块，不算主线：${M.over.join("、")}（日记整理时降成 [#B]）`, `⚠ ${M.over.length} extra block(s) don't count as mainline: ${M.over.join(", ")} (journal cleanup lowers them to [#B])`) : "",
        hist.length ? T("近 7 天：", "Last 7 days: ") + hist.map((h) => `${h.d.format("dd")} ${h.done}/${h.total}`).join(" · ") : "",
        nx ? T("点一下跳到下一件主线", "Click to jump to the next mainline task") : "",
      ].filter(Boolean).join("\n");
      const v = row("naut-cap-main", "🎯", tip);
      if (!M.blocks.length) v.createSpan({ cls: "naut-muted", text: T("还没定主线：给最要紧的一到三件写上 [#A]", "No mainline yet: mark the one to three most important things with [#A]") });
      else {
        v.createSpan({ cls: "naut-main-pips", text: mainPips(M) });
        v.createSpan({ text: T(` 主线 ${M.done}/${M.total}`, ` Mainline ${M.done}/${M.total}`) });
        if (!nx) v.createSpan({ cls: "naut-cap-ok", text: T(" · 全部做完 ✓", " · all done ✓") });
        else if (dayRel >= 0) v.createSpan({ text: ` · ${nx.state === "doing" ? T("在做", "Doing") : T("下一件", "Next")} ${nx.label}` });
        else v.createSpan({ cls: "naut-over-text", text: T(` · 差 ${M.total - M.done} 件`, ` · ${M.total - M.done} to go`) });
        if (M.over.length) v.createSpan({ cls: "naut-over-text", text: T(` · 多了 ${M.over.length} 块`, ` · ${M.over.length} extra`) });
        v.parentElement.addClass("mod-clickable");
        v.parentElement.onclick = () => this.plugin.openLine(file, nx ? nx.line : M.blocks[0].line);
      }
    }

    // 🤖 人机协作：这一天 Agent 干了多少（口径见设置里「人机协作」一节）
    if (ai) {
      const models = Object.entries(ai.models).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${fmtTok(n)}`).join(T("、", ", "));
      const only = agents.length === 1 ? AI_AGENTS[agents[0][0]] : "";
      const line = row("naut-cap-ai", "🤖", [
        T(`协作 ${dur(ai.wall)}：有 ${only || "Agent"} 在干活的时间，几个窗口同时开只算一次（螺旋内圈的细线，一个 Agent 一种颜色）`, `Agents ${dur(ai.wall)}: time with ${only || "an agent"} at work; several windows at once count once (thin lines on the inner rings, one color per agent)`),
        agents.length > 1 ? T("各 Agent：", "By agent: ") + agents.map(([k, g]) => `${AI_AGENTS[k]} ${dur(g.wall)}`).join(" / ") : "",
        T(`${only || "Agent"} 工时 ${dur(ai.agent)}：${ai.sessions} 个会话各自的活跃时间相加${ai.agent > ai.wall * 1.1 ? `，平均 ${(ai.agent / ai.wall).toFixed(1)} 路并行` : ""}`, `${only || "Agent"} hours ${dur(ai.agent)}: active time of ${ai.sessions} sessions added up${ai.agent > ai.wall * 1.1 ? `, ${(ai.agent / ai.wall).toFixed(1)} running in parallel on average` : ""}`),
        T(`消耗 ${fmtTok(tokUsed(ai))} tok = 产出 + 读入${agents.length > 1 ? "：" + agents.map(([k, g]) => `${AI_AGENTS[k]} ${fmtTok(tokUsed(g))}`).join(" / ") : ""}`, `Used ${fmtTok(tokUsed(ai))} tok = output + input${agents.length > 1 ? ": " + agents.map(([k, g]) => `${AI_AGENTS[k]} ${fmtTok(tokUsed(g))}`).join(" / ") : ""}`),
        T(`产出 ${fmtTok(ai.out)}：${only || "Agent"} 写出来的 token（含思考），${ai.calls} 次调用`, `Output ${fmtTok(ai.out)}: tokens ${only || "the agents"} wrote (thinking included), ${ai.calls} calls`),
        T(`读入 ${fmtTok(ai.fresh)}：新读进来的文件、命令输出`, `Input ${fmtTok(ai.fresh)}: newly read files and command output`),
        T(`缓存命中 ${fmtTok(ai.cached)}：每轮重读上下文，不算工作量`, `Cache hits ${fmtTok(ai.cached)}: context re-read every turn, not counted as work`),
        T(`指令 ${ai.prompts}：你亲手发的消息`, `Prompts ${ai.prompts}: messages you sent yourself`),
        models && T(`模型：${models}`, `Models: ${models}`),
      ].filter(Boolean).join("\n"));
      line.createSpan({ text: T(`协作 ${dur(ai.wall)} · 🗄 ${fmtTok(tokUsed(ai))} tok`, `Agents ${dur(ai.wall)} · 🗄 ${fmtTok(tokUsed(ai))} tok`) });
      for (const [k] of agents) line.createSpan({ cls: `naut-sw naut-bg-${k}` });
    }
    // 📅 日历读不到时说明原因（全天事件本身在下面「固定事件」里）
    if (cal && cal.error) row("is-error", "📅", cal.error).setText(cal.error.split("\n")[0]);

    // 🍅 番茄钟栏（仅今天显示）：三档切换（15 / 25 / 自定义）+ 进行中倒计时
    if (dayRel === 0) {
      const pomo = this.plugin.ensurePomodoro();
      const hist = (cfg.pomodoroHistory && cfg.pomodoroHistory[dayKey]) || [];
      const barEl = root.createDiv({ cls: "naut-pomo" + (pomo.active ? " is-active" : "") });
      if (pomo.active) {
        const a = pomo.active;
        const range = pomoTimeRange(a, cfg);
        const top = barEl.createDiv({ cls: "naut-pomo-row" });
        top.createSpan({ cls: "naut-pomo-ico", text: "🍅" });
        const cd = top.createSpan({ cls: "naut-pomo-cd", text: pomoFormatLeft(a.end - Date.now()) });
        if (range) top.createSpan({ cls: "naut-pomo-end", text: `→ ${clock(range[1])}` });
        if (a.task?.label) {
          const lbl = top.createSpan({ cls: "naut-pomo-task", text: a.task.label, attr: { title: a.task.label } });
          lbl.onclick = () => this.plugin.openPomodoroTask(a.task);
        }
        const stopBtn = top.createEl("button", { cls: "naut-pomo-btn", text: T("结束", "Stop"), attr: { title: a.task ? T("结束本次番茄钟（满 1 分钟会写入实际用时）", "Stop Pomodoro (logs actual time if >= 1m)") : T("取消本次预订（不计入已完成）", "Cancel this reservation (won't be logged as completed)") } });
        stopBtn.onclick = () => this.plugin.stopPomodoro(false, { ask: true });
        const prog = barEl.createDiv({ cls: "naut-pomo-prog" });
        const fillEl = prog.createDiv({ cls: "naut-pomo-fill" });
        const paint = () => {
          const left = a.end - Date.now();
          cd.setText(pomoFormatLeft(left));
          const pct = Math.min(100, Math.max(0, ((Date.now() - a.start) / Math.max(1, a.end - a.start)) * 100));
          fillEl.style.width = `${pct.toFixed(1)}%`;
          if (left <= 0) this.plugin.tickPomodoro();
        };
        paint();
        this._pomoTimer = window.setInterval(paint, 1000);
      } else {
        const top = barEl.createDiv({ cls: "naut-pomo-row" });
        top.createSpan({ cls: "naut-pomo-ico", text: "🍅" });
        const segs = top.createDiv({ cls: "naut-pomo-presets" });
        for (const [id, label] of [["15", "15m"], ["25", "25m"], ["custom", T("自定义", "Custom")]]) {
          const b = segs.createEl("button", { cls: "naut-pomo-pill" + (pomo.preset === id ? " is-on" : ""), text: label });
          b.onclick = () => this.plugin.setPomodoroPreset(id);
        }
        if (pomo.preset === "custom") {
          const inp = top.createEl("input", { cls: "naut-pomo-custom", attr: { type: "number", min: "1", max: "240", value: String(pomo.customMinutes || 45), "aria-label": T("自定义分钟数", "Custom minutes") } });
          const commit = () => this.plugin.setPomodoroCustom(inp.value);
          inp.onchange = commit;
          inp.onkeydown = (e) => { if (e.key === "Enter") { commit(); this.plugin.startPomodoro(); } };
        }
        const go = top.createEl("button", { cls: "naut-pomo-btn is-start", attr: { title: T(`开始番茄钟：预订接下来 ${dur(pomoMinutes(pomo))}`, `Start Pomodoro: reserve the next ${dur(pomoMinutes(pomo))}`), "aria-label": T("开始番茄钟", "Start Pomodoro") } });
        if (OB.setIcon) OB.setIcon(go, "play"); else go.setText("▶");
        go.onclick = () => this.plugin.startPomodoro();
        if (hist.length) {
          const sum = hist.reduce((k, x) => k + (x.minutes || 0), 0);
          top.createSpan({ cls: "naut-pomo-count", text: `×${hist.length}`, attr: { title: T(`今天已完成 ${hist.length} 个番茄钟，共 ${dur(sum)}`, `${hist.length} completed today (${dur(sum)} total)`) } });
        }
      }
    }

    // 鼠标划到螺旋的哪一段，这一行立刻显示那一段的时间和做的事（不等系统的悬停提示），位置固定在螺旋上方
    const hover = root.createDiv({ cls: "naut-hover" });
    let svg = null;
    const clearHover = (force = false) => {
      if (!force && (hover.hasClass("is-expanded") || hover.hasClass("is-pinned"))) return;
      clearTimeout(this._hoverClose);
      hover.empty();
      hover.removeClass("is-agent", "is-expanded", "is-pinned");
      if (svg) svg.querySelectorAll(".naut-ai.is-pinned").forEach((el) => el.classList.remove("is-pinned"));
      if (force) { this._agentHoverExpanded = null; this._agentHoverPinned = null; }
    };
    const leaveHover = () => {
      if (hover.hasClass("is-expanded") || hover.hasClass("is-pinned")) return;
      clearTimeout(this._hoverClose);
      this._hoverClose = setTimeout(clearHover, 180);
    };
    hover.addEventListener("mouseenter", () => clearTimeout(this._hoverClose));
    hover.addEventListener("mouseleave", leaveHover);
    hover.addEventListener("focusin", () => clearTimeout(this._hoverClose));
    hover.addEventListener("focusout", (e) => { if (!hover.contains(e.relatedTarget)) leaveHover(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape" && (hover.hasClass("is-pinned") || hover.hasClass("is-expanded"))) clearHover(true); });
    root.addEventListener("click", (e) => {
      if ((hover.hasClass("is-pinned") || hover.hasClass("is-expanded")) && !hover.contains(e.target) && !e.target.closest?.(".naut-hit")) clearHover(true);
    });
    const hov = (el, time, text, sub) => {
      el.addEventListener("mouseenter", () => {
        if (hover.hasClass("is-expanded") || hover.hasClass("is-pinned")) return;
        clearHover();
        hover.createSpan({ cls: "naut-hover-time", text: time });
        hover.createSpan({ cls: "naut-hover-text", text });
        if (sub) hover.createSpan({ cls: "naut-hover-sub", text: sub });
      });
      el.addEventListener("mouseleave", () => clearHover());
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
    svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "naut-svg" });
    root.appendChild(svg);
    // 入场时各段按自己的时刻先后出来：从早上往夜里，跟着轨道一路画过去
    const late = (el, t) => { if (enter && el) el.style.setProperty("--naut-d", `${Math.round(20 + 260 * (Math.min(Math.max(t, S), E) - S) / (E - S))}ms`); return el; };
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
    let defsEl = null;
    const ensureDefs = () => defsEl || (defsEl = svgEl("defs", {}, svg));
    let hatchId = null;
    if (cfg.showUnrecorded !== false) {
      hatchId = `naut-hatch-${++hatchSeq}`;
      const pat = svgEl("pattern", { id: hatchId, width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, ensureDefs());
      svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 7, class: "naut-hatch-stripe" }, pat);
    }
    const gapsG = svgEl("g", { class: "naut-gaps-g" }, svg);
    // 没有记录的过去（斜纹）与排完以后还空着的时段
    const paintGapsAndSlots = (curPlan, simNow, curGaps = null) => {
      gapsG.replaceChildren();
      const gList = curGaps ?? (cfg.showUnrecorded !== false ? pastGaps(S1, E1, dayRel === 0 ? Math.min(Math.max(simNow, S1), E1) : dayRel < 0 ? E1 : S1, [
        ...items.filter((i) => i.kind === "event").map((e) => [e.start, e.end]),
        ...items.filter((i) => i.kind === "task" && i.state === "done").flatMap((t) => (playing ? (t._fullSegments || t.segments || []).map(([a, b]) => [a, Math.min(b, simNow)]).filter(([a, b]) => b > a) : t.segments || [])),
        ...curPlan.queue.flatMap((t) => t.segments.slice(0, t.workedN)),
        ...curPlan.suspended.flatMap((t) => t.worked || []),
        ...orphans.flatMap((o) => o.segs),
        ...(ai ? ai.segs : []),
        ...games.map(([a, b]) => [a, b]),
      ]) : []);
      if (hatchId) for (const [a, b] of gList) {
        const d = arc(a, b);
        if (!d) continue;
        const el = svgEl("path", { d, class: "naut-gap", stroke: `url(#${hatchId})` }, gapsG);
        if (!playing) hov(el, `${clock(a)}–${clock(b)} · ${dur(b - a)}`, T("没有记录", "Not recorded"));
      }
      if (dayRel >= 0) for (const [a, b] of curPlan.free) {
        const d = b - a >= 1 ? arc(a, b) : null;
        if (!d) continue;
        const cur = dayRel === 0 && a <= simNow && simNow < b;
        const el = svgEl("path", { d, class: "naut-slot" + (cur ? " is-now" : "") }, gapsG);
        if (!playing) hov(el, `${clock(a)}–${clock(b)} · ${dur(b - a)}`, cur ? T("当前可用", "Free now") : T("可用空档", "Free slot"));
      }
    };
    paintGapsAndSlots(plan, now, gaps);
    for (let h = Math.ceil(S / 60); h <= E / 60; h++) {
      const [x, y] = pt(h * 60, 13);
      const tx = late(svgEl("text", { x, y, class: "naut-hour" }, svg), h * 60);
      tx.textContent = String(h % 24);
    }
    const aiName = (x) => x.title || (x.text || "").split(" / ")[0].slice(0, 40) || x.dir;
    let agGradId = null;
    if (agents.some(([k]) => k === "antigravity")) {
      agGradId = `naut-ag-${++hatchSeq}`;
      const g = svgEl("linearGradient", { id: agGradId, gradientUnits: "userSpaceOnUse", x1: 55, y1: 255, x2: 265, y2: 65 }, ensureDefs());
      for (const [offset, color] of [["0%", "#558ce6"], ["54%", "#4bb5a2"], ["76%", "#6cc48c"], ["100%", "#e3ba64"]]) {
        svgEl("stop", { offset, "stop-color": color }, g);
      }
    }
    const timedPaths = [], timedDots = [];
    // 内圈细线：各个 Agent 在干活的时段，一个 Agent 一圈、各用各的颜色
    agents.forEach(([k, g], lane) => {
      for (const [a, b] of g.segs) {
        const d = arc(a, Math.max(b, a + 3), -10 - 4.5 * lane);
        if (!d) continue;
        const vis = late(svgEl("path", { d, class: `naut-ai naut-by-${k}`, pathLength: 1 }, svg), a);
        if (k === "antigravity" && agGradId) vis.style.stroke = `url(#${agGradId})`;
        timedPaths.push([vis, a, Math.max(b, a + 3)]);
        const sessions = aiSegmentSessions(ai.list, k, a, b);
        const hit = fat(d, vis);
        hit.dataset.agent = k;
        hit.setAttribute("tabindex", "0");
        hit.setAttribute("role", "button");
        hit.setAttribute("aria-label", `${AI_AGENTS[k]} ${clock(a)}–${clock(b)} · ${sessions.length} ${T("个会话，查看详情", "sessions, view details")}`);
        const show = (expanded = false, explicit = false) => {
          if ((hover.hasClass("is-expanded") || hover.hasClass("is-pinned")) && !explicit) return;
          const samePinned = this._agentHoverPinned?.agent === k && this._agentHoverPinned?.start === a && this._agentHoverPinned?.day === dayKey;
          const wasExpanded = hover.hasClass("is-expanded");
          if (explicit && !expanded && samePinned && !wasExpanded && hover.hasClass("is-pinned")) { clearHover(true); return; }
          clearHover(true); hover.addClass("is-agent"); hover.style.setProperty("--naut-hover-agent", `var(--naut-ai-${k})`);
          if (explicit) { hover.addClass("is-pinned"); vis.classList.add("is-pinned"); this._agentHoverPinned = { agent: k, start: a, day: dayKey }; }
          hover.createSpan({ cls: "naut-hover-time", text: `${clock(a)}–${clock(b)} · ${dur(b - a)}` });
          hover.createSpan({ cls: "naut-hover-text", text: AI_AGENTS[k] });
          hover.createSpan({ cls: "naut-hover-sub", text: sessions[0]?.title || T(`${sessions.length} 个会话`, `${sessions.length} sessions`), attr: { title: sessions.map(aiName).join("\n") } });
          const toggle = hover.createEl("button", { cls: "naut-ai-hover-toggle", text: expanded ? T("收起详情", "Hide details") : T("详情", "Details"), attr: { "aria-expanded": String(expanded) } });
          toggle.onclick = (e) => { e.stopPropagation(); show(!expanded, true); };
          if (explicit) {
            const unpin = hover.createEl("button", { cls: "naut-ai-hover-toggle", text: "×", attr: { title: T("取消固定", "Unpin"), "aria-label": T("取消固定", "Unpin") } });
            unpin.onclick = (e) => { e.stopPropagation(); clearHover(true); };
          }
          if (!expanded) return;
          hover.addClass("is-expanded");
          this._agentHoverExpanded = { agent: k, start: a, day: dayKey };
          const card = hover.createDiv({ cls: "naut-ai-hover-card" });
          const current = dayRel === 0 && !playing;
          card.createDiv({ cls: "naut-ai-hover-caption", text: current ? T("实时会话状态 · token 为本日会话合计", "Live session state · tokens are daily session totals") : T("历史时段 · 不显示今天的实时状态", "Historical period · current live state is not shown") });
          const deck = agentDeck;
          const lines = journalLines;
          const cleanLabel = (v) => String(v || "").replace(/\s*\^[a-z0-9-]+\s*$/i, "").replace(/^🤖\s*/, "").trim();
          for (const x of sessions.slice(0, 3)) {
            const meta = deck?.usage?.meta?.get(x.sid) || this.plugin._ai?.live?.get(x.sid) || {};
            const info = aiHoverSession(x, meta, current);
            const rec = deckBindings.get(x.sid);
            let item = rec?.blockId && (!rec.path || rec.path === file.path) ? items.find((it) => lines[it.line]?.trimEnd().endsWith(`^${rec.blockId}`)) : null;
            if (!item) {
              const at = lines.findIndex((line) => parseLink(line)?.sid === x.sid);
              if (at >= 0) item = items.find((it) => it.line === markOwner(lines, at));
            }
            const box = card.createDiv({ cls: "naut-ai-hover-session" });
            box.createDiv({ cls: "naut-ai-hover-title", text: cleanLabel(item?.label || info.title) || T("未命名会话", "Untitled session") });
            const state = ({ run: T("在跑", "Running"), wait: T("等你回复", "Waiting for reply"), quiet: T("暂时安静", "Quiet"), "needs-approval": T("等待允许", "Needs approval"), error: T("出错", "Error"), limit: T("达到限额", "Limit reached"), queued: T("排队中", "Queued") })[info.state];
            const progress = [state, info.progress, info.step].filter(Boolean).join(" · ");
            if (progress) box.createDiv({ cls: "naut-ai-hover-progress", text: progress });
            box.createDiv({ cls: "naut-ai-hover-stats", text: [T(`本段 ${dur(x.overlap)}`, `${dur(x.overlap)} in this segment`), T(`本日 ${dur(x.min || 0)}`, `${dur(x.min || 0)} today`), tokUsed(x) ? T(`本日 ${fmtTok(tokUsed(x))} tok`, `${fmtTok(tokUsed(x))} tokens today`) : T("未记录 token", "Token usage unavailable")].join(" · "), attr: { title: T(`本日会话：产出 ${fmtTok(x.out || 0)}，读入 ${fmtTok(x.fresh || 0)}，缓存命中 ${fmtTok(x.cached || 0)}`, `Daily session: output ${fmtTok(x.out || 0)}, fresh input ${fmtTok(x.fresh || 0)}, cache reads ${fmtTok(x.cached || 0)}`) } });
            const project = info.cwd ? info.cwd.replace(/\/$/, "").split("/").pop() : x.dir;
            const context = [info.model, project].filter(Boolean).join(" · ");
            if (context) box.createDiv({ cls: "naut-ai-hover-context", text: context, attr: { title: info.cwd } });
            if (info.reply) box.createDiv({ cls: "naut-ai-hover-reply", text: T(`最近回复：${info.reply}`, `Latest reply: ${info.reply}`) });
            const actions = box.createDiv({ cls: "naut-ai-hover-actions" });
            if (item) actions.createEl("button", { text: T("定位日记", "Show in journal") }).onclick = () => { clearHover(true); this.plugin.openItem(file, item); };
            if (typeof deck?.openSessionBySid === "function" || k === "claude") actions.createEl("button", { text: T("打开会话", "Open session") }).onclick = () => this.plugin.openAgentSession(x.sid, k);
          }
          if (!sessions.length) card.createDiv({ cls: "naut-muted", text: T("这段记录没有会话明细", "No session details were recorded for this segment") });
          if (sessions.length > 3) card.createEl("button", { cls: "naut-ai-hover-more", text: T(`查看全部 ${sessions.length} 个会话`, `View all ${sessions.length} sessions`) }).onclick = () => new AiSessionsModal(this.plugin, `${AI_AGENTS[k]} ${clock(a)}–${clock(b)}`, [{ list: sessions.map((x) => ({ ...x, related: true })) }]).open();
        };
        hit.addEventListener("mouseenter", () => show());
        hit.addEventListener("focus", () => show());
        hit.addEventListener("mouseleave", leaveHover);
        hit.addEventListener("blur", leaveHover);
        hit.addEventListener("click", () => show(false, true));
        hit.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); show(true, true); });
        hit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(true, true); } });
        if (this._agentHoverExpanded?.agent === k && this._agentHoverExpanded.start === a && this._agentHoverExpanded.day === dayKey) show(true, true);
        else if (this._agentHoverPinned?.agent === k && this._agentHoverPinned.start === a && this._agentHoverPinned.day === dayKey) show(false, true);
      }
    });
    // 再往里一圈：游戏时间
    for (const [a, b, n] of games) {
      const d = arc(a, Math.max(b, a + 3), -10 - 4.5 * Math.max(1, agents.length) - 1.5);
      if (!d) continue;
      const vis = late(svgEl("path", { d, class: "naut-game", pathLength: 1 }, svg), a);
      timedPaths.push([vis, a, Math.max(b, a + 3)]);
      hov(fat(d, vis), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, `🎮 ${n}`);
    }
    // 再往里一圈：复习卡片（第二大脑每日回顾记进日记的那几段），和主轨道上的复习段同一个青色
    const revN = (t) => +(REVIEW_RE.exec(t.label) || [0, 0])[1];
    const revs = items.filter(isReview);
    for (const t of revs) for (const [a, b] of t.segments || []) {
      const d = arc(a, Math.max(b, a + 3), -10 - 4.5 * Math.max(1, agents.length) - 6);
      if (!d) continue;
      const vis = late(svgEl("path", { d, class: "naut-rev", pathLength: 1 }, svg), a);
      timedPaths.push([vis, a, Math.max(b, a + 3)]);
      hov(fat(d, vis), `${clock(a)}–${clock(b)} · ${dur(b - a)}`, T(`🃏 复习卡片 ${revN(t)} 张`, `🃏 Review ${revN(t)} cards`));
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
    const deck = dayRel === 0 && !playing ? agentDeck : null;
    const deckByBlock = new Map(), deckByKey = new Map();
    const stateOf = (sid) => {
      const meta = sid && deck?.usage?.meta?.get(sid);
      if (!meta) return null;
      return (deck.applyExternalState?.(meta) || meta).state || null;
    };
    if (deck) {
      for (const [sid, rec] of deckBindings) {
        const st = stateOf(sid);
        if (!st) continue;
        if (rec.blockId && !deckByBlock.has(rec.blockId)) deckByBlock.set(rec.blockId, st);
        if (rec.key) deckByKey.set(rec.key, st);
      }
    }
    const deckStateOf = (item) => {
      if (!deck || !item || item.line == null) return null;
      const raw = journalLines[item.line] || "";
      const bm = /\^([a-z0-9-]+)\s*$/i.exec(raw.trimEnd());
      if (bm && deckByBlock.has(bm[1])) return deckByBlock.get(bm[1]);
      const lnk = linkUnder(journalLines, item.line);
      if (lnk?.sid) {
        const st = stateOf(lnk.sid);
        if (st) return st;
      }
      return item.label ? deckByKey.get(workKey(item.label)) || null : null;
    };
    const LANE = [0, 5, -5, 9, -9, 13];   // 并行的几件 DOING 各画一条线，沿螺旋错开一点
    const perMin = (t) => 2 * Math.PI * rad(t) / 720;   // 这一圈上一分钟有几个像素
    const segsG = svgEl("g", { class: "naut-segs-g" }, svg);
    const drawSeg = (a, b, cls, item) => {
      // 够长的段两头各让出 0.8 像素，挨着的两段之间留一条缝；太短的不让，免得缩没了
      const k = perMin((a + b) / 2), gap = (b - a) * k > 6 ? 0.8 / k : 0;
      const d = arc(a + gap, b - gap, LANE[item.lane || 0] ?? 0);
      if (!d) return;
      const p = late(svgEl("path", { d, class: `naut-seg ${cls}${statusCls(item, "naut-kw-", deckStateOf(item))}`, pathLength: 1 }, segsG), a);
      if (item.cal && item.cal.color) p.style.stroke = item.cal.color;   // 日历事件用日历自己的颜色
      if (playing) return;
      link(item, p);
      const rel = aiOf(item).filter((x) => x.related);
      // 做这段时是哪个会话在干活；会话明细已经没了的（过了十几天），按日记里 ⏱ 那一行写的是谁记的
      hov(p, `${clock(a)}–${clock(b)} · ${dur(b - a)}`, workKey(item.label), [item.cal ? `📅 ${item.cal.calendar}` : "", rel.length ? `🤖 ${rel.map(aiName).slice(0, 2).join(T("、", ", "))}` : item.clock && item.clock.who ? `🤖 ${item.clock.who}` : ""].filter(Boolean).join(" · "));
      p.addEventListener("click", () => this.plugin.openItem(file, item));
    };
    const paintSegs = (curPlan, simNow) => {
      segsG.replaceChildren();
      for (const e of items.filter((i) => i.kind === "event")) drawSeg(e.start, e.end, e.state === "done" ? "naut-event naut-done-event" : e.prio ? "naut-prio" : "naut-event", e);
      for (const t of items.filter((i) => i.kind === "task" && i.state === "done")) {
        const segs = playing ? (t._fullSegments || t.segments || []) : (t.segments || []);
        for (const [a, b] of segs) {
          const b1 = playing ? Math.min(b, simNow) : b;
          if (b1 > a) drawSeg(a, b1, isReview(t) ? "naut-done naut-review" : t.mainA ? "naut-done naut-main-done" : "naut-done", t);
        }
      }
      // 没做完的：做过的几段画淡一点，后面排的画实的
      for (const t of curPlan.queue) t.segments.forEach(([a, b], i) => drawSeg(a, b, (t.main ? "naut-main" : t.prio ? "naut-prio" : "naut-task") + (i < t.workedN ? " naut-worked" : t.doing && dayRel === 0 ? " naut-live" : ""), t));
      for (const t of curPlan.suspended) for (const [a, b] of t.worked || []) drawSeg(a, b, "naut-task naut-worked", t);
      for (const o of orphans) for (const [a, b] of o.segs) drawSeg(a, b, "naut-task naut-worked", o);
    };
    paintSegs(plan, now);
    for (const l of items.filter((i) => i.kind === "log")) {
      if (l.start < S || l.start > E) continue;
      const [x, y] = pt(l.start);
      const cir = late(svgEl("circle", { cx: x, cy: y, r: 2.6, class: "naut-log" }, svg), l.start);
      timedDots.push([cir, l.start]);
      hov(cir, clock(l.start), l.label);
    }
    // 🍅 番茄钟外沿轨道（offset = +9.5）：已完成留淡色细弧，进行中拆为「已兑现实线 + 未实现预订虚线 + 终点圆点」
    const POMO_OFF = 9.5;
    const pomoHist = (cfg.pomodoroHistory && cfg.pomodoroHistory[dayKey]) || [];
    for (const h of pomoHist) {
      const r = pomoTimeRange(h, cfg);
      if (!r) continue;
      const a = Math.max(S, r[0]), b = Math.min(E, r[1]);
      if (b - a < 0.5) continue;
      const d = arc(a, b, POMO_OFF);
      if (!d) continue;
      const vis = late(svgEl("path", { d, class: "naut-pomo-hist", pathLength: 1 }, svg), a);
      timedPaths.push([vis, a, b]);
      hov(fat(d, vis), `${clock(r[0])}–${clock(r[1])} · ${dur(h.minutes || Math.round(r[1] - r[0]))}`, h.label ? `🍅 ${h.label}` : T("🍅 已完成番茄钟", "🍅 Completed pomodoro"));
    }
    const activePomo = dayRel === 0 && !playing && cfg.pomodoro?.active && cfg.pomodoro.active.dayKey === dayKey ? cfg.pomodoro.active : null;
    if (activePomo) {
      const r = pomoTimeRange(activePomo, cfg);
      if (r) {
        const a0 = Math.max(S, r[0]), b0 = Math.min(E, r[1]);
        const sp = pomoSplit(a0, b0, now);
        const evOverlap = items.filter((i) => i.kind === "event" && i.start < r[1] && i.end > Math.max(now, r[0])).map((i) => i.label);
        const leftMin = Math.max(0, Math.ceil((activePomo.end - Date.now()) / 60e3));
        const sub = [
          T(`还剩 ${dur(leftMin)}（预订中，未实现）`, `${dur(leftMin)} left (reserved)`),
          evOverlap.length ? T(`与「${evOverlap[0]}」重叠`, `overlaps "${evOverlap[0]}"`) : "",
        ].filter(Boolean).join(" · ");
        const title = activePomo.task?.label ? `🍅 ${activePomo.task.label}` : T("🍅 番茄钟预订", "🍅 Pomodoro reservation");
        if (sp.elapsed && sp.elapsed[1] - sp.elapsed[0] >= 0.3) {
          const d = arc(sp.elapsed[0], sp.elapsed[1], POMO_OFF);
          if (d) {
            const vis = svgEl("path", { d, class: "naut-pomo-elapsed" }, svg);
            hov(fat(d, vis), `${clock(r[0])}–${clock(r[1])} · ${dur(activePomo.minutes)}`, title, sub);
          }
        }
        if (sp.reserved && sp.reserved[1] - sp.reserved[0] >= 0.3) {
          const d = arc(sp.reserved[0], sp.reserved[1], POMO_OFF);
          if (d) {
            const vis = svgEl("path", { d, class: "naut-pomo-plan" }, svg);
            hov(fat(d, vis), `${clock(r[0])}–${clock(r[1])} · ${dur(activePomo.minutes)}`, title, sub);
          }
        }
        if (b0 >= S && b0 <= E) {
          const [ex, ey] = pt(b0, POMO_OFF);
          const dot = svgEl("circle", { cx: ex, cy: ey, r: 2.8, class: "naut-pomo-end-dot" }, svg);
          hov(dot, `${clock(r[0])}–${clock(r[1])} · ${dur(activePomo.minutes)}`, title, sub);
        }
      }
    }
    let nowG = null, trailPath = null, nowLine = null, nowHalo = null, nowDot = null;
    const paintNow = (simNow) => {
      if (!(dayRel === 0 && simNow >= S && simNow <= E)) return;
      if (!nowG) {
        nowG = svgEl("g", { class: "naut-now-g" }, svg);
        if (playing) trailPath = svgEl("path", { d: "", class: "naut-play-trail" }, nowG);
        nowLine = svgEl("line", { class: "naut-now" }, nowG);
        nowHalo = svgEl("circle", { r: 3.5, class: "naut-now-halo" }, nowG);
        nowDot = svgEl("circle", { r: 3.5, class: "naut-now-dot" }, nowG);
      }
      const nr = rad(simNow), ca = Math.cos(ang(simNow)), sa = Math.sin(ang(simNow));
      nowLine.setAttribute("x1", (c + 27 * ca).toFixed(2));
      nowLine.setAttribute("y1", (c + 27 * sa).toFixed(2));
      nowLine.setAttribute("x2", (c + (nr + 9) * ca).toFixed(2));
      nowLine.setAttribute("y2", (c + (nr + 9) * sa).toFixed(2));
      const [px, py] = pt(simNow);
      nowHalo.setAttribute("cx", px.toFixed(2));
      nowHalo.setAttribute("cy", py.toFixed(2));
      nowDot.setAttribute("cx", px.toFixed(2));
      nowDot.setAttribute("cy", py.toFixed(2));
      if (trailPath) {
        const td = simNow > S1 + 0.5 ? arc(Math.max(S1, simNow - 48), simNow) : null;
        trailPath.setAttribute("d", td || "");
      }
    };
    const paintTimed = (simNow) => {
      if (!playing) return;
      for (const [el, a, b] of timedPaths) {
        const prog = simNow <= a ? 0 : simNow >= b ? 1 : (simNow - a) / Math.max(0.5, b - a);
        el.style.opacity = prog <= 0 ? "0" : "";
        el.style.strokeDasharray = prog < 1 ? "1" : "";
        el.style.strokeDashoffset = prog < 1 ? (1 - prog).toFixed(4) : "";
      }
      for (const [el, at] of timedDots) el.style.opacity = simNow < at ? "0" : "";
    };
    paintTimed(now);
    paintNow(now);
    // 起止把手：沿着螺旋拖 = 改这天实际的开始 / 结束时间（5 分钟一格），双击恢复默认
    const handle = (kind, t0) => {
      const [x, y] = pt(t0);
      const h = svgEl("circle", { cx: x, cy: y, r: 4.5, class: `naut-handle naut-handle-${kind}` }, svg);
      const name = kind === "start" ? T("开始", "start") : T("结束", "end");
      svgEl("title", {}, h).textContent = T(`这天实际${name} ${clock(t0)}${bounds[kind] == null ? "（默认）" : ""}\n拖动调整，双击恢复默认`, `Actual ${name} of this day ${clock(t0)}${bounds[kind] == null ? " (default)" : ""}\nDrag to adjust, double-click to restore the default`);
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
    if (revTotal) hov(svgEl("text", { x: c, y: c + 19, class: "naut-center-rev" }, svg), T(`${revs.length} 轮`, `${revs.length} rounds`), T(`🃏 这天复习了 ${revTotal} 张卡片`, `🃏 ${revTotal} cards reviewed this day`)).textContent = `🃏 ${revTotal}`;

    // 列表
    const list = root.createDiv({ cls: "naut-list" });
    let insertBeforeNode = null;
    const placeInList = (el) => { if (insertBeforeNode) list.insertBefore(el, insertBeforeNode); return el; };
    const section = (title, rows) => {
      if (!rows.length) return;
      placeInList(list.createDiv({ cls: "naut-sec", text: title }));
      for (const r of rows) {
        const kwCls = statusCls(r.item, "is-kw-", deckStateOf(r.item));
        const row = placeInList(list.createDiv({ cls: `naut-row ${r.cls}${kwCls}${r.upNext ? " is-upnext" : ""}` }));
        if (!playing) link(r.item, row);
        if (r.item.cal && r.item.cal.color) row.style.borderLeftColor = r.item.cal.color;
        if (r.upNext) {
          const curKw = canonKw(r.item.kw);
          const parentPrefix = r.item.inheritedFrom != null
            ? T(`随母块「${r.item.inheritedLabel}」状态\n`, `Controlled by parent "${r.item.inheritedLabel}"\n`)
            : "";
          const dotTip = parentPrefix + (curKw === "DONE"
            ? T("点击切换：SUSPENDED（再点恢复原状态）\n右键任务行：选择更多状态", "Click: SUSPENDED (click again to restore)\nRight-click row: more states")
            : curKw === "SUSPENDED"
              ? T("点击恢复原状态\n右键任务行：选择更多状态", "Click: restore original state\nRight-click row: more states")
              : T("点击切换：DONE → SUSPENDED → 原状态\n右键任务行：选择更多状态", "Click: DONE → SUSPENDED → original\nRight-click row: more states"));
          const dot = row.createSpan({
            cls: "naut-st-dot",
            text: curKw === "DONE" ? "✓" : curKw === "SUSPENDED" ? "⏸" : "●",
          });
          dot.addEventListener("mouseenter", () => this._showDotTip(dot, dotTip));
          dot.addEventListener("mouseleave", () => this._hideDotTip());
          dot.onclick = (e) => { e.stopPropagation(); this._hideDotTip(); this.cycleUpNext(file, dayKey, r.item, r.upNextIdx); };
        }
        row.createSpan({ cls: "naut-time", text: r.time });
        row.createSpan({ cls: "naut-label", text: (r.item.paused ? "⏸ " : "") + (r.item.mainA && !r.inMain ? "🎯 " : "") + (r.item.cal ? "📅 " : "") + r.item.label,
          attr: r.item.cal ? { title: T(`日历：${r.item.cal.calendar}${r.item.cal.location ? " · " + r.item.cal.location : ""}`, `Calendar: ${r.item.cal.calendar}${r.item.cal.location ? " · " + r.item.cal.location : ""}`) } : {} });
        const sess = aiOf(r.item);
        if (sess.length) {
          const rel = sess.filter((x) => x.related).length;
          const badge = row.createSpan({ cls: "naut-ai-badge" + (rel ? "" : " is-weak"), text: `🤖${rel || sess.length}`,
            attr: { title: T(`这件做的时候 Agent 在：\n${sess.map((x) => `${x.related ? "· " : "  （同时段）"}${aiName(x)}（${dur(x.overlap)}）`).join("\n")}\n点开看详情、接着那个会话做`, `Agents during this task:\n${sess.map((x) => `${x.related ? "· " : "  (same time) "}${aiName(x)} (${dur(x.overlap)})`).join("\n")}\nClick for details or to continue that session`) } });
          badge.onclick = (e) => { e.stopPropagation(); new AiSessionsModal(this.plugin, T(`「${r.item.label}」期间的 Agent 会话`, `Agent sessions during "${r.item.label}"`), [{ list: sess }]).open(); };
        }
        row.createSpan({ cls: "naut-dur", text: r.dur, attr: r.tip ? { title: r.tip } : {} });
        row.onclick = () => this.plugin.openItem(file, r.item);
        if (r.upNext || r.canMenu) {
          const prioLine = r.item.inheritedFrom != null ? r.item.inheritedFrom : r.item.line;
          row.oncontextmenu = (e) => this.openUpNextMenu(e, file, dayKey, r.item, taskPriority(journalLines[prioLine]));
        }
      }
    };
    // 进度：写了 40% / 1/3 按写的；没写但做过，按 已做 / 预估 估一个；自动记的行没有预估时长，只显示已经做了多久
    const autoKeys = this.plugin.autoKeys(dayKey);
    const durText = (t) => formatTaskDur(t, autoKeys);
    const tipOf = (t) => formatTaskTip(t, autoKeys);
    const paintTaskSections = (curPlan) => {
      // 🎯 主线：这一天最要紧的几件（主线块里 A 级的任务）放在列表最上面，一件一行：做完的打勾写几点做完，在做的写「进行中」，
      // 没开始的写排到了几点（排程里主线排在 DOING 后面、别的待办前面），排不下的直说
      if (M.blocks.length) {
        const rows = [];
        for (const t of M.tasks) {
          const it = items.find((i) => i.line === t.line);
          if (!it) {   // 排程不管的主线：交给 AI 的（TODO4AI [#A]）、没做成的（FAILED [#A]），照样列出来
            rows.push({ item: { line: t.line, label: t.label, kind: "task", state: t.state, segs: [] }, inMain: true, cls: "is-main" + (t.state === "failed" ? " is-over" : t.state === "done" ? " is-done" : ""),
              time: t.state === "failed" ? T("没做成", "Failed") : t.state === "done" ? "✓" : t.state === "doing" ? T("进行中", "Doing") : T("交给 AI", "Handed to AI"), dur: "" });
            continue;
          }
          const q = it.kind === "task" && it.state === "open" ? it : null, live = q && it.doing && dayRel === 0;
          const time = t.state === "done" ? "✓" + (it.doneAt != null ? " " + clock(it.doneAt) : "") : it.kind === "event" ? clock(it.start)
            : live ? T("进行中", "Doing") : q && q.suspended ? "💤" : q && q.container ? T("分步", "In steps") : q && q.segments && q.segments.length > q.workedN ? clock(q.segments[q.workedN][0]) : dayRel < 0 ? T("没做完", "Unfinished") : T("排不下", "Won't fit");
          rows.push({ item: it, inMain: true, canMenu: !playing && it.kind === "task" && it.state === "open" && !it.container && it.line != null, cls: "is-main" + (t.state === "done" ? " is-done" : "") + (live ? " is-doing" : "") + (time === T("排不下", "Won't fit") || time === T("没做完", "Unfinished") ? " is-over" : ""),
            time, dur: t.state === "done" ? dur(it.dur) : q ? durText(q) : dur(it.end - it.start), tip: q ? tipOf(q) : "" });
        }
        section(T(`🎯 主线 ${M.done}/${M.total} · ${Math.round(M.done / M.total * 100)}%`, `🎯 Mainline ${M.done}/${M.total} · ${Math.round(M.done / M.total * 100)}%`), rows);
      }
      const events = items.filter((i) => i.kind === "event").sort((a, b) => a.start - b.start);
      section(T("固定事件", "Fixed events"), events.map((e) => ({ item: e, cls: e.state === "done" ? "is-done" : "is-event", time: `${clock(e.start)}–${clock(e.end)}`, dur: dur(e.end - e.start) })));
      // 按排到的时间先后列（小任务补位到前面的空档，会排在列表里靠后的大任务前面）
      const placed = curPlan.queue.filter((t) => t.segments.length > t.workedN).sort((a, b) => a.segments[a.workedN][0] - b.segments[b.workedN][0]);
      const upNextRows = placed.map((t) => ({
        item: t, cls: (t.mainA ? "is-main" : t.prio ? "is-prio" : "is-task") + (t.doing && dayRel === 0 ? " is-doing" : ""),
        time: t.doing && dayRel === 0 ? T("进行中", "Doing") : clock(t.segments[t.workedN][0]) + (t.overflow ? T(" 起", " on") : ""),
        dur: durText(t), tip: tipOf(t), upNext: !playing,
      }));
      // 刚在「接下来」里点成 DONE / SUSPENDED 的项暂时留在原地，方便再点一下继续循环回原状态
      const hold = this._upNextHold?.get(dayKey);
      if (hold && hold.size && !playing) {
        const seen = new Set();
        for (const t of placed) { seen.add(t.line); if (t.inheritedFrom != null) seen.add(t.inheritedFrom); }
        const extras = [];
        for (const [ln, rec] of [...hold.entries()]) {
          if (seen.has(ln)) { hold.delete(ln); continue; }
          const it = items.find((i) => i.line === ln && i.kind === "task");
          const curKw = canonKw(it?.kw);
          if (!it || (rec.key && workKey(it.label) !== rec.key) || (curKw !== "DONE" && curKw !== "SUSPENDED")) { hold.delete(ln); continue; }
          extras.push({
            idx: rec.idx ?? upNextRows.length,
            row: {
              item: it,
              cls: curKw === "DONE" ? "is-done" : "is-susp",
              time: curKw === "DONE" ? (it.doneAt != null ? `✓ ${clock(it.doneAt)}` : "✓") : "💤",
              dur: dur(it.dur),
              upNext: true,
            },
          });
        }
        extras.sort((a, b) => a.idx - b.idx);
        for (const ex of extras) upNextRows.splice(Math.min(ex.idx, upNextRows.length), 0, ex.row);
      }
      upNextRows.forEach((r, idx) => { r.upNextIdx = idx; });
      section(T("接下来", "Up next"), upNextRows);
      const over = curPlan.queue.filter((t) => t.overflow);
      section(dayRel < 0 ? T("没做完", "Unfinished") : T("排不下", "Won't fit"), over.map((t) => ({ item: t, canMenu: !playing && dayRel >= 0, cls: "is-over", time: "—", dur: !isAutoTask(t, autoKeys) && t.segments.length > t.workedN ? T(`缺 ${dur(t.overflow)}`, `${dur(t.overflow)} short`) : durText(t), tip: tipOf(t) })));
      section(T("💤 搁置", "💤 Parked"), curPlan.suspended.map((t) => ({ item: t, canMenu: !playing, cls: "is-susp", time: "💤", dur: durText(t), tip: tipOf(t) })));
      section(T("做过 · 已挪走", "Worked on · moved away"), orphans.filter((o) => o.segs.length).map((o) => ({ item: o, cls: "is-done", time: `${clock(o.segs[0][0])}–${clock(o.segs.at(-1)[1])}`, dur: dur(o.segs.reduce((n, [a, b]) => n + b - a, 0)) })));
      const doneTasks = items.filter((i) => i.kind === "task" && i.state === "done").sort((a, b) => (a.doneAt ?? 1e9) - (b.doneAt ?? 1e9));
      section(T(`已完成 ${doneTasks.length}`, `Done ${doneTasks.length}`), doneTasks.map((t) => ({
        item: t, cls: isReview(t) ? "is-done is-review" : "is-done",
        time: t.actual ? `${clock(t.actual[0])}–${clock(t.actual[1])}` : t.doneAt != null ? clock(t.doneAt) : "—",
        dur: !t.actual && !isReview(t) && t.spentToday > 0 ? dur(t.spentToday) : dur(t.dur),
      })));
    };
    paintTaskSections(plan);
    const tailAnchor = document.createComment("naut-tail");
    list.appendChild(tailAnchor);

    if (ai || aiStore && realRel === 0) this.renderAi(list, aiStore, date, ai);
    if (cfg.showDayReview !== false && realRel <= 0 && !playing) this.renderDayReview(list, items, file, dayKey, realRel === 0);
    if (cfg.showReview !== false && realRel === 0) this.renderReview(list);

    if (playing) {
      let lastMin = Math.floor(now), lastListBucket = Math.floor(now / 10);
      this._playStep = (simNow) => {
        for (const t of items) if (t._fullWorked) {
          t.worked = t._fullWorked.map(([a, b]) => [a, Math.min(b, simNow)]).filter(([a, b]) => b > a);
          t.spentToday = t.worked.reduce((k, [a, b]) => k + b - a, 0);
        }
        for (const o of orphans) if (o._fullSegs) {
          o.segs = o._fullSegs.map(([a, b]) => [a, Math.min(b, simNow)]).filter(([a, b]) => b > a);
        }
        const curPlan = schedule(items, cfg, simNow, dayRel, bounds);
        const tot = Math.max(curPlan.available, curPlan.demand) || 1;
        const f = Math.min(curPlan.demand, curPlan.available);
        barTask.style.width = `${(f / tot) * 100}%`;
        barFree.style.width = `${((curPlan.available - f) / tot) * 100}%`;
        barOver.style.width = curPlan.overflow ? `${(curPlan.overflow / tot) * 100}%` : "0%";
        const curMin = Math.floor(simNow);
        if (curMin !== lastMin) {
          lastMin = curMin;
          const curC = capacity(items, curPlan, cfg, simNow, dayRel, bounds);
          planDemandEl.textContent = T(`已计划 ${dur(curC.demand)} · `, `Planned ${dur(curC.demand)} · `);
          planStatusEl.className = curC.status.key === "remaining" ? "naut-cap-ok" : "naut-over-text";
          planStatusEl.textContent = `${curC.status.label} ${dur(curC.status.value)}`;
          planLeftEl.className = `naut-left is-${curC.tone}`;
          planLeftEl.textContent = T(` · 剩余 ${curC.left}%`, ` · ${curC.left}% free`);
          center.textContent = clock(curMin);
        }
        paintGapsAndSlots(curPlan, simNow);
        paintSegs(curPlan, simNow);
        paintTimed(simNow);
        paintNow(simNow);
        const bucket = Math.floor(simNow / 10);
        if (bucket !== lastListBucket) {
          lastListBucket = bucket;
          while (list.firstChild && list.firstChild !== tailAnchor) list.firstChild.remove();
          insertBeforeNode = tailAnchor;
          paintTaskSections(curPlan);
          insertBeforeNode = null;
        }
      };
    } else {
      this._playStep = null;
    }

    // 入场时列表一行行浮上来（--naut-i = 第几行，最多错开到第 18 行）
    const stagger = () => { if (enter) Array.from(list.children).forEach((el, i) => { if (!el.style.getPropertyValue("--naut-i")) el.style.setProperty("--naut-i", String(Math.min(i, 18))); }); };
    stagger();
  }

  // 「接下来」面板改写单行状态的统一入口：互斥锁 + 边界校验 + 音效去重 + 重绘
  async _mutateUpNext(file, dayKey, item, mutate) {
    let targetLine = item?.inheritedFrom ?? item?.line;
    if (!file || targetLine == null || this._upNextBusy) return;
    this._upNextBusy = true;
    try {
      const targetKey = workKey(item?.inheritedFrom != null ? (item?.inheritedLabel || item?.label) : item?.label);
      let beforeRaw = null, out = null;
      const changed = await this.plugin.editFile(file, (lines) => {
        const curItems = parseJournal(lines.join("\n"), this.plugin.settings);
        let hit = null;
        if (targetKey) {
          const hits = curItems.filter((t) => t.kind === "task" && workKey(t.inheritedFrom != null ? (t.inheritedLabel || t.label) : t.label) === targetKey);
          if (hits.length) {
            hit = hits.find((t) => (t.inheritedFrom != null ? t.inheritedFrom : t.line) === targetLine) || hits.find((t) => t.state === "open") || hits[0];
            targetLine = hit.inheritedFrom != null ? hit.inheritedFrom : hit.line;
          }
        }
        if (targetLine < 0 || targetLine >= lines.length) return 0;
        const cur = lines[targetLine];
        out = mutate(cur, targetLine, hit);
        if (!out || out.nextRaw === cur) return 0;
        beforeRaw = cur;
        lines[targetLine] = out.nextRaw;
        return 1;
      });
      if (!changed || !out) return;
      out.after?.(targetLine);
      if (out.soundKw && canonKw(out.soundKw) !== "DOING") {
        const active = this.plugin.settings.pomodoro?.active;
        if (active && active.dayKey === dayKey && active.task?.key === targetKey) {
          this.plugin._pomoModalTask = { dayKey: active.dayKey, key: targetKey };
          try { await this.plugin.stopPomodoro(false, { ask: false, silent: true }); }
          finally { if (this.plugin._pomoModalTask?.key === targetKey) this.plugin._pomoModalTask = null; }
        }
      }
      const ch = beforeRaw != null ? kwLineChange(beforeRaw, out.nextRaw) : null;
      const shouldSound = ch ? this.plugin.kwFresh(file.path, [ch]).length > 0 : true;
      if (shouldSound && out.soundKw) this.plugin.kwSound(KW_SOUND[out.soundKw] || "TODO");
      await this.render();
    } finally {
      this._upNextBusy = false;
    }
  }

  // 「接下来」面板状态图标点击循环：原状态 → DONE → SUSPENDED → 原状态
  async cycleUpNext(file, dayKey, item, rowIdx = 0) {
    if (!this._upNextHold) this._upNextHold = new Map();
    let hold = this._upNextHold.get(dayKey);
    if (!hold) { hold = new Map(); this._upNextHold.set(dayKey, hold); }
    const key = workKey(item.inheritedFrom != null ? (item.inheritedLabel || item.label) : item.label);
    return this._mutateUpNext(file, dayKey, item, (cur, targetLine, hit) => {
      const rawPrev = hold.get(targetLine);
      const prev = rawPrev && (!rawPrev.lastRaw || rawPrev.lastRaw === cur) ? rawPrev : null;
      const res = cycleUpNextStatus(cur, prev?.origRaw ?? null);
      if (res.nextKw === "DONE" && hit?.clock) {
        const sp = splitTask(cur);
        if (sp) res.nextRaw = `${sp.prefix}DONE ${moment().format("HH:mm")} ${sp.rest}`;
      }
      return {
        nextRaw: res.nextRaw,
        soundKw: res.nextKw,
        after: () => {
          if (res.origRaw != null) hold.set(targetLine, { origRaw: res.origRaw, lastRaw: res.nextRaw, key, idx: rawPrev?.idx ?? rowIdx });
          else hold.delete(targetLine);
        },
      };
    });
  }

  // 「接下来」面板右键切到指定状态
  async setUpNextKeyword(file, dayKey, item, kw) {
    const target = String(kw || "TODO").toUpperCase();
    return this._mutateUpNext(file, dayKey, item, (cur, targetLine, hit) => {
      let nextRaw = toKeyword(cur, target);
      if (target === "DONE" && hit?.clock) {
        const sp = splitTask(cur);
        if (sp) nextRaw = `${sp.prefix}DONE ${moment().format("HH:mm")} ${sp.rest}`;
      }
      return {
        nextRaw,
        soundKw: target,
        after: () => this._upNextHold?.get(dayKey)?.delete(targetLine),
      };
    });
  }

  // 「接下来」面板右键设置重要程度（[#A] / [#B] / [#C] / 清除）
  async setUpNextPriority(file, dayKey, item, prio) {
    return this._mutateUpNext(file, dayKey, item, (cur, targetLine) => ({
      nextRaw: toPriority(cur, prio),
      soundKw: null,
      after: () => {
        this._upNextHold?.get(dayKey)?.delete(targetLine);
        this.plugin.sound("tick");
      },
    }));
  }

  openUpNextMenu(e, file, dayKey, item, curPrio = "") {
    e.preventDefault();
    e.stopPropagation();
    this._hideDotTip();
    const menu = new OB.Menu();
    const curKw = canonKw(item.kw);
    UP_NEXT_MENU_GROUPS.forEach((group, gi) => {
      if (gi > 0) menu.addSeparator();
      for (const [kw, title] of group) {
        menu.addItem((mi) => {
          mi.setTitle(title);
          if (curKw === kw && typeof mi.setChecked === "function") mi.setChecked(true);
          mi.onClick(() => this.setUpNextKeyword(file, dayKey, item, kw));
        });
      }
    });
    menu.addSeparator();
    for (const [prio, title] of UP_NEXT_PRIORITY_ITEMS) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (prio && curPrio === prio && typeof mi.setChecked === "function") mi.setChecked(true);
        mi.onClick(() => this.setUpNextPriority(file, dayKey, item, prio));
      });
    }
    menu.addSeparator();
    const isToday = dayKey === this.plugin.today().format(this.plugin.settings.format);
    const isAuto = isAutoTask(item, this.plugin.autoKeys(dayKey));
    if (isToday && item.state !== "done") {
      const pomoM = pomoMinutes(this.plugin.ensurePomodoro());
      menu.addItem((mi) => {
        mi.setTitle(T(`🍅 用番茄钟开始（${dur(pomoM)}）`, `🍅 Start Pomodoro (${dur(pomoM)})`));
        mi.onClick(() => this.plugin.startPomodoro(pomoM, { file, dayKey, item }));
      });
      if (!isAuto && item.explicitDur) {
        const estM = Math.min(240, Math.max(1, Math.round(item.remaining != null && item.remaining > 0 ? item.remaining : item.dur)));
        if (estM !== pomoM) {
          menu.addItem((mi) => {
            mi.setTitle(T(`🍅 按预估开始（${dur(estM)}）`, `🍅 Start with estimate (${dur(estM)})`));
            mi.onClick(() => this.plugin.startPomodoro(estM, { file, dayKey, item }));
          });
        }
      }
    }
    menu.addItem((mi) => {
      mi.setTitle(T("定位到日记", "Show in journal"));
      mi.onClick(() => this.plugin.openItem(file, item));
    });
    menu.showAtMouseEvent(e);
  }

  // 🤖 人机协作：按项目分 + 近 7 天
  renderAi(list, store, date, ai) {
    const cfg = this.plugin.settings;
    const sec = list.createDiv({ cls: "naut-sec naut-sec-ai", text: T("🤖 人机协作", "🤖 Agents") });
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
          if (sess.length) new AiSessionsModal(this.plugin, T(`「${name}」这天的 Agent 会话`, `Agent sessions for "${name}" this day`), [{ list: sess }]).open();
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
      const col = week.createDiv({ cls: "naut-ai-col" + (d.isSame(date, "day") ? " is-cur" : ""), attr: { title: s ? T(`${d.format("M/D ddd")}  协作 ${dur(s.wall)} · 工时 ${dur(s.agent)} · 产出 ${fmtTok(s.out)} · ${s.prompts} 条指令`, `${d.format("ddd M/D")}  agents ${dur(s.wall)} · hours ${dur(s.agent)} · output ${fmtTok(s.out)} · ${s.prompts} prompts`) : T(`${d.format("M/D ddd")}  没用 Agent`, `${d.format("ddd M/D")}  no agents`) } });
      const bar = col.createDiv({ cls: "naut-ai-bar", attr: { style: `height:${s ? Math.max(2, (s.wall / max) * 100) : 0}%` } });
      const parts = !s ? [] : s.by ? Object.keys(AI_AGENTS).filter((k) => s.by[k] && s.by[k].wall).map((k) => [k, s.by[k].wall]) : [["claude", 1]];
      for (const [k, w] of parts) bar.createDiv({ cls: `naut-ai-part naut-bg-${k}`, attr: { style: `flex-grow:${w}` } });
      col.createDiv({ cls: "naut-ai-day", text: d.format("dd") });
    }
    const sum = (k) => had.reduce((n, x) => n + x.s[k], 0);
    list.createDiv({ cls: "naut-proj-note", text: had.length ? T(`近 7 天：${had.length} 天在用 · 协作 ${dur(sum("wall"))} · 产出 🗄 ${fmtTok(sum("out"))} tok · 日均 ${dur(sum("wall") / 7)}`, `Last 7 days: used on ${had.length} days · agents ${dur(sum("wall"))} · output 🗄 ${fmtTok(sum("out"))} tok · ${dur(sum("wall") / 7)} a day`) : T("近 7 天还没有 Agent 会话记录", "No agent sessions in the last 7 days") });
  }

  // 📋 当日复盘：这一天每件任务的预计和实际，逐件对照（规则见 dayReview）。默认收着，标题上带结论
  renderDayReview(list, items, file, dayKey, live) {
    const cfg = this.plugin.settings;
    const r = dayReview(items, cfg, { live, auto: this.plugin.autoKeys(dayKey) });
    if (!r.rows.length) return;
    const s = r.summary, open = cfg.dayReviewFolded === false;
    const head = list.createDiv({ cls: "naut-sec naut-proj-head naut-dayrev-head", text: T(`${open ? "▾" : "▸"} 📋 ${live ? "今日" : "当日"}复盘 · 已完成 ${s.completedCount}/${s.totalCount}${s.comparedCount ? ` · 偏差 ${signed(s.varianceMinutes)}` : ""}`, `${open ? "▾" : "▸"} 📋 ${live ? "Today's" : "Day"} review · done ${s.completedCount}/${s.totalCount}${s.comparedCount ? ` · off by ${signed(s.varianceMinutes)}` : ""}`) });
    head.onclick = () => { cfg.dayReviewFolded = open; this.plugin.saveSoon(); this.render(); };
    if (!open) return;
    list.createDiv({ cls: "naut-proj-note", text: s.comparedCount ? T(`已对比 ${s.comparedCount} 件：预计 ${dur(s.plannedMinutes)} · 实际 ${dur(s.actualMinutes)} · 偏差 ${signed(s.varianceMinutes)}`, `Compared ${s.comparedCount}: estimated ${dur(s.plannedMinutes)} · actual ${dur(s.actualMinutes)} · off by ${signed(s.varianceMinutes)}`) : T("还没有能对比的：做完了、也记到了实际用时的才算", "Nothing to compare yet: only tasks that are done and have actual time recorded count"),
      attr: { title: T("偏差 = 实际 − 预计，只算做完了、也记到了实际用时的任务，两边是同一批。在做的、停着的照样列在下面，但不影响偏差。预计没写的按默认任务时长", "Off by = actual − estimate, counting only tasks that are done and have actual time recorded, the same set on both sides. Tasks in progress or paused are still listed below but don't affect it. Tasks without an estimate use the default task length") } });
    const NAME = { compared: T("已对比", "Compared"), live: T("进行中", "Doing"), paused: T("已暂停", "Paused"), "not-tracked": T("未计时", "Not timed"), "not-started": T("未开始", "Not started"), "no-estimate": T("未预估", "No estimate") };
    for (const x of r.rows) {
      const row = list.createDiv({ cls: `naut-row naut-dayrev is-${x.state}` + (x.varianceMinutes > 0 ? " is-over-est" : "") });
      row.createSpan({ cls: "naut-time", text: x.state === "compared" ? signed(x.varianceMinutes) : NAME[x.state] });
      row.createSpan({ cls: "naut-label", text: x.label });
      row.createSpan({ cls: "naut-dur", text: [x.plannedMinutes != null ? T(`预计 ${dur(x.plannedMinutes)}`, `Est. ${dur(x.plannedMinutes)}`) : "", x.actualMinutes > 0 ? T(`实际 ${dur(x.actualMinutes)}`, `Actual ${dur(x.actualMinutes)}`) : x.state === "not-tracked" ? T("未计时", "Not timed") : ""].filter(Boolean).join(" · ") });
      row.onclick = () => this.plugin.openItem(file, x.item);
    }
  }
  // 📏 预估 vs 实际：近 30 天做完的、写了预估、也记到了实际用时的任务
  renderReview(list) {
    const r = this.plugin.reviewData();
    if (!r || !r.n) return;
    const cfg = this.plugin.settings;
    const open = !cfg.reviewFolded;
    const head = list.createDiv({ cls: "naut-sec naut-proj-head naut-review-head", text: T(`${open ? "▾" : "▸"} 📏 预估 vs 实际 · 近 ${r.days} 天`, `${open ? "▾" : "▸"} 📏 Estimate vs actual · last ${r.days} days`) });
    head.onclick = () => { cfg.reviewFolded = open; this.plugin.saveSoon(); this.render(); };
    if (!open) return;
    const how = (x) => (Math.abs(x - 1) < 0.05 ? T("基本准", "about right") : `${x > 1 ? T("多用", "over") : T("少用", "under")} ${Math.round(Math.abs(x - 1) * 100)}%`);
    list.createDiv({ cls: "naut-proj-note", text: T(`${r.n} 件：预估 ${dur(r.sumE)} · 实际 ${dur(r.sumA)} · 整体${how(r.ratio)}`, `${r.n} tasks: estimated ${dur(r.sumE)} · actual ${dur(r.sumA)} · overall ${how(r.ratio)}`) });
    list.createDiv({ cls: "naut-proj-note", text: T(`估短 ${r.over} 件 · 估长 ${r.under} 件 · 差不多 ${r.n - r.over - r.under} 件（±20% 以内）· 一件一般是预估的 ${r.median.toFixed(1)} 倍`, `Underestimated ${r.over} · overestimated ${r.under} · close ${r.n - r.over - r.under} (within ±20%) · a task typically takes ${r.median.toFixed(1)}× its estimate`),
      attr: { title: T("只算做完的、写了预估时长、也记到了实际用时（DONE 开始-结束，或者 DOING 时的计时）的任务", "Only tasks that are done, have an estimate, and have actual time recorded (DONE start-end, or timing while DOING)") } });
    const row = (time, label, durText, tip, onclick) => {
      const el = list.createDiv({ cls: "naut-row naut-review-row" });
      el.createSpan({ cls: "naut-time", text: time });
      el.createSpan({ cls: "naut-label", text: label });
      el.createSpan({ cls: "naut-dur", text: durText, attr: tip ? { title: tip } : {} });
      if (onclick) el.onclick = onclick;
    };
    if (r.cats.length) list.createDiv({ cls: "naut-proj-note", text: T("按标签 / 链接分：", "By tag / link:") });
    for (const c of r.cats) row(`×${c.ratio.toFixed(1)}`, c.cat, T(`${c.n} 件`, `${c.n} tasks`), T(`预估 ${dur(c.e)} · 实际 ${dur(c.a)} · ${how(c.ratio)}`, `Est. ${dur(c.e)} · actual ${dur(c.a)} · ${how(c.ratio)}`));
    if (r.worst.length) list.createDiv({ cls: "naut-proj-note", text: T("估得最短的几件：", "Most underestimated:") });
    for (const w of r.worst) row(`×${(w.actual / w.est).toFixed(1)}`, w.label, `${dur(w.est)}→${dur(w.actual)}`, T(`${w.day} · 预估 ${dur(w.est)}，实际 ${dur(w.actual)}`, `${w.day} · estimated ${dur(w.est)}, actual ${dur(w.actual)}`),
      () => { const f = this.app.vault.getAbstractFileByPath(w.path); if (f instanceof TFile) this.plugin.openLine(f, w.line); });
  }

}

// ---------------- 界面图标：emoji 显示成 Lucide ----------------
// 源码和日记里照旧写 emoji（🔗 ⏱ 💬 这些是日记正文里的记号，parseJournal 靠它们认行，不能改），
// 只在插件自己画的界面上（面板、状态栏、Agent 弹层、弹窗、编辑器里的小部件）把文字里的 emoji 换成 Lucide 图标。
// 编辑器正文、螺旋 SVG 里的文字、悬停提示不动
const LUCIDE = {
  "🔗": "link", "⏱": "timer", "🤖": "bot", "💬": "message-square", "🎯": "target", "⏸": "pause",
  "📋": "clipboard-list", "🧭": "compass", "✅": "circle-check", "📅": "calendar", "🔥": "flame", "⭐": "star",
  "💤": "moon-star", "🎮": "gamepad-2", "📏": "ruler", "☀": "sun", "🌙": "moon", "✓": "check", "⚠": "triangle-alert",
  "🌀": "shell", "🧩": "puzzle", "⏳": "hourglass", "🍚": "utensils", "😴": "bed", "📝": "notebook-pen", "👍": "thumbs-up",
  "🔴": "circle", "🟢": "circle", "🟠": "circle", "🎬": "clapperboard", "💼": "briefcase", "🛫": "send", "🏃": "footprints",
  "☕": "coffee", "⏵": "play", "📭": "inbox", "🕐": "clock", "🕛": "clock", "🕜": "clock", "🕧": "clock", "🕰": "clock",
  "🔔": "bell", "🚫": "ban", "🎉": "party-popper", "➕": "plus", "✋": "hand", "📦": "package", "📌": "pin", "💡": "lightbulb", "🗄": "database", "➡": "arrow-right",
};
const LUCIDE_TONE = { "🔴": "red", "🟢": "green", "🟠": "orange" };
const LUCIDE_RE = new RegExp(`(${Object.keys(LUCIDE).sort((a, b) => b.length - a.length).join("|")})\\uFE0F?`, "gu");
const LUCIDE_ANY = new RegExp(LUCIDE_RE.source, "u");   // 只判断有没有，不带 g，不用管 lastIndex
const LUCIDE_SCOPE = '[class*="naut-"]';
const lucideIcon = (doc, emoji) => {
  const span = doc.createElement("span");
  span.className = "naut-ico";
  span.dataset.emoji = emoji;
  if (LUCIDE_TONE[emoji]) span.dataset.tone = LUCIDE_TONE[emoji];
  OB.setIcon(span, LUCIDE[emoji]);
  return span;
};
const lucidifyText = (node) => {
  const s = node.nodeValue;
  if (!s || !LUCIDE_ANY.test(s)) return;
  const p = node.parentElement;   // 调用的地方都已经确认在 LUCIDE_SCOPE 里
  if (!p || p.namespaceURI !== "http://www.w3.org/1999/xhtml" || p.closest("textarea, input, [contenteditable='true'], svg, .naut-ico")) return;
  // 编辑器里只认小部件（不可编辑的那部分），正文一个字不碰
  if (p.closest(".cm-content") && !p.closest("[contenteditable='false']")) return;
  const doc = node.ownerDocument, frag = doc.createDocumentFragment();
  let last = 0;
  for (const m of s.matchAll(LUCIDE_RE)) {
    if (m.index > last) frag.appendChild(doc.createTextNode(s.slice(last, m.index)));
    frag.appendChild(lucideIcon(doc, m[1]));
    last = m.index + m[0].length;
  }
  if (last < s.length) frag.appendChild(doc.createTextNode(s.slice(last)));
  node.replaceWith(frag);
};
const lucidify = (root) => {
  if (!root) return;
  if (root.nodeType === 3) return lucidifyText(root);
  if (root.nodeType !== 1) return;
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT), hits = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (LUCIDE_ANY.test(n.nodeValue)) hits.push(n);
  hits.forEach(lucidifyText);
};
// 一个窗口一个观察者（弹出窗口也算）：只看插件自己的节点
const lucideWatch = (plugin, win) => {
  if (!OB.setIcon || win.__nautLucide) return;
  const obs = new win.MutationObserver((recs) => {
    const added = new Set(), scope = new Map();
    const inScope = (el) => {
      if (!el) return false;
      let v = scope.get(el);
      if (v === undefined) scope.set(el, v = !!el.closest(LUCIDE_SCOPE));
      return v;
    };
    for (const r of recs) {
      if (r.type === "characterData") {
        if (!r.target.nodeValue || !LUCIDE_ANY.test(r.target.nodeValue)) continue;
        if (inScope(r.target.parentElement)) lucidifyText(r.target);
        continue;
      }
      if (!r.addedNodes.length) continue;
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (inScope(t)) r.addedNodes.forEach((n) => added.add(n));
      else for (const n of r.addedNodes) if (n.nodeType === 1 && ((typeof n.className === "string" && n.className.includes("naut-")) || n.querySelector?.(LUCIDE_SCOPE))) added.add(n);
    }
    // 一次渲染里父节点和它下面的节点各来一条记录：只扫最外层的，里面的跟着一起扫到
    for (const n of added) {
      let p = n.parentNode;
      while (p && !added.has(p)) p = p.parentNode;
      if (!p && n.isConnected) lucidify(n);
    }
  });
  obs.observe(win.document.body, { childList: true, subtree: true, characterData: true });
  win.__nautLucide = obs;
  win.document.body.querySelectorAll(LUCIDE_SCOPE).forEach(lucidify);
  plugin.register(() => { obs.disconnect(); delete win.__nautLucide; });
};

// ---------------- 插件 ----------------

module.exports = class NautilusSpiral extends Plugin {
  async onload() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULTS, loaded);
    // 老配置里没有 journalAuto：没动过目录/格式（还是「日记」/ Journal + YYYY_MM_DD）的当成没设过，交给自动检测；自己改过的保持手动
    if (loaded && !("journalAuto" in loaded)) {
      const f = trimSlash(this.settings.folder);
      this.settings.journalAuto = (f === "日记" || f === "Journal") && this.settings.format === "YYYY_MM_DD";
    }
    const removedSettings = ["autoLog", "agentKw", "autoLogArchiveDone", "resultBack", "lineProgress", "agentAlert", "focus", "focusMinutes", "focusCategories", "focusMode", "focusAutoComplete", "focusAsk", "focusSession"].filter(key => key in this.settings);
    for (const key of removedSettings) delete this.settings[key];
    if (removedSettings.length) await this.saveData(this.settings);
    this.settings.aiAgents = Object.assign({}, DEFAULTS.aiAgents, this.settings.aiAgents);
    this.ensurePomodoro();
    this.applyColors();
    lucideWatch(this, window);
    this.registerEvent(this.app.workspace.on("window-open", (w) => { lucideWatch(this, w.win); this.applyColors(w.doc); }));
    this.states = new Map();   // path -> Map(label -> state)，用来发现「刚改成 DONE」
    this.pastDayCache = new Map();   // dayKey -> { sig, items, M, cal, orphans, plan }，历史日期定稿后复用解析排程结果
    this.cal = new MacCalendar();
    this.gcal = new GoogleCalendar({
      get: (id) => this.secret(`google-${id}`),
      set: (id, value) => this.secret(`google-${id}`, value),
      clientId: () => String(this.settings.googleClientId || "").trim(),
      http: async (req) => { const r = await OB.requestUrl({ ...req, throw: false }); let json = null; try { json = r.json; } catch (e) { /* 不是 JSON */ } return { status: r.status, json: json || {} }; },
      open: (url) => window.open(url),
    });
    this.core = { parseJournal, parseDuration, parseProgress, stripProgress, stripDuration, applyWork, workKey, schedule, fill, normalize };   // 给「任务提醒」插件复用
    delete this.settings.breakState;
    delete this.settings.breakWords;
    this.saveSoon = debounce(() => this.saveData(this.settings), 1000, true);
    this.journalDetect();   // 日记目录 / 文件名格式：跟着核心「日记」插件或者库里的实际写法定
    this.refresh = debounce(() => { if (!this.dragging) this.views().forEach((v) => v.render()); }, 300, true);   // 正在拖把手时不重绘
    this.pruneLogs();
    this.aiStorePath = `${this.manifest.dir}/ai-usage.json`;
    this.gameLogPath = `${this.manifest.dir}/game-log.json`;
    this.registerInterval(window.setInterval(() => this.pollGames(), 60 * 1000));

    this.registerView(VIEW_TYPE, (leaf) => new SpiralView(leaf, this));
    this.addRibbonIcon("orbit", T("螺旋日程", "Nautilus Spiral"), () => this.activate());
    // 命令和快捷面板共用动作表；不预设全局快捷键，需要时可在 Obsidian 设置中绑定
    let nm = (s) => s;   // 命令名
    for (const a of this.actions()) {
      const cmd = { id: a.id, name: nm(a.name) };
      if (a.editor) cmd.editorCallback = (editor, view) => a.run(editor, view);
      else if (a.when) cmd.checkCallback = (check) => { if (!a.when()) return false; if (!check) a.run(); return true; };
      else cmd.callback = () => a.run();
      this.addCommand(cmd);
    }
    this.registerInterval(window.setInterval(() => this.checkStale().catch((e) => console.error("[螺旋日程] 检查 DOING 失败", e)), 60 * 1000));
    // 小组件上点一行：obsidian://nautilus-open?note=日记/2026_10_26.md&kind=main&text=写简历 → 打开那篇笔记，光标放到那一件上。
    // 链接里不带行号、到时候现找：上面多写一行，小组件的数据不用跟着变。参数不能叫 path：Obsidian 会把它当成绝对路径先拦下
    this.registerObsidianProtocolHandler("nautilus-open", async (p) => {
      const f = this.app.vault.getAbstractFileByPath(p.note || "");
      if (!(f instanceof TFile)) return;
      const text = p.text ? await this.app.vault.cachedRead(f) : "";
      const W = (x) => String(x).toWellFormed(), same = (x) => (p.kind === "doing" ? workKey(W(x.label)) === workKey(p.text) : W(x.label) === p.text);
      const byId = p.id && text ? text.split("\n").findIndex((l) => new RegExp(`\\s\\^${p.id.replace(/[^\w-]/g, "")}\\s*$`).test(l)) : -1;
      if (byId >= 0) return this.openLine(f, byId);
      const list = !text ? [] : p.kind === "plan" ? ganttOf(text) : p.kind === "todo" ? openTasks(text) : p.kind === "doing" ? parseJournal(text, this.settings).filter((i) => i.kind === "task") : mainOf(text).tasks;
      const hit = list.find((x) => same(x) && (p.line == null || x.line === +p.line)) || list.find(same);
      this.openLine(f, hit ? hit.line : 0);
    });
    this.setupWidgetInbox();
    this.addSettingTab(new SpiralSettings(this.app, this));
    this.setupStatusBar();

    // 在日历里点某一天（或打开任何一篇日记），螺旋跟着切到那一天
    this.registerEvent(this.app.workspace.on("file-open", (f) => {
      if (!(f instanceof TFile) || !inJournalDir(f.path, this.settings.folder)) return;
      const d = moment(this.journalKey(f), this.settings.format, true);
      if (!d.isValid()) return;
      const offset = d.startOf("day").diff(this.today(), "days");
      for (const v of this.views()) if (v.offset !== offset) v.go(offset);
    }));
    this.registerEvent(this.app.vault.on("modify", (f) => this.onFileChange(f)));
    // 任务状态切换的音效：全库的笔记都看（TODOseq 的任务列表、看板改的不一定是日记）
    this.kw = new Map();   // path -> kwSnapshot
    this.registerEvent(this.app.vault.on("modify", (f) => this.onAnyModify(f)));
    this.registerEditorExtension(this.kwLiveExtension());   // 编辑器里一改就响，不等写盘
    this.registerEditorExtension(this.mainSliderExtension());   // 主线块下面能拖的进度条
    this.registerEvent(this.app.workspace.on("file-open", (f) => this.kwBaseline(f)));
    this.app.workspace.onLayoutReady(() => this.app.workspace.iterateAllLeaves((l) => { if (l.view && l.view.file) this.kwBaseline(l.view.file); }));
    this.registerEvent(this.app.vault.on("create", (f) => this.onFileChange(f)));
    this.registerEvent(this.app.workspace.on("agent-deck:sessions-changed", () => this.refresh()));
    this.registerInterval(window.setInterval(() => this.refresh(), 60 * 1000));
    this.registerInterval(window.setInterval(() => this.tickPomodoro(), 5 * 1000));

    this.app.workspace.onLayoutReady(async () => {
      this.journalDetect();   // 库这时候才完整索引好，翻库猜的结论这时候才准
      this.tickPomodoro();
      const f = this.app.vault.getAbstractFileByPath(this.journalPath(this.today()));
      if (f instanceof TFile) this.observe(f, await this.app.vault.read(f), false);
      const firstOpen = !this.settings.autoOpened;
      if (firstOpen) {
        this.settings.autoOpened = true;
        this.saveSoon();
        await this.activate(true, true);
      }
      // 启动页：今天的日记 + 左侧栏显示螺旋日程（其它插件恢复布局也在这时候，稍等一下再切，免得被盖掉）
      window.setTimeout(async () => {
        try {
          if (this.settings.openTodayOnStartup) await this.openToday(true);
          if (firstOpen || this.settings.revealOnStartup) await this.activate(false, true);
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
    if (!(file instanceof TFile)) return T(`今天（${dayKey}）还没有日记`, `No daily note for today (${dayKey}) yet`);
    const items = parseJournal(await this.app.vault.read(file), cfg);
    this.withCalendar(items, date);
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    applyWork(items, cfg, dayKey, now, 0, bounds);
    const plan = schedule(items, cfg, now, 0, bounds);
    const C = capacity(items, plan, cfg, now, 0, bounds);
    const lines = [`${C.tone === "warning" ? "⚠️ " : ""}${capSummary(C)}`, T(`可安排 ${dur(C.available)} / ${dur(C.totalAvailable)} · 事件 ${dur(C.fixed)} / ${dur(C.totalFixed)}`, `Schedulable ${dur(C.available)} / ${dur(C.totalAvailable)} · Events ${dur(C.fixed)} / ${dur(C.totalFixed)}`)];
    const next = plan.queue.filter((t) => t.segments.length > t.workedN).sort((a, b) => a.segments[a.workedN][0] - b.segments[b.workedN][0]).slice(0, 5);
    if (next.length) lines.push("", T("接下来：", "Up next:"), ...next.map((t) => T(`${t.doing ? "进行中" : clock(t.segments[t.workedN][0])}  ${t.label}（${t.remaining < t.dur - 1 ? "剩 " + dur(t.remaining) : dur(t.dur)}）`, `${t.doing ? "Doing" : clock(t.segments[t.workedN][0])}  ${t.label} (${t.remaining < t.dur - 1 ? dur(t.remaining) + " left" : dur(t.dur)})`)));
    const over = plan.queue.filter((t) => t.overflow);
    if (over.length) lines.push("", T("排不下：", "Won't fit:"), ...over.map((t) => `· ${t.label}`));
    if (plan.suspended.length) lines.push("", T("⏸ 挂起：", "⏸ On hold: ") + plan.suspended.map((t) => t.label).join(T("、", ", ")));
    const tail = await this.dayTail(dayKey, items);
    if (tail.length) lines.push("", ...tail);
    return lines.join("\n");
  }

  // 发到 Telegram 的图文版（HTML 格式）：「?」的回复和「任务提醒」每天定时推送共用
  async telegramReport(title = T("螺旋日程", "Nautilus Spiral")) {
    const cfg = this.settings;
    const date = this.today();
    const dayKey = date.format(cfg.format);
    const H = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nowM = moment();
    const head = T(`🌀 <b>${H(title)}</b> · ${date.format("M月D日")} 周${"日一二三四五六"[date.day()]} · ${nowM.format("HH:mm")}`, `🌀 <b>${H(title)}</b> · ${date.format("ddd, MMM D")} · ${nowM.format("HH:mm")}`);
    const file = this.app.vault.getAbstractFileByPath(this.journalPath(date));
    if (!(file instanceof TFile)) return T(`${head}\n\n📭 今天还没有日记`, `${head}\n\n📭 No daily note for today yet`);
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
    lines.push(T(`🕰 ${clock(S)} → ${E >= 1440 ? "次日 " : ""}${clock(E)}  ${bar((now - S) / (E - S))}  今天已过 ${pct((now - S) / (E - S))}`, `🕰 ${clock(S)} → ${E >= 1440 ? "next day " : ""}${clock(E)}  ${bar((now - S) / (E - S))}  ${pct((now - S) / (E - S))} of today gone`));
    const C = capacity(items, plan, cfg, now, 0, bounds);
    lines.push(T(`⏳ 可安排 <b>${dur(C.available)}</b> · 📋 已计划 <b>${dur(C.demand)}</b> · `, `⏳ Schedulable <b>${dur(C.available)}</b> · 📋 Planned <b>${dur(C.demand)}</b> · `) +
      T(`${C.status.key === "overload" ? "🔴" : C.status.key === "fragmented" ? "🟠" : "🟢"} ${C.status.label} <b>${dur(C.status.value)}</b> · 剩余 ${C.left}%`, `${C.status.key === "overload" ? "🔴" : C.status.key === "fragmented" ? "🟠" : "🟢"} ${C.status.label} <b>${dur(C.status.value)}</b> · ${C.left}% free`));
    const tasks = items.filter((i) => i.kind === "task" && !i.container);
    const done = tasks.filter((i) => i.state === "done");
    const openN = tasks.filter((i) => i.state === "open").length;
    lines.push(T(`✅ 做完 <b>${done.length}</b> · ⬜ 还剩 <b>${openN}</b>  ${bar(done.length / (done.length + openN || 1))}  ${pct(done.length / (done.length + openN || 1))}`, `✅ Done <b>${done.length}</b> · ⬜ Open <b>${openN}</b>  ${bar(done.length / (done.length + openN || 1))}  ${pct(done.length / (done.length + openN || 1))}`));

    // ⭐ 正在做：DOING
    const doing = plan.queue.filter((t) => t.doing);
    if (doing.length) {
      lines.push("", T("⭐ <b>正在做</b>", "⭐ <b>Doing</b>"));
      for (const t of doing) {
        const p = t.progress != null ? t.progress : spent(t) / (spent(t) + t.remaining || 1);
        lines.push(`⭐ <b>${L(t)}</b>`, T(`      ${bar(p, 8)} ${spent(t) >= 1 ? `已做 ${dur(spent(t))} · ` : ""}剩 ${dur(t.remaining)}`, `      ${bar(p, 8)} ${spent(t) >= 1 ? `${dur(spent(t))} done · ` : ""}${dur(t.remaining)} left`));
      }
    }
    const paused = tasks.filter((t) => t.state === "open" && t.paused);
    if (paused.length) lines.push(T(`⏸ 暂停：${paused.map((t) => L(t, 16)).join("、")}`, `⏸ Paused: ${paused.map((t) => L(t, 16)).join(", ")}`));

    // ⏭ 接下来（按排到的时间）
    const next = plan.queue.filter((t) => !t.doing && t.segments.length > t.workedN)
      .sort((a, c) => a.segments[a.workedN][0] - c.segments[c.workedN][0]).slice(0, 5);
    if (next.length) {
      lines.push("", T("⏭ <b>接下来</b>", "⏭ <b>Up next</b>"));
      for (const t of next) {
        const at = t.segments[t.workedN][0];
        lines.push(`${clockIcon(at)} <code>${clock(at)}</code> ${L(t)} · ${t.remaining < t.dur - 1 ? T(`剩 ${dur(t.remaining)}`, `${dur(t.remaining)} left`) : dur(t.dur)}`);
      }
    }
    const events = items.filter((i) => i.kind === "event" && i.state !== "done" && !i.pinned && i.end > now).sort((a, c) => a.start - c.start).slice(0, 4);
    if (events.length) {
      lines.push("", T("📅 <b>固定安排</b>", "📅 <b>Fixed events</b>"));
      for (const e of events) lines.push(`${e.start <= now ? "🔴" : "🔔"} <code>${clock(e.start)}–${clock(e.end)}</code> ${L(e)}`);
    }
    const over = plan.queue.filter((t) => t.overflow);
    if (over.length) {
      lines.push("", T(`🚫 <b>排不下</b>（${over.length} 件）`, `🚫 <b>Won't fit</b> (${over.length})`));
      lines.push(...over.slice(0, 5).map((t) => `▫️ ${L(t)}`));
      if (over.length > 5) lines.push(T(`▫️ …还有 ${over.length - 5} 件`, `▫️ …and ${over.length - 5} more`));
    }
    if (plan.suspended.length) lines.push("", T(`💤 搁置 ${plan.suspended.length} 件：${plan.suspended.slice(0, 4).map((t) => L(t, 14)).join("、")}${plan.suspended.length > 4 ? "…" : ""}`, `💤 ${plan.suspended.length} parked: ${plan.suspended.slice(0, 4).map((t) => L(t, 14)).join(", ")}${plan.suspended.length > 4 ? "…" : ""}`));
    const recent = done.filter((t) => t.stamp != null).sort((a, c) => c.stamp - a.stamp).slice(0, 3);
    if (recent.length) lines.push("", T(`🎉 刚做完：${recent.map((t) => L(t, 16)).join("、")}`, `🎉 Just finished: ${recent.map((t) => L(t, 16)).join(", ")}`));
    const tail = (await this.dayTail(dayKey, items)).slice(1);   // 第一行「做完几件」上面已经有了
    if (tail.length) lines.push("", ...tail.map(H));
    lines.push("", T("<i>💬 回「?」随时看 · 「睡了」「起了」记作息</i>", "<i>💬 Send /now anytime to check</i>"));
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
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error(T("螺旋图画不出来", "Could not draw the spiral"))); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg)); });
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
    out.push(T(`✅ 做完 ${done} 件 · 还有 ${open} 件没做完`, `✅ ${done} done · ${open} unfinished`));
    const mf = this.settings.showMain !== false && this.app.vault.getAbstractFileByPath(this.journalPath(moment(dayKey, this.settings.format)));
    if (mf instanceof TFile) {
      const M = mainOf(await this.app.vault.cachedRead(mf)), left = M.tasks.filter((t) => t.state !== "done");
      if (M.total) out.push(T(`🎯 主线 ${M.done}/${M.total}（${Math.round(M.done / M.total * 100)}%）${left.length ? " · 没做完：" + left.map((t) => t.label).join("、") : " · 全部做完"}`, `🎯 Mainline ${M.done}/${M.total} (${Math.round(M.done / M.total * 100)}%)${left.length ? " · unfinished: " + left.map((t) => t.label).join(", ") : " · all done"}`));
    }
    // 当日复盘：预计和实际差多少（只算做完、也记到了用时的）
    if (this.settings.showDayReview !== false) {
      const isToday = dayKey === this.today().format(this.settings.format);
      if (items.some((i) => i.kind === "task" && i.worked === undefined)) { const m = moment(); applyWork(items, this.settings, dayKey, normalize(m.hours() * 60 + m.minutes(), this.settings), isToday ? 0 : -1, (this.settings.dayBounds || {})[dayKey] || {}); }
      const s = dayReview(items, this.settings, { live: isToday, auto: this.autoKeys(dayKey) }).summary;
      if (s.comparedCount) out.push(T(`📋 已对比 ${s.comparedCount} 件：预计 ${dur(s.plannedMinutes)} · 实际 ${dur(s.actualMinutes)} · 偏差 ${signed(s.varianceMinutes)}`, `📋 Compared ${s.comparedCount}: estimated ${dur(s.plannedMinutes)} · actual ${dur(s.actualMinutes)} · off by ${signed(s.varianceMinutes)}`));
    }
    const ai = this.settings.showAi !== false && aiPick((await this.aiUsage()).days[dayKey], this.settings);
    if (ai) out.push(T(`🤖 协作 ${dur(ai.wall)} · Agent 工时 ${dur(ai.agent)} · 产出 ${fmtTok(ai.out)} tok`, `🤖 Agents ${dur(ai.wall)} · agent hours ${dur(ai.agent)} · output ${fmtTok(ai.out)} tok`));
    const games = this.settings.trackGames !== false && (await this.gameLog()).days[dayKey];
    if (games && games.length) out.push(T(`🎮 游戏 ${dur(unionMin(games))}`, `🎮 Gaming ${dur(unionMin(games))}`));
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
      const sleepLine = slept != null && slept >= 60 && slept <= 20 * 60 ? T(`😴 ${clock(pe)} 睡 → ${clock(d.getHours() * 60 + d.getMinutes())} 起，睡了 ${dur(slept)}${slept < 6 * 60 ? "，有点少" : slept >= 8 * 60 ? "，睡得挺足 👍" : ""}\n`, `😴 Slept ${clock(pe)} → up ${clock(d.getHours() * 60 + d.getMinutes())}, ${dur(slept)} of sleep${slept < 6 * 60 ? ", a bit short" : slept >= 8 * 60 ? ", well rested 👍" : ""}\n`) : "";
      return T(`☀️ ${clock(t)} 开始\n${sleepLine}\n`, `☀️ Started at ${clock(t)}\n${sleepLine}\n`) + (await this.capacityText());
    }
    const { key: dayKey, t: raw } = aiDay(ms, cfg);   // 凌晨睡的算前一天
    const work = (cfg.workLog || {})[dayKey] || {};
    for (const segs of Object.values(work)) for (const seg of segs) if (seg[1] == null) seg[1] = Math.max(seg[0], Math.round(raw));
    const t = Math.min(E, Math.max(S + 30, Math.round(raw / 5) * 5));
    await this.setBounds(dayKey, "end", t);
    const file = this.app.vault.getAbstractFileByPath(joinFolder(cfg.folder, `${dayKey}.md`));
    const items = file instanceof TFile ? parseJournal(await this.app.vault.read(file), cfg) : [];
    const b = cfg.dayBounds[dayKey] || {};
    return [T(`🌙 ${clock(t)} 收工 · 今天 ${clock(b.start ?? S)}–${clock(t)}`, `🌙 Done for the day at ${clock(t)} · today ${clock(b.start ?? S)}–${clock(t)}`), ...(await this.dayTail(dayKey, items))].join("\n");
  }

  // ---- 快捷操作：命令、快捷面板共用一张表 ----
  actions() {
    return [
      { id: "quick-panel", name: T("快捷面板（螺旋日程的所有操作）", "Quick panel (every Nautilus Spiral action)"), run: () => new QuickPanel(this.app, this).open(), hidden: true },
      { id: "status", name: T("现在怎样：在做的、容量、接下来", "Status now: doing, capacity, up next"), run: () => this.showStatus() },
      { id: "doing-ai", name: T("正在做的事的 Agent 会话", "Agent sessions for what you're doing"), run: () => this.showDoingAi() },
      { id: "notify-test", name: T("测试带按钮的系统通知（试验）", "Test a system notification with buttons (experimental)"), run: async () => {
        this._noNotify = 0;
        new OB.Notice(T("发了一条测试通知，在通知上点「收到」（横幅样式下要悬停后点「选项」）", "Sent a test notification. Click \"Got it\" on it (with banner style, hover and click \"Options\" first)"));
        const r = await this.ask(T("螺旋日程 · 测试通知", "Nautilus Spiral · test notification"), T("看到这条就说明通了。点「收到」试试按钮", "If you can see this, notifications work. Click \"Got it\" to try the button"), [T("收到", "Got it"), T("不用了", "No thanks")], 60);
        new OB.Notice(r == null ? T("发不出去：系统没允许「螺旋日程」发通知。到「系统设置 → 通知 → 螺旋日程」打开「允许通知」，或者在通知中心里找到它的授权请求点「允许」。在那之前到点提醒照旧弹对话框", "Could not send: macOS hasn't allowed \"Nautilus Spiral\" to send notifications. Turn on Allow Notifications in System Settings → Notifications → Nautilus Spiral, or click Allow on its request in Notification Center. Until then, reminders still pop up as dialogs") : r === "" ? T("通知发出去了，但没点按钮（60 秒到了）", "The notification was sent, but no button was clicked (60 seconds passed)") : r === "__click__" ? T("收到：你点的是通知本身", "Received: you clicked the notification itself") : T(`收到：你点了「${r}」`, `Received: you clicked "${r}"`), 10000);
      } },
      { id: "review", name: T("预估 vs 实际（复盘）", "Estimate vs actual (review)"), run: () => this.showReview() },
      { id: "open", name: T("打开螺旋日程", "Open Nautilus Spiral"), run: () => this.activate() },
      { id: "day-bounds", name: T("设置今天的起床 / 收工时间", "Set today's start / end of day"), run: () => new BoundsModal(this.app, this, this.today()).open() },
      { id: "open-today", name: T("打开今天的日记（凌晨按日界算前一天）", "Open today's daily note (before the day cutoff it's still yesterday)"), run: () => this.openToday() },
      { id: "pomodoro-start", name: T("开始番茄钟（预订接下来一段专注时间）", "Start Pomodoro (reserve an upcoming focus block)"), when: () => !this.settings.pomodoro?.active, run: () => this.startPomodoro() },
      { id: "pomodoro-stop", name: T("结束当前番茄钟", "Stop current Pomodoro"), when: () => !!this.settings.pomodoro?.active, run: () => this.stopPomodoro(false, { ask: true }) },
      { id: "pomodoro-cursor", name: T("用番茄钟开始光标所在任务", "Start Pomodoro on task at cursor"), editor: true, run: (editor, view) => this.startPomodoroAtCursor(editor, view) },
      { id: "calendar-refresh", name: T("重新读取日历（macOS 日历 / Google 日历）", "Reload calendars (macOS Calendar / Google Calendar)"), run: () => { this.cal.cache.clear(); this.pastDayCache?.clear(); this.gcal.cals = null; this.views().forEach((v) => v.render({ force: true })); } },
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

  // ⌃⌥V 现在怎样：在做的、容量和接下来
  async showStatus() {
    new StatusModal(this.app, this, await this.statusData()).open();
  }

  // ⌃⌥V 面板要的东西，一次备齐
  async statusData() {
    const cfg = this.settings, date = this.today(), dayKey = date.format(cfg.format);
    const m = moment(), now = normalize(m.hours() * 60 + m.minutes(), cfg);
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    const S = bounds.start ?? cfg.dayStart * 60, E = bounds.end ?? cfg.dayEnd * 60;
    const d = { date, dayKey, now, S, E, file: this.todayFile(), doing: [], suspended: [], next: [], over: [], events: [], C: null, done: 0, open: 0, review: null, ai: null, gaps: null };
    if (!d.file) return d;
    const items = parseJournal(await this.readLiveContent(d.file), cfg);
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

  // ⌃⌥C 正在做的事（DOING）各自期间的 Claude 会话；再加上最近 15 分钟还在动、没对上任何一件的会话
  async showDoingAi() {
    const cfg = this.settings;
    const file = this.todayFile();
    if (!file) { new OB.Notice(T("今天还没有日记", "No daily note for today yet")); return; }
    if (OB.Platform?.isDesktopApp && !this._aiBusy) await this.scanAi();   // 先读一遍最新的会话日志
    const key = this.today().format(cfg.format);
    const ai = projectAiDay((await this.aiUsage()).days[key], cfg);
    const items = parseJournal(await this.readLiveContent(file), cfg);
    const m = moment();
    const now = normalize(m.hours() * 60 + m.minutes(), cfg);
    applyWork(items, cfg, key, now, 0, (cfg.dayBounds || {})[key] || {});
    const doing = items.filter((t) => t.kind === "task" && t.state === "open" && t.doing);
    const groups = [], matched = new Set();
    for (const t of doing) {
      const list = aiFor(t.worked, ai?.list, t.label);
      for (const x of list) if (x.related) matched.add(x.sid);
      groups.push({ name: `▶ ${t.label}`, sub: t.spentToday >= 1 ? T(`今天做了 ${dur(t.spentToday)}`, `${dur(t.spentToday)} today`) : "", list });
    }
    const live = (ai?.list || []).filter((x) => !matched.has(x.sid) && (x.segs || []).some(([, b]) => b >= now - 15))
      .map((x) => ({ ...x, related: true, lastAt: Math.max(...x.segs.map(([, b]) => b)) }));
    if (live.length) {
      const ids = new Set(live.map((x) => x.sid));
      for (const g of groups) g.list = g.list.filter((x) => x.related || !ids.has(x.sid));
      groups.push({ name: T("🟢 现在还在跑、没对上哪件的会话", "🟢 Sessions running now that match no task"), list: live });
    }
    if (!doing.length && !live.length) { new OB.Notice(T("现在没有在做的事，也没有在跑的 Agent 会话", "Nothing in progress and no agent session running")); return; }
    new AiSessionsModal(this, T("正在做的事 · Agent 会话", "What you're doing · agent sessions"), groups).open();
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
    else new OB.Notice(T("还没有够条件的任务：要做完、写了预估、也记到了实际用时", "No task qualifies yet: it has to be done, have an estimate, and have actual time recorded"));
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
    const fileCache = (this._revFileCache ||= new Map());
    const cacheSig = `${cfg.format}|${cfg.dayStart}|${cfg.dayEnd}|${cfg.defaultDur}`;
    if (this._revFileSig !== cacheSig) { fileCache.clear(); this._revFileSig = cacheSig; }
    for (let i = 0; i < days; i++) {
      const d = this.today().subtract(i, "days");
      const f = this.app.vault.getAbstractFileByPath(this.journalPath(d));
      if (!(f instanceof TFile)) continue;
      const key = d.format(cfg.format);
      const workSnap = JSON.stringify((cfg.workLog || {})[key] || null);
      const prev = fileCache.get(f.path);
      if (prev && prev.mtime === f.stat.mtime && prev.workSnap === workSnap) { rows.push(...prev.rows); continue; }
      const text = await this.app.vault.cachedRead(f);
      const lines = text.split("\n");
      const items = parseJournal(text, cfg);
      applyWork(items, cfg, key, 0, -1, {});
      const fileRows = [];
      for (const t of items) {
        if (t.kind !== "task" || t.state !== "done" || !(t.est > 0)) continue;
        const clockTot = useClockTotal(t);
        const segs = [...(t.worked || []), ...(t.actual ? [t.actual] : [])];
        if (!segs.length && !clockTot) continue;
        const actual = Math.round((clockTot ? t.clock.total : unionMin(segs)) + (t.spentBefore || 0));
        if (actual < 1) continue;
        const raw = lines[t.line] || "";
        // 分类：行里的 #标签 和 [[链接]]（日记日期的链接不算）
        const cats = [...raw.matchAll(/#([^\s#\[\],，。;；:：]+)/gu)].map((m) => "#" + m[1])
          .concat([...raw.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()).filter((x) => !/^\d{4}[-_]\d{2}[-_]\d{2}$/.test(x)));
        fileRows.push({ day: key, path: f.path, line: t.line, label: t.label, est: t.est, actual, cats: [...new Set(cats)] });
      }
      fileCache.set(f.path, { mtime: f.stat.mtime, workSnap, rows: fileRows });
      rows.push(...fileRows);
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
  // 历史日期（早于今天业务日）读过一次且未出错后长期复用内存缓存，不再每 2 分钟重复读取，手动「重新读取日历」或改日历设置时清空。
  calendarFor(date) {
    if (!this.useMacCal() && !this.useGoogleCal()) return null;
    const key = date.format("YYYY-MM-DD");
    const c = this.cal.cache.get(key);
    const past = isPastDate(date, this.today());
    const stale = !c || (!past && Date.now() - c.at > 120000) || (past && !!c.error && Date.now() - c.at > 120000);
    if (stale) this.loadCalendar(date.clone(), key);
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
        items.push({ kind: "event", state: "none", label: e.title || T("（无标题）", "(untitled)"), start, end, line: -1, indent: 0, prio: false, cal: e });
      }
      next = { at: Date.now(), items, allDay, ...(errors.length ? { error: errors.join(T("；", "; ")) } : {}) };
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

  // ---- 硬规则：同时最多 3 件 DOING、3 小时没动就暂停 ----

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

    const auto = this.autoKeys(this.journalKey(file));
    const items = parseJournal(content, cfg);
    const doing = items.filter((i) => i.kind === "task" && i.state === "open" && i.doing && !auto.has(workKey(i.label)));
    const born = doing.filter((i) => !prev.get(i.label)?.doing && !prev.get(i.label)?.agentKw);   // 从 TOREVIEW / NEEDOK / HITLIMIT 这些中间态切回来的不算新开始的
    if (!born.length) return;
    for (const t of born) this.touch(workKey(t.label));
    this.goalCheck(file, content);   // 刚开始的是主线、还没写目标：先问
    const ai = this.aiWork(lines, items, auto);
    // 超过上限：最早开始的那几件改成 PAUSED。交给 Agent 在做的那几块不算数，也不会被暂停
    const mine = doing.filter((t) => !ai(t));
    if (!(cfg.doingLimit > 0) || mine.length <= cfg.doingLimit) return;
    const work = (cfg.workLog || {})[file.basename] || {};
    const since = (t) => (work[workKey(t.label)] || []).find((x) => x[1] == null)?.[0] ?? t.startedAt ?? 1e6 + t.line;
    const victims = mine.filter((t) => !born.includes(t)).sort((a, b) => since(a) - since(b)).slice(0, mine.length - cfg.doingLimit);
    if (!victims.length) return;
    await this.pause(file, victims);
    this.notify(T(`⏸ 同时在做超过 ${cfg.doingLimit} 件`, `⏸ More than ${cfg.doingLimit} tasks in progress`), T(`已暂停最早开始的：${victims.map((t) => t.label).join("、")}`, `Paused the earliest started: ${victims.map((t) => t.label).join(", ")}`), file, victims[0].line,
      victims.length === 1 ? { [T("换成暂停别的", "Pause a different one")]: () => this.openLine(file, victims[0].line) } : {});
  }

  // 交给 Agent 在做的活：自动记日记记下的、下面挂着「🔗」的、自动对上了某个会话的任务，连同它所在的整块（顶格那一项和它的子项）。
  // 返回一个判断函数：这件任务在不在这些块里
  aiWork(lines, items, auto) {
    const root = (n) => { while (n > 0 && /^(\s|$)/.test(lines[n])) n--; return n; };
    const roots = new Set(items.filter((t) => t.kind === "task" && t.state === "open"
      && (auto.has(workKey(t.label)) || linkUnder(lines, t.line) || t.agentKw || /\((claude|codex|workbuddy|dsh|antigravity):[0-9a-f]{6,36}\)/i.test(lines[t.line]))).map((t) => root(t.line)));
    return (t) => roots.has(root(t.line));
  }

  async pause(file, tasks) {
    const keys = tasks.map((t) => workKey(t.label));
    await this.editTasks(file.path, keys, toPaused);
  }

  // 每分钟：DOING 超过 staleHours 小时没动过（这一行和子项都没改）→ PAUSED
  async checkStale() {
    const cfg = this.settings;
    const file = this.todayFile();
    if (!file) return;
    const text = await this.app.vault.cachedRead(file);
    const lines = text.split("\n");
    const touch = (cfg.doingTouch ||= {});
    const now = Date.now(), seen = new Set(), stale = [];
    let changed = false;
    const auto = this.autoKeys(this.journalKey(file));
    for (const t of parseJournal(text, cfg)) {
      if (t.kind !== "task" || t.state !== "open" || !t.doing || auto.has(workKey(t.label))) continue;
      const k = workKey(t.label), sig = subtree(lines, t.line);
      seen.add(k);
      if (!touch[k] || touch[k].sig !== sig) { touch[k] = { sig, at: touch[k] && touch[k].sig == null ? touch[k].at : now }; changed = true; }
      if (cfg.staleHours > 0 && now - touch[k].at > cfg.staleHours * 3600e3) stale.push(t);
    }
    for (const k of Object.keys(touch)) if (!seen.has(k)) { delete touch[k]; changed = true; }
    if (changed) this.saveSoon();
    if (!stale.length) return;
    await this.pause(file, stale);
    const keys = stale.map((t) => workKey(t.label));
    this.notify(T(`⏸ 超过 ${cfg.staleHours} 小时没动`, `⏸ Untouched for over ${cfg.staleHours} hours`), T(`已暂停：${stale.map((t) => t.label).join("、")}`, `Paused: ${stale.map((t) => t.label).join(", ")}`), file, stale[0].line,
      { [T("还在做，切回 DOING", "Still working — back to DOING")]: async () => { for (const k of keys) this.touch(k); await this.editTasks(file.path, keys, toDoing); } });
  }

  // 系统通知；点一下跳到那一行
  // 提醒中枢：把一条提醒发到 Discord（走本机的 notify-discord 脚本，Webhook 地址在钥匙串里）。没配频道或者没发出去返回 false
  async toDiscord(text) {
    const cfg = this.settings;
    const ch = (cfg.discordChannel || "").trim();
    if (!ch || !(OB.Platform && OB.Platform.isDesktopApp)) return false;
    const bin = (cfg.discordCmd || "~/.local/bin/notify-discord").replace(/^~(?=\/)/, require("os").homedir());
    const r = await run(bin, ["--as", T("螺旋日程", "Nautilus Spiral"), ch, text], 20000);
    if (r.code !== 0) console.error("[螺旋日程] 发到 Discord 失败", (r.stderr || r.stdout).slice(0, 300));
    return r.code === 0;
  }

  // 提醒分两种：不用你回答的（暂停了、做完了）进 Discord，进去了就不在本机再弹一遍；
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
  async readLiveContent(file) {
    const view = this.journalView(file);
    return view ? view.editor.getValue() : this.app.vault.cachedRead(file);
  }
  async editFile(file, fn) {
    const view = this.journalView(file);
    if (view) {
      const ed = view.editor;
      const beforeText = ed.getValue(), before = beforeText.split("\n"), lines = [...before];
      const n = fn(lines);
      if (!n) return 0;
      if (lines.length === before.length) {
        const changes = [];
        lines.forEach((l, i) => { if (l !== before[i]) changes.push({ from: { line: i, ch: 0 }, to: { line: i, ch: before[i].length }, text: l }); });
        if (changes.length) ed.transaction({ changes });
      } else {
        const ch = diffLines(beforeText, lines.join("\n"));
        if (ch) ed.transaction({ changes: [ch] });
      }
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

  // 缓存目录（放在 iCloud 之外的本机缓存里，避免大索引拖慢同步）
  localCacheDir() {
    const path = require("path"), os = require("os");
    return process.platform === "darwin"
      ? path.join(os.homedir(), "Library/Caches/nautilus-spiral")
      : path.join(os.tmpdir(), "nautilus-spiral-cache");
  }
  aiCachePath() { return require("path").join(this.localCacheDir(), "ai-files-v1.json.gz"); }
  aiCalendar(cfg = this.settings) { return `${journalDayCutoff(cfg)}|${cfg.format}`; }
  aiBytesSig(ai) {
    let n = ai.files.size;
    for (const fc of ai.files.values()) n += (fc.offset || fc.size || 0);
    return n;
  }
  aiCacheFields(src, dst) {
    for (const k of ["sub", "cwd", "app", "model", "createdAt", "tot", "cur", "_inChars"]) if (src[k]) dst[k] = src[k];
    return dst;
  }
  async loadAiCache(ai) {
    if (ai._cacheLoaded) return false;
    ai._cacheLoaded = true;
    try {
      const fs = require("fs"), zlib = require("zlib");
      const raw = await fs.promises.readFile(this.aiCachePath());
      const buf = await new Promise((res, rej) => zlib.gunzip(raw, (e, out) => (e ? rej(e) : res(out))));
      const data = JSON.parse(buf.toString("utf8"));
      if (!data || data.v !== 1 || data.calendar !== this.aiCalendar(ai.cfg) || !Array.isArray(data.files)) return false;
      ai._lastScan = Number(data.lastScan) || 0;
      for (const f of data.files) {
        if (!f || !f.path) continue;
        ai.files.set(f.path, this.aiCacheFields(f, {
          size: f.size || 0, offset: f.offset || 0, agent: f.agent, sid: f.sid, id: f.id,
          days: new Map((f.days || []).map(([k, d]) => [k, { prompts: d.prompts || 0, sess: new Map(d.sess || []) }])),
          msgs: new Map(f.msgs || []),
          titles: new Map(f.titles || []),
        }));
      }
      for (const [sid, v] of data.live || []) if (v) ai.live.set(sid, v);
      for (const [sid, entries] of data.subs || []) {
        ai.subs.set(sid, new Map((entries || []).map(([id, r]) => [id, { ...r, tok: new Map(r.tok || []) }])));
      }
      return true;
    } catch { return false; }
  }
  aiCachePayload(ai) {
    const cut = moment().subtract(AI_FRESH_DAYS + 7, "days").format("YYYY_MM_DD");
    const files = [];
    for (const [p, fc] of ai.files) {
      const days = [...fc.days].filter(([k]) => k >= cut).map(([k, d]) => [k, { prompts: d.prompts || 0, sess: [...d.sess] }]);
      const msgs = [...fc.msgs].filter(([, m]) => !m || !m.key || m.key >= cut);
      if (!days.length && !msgs.length && !fc.titles.size && !fc.offset && !fc.size) continue;
      files.push(this.aiCacheFields(fc, {
        path: p, size: fc.size || 0, offset: fc.offset || 0, agent: fc.agent, sid: fc.sid, id: fc.id,
        days, msgs, titles: [...fc.titles],
      }));
    }
    const liveCutoff = Date.now() - 2 * 864e5;
    const live = [...ai.live].filter(([, v]) => v && (v.at || 0) >= liveCutoff);
    const subs = [...ai.subs].map(([sid, m]) => [sid, [...m].map(([id, r]) => [id, { ...r, tok: [...(r.tok || [])] }])]);
    return JSON.stringify({ v: 1, calendar: this.aiCalendar(ai.cfg), lastScan: ai._lastScan || 0, files, live, subs });
  }
  prepAiCacheSave(ai) {
    const payload = this.aiCachePayload(ai);
    ai._cacheDirty = false;
    ai._cacheSavedAt = Date.now();
    return payload;
  }
  saveAiCacheSync(ai) {
    if (!ai || !ai._cacheDirty) return;
    const fs = require("fs"), path = require("path"), zlib = require("zlib");
    const file = this.aiCachePath(), tmp = `${file}.tmp`;
    try {
      const payload = this.prepAiCacheSave(ai);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, zlib.gzipSync(payload));
      fs.renameSync(tmp, file);
    } catch { ai._cacheDirty = true; }
  }
  async saveAiCache(ai) {
    if (!ai || !ai._cacheDirty || this._aiCacheSaving) return;
    this._aiCacheSaving = true;
    const fs = require("fs"), path = require("path"), zlib = require("zlib");
    const file = this.aiCachePath(), tmp = `${file}.tmp`;
    try {
      const payload = this.prepAiCacheSave(ai);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const gz = await new Promise((res, rej) => zlib.gzip(payload, (e, out) => (e ? rej(e) : res(out))));
      await fs.promises.writeFile(tmp, gz);
      await fs.promises.rename(tmp, file);
    } catch { ai._cacheDirty = true; }
    finally { this._aiCacheSaving = false; }
  }

  // 人机协作汇总：先用存下的（手机上也能看），再在后台读 Claude Code 日志更新，至多一分钟一次
  async aiUsage({ skipScan = false } = {}) {
    if (!this.aiStore) {
      try { this.aiStore = JSON.parse(await this.app.vault.adapter.read(this.aiStorePath)); } catch (e) { this.aiStore = { days: {} }; }
      this._aiStoreVer = (this._aiStoreVer || 0) + 1;
    }
    if (skipScan) return this.aiStore;
    const reindex = this._ai && this.aiCalendar(this._ai.cfg) !== this.aiCalendar();
    if (OB.Platform && OB.Platform.isDesktopApp && !this._aiBusy && (reindex || Date.now() - (this._aiAt || 0) > 55000)) this.scanAi();
    return this.aiStore;
  }

  async scanAi() {
    this._aiBusy = true;
    try {
      if (!this._ai || this.aiCalendar(this._ai.cfg) !== this.aiCalendar()) this._ai = new AiUsage({ ...this.settings });
      const ai = this._ai;
      // Refresh mutable source selections without changing this scan's date settings.
      Object.assign(ai.cfg, this.settings);
      await this.loadAiCache(ai);
      // 把库里已经记下的 DSH 汇总当作 API 的缓存：插件没开 / 端口暂时找不到时，不清空已有的数
      if (!ai.dshApi.size) {
        for (const [k, v] of Object.entries(this.aiStore.days || {})) {
          if (!v || !v.by || !v.by.dsh) continue;
          const d = aiPick(v, { aiAgents: { dsh: true }, aiPrimary: "dsh" });
          if (d) { ai.dshApi.set(k, d); ai._dshApiKeys.add(k); }
        }
      }
      // 头一回（或汇总格式升级后）把现存日志全读一遍补历史；之后重启只读最近改过的
      const upgrade = this.aiStore.v !== AI_STORE_V;
      const since = this.aiStore.backfilled && !upgrade ? Date.now() - (AI_FRESH_DAYS + 2) * 864e5 : 0;
      const scanSince = ai.files.size && this.aiStore.backfilled && !upgrade
        ? (ai._lastScan ? Math.max(since, ai._lastScan - 120e3) : Date.now() - 2 * 864e5)
        : since;
      const scanStarted = Date.now(), prevSig = this.aiBytesSig(ai);
      const touched = await ai.scan(scanSince);
      if (this.aiCalendar(ai.cfg) !== this.aiCalendar()) return;
      ai._lastScan = scanStarted;
      if (touched.size || this.aiBytesSig(ai) !== prevSig) ai._cacheDirty = true;
      // DSH 的数不在会话日志里自己算：只向 dsh-token-usage-stats 要结果
      if (aiOn(this.settings).includes("dsh")) {
        for (const k of await ai.fetchDshApi(ai.dshDays(AI_FRESH_DAYS))) touched.add(k);
      }
      const changed = ai.merge(this.aiStore, touched, upgrade) || !this.aiStore.backfilled || upgrade || this._aiDirty;
      this._aiDirty = false;
      this.aiStore.backfilled = true;
      this.aiStore.v = AI_STORE_V;
      if (changed) {
        this._aiStoreVer = (this._aiStoreVer || 0) + 1;
        await this.app.vault.adapter.write(this.aiStorePath, JSON.stringify(this.aiStore));
        this.refresh();
      }
      if (ai._cacheDirty && (!ai._cacheSavedAt || Date.now() - ai._cacheSavedAt > 30000)) this.saveAiCache(ai);
    } catch (e) {
      console.error("[螺旋日程] 人机协作统计失败", e);
    } finally {
      this._aiBusy = false;
      const reindex = this._ai && this.aiCalendar(this._ai.cfg) !== this.aiCalendar();
      this._aiAt = reindex ? 0 : Date.now();
      if (reindex) this.refresh();
    }
  }

  // ---------------- 状态栏 ----------------
  // 照 Nautilus Log 的顶栏：在做事时显示最近开始的那件做了多久、几件在做；连着做过了番茄钟的阈值，计时变红；
  // 开了太久像是忘了关，提醒检查。这两样都只是提示，不替你停。没在做时显示今天的容量。每秒只换文字，不读日记
  setupStatusBar() {
    if (typeof this.addStatusBarItem !== "function") return;
    const el = (this.statusEl = this.addStatusBarItem());
    el.addClass("naut-status", "mod-clickable");
    el.setAttr("aria-label", T("单击：打开螺旋日程 · ⌥ 单击：到日记里正在做的那一行 · ⇧ 单击：在旁边分栏打开今天的日记", "Click: open Nautilus Spiral · ⌥-click: go to the task in progress in the daily note · ⇧-click: open today's daily note in a split"));
    el.setAttr("data-tooltip-position", "top");
    el.addEventListener("click", (ev) => this.statusClick(ev).catch((e) => console.error("[螺旋日程] 状态栏", e)));
    this.registerInterval(window.setInterval(() => this.tickStatus(), 1000));
    this.registerInterval(window.setInterval(() => this.refreshCapacity(), 60 * 1000));
    this.app.workspace.onLayoutReady(() => {
      this.refreshCapacity({ deferWidget: true });
      this._widgetBootT = window.setTimeout(() => { this._widgetBootT = null; this.widgetTick().catch((e) => console.error("[螺旋日程] 小组件", e)); }, 1500);
    });
  }

  tickStatus() {
    const el = this.statusEl, cfg = this.settings;
    if (!el) return;
    el.toggle(cfg.statusBar !== false);
    if (cfg.statusBar === false) return;
    const dayKey = this.today().format(cfg.format);
    const base = moment(dayKey, cfg.format).valueOf();   // 这篇日记那天的 0 点；计时记录里的分钟数从这儿起算
    const over = (ms, min) => min > 0 && ms >= min * 60e3;
    const cut = (s) => ([...s].length > 16 ? [...s].slice(0, 16).join("") + "…" : s);
    // 开着的计时：最近开始的那件排最前
    const open = Object.entries((cfg.workLog || {})[dayKey] || {}).map(([k, segs]) => [k, (segs.find((s) => s[1] == null) || [])[0]]).filter(([, a]) => a != null).sort((x, y) => y[1] - x[1]);
    let text, overdue = false, forgotten = false, warning = false;
    this._statusKey = open.length ? open[0][0] : null;
    if (open.length) {
      const ms = Date.now() - (base + open[0][1] * 60e3);
      overdue = over(ms, cfg.pomoMinutes ?? 45);
      forgotten = over(ms, cfg.forgottenMinutes ?? 120);
      const name = open[0][0].replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");
      text = `${forgotten ? T("⚠ 检查计时 · ", "⚠ Check the timer · ") : "▶ "}${elapsedText(ms)} · ${cut(name)}${open.length > 1 ? T(` · ${open.length} 件`, ` · ${open.length} tasks`) : ""}`;
    } else {
      text = this._capText ? `🌀 ${this._capText}` : "🌀";
      warning = !!this._capWarn;
    }
    // 🎯 主线（Agent 的记录 2026-10-20 起不在这一格里报了，交给 Agent Deck）：在做事时后面带上主线做到第几件；
    // 没在计时、主线还没做完时，容量那一句换成下一件主线
    const M = cfg.showMain !== false ? this._main : null;
    if (M && M.total) {
      const nx = mainNext(M);
      if (!open.length && nx) { text = `🎯 ${M.done}/${M.total} · ${nx.state === "doing" ? T("在做", "Doing") : T("下一件", "Next")} ${cut(nx.label)}`; warning = false; }
      else text += ` · 🎯${M.done}/${M.total}`;
    }
    if (this._statusText !== text) { this._statusText = text; el.setText(text); }   // 和上次写的比：emoji 换成图标以后 DOM 里的字对不上
    el.toggleClass("is-overdue", overdue);
    el.toggleClass("is-forgotten", forgotten);
    el.toggleClass("is-warning", warning);
  }

  // 没在做事时状态栏显示的那句容量：一分钟算一次，日记改了也算一次
  async refreshCapacity(opts = {}) {
    try { this.journalDetect(); await this.ensureToday(); } catch (e) { console.error("[螺旋日程] 日记位置", e); }
    try { await this.mainTick(); } catch (e) { console.error("[螺旋日程] 主线", e); }
    if (!opts.deferWidget) {
      try { await this.widgetTick(); } catch (e) { console.error("[螺旋日程] 小组件", e); }
    }
    try {
      const cfg = this.settings;
      const file = this.todayFile();
      if (!file || cfg.statusBar === false) { this._capText = ""; this._capWarn = false; return; }
      const dayKey = file.basename;
      const items = parseJournal(await this.readLiveContent(file), cfg);
      this.withCalendar(items, this.today());
      const m = moment(), now = normalize(m.hours() * 60 + m.minutes(), cfg), bounds = (cfg.dayBounds || {})[dayKey] || {};
      applyWork(items, cfg, dayKey, now, 0, bounds);
      const C = capacity(items, schedule(items, cfg, now, 0, bounds), cfg, now, 0, bounds);
      this._capText = capSummary(C);
      this._capWarn = C.tone === "warning";
    } catch (e) { console.error("[螺旋日程] 状态栏容量", e); }
  }

  // ---------------- 主线：追踪、提醒、一天结束时记下完成率 ----------------
  // 每分钟一次、今天的日记改了也来一次（跟着 refreshCapacity）。状态栏、面板读 this._main
  async mainTick() {
    const cfg = this.settings;
    if (cfg.showMain === false) { this._main = null; return; }
    const key = this.today().format(cfg.format), log = (cfg.mainLog ||= {});
    // 过了日期分界：前一天的完成率写进那篇日记的属性（mainline: 2/3、mainline-rate: 67），插件里也留一份（留 90 天）
    if (cfg.mainClosed !== key) {
      cfg.mainClosed = key;
      try { await this.mainRecord(this.today().subtract(1, "day")); } catch (e) { console.error("[螺旋日程] 主线结算", e); }
      this.pruneLogs();
      this.saveSoon();
    }
    const file = this.todayFile();
    const content = file ? await this.app.vault.cachedRead(file) : "";
    const M = (this._main = file ? mainOf(content) : null);
    if (!M) return;
    this.goalCheck(file, content, M);
    const was = log[key];
    if (M.total && (!was || was.done !== M.done || was.total !== M.total)) { log[key] = { done: M.done, total: M.total }; this.saveSoon(); }
    else if (!M.total && was) { delete log[key]; this.saveSoon(); }
    // 多了：一冒出来就说一声（同一组只说一次）
    const ov = M.over.join("\n");
    if (ov && ov !== this._mainOver) new OB.Notice(T(`🎯 主线最多 ${MAIN_MAX} 块，现在多了 ${M.over.length} 块：「${M.over.join("」「")}」不算主线。\n日记整理时会把多出来的 [#A] 降成 [#B]`, `🎯 Mainline is at most ${MAIN_MAX} blocks; there are ${M.over.length} extra: "${M.over.join("\", \"")}" don't count as mainline.\nJournal cleanup will lower the extra [#A] to [#B]`), 10000);
    this._mainOver = ov;
    this.mainNudge(file, M, key);
  }
  // 把一天的主线完成率写进那篇日记的属性。没有主线的日子不写
  async mainRecord(day) {
    const f = this.app.vault.getAbstractFileByPath(this.journalPath(day));
    if (!(f instanceof TFile)) return;
    const dayKey = day.format(this.settings.format), M = mainOf(await this.app.vault.read(f)), log = (this.settings.mainLog ||= {});
    if (!M.total) { delete log[dayKey]; return; }
    log[dayKey] = { done: M.done, total: M.total };
    await this.app.fileManager.processFrontMatter(f, (fm) => { fm.mainline = `${M.done}/${M.total}`; fm["mainline-rate"] = Math.round(M.done / M.total * 100); });
  }
  // 到了设置里的提醒时刻（默认 15:00、22:00）：主线还没做完、手上也没在做主线，提醒一次；今天还没定主线的，提醒定一个。
  // 错过半小时以上的（电脑睡着、Obsidian 没开）不补
  mainNudge(file, M, key) {
    const cfg = this.settings;
    const times = String(cfg.mainNudge || "").split(/[,，、\s]+/).map((x) => parseHourClock(x)).filter((h) => h != null).map((h) => normalize(Math.round(h * 60), cfg));
    if (!times.length) return;
    const m = moment(), now = normalize(m.hours() * 60 + m.minutes(), cfg);
    const nudged = (cfg.mainNudged ||= {});
    for (const k of Object.keys(nudged)) if (k !== key) delete nudged[k];
    const sent = (nudged[key] ||= []);
    for (const t of times) {
      if (sent.includes(t) || now < t) continue;
      sent.push(t);
      this.saveSoon();
      if (now - t > 30) continue;
      const nx = mainNext(M);
      if (!M.blocks.length) this.say(T("🎯 今天还没定主线", "🎯 No mainline today yet"), T("给最要紧的一到三件写上 [#A]（todo a），螺旋会先排它们", "Mark the one to three most important things with [#A] (todo a) and the spiral schedules them first"), file, 0);
      else if (nx && nx.state !== "doing") this.say(T(`🎯 主线还差 ${M.total - M.done} 件`, `🎯 Mainline: ${M.total - M.done} to go`), T(`${mainPips(M)} 下一件：${nx.label}`, `${mainPips(M)} Next: ${nx.label}`), file, nx.line);
    }
  }
  // 主线不定目标不开始：今天在做的主线任务（A 级那一行）下面还没写「🎯 目标：」的，问一次（交给 Agent 在做的不问）。
  // 改成 DOING 时马上看（enforce），每分钟也看一遍（mainTick），这条规则加上之前就开始了的也管
  goalCheck(file, content, M = mainOf(content)) {
    if (this.settings.showMain === false || !M.tasks.length) return;
    const lines = content.split("\n"), items = parseJournal(content, this.settings), A = new Set(M.tasks.map((x) => x.line));
    const ai = this.aiWork(lines, items, this.autoKeys(this.journalKey(file)));
    for (const t of items) if (t.kind === "task" && t.state === "open" && t.doing && A.has(t.line) && !ai(t) && !goalUnder(lines, t.line)) this.askGoal(file, t.label);
  }
  // 主线任务在做、下面还没写目标：先问。写了就记成这件任务下面的第一行「🎯 目标：」；没写就改回 TODO
  askGoal(file, label) {
    const asking = (this._goalAsking ||= new Set()), key = workKey(label);
    if (asking.has(key)) return;
    asking.add(key);
    new GoalModal(this.app, label, async (goal) => {
      asking.delete(key);
      if (!goal) {
        await this.editTasks(file.path, [key], toTodo);
        new OB.Notice(T(`🎯 主线「${label.slice(0, 24)}」还没定目标，先改回 TODO 了`, `🎯 Mainline task "${label.slice(0, 24)}" has no goal yet, so it went back to TODO`));
        return;
      }
      for (let tries = 0; tries < 3; tries++) {   // 正好你在打字、日记变了：重读一遍再写
        const base = await this.readJournal(file), lines = base.split("\n");
        const t = parseJournal(base, this.settings).find((i) => i.kind === "task" && workKey(i.label) === key);
        if (!t || goalUnder(lines, t.line)) return;
        lines.splice(t.line + 1, 0, T(`${/^\s*/.exec(lines[t.line])[0]}\t- 🎯 目标：${goal}`, `${/^\s*/.exec(lines[t.line])[0]}\t- 🎯 Goal: ${goal}`));
        if (await this.writeJournal(file, base, lines.join("\n"))) { this.sound("tick"); return; }
      }
    }).open();
  }
  // 近 7 天（到 date 为止）每天的主线完成情况，没定主线的日子不列
  mainHistory(date) {
    const cfg = this.settings, log = cfg.mainLog || {}, out = [];
    for (let i = 6; i >= 0; i--) {
      const d = date.clone().subtract(i, "days"), x = log[d.format(cfg.format)];
      if (x) out.push({ d, ...x });
    }
    return out;
  }

  // ---------------- macOS 小组件 ----------------
  // 配套的小组件 App（仓库的 widgets/）读 widgetDir() 里的 widgets.json：今天的主线（带目标）、今天在做的、计划笔记的甘特图。
  // 跟着 refreshCapacity 每分钟算一次、今天的日记改了也算；内容变了才写，写完用 nautilus-widgets://reload 叫小组件 App 在后台刷新（没装就什么也不发生）。
  // 小组件上点的「做完 / 撤回」走反方向：小组件写进 inbox/，widgetInbox 收了改日记
  widgetDir() { return require("path").join(require("os").homedir(), "Library/Application Support/Nautilus Spiral"); }
  async widgetTick() {
    const cfg = this.settings;
    if (!cfg.widgets) return;
    if (this.inboxSoon) this.inboxSoon();   // 收件箱兜底：文件夹监听漏了的，每分钟也看一眼
    const vault = encodeURIComponent(this.app.vault.getName()), today = this.today(), dayKey = today.format(cfg.format);
    // id = 那一行的块 ID，line = 那一行在第几行（待办用）：点的时候先按它们找，找不到再按名字找
    const enc = (x) => encodeURIComponent(String(x).toWellFormed());   // 笔记里偶尔有半个 emoji（孤立的代理字符），直接编码会抛错
    const link = (path, kind, text, id, line) => `obsidian://nautilus-open?vault=${vault}&note=${enc(path)}` + (text ? `&kind=${kind}&text=${enc(text)}` : "") + (id ? `&id=${id}` : "") + (line != null ? `&line=${line}` : "");
    const day = this.journalPath(today), jf = this.todayFile();
    let plan = this.app.vault.getAbstractFileByPath(cfg.widgetPlan);
    if (!plan && /\.md$/.test(cfg.widgetPlan) && this._planTried !== cfg.widgetPlan) plan = await this.createPlan(cfg.widgetPlan);
    const content = jf ? await this.app.vault.cachedRead(jf) : "", lines = content.split("\n");
    const M = this._main && jf ? mainOf(content) : this._main;   // 按这一份日记重算，行号才和下面补块 ID 的对得上
    const items = jf ? parseJournal(content, cfg) : [], doingItems = items.filter((i) => i.kind === "task" && i.state === "open" && i.doing);
    const ids = jf ? await this.widgetIds(jf, content, [...(M ? M.tasks : []), ...doingItems], items, dayKey) : new Map();
    const task = (t) => t && { label: t.label, state: t.state, goal: (goalUnder(lines, t.line) || {}).text || "", link: link(day, "main", t.label, ids.get(t.line)) };
    // 在做：今天日记里 DOING 的任务，从几点开始（计时记录里这一段的开头，没有就按行里写的时刻）
    const base = moment(dayKey, cfg.format).valueOf(), work = (cfg.workLog || {})[dayKey] || {}, A = new Set(M ? M.tasks.map((t) => t.line) : []);
    const doing = !jf ? null : doingItems.map((i) => {
      const seg = (work[workKey(i.label)] || []).find((x) => x[1] == null), m = seg ? seg[0] : i.startedAt;
      return { label: i.label, main: A.has(i.line), start: m != null ? base + m * 60e3 : null, link: link(day, "doing", i.label, ids.get(i.line)) };
    });
    // 待办：全库没做完的 TODO / LATER / 任务框，最近改过的笔记排前面；小组件最多显示十来条，这里给 30 条和总数
    const todos = (await this.todoScan()).flatMap(([path, v]) => v.tasks.map((t) => ({ path, ...t })));
    const todo = { total: todos.length, rows: todos.slice(0, 30).map((t) => ({ label: t.label, note: t.path.replace(/^.*\//, "").replace(/\.md$/, ""), ref: `${t.line}:${t.path}`, link: link(t.path, "todo", t.label, null, t.line) })) };
    const data = {
      today: today.format("YYYY-MM-DD"),
      journal: jf ? link(day) : null,
      main: M && {
        done: M.done, total: M.total, link: link(day), tasks: M.tasks.map(task), next: task(mainNext(M)),
        history: this.mainHistory(today.clone().subtract(1, "day")).map((x) => ({ date: x.d.format("YYYY-MM-DD"), done: x.done, total: x.total })),
      },
      doing,
      todo,
      planPath: cfg.widgetPlan,
      plan: plan instanceof TFile ? { title: plan.basename, link: link(plan.path), rows: ganttOf(await this.app.vault.cachedRead(plan)).map(({ line, ...r }) => ({ ...r, link: link(plan.path, "plan", r.label) })) } : null,
    };
    const text = JSON.stringify(data, (k, v) => (typeof v === "string" ? v.toWellFormed() : v));   // 半个 emoji 写进 JSON 是 \udXXX，小组件那边解不开整个文件
    const fs = require("fs"), path = require("path"), file = path.join(this.widgetDir(), "widgets.json");
    if (this._widgetText === undefined) this._widgetText = await fs.promises.readFile(file, "utf8").catch(() => "");   // 刚启动：和上次写的比，没变就不用叫 App
    if (text === this._widgetText) return;
    this._widgetText = text;   // 先记下：连着保存几次时，后到的那次不再重写、不再叫一遍
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, text);
    this.widgetReload();
  }
  // 叫小组件 App 刷新：3 秒内最多一次，连着保存时合并到最后一次（后台叫的刷新算 WidgetKit 每天的额度）
  widgetReload() {
    if (this._reloadT) return;
    const go = () => { this._reloadT = null; this._reloadAt = Date.now(); run("/usr/bin/open", ["-g", "nautilus-widgets://reload"]); };
    const wait = (this._reloadAt || 0) + 3000 - Date.now();
    if (wait <= 0) go(); else this._reloadT = window.setTimeout(go, wait);
  }
  // 计划笔记还没有：照模板新建一篇（文件夹没有就一起建）。同一个路径只试一次
  async createPlan(path) {
    this._planTried = path;
    try {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      return await this.app.vault.create(path, planTemplate(this.today()));
    } catch (e) { console.error("[螺旋日程] 新建计划笔记失败", e); return null; }
  }
  // 小组件上的一行带着它在日记里的块 ID，点的时候按 ID 找那一行（改了字、挪了位置也找得到）。没有的在行尾补一个 ^nw-xxxxxx。
  // 不补的照旧按名字找：光标正停在那一行（正在打字，行尾不能突然多出一截）、Agent Deck 记的行和带 🤖 的行（Agent Deck 按整行的字认自己的行，尾巴变了它会认不出）
  async widgetIds(file, content, rows, items, dayKey) {
    const all = content.split("\n"), ids = new Map(), v = this.journalView(file), cur = v ? v.editor.getCursor().line : -1;
    const auto = this.autoKeys(dayKey), agent = new Set(items.filter((i) => auto.has(workKey(i.label))).map((i) => i.line));
    let add = false;
    for (const { line } of rows) {
      const raw = all[line], m = raw != null && /\s\^([A-Za-z0-9-]+)\s*$/.exec(raw);
      if (m) { ids.set(line, m[1]); continue; }
      if (raw == null || line === cur || agent.has(line) || raw.includes("🤖")) continue;
      const id = "nw-" + Math.random().toString(36).slice(2, 8);
      all[line] = `${raw.replace(/\s+$/, "")} ^${id}`;
      ids.set(line, id);
      add = true;
    }
    if (add && !(await this.writeJournal(file, content, all.join("\n")))) return new Map();   // 日记刚被别处改了：这一轮先不带，下一轮再补
    return ids;
  }
  // 全库还没做完的任务，按笔记缓存：笔记的修改时间没变就不重读。返回 [[path, { mtime, tasks }]]，最近改过的在前
  async todoScan() {
    const fs = require("fs"), path = require("path");
    const cacheFile = path.join(this.localCacheDir(), "todo-idx-v1.json");
    if (!this._todoIdx) {
      this._todoIdx = new Map();
      try {
        const raw = JSON.parse(await fs.promises.readFile(cacheFile, "utf8"));
        if (raw && raw.v === 1 && Array.isArray(raw.entries)) {
          for (const [p, mtime, tasks] of raw.entries) this._todoIdx.set(p, { mtime, tasks: tasks || [] });
        }
      } catch { /* 首次或无缓存 */ }
    }
    const idx = this._todoIdx, seen = new Set();
    let dirty = false;
    for (const f of this.app.vault.getMarkdownFiles()) {
      seen.add(f.path);
      const c = idx.get(f.path);
      if (c && c.mtime === f.stat.mtime) continue;
      const meta = this.app.metadataCache.getFileCache(f);
      if (!meta) continue;   // 还没索引到：下一轮再看
      idx.set(f.path, { mtime: f.stat.mtime, tasks: meta.listItems ? openTasks(await this.app.vault.cachedRead(f)) : [] });
      dirty = true;
    }
    for (const k of [...idx.keys()]) if (!seen.has(k)) { idx.delete(k); dirty = true; }
    if (dirty && !this._todoSaving) {
      this._todoSaving = true;
      const payload = JSON.stringify({ v: 1, entries: [...idx].map(([p, v]) => [p, v.mtime, v.tasks]) });
      fs.promises.mkdir(path.dirname(cacheFile), { recursive: true })
        .then(() => fs.promises.writeFile(`${cacheFile}.tmp`, payload))
        .then(() => fs.promises.rename(`${cacheFile}.tmp`, cacheFile))
        .catch(() => {})
        .finally(() => { this._todoSaving = false; });
    }
    return [...idx].filter(([, v]) => v.tasks.length).sort((a, b) => b[1].mtime - a[1].mtime);
  }
  // 小组件的收件箱：小组件上点一下「做完 / 撤回」，它就往 inbox/ 里放一个文件。Obsidian 开着时马上处理，没开着的等下次打开
  // 不用定时器防抖：Obsidian 在后台时定时器会被压到很慢，点了要等好几秒。正在处理时又来了，处理完接着处理
  setupWidgetInbox() {
    const fs = require("fs"), dir = require("path").join(this.widgetDir(), "inbox");
    this.inboxSoon = () => {
      if (this._inboxBusy) { this._inboxAgain = true; return; }
      this.widgetInbox().catch((e) => console.error("[螺旋日程] 小组件收件箱", e));
    };
    try {
      fs.mkdirSync(dir, { recursive: true });
      const w = fs.watch(dir, () => this.inboxSoon());
      this.register(() => w.close());
    } catch (e) { console.error("[螺旋日程] 看不了小组件的收件箱", e); }
    this.app.workspace.onLayoutReady(() => this.inboxSoon());
  }
  async widgetInbox() {
    if (!this.settings.widgets || this._inboxBusy) return;
    const fs = require("fs"), path = require("path"), dir = path.join(this.widgetDir(), "inbox");
    let names = [];
    try { names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith(".json")).sort(); } catch (e) { return; }
    if (!names.length) return;
    this._inboxBusy = true;
    try {
      for (const n of names) {
        let cmd = null;
        try { cmd = JSON.parse(await fs.promises.readFile(path.join(dir, n), "utf8")); } catch (e) { continue; }   // 还没写完：下一轮再读
        await fs.promises.unlink(path.join(dir, n)).catch(() => {});
        try { await this.widgetApply(cmd); } catch (e) { console.error("[螺旋日程] 小组件上点的没改成", cmd, e); }
      }
    } finally {
      this._inboxBusy = false;
      if (this._inboxAgain) { this._inboxAgain = false; this.inboxSoon(); }
    }
    // 改完马上刷新一次；日记写盘要停手一两秒，再刷一次保证读到的是新的
    this._widgetText = "";
    this.refreshCapacity();
    window.setTimeout(() => this.refreshCapacity(), 2500);   // 内容和刚才写的一样就不再写
  }
  // cmd = { kind: main / doing / plan, text: 那一件的名字, done: true 改成做完 / false 撤回, day: 点的时候小组件上的「今天」 }
  async widgetApply(cmd) {
    const cfg = this.settings, now = this.today().format("YYYY-MM-DD");
    if (cmd.kind === "refresh") return;   // 小组件上的刷新按钮：收件箱处理完本来就会重算一遍、叫小组件刷新
    if (cmd.kind === "todo") {   // ref = 「行号:笔记路径」；那一行的名字对不上（笔记改过）就在这篇里按名字找
      const i = String(cmd.ref || "").indexOf(":"), f = this.app.vault.getAbstractFileByPath(String(cmd.ref).slice(i + 1));
      if (i < 0 || !(f instanceof TFile) || !cmd.done) return;
      const base = await this.app.vault.read(f), lines = base.split("\n"), list = openTasks(base);
      const same = (t) => t.label.toWellFormed() === cmd.text, hit = list.find((t) => t.line === +String(cmd.ref).slice(0, i) && same(t)) || list.find(same);
      if (!hit) return;
      lines[hit.line] = todoDone(lines[hit.line]);
      await this.writeJournal(f, base, lines.join("\n"));
      return;
    }
    if (cmd.kind === "plan") {
      const f = this.app.vault.getAbstractFileByPath(cfg.widgetPlan);
      if (!(f instanceof TFile)) return;
      const base = await this.readJournal(f), lines = base.split("\n"), r = ganttOf(base).find((x) => x.label === cmd.text);
      if (!r) return;
      lines[r.line] = planDone(lines[r.line], !!cmd.done, now);
      await this.writeJournal(f, base, lines.join("\n"));
      return;
    }
    const file = this.todayFile();
    if (!file || cmd.day !== now) return;   // 点的是前一天的画面（过了日期分界小组件还没刷新）：不改
    const base = await this.readJournal(file), lines = base.split("\n");
    const hit = cmd.kind === "main" ? mainOf(base).tasks.find((t) => t.label === cmd.text)
      : parseJournal(base, cfg).find((i) => i.kind === "task" && i.state === "open" && workKey(i.label) === workKey(cmd.text));
    if (!hit) return;
    const next = cmd.done ? markDone(lines[hit.line], moment().format("HH:mm")) : markUndone(lines[hit.line]);
    if (next === lines[hit.line]) return;
    lines[hit.line] = next;
    await this.writeJournal(file, base, lines.join("\n"));
  }

  async statusClick(ev) {
    if (!ev.altKey && !ev.shiftKey) return this.activate();
    const file = this.todayFile();
    if (!file) { new OB.Notice(T("今天还没有日记", "No daily note for today yet")); return; }
    let line = 0;
    if (this._statusKey) {
      const it = parseJournal(await this.app.vault.cachedRead(file), this.settings).find((i) => i.kind === "task" && i.state === "open" && workKey(i.label) === this._statusKey);
      if (it) line = it.line;
    } else { const nx = this._main && mainNext(this._main); if (nx) line = nx.line; }   // 没在计时：到下一件主线
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
    const dayKey = this.journalKey(file) || file.basename;
    const work = (this.settings.workLog || {})[dayKey] || {};
    const auto = this.autoKeys(dayKey);   // 自动记着的行由自动记日记自己写
    const base = await this.readJournal(file);
    let text = base;
    for (const k of keys) {
      const segs = auto.has(k) ? [] : (work[k] || []).filter((s) => s[1] != null);
      if (segs.length) text = this.autoClock(text, k, segs);
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

  // ---------------- 自动记进日记的行（现在由 Agent Deck 写） ----------------
  // 这一天由自动记日记管着的那些行：用时按会话在动的时段另记，不走「改成 DOING 就开始计时」那一套，也不受 DOING 上限和超时暂停管。
  // 写日记的是 Agent Deck，它的记录在自己的 settings.autoLogState 里，格式和螺旋原来的一样：{ 日记日: { 会话号: { key, label, status, … } } }
  autoKeys(dayKey) {
    const out = new Set();
    for (const r of Object.values(this.deckState(dayKey))) {
      if (!r?.key || r.skip || r.gone) continue;
      out.add(r.key);
      const cleaned = workKey(cleanLabel(r.key));
      if (cleaned) out.add(cleaned);
    }
    return out;
  }
  agentDeck() { return this.app?.plugins?.plugins?.["agent-deck"] || null; }

  deckState(dayKey) {
    const states = this.agentDeck()?.settings?.autoLogState;
    if (!states || !dayKey) return {};
    if (/^\d{4}_\d{2}_\d{2}$/.test(dayKey)) return states[dayKey] || {};
    const day = moment(dayKey, this.settings.format, true);
    return day.isValid() ? states[day.format("YYYY_MM_DD")] || {} : {};
  }

  deckJournalBindings(dayKey, filePath) {
    const deck = this.agentDeck();
    const valid = (rec) => rec && !rec.skip && !rec.gone && (!rec.path || rec.path === filePath);
    const bindings = new Map(Object.entries(this.deckState(dayKey)).filter(([, rec]) => valid(rec)));
    for (const [key, rec] of Object.entries(deck?.settings?.taskBindings || {})) {
      if (!valid(rec) || !rec.blockId) continue;
      let sid = rec.sid || key;
      if (!rec.sid && key.includes(":")) {
        const prefix = key.split(":")[1];
        if (!prefix) continue;
        const matches = [...(deck.usage?.meta?.keys() || [])].filter((id) => id.startsWith(prefix));
        if (matches.length !== 1) continue;
        sid = matches[0];
      }
      if (!bindings.has(sid)) bindings.set(sid, rec);
    }
    return bindings;
  }

  journalView(file) {
    if (!this.app?.workspace?.iterateAllLeaves) return null;
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

  // 实际做的时段写在那一行下面的第一个子项里（⏱ 开头，解析日记时跳过这种行）：⏱ 00:45–00:58、04:02–05:10 · 共 1h21m
  // 隔了不到 10 分钟的两段并成一段写，免得太碎；太多段只写最后 8 段
  autoClock(text, key, segs) {
    let merged = unionSegs(segs || []);
    const hits = parseJournal(text, this.settings).filter((i) => i.kind === "task" && workKey(i.label) === key);
    const it = hits.find((i) => i.state === "open") || hits[0];
    if (!it || !merged.length) return text;
    if (it.clock && !it.clock.partial && !it.clock.who && !/←\s*\S+\s*$/.test(it.label)) {
      const extra = (it.clock.segs || []).filter(([ea, eb]) => merged.every(([a, b]) => eb <= a || ea >= b));
      if (extra.length) merged = unionSegs([...merged, ...extra]);
    }
    const lines = text.split("\n");
    const at = it.line;
    const shown = [];
    for (const [a, b] of merged) { const last = shown[shown.length - 1]; if (last && a - last[1] <= 10) last[1] = Math.max(last[1], b); else shown.push([a, b]); }
    const total = Math.round(merged.reduce((n, [a, b]) => n + b - a, 0));
    const indent = /^\s*/.exec(lines[at])[0] + "\t";
    const line = T(`${indent}- ⏱ ${shown.length > 8 ? "… " : ""}${shown.slice(-8).map(([a, b]) => `${clock(a)}–${clock(b)}`).join("、")} · 共 ${durTag(total)}`, `${indent}- ⏱ ${shown.length > 8 ? "… " : ""}${shown.slice(-8).map(([a, b]) => `${clock(a)}–${clock(b)}`).join(", ")} · total ${durTag(total)}`);
    const base = /^\s*/.exec(lines[at])[0].replace(/\t/g, "    ").length;
    for (let i = at + 1; i < lines.length; i++) {
      if (lines[i].trim() && /^\s*/.exec(lines[i])[0].replace(/\t/g, "    ").length <= base) break;
      if (/^\s*[-*+]\s+⏱/.test(lines[i])) { if (lines[i] === line) return text; lines[i] = line; return lines.join("\n"); }
    }
    lines.splice(at + 1, 0, line);
    return lines.join("\n");
  }

  views() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v) => v instanceof SpiralView);
  }


  // 「今天」的日记：凌晨 dayCutoff 点前还算前一天
  journalDayCutoff() { return journalDayCutoff(this.settings); }

  today() {
    const m = moment();
    const cutoff = this.journalDayCutoff();
    if (m.hours() * 60 + m.minutes() < cutoff * 60) m.subtract(1, "day");
    return m.startOf("day");
  }

  journalPath(m) {
    return joinFolder(this.settings.folder, `${m.format(this.settings.format)}.md`);
  }

  journalKey(file) {
    const prefix = this.settings.folder ? this.settings.folder + "/" : "";
    return file.path?.startsWith(prefix) ? file.path.slice(prefix.length, -3) : "";
  }

  // 日记目录 / 文件名格式：没手填就自动检测（规则见文件开头的 detectJournal）。
  // 认出来的直接写进设置，其余几百处读 settings.folder / settings.format 的地方都不用改
  journalDetect() {
    const cfg = this.settings;
    if (cfg.journalAuto === false) return { folder: cfg.folder, format: cfg.format, from: T("手动设置", "Set manually") };
    const det = detectJournal(this.app, cfg);
    if (det.folder !== cfg.folder || det.format !== cfg.format) {
      cfg.folder = det.folder;
      cfg.format = det.format;
      this.saveSoon();
    }
    return det;
  }

  // 新建一篇日记时的开头：两行属性，其余交给日记模板/别的插件
  journalSeed(d) {
    return T(`---\njournal: 每日\njournal-date: ${d.format("YYYY-MM-DD")}\n---\n`, `---\njournal: Daily\njournal-date: ${d.format("YYYY-MM-DD")}\n---\n`);
  }

  // 今天的日记被删了或者还没建：面板刷着的时候顺手补一篇回来（不在后台无声建文件）
  async ensureToday() {
    if (this._ensuringToday || !this.views().length) return;
    const path = this.journalPath(this.today());
    if (this.app.vault.getAbstractFileByPath(path)) return;
    this._ensuringToday = true;
    try {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      await this.app.vault.create(path, this.journalSeed(this.today()));
    } catch (e) { console.error("[螺旋日程] 新建今天的日记失败", e); } finally { this._ensuringToday = false; }
  }

  async activate(focus = true, forceLeft = false) {
    const leftSplit = this.app.workspace.leftSplit;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    let leaf = leaves.find((l) => !leftSplit || l.getRoot?.() === leftSplit) || leaves[0];
    if (forceLeft && leaf && leftSplit && leaf.getRoot?.() !== leftSplit) {
      leaf.detach();
      leaf = null;
    }
    if (!leaf) {
      leaf = this.app.workspace.getLeftLeaf(false) || this.app.workspace.getLeftLeaf(true);
      if (!leaf) return null;
      await leaf.setViewState({ type: VIEW_TYPE, active: focus });
    }
    if (leftSplit?.collapsed) leftSplit.expand();
    if (focus) this.app.workspace.revealLeaf(leaf);
    else {
      // 只把左侧栏展开、切到螺旋日程这个标签，焦点留在日记上
      const group = leaf.parent;
      if (group && typeof group.selectTab === "function") group.selectTab(leaf);
      else this.app.workspace.revealLeaf(leaf);
    }
    return leaf;
  }

  // 打开「今天」的日记：在当前页打开（替换当前页，不新开标签）；当前页是钉住的才开新标签；没有就建一篇。
  // 启动时（reuse）已经有标签开着它就切过去，免得恢复工作区后多出一个一样的标签
  async openToday(reuse = false) {
    const d = this.today();
    const path = this.journalPath(d);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      file = await this.app.vault.create(path, this.journalSeed(d));
    }
    let open = null;
    if (reuse) this.app.workspace.iterateRootLeaves((l) => { if (!open && l.view?.file?.path === path) open = l; });
    const cur = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const target = open || (cur && !cur.getViewState().pinned ? cur : this.app.workspace.getLeaf("tab"));
    if (target.view?.file?.path !== path) await target.openFile(file);
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }

  async onFileChange(f) {
    if (!(f instanceof TFile) || !inJournalDir(f.path, this.settings.folder)) return;
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
    for (const i of items) if (i.kind === "task") cur.set(i.label, { state: i.state, doing: i.doing && i.state === "open", agentKw: i.agentKw, startedAt: i.startedAt, doneAt: i.doneAt, dur: i.dur });
    const prev = this.states.get(file.path);
    this.states.set(file.path, cur);
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), this.settings);
    const dayKey = this.journalKey(file) || file.basename;
    const isToday = dayKey === this.today().format(this.settings.format);
    let changed = false;

    if (isToday) {
      const auto = this.autoKeys(dayKey);   // 自动记录管着的行：用时按会话在动的时段另记，这里不给它开计时
      const log = (this.settings.workLog ||= {});
      const work = (log[dayKey] ||= {});
      const openSeg = (k) => (work[k] || []).find((x) => x[1] == null);
      const hasClockKeys = new Set();
      for (const i of items) if (i.kind === "task" && i.clock && !i.clock.who && !/←\s*\S+\s*$/.test(i.label)) hasClockKeys.add(workKey(i.label));
      const closed = new Set();   // 这一回收掉了哪几件的时段
      const forceClock = new Set();
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
        for (const [label, c] of cur) {
          const k = workKey(label);
          const modalHold = this._pomoModalTask && this._pomoModalTask.dayKey === dayKey && this._pomoModalTask.key === k;
          if (c.doing && !modalHold && !openSeg(k) && !auto.has(k)) { (work[k] ||= []).push([c.startedAt ?? now, null]); changed = true; }
        }
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
        if (renamed && this.settings.pomodoro?.active?.dayKey === dayKey && this.settings.pomodoro.active.task?.key === renamed[0]) {
          this.settings.pomodoro.active.task.key = renamed[1];
          this.settings.pomodoro.active.task.label = renamed[1];
          changed = true;
        }
        for (const [label, c] of cur) {
          const k = workKey(label), p = prev.get(label);
          const modalHold = this._pomoModalTask && this._pomoModalTask.dayKey === dayKey && this._pomoModalTask.key === k;
          if (c.doing && !modalHold && !openSeg(k) && !auto.has(k) && !(renamed && renamed[1] === k && work[k])) { (work[k] ||= []).push([c.startedAt ?? now, null]); changed = true; }
          if (c.doing && c.startedAt != null && openSeg(k) && openSeg(k)[0] !== c.startedAt && (!p || p.startedAt !== c.startedAt)) { openSeg(k)[0] = c.startedAt; changed = true; }
          if (!c.doing && p && p.doing) stop(k, c.state === "done" && c.doneAt != null ? c.doneAt : now);
        }
        // 进行中的任务行没了（删了 / 挪去明天）：收掉。隔了 6 小时以上多半是睡了一觉才挪的，按预估时长封顶
        if (!renamed) for (const l of gone) {
          const k = workKey(l), seg = openSeg(k);
          if (seg) stop(k, now - seg[0] > 360 ? seg[0] + prev.get(l).dur : now);
        }
      }
      const activePomo = this.settings.pomodoro?.active;
      if (activePomo && activePomo.dayKey === dayKey && activePomo.task?.key) {
        const liveView = typeof this.journalView === "function" ? this.journalView(file) : null;
        const liveItems = liveView?.editor ? parseJournal(liveView.editor.getValue(), this.settings) : null;
        const stillDoing = [...cur].some(([l, c]) => c.doing && workKey(l) === activePomo.task.key)
          || (liveItems ? liveItems.some((i) => i.kind === "task" && i.state === "open" && i.doing && workKey(i.label) === activePomo.task.key) : false);
        if (!stillDoing) {
          this.settings.pomodoro.active = null;
          changed = true;
          const pk = activePomo.task.key;
          const endMs = Math.min(Date.now(), activePomo.end);
          if (endMs - activePomo.start >= 60e3 && !String(pk).startsWith(AUTO_MARK.trim()) && !auto.has(pk)) {
            const r = pomoTimeRange({ start: activePomo.start, end: endMs }, this.settings);
            if (r) {
              const segStart = Math.round(r[0]), segEnd = Math.max(segStart + 1, Math.round(r[1]));
              const segs = (work[pk] ||= []);
              const open = segs.find((s) => s[1] == null);
              if (open) open[1] = Math.max(open[0] + 1, segEnd);
              else segs.push([segStart, segEnd]);
              work[pk] = unionSegs(segs.filter((s) => s[1] != null));
              if (work[pk].length) forceClock.add(pk);
            }
          }
        }
      }
      const clockKeys = new Set();
      if (record) {
        for (const k of closed) if (this.settings.clockToNote || hasClockKeys.has(k)) clockKeys.add(k);
        for (const k of forceClock) clockKeys.add(k);
      }
      if (clockKeys.size) this.queueClock(file, [...clockKeys]);
      if (!Object.keys(work).length) delete log[dayKey];
    }

    if (record && prev) {
      const day = (this.settings.doneTimes[dayKey] ||= {});
      for (const [label, c] of cur) {
        if (c.state === "done" && prev.get(label)?.state === "open" && day[label] == null) { day[label] = c.doneAt != null ? c.doneAt : now; changed = true; }
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
    if (!prev) return;
    const changes = this.kwFresh(file.path, kwChanges(prev, cur));
    if (changes.length && changes.length <= 3) this.kwSound(kwCue(changes));
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
      if (!changes.length || lines > 3) return;
      const info = u.state.field(OB.editorInfoField, false);
      const fresh = this.kwFresh(info && info.file ? info.file.path : "", changes);
      if (fresh.length) this.kwSound(kwCue(fresh));
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

  // 主线块第一行下面一条能拖的进度条：块里每件 A 级任务一条，松手把百分比写进那一行（已经写了 40%、1/3 这类的就换掉）。
  // 只在日记里画；做完了的那件显示「✓ 做完了」。拖的时候只动这一条，松手才改日记
  mainSliderExtension() {
    const { ViewPlugin, Decoration, WidgetType } = require("@codemirror/view");
    const { RangeSetBuilder } = require("@codemirror/state");
    const plugin = this;
    const isJournal = (view) => {
      const info = view.state.field(OB.editorInfoField, false), f = info && info.file, cfg = plugin.settings;
      return !!f && inJournalDir(f.path, cfg.folder) && moment(f.basename, cfg.format, true).isValid();
    };
    // 松手：按这件任务的名字重新找到它那一行（拖的时候日记可能被别处改过），把进度写进去
    const commit = (view, label, pct) => {
      const doc = view.state.doc, t = mainOf(doc.toString()).tasks.find((x) => x.label === label);
      if (!t) return;
      const line = doc.line(t.line + 1), next = withProgress(line.text, pct);
      if (next === line.text) return;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
      plugin.sound("tick");
    };
    class SliderWidget extends WidgetType {
      constructor(rows) { super(); this.rows = rows; this.sig = JSON.stringify(rows); }
      eq(other) { return other.sig === this.sig; }
      toDOM(view) {
        const doc = view.dom.ownerDocument, el = doc.createElement("div");
        el.className = "naut-main-slider";
        for (const r of this.rows) {
          const row = el.appendChild(doc.createElement("div"));
          row.className = "naut-ms-row" + (r.done ? " is-done" : "");
          if (this.rows.length > 1) { const n = row.appendChild(doc.createElement("span")); n.className = "naut-ms-name"; n.textContent = r.label; }
          if (r.done) { const d = row.appendChild(doc.createElement("span")); d.className = "naut-ms-done"; d.textContent = T("✓ 做完了", "✓ Done"); continue; }
          const input = row.appendChild(doc.createElement("input"));
          Object.assign(input, { type: "range", min: "0", max: "100", step: "5", value: String(r.pct), className: "naut-ms-range" });
          input.setAttribute("aria-label", T(`「${r.label}」的进度`, `Progress of "${r.label}"`));
          const out = row.appendChild(doc.createElement("span"));
          out.className = "naut-ms-val";
          const show = () => { out.textContent = `${input.value}%`; input.style.setProperty("--v", `${input.value}%`); };
          show();
          input.addEventListener("input", show);
          input.addEventListener("change", () => commit(view, r.label, +input.value));
        }
        return el;
      }
      ignoreEvent() { return true; }
    }
    const mainDocCache = new WeakMap();
    const build = (view) => {
      const b = new RangeSetBuilder();
      if (plugin.settings.showMain === false || !isJournal(view)) return b.finish();
      const doc = view.state.doc;
      let parsed = mainDocCache.get(doc);
      if (!parsed) {
        const text = doc.toString();
        parsed = text.includes("#A") || /\b(?:TODO|DOING|DONE|LATER|NOW|WAITING|WAIT|HOLD|PAUSED)\s+a\b/i.test(text)
          ? mainOf(text)
          : { blocks: [] };
        mainDocCache.set(doc, parsed);
      }
      for (const blk of parsed.blocks) {
        const rows = blk.tasks.map((t) => ({ label: t.label, done: t.state === "done", pct: Math.round((parseProgress(doc.line(t.line + 1).text) ?? 0) * 20) * 5 }));
        const top = doc.line(blk.line + 1);   // 挂在主线块第一行下面，不放到整块（子块）的末尾
        b.add(top.to, top.to, Decoration.widget({ widget: new SliderWidget(rows), side: 1 }));
      }
      return b.finish();
    };
    return ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = build(view); }
      update(u) { if (u.docChanged) this.decorations = build(u.view); }
    }, { decorations: (v) => v.decorations });
  }
  // 进度行上点开会话：Agent Deck 开着就交给它（命令行会话切到跑它的终端标签，桌面版的走各家深链接）；没有才自己开 Claude 桌面版
  openAgentSession(sid, agent = "claude") {
    const deck = this.agentDeck();
    if (deck && typeof deck.openSessionBySid === "function") return deck.openSessionBySid(sid, agent);
    if (agent === "claude") this.openSession(sid);
  }
  // 在 Claude 桌面版里打开一个会话（claude://resume 深链接：桌面版里没有的会先导入）
  openSession(sid) {
    if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) return;
    require("child_process").execFile("/usr/bin/open", [`claude://resume?session=${sid}`], (e) => { if (e) new OB.Notice(T("打不开 Claude 会话：", "Can't open the Claude session: ") + e.message); });
  }

  // 界面上的小音效（设置里可以关）。Obsidian 不在最前面时不响：那时候日记多半是别的东西在改
  sound(name) {
    if (this.settings.uiSound !== false && document.hasFocus()) blip(name);
  }
  // 任务状态切换的音效。装着 Logseq Style Tasks（TODOseq 的 fork，自带同一套状态音效）时归它放，这里不响，免得一次切换响两遍
  kwSound(name) {
    if (this.app.plugins?.enabledPlugins?.has("logseq-style-tasks")) return;
    this.sound(name);
  }

  // ---- 轻量化番茄钟 ----
  ensurePomodoro() {
    const cfg = this.settings;
    if (!cfg.pomodoro || typeof cfg.pomodoro !== "object") cfg.pomodoro = { preset: "25", customMinutes: 45, active: null };
    if (!["15", "25", "custom"].includes(cfg.pomodoro.preset)) cfg.pomodoro.preset = "25";
    const cm = Number(cfg.pomodoro.customMinutes);
    cfg.pomodoro.customMinutes = Number.isFinite(cm) ? Math.min(240, Math.max(1, Math.round(cm))) : 45;
    if (!cfg.pomodoroHistory || typeof cfg.pomodoroHistory !== "object") cfg.pomodoroHistory = {};
    return cfg.pomodoro;
  }

  async setPomodoroPreset(preset) {
    const p = this.ensurePomodoro();
    p.preset = ["15", "25", "custom"].includes(preset) ? preset : "25";
    await this.saveData(this.settings);
    this.refresh();
  }

  async setPomodoroCustom(val) {
    const p = this.ensurePomodoro();
    const n = Math.min(240, Math.max(1, Math.round(Number(val) || p.customMinutes || 45)));
    p.customMinutes = n;
    await this.saveData(this.settings);
  }

  async activeDoingTaskRef(dayKey) {
    if (!this.app?.vault || typeof this.journalPath !== "function") return null;
    const file = this.app.vault.getAbstractFileByPath(this.journalPath(this.today()));
    if (!(file instanceof TFile)) return null;
    const content = await this.readLiveContent(file);
    const auto = this.autoKeys(dayKey);
    const work = (this.settings.workLog || {})[dayKey] || {};
    const seen = new Set();
    const candidates = [];
    for (const item of parseJournal(content, this.settings)) {
      if (item.kind !== "task" || item.state !== "open" || !item.doing || isAutoTask(item, auto)) continue;
      const label = item.inheritedFrom != null ? (item.inheritedLabel || workKey(item.label)) : workKey(item.label);
      const key = workKey(label);
      if (!key || seen.has(key) || auto.has(key)) continue;
      seen.add(key);
      const openStart = ((work[key] || []).find((s) => s[1] == null) || [])[0];
      candidates.push({ path: file.path, key, label, openStart: openStart ?? -1 });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.openStart - a.openStart);
    const { path, key, label } = candidates[0];
    return { path, key, label };
  }

  async recordPomodoroWork(active, endMs) {
    if (!active?.task?.key || !Number.isFinite(active.start) || !Number.isFinite(endMs)) return false;
    if (endMs - active.start < 60e3) return false;
    if (String(active.task.key).startsWith(AUTO_MARK.trim()) || this.autoKeys(active.dayKey).has(active.task.key)) return false;
    const r = pomoTimeRange({ start: active.start, end: endMs }, this.settings);
    if (!r) return false;
    const segStart = Math.round(r[0]);
    const segEnd = Math.max(segStart + 1, Math.round(r[1]));
    const log = (this.settings.workLog ||= {});
    const work = (log[active.dayKey] ||= {});
    const segs = (work[active.task.key] ||= []);
    const open = segs.find((s) => s[1] == null);
    if (open) open[1] = Math.max(open[0] + 1, segEnd);
    else segs.push([segStart, segEnd]);
    const closed = unionSegs(segs.filter((s) => s[1] != null));
    work[active.task.key] = closed;
    if (closed.length && active.task.path && this.app?.vault) {
      const file = this.app.vault.getAbstractFileByPath(active.task.path);
      if (file instanceof TFile) {
        await this.editFile(file, (lines) => {
          const base = lines.join("\n");
          const next = this.autoClock(base, active.task.key, closed);
          if (next === base) return 0;
          lines.splice(0, lines.length, ...next.split("\n"));
          return 1;
        });
      }
    }
    return true;
  }

  async startPomodoro(minutes = null, taskSpec = null) {
    const p = this.ensurePomodoro();
    const mins = minutes != null ? Math.min(240, Math.max(1, Math.round(Number(minutes) || 25))) : pomoMinutes(p);
    const dayKey = this.today().format(this.settings.format);
    let nextKey = null;
    if (taskSpec?.ref) nextKey = taskSpec.ref.key;
    else if (taskSpec?.file && taskSpec?.item) {
      const label = taskSpec.item.inheritedFrom != null ? (taskSpec.item.inheritedLabel || workKey(taskSpec.item.label)) : workKey(taskSpec.item.label);
      nextKey = workKey(label);
    }
    if (p.active) {
      const prevActive = p.active;
      await this.stopPomodoro(false, { ask: false, silent: true });
      if (prevActive.task?.key && prevActive.task.key !== nextKey) {
        const paused = await this.pausePomodoroTask(prevActive.task);
        if (!paused) this.refresh();
      }
    }
    let taskRef = null;
    let switchedDoing = false;
    if (taskSpec?.ref) {
      taskRef = { ...taskSpec.ref };
    } else if (taskSpec?.file && taskSpec?.item) {
      const { file, item } = taskSpec;
      const targetLine = item.inheritedFrom != null ? item.inheritedFrom : item.line;
      const label = item.inheritedFrom != null ? (item.inheritedLabel || workKey(item.label)) : workKey(item.label);
      taskRef = { path: file.path, key: workKey(label), label };
      if (targetLine != null && canonKw(item.kw) !== "DOING") {
        let nextRaw = null;
        const n = await this.editFile(file, (lines) => {
          let ln = targetLine;
          const parsed = parseJournal(lines.join("\n"), this.settings).filter((t) => t.kind === "task" && t.state !== "done" && workKey(t.inheritedFrom != null ? (t.inheritedLabel || t.label) : t.label) === taskRef.key);
          if (parsed.length) {
            const exact = parsed.find((t) => (t.inheritedFrom != null ? t.inheritedFrom : t.line) === ln);
            const pick = exact || parsed[0];
            ln = pick.inheritedFrom != null ? pick.inheritedFrom : pick.line;
          }
          const cur = lines[ln];
          if (cur == null) return 0;
          const next = toKeyword(cur, "DOING");
          if (next === cur) return 0;
          lines[ln] = next;
          nextRaw = next;
          return 1;
        });
        if (n && nextRaw != null) {
          switchedDoing = true;
          const hit = kwLine(nextRaw);
          if (hit && this.kwFresh(file.path, [hit]).length) this.kwSound("DOING");
        }
      }
    } else if (taskSpec == null) {
      taskRef = await this.activeDoingTaskRef(dayKey);
    }
    const nowMs = Date.now();
    p.active = { id: nowMs, dayKey, start: nowMs, end: nowMs + mins * 60e3, minutes: mins, task: taskRef };
    await this.saveData(this.settings);
    if (!switchedDoing) this.sound("play");
    this.refresh();
    return p.active;
  }

  async startPomodoroAtCursor(editor, view) {
    const file = view?.file;
    const todayPath = this.journalPath(this.today());
    if (!(file instanceof TFile) || file.path !== todayPath) {
      new OB.Notice(T("请在今天的日记任务行上使用", "Use this on a task line in today's daily note"));
      return null;
    }
    const line = editor.getCursor().line;
    const dayKey = this.today().format(this.settings.format);
    const item = parseJournal(editor.getValue(), this.settings).find((i) => i.kind === "task" && i.line === line);
    if (!item || item.state === "done" || isAutoTask(item, this.autoKeys(dayKey))) {
      new OB.Notice(T("当前行不是可计时的手动未完成任务", "Current line is not an open manual task"));
      return null;
    }
    return this.startPomodoro(null, { file, dayKey, item });
  }

  async resumePomodoroDoing(taskRef, dayKey = this.today().format(this.settings.format)) {
    if (!taskRef?.key || String(taskRef.key).startsWith(AUTO_MARK.trim()) || this.autoKeys(dayKey).has(taskRef.key)) return false;
    const work = ((this.settings.workLog ||= {})[dayKey] ||= {});
    const segs = (work[taskRef.key] ||= []);
    if (segs.some((s) => s[1] == null)) return false;
    const d = new Date();
    const nowMin = normalize(d.getHours() * 60 + d.getMinutes(), this.settings);
    segs.push([nowMin, null]);
    await this.saveData(this.settings);
    this.refresh();
    return true;
  }

  async stopPomodoro(completed = false, { ask = false, silent = false } = {}) {
    const p = this.ensurePomodoro();
    const a = p.active;
    if (!a) return null;
    p.active = null;
    const endMs = completed ? a.end : Math.min(Date.now(), a.end);
    const elapsedMin = Math.max(0, Math.floor((endMs - a.start) / 60e3));
    if (completed) {
      const list = (this.settings.pomodoroHistory[a.dayKey] ||= []);
      list.push({ start: a.start, end: a.end, minutes: a.minutes, label: a.task?.label || "" });
    }
    const willAsk = (completed || ask) && Boolean(a.task) && Boolean(this.app);
    if (willAsk) this._pomoModalTask = { dayKey: a.dayKey, key: a.task.key };
    const logged = a.task ? await this.recordPomodoroWork(a, endMs) : false;
    a._logged = logged;
    await this.saveData(this.settings);
    if (!silent) this.sound(completed ? "DONE" : "stop");
    if (!silent) this.refresh();
    if (!completed && ask && a.task && this.app) {
      new PomodoroDoneModal(this.app, this, a, { early: true, elapsedMin, logged }).open();
    }
    return a;
  }

  tickPomodoro() {
    const p = this.ensurePomodoro();
    const a = p.active;
    if (!a || this._pomoCompleting === a.id) return;
    if (Date.now() >= a.end) {
      this._pomoCompleting = a.id;
      this.completePomodoro(a).finally(() => { if (this._pomoCompleting === a.id) this._pomoCompleting = null; });
    }
  }

  async completePomodoro(active) {
    const done = await this.stopPomodoro(true);
    if (!done) return;
    if (!done.task) this._pomoModalTask = null;
    new OB.Notice(T(`🍅 番茄钟完成（${dur(done.minutes)}）${done.task ? ` · ${done.task.label}` : ""}`, `🍅 Pomodoro done (${dur(done.minutes)})${done.task ? ` · ${done.task.label}` : ""}`), 8000);
    new PomodoroDoneModal(this.app, this, done, { logged: done._logged }).open();
  }

  async setPomodoroTaskKeyword(taskRef, kw) {
    if (!taskRef?.path || !taskRef?.key) return false;
    const file = this.app?.vault?.getAbstractFileByPath(taskRef.path);
    if (!(file instanceof TFile)) return false;
    const content = await this.readLiveContent(file);
    const hit = parseJournal(content, this.settings).find((t) => t.kind === "task" && t.state !== "done" && workKey(t.inheritedFrom != null ? (t.inheritedLabel || t.label) : t.label) === taskRef.key);
    if (!hit || hit.line == null) return false;
    const targetLine = hit.inheritedFrom != null ? hit.inheritedFrom : hit.line;
    const hasClock = !!hit.clock;
    let nextRaw = null;
    const n = await this.editFile(file, (lines) => {
      const cur = lines[targetLine];
      if (cur == null) return 0;
      let next = toKeyword(cur, kw);
      if (kw === "DONE" && hasClock) {
        const sp = splitTask(cur);
        if (sp) next = `${sp.prefix}DONE ${moment().format("HH:mm")} ${sp.rest}`;
      }
      if (next === cur) return 0;
      lines[targetLine] = next;
      nextRaw = next;
      return 1;
    });
    if (n && nextRaw != null) {
      const parsed = kwLine(nextRaw);
      if (parsed && this.kwFresh(file.path, [parsed]).length) this.kwSound(kw);
      this.refresh();
      return true;
    }
    return false;
  }

  async completePomodoroTask(taskRef) { return this.setPomodoroTaskKeyword(taskRef, "DONE"); }
  async pausePomodoroTask(taskRef) { return this.setPomodoroTaskKeyword(taskRef, "PAUSED"); }

  async openPomodoroTask(taskRef) {
    if (!taskRef?.path) return;
    const file = this.app.vault.getAbstractFileByPath(taskRef.path);
    if (!(file instanceof TFile)) return;
    const content = await this.readLiveContent(file);
    const hit = parseJournal(content, this.settings).find((t) => t.kind === "task" && workKey(t.label) === taskRef.key);
    await this.openLine(file, hit ? hit.line : 0);
  }

  // 按天记的几份记录：完成时间、计时、番茄钟历史留 45 天，主线完成率留 90 天
  pruneLogs() {
    const cfg = this.settings;
    for (const [store, days] of [[cfg.doneTimes, 45], [(cfg.workLog ||= {}), 45], [(cfg.pomodoroHistory ||= {}), 45], [(cfg.mainLog ||= {}), 90]]) {
      const cutoff = moment().subtract(days, "days");
      for (const k of Object.keys(store)) {
        const d = moment(k, cfg.format, true);
        if (!d.isValid() || d.isBefore(cutoff) || !Object.keys(store[k]).length) delete store[k];
      }
    }
  }

  async openLine(file, line) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line } });
  }

  // 改过的颜色挂成 body 上的 --naut-c-xxx，styles.css 从这儿取；没改过的去掉，退回 CSS 里的默认值
  applyColors(doc = document) {
    for (const k in COLORS) {
      const v = (this.settings.colors || {})[k];
      if (v) doc.body.style.setProperty(`--naut-c-${k}`, v); else doc.body.style.removeProperty(`--naut-c-${k}`);
    }
  }

  onunload() {
    window.clearTimeout(this._reloadT);
    window.clearTimeout(this._widgetBootT);
    window.clearTimeout(this._nqTimer);
    window.clearTimeout(this._clockTimer);
    document.querySelectorAll(".naut-dot-tip").forEach((el) => el.remove());
    if (this._ai) this.saveAiCacheSync(this._ai);
    for (const k in COLORS) document.body.style.removeProperty(`--naut-c-${k}`);
  }
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
    num(T("一天从几点开始", "Day starts at"), T("螺旋的起点（0–23）", "Where the spiral begins (0–23)"), "dayStart", 0, 23);
    num(T("一天到几点结束", "Day ends at"), T("螺旋和排程到几点为止，超过 24 表示次日凌晨，比如 32 = 次日早上 8 点", "Where the spiral and the schedule stop. Over 24 means after midnight, e.g. 32 = 8 AM the next day"), "dayEnd", 12, 36);
    // 日期分界按 24 小时制的时刻填。别的插件（日记整理、块去向、任务提醒…）的「今天」都读这一项
    new Setting(containerEl).setName(T("日记日期分界", "Daily note cutoff")).setDesc(T("这个时刻之前还算前一天的日记。按 24 小时制写：08:00、4:30、23:30 都行，只写一个数也行（8 = 08:00）。日记整理、块去向、任务提醒这些配套插件算「今天是哪一篇日记」时都跟着这一项", "Before this time it still counts as the previous day's note. Use 24-hour time: 08:00, 4:30 and 23:30 all work, or just a number (8 = 08:00). The companion plugins (journal cleanup, block routing, task reminders) follow this setting when working out which note is today's"))
      .addText((t) => {
        t.setPlaceholder("08:00").setValue(fmtHourClock(s.dayCutoff ?? 8)).onChange(async (v) => {
          const h = parseHourClock(v);
          t.inputEl.toggleClass("naut-bad-input", h == null);
          if (h == null) return;
          if (s.dayCutoff === h) return;
          s.dayCutoff = h;
          await this.plugin.saveData(s);
          this.plugin.app.workspace.trigger("nautilus-spiral:day-cutoff-changed");
          this.plugin.refresh();
        });
        // 离开输入框时写成统一的样子（8 → 08:00）；填得不对就退回现在的值
        t.inputEl.addEventListener("blur", () => { t.inputEl.removeClass("naut-bad-input"); t.setValue(fmtHourClock(s.dayCutoff ?? 8)); });
      });
    num(T("默认任务时长（分钟）", "Default task length (minutes)"), T("没写时长的任务按这个算", "Used for tasks without a duration"), "defaultDur", 1, 240);
    const text = (name, desc, key) => new Setting(containerEl).setName(name).setDesc(desc).addText((t) => t
      .setValue(s[key])
      .onChange(async (v) => { s[key] = v.trim(); await this.plugin.saveData(s); this.plugin.refresh(); }));
    // 日记在哪：不手填就自动检测（核心「日记」插件 → Periodic Notes → 翻库猜）
    const det = this.plugin.journalDetect();
    const auto = s.journalAuto !== false;
    new Setting(containerEl).setName(T("自动找今天的日记", "Find today's daily note automatically"))
      .setDesc(T(`按 Obsidian 的「日记」插件（或 Periodic Notes）的设置找；都没装就翻一遍库，认出日期命名的文件最多、最近还在写的那一处。现在认到：${det.folder ? det.folder + "/" : "库根目录"}、${det.format}（${det.from}）`, `Follows Obsidian's Daily notes (or Periodic Notes) settings; if neither is installed it scans the vault for the commonest date-named pattern that is still being written. Now: ${det.folder ? det.folder + "/" : "vault root"}, ${det.format} (${det.from})`))
      .addToggle((t) => t.setValue(auto).onChange(async (v) => {
        s.journalAuto = v;
        if (v) { const d2 = this.plugin.journalDetect(); s.folder = d2.folder; s.format = d2.format; }
        await this.plugin.saveData(s);
        this.plugin.refresh();
        this.display();
      }));
    const jt = (name, desc, key) => new Setting(containerEl).setName(name).setDesc(desc).addText((t) => t
      .setValue(s[key])
      .onChange(async (v) => { s[key] = v.trim(); s.journalAuto = false; await this.plugin.saveData(s); this.plugin.refresh(); this.display(); }));
    jt(T("日记文件夹", "Daily note folder"), T("填了就不再自动认；空着 = 库根目录", "Filled in = stop auto-detecting; empty = vault root"), "folder");
    jt(T("日记文件名格式", "Daily note file name format"), T("moment.js 格式，例如 YYYY-MM-DD。填了就不再自动认", "moment.js format, e.g. YYYY-MM-DD. Filling it in turns auto-detect off"), "format");
    text(T("重要标记", "Important markers"), T("任务里含有这些文字就标成红色，用逗号分隔", "Tasks containing any of these are shown in red; separate with commas"), "priorityMarkers");
    new Setting(containerEl).setName(T("DOING 并行排", "Run DOING tasks in parallel")).setDesc(T("几件 DOING 一起从现在开始，重叠在同一段时间里，只占最长那件的时间；关掉就首尾相接", "Several DOING tasks all start now and overlap, taking only as long as the longest one; turn off to place them back to back"))
      .addToggle((t) => t.setValue(s.parallelDoing !== false).onChange(async (v) => { s.parallelDoing = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    num(T("最短一段（分钟）", "Shortest chunk (minutes)"), T("任务被事件隔开时每段至少这么长；不够切成两段的任务整块排，放不下就跳到下一个空档，后面的小任务往前补位。0 = 照旧切开填满", "When events split a task, each piece is at least this long. A task too short to split is placed whole; if it doesn't fit, it moves to the next gap and smaller tasks after it move up. 0 = split and fill as before"), "minChunk", 0, 240);

    containerEl.createEl("h3", { text: T("macOS 日历", "macOS Calendar") });
    new Setting(containerEl).setName(T("读 macOS 日历", "Read macOS Calendar")).setDesc(T("把「日历」App 里的事件当固定事件排进螺旋（只读，不改日历）。第一次打开会在本机编译一个读日历的小助手（要有 Xcode 命令行工具），并弹出日历权限请求，选「允许」", "Place events from the Calendar app on the spiral as fixed events (read-only; your calendars are not changed). The first time, a small calendar helper is compiled on this Mac (needs the Xcode command line tools) and macOS asks for calendar access; choose Allow"))
      .addToggle((t) => t.setValue(!!s.calendar).onChange(async (v) => { s.calendar = v; this.plugin.cal.cache.clear(); await this.plugin.saveData(s); this.plugin.refresh(); this.display(); }));
    if (s.calendar) {
      text(T("不读这些日历", "Skip these calendars"), T("日历名称，逗号分隔，比如：中国大陆节假日, 生日", "Calendar names, comma-separated, e.g. US Holidays, Birthdays"), "calendarSkip");
      const names = new Setting(containerEl).setName(T("本机的日历", "Calendars on this Mac")).setDesc(T("点「列出」看看有哪些日历", "Click List to see which calendars there are"));
      names.addButton((b) => b.setButtonText(T("列出", "List")).onClick(async () => {
        try {
          const cals = await this.plugin.cal.call(["--calendars"]);
          names.setDesc(cals.map((c) => T(`${c.title}（${c.source}）`, `${c.title} (${c.source})`)).join(T("、", ", ")) || T("一个日历也没有", "No calendars at all"));
        } catch (e) { names.setDesc(String(e.message || e)); }
      }));
    }
    this.skipWas = s.calendarSkip;

    containerEl.createEl("h3", { text: T("Google 日历", "Google Calendar") });
    containerEl.createEl("p", { cls: "setting-item-description", text: T("把 Google 日历里的事件当固定事件排进螺旋（只读，不改日历），和 macOS 日历可以同时开，同一件事只留一份。要用你自己在 Google Cloud 里建的 OAuth 客户端：新建项目 → 启用 Google Calendar API → 「凭据」里新建 OAuth 客户端 ID，应用类型选「桌面应用」→ 把客户端 ID 和密钥填到下面 → 点「连接」。申请的权限只有读日历；密钥和令牌存在系统钥匙串里，不写进插件的 data.json。", "Place events from Google Calendar on the spiral as fixed events (read-only; your calendars are not changed). It can be on together with macOS Calendar; the same event is kept once. It uses an OAuth client you create yourself in Google Cloud: create a project → enable the Google Calendar API → under Credentials, create an OAuth client ID with application type Desktop app → enter the client ID and secret below → click Connect. The only permission requested is reading calendars; the secret and tokens are kept in the system keychain, not in the plugin's data.json.") });
    new Setting(containerEl).setName(T("读 Google 日历", "Read Google Calendar")).setDesc(T("只读界面里勾着显示的日历；上面「不读这些日历」对它也管用", "Only calendars shown (checked) in Google Calendar are read; \"Skip these calendars\" above applies too"))
      .addToggle((t) => t.setValue(!!s.googleCal).onChange(async (v) => { s.googleCal = v; this.plugin.cal.cache.clear(); await this.plugin.saveData(s); this.plugin.refresh(); this.display(); }));
    if (s.googleCal) {
      const g = this.plugin.gcal;
      new Setting(containerEl).setName(T("客户端 ID", "Client ID")).setDesc(T("形如 1234567890-xxxx.apps.googleusercontent.com", "Looks like 1234567890-xxxx.apps.googleusercontent.com"))
        .addText((t) => t.setValue(s.googleClientId || "").onChange(async (v) => { s.googleClientId = v.trim(); await this.plugin.saveData(s); }));
      new Setting(containerEl).setName(T("客户端密钥", "Client secret")).setDesc(this.plugin.secret("google-secret") ? T("已经存好了。要换就重新填", "Already saved. Enter it again to replace it") : T("填了以后存进系统钥匙串，这里不再显示", "Once entered, it is stored in the system keychain and not shown here again"))
        .addText((t) => { t.inputEl.type = "password"; t.setPlaceholder(this.plugin.secret("google-secret") ? "••••••••" : "GOCSPX-…").onChange((v) => { if (v.trim()) this.plugin.secret("google-secret", v.trim()); }); });
      const conn = new Setting(containerEl).setName(g.connected() ? T("已连接", "Connected") : T("还没连接", "Not connected")).setDesc(g.connected() ? T("授权存在系统钥匙串里。想换账号或者不用了，点「断开」", "The authorization is kept in the system keychain. To switch accounts or stop using it, click Disconnect") : T("点「连接」会打开浏览器，登录 Google 并同意读日历，然后自动回到这里", "Click Connect to open the browser, sign in to Google and allow reading calendars; you'll be brought back here automatically"));
      if (g.connected()) {
        conn.addButton((b) => b.setButtonText(T("列出日历", "List calendars")).onClick(async () => {
          try { conn.setDesc((await g.calendars()).map((c) => `${c.title}${c.shown ? "" : T("（界面里没勾，不读）", " (not checked in Google Calendar, skipped)")}`).join(T("、", ", ")) || T("一个日历也没有", "No calendars at all")); } catch (e) { conn.setDesc(String(e.message || e)); }
        }));
        conn.addButton((b) => b.setButtonText(T("断开", "Disconnect")).onClick(() => { g.disconnect(); this.plugin.cal.cache.clear(); this.plugin.refresh(); this.display(); }));
      } else {
        conn.addButton((b) => b.setCta().setButtonText(T("连接", "Connect")).onClick(async () => {
          b.setDisabled(true).setButtonText(T("等浏览器里授权…", "Waiting for authorization in the browser…"));
          try { await g.connect(); new OB.Notice(T("Google 日历连上了", "Google Calendar connected")); this.plugin.cal.cache.clear(); this.plugin.refresh(); }
          catch (e) { new OB.Notice(T("没连上：", "Not connected: ") + String(e.message || e), 8000); }
          this.display();
        }));
      }
    }

    containerEl.createEl("h3", { text: T("🔔 提醒与通知", "🔔 Reminders & notifications") });
    new Setting(containerEl).setName(T("带按钮提醒的方式", "Interactive reminder style")).setDesc(T("默认通知：普通系统通知（点一下跳到日记那一行）；带按钮的系统通知：不抢焦点（第一次要允许「螺旋日程」发通知；想让它一直留在屏幕上，到「系统设置 → 通知 → 螺旋日程」把样式改成「提醒」）", "Default notification: standard system notification (click to jump to the line). System notification with buttons: doesn't take focus (allow \"Nautilus Spiral\" to send notifications; to keep it on screen, set its style to Alerts in System Settings → Notifications → Nautilus Spiral)."))
      .addDropdown((d) => d.addOption("dialog", T("默认通知", "Default notification")).addOption("notification", T("带按钮的系统通知（试验）", "System notification with buttons (experimental)")).setValue(s.askVia || "dialog")
        .onChange(async (v) => { s.askVia = v; await this.plugin.saveData(s); }));
    text(T("提醒发到 Discord 的哪个频道", "Discord channel for reminders"), T("填本机 notify-discord 脚本认的频道名（比如 routine）。不用你回答的提醒（自动暂停等）发到这个频道，发出去了就不在本机再弹一遍；要你点按钮的照旧在本机弹。空着 = 不发", "A channel name your local notify-discord script knows (e.g. routine). Reminders that need no answer (auto-pause, etc.) go to this channel and are not shown again on this Mac; ones with buttons still pop up here. Empty = don't send"), "discordChannel");
    text(T("本机提醒的提示音", "Reminder sound on this Mac"), T("系统声音的名字（Pop、Glass、Ping、Tink、Submarine…）或者一个声音文件的路径；空着不响", "A system sound name (Pop, Glass, Ping, Tink, Submarine…) or the path to a sound file; empty = silent"), "notifySound");
    containerEl.createEl("h3", { text: T("🎨 颜色", "🎨 Colors") });
    containerEl.createEl("p", { cls: "setting-item-description", text: T("螺旋、列表和进度条上各类条目的颜色。Agent 会话的颜色跟着各家自己的界面走（Claude 橙、Codex 黑……），不在这里改", "Colors of each kind of item on the spiral, the list and the progress bars. Agent sessions use each tool's own colors (Claude orange, Codex black…) and can't be changed here") });
    const colorDesc = { main: T("块里带 [#A] 的任务，还有编辑器里主线块下面的进度条", "Tasks whose block carries [#A], and the progress bar under mainline blocks in the editor"), event: T("日记里写了时刻的事件（日历里读来的事件用日历自己的颜色）", "Events with a time written in the daily note (calendar events use their calendar's color)"), task: T("其余待办", "All other to-dos"), prio: T("带重要标记的任务，也用在排不下、超时的提示上", "Tasks with an important marker; also used for won't-fit and overtime warnings"), review: T("做完的「复习卡片 N 张」", "Finished \"复习卡片 N 张\" (review N cards) tasks"), game: T("螺旋最里面一圈的游戏时间", "Gaming time on the innermost ring of the spiral") };
    for (const [k, [name, d]] of Object.entries(COLORS)) {
      const set = async (v) => {
        s.colors = Object.assign({}, s.colors);
        if (v && v.toLowerCase() !== d) s.colors[k] = v; else delete s.colors[k];
        await this.plugin.saveData(s); this.plugin.applyColors();
      };
      new Setting(containerEl).setName(name).setDesc(colorDesc[k])
        .addColorPicker((c) => c.setValue((s.colors || {})[k] || d).onChange(set))
        .addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip(T("恢复默认", "Restore default")).onClick(async () => { await set(""); this.display(); }));
    }
    containerEl.createEl("h3", { text: T("🎯 主线", "🎯 Mainline") });
    new Setting(containerEl).setName(T("主线", "Mainline")).setDesc(T("块里带 [#A]（简写 todo a）的任务是这一天的主线，一天最多 3 块，按日记里的先后取（日记整理把多出来的降成 [#B]）。面板最上面列出来，排程时排在 DOING 后面、别的待办前面，螺旋上单独上色（默认大红，在上面「🎨 颜色」里改）；状态栏没在计时时显示下一件主线；过了日期分界，把前一天的完成率写进那篇日记的属性 mainline / mainline-rate", "Tasks whose block carries [#A] (short form: todo a) are the day's mainline: at most 3 blocks a day, taken in note order (journal cleanup lowers the extra ones to [#B]). They're listed at the top of the panel, scheduled after DOING and before other to-dos, and get their own color on the spiral (red by default; change it under 🎨 Colors above). When no timer is running, the status bar shows the next mainline task. After the day cutoff, the previous day's completion rate is written into that note's properties mainline / mainline-rate"))
      .addToggle((t) => t.setValue(s.showMain !== false).onChange(async (v) => { s.showMain = v; await this.plugin.saveData(s); this.plugin.refreshCapacity(); this.plugin.refresh(); }));
    text(T("主线提醒时刻", "Mainline reminder times"), T("到这几个时刻主线还没做完、手上也没在做主线，发一条提醒（和别的提醒一样：配了 Discord 发 Discord，没配在本机弹）。24 小时制，逗号分隔，空着 = 不提醒", "At these times, if the mainline isn't finished and you're not working on it, send a reminder (like other reminders: to Discord if configured, otherwise on this Mac). 24-hour time, comma-separated; empty = no reminders"), "mainNudge");
    containerEl.createEl("h3", { text: T("🗓 macOS 小组件", "🗓 macOS widgets") });
    containerEl.createEl("p", { cls: "setting-item-description", text: T("两个小组件，放桌面上或者通知中心的侧栏里都行：🎯 今天的主线（小号、中号），📅 计划甘特图（大号、特大号，从这周一起画 5 周）。先编译安装配套的小组件 App（插件仓库 widgets/ 里跑 ./build.sh），再右键桌面 →「编辑小组件」→ 搜「螺旋日程」拖出来（小组件的界面和名字跟着 macOS 的系统语言，英文系统里叫 Nautilus Spiral）。插件每分钟把数据写进 ~/Library/Application Support/Nautilus Spiral/widgets.json，有变化就叫小组件刷新；点小组件上的一行，跳回 Obsidian 的那一行。", "Two widgets, on the desktop or in the Notification Center sidebar: 🎯 Today's mainline (small, medium) and 📅 Plan Gantt (large, extra large; 5 weeks from this Monday). First build and install the companion widget app (run ./build.sh in widgets/ of the plugin repo), then right-click the desktop → Edit Widgets → search \"Nautilus Spiral\" (the widgets follow the macOS language: \"螺旋日程\" on a Chinese system) and drag them out. Every minute the plugin writes the data to ~/Library/Application Support/Nautilus Spiral/widgets.json and asks the widgets to refresh when it changes; click a line on a widget to jump back to that line in Obsidian.") });
    new Setting(containerEl).setName(T("给小组件导出数据", "Export data for widgets")).setDesc(T("没装小组件 App 时开着也没关系，只是多写一个文件", "Harmless if the widget app isn't installed; it just writes one extra file"))
      .addToggle((t) => t.setValue(!!s.widgets).onChange(async (v) => { s.widgets = v; this.plugin._widgetText = ""; await this.plugin.saveData(s); this.plugin.widgetTick(); }));
    text(T("计划笔记", "Plan note"), T("甘特图画哪一篇（库里的路径）。列表项里写了 🛫 开始、⏳ 计划、📅 截止日期的各画一条（Tasks 插件的写法），只写一个日期的画成那一天的一个点；上面最近的标题、或者没写日期的顶格列表项是分组；做完的（DONE、[x]、✅ 日期）画淡一点", "Which note the Gantt chart draws (vault path). Each list item with 🛫 start, ⏳ scheduled or 📅 due dates becomes a bar (the Tasks plugin's syntax); one with a single date becomes a dot on that day. The nearest heading above, or a top-level list item without dates, is a group; finished ones (DONE, [x], ✅ date) are drawn faded"), "widgetPlan");
    containerEl.createEl("h3", { text: T("硬规则（只管今天的日记）", "Hard rules (today's note only)") });
    num(T("同时最多几件 DOING", "Max DOING at once"), T("再开始一件时，把最早开始的那件改成 PAUSED，并发系统通知。交给 Agent 在做的不算：Agent Deck 记下的、下面挂着 🔗 的、自动对上了会话的任务，连同它所在的整块。0 = 不限", "When one more starts, the earliest started becomes PAUSED and you get a system notification. Work handed to agents doesn't count: tasks logged by Agent Deck, with a 🔗 under them, or auto-matched to a session, together with their whole block. 0 = no limit"), "doingLimit", 0, 20);
    num(T("DOING 多久没动就暂停（小时）", "Pause DOING after idle (hours)"), T("这一行和它下面的子项都没改过，超过这么久就改成 PAUSED，并发系统通知。0 = 不管", "If neither the line nor its children have changed for this long, it becomes PAUSED and you get a system notification. 0 = never"), "staleHours", 0, 48);
    containerEl.createEl("h3", { text: T("其它", "Other") });
    new Setting(containerEl).setName(T("预估 vs 实际", "Estimate vs actual")).setDesc(T("列表底部显示近一段时间预估准不准（按标签 / 链接分），容量条上按这个比例给一个「按以往约多久」", "At the bottom of the list, shows how accurate your recent estimates were (by tag / link); the capacity bar adds an \"about … going by your history\" based on that ratio"))
      .addToggle((t) => t.setValue(s.showReview !== false).onChange(async (v) => { s.showReview = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    num(T("复盘看最近几天", "Review the last N days"), T("插件自己的计时记录留 45 天；再往前的日子，靠日记里任务下面那一行 ⏱ 算实际用时", "The plugin keeps its own timing records for 45 days; for earlier days, actual time comes from the ⏱ line under each task in the daily note"), "reviewDays", 7, 365);
    new Setting(containerEl).setName(T("当日复盘", "Day review")).setDesc(T("列表里的「📋 今日复盘」：这一天每件任务的预计和实际，逐件对照。只有做完、也记到了实际用时的才算进偏差", "\"📋 Today's review\" in the list: estimate and actual for every task of the day, side by side. Only tasks that are done and have actual time recorded count toward the difference"))
      .addToggle((t) => t.setValue(s.showDayReview !== false).onChange(async (v) => { s.showDayReview = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    new Setting(containerEl).setName(T("显示没记录的时间", "Show unrecorded time")).setDesc(T("已经过去、既没有事件和任务记录、也没有 Agent 会话的时间，在螺旋上画成斜纹，容量条第一行的悬停提示里写「有记录 / 没记录」各多少", "Past time with no event, no task record and no agent session is hatched on the spiral, and the tooltip on the first capacity line says how much is recorded / unrecorded"))
      .addToggle((t) => t.setValue(s.showUnrecorded !== false).onChange(async (v) => { s.showUnrecorded = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    new Setting(containerEl).setName(T("实际时段写回日记", "Write actual time into the note")).setDesc(T("你手动做的任务不再是 DOING 时，在它下面写一行「⏱ 14:05–14:40、15:10–15:32 · 共 57m」，和自动记的行同一种写法。实际用时就留在日记正文里，不只存在插件的计时记录里", "When a task you did yourself stops being DOING, write a line under it, \"⏱ 14:05–14:40, 15:10–15:32 · total 57m\", in the same form as the automatic lines. Actual time then lives in the note itself, not only in the plugin's timing records"))
      .addToggle((t) => t.setValue(!!s.clockToNote).onChange(async (v) => { s.clockToNote = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName(T("状态栏", "Status bar")).setDesc(T("右下角常驻一格：在做事时显示最近开始的那件做了多久，没在做时显示今天的容量。单击打开螺旋日程，⌥ 单击到日记里那一行，⇧ 单击在旁边分栏打开今天的日记", "A permanent item at the bottom right: while you're working it shows how long the most recently started task has run; otherwise today's capacity. Click to open Nautilus Spiral, ⌥-click to go to that line in the note, ⇧-click to open today's note in a split"))
      .addToggle((t) => t.setValue(s.statusBar !== false).onChange(async (v) => { s.statusBar = v; await this.plugin.saveData(s); this.plugin.refreshCapacity(); }));
    new Setting(containerEl).setName(T("界面音效", "UI sounds")).setDesc(T("开始做、做完、停下、回放起止各一声很轻的合成音。Obsidian 不在最前面时不响；提醒用的提示音在上面单独设", "A very soft synthesized sound for start, done, stop, and the start and end of playback. Silent when Obsidian isn't in front; the reminder sound is set separately above"))
      .addToggle((t) => t.setValue(s.uiSound !== false).onChange(async (v) => { s.uiSound = v; await this.plugin.saveData(s); if (v) this.plugin.sound("done"); }));
    num(T("番茄钟阈值（分钟）", "Pomodoro threshold (minutes)"), T("一件事连着做了这么久，状态栏的计时变红。只是提示，不会打断。0 = 不提示", "After working on one thing this long without a break, the status bar timer turns red. Just a hint, no interruption. 0 = off"), "pomoMinutes", 0, 600);
    num(T("忘了关计时的提醒（分钟）", "Forgotten timer reminder (minutes)"), T("计时开了这么久，状态栏提醒「检查计时」。不会替你停。0 = 不提醒", "After a timer has run this long, the status bar says \"Check the timer\". It won't stop it for you. 0 = off"), "forgottenMinutes", 0, 1440);
    new Setting(containerEl).setName(T("启动时打开今天的日记", "Open today's note on startup")).setDesc(T("按上面的「日记日期分界」算今天：已经开着就切过去，没开就开一个新标签，还没有这篇就新建", "\"Today\" follows the daily note cutoff above: switch to it if it's open, otherwise open it in a new tab, creating it if needed"))
      .addToggle((t) => t.setValue(s.openTodayOnStartup !== false).onChange(async (v) => { s.openTodayOnStartup = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName(T("启动时左侧栏显示螺旋日程", "Show Nautilus Spiral in the left sidebar on startup")).setDesc(T("展开左侧栏并切到螺旋日程标签（Wiki、文件列表等标签还在，点图标切换）", "Expands the left sidebar and switches to the Nautilus Spiral tab (other tabs like the file list stay; click their icons to switch)"))
      .addToggle((t) => t.setValue(s.revealOnStartup !== false).onChange(async (v) => { s.revealOnStartup = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName(T("显示人机协作", "Show agent collaboration")).setDesc(T("读下面开着的那几个 AI 工具在本机的会话日志，在容量条下面「🤖」那一行显示当天协作时长和 token（悬停看细账），螺旋内圈画出它们在干活的时段；汇总另存在插件目录的 ai-usage.json", "Reads the local session logs of the AI tools turned on below; the 🤖 line under the capacity bar shows the day's collaboration time and tokens (hover for details), and the inner rings of the spiral show when they were at work; totals are also saved to ai-usage.json in the plugin folder"))
      .addToggle((t) => t.setValue(s.showAi !== false).onChange(async (v) => { s.showAi = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    containerEl.createEl("h3", { text: T("🤖 主力 Agent 和要追踪的 Agent", "🤖 Primary agent and tracked agents") });
    containerEl.createEl("p", { cls: "setting-item-description", text: T("主力 Agent 全量追踪：读它全部的会话历史。其余开着的只追踪今天有动静的会话：今天的时长和 token 照常，以前的会话不翻。关掉的不再读，已经汇总进来的历史留着但不显示，重新打开就回来。", "The primary agent is tracked in full: all of its session history is read. The others that are on are tracked only for sessions active today: today's time and tokens as usual, older sessions are not read. Turned-off agents are no longer read; their history already summed up is kept but hidden, and comes back when turned on again.") });
    {
      const reset = () => { this.plugin._ai = null; this.plugin._aiAt = 0; this.plugin.refresh(); };   // 换了要读的范围：把最近的日志重读一遍
      new Setting(containerEl).setName(T("主力 Agent", "Primary agent")).setDesc(T("平时干活主要用哪一个。它总是开着", "The one you mainly work with. It's always on"))
        .addDropdown((d) => {
          for (const [k, n] of Object.entries(AI_AGENTS)) d.addOption(k, n);
          d.setValue(aiPrimary(s)).onChange(async (v) => { s.aiPrimary = v; await this.plugin.saveData(s); reset(); this.display(); });
        });
      const fs = require("fs"), path = require("path"), home = require("os").homedir();
      const where = {
        claude: [".claude/projects", T("Claude Code 和 Claude 桌面版里的 Code 会话", "Claude Code, and Code sessions in the Claude desktop app")],
        codex: [".codex/sessions", T("Codex 桌面版和 codex 命令行，时长和 token 都读", "Codex desktop and the codex CLI; both time and tokens are read")],
        workbuddy: [".workbuddy/projects", T("WorkBuddy 桌面版", "WorkBuddy desktop")],
        dsh: [".dsh/sessions", T("DeepSeek Harness 会话日志（~/.dsh/sessions），并支持 dsh-token-usage-stats API 兜底", "DeepSeek Harness session logs (~/.dsh/sessions), with fallback to the dsh-token-usage-stats local API")],
        antigravity: [".gemini/antigravity/brain", T("Google Antigravity 会话日志", "Google Antigravity session logs")],
      };
      for (const k of Object.keys(AI_AGENTS)) {
        const [dir, what] = where[k];
        const found = fs.existsSync(path.join(k === "codex" ? codexHome() : home, k === "codex" ? "sessions" : dir));
        const main = k === aiPrimary(s);
        const desc = k === "dsh" ? T(`${what}（端口自动找；插件要在 DSH 里启用）`, `${what} (port found automatically; the plugin must be enabled in DSH)`) : T(`${what}。日志在 ~/${dir}${found ? "" : "（这台机器上还没有这个目录）"}`, `${what}. Logs in ~/${dir}${found ? "" : " (this folder doesn't exist on this Mac yet)"}`);
        new Setting(containerEl).setName(`${AI_AGENTS[k]}${main ? T("（主力，全量追踪）", " (primary, tracked in full)") : T("（只追踪今天的）", " (today only)")}`).setDesc(desc)
          .addToggle((t) => t.setValue(aiOn(s).includes(k)).setDisabled(main).onChange(async (v) => {
            s.aiAgents = { ...Object.fromEntries(Object.keys(AI_AGENTS).map((a) => [a, aiOn(s).includes(a)])), [k]: v };
            await this.plugin.saveData(s);
            reset();
          }));
      }
      new Setting(containerEl).setName(T("DeepSeek Harness API 端口", "DeepSeek Harness API port")).setDesc(T("0 = 自动从 lsof 找 DSH 正在监听的端口；也可以填固定端口。DSH 里要启用 dsh-token-usage-stats 插件", "0 = find the port DSH listens on automatically via lsof; or enter a fixed port. The dsh-token-usage-stats plugin must be enabled in DSH"))
        .addText((t) => t.setValue(String(s.dshApiPort || 0)).onChange(async (v) => { s.dshApiPort = Math.max(0, parseInt(v, 10) || 0); await this.plugin.saveData(s); reset(); }));
    }
    new Setting(containerEl).setName(T("记录游戏时间", "Track gaming time")).setDesc(T("每分钟看一眼在不在玩，螺旋最里面一圈画一条细线；记在插件目录的 game-log.json。只在 Obsidian 开着时记录", "Checks once a minute whether you're playing and draws a thin line on the innermost ring of the spiral; saved to game-log.json in the plugin folder. Only recorded while Obsidian is open"))
      .addToggle((t) => t.setValue(s.trackGames !== false).onChange(async (v) => { s.trackGames = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    text(T("游戏进程关键词", "Game process keywords"), T("进程路径里含这些词就算在玩，逗号分隔；steamapps/common 会按游戏文件夹名分开记", "Playing counts when a process path contains one of these, comma-separated; steamapps/common is recorded per game folder"), "gameProcs");
    text(T("在最前面才算的 App", "Apps that count only in front"), T("这些 App 常驻后台，只有切到最前面时才算游戏时间，比如 Steam 客户端", "These apps stay running in the background and count as gaming only when in front, e.g. the Steam client"), "gameFrontApps");
  }
}


// ---------------- 解 zstd：DeepSeek Harness 的会话日志 ----------------
// Obsidian 1.6 用的 Electron 30 还没有 zlib.zstd，这里内置 fzstd（MIT，https://github.com/101arrowz/fzstd）的解码器。
// 整段包在一个函数里，免得里面的 fill / err 这些短名字和插件自己的撞上；fzstd 能连着解多个帧。
const dshUnzstd = (() => {
// node_modules/fzstd/esm/index.mjs
var ab = ArrayBuffer;
var u8 = Uint8Array;
var u16 = Uint16Array;
var i16 = Int16Array;
var i32 = Int32Array;
var slc = function(v, s, e) {
  if (u8.prototype.slice)
    return u8.prototype.slice.call(v, s, e);
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  var n = new u8(e - s);
  n.set(v.subarray(s, e));
  return n;
};
var fill = function(v, n, s, e) {
  if (u8.prototype.fill)
    return u8.prototype.fill.call(v, n, s, e);
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  for (; s < e; ++s)
    v[s] = n;
  return v;
};
var cpw = function(v, t, s, e) {
  if (u8.prototype.copyWithin)
    return u8.prototype.copyWithin.call(v, t, s, e);
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  while (s < e) {
    v[t++] = v[s++];
  }
};
var ec = [
  "invalid zstd data",
  "window size too large (>2046MB)",
  "invalid block type",
  "FSE accuracy too high",
  "match distance too far back",
  "unexpected EOF"
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var rb = function(d, b, n) {
  var i = 0, o = 0;
  for (; i < n; ++i)
    o |= d[b++] << (i << 3);
  return o;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var rzfh = function(dat, w) {
  var n3 = dat[0] | dat[1] << 8 | dat[2] << 16;
  if (n3 == 3126568 && dat[3] == 253) {
    var flg = dat[4];
    var ss = flg >> 5 & 1, cc = flg >> 2 & 1, df = flg & 3, fcf = flg >> 6;
    if (flg & 8)
      err(0);
    var bt = 6 - ss;
    var db = df == 3 ? 4 : df;
    var di = rb(dat, bt, db);
    bt += db;
    var fsb = fcf ? 1 << fcf : ss;
    var fss = rb(dat, bt, fsb) + (fcf == 1 && 256);
    var ws = fss;
    if (!ss) {
      var wb = 1 << 10 + (dat[5] >> 3);
      ws = wb + (wb >> 3) * (dat[5] & 7);
    }
    if (ws > 2145386496)
      err(1);
    var buf = new u8((w == 1 ? fss || ws : w ? 0 : ws) + 12);
    buf[0] = 1, buf[4] = 4, buf[8] = 8;
    return {
      b: bt + fsb,
      y: 0,
      l: 0,
      d: di,
      w: w && w != 1 ? w : buf.subarray(12),
      e: ws,
      o: new i32(buf.buffer, 0, 3),
      u: fss,
      c: cc,
      m: Math.min(131072, ws)
    };
  } else if ((n3 >> 4 | dat[3] << 20) == 25481893) {
    return b4(dat, 4) + 8;
  }
  err(0);
};
var msb = function(val) {
  var bits = 0;
  for (; 1 << bits <= val; ++bits)
    ;
  return bits - 1;
};
var rfse = function(dat, bt, mal) {
  var tpos = (bt << 3) + 4;
  var al = (dat[bt] & 15) + 5;
  if (al > mal)
    err(3);
  var sz = 1 << al;
  var probs = sz, sym = -1, re = -1, i = -1, ht = sz;
  var buf = new ab(512 + (sz << 2));
  var freq = new i16(buf, 0, 256);
  var dstate = new u16(buf, 0, 256);
  var nstate = new u16(buf, 512, sz);
  var bb1 = 512 + (sz << 1);
  var syms = new u8(buf, bb1, sz);
  var nbits = new u8(buf, bb1 + sz);
  while (sym < 255 && probs > 0) {
    var bits = msb(probs + 1);
    var cbt = tpos >> 3;
    var msk = (1 << bits + 1) - 1;
    var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (tpos & 7) & msk;
    var msk1fb = (1 << bits) - 1;
    var msv = msk - probs - 1;
    var sval = val & msk1fb;
    if (sval < msv)
      tpos += bits, val = sval;
    else {
      tpos += bits + 1;
      if (val > msk1fb)
        val -= msv;
    }
    freq[++sym] = --val;
    if (val == -1) {
      probs += val;
      syms[--ht] = sym;
    } else
      probs -= val;
    if (!val) {
      do {
        var rbt = tpos >> 3;
        re = (dat[rbt] | dat[rbt + 1] << 8) >> (tpos & 7) & 3;
        tpos += 2;
        sym += re;
      } while (re == 3);
    }
  }
  if (sym > 255 || probs)
    err(0);
  var sympos = 0;
  var sstep = (sz >> 1) + (sz >> 3) + 3;
  var smask = sz - 1;
  for (var s = 0; s <= sym; ++s) {
    var sf = freq[s];
    if (sf < 1) {
      dstate[s] = -sf;
      continue;
    }
    for (i = 0; i < sf; ++i) {
      syms[sympos] = s;
      do {
        sympos = sympos + sstep & smask;
      } while (sympos >= ht);
    }
  }
  if (sympos)
    err(0);
  for (i = 0; i < sz; ++i) {
    var ns = dstate[syms[i]]++;
    var nb = nbits[i] = al - msb(ns);
    nstate[i] = (ns << nb) - sz;
  }
  return [tpos + 7 >> 3, {
    b: al,
    s: syms,
    n: nbits,
    t: nstate
  }];
};
var rhu = function(dat, bt) {
  var i = 0, wc = -1;
  var buf = new u8(292), hb = dat[bt];
  var hw = buf.subarray(0, 256);
  var rc = buf.subarray(256, 268);
  var ri = new u16(buf.buffer, 268);
  if (hb < 128) {
    var _a = rfse(dat, bt + 1, 6), ebt = _a[0], fdt = _a[1];
    bt += hb;
    var epos = ebt << 3;
    var lb = dat[bt];
    if (!lb)
      err(0);
    var st1 = 0, st2 = 0, btr1 = fdt.b, btr2 = btr1;
    var fpos = (++bt << 3) - 8 + msb(lb);
    for (; ; ) {
      fpos -= btr1;
      if (fpos < epos)
        break;
      var cbt = fpos >> 3;
      st1 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr1) - 1;
      hw[++wc] = fdt.s[st1];
      fpos -= btr2;
      if (fpos < epos)
        break;
      cbt = fpos >> 3;
      st2 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr2) - 1;
      hw[++wc] = fdt.s[st2];
      btr1 = fdt.n[st1];
      st1 = fdt.t[st1];
      btr2 = fdt.n[st2];
      st2 = fdt.t[st2];
    }
    if (++wc > 255)
      err(0);
  } else {
    wc = hb - 127;
    for (; i < wc; i += 2) {
      var byte = dat[++bt];
      hw[i] = byte >> 4;
      hw[i + 1] = byte & 15;
    }
    ++bt;
  }
  var wes = 0;
  for (i = 0; i < wc; ++i) {
    var wt = hw[i];
    if (wt > 11)
      err(0);
    wes += wt && 1 << wt - 1;
  }
  var mb = msb(wes) + 1;
  var ts = 1 << mb;
  var rem = ts - wes;
  if (rem & rem - 1)
    err(0);
  hw[wc++] = msb(rem) + 1;
  for (i = 0; i < wc; ++i) {
    var wt = hw[i];
    ++rc[hw[i] = wt && mb + 1 - wt];
  }
  var hbuf = new u8(ts << 1);
  var syms = hbuf.subarray(0, ts), nb = hbuf.subarray(ts);
  ri[mb] = 0;
  for (i = mb; i > 0; --i) {
    var pv = ri[i];
    fill(nb, i, pv, ri[i - 1] = pv + rc[i] * (1 << mb - i));
  }
  if (ri[0] != ts)
    err(0);
  for (i = 0; i < wc; ++i) {
    var bits = hw[i];
    if (bits) {
      var code = ri[bits];
      fill(syms, i, code, ri[bits] = code + (1 << mb - bits));
    }
  }
  return [bt, {
    n: nb,
    b: mb,
    s: syms
  }];
};
var dllt = rfse(/* @__PURE__ */ new u8([
  81,
  16,
  99,
  140,
  49,
  198,
  24,
  99,
  12,
  33,
  196,
  24,
  99,
  102,
  102,
  134,
  70,
  146,
  4
]), 0, 6)[1];
var dmlt = rfse(/* @__PURE__ */ new u8([
  33,
  20,
  196,
  24,
  99,
  140,
  33,
  132,
  16,
  66,
  8,
  33,
  132,
  16,
  66,
  8,
  33,
  68,
  68,
  68,
  68,
  68,
  68,
  68,
  68,
  36,
  9
]), 0, 6)[1];
var doct = rfse(/* @__PURE__ */ new u8([
  32,
  132,
  16,
  66,
  102,
  70,
  68,
  68,
  68,
  68,
  36,
  73,
  2
]), 0, 5)[1];
var b2bl = function(b, s) {
  var len = b.length, bl = new i32(len);
  for (var i = 0; i < len; ++i) {
    bl[i] = s;
    s += 1 << b[i];
  }
  return bl;
};
var llb = /* @__PURE__ */ new u8((/* @__PURE__ */ new i32([
  0,
  0,
  0,
  0,
  16843009,
  50528770,
  134678020,
  202050057,
  269422093
])).buffer, 0, 36);
var llbl = /* @__PURE__ */ b2bl(llb, 0);
var mlb = /* @__PURE__ */ new u8((/* @__PURE__ */ new i32([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  16843009,
  50528770,
  117769220,
  185207048,
  252579084,
  16
])).buffer, 0, 53);
var mlbl = /* @__PURE__ */ b2bl(mlb, 3);
var dhu = function(dat, out, hu) {
  var len = dat.length, ss = out.length, lb = dat[len - 1], msk = (1 << hu.b) - 1, eb = -hu.b;
  if (!lb)
    err(0);
  var st = 0, btr = hu.b, pos = (len << 3) - 8 + msb(lb) - btr, i = -1;
  for (; pos > eb && i < ss; ) {
    var cbt = pos >> 3;
    var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (pos & 7);
    st = (st << btr | val) & msk;
    out[++i] = hu.s[st];
    pos -= btr = hu.n[st];
  }
  if (pos != eb || i + 1 != ss)
    err(0);
};
var dhu4 = function(dat, out, hu) {
  var bt = 6;
  var ss = out.length, sz1 = ss + 3 >> 2, sz2 = sz1 << 1, sz3 = sz1 + sz2;
  dhu(dat.subarray(bt, bt += dat[0] | dat[1] << 8), out.subarray(0, sz1), hu);
  dhu(dat.subarray(bt, bt += dat[2] | dat[3] << 8), out.subarray(sz1, sz2), hu);
  dhu(dat.subarray(bt, bt += dat[4] | dat[5] << 8), out.subarray(sz2, sz3), hu);
  dhu(dat.subarray(bt), out.subarray(sz3), hu);
};
var rzb = function(dat, st, out) {
  var _a;
  var bt = st.b;
  var b0 = dat[bt], btype = b0 >> 1 & 3;
  st.l = b0 & 1;
  var sz = b0 >> 3 | dat[bt + 1] << 5 | dat[bt + 2] << 13;
  var ebt = (bt += 3) + sz;
  if (btype == 1) {
    if (bt >= dat.length)
      return;
    st.b = bt + 1;
    if (out) {
      fill(out, dat[bt], st.y, st.y += sz);
      return out;
    }
    return fill(new u8(sz), dat[bt]);
  }
  if (ebt > dat.length)
    return;
  if (btype == 0) {
    st.b = ebt;
    if (out) {
      out.set(dat.subarray(bt, ebt), st.y);
      st.y += sz;
      return out;
    }
    return slc(dat, bt, ebt);
  }
  if (btype == 2) {
    var b3 = dat[bt], lbt = b3 & 3, sf = b3 >> 2 & 3;
    var lss = b3 >> 4, lcs = 0, s4 = 0;
    if (lbt < 2) {
      if (sf & 1)
        lss |= dat[++bt] << 4 | (sf & 2 && dat[++bt] << 12);
      else
        lss = b3 >> 3;
    } else {
      s4 = sf;
      if (sf < 2)
        lss |= (dat[++bt] & 63) << 4, lcs = dat[bt] >> 6 | dat[++bt] << 2;
      else if (sf == 2)
        lss |= dat[++bt] << 4 | (dat[++bt] & 3) << 12, lcs = dat[bt] >> 2 | dat[++bt] << 6;
      else
        lss |= dat[++bt] << 4 | (dat[++bt] & 63) << 12, lcs = dat[bt] >> 6 | dat[++bt] << 2 | dat[++bt] << 10;
    }
    ++bt;
    var buf = out ? out.subarray(st.y, st.y + st.m) : new u8(st.m);
    var spl = buf.length - lss;
    if (lbt == 0)
      buf.set(dat.subarray(bt, bt += lss), spl);
    else if (lbt == 1)
      fill(buf, dat[bt++], spl);
    else {
      var hu = st.h;
      if (lbt == 2) {
        var hud = rhu(dat, bt);
        lcs += bt - (bt = hud[0]);
        st.h = hu = hud[1];
      } else if (!hu)
        err(0);
      (s4 ? dhu4 : dhu)(dat.subarray(bt, bt += lcs), buf.subarray(spl), hu);
    }
    var ns = dat[bt++];
    if (ns) {
      if (ns == 255)
        ns = (dat[bt++] | dat[bt++] << 8) + 32512;
      else if (ns > 127)
        ns = ns - 128 << 8 | dat[bt++];
      var scm = dat[bt++];
      if (scm & 3)
        err(0);
      var dts = [dmlt, doct, dllt];
      for (var i = 2; i > -1; --i) {
        var md = scm >> (i << 1) + 2 & 3;
        if (md == 1) {
          var rbuf = new u8([0, 0, dat[bt++]]);
          dts[i] = {
            s: rbuf.subarray(2, 3),
            n: rbuf.subarray(0, 1),
            t: new u16(rbuf.buffer, 0, 1),
            b: 0
          };
        } else if (md == 2) {
          _a = rfse(dat, bt, 9 - (i & 1)), bt = _a[0], dts[i] = _a[1];
        } else if (md == 3) {
          if (!st.t)
            err(0);
          dts[i] = st.t[i];
        }
      }
      var _b = st.t = dts, mlt = _b[0], oct = _b[1], llt = _b[2];
      var lb = dat[ebt - 1];
      if (!lb)
        err(0);
      var spos = (ebt << 3) - 8 + msb(lb) - llt.b, cbt = spos >> 3, oubt = 0;
      var lst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << llt.b) - 1;
      cbt = (spos -= oct.b) >> 3;
      var ost = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << oct.b) - 1;
      cbt = (spos -= mlt.b) >> 3;
      var mst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mlt.b) - 1;
      for (++ns; --ns; ) {
        var llc = llt.s[lst];
        var lbtr = llt.n[lst];
        var mlc = mlt.s[mst];
        var mbtr = mlt.n[mst];
        var ofc = oct.s[ost];
        var obtr = oct.n[ost];
        cbt = (spos -= ofc) >> 3;
        var ofp = 1 << ofc;
        var off = ofp + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16 | dat[cbt + 3] << 24) >>> (spos & 7) & ofp - 1);
        cbt = (spos -= mlb[mlc]) >> 3;
        var ml = mlbl[mlc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << mlb[mlc]) - 1);
        cbt = (spos -= llb[llc]) >> 3;
        var ll = llbl[llc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << llb[llc]) - 1);
        cbt = (spos -= lbtr) >> 3;
        lst = llt.t[lst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << lbtr) - 1);
        cbt = (spos -= mbtr) >> 3;
        mst = mlt.t[mst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mbtr) - 1);
        cbt = (spos -= obtr) >> 3;
        ost = oct.t[ost] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << obtr) - 1);
        if (off > 3) {
          st.o[2] = st.o[1];
          st.o[1] = st.o[0];
          st.o[0] = off -= 3;
        } else {
          var idx = off - (ll != 0);
          if (idx) {
            off = idx == 3 ? st.o[0] - 1 : st.o[idx];
            if (idx > 1)
              st.o[2] = st.o[1];
            st.o[1] = st.o[0];
            st.o[0] = off;
          } else
            off = st.o[0];
        }
        for (var i = 0; i < ll; ++i) {
          buf[oubt + i] = buf[spl + i];
        }
        oubt += ll, spl += ll;
        var stin = oubt - off;
        if (stin < 0) {
          var len = -stin;
          var bs = st.e + stin;
          if (len > ml)
            len = ml;
          for (var i = 0; i < len; ++i) {
            buf[oubt + i] = st.w[bs + i];
          }
          oubt += len, ml -= len, stin = 0;
        }
        for (var i = 0; i < ml; ++i) {
          buf[oubt + i] = buf[stin + i];
        }
        oubt += ml;
      }
      if (oubt != spl) {
        while (spl < buf.length) {
          buf[oubt++] = buf[spl++];
        }
      } else
        oubt = buf.length;
      if (out)
        st.y += oubt;
      else
        buf = slc(buf, 0, oubt);
    } else if (out) {
      st.y += lss;
      if (spl) {
        for (var i = 0; i < lss; ++i) {
          buf[i] = buf[spl + i];
        }
      }
    } else if (spl)
      buf = slc(buf, spl);
    st.b = ebt;
    return buf;
  }
  err(2);
};
var cct = function(bufs, ol) {
  if (bufs.length == 1)
    return bufs[0];
  var buf = new u8(ol);
  for (var i = 0, b = 0; i < bufs.length; ++i) {
    var chk = bufs[i];
    buf.set(chk, b);
    b += chk.length;
  }
  return buf;
};
function decompress(dat, buf) {
  var bufs = [], nb = +!buf;
  var bt = 0, ol = 0;
  for (; dat.length; ) {
    var st = rzfh(dat, nb || buf);
    if (typeof st == "object") {
      if (nb) {
        buf = null;
        if (st.w.length == st.u) {
          bufs.push(buf = st.w);
          ol += st.u;
        }
      } else {
        bufs.push(buf);
        st.e = 0;
      }
      for (; !st.l; ) {
        var blk = rzb(dat, st, buf);
        if (!blk)
          err(5);
        if (buf)
          st.e = st.y;
        else {
          bufs.push(blk);
          ol += blk.length;
          cpw(st.w, 0, blk.length);
          st.w.set(blk, st.w.length - blk.length);
        }
      }
      bt = st.b + st.c * 4;
    } else
      bt = st;
    dat = dat.subarray(bt);
  }
  return cct(bufs, ol);
}

  return decompress;
})();

module.exports.core = { detectJournal, formatRegex, openTasks, todoDone, mainOf, mainTask, markMain, mainNext, mainPips, MAIN_MAX, ganttOf, goalUnder, withProgress, markDone, markUndone, planDone, parseHourClock, fmtHourClock, markOwner, parseJournal, parseDuration, parseProgress, applyWork, workKey, schedule, fill, normalize, toDoing, toDone, toTodo, toPaused, toKeyword, taskPriority, toPriority, cycleUpNextStatus, UP_NEXT_MENU_GROUPS, UP_NEXT_PRIORITY_ITEMS, subtree, DEFAULTS, AiUsage, aiOn, aiPick, fmtTok, unionMin, capacity, capSummary, pastGaps, isAutoTask, formatTaskDur, formatTaskTip, dayReview, parseClock, GoogleCalendar, kwSnapshot, kwChanges, kwCue, kwLine, kwLineChange, aiStep, todoOf, tokUsed, linkLine, parseLink, linkUnder, SOUNDS, aiSegmentSessions, aiHoverSession, KW_STATUS, DECK_STATE_STATUS, taskStatus, statusCls, pomoMinutes, pomoTimeRange, pomoSplit, pomoFormatLeft, SpiralView };
