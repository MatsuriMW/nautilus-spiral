const OB = require("obsidian");
const { Plugin, ItemView, PluginSettingTab, Setting, TFile, moment, debounce } = OB;
const LP_SCRIPT = "scripts/long-projects.js";   // 长期项目的数据层，和「长期项目」看板共用

const VIEW_TYPE = "nautilus-spiral";
const DEFAULTS = {
  dayStart: 8,          // 螺旋从几点开始
  dayEnd: 32,           // 螺旋和排程到几点结束，超过 24 表示次日凌晨（32 = 次日早上 8 点；个人作息夜里会一直干活，早上七八点才睡）
  dayCutoff: 8,         // 日记的日期分界：早上几点前还算前一天
  defaultDur: 15,       // 没写时长的任务按多少分钟算
  folder: "日记",
  format: "YYYY_MM_DD",
  priorityMarkers: "[[important]], [[重要]], ⭐, ‼️",
  doneTimes: {},        // { "2026_09_29": { "任务文字": 872 } }，在 Bike 里改成 DONE 时记下的完成时间（分钟）
  autoOpened: false,
  showProjects: true,   // 底部显示「🧭 长期项目 · 该推一把」
  showAi: true,         // 显示人机协作（Claude Code 的协作时长和 token）
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
  autoLogIdle: 40,      // 会话多少分钟没动静，就把它那一行从 DOING 改成 SUSPENDED
  weeklyDirs: true,     // 每周日晚上发一条「本周方向」回顾（Telegram，没有就 Discord）
  weeklySent: "",       // 发过的最近一周，比如 2026-W41
  dirLog: {},           // { "2026_10_11": { "Obsidian 改造": 133, "": 20 } }：每天各个大方向的分钟数（"" = 没归方向的）
  autoLog: false,       // 自动把 Claude / Codex / WorkBuddy 会话按 DOING / DONE / SUSPENDED 记进今天的日记，用时按会话真正在动的时段算
  autoLogEvery: 20,     // 每隔几分钟整理一次
  autoLogModel: "haiku",          // 判断「做的是什么事、做完没有」用哪个模型（claude 命令行的 --model）
  claudePath: "~/.local/bin/claude",
  autoLogNotify: true,  // 自动记成 DONE / SUSPENDED 时发一条带按钮的通知，不对可以在通知上改
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
    .replace(/==|\*\*|~~|`/g, "")
    .replace(/[📅🛫✅⭐⏳]\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    if (s.startsWith("⏱")) return;   // 自动记日记写在任务下面的「⏱ 实际时段」，是记录，不是事件也不是任务
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
    const doing = kw && /DOING|NOW|IN-PROGRESS/.test(kw[1]) || (cb && cb[1] === "/");
    const suspended = !!kw && /^(WAIT|SUSPENDED)/.test(kw[1]);   // WAITING / SUSPENDED = 搁置：短期不推，今天不排、不占容量，做过的时间和进度留着
    const paused = !!kw && kw[1] === "PAUSED";                     // PAUSED = 暂停：只是停一下，照常排，接着做时剩余时间扣掉做过的
    const progress = state === "none" ? null : parseProgress(s);
    let label = state === "none" ? s : stripProgress(s);
    for (const p of prio) label = label.split(p).join("");
    label = cleanLabel(label) || s.trim();
    const indent = lm[1].replace(/\t/g, "    ").length;
    const pr = /\[\[[^\]|#]+#\^([\w-]+)/.exec(s);   // [[长期计划#^lp-xxxx|简称]] = 挂在某个长期项目上
    const base = { line, indent, label, state, doing: !!doing, suspended, paused, progress, prio: prio.some((p) => s.includes(p)), stamp, projRef: pr ? pr[1] : null };

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
    t.worked = segs;
    t.spentToday = sum(segs);
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
  const eventLeft = busy.reduce((s, [a, b]) => s + b - a, 0);
  const suspended = items.filter((i) => i.kind === "task" && i.state === "open" && i.suspended);
  for (const t of suspended) t.remaining = t.progress != null ? t.dur * (1 - t.progress) : Math.max(5, t.dur - ((t.spentToday || 0) + (t.spentBefore || 0)));
  return { from, available, demand, overflow: Math.max(0, demand - available), eventLeft, queue, suspended };
}

// ---------------- 工具 ----------------

const pad = (n) => String(n).padStart(2, "0");
const clock = (t) => `${pad(Math.floor(t / 60) % 24)}:${pad(Math.round(t % 60))}`;
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
  let since = null;
  const t = kw && /^(\d{1,2})[:：](\d{2})(?![\d:：]|\s*[-–~～到至])\s*/.exec(rest);
  if (t) { since = `${pad(+t[1])}:${t[2]}`; rest = rest.slice(t[0].length); }
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
  const text = stripDuration(p.rest.replace(RANGE_RE, " ").replace(SINGLE_RE, " ")).replace(/[^\p{Script=Han}A-Za-z]/gu, "");
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

class AiUsage {
  constructor(cfg) {
    this.cfg = cfg;
    this.files = new Map();   // path -> { size, offset, days: Map(key -> { sess: Map(sid -> {proj, ts[], text}), prompts }), msgs: Map(id -> 用量), titles: Map(sid -> 标题) }
  }

  // [目录, 哪个 Agent]
  static roots() {
    const os = require("os"), path = require("path");
    const home = os.homedir();
    const r = [[path.join(home, ".claude/projects"), "claude"], [path.join(home, ".config/claude/projects"), "claude"]];
    for (const d of (process.env.CLAUDE_CONFIG_DIR || "").split(",").filter(Boolean)) r.push([path.join(d, "projects"), "claude"]);
    r.push([path.join(home, ".codex/sessions"), "codex"], [path.join(home, ".workbuddy/projects"), "workbuddy"]);
    const seen = new Set();
    return r.filter(([d]) => !seen.has(d) && seen.add(d));
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
    for (const [root, agent] of AiUsage.roots()) {
      for (const p of await walk(root, 0)) {
        let st;
        try { st = await fs.promises.stat(p); } catch (e) { continue; }
        let fc = this.files.get(p);
        if (!fc && st.mtimeMs < since) continue;
        if (fc && st.size === fc.size) continue;
        // Codex / WorkBuddy 一个文件就是一个会话，文件名里带会话号
        if (!fc || st.size < fc.size) this.files.set(p, fc = { size: 0, offset: 0, days: new Map(), msgs: new Map(), titles: new Map(), agent,
          sid: (/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/.exec(p) || [])[1] || path.basename(p, ".jsonl") });
        const fh = await fs.promises.open(p, "r");
        try {
          const buf = Buffer.alloc(st.size - fc.offset);
          await fh.read(buf, 0, buf.length, fc.offset);
          fc.size = st.size;
          const end = buf.lastIndexOf(10);
          if (end < 0) continue;
          fc.offset += end + 1;
          const lines = buf.toString("utf8", 0, end).split("\n");
          for (let i = 0; i < lines.length; i++) {
            this.ingest(lines[i], fc, touched);
            if (i % 3000 === 2999) await new Promise((r) => setTimeout(r, 0));   // 大文件分段，别把界面卡住
          }
        } finally { await fh.close(); }
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
    if (d.type === "session_meta") { fc.cwd = p.cwd || ""; fc.app = p.originator || "codex"; return; }
    if (d.type === "turn_context") { if (p.model) fc.model = p.model; return; }
    const ms = Date.parse(d.timestamp);
    if (!ms || (d.type !== "event_msg" && d.type !== "response_item")) return;
    const { key, day, s } = this.touchSess(fc, touched, ms, fc.sid, fc.cwd, fc.app);
    if (d.type === "response_item" && p.type === "message" && p.role === "user") {
      const text = (Array.isArray(p.content) ? p.content : []).filter((b) => b && b.type === "input_text").map((b) => b.text || "").join("").trim();
      if (text && !text.startsWith("<")) this.addPrompt(day, s, text);   // < 开头的是环境说明，不是你敲的
    }
    const t = d.type === "event_msg" && p.type === "token_count" && p.info && p.info.total_token_usage;
    if (t) {
      const prev = fc.tot || { out: 0, fresh: 0, cached: 0 };
      const cur = { out: t.output_tokens || 0, fresh: Math.max(0, (t.input_tokens || 0) - (t.cached_input_tokens || 0)), cached: t.cached_input_tokens || 0 };
      const m = { key, sid: fc.sid, proj: s.proj, model: fc.model, out: Math.max(0, cur.out - prev.out), fresh: Math.max(0, cur.fresh - prev.fresh), cached: Math.max(0, cur.cached - prev.cached) };
      if (m.out || m.fresh || m.cached) fc.msgs.set(`codex:${fc.sid}:${fc.msgs.size}`, m);
      fc.tot = cur;
    }
  }

  ingest(line, fc, touched) {
    if (fc.agent === "workbuddy") return this.ingestWorkbuddy(line, fc, touched);
    if (fc.agent === "codex") return this.ingestCodex(line, fc, touched);
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
    if (d.type === "user") {
      const text = aiIsPrompt(d);
      if (text) {
        day.prompts++;
        // 留一点你发的原话，长期项目拿它和会话标题去匹配「归类：」词
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
    const sess = new Map(), titles = new Map();
    let prompts = 0;
    for (const fc of this.files.values()) {
      for (const [sid, t] of fc.titles) titles.set(sid, t);
      const day = fc.days.get(key);
      if (!day) continue;
      prompts += day.prompts;
      for (const [sid, s] of day.sess) {
        const cur = sess.get(sid);
        if (cur) { cur.ts.push(...s.ts); if (cur.text.length < 300 && s.text) cur.text += " / " + s.text; }
        else sess.set(sid, { proj: s.proj, cwd: s.cwd, app: s.app, agent: aiAgent(s), ts: [...s.ts], text: s.text, segs: [], min: 0, out: 0 });
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
      const g = (res.by[s.agent] ||= { wall: 0, agent: 0, out: 0, segs: [] });
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
      if (sess.has(m.sid)) { sess.get(m.sid).out += m.out; res.by[sess.get(m.sid).agent].out += m.out; }
      if (m.model && m.model !== "<synthetic>") res.models[m.model] = (res.models[m.model] || 0) + m.out;
    }
    res.wall = Math.round(res.wall); res.agent = Math.round(res.agent);
    res.segs = res.segs.map(([a, b]) => [Math.round(a), Math.round(b)]);
    for (const p of Object.values(res.proj)) { p.min = Math.round(p.min); for (const k in p.agents || {}) p.agents[k] = Math.round(p.agents[k]); }
    for (const g of Object.values(res.by)) {
      g.segs = union(g.segs).map(([a, b]) => [Math.round(a), Math.round(b)]);
      g.wall = g.segs.reduce((k, [a, b]) => k + b - a, 0);
      g.agent = Math.round(g.agent);
    }
    // 每个会话一行：长期项目按标题 / 指令 / 目录把它归到项目上（scripts/long-projects.js）
    for (const [sid, s] of sess) res.list.push({ sid, agent: s.agent, dir: s.proj, cwd: s.cwd || "", app: s.app || "", title: titles.get(sid) || "", text: s.text.slice(0, 300),
      min: Math.round(s.min), out: s.out, segs: s.segs.map(([a, b]) => [Math.round(a), Math.round(b)]) });
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
    contentEl.createDiv({ cls: "naut-proj-note", text: "「在 Claude 里打开」用 claude://resume 在 Claude 桌面版里打开那个会话；终端里开的会话，「在终端里继续」在它的工作目录里运行 claude --resume。" });
    for (const g of this.groups) {
      if (g.name) {
        const h = contentEl.createDiv({ cls: "naut-ai-group" });
        h.createSpan({ text: g.name });
        if (g.sub) h.createSpan({ cls: "naut-muted", text: ` · ${g.sub}` });
      }
      const rel = g.list.filter((x) => x.related), weak = g.list.filter((x) => !x.related);
      if (!rel.length) contentEl.createDiv({ cls: "naut-proj-note", text: weak.length ? "没有看起来相关的会话（标题和你发的话里都没有任务名里的词）" : "这段时间里没有 Claude 会话" });
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
    const cli = x.app === "cli";   // 终端里的 Claude Code；其余（claude-desktop 或者旧记录不知道来源的）按桌面版
    const when = x.overlap != null ? `和这件重叠 ${dur(x.overlap)}` : `${clock(x.lastAt)} 还在动`;
    box.createDiv({ cls: "naut-ai-sess-meta", text: `${agent !== "claude" ? AI_AGENTS[agent] : cli ? "终端" : "Claude 桌面版"} · ${x.cwd || x.dir} · ${when} · 这个会话当天 ${dur(x.min)} · 产出 ${fmtTok(x.out)} tok` });
    if (agent !== "claude") return;
    const cmd = (x.cwd ? `cd ${shq(x.cwd)} && ` : "") + `claude --resume ${x.sid}`;
    const bar = box.createDiv({ cls: "naut-ai-sess-btns" });
    const desk = bar.createEl("button", { cls: cli ? "" : "mod-cta", text: "在 Claude 里打开" });
    desk.onclick = () => { require("child_process").execFile("/usr/bin/open", [`claude://resume?session=${x.sid}`], () => {}); this.close(); };
    const term = bar.createEl("button", { cls: cli ? "mod-cta" : "", text: "在终端里继续" });
    term.onclick = () => { run("/usr/bin/osascript", ["-e", `tell application "Terminal"\nactivate\ndo script ${asStr(cmd)}\nend tell`]); this.close(); };
    bar.createEl("button", { text: "复制命令" }).onclick = async () => { await navigator.clipboard.writeText(cmd); new OB.Notice("已复制：" + cmd); };
  }
  onClose() { this.contentEl.empty(); }
}

// 一段文字 + 几个按钮（⌃⌥V 现在怎样）
class TextModal extends OB.Modal {
  constructor(app, title, text, buttons = []) { super(app); this.title = title; this.text = text; this.buttons = buttons; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createDiv({ cls: "naut-status-text", text: this.text });
    if (this.buttons.length) {
      const bar = contentEl.createDiv({ cls: "naut-ai-sess-btns" });
      for (const [label, fn] of this.buttons) bar.createEl("button", { text: label }).onclick = () => { this.close(); fn(); };
    }
  }
  onClose() { this.contentEl.empty(); }
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
  go(n) { this.offset = n; this._enter = true; return this.render(); }

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
    const items = parseJournal(content, cfg);
    const cal = this.plugin.withCalendar(items, date);   // macOS 日历里的事件并进来当固定事件
    // 自动归类到长期项目的行（long-projects.js 按项目的「归类：」词算的）：行号 → 项目
    const projOf = new Map();
    if (cfg.showProjects) {
      const lp = await this.plugin.projects();
      for (const it of lp?.data.items || []) for (const a of it.activity) if (a.file.path === file.path && a.kind !== "提及") projOf.set(a.line, it);
    }
    const dayKey = date.format(cfg.format);
    const done = cfg.doneTimes[dayKey] || {};
    const nowM = moment();
    const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
    const dayRel = this.offset === 0 ? 0 : this.offset < 0 ? -1 : 1;
    const bounds = (cfg.dayBounds || {})[dayKey] || {};
    const orphans = applyWork(items, cfg, dayKey, now, dayRel, bounds);   // 这天做过、但任务行已经挪走的
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
    const info = cap.createDiv({ cls: "naut-cap-text" });
    info.createSpan({ text: `可用 ${dur(plan.available)} · 待办 ${dur(plan.demand)}` });
    if (plan.overflow) info.createSpan({ cls: "naut-over-text", text: ` · 超出 ${dur(plan.overflow)}` });
    else info.createSpan({ text: ` · 富余 ${dur(plan.available - plan.demand)}` });
    if (plan.eventLeft) info.createSpan({ cls: "naut-muted", text: ` · 事件占 ${dur(plan.eventLeft)}` });
    // 按以往预估的准头校准一下：近 30 天整体多用 / 少用了多少
    const rv = cfg.showReview !== false && dayRel >= 0 ? this.plugin.reviewData() : null;
    if (rv && rv.n >= 10 && Math.abs(rv.ratio - 1) >= 0.15 && plan.demand >= 15) {
      info.createSpan({ cls: "naut-muted naut-calib", text: ` · 按以往约 ${dur(plan.demand * rv.ratio)}`,
        attr: { title: `近 ${rv.days} 天做完的 ${rv.n} 件里，实际用时是预估的 ${rv.ratio.toFixed(2)} 倍，待办 ${dur(plan.demand)} 按这个比例约 ${dur(plan.demand * rv.ratio)}` } });
    }

    // 人机协作：这一天 Claude 干了多少（数据见上面「人机协作」一节的口径）
    const ai = aiStore && aiStore.days[dayKey];
    // 这天用了哪几个 Agent（按 Claude / Codex / WorkBuddy 的固定顺序）；旧记录没分 Agent 的都算 Claude
    const agents = !ai ? [] : ai.by ? Object.keys(AI_AGENTS).filter((k) => ai.by[k] && ai.by[k].segs.length).map((k) => [k, ai.by[k]]) : [["claude", { segs: ai.segs, wall: ai.wall, out: ai.out }]];
    if (ai) {
      const models = Object.entries(ai.models).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${fmtTok(n)}`).join("、");
      const only = agents.length === 1 ? AI_AGENTS[agents[0][0]] : "";
      const line = cap.createDiv({ cls: "naut-ai-line", attr: { title: [
        `协作 ${dur(ai.wall)}：有 Claude 在干活的时间，几个窗口同时开只算一次（螺旋内圈的紫线）`,
        `Claude 工时 ${dur(ai.agent)}：${ai.sessions} 个会话各自的活跃时间相加${ai.agent > ai.wall * 1.1 ? `，平均 ${(ai.agent / ai.wall).toFixed(1)} 路并行` : ""}`,
        `产出 ${fmtTok(ai.out)}：Claude 写出来的 token（含思考），${ai.calls} 次调用`,
        `读入 ${fmtTok(ai.fresh)}：新读进来的文件、命令输出`,
        `缓存命中 ${fmtTok(ai.cached)}：每轮重读上下文，不算工作量`,
        `指令 ${ai.prompts}：你亲手发的消息`,
        models && `模型：${models}`,
      ].filter(Boolean).join("\n") } });
      for (const [k] of agents) line.createSpan({ cls: `naut-sw naut-bg-${k}` });
      line.createSpan({ text: `🤖 协作 ${dur(ai.wall)} · ${only || "Agent"} 工时 ${dur(ai.agent)} · 产出 ${fmtTok(ai.out)} tok · ${ai.prompts} 条指令` +
        (agents.length > 1 ? " · " + agents.map(([k, g]) => `${AI_AGENTS[k]} ${dur(g.wall)}`).join(" / ") : "") });
    }
    // 🧭 各个大方向这天花了多久（自动记进日记的会话各归到哪个方向）
    {
      const ds = this.plugin.dirStats(dayKey);
      const dl = this.plugin.dirs().filter((d) => ds[d.name]);
      if (dl.length) cap.createDiv({ cls: "naut-dir-line", text: "🧭 " + dl.map((d) => `${d.name} ${dur(ds[d.name])}`).join(" · "),
        attr: { title: "按大方向合计：自动记进日记的 Agent 会话各归到哪个方向，同一方向几个会话同时开只算一次" } });
    }
    // 🃏 复习卡片（第二大脑的每日回顾记进日记的，每张按「复习用时」秒算）
    const reviews = items.filter(isReview);
    if (reviews.length) {
      const n = reviews.reduce((k, t) => k + +(REVIEW_RE.exec(t.label) || [0, 0])[1], 0);
      const m = reviews.reduce((k, t) => k + (t.dur || 0), 0);
      cap.createDiv({ cls: "naut-review-line", text: `🃏 复习 ${n} 张 · ${dur(m)}`,
        attr: { title: "第二大脑每日回顾里复习的卡片，每张按 5 秒算（第二大脑设置「复习用时」），螺旋上的青色段" } });
    }
    // 🎮 游戏时间（插件每分钟看一眼在不在玩，记在 game-log.json）
    const games = (gameLog && gameLog.days[dayKey]) || [];
    if (games.length) {
      const by = {};
      for (const [a, b, n] of games) by[n] = (by[n] || 0) + b - a;
      const wall = unionMin(games);
      cap.createDiv({ cls: "naut-game-line", text: `🎮 游戏 ${dur(wall)}` + (Object.keys(by).length > 1 || !by.Steam ? " · " + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, m]) => `${n} ${dur(m)}`).join(" · ") : ""),
        attr: { title: "开着 Hearthstone / Steam 里的游戏，或者 Steam 在最前面的时间（螺旋内圈的绿线）。只在 Obsidian 开着时记录。" } });
    }

    // ⏱ 正在专注的这一轮
    const fs = this.plugin.session();
    if (fs && dayRel === 0) {
      const line = cap.createDiv({ cls: "naut-focus-line" });
      const leftOf = (t) => Math.max(0, Math.ceil((t.end - Date.now()) / 60e3));
      const one = (t) => `${t.label} ${leftOf(t) ? `还剩 ${dur(leftOf(t))}` : "到点了"}${fs.tasks.length === 1 ? ` / ${dur(t.minutes)}` : ""}${t.round > 1 ? `（第 ${t.round} 轮）` : ""}`;
      line.createSpan({ text: `⏱ ${fs.tasks.length > 1 ? `${fs.tasks.length} 条线 · ` : ""}${fs.tasks.map(one).join(" · ")}`, attr: { title: fs.tasks.map((t) => `· ${t.label}：${dur(t.minutes)} 一轮，${moment(t.end).format("HH:mm")} 到点`).join("\n") } });
      const stop = line.createEl("button", { cls: "naut-focus-stop", text: "结束", attr: { title: "提前结束这一轮：问你做完了没有" } });
      stop.onclick = () => this.plugin.askDone(fs);
    }
    // 🍚 吃饭 / 锻炼中
    const bk = cfg.breakState;
    if (bk && dayRel === 0) {
      const line = cap.createDiv({ cls: "naut-focus-line naut-break-line" });
      line.createSpan({ text: `${breakIcon(bk.word)} ${bk.word}中 · ${moment(bk.since).format("HH:mm")} 起 · ${dur(Math.max(1, Math.round((Date.now() - bk.since) / 60e3)))}${bk.keys.length ? ` · 暂停了 ${bk.keys.length} 件` : ""}`, attr: { title: bk.labels.map((l) => "· " + l).join("\n") } });
      const back = line.createEl("button", { cls: "naut-focus-stop", text: "回来了", attr: { title: "现在就问要不要切回 DOING" } });
      back.onclick = () => { bk.asking = false; this.plugin.askBack(bk); };
    }

    // 📅 日历：全天事件不占时间，列在这里；读不到时说明原因
    if (cal && (cal.allDay.length || cal.error)) {
      cap.createDiv({ cls: "naut-cal-line" + (cal.error ? " is-error" : ""),
        text: cal.error ? `📅 ${cal.error.split("\n")[0]}` : `📅 全天：${cal.allDay.map((e) => e.title).join("、")}`,
        attr: { title: cal.error || cal.allDay.map((e) => `${e.title}（${e.calendar}）`).join("\n") } });
    }

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
      hov(p, `${clock(a)}–${clock(b)} · ${dur(b - a)}`, workKey(item.label), [item.cal ? `📅 ${item.cal.calendar}` : "", rel.length ? `🤖 ${rel.map(aiName).slice(0, 2).join("、")}` : ""].filter(Boolean).join(" · "));
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
        const proj = projOf.get(r.item.line);
        row.createSpan({ cls: "naut-label", text: (r.item.paused ? "⏸ " : "") + (r.item.cal ? "📅 " : r.item.projRef || proj ? "🧭 " : "") + r.item.label,
          attr: proj ? { title: "算进长期项目：" + proj.short } : r.item.cal ? { title: `日历：${r.item.cal.calendar}${r.item.cal.location ? " · " + r.item.cal.location : ""}` } : {} });
        const sess = aiOf(r.item);
        if (sess.length) {
          const rel = sess.filter((x) => x.related).length;
          const badge = row.createSpan({ cls: "naut-ai-badge" + (rel ? "" : " is-weak"), text: `🤖${rel || sess.length}`,
            attr: { title: `这件做的时候 Claude 在：\n${sess.map((x) => `${x.related ? "· " : "  （同时段）"}${aiName(x)}（${dur(x.overlap)}）`).join("\n")}\n点开看详情、接着那个会话做` } });
          badge.onclick = (e) => { e.stopPropagation(); new AiSessionsModal(this.app, `「${r.item.label}」期间的 Claude 会话`, [{ list: sess }]).open(); };
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
      dur: durText(t), tip: tipOf(t), play: dayRel === 0,
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

    if (ai || aiStore && dayRel === 0) this.renderAi(list, aiStore, date, ai);
    if (cfg.showReview !== false && dayRel === 0) this.renderReview(list);

    // 长期项目：该推一把（数据来自 scripts/long-projects.js，和「长期项目」看板同一份）
    // 入场时列表一行行浮上来（--naut-i = 第几行，最多错开到第 18 行）；长期项目那一节是等数据回来才画的，画完再补一次
    const stagger = () => { if (enter) Array.from(list.children).forEach((el, i) => { if (!el.style.getPropertyValue("--naut-i")) el.style.setProperty("--naut-i", String(Math.min(i, 18))); }); };
    stagger();
    if (cfg.showProjects && dayRel === 0) { await this.renderProjects(list, file); stagger(); }
  }

  // 🤖 人机协作：按项目分 + 近 7 天
  renderAi(list, store, date, ai) {
    const cfg = this.plugin.settings;
    list.createDiv({ cls: "naut-sec", text: "🤖 人机协作" });
    if (ai) {
      const rows = Object.entries(ai.proj).filter(([, p]) => p.out >= 1000 || p.min >= 2).sort((a, b) => b[1].out - a[1].out).slice(0, 5);
      for (const [name, p] of rows) {
        const main = Object.entries(p.agents || {}).sort((a, b) => b[1] - a[1])[0];
        const row = list.createDiv({ cls: `naut-row naut-ai-row naut-by-${main ? main[0] : "claude"}`, attr: main && Object.keys(p.agents).length > 1 ? { title: Object.entries(p.agents).map(([k, m]) => `${AI_AGENTS[k]} ${dur(m)}`).join(" · ") } : {} });
        row.createSpan({ cls: "naut-time", text: dur(p.min) });
        row.createSpan({ cls: "naut-label", text: name });
        row.createSpan({ cls: "naut-dur", text: fmtTok(p.out) });
      }
    }
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = date.clone().subtract(i, "days");
      days.push({ d, s: store.days[d.format(cfg.format)] });
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
    list.createDiv({ cls: "naut-proj-note", text: had.length ? `近 7 天：${had.length} 天在用 · 协作 ${dur(sum("wall"))} · 产出 ${fmtTok(sum("out"))} tok · 日均 ${dur(sum("wall") / 7)}` : "近 7 天还没有 Claude Code 记录" });
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

  async renderProjects(list, file) {
    const lp = await this.plugin.projects();
    if (!lp) return;
    const { LP, data } = lp;
    const open = !this.plugin.settings.projFolded;
    const head = list.createDiv({ cls: "naut-sec naut-proj-head", text: `${open ? "▾" : "▸"} 🧭 长期项目 · 该推一把` });
    head.onclick = () => { this.plugin.settings.projFolded = open; this.plugin.saveSoon(); this.render(); };
    if (!open) return;
    const todayIds = new Set(data.items.filter((i) => i.todayActs.length).map((i) => i.key));
    const doneToday = data.items.filter((i) => i.todayActs.some((a) => a.state === "done")).length;
    // 今天日记里归到各个项目的投入（写了时长按写的，没写的按 long-projects.js 的估算）
    const todays = (i) => i.activity.filter((a) => file && a.file.path === file.path && a.kind !== "提及");
    const spent = data.items.map((i) => ({ i, m: todays(i).reduce((s, a) => s + (a.spent || 0), 0), est: todays(i).some((a) => a.estimated) })).filter((x) => x.m).sort((a, b) => b.m - a.m);
    if (spent.length) list.createDiv({ cls: "naut-proj-note", text: "今天算进长期项目：" + spent.map((x) => `${x.i.short} ${x.est ? "约 " : ""}${x.m >= 60 ? (x.m / 60).toFixed(1) + "h" : x.m + "m"}`).join(" · "), attr: { title: "日记里命中项目「归类：」词的块；没写时长的每块按 15 分钟估" } });
    else if (todayIds.size) list.createDiv({ cls: "naut-proj-note", text: `今天挂在项目上的任务涉及 ${todayIds.size} 个项目${doneToday ? `，已推进 ${doneToday} 个` : ""}（上面带 🧭 的）` });
    // 时长目标（🎯10000h 这种）：累计多少了
    for (const i of data.items.filter((i) => i.goal && i.goal.kind === "时长" && i.hours)) {
      const h = i.hours.total;
      const aiH = i.hours.ai ? `，其中 🤖 Claude 协作 ${i.hours.ai.toFixed(1)}h` : "";
      list.createDiv({ cls: "naut-proj-note", text: `🎯 ${i.short}：累计 ${h >= 100 ? Math.round(h) : h.toFixed(1)} / ${i.goal.target.toLocaleString()} 小时（${(h / i.goal.target * 100).toFixed(2)}%${aiH}）` });
    }
    const rows = data.nudges.filter((n) => n.item.domain !== "外形穿搭").slice(0, 5);
    if (!rows.length) list.createDiv({ cls: "naut-proj-note", text: "没有逾期、快到期或冷掉的项目 👍" });
    for (const n of rows) {
      const i = n.item;
      const row = list.createDiv({ cls: "naut-row naut-proj" });
      row.createSpan({ cls: "naut-time naut-proj-why" + (/逾期/.test(n.reason) ? " is-late" : /剩/.test(n.reason) ? " is-soon" : ""), text: n.reason });
      const lab = row.createSpan({ cls: "naut-label", text: i.short, attr: { title: i.title } });
      lab.onclick = () => this.plugin.openLine(i.file, i.line);
      const add = row.createEl("button", { cls: "naut-proj-add", text: "＋" , attr: { title: "今天推进它：在今天日记里加一条带项目链接的 TODO" } });
      add.onclick = (e) => { e.stopPropagation(); LP.pushTodayModal(i, OB); };
    }
    const more = list.createDiv({ cls: "naut-proj-note naut-link", text: "打开长期项目看板 →" });
    more.onclick = () => { const f = this.app.metadataCache.getFirstLinkpathDest("长期项目", ""); if (f) this.app.workspace.getLeaf(false).openFile(f); };
  }
}

// ---------------- 插件 ----------------

module.exports = class NautilusSpiral extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.states = new Map();   // path -> Map(label -> state)，用来发现「刚改成 DONE」
    this.cal = new MacCalendar();
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
    for (const a of this.actions()) {
      const cmd = { id: a.id, name: a.name };
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

    // 在日历里点某一天（或打开任何一篇日记），螺旋跟着切到那一天
    this.registerEvent(this.app.workspace.on("file-open", (f) => {
      if (!(f instanceof TFile) || !f.path.startsWith(this.settings.folder + "/")) return;
      const d = moment(f.basename, this.settings.format, true);
      if (!d.isValid()) return;
      const offset = d.startOf("day").diff(this.today(), "days");
      for (const v of this.views()) if (v.offset !== offset) v.go(offset);
    }));
    this.registerEvent(this.app.vault.on("modify", (f) => this.onFileChange(f)));
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
          if (this.settings.openTodayOnStartup) await this.openToday();
          if (this.settings.revealOnStartup) await this.activate(false);
        } catch (e) { console.error("[螺旋日程] 启动页失败", e); }
      }, 600);
    });
  }

  // 长期项目数据：载入共用脚本，结果缓存 20 秒（日记每次保存都会重绘，不必每次全库扫）
  async projects() {
    try {
      const f = this.app.vault.getAbstractFileByPath(LP_SCRIPT);
      if (!(f instanceof TFile)) return null;
      if (!this._lp || this._lpMtime !== f.stat.mtime) {
        this._lp = new Function("app", "require", await this.app.vault.adapter.read(LP_SCRIPT))(this.app, require);
        this._lpMtime = f.stat.mtime;
        this._lpData = null;
      }
      // 第一次同步算；之后日记一改只标记「过期」，先用旧数据画，等你停手几秒再在空闲时重算（全库扫一遍要几百毫秒，
      // 以前每次保存都同步重算，会把编辑器卡住 —— ⌘/ 连按不动就是这个原因）
      if (!this._lpData) await this.recomputeProjects();
      else if (this._lpStale || Date.now() - this._lpAt > 120000) this.scheduleProjects();
      return { LP: this._lp, data: this._lpData };
    } catch (e) {
      console.error("[螺旋日程] 长期项目读取失败", e);
      return null;
    }
  }

  async recomputeProjects() {
    if (!this._lp) return;
    this._lpData = await this._lp.collect({ exclude: [] });
    this._lpAt = Date.now();
    this._lpStale = false;
  }
  scheduleProjects(delay = 4000) {
    window.clearTimeout(this._lpTimer);
    this._lpTimer = window.setTimeout(() => {
      const run = async () => { try { await this.recomputeProjects(); this.refresh(); } catch (e) { console.error("[螺旋日程] 长期项目重算失败", e); } };
      window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 3000 }) : run();
    }, delay);
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
    const head = `可用 ${dur(plan.available)} · 待办 ${dur(plan.demand)}`;
    const lines = [plan.overflow ? `${head} · ⚠️ 超出 ${dur(plan.overflow)}` : `${head} · 富余 ${dur(plan.available - plan.demand)}`];
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
    lines.push(`⏳ 可用 <b>${dur(plan.available)}</b> · 📋 待办 <b>${dur(plan.demand)}</b> · ` +
      (plan.overflow ? `🔴 超出 <b>${dur(plan.overflow)}</b>` : `🟢 富余 <b>${dur(plan.available - plan.demand)}</b>`));
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
      const props = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-dasharray", "opacity", "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline"];
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
    const ai = this.settings.showAi !== false && (await this.aiUsage()).days[dayKey];
    if (ai) out.push(`🤖 协作 ${dur(ai.wall)} · Claude 工时 ${dur(ai.agent)} · 产出 ${fmtTok(ai.out)} tok`);
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
      { id: "doing-ai", name: "正在做的事的 Claude 会话", key: ca("C"), run: () => this.showDoingAi() },
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
      { id: "auto-log", name: "现在把 Agent 会话整理进今天的日记", run: async () => {
        const r = await this.autoLogRun();
        new OB.Notice(r.error ? `没整理成：${r.error}` : r.changes.length ? `整理进日记了：\n${r.changes.join("\n")}` : "没有要改的：会话都已经记过了，或者还太短", 8000);
      } },
      { id: "focus-end", name: "结束这一轮专注（问做完了没有）", key: ca("E"), when: () => !!this.session(), run: () => this.askDone(this.session()) },
      { id: "break-back", name: "吃饭 / 锻炼回来了（问要不要切回 DOING）", key: ca("B"), when: () => !!this.settings.breakState, run: () => { this.settings.breakState.asking = false; this.askBack(this.settings.breakState); } },
      { id: "review", name: "预估 vs 实际（复盘）", key: ca("R"), run: () => this.showReview() },
      { id: "open", name: "打开螺旋日程", key: ca("O"), run: () => this.activate() },
      { id: "day-bounds", name: "设置今天的起床 / 收工时间", key: ca("T"), run: () => new BoundsModal(this.app, this, this.today()).open() },
      { id: "open-today", name: "打开今天的日记（凌晨按日界算前一天）", run: () => this.openToday() },
      { id: "calendar-refresh", name: "重新读取 macOS 日历", run: () => { this.cal.cache.clear(); this.refresh(); } },
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
    const lines = [];
    const s = this.session();
    if (s) lines.push(`⏱ 专注中 · ${s.tasks.length} 条线`, ...s.tasks.map((t) => `   ${t.label} · ${Date.now() < t.end ? `还剩 ${dur(Math.ceil((t.end - Date.now()) / 60e3))}` : "到点了"}（${moment(t.end).format("HH:mm")} 到点）`), "");
    const b = this.settings.breakState;
    if (b) lines.push(`${breakIcon(b.word)} ${b.word}中 · ${moment(b.since).format("HH:mm")} 起 · ${dur(Math.max(1, Math.round((Date.now() - b.since) / 60e3)))}${b.keys.length ? ` · 暂停了 ${b.keys.length} 件` : ""}`, "");
    const file = this.todayFile();
    if (file) {
      const items = parseJournal(await this.app.vault.cachedRead(file), this.settings);
      const doing = items.filter((t) => t.kind === "task" && t.state === "open" && t.doing);
      const paused = items.filter((t) => t.kind === "task" && t.state === "open" && t.paused);
      if (doing.length) lines.push(`▶ 在做 ${doing.length} 件：${doing.map((t) => t.label).join("、")}`);
      if (paused.length) lines.push(`⏸ 暂停 ${paused.length} 件：${paused.map((t) => t.label).join("、")}`);
      if (doing.length || paused.length) lines.push("");
    }
    lines.push(await this.capacityText());
    new TextModal(this.app, `现在 · ${moment().format("HH:mm")}`, lines.join("\n"), [
      ["正在做的事的 Claude 会话", () => this.showDoingAi()],
      ["打开螺旋日程", () => this.activate()],
    ]).open();
  }

  // ⌃⌥C 正在做的事（DOING，加上这一轮专注里的）各自期间的 Claude 会话；再加上最近 15 分钟还在动、没对上任何一件的会话
  async showDoingAi() {
    const cfg = this.settings;
    const file = this.todayFile();
    if (!file) { new OB.Notice("今天还没有日记"); return; }
    if (OB.Platform?.isDesktopApp && !this._aiBusy) await this.scanAi();   // 先读一遍最新的会话日志
    const key = this.today().format(cfg.format);
    const ai = (await this.aiUsage()).days[key];
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
    if (!doing.length && !live.length) { new OB.Notice("现在没有在做的事，也没有在跑的 Claude 会话"); return; }
    new AiSessionsModal(this.app, "正在做的事 · Claude 会话", groups).open();
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

  // ---- macOS 日历 ----

  // 这天的日历事件：先交缓存（同步），过期了在后台重读，读完有变化再重画。关着或不是 Mac 桌面版返回 null
  calendarFor(date) {
    if (!this.settings.calendar || !(OB.Platform && OB.Platform.isMacOS && OB.Platform.isDesktopApp)) return null;
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
      for (const e of await this.cal.call([mid + cfg.dayStart * 60e3 * 60, mid + cfg.dayEnd * 60e3 * 60])) {
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
      next = { at: Date.now(), items, allDay };
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
    if (item.cal) require("child_process").execFile("/usr/bin/open", ["-b", "com.apple.iCal"], () => {});   // 日历事件：打开「日历」App
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
      this._ai ||= new AiUsage(this.settings);
      // 头一回（或汇总格式升级后）把现存日志全读一遍补历史；之后重启只读最近改过的
      const upgrade = this.aiStore.v !== AI_STORE_V;
      const since = this.aiStore.backfilled && !upgrade ? Date.now() - (AI_FRESH_DAYS + 2) * 864e5 : 0;
      const touched = await this._ai.scan(this._ai.files.size ? Date.now() - 2 * 864e5 : since);
      const changed = this._ai.merge(this.aiStore, touched, upgrade) || !this.aiStore.backfilled || upgrade;
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
  // 发出去：有「任务提醒」插件就走它的 Telegram，没有就发 Discord，再没有就只在 Obsidian 里显示
  async sendWeekly() {
    const text = this.weeklyDirs();
    if (!text) return "这一周还没有按方向记下来的时间";
    const np = this.app.plugins.plugins["nautilus-notify"];
    if (np && np.tg && await np.tg(text, "").catch(() => false)) return "发到 Telegram 了";
    if (await this.toDiscord(text)) return "发到 Discord 了";
    new OB.Notice(text, 20000);
    return "Telegram 和 Discord 都没发出去，先显示在这里";
  }
  // 周日晚上 9 点以后（按日记日算，过了零点还算周日）发一次
  weeklyTick() {
    const cfg = this.settings;
    if (cfg.weeklyDirs === false) return;
    const day = this.today(), h = moment().hours();
    const week = day.format("GGGG-[W]WW");
    if (day.isoWeekday() !== 7 || (h < 21 && h >= (cfg.dayCutoff ?? 8)) || cfg.weeklySent === week || this._weeklyBusy) return;
    this._weeklyBusy = true;
    this.sendWeekly().then(() => { cfg.weeklySent = week; return this.saveData(cfg); }).catch((e) => console.error("[螺旋日程] 每周方向回顾没发出去", e)).finally(() => { this._weeklyBusy = false; });
  }

  // 这一天各个大方向花了多久（分钟）：自动记进日记的会话各归到哪个方向，同一方向几个会话同时开只算一次
  dirStats(dayKey = this.today().format(this.settings.format)) {
    const st = (this.settings.autoLogState || {})[dayKey] || {};
    const day = this.aiStore && this.aiStore.days[dayKey];
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
  //   · 还在动 = DOING；停了一阵 = 小模型判断是 DONE 还是 SUSPENDED，回复里明说要你做的事另记成 TODO
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
      const hit = agent === "claude" ? [...fc.days.values()].some((d) => d.sess.has(x.sid)) : fc.sid === x.sid;
      if (hit && (!best || fc.size > best.size)) best = { p, size: fc.size };
    }
    const out = { prompts: [], last: "" };
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
    out.prompts = out.prompts.slice(-4).map((t) => clip(t).slice(0, 160));
    out.last = clip(out.last).slice(-700);
    return out;
  }

  // 让小模型看这几个会话：各起一个短名字、对上日记里已有的哪一行、归哪个大方向；停了的再看是不是其实做完了、有没有要你做的后续。
  // 返回 Map(会话号 → { label, matchKey, done, dir, todos, skip })；模型没回或者回得不对，返回空 Map，下一轮再问
  async autoAsk(ask, open) {
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
    try { raw = await runClaude(prompt, { bin: cfg.claudePath || "~/.local/bin/claude", model: cfg.autoLogModel || "haiku" }); }
    catch (e) { console.error("[螺旋日程] 自动记日记：问模型失败", e); this._autoErr = String(e.message || e); return new Map(); }
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

  // 这一行现在是什么状态：done / doing / suspended / open（TODO、PAUSED）；找不到返回 null
  autoFind(text, key) {
    const hits = parseJournal(text, this.settings).filter((i) => i.kind === "task" && workKey(i.label) === key);
    const it = hits.find((i) => i.state === "open") || hits[0];
    return it ? { it, cur: it.state === "done" ? "done" : it.doing ? "doing" : it.suspended ? "suspended" : "open" } : null;
  }

  // 把一个会话对应的那一行改成 DOING 或 SUSPENDED（机器只在这两个之间切，DONE 留给你自己改）。那一行不存在而且是新会话，就新写一行
  autoLine(text, rec, x, status) {
    const lines = text.split("\n");
    const found = this.autoFind(text, rec.key);
    const first = x.segs[0][0];
    if (!found) {
      if (!rec.fresh) return { text, gone: true };
      return { text: this.placeBlock(text, [status === "doing" ? `- DOING ${clock(first)} ${rec.label}` : `- SUSPENDED ${rec.label}`]) };
    }
    const { it } = found;
    const raw = lines[it.line];
    const p = splitTask(raw);
    if (!p) return { text };
    // 自己写的行文字是定的；接在你写的行上就留着你的原话，只去掉开头的时间段
    const body = rec.created ? rec.label : p.rest.replace(/^\d{1,2}[:：]\d{2}\s*[-–~～到至]\s*\d{1,2}[:：]\d{2}\s*/, "");
    const next = status === "doing" ? `${p.prefix}DOING ${p.since && p.kw === "DOING" ? p.since : clock(rec.created ? first : x.segs[x.segs.length - 1][0])} ${body}` : `${p.prefix}SUSPENDED ${body}`;
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

  // 实际做的时段写在那一行下面的第一个子项里（⏱ 开头，解析日记时跳过这种行）：⏱ 00:45–00:58、04:02–05:10 · 共 1h21m · Claude
  // 隔了不到 10 分钟的两段并成一段写，免得太碎；太多段只写最后 8 段
  autoClock(text, key, segs, who) {
    const found = this.autoFind(text, key);
    if (!found || !segs.length) return text;
    const lines = text.split("\n");
    const at = found.it.line;
    const shown = [];
    for (const [a, b] of segs) { const last = shown[shown.length - 1]; if (last && a - last[1] <= 10) last[1] = Math.max(last[1], b); else shown.push([a, b]); }
    const total = Math.round(segs.reduce((n, [a, b]) => n + b - a, 0));
    const indent = /^\s*/.exec(lines[at])[0] + "\t";
    const line = `${indent}- ⏱ ${shown.length > 8 ? "… " : ""}${shown.slice(-8).map(([a, b]) => `${clock(a)}–${clock(b)}`).join("、")} · 共 ${durTag(total)}${who ? " · " + who : ""}`;
    const base = /^\s*/.exec(lines[at])[0].replace(/\t/g, "    ").length;
    for (let i = at + 1; i < lines.length; i++) {
      if (lines[i].trim() && /^\s*/.exec(lines[i])[0].replace(/\t/g, "    ").length <= base) break;
      if (/^\s*[-*+]\s+⏱/.test(lines[i])) { if (lines[i] === line) return text; lines[i] = line; return lines.join("\n"); }
    }
    lines.splice(at + 1, 0, line);
    return lines.join("\n");
  }

  // dry = 只算不写，返回打算怎么改（report.diff）
  async autoLogRun({ dry = false } = {}) {
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
      const day = this.aiStore && this.aiStore.days[dayKey];
      if (!day || !day.list) return report;
      const nowM = moment();
      const now = normalize(nowM.hours() * 60 + nowM.minutes(), cfg);
      const idle = Math.max(5, cfg.autoLogIdle || 40);
      const st = this.autoState(dayKey);
      snap = JSON.stringify(st);
      const since = cfg.autoLogSince ? aiDay(cfg.autoLogSince, cfg) : null;
      const lastOf = (x) => x.segs[x.segs.length - 1][1];
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
        } else if (rec.status === "doing" && !active && !rec.asked) todo.push({ x, active, rec });   // 刚停下来：问一次是不是其实做完了、有没有要你做的
        else live.push({ x, active, rec });
      }
      // 1. 新会话、刚停下来的会话：问小模型（一次最多 8 个，多的下一轮）
      const ask = todo.slice(0, 8);
      let ans = new Map();
      if (ask.length) {
        // 能接上去的行：还没做完的任务。带子任务的大项不算，自己记的「要你做的后续」也不算
        const open = parseJournal(await this.readJournal(file), cfg).filter((i) => i.kind === "task" && i.state === "open" && !i.container && !(i.label.startsWith(AUTO_MARK.trim()) && !i.doing && !i.suspended)).slice(0, 60);
        ans = await this.autoAsk(ask, open);
        report.asked = ask.length;
        report.error = this._autoErr || "";
      }
      // 2. 照着改日记（从这里到写回之间不等别的东西，免得你正好在打字）
      const base = await this.readJournal(file);
      let text = base;
      const work = ((cfg.workLog ||= {})[dayKey] ||= {});
      const digest = { doing: [], suspended: [], done: [], todo: [] };
      const clocks = new Set();
      for (const { x, active, fresh } of [...ask, ...todo.slice(8), ...live]) {
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
          rec = st[x.sid] = { key: workKey(probe && probe.label ? probe.label : label), label, created: !m, dir: a.dir, status: m ? (m.doing ? "doing" : m.suspended ? "suspended" : "open") : null, fresh: !m };
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
        // 你手动改过状态：照你改的记。你停下的，要等会话有了新动静才改回 DOING；你改成 DOING 的，两小时内不因为会话没动就搁置
        if (rec.status && cur !== rec.status) {
          if (cur === "doing") rec.hold = Date.now() + 2 * 3600e3; else rec.parkedAt = now;
          rec.status = cur;
        }
        const name = workKey(rec.label).replace(AUTO_MARK, "");
        if (active && cur !== "doing" && !(rec.parkedAt != null && last <= rec.parkedAt)) {
          const r = this.autoLine(text, rec, x, "doing");
          text = r.text; rec.status = "doing"; delete rec.parkedAt; delete rec.fresh;
          digest.doing.push(name);
          report.changes.push(`DOING：${rec.label}`);
        } else if (!active && (cur === "doing" || rec.fresh) && !(rec.hold && Date.now() < rec.hold)) {
          const r = this.autoLine(text, rec, x, "suspended");
          text = r.text; rec.status = "suspended"; rec.parkedAt = last; delete rec.fresh;
          clocks.add(rec.key);
          digest.suspended.push(`${name}（${dur(x.min)}）`);
          report.changes.push(`SUSPENDED：${rec.label}（${dur(x.min)}）`);
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
      // 3. 用时：各个会话真正在动的时段，记到它那一行名下（同一行接了几个会话就并起来）；搁置和做完的，时段写进日记正文
      const byKey = new Map(), who = new Map();
      for (const x of day.list) {
        const rec = st[x.sid];
        if (!rec || rec.skip || rec.gone || !rec.key) continue;
        (byKey.get(rec.key) || byKey.set(rec.key, []).get(rec.key)).push(...x.segs);
        (who.get(rec.key) || who.set(rec.key, new Set()).get(rec.key)).add(AI_AGENTS[aiAgent(x)]);
      }
      const merged = new Map();
      for (const [k, segs] of byKey) merged.set(k, unionSegs([...(work[k] || []).filter((s) => s[1] != null), ...segs].map(([a, b]) => [a, b])));
      for (const k of clocks) if (merged.has(k)) text = this.autoClock(text, k, merged.get(k), [...who.get(k)].join(" / "));
      report.diff = diffLines(base, text);
      if (dry) { cfg.autoLogState[dayKey] = JSON.parse(snap); return report; }
      if (!(await this.writeJournal(file, base, text))) {
        cfg.autoLogState[dayKey] = JSON.parse(snap);   // 日记正好被改了：这一轮不算，下一轮重来
        report.error = "日记正在被改，这一轮没写";
        return report;
      }
      for (const [k, segs] of merged) work[k] = segs;
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
      sec(`💤 ${idle} 分钟没动，先搁置了`, d.suspended),
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

  // 打开「今天」的日记：已经开着就切过去，当前标签是空白页就用它，否则开新标签；没有就建一篇
  async openToday() {
    const d = this.today();
    const path = this.journalPath(d);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      file = await this.app.vault.create(path, `---\njournal: 每日\njournal-date: ${d.format("YYYY-MM-DD")}\n---\n`);
    }
    let target = null;
    this.app.workspace.iterateRootLeaves((l) => { if (!target && l.view?.file?.path === path) target = l; });
    if (!target) {
      const cur = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
      target = cur && cur.view?.getViewType() === "empty" ? cur : this.app.workspace.getLeaf("tab");
      await target.openFile(file);
    }
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }

  async onFileChange(f) {
    if (!(f instanceof TFile) || !f.path.startsWith(this.settings.folder + "/")) return;
    const content = await this.app.vault.read(f);
    const prev = this.states.get(f.path);
    this.observe(f, content, true);
    this.enforce(f, content, prev).catch((e) => console.error("[螺旋日程] 规则执行失败", e));
    this._lpStale = true;
    this.scheduleProjects();
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
      const stop = (k, at) => {
        const seg = openSeg(k);
        if (!seg) return;
        seg[1] = Math.max(seg[0], at);
        if (seg[1] - seg[0] < 1) work[k].splice(work[k].indexOf(seg), 1);   // 不到一分钟的不记
        if (!work[k].length) delete work[k];
        changed = true;
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
    num("日记日期分界（点）", "早上几点前还算前一天的日记，比如 8 = 早上 8 点前都算昨天", "dayCutoff", 0, 12);
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
    text("提醒发到 Discord 的哪个频道", "填本机 notify-discord 脚本认的频道名（比如 routine）。不用你回答的提醒（自动暂停、欢迎回来、自动记成做完 / 搁置、专注到点）发到这个频道，发出去了就不在本机再弹一遍；要你点按钮的照旧在本机弹。空着 = 不发", "discordChannel");
    containerEl.createEl("h3", { text: "🤖 自动记日记" });
    containerEl.createEl("p", { cls: "setting-item-description", text: "每隔一阵看一眼今天的 Claude / Codex / WorkBuddy 会话：还在动的记成 DOING，停了的由小模型判断是 DONE 还是 SUSPENDED，回复里明说要你做的事记成 TODO。能对上日记里已有的行就改那一行，对不上就新写一行（开头带 🤖）。用时按会话真正在动的时段算。你自己改过状态或者删掉的行，之后不再管。" });
    new Setting(containerEl).setName("自动把 Agent 会话记进今天的日记").setDesc("打开的这一刻之前就停了的会话不补记")
      .addToggle((t) => t.setValue(!!s.autoLog).onChange(async (v) => { s.autoLog = v; if (v) s.autoLogSince = Date.now(); await this.plugin.saveData(s); }));
    num("每隔几分钟整理一次", "", "autoLogEvery", 5, 240);
    num("多久没动算停了（分钟）", "会话这么久没有动静，就把它那一行从 DOING 改成 SUSPENDED，并把实际做的时段写在这一行下面（⏱ 开头的子项）；又动了改回 DOING", "autoLogIdle", 5, 600);
    text("本机提醒的提示音", "系统声音的名字（Pop、Glass、Ping、Tink、Submarine…）或者一个声音文件的路径；空着不响", "notifySound");
    new Setting(containerEl).setName("每周方向回顾").setDesc("周日晚上 9 点以后发一条：这一周各个大方向花了多久、占多少、和上周比。走「任务提醒」的 Telegram，没有就发 Discord")
      .addToggle((t) => t.setValue(s.weeklyDirs !== false).onChange(async (v) => { s.weeklyDirs = v; await this.plugin.saveData(s); }));
    text("用哪个模型判断", "claude 命令行的 --model，比如 haiku、sonnet。只在出现新会话、或者会话停下来时问一次，一次很短", "autoLogModel");
    text("claude 命令路径", "本机 Claude Code 的命令行（要先登录过）", "claudePath");
    new Setting(containerEl).setName("改了日记就告诉我").setDesc("每次整理把改了什么合成一条发出来（在做的、搁置的、看着像做完了的、记了要你做的，各折成一组）")
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
    num("复盘看最近几天", "", "reviewDays", 7, 45);
    new Setting(containerEl).setName("启动时打开今天的日记").setDesc("按上面的「日记日期分界」算今天：已经开着就切过去，没开就开一个新标签，还没有这篇就新建")
      .addToggle((t) => t.setValue(s.openTodayOnStartup !== false).onChange(async (v) => { s.openTodayOnStartup = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("启动时左侧栏显示螺旋日程").setDesc("展开左侧栏并切到螺旋日程标签（Wiki、文件列表等标签还在，点图标切换）")
      .addToggle((t) => t.setValue(s.revealOnStartup !== false).onChange(async (v) => { s.revealOnStartup = v; await this.plugin.saveData(s); }));
    new Setting(containerEl).setName("显示人机协作").setDesc("读 Claude Code 的本地会话日志（~/.claude/projects），在容量条下面显示当天协作时长、token 产出，螺旋内圈画出 Claude 在干活的时段；汇总另存在插件目录的 ai-usage.json")
      .addToggle((t) => t.setValue(s.showAi !== false).onChange(async (v) => { s.showAi = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    new Setting(containerEl).setName("记录游戏时间").setDesc("每分钟看一眼在不在玩，螺旋最里面一圈画绿线；记在插件目录的 game-log.json。只在 Obsidian 开着时记录")
      .addToggle((t) => t.setValue(s.trackGames !== false).onChange(async (v) => { s.trackGames = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
    text("游戏进程关键词", "进程路径里含这些词就算在玩，逗号分隔；steamapps/common 会按游戏文件夹名分开记", "gameProcs");
    text("在最前面才算的 App", "这些 App 常驻后台，只有切到最前面时才算游戏时间，比如 Steam 客户端", "gameFrontApps");
    new Setting(containerEl).setName("显示长期项目提醒").setDesc("在今天的列表底部显示「🧭 长期项目 · 该推一把」，数据和「长期项目」看板同一份（scripts/long-projects.js）")
      .addToggle((t) => t.setValue(s.showProjects !== false).onChange(async (v) => { s.showProjects = v; await this.plugin.saveData(s); this.plugin.refresh(); }));
  }
}

module.exports.core = { parseJournal, parseDuration, parseProgress, applyWork, workKey, schedule, fill, normalize, toDoing, toDone, toTodo, toPaused, breakWord, subtree, focusMinutes, DEFAULTS, AiUsage, fmtTok, unionMin };
