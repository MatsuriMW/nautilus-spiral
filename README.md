# Nautilus Spiral（螺旋日程）

A spiral day planner for Obsidian that reads your daily note.

Events stay pinned to their time. To-dos flow from "now" into the free gaps, in list order and by estimated duration. As time moves on, unfinished tasks are pushed forward, and a capacity bar tells you whether today still fits. What you actually did is drawn on the same spiral, so plan and reality sit side by side.

**The interface and most of this README are in Chinese.** [中文说明](#中文说明)

## What it does

- **A 12-hour dial that winds inward.** The outer end is the start of your day, the inner end is the end. Fixed events, planned to-dos, finished tasks and "now" are all on it. Hover any segment and the line above the spiral shows what it is, instantly.
- **Plans itself from your list.** Write `14:00-15:30 meeting` for an event and `TODO reply to mail 20m` for a to-do. Chinese time and duration phrases are understood too (`3点到5点`, `半小时`). The plugin re-plans every minute; you never drag blocks around.
- **Tracks actual time.** A task counts while it is `DOING` and stops when it becomes `DONE`, `PAUSED` or `TODO` again. Interrupted work becomes several spans. An "estimated vs actual" review shows how far off your estimates usually are.
- **Focus rounds.** Start a task with a timer and, optionally, a Raycast Focus session. Or start a round for a broad direction instead of a single task.
- **macOS Calendar, read-only.** Calendar events can be laid onto the spiral as fixed events.
- **Agent time.** Reads the local session logs of Claude Code, Codex and WorkBuddy and draws when each agent was working as thin inner rings, one colour per agent.
- **Human–agent co-writing (optional, off by default).** While an agent session is active, the matching line in your daily note becomes `DOING`; after 40 idle minutes it becomes `SUSPENDED` and the actual time spans are written under it. The plugin never marks anything `DONE` for you.
- **Weekly direction review.** Each session is filed under a broad direction; on Sunday night you get the week's split.

## Requirements

- **Desktop only.** Developed and used on macOS. The spiral, planning and time tracking are plain Obsidian; calendar, dialogs, sounds, focus prompts and game tracking are macOS-only. Windows and Linux are untested.
- **Daily notes written as lists**, one file per day. Folder and file name format are settings (defaults: `日记/`, `YYYY_MM_DD`).
- Optional: Xcode Command Line Tools (for the calendar helper), Raycast (Focus), the `claude` CLI (co-writing).

## Install

Until it is listed in the community directory: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/MatsuriMW/nautilus-spiral/releases/latest) into `<vault>/.obsidian/plugins/nautilus-spiral/`, or add this repository in BRAT.

## Network, accounts and files outside your vault

Nothing leaves your computer unless you turn on one of the optional features below. There is no telemetry and nothing to pay for.

| What | When | Where it goes |
|---|---|---|
| Session titles, your last few prompts, the end of the last reply, and your open task lines | Only with "co-writing" on, when a new session appears or one goes idle | Your own `claude` CLI, i.e. Anthropic, under your Claude Code login. Runs of 12 or more digits are removed first |
| The spiral image and text summaries | Only if you use the companion plugins that send them | Telegram Bot API, through your own bot |
| Reminders, including task names | Only if you set a Discord channel | Your own local `notify-discord` script and the webhook it holds |

Files read outside the vault, all read-only: `~/.claude/projects`, `~/.config/claude/projects`, `~/.codex/sessions`, `~/.workbuddy/projects` (agent session logs; turn the feature off in settings to stop). A daily summary is kept in the plugin folder as `ai-usage.json`.

Files written outside the vault: `~/Library/Caches/nautilus-spiral/` (small Swift helpers compiled on first use, for the calendar and an experimental notification app).

Local programs it starts: `osascript` (dialogs), `swiftc` and `codesign` (building the helpers), `afplay` (sounds), `open` (Raycast deeplinks and bringing Obsidian forward), `ps` and `sh` (game tracking), and `claude` when co-writing is on.

## Credits

The idea of a spiral day planner where events are fixed and tasks flow around them, "give every minute a job", comes from [Nautilus](https://github.com/tombarys/roam-depot-nautilus) for Roam Research by Tomáš Baránek, and from its descendants [Nautilus Enhanced](https://github.com/hopeserena/nautilus-enhanced) and [Nautilus Log](https://github.com/404KSG/roam-nautilus-log). Obsidian already has two ports of that line: [Nautilus Log](https://github.com/accessiblefish/obsidian-nautilus-log) and [Nautilus Logger](https://github.com/dimpurr/obsidian-nautilus-logger).

This plugin shares the idea, not the code. It was written separately for a different workflow: the daily note itself is the data source, written as a plain list with Logseq-style task keywords, and agent session logs are used as evidence of what actually happened.

MIT licensed.

---

<a id="中文说明"></a>

# 螺旋日程

把今天日记里的事件和待办画成一圈螺旋：固定事件钉在它的时刻上，待办按列表顺序和预计时长，从「现在」开始自动填进事件之间的空档。时间往前走，没做完的任务就跟着往后流；排不下的，当场告诉你缺多少。

插件只读日记，会改日记的只有三种时候：你开始做一件事、你回答「做完了吗」、触发了下面的暂停规则。每次都只改那几行（DOING / DONE / PAUSED）。日记照常用列表写，在 Obsidian 里写、在 Bike 里写、从 Telegram 记进来都行。打开设置后，macOS「日历」里的事件也会当固定事件排进来，▶ 还可以顺带开一段 Raycast 专注。

## 原理：给每一分钟安排一份工作

记账软件 YNAB 的方法是「给每一块钱安排一份工作」：钱进来先分到各个用途上，花的时候心里有底。螺旋日程把同样的办法用在时间上：

- **一天是一笔预算。** 从现在到收工的时间，扣掉已经定死的事件（吃饭、开会、通勤），剩下的就是今天能自由分配的分钟数，也就是容量条上的「可用」。
- **每件待办都要先报价。** 写上预计时长（`30m`、`2h`），没写的按 15 分钟算。所有待办的报价加起来是「待办」，和「可用」一比，今天是富余还是超支一眼就清楚。
- **时间是一条往前流的河。** 螺旋上的「现在」指针一直往前走，没做完的任务被它推着往后挪；遇到固定事件放不下，就整块跳到下一个空档，后面放得下的小任务自动往前补位。你不用手动改计划，插件每分钟重排一次。
- **规则简单，不靠 AI。** 事件先占位，正在做的排最前，其余按列表顺序依次找最早放得下的空档。想调整先后，在日记里上下挪一下那一行就行。

预计和实际是两回事，插件把两者分开记，也能放在一起看：

- **预计**是弹性推演：按你写的时长往前排，随时间重算，用来回答「今天还排得下吗、接下来做什么」。
- **实际**是事后的实证：任务改成 DOING 的那一刻开始计时，改回来或做完时停止，中断再继续就记成好几段。做完的任务按实际做的时段画在螺旋上，和当初的预计放在一起，一天下来哪件事估短了、哪段时间被打断了，都能看到。

## 三步用起来

1. **在日记里写事件和待办。** 日记默认在 `日记/YYYY_MM_DD.md`（设置里可改），每件事一个列表项，写法见下一节。
2. **打开螺旋。** 点左侧功能区的螺旋日程图标（orbit），或运行命令「打开螺旋日程」。默认每次启动 Obsidian 都会打开今天的日记，并把左侧栏切到螺旋。
3. **做的时候改状态。** 开始做一件事改成 `DOING`，做完改成 `DONE`。也可以按 ⌘⇧↵ 开始，到点回答「做完了」，插件替你改。螺旋会随日记保存自动重画。

## 日记里的写法

```markdown
- 08:00-08:30 早饭
- 12:00-13:00 午饭
- 14:30-15:30 和小李开会
- DONE 07:30-08:00 跑步
- **09:40** 想到一个选题：时间预算
- DOING 09:10 写稿 2h 40%
- TODO 剪视频 1.5h ⭐
- TODO 回邮件 20m
- TODO 整理笔记
- WAITING 等合同回来 1h
- TODO 16:00 打电话给妈妈
```

早上 10 点打开螺旋，插件读出来的是：

| 时间 | 事项 | 说明 |
|---|---|---|
| 09:10–10:00 | 写稿 | 已经做掉的一段，画得淡一些 |
| 10:00–11:12 | 写稿 | 预估 2h、写了 40%，还剩 1h12m |
| 11:12–12:00、13:00–13:42 | 剪视频 | 被午饭隔成两段（每段都不短于 25 分钟才切）；带 ⭐，画成红色 |
| 13:42–14:02 | 回邮件 | |
| 14:02–14:17 | 整理笔记 | 没写时长，按默认 15 分钟 |
| 16:00–16:15 | 打电话给妈妈 | 写了时刻的待办当事件处理，钉在 16:00 |
| — | 等合同回来 | WAITING：挂起，不排、不占容量 |

容量条显示「可用 11h45m · 待办 3h17m · 富余 8h28m · 事件占 2h15m」（一天按 24 点结束算）。

### 每一行会被认成什么

| 写法 | 认成 | 例子 |
|---|---|---|
| 带时间段的列表项 | **固定事件**（黄色） | `14:00-15:30 开会`、`3点到5点 上课`、`9点半-10 通勤` |
| 任务关键词或复选框 | **待办**（蓝色） | `TODO 回邮件 20m`、`- [ ] 回邮件 20m` |
| 待办里写了一个时刻 | **钉住的待办**，按事件处理 | `TODO 16:00 打电话 15m` |
| `**07:37**` 开头、不是任务 | **记录点**，螺旋上画一个小点 | `**07:37** 起床` |
| 其它普通列表项 | 不参与排程 | |

关键词和复选框：

| 状态 | 写法 |
|---|---|
| 待办 | `TODO`、`LATER`、`[ ]` |
| 进行中（排在最前） | `DOING`、`NOW`、`IN-PROGRESS`、`[/]` |
| 暂停（停一下，照常排，接着做时扣掉做过的） | `PAUSED` |
| 搁置（短期不推，不排、不占容量） | `SUSPENDED`、`WAITING`、`WAIT` |
| 完成 | `DONE`、`[x]` |
| 取消（直接忽略） | `CANCELED`、`CANCELLED`、`FAILED`、`[-]` |

时长写在任务文字里任何位置都行：`30m`、`45min`、`2h`、`1.5h`、`2h30m`、`半小时`、`两小时`、`一个半小时`、`25～30分钟`（写成范围的按上限算）。

进度写成 `40%`、`1/3`、`三分之一`、`一半`。写了进度，剩余时间按进度算：`3h 40%` 还剩 1h48m。

重要标记：任务里出现 `[[important]]`、`[[重要]]`、`⭐`、`‼️`（设置里可改）就画成红色。

### 紧跟在关键词后面的时间是「记录」

| 写法 | 意思 |
|---|---|
| `DOING 14:05 写稿` | 14:05 开始做的 |
| `DONE 18:02 写稿` | 18:02 做完 |
| `DONE 14:00-15:30 写稿`、`DONE 10-12 写稿` | 实际做在这一段 |

这些是手写的补记，优先级最高。没写的话，插件会自己记：看到任务变成 DOING 开始计时，变成 DONE 记下完成时刻。

### 凌晨算前一天

凌晨 1 点写的 `01:30-02:00 收尾` 属于前一天的日记，画在那一天的夜里。几点之前算前一天，由设置里的「日记日期分界」决定（默认早上 8 点）。

## 排程规则

1. **从哪开始排**：今天从「现在」开始；以后的日子从一天的开始；过去的日子没做完的全算「没做完」。
2. **事件先占位**：时间段内的固定事件和钉住的待办先占掉，剩下的空档才分给待办。
3. **排队顺序**：DOING 的排最前，其余按日记里从上到下的顺序。
   - **几件 DOING 并行**：一起从现在开始，重叠在同一段时间里，只占最长那件的时间。三件各 25 分钟只占 25 分钟，不是 75 分钟。螺旋上每件画在自己的那条线上，沿螺旋错开一点。其余待办排在这段之后。设置里关掉「DOING 并行排」，就恢复成首尾相接。
4. **找空档**：每件待办放进最早放得下的空档。
   - **短任务整块放**：一个空档放不下，就跳到下一个够大的空档，不会被切成「18 分钟 + 2 分钟」这样的碎片。
   - **小任务往前补位**：被跳过的空档留给后面的小任务。比如 10:30 有站会，40 分钟的写周报放不进 10:00–10:30，跳到站会之后；排在它后面的 20 分钟回邮件补进 10:00–10:20。「接下来」按实际排到的时间先后列出。
   - **长任务可以切开**，但每段（包括最后一段）至少 25 分钟。不够切成两个 25 分钟的任务就算短任务。
   - 进行中的任务不受这条限制，从现在接着做。
   - 「最短一段」在设置里改，设成 0 就回到从最早的空档起切开填满的老办法。
5. **还剩多少**：写了进度按进度算；没写但做过，按「预估 − 已经做掉的」算（包括前几天做掉的），至少留 5 分钟。
6. **父任务不重复算**：父任务下面挂着子任务、自己又没写时长，时间只算在子任务上。
7. **排到一天结束还没排完的**，进「排不下」，容量条变红，显示超出多少。

## 螺旋怎么读

- 螺旋是一块 12 小时表盘，从一天的开始（最外圈）一路转到一天的结束（最里圈）。外面一圈数字是钟点。
- **颜色**：黄色是事件，蓝色是待办，红色是带重要标记的，灰色是做完的，青色是复习卡片。淡一些的蓝是已经做过的时段，实的蓝是接下来排的，正在做的那件从现在排起的一段会慢慢呼吸。这套颜色是按浅色主题配的。
- **深灰色的指针**是现在，指针上的圆点往外散着一圈，中间写着当前时刻。
- **鼠标划过哪一段**，螺旋上方固定的那一行立刻用粗体显示这一段做的是什么，前面是起止时刻和时长，不用停下来等提示。同时这件事的几段和下面列表里的那一行一起亮起来，其余的线段淡下去；反过来停在列表的一行上也一样。
- **点任意一段**，跳到日记里那一行（日历事件则打开「日历」App）。
- **两个空心圆把手**是这一天实际的开始和结束。沿着螺旋拖动可以改（5 分钟一格），双击恢复默认。比如今天 10 点才起，把开始拖到 10:00，前面那段画成虚线，容量也跟着重算。
- **直接填时间**：点顶部的「☀️10:00–🌙--:--」，或者按 ⌃⌥T，在弹窗里写起床和收工的时刻（`10:30`、`1030`、`10点半` 都行；凌晨收工写 `2:30`，算到当天夜里）。两项都可以空着，空着的那项按原来的默认算，所以早上只填起床、收工等真收工了再填（或者 Telegram 发「睡了」）就行。「现在」一键填当前时刻，「默认」清空。

螺旋下面的列表分成几组：固定事件、接下来、排不下、⏸ 挂起、做过 · 已挪走、已完成。点任意一行跳到日记里对应的位置。

## ▶ 开始做：时间记录 + 番茄钟

写下预计时长，开始做，到点问你做完没有，做完的那一刻时间记录就写进日记。同一套东西既是计时，也是番茄钟。

```markdown
- TODO 写周报 15分钟
```

1. **开始**：在螺旋的「接下来」里点那一行的 ▶（鼠标移上去才显示），或者光标放在这一行按 **⌘⇧↵**。这一行变成 `DOING 14:05 写周报 15分钟`，同时开一轮 15 分钟的专注。打开了 Raycast 的话，也会开一段 15 分钟的 Raycast Focus。
2. **专注中**：容量条下面显示「⏱ 写周报 · 还剩 9m / 15m」，点「结束」可以提前收工。
3. **到点**：响一声，弹出系统对话框「做完了吗？」。Obsidian 在后台也看得到：
   - **做完了** → 这一行改成 `DONE 14:05-14:20 写周报 15分钟`，实际用时就记在日记里，和预估的 15 分钟放在一起。
   - **再来一轮** → 同样的时长再专注一轮，还是 DOING。
   - **先停下** → 改成 `PAUSED`，做过的时间留在计时里，下次剩余时间会相应变少。
   - 半小时没回答就不再等，任务保持 DOING。

专注多久：

- 条目上写了多久就专注多久：`10 min`、`15分钟`、`25m`、`1.5h` 都行，写在关键词后面或者句末都可以。
- 没写的按「默认任务时长」（15 分钟）。
- 写了进度（`2h 40%`）按还剩的时间。
- 想要固定的番茄钟，在设置「专注多久」里填 25，每轮都是 25 分钟。

**几条线并行**：专注进行中，再按 ⌘⇧↵ 或点 ▶ 开始另一件，它会加入这一轮，不另开新的：

- **每条线各自倒计时**，按各自写的时长算。容量条下面显示「⏱ 2 条线 · 写稿 还剩 12m · 回邮件 还剩 3m」。
- **哪条先到点就先单独问哪条**，别的线照常走；「再来一轮」只给这一条再加一轮。
- **点「结束」就整轮一起问**：先勾做完的，没勾的再问「再来一轮 / 先停下」。
- **Raycast 专注只开一段**，因为 Raycast 同一时间只能有一段专注；屏蔽干扰本来就是全局的，一段就够。这一段覆盖到最晚那条线到点；后来加进来的线超出了这一段，就结束重开一段，覆盖到它为止。
- **计时每条线各记各的**：三件一起做了 25 分钟，每件都记 25 分钟；一天的总时长按重叠合并，只算一次。

**在 Raycast 里点完成**：专注进行时，屏幕上有一个 Raycast 专注的悬浮小窗。插件只在这一轮开着 Raycast 专注时每 10 秒看一眼。小窗比计时早消失（连着两次、离到点还有半分钟以上、你人在电脑前），就当你在 Raycast 里点了完成，这一轮的几件都记成 DONE。开始 1 分钟内一直没看到小窗，这一轮就不再看。

其它细节：

- ⌘⇧↵ 在任何笔记里都能用。没有关键词的普通列表项会当成 TODO 开始；在编辑器里直接改，⌘Z 一步撤销。
- 已经是 DOING 的任务，开始时只开专注，不改那一行。最后写 DONE 时，开始时刻用 DOING 后面原来写的那个。
- 到点前自己把它改成 DONE 或 TODO（比如 ⌘/），这一轮就提前结束，不再弹窗，Raycast Focus 也一起结束。
- 命令「开始下一件」开始螺旋上排在最前面、还没开始的那件；「结束这一轮专注」等于点「结束」。
- Obsidian 在专注中途关掉了也没关系，这一轮存在设置里，下次打开时到点照样会问。
- Raycast Focus 用的是它的 Deeplink `raycast://focus/start?goal=…&duration=…`。屏蔽类别和模式（屏蔽 / 只允许）在设置里改；关掉「同时开 Raycast 专注」就只计时、只问。

点 ▶ 的时候，如果那一行刚被改过、对不上，插件不会动日记，只提示一下。

## 硬规则：暂停

只管今天的日记。每次因为这些规则把任务改成 PAUSED，都会发一条系统通知，点一下跳到那一行。

- **同时最多 3 件 DOING**：开始第 4 件时，最早开始的那件改成 PAUSED。正在专注里的几件排到最后才会被暂停。
- **3 小时没动就暂停**：一件 DOING 的这一行和它下面的子项 3 小时都没改过，也不在专注里，就改成 PAUSED。
- **吃饭 / 锻炼**：新写一条只有「吃饭」或「锻炼」的条目，可以带时间、时长、标点、表情，但不能有别的汉字和英文字母，比如 `**12:03** 吃饭`、`🍚 吃饭`，从 Telegram 发过来的也算。这时所有 DOING 改成 PAUSED；正在专注的话，专注也停掉，并记下还剩多久。`TODO 吃饭`、`和小李吃饭`、`18:00-19:00 吃饭`（还没到点的计划）不算。
- **回来了**：吃饭 / 锻炼 20 分钟以后（吃饭保守估计也得 20 分钟，设置里可改），你在 Obsidian、Claude 或终端里连续操作满 3 分钟，就发一条通知，同时弹窗问「要把这几件切回 DOING 吗？」。点「切回来」，那几件改回 DOING，没专注完的那轮接着开。不想等它判断，就点螺旋上的「回来了」。吃完直接自己开始做某件事也行，这次就不再问。

上限、小时数、吃饭 / 锻炼的词、「回来了」看哪些 App，都在设置里改；填 0 就关掉对应的规则。

`PAUSED` 和 `SUSPENDED` 的区别：PAUSED 只是停一下，照常排进螺旋，⌘/ 一按就接着做；SUSPENDED（还有 WAITING）是暂时搁置、短期不推，不排、不占容量，列在「💤 搁置」里。TODOseq 里 PAUSED 归在「未开始」，SUSPENDED 归在「等待」。

## 和「在一个 App 里待久了」的提醒联动

`~/bin/app-idle-focus.sh` 在同一个 App 里待久了会提醒开专注。Obsidian 开着时，它不再自己弹「10 / 25 分钟」，而是在后台打开 `obsidian://nautilus-focus?app=…&stay=…`，交给螺旋日程来问：弹一个框，只选这一轮的**大方向**和时长（25 / 50 / 90 分钟），不列一条条任务。方向在设置里写，最多 4 个，默认是「🧩 工具、🎬 创作、💼 工作」，改成你自己的。数字键 1–4 选方向，← → 换时长，↵ 开始。

选了方向的这一轮只计时、开 Raycast Focus，到点问「再来一轮 / 换个方向 / 收工」，不改日记里的任何一行。具体做了哪几件、各用了多久，交给下面的「🤖 自动记日记」。每个方向今天累计了多久，显示在弹框的卡片上和螺旋顶部的「🧭」那一行。

已经在专注、或者在吃饭 / 锻炼时不问。命令「开一轮专注（选一个大方向）」（⌃⌥F）也能手动叫出这个框。这个脚本遇到炉石传说不提醒，Steam 开着时整个停掉检测。

## 🤖 自动记日记：人机共写

你在日记里写任务，是预计；Agent 的会话日志是自己会写的实际记录。打开设置里的「自动把 Agent 会话记进今天的日记」之后，插件每隔一阵（默认 20 分钟）看一眼今天的 Claude / Codex / WorkBuddy 会话，替你把状态和用时补上：

| 会话的情况 | 日记里怎么改 |
|---|---|
| 在动 | 那一行改成 `DOING`；日记里没有对应的行，就新写一行 `- DOING 00:45 🤖 优化螺旋日程的配色` |
| 40 分钟没动静 | 改成 `SUSPENDED`，并把实际做的时段写在这一行下面：`- ⏱ 00:45–01:20、04:02–04:24 · 共 52m · Claude` |
| 又动了 | 改回 `DOING` |
| 回复里明说要你去做的事 | 另记一条 `- TODO 🤖 …`，一个会话最多一条 |

- **机器不标 DONE**。它只在 DOING 和 SUSPENDED 之间来回切，这两个状态可逆、不丢时间。它觉得某件事看着像是整个做完了，只在提醒里说一声，DONE 由你自己改；你改成 DONE 之后，它把完整的时段补在下面，这一行就到此为止。
- **名字和方向谁来定**：出现新会话、或者某个会话刚停下来时，插件调一次本机的 `claude -p --model haiku`，把会话标题、你说的最后几句、最后一条回复的结尾和日记里没做完的任务行发给它，让它起一个短名字、看它对上日记里哪一行、归到哪个大方向。走的是命令行自己的登录，不留会话记录。一长串数字（卡号之类）会先抹掉。
- **接在你写的行上**：会话做的事如果就是日记里已有的某一行，就改那一行，不另写。两条限制：留给你本人做的事（看一眼、拍板、自己跑命令）不会被接上；第一次见到就已经停了的会话不去碰你写的 TODO。
- **你改的算数**：你手动把它停下，要等会话有了新动静才改回 DOING；你手动改成 DOING，两小时内不会因为会话没动就被搁置。删掉或者改了名字的行，之后不再管。
- **用时怎么算**：按会话真正在动的时段算，螺旋、列表、长期项目和「预估 vs 实际」都照常统计。自动管着的行不走「改成 DOING 就开始计时」那一套，也不受 DOING 上限、超时暂停和吃饭暂停管。`⏱` 开头的子项是记录，解析日记时会跳过，不会被当成事件。
- **改了什么会告诉你**：每次整理合成一条提醒，同一类的折在一起（在做的、搁置的、看着像做完了的、记了要你做的）。
- 只管得到经过这几个 Agent 做的事。不经过它们做的任务照旧按你自己改的状态和下面的暂停规则走。
- 命令「现在把 Agent 会话整理进今天的日记」可以手动跑一次。打开开关之前就停了的会话不补记。

### 大方向和每周回顾

每个会话会被归到一个大方向。方向优先用设置里写的那几个；都不合适时模型会自己起一个短名字，之后同类的事沿用这个名字。专注弹框里设置的方向不满 4 个时，空位用最近 7 天花时间最多的方向补上。

每周日晚上 9 点以后，插件发一条「本周方向」：这一周各个方向花了多久、占多少、和上周比，最后问一句下周想调哪个。装了「任务提醒」就走它的 Telegram，没有就发 Discord。命令「发一条本周方向回顾」可以随时看。只算 Agent 会话里的时间。

## 提醒怎么发

- **不用你回答的**（自动暂停、欢迎回来、自动记日记改了什么、专注到点）：设置了 Discord 频道就发到 Discord，见下一节；没设就在本机弹一条通知，并响一声提示音。几秒之内连着来的同一类提醒会折成一条。
- **要你回答的**（专注到点问做完了吗）：弹一个系统对话框，Obsidian 在后台也会到最前面。
- **提示音**：设置里的「本机提醒的提示音」填系统声音的名字（Pop、Glass、Ping、Tink、Submarine……）或者一个声音文件的路径，空着不响。

设置里的「到点怎么问」还有一个试验选项「带按钮的系统通知」：在本机编译一个很小的通知 App，把按钮放到通知上。它要系统允许这个 App 发通知，在有的 macOS 版本上系统不认本机签名的 App，会一直发不出来，所以默认不开。

## 提醒发到 Discord

如果你把 Discord 当成各种机器提醒的汇总处，可以让螺旋日程的提醒也进去。设置里的「提醒发到 Discord 的哪个频道」填一个频道名，插件就调本机的 `notify-discord <频道> <内容>` 脚本发过去（Webhook 地址由那个脚本自己管，插件不碰）。空着就不发。

- **不用你回答的提醒**（超过上限或太久没动被暂停、吃饭计时暂停、欢迎回来、自动记日记改了什么、专注到点）发到 Discord。发出去了，就不在本机再弹一遍。
- **要你点按钮的**（做完了吗、要不要切回 DOING）照旧在本机弹，Discord 里只留一行记录。Webhook 只能发、收不到你点了什么，所以按钮没法放到 Discord 里。
- 发过去的内容里有任务名，也就是日记里那一行的文字。

## 📏 预估 vs 实际

列表底部的「📏 预估 vs 实际 · 近 30 天」，看你写的时长准不准：

- 整体：做完的几件里，预估一共多少、实际一共多少、整体多用或少用了百分之几，估短、估长、差不多（±20% 以内）的各几件，一件一般是预估的几倍。
- 按标签 / 链接分：行里有 `#口播`、`[[某个项目]]` 的，按它们分组，列出偏差最大的几组，比如「×1.6 #口播 5 件」。
- 估得最短的几件：点一下跳到那天日记里的那一行。
- 容量条上的校准：攒够 10 件以后，如果整体偏差超过 15%，「待办」后面会多一句「按以往约 4h10m」，也就是按你的习惯，这些待办实际大概要多久。

只算这样的任务：做完了，写了预估时长，也记到了实际用时。实际用时来自 `DONE 开始-结束`，或者 DOING 时插件记下的那几段。用 ▶ / ⌘⇧↵ 开始、回答「做完了」的任务，天然满足这几条。`DONE 18:02 写稿 2h` 这种只写了做了多久的不算，因为那个 2h 是实际，不是预估。计时记录保留 45 天，所以最多看 45 天。

## 🤖 做这件事时 Claude 在干什么

一件任务做过的那几段时间里，有哪些 Claude Code 会话在干活，就在列表那一行后面显示 🤖2，螺旋上悬停那一段也能看到。

- **只看时间会把同时开着的无关会话也算进来**，所以还会看内容：会话标题，或者你在会话里发的话，出现了任务名里的词，就算「看起来相关」。🤖 后面的数字是相关的个数。只有时间重叠、看不出相关的，🤖 是淡的。
- **点 🤖** 打开列表，按「看起来相关」和「同一时段的其它会话」分开，显示每个会话的标题、你发的第一句话、工作目录、和这件任务重叠多久、产出多少 token。
- **回到那个会话**：Claude 桌面版里开的会话，「在 Claude 里打开」用 `claude://resume?session=…` 直接打开；终端里开的会话，「在终端里继续」在它的工作目录里运行 `claude --resume …`；也可以复制命令自己跑。

数据来自人机协作那一块读的 Claude Code 本地会话日志，几条线并行时，同一个会话可能同时挂在几件任务上。

## 📅 macOS 日历

设置里打开「读 macOS 日历」后，系统「日历」App 里的事件（iCloud、Exchange、Google 帐号、订阅的日历，只要日历 App 里看得到就行）会当固定事件排进螺旋：

- 只读，不改日历，也不写进日记。
- 线段和列表用那个日历自己的颜色，列表里带 📅；点一下打开「日历」App。
- 全天事件不占时间，在容量条下面列一行「📅 全天：…」。
- 已取消的事件、自己拒绝了的邀请不算；同一件事出现在好几个日历里（比如两份节假日日历）只算一次；日记里已经手写了同一件事的也不重复。
- 「不读这些日历」可以排除不想排进来的日历，设置里点「列出」能看到本机所有日历的名字。
- 每两分钟重读一次；命令「重新读取 macOS 日历」可以马上重读。
- 任务提醒插件、Telegram 的 `?` 也会把日历事件算进容量。日历事件快开始时，任务提醒不再另发通知，「日历」App 自己会提醒。

读日历用的是系统的 EventKit：第一次打开时，插件在本机把一个很小的 Swift 读取程序编译到 `~/Library/Caches/nautilus-spiral/`（需要 Xcode 命令行工具，没有的话运行 `xcode-select --install`），然后系统会问「“Obsidian”想要访问你的日历」，选允许。之后在「系统设置 → 隐私与安全性 → 日历」里可以随时关掉。

## 计时：实际做了多久

插件看着日记的变化自己记，计时不往日记里写任何东西：

- 任务改成 DOING：开始一段计时。改回 TODO 或改成 DONE：这一段结束。中断再继续，就是好几段。
- 进行中的任务改了名字，计时跟着挪到新名字下面，算同一件事。
- 没做完的任务挪到明天（行尾带 `← 2026_09_30` 这种来源标记），前几天做掉的时间也算进去。
- Obsidian 关着的时候改成 DOING 的，下次打开时补上：写了开始时间按写的，没写从打开时算。
- 做完的任务，完成时刻按「DONE 后面手写的时间 > `**07:37**` 时间戳 > 插件看到它变成 DONE 的时刻」取。
- 没写时长、但记到了做的时段的任务，做完后时长按实际做的算。

计时记录保存在插件的 `data.json` 里，保留 45 天。

## 翻看其它日子

- 顶部 `‹` `›` 前后翻，「今天」回到今天。
- 在日历或文件列表里打开任何一篇日记，螺旋跟着切到那一天。
- 过去的日子：显示那天实际做了什么、哪些没做完。以后的日子：从一早开始预排。

## 可选模块

这几个模块都可以在设置里关掉：

- **🤖 人机协作**：读 Claude Code 的本地会话日志（`~/.claude/projects`），在容量条下面显示当天和 Claude 协作了多久、产出多少 token，螺旋内圈用细线画出 Agent 在干活的时段，列表底部按项目分开并给出近 7 天的柱状图。除了 Claude，也读 Codex（`~/.codex/sessions`）和 WorkBuddy（`~/.workbuddy/projects`）的日志：一个 Agent 一圈、一种颜色，Claude 橙、Codex 淡蓝、WorkBuddy 青绿，列表里的 token 数和柱状图也按这个颜色分。汇总另存在插件目录的 `ai-usage.json`，Claude Code 清掉旧日志后历史还在。
- **🃏 复习卡片**：第二大脑的每日回顾会在日记里记「DONE 14:10-14:12 复习卡片 23 张（…）」（每张按 5 秒算），螺旋上这一段画成青色，列表里那一行左边也是青色，顶部汇总当天「🃏 复习 N 张 · 用时」。
- **🎮 游戏时间**：每分钟看一眼有没有在玩（进程关键词和「在最前面才算」的 App 都可以设置），螺旋最里一圈画紫线，记在 `game-log.json`。只在 Obsidian 开着时记录。
- **🧭 长期项目**：列表底部显示「该推一把」的长期项目（逾期、快到期、很久没动），点 ＋ 在今天的日记里加一条带项目链接的 TODO。依赖库里的 `scripts/long-projects.js`，没有这个文件就不显示。

## 设置

| 设置 | 默认 | 说明 |
|---|---|---|
| 一天从几点开始 | 8 | 螺旋的起点 |
| 一天到几点结束 | 32 | 螺旋和排程的终点，超过 24 表示次日凌晨（32 = 次日早上 8 点） |
| 日记日期分界 | 8 | 凌晨几点前还算前一天的日记 |
| 默认任务时长 | 15 分钟 | 没写时长的任务按这个算 |
| 日记文件夹 / 文件名格式 | `日记` / `YYYY_MM_DD` | 文件名格式用 moment.js 语法 |
| 重要标记 | `[[important]], [[重要]], ⭐, ‼️` | 逗号分隔 |
| 最短一段 | 25 分钟 | 任务被事件隔开时每段至少多长；0 = 切开填满 |
| 读 macOS 日历 / 不读这些日历 | 关 / 空 | 见「📅 macOS 日历」 |
| 专注多久 | 0 | 0 = 按条目上写的时长，填 25 就是固定番茄钟 |
| 到点问做完没有 | 开 | 做完了 / 再来一轮 / 先停下 |
| 同时开 Raycast 专注 | 开 | 见「▶ 开始做：时间记录 + 番茄钟」 |
| 屏蔽类别 / 类别的用法 | `social, gaming` / 屏蔽 | 留空 = 不带类别，用 Raycast 自己的设置 |
| 提前做完时结束 Raycast 专注 | 开 | |
| 同时最多几件 DOING / DOING 多久没动就暂停 | 3 / 3 小时 | 0 = 关掉 |
| 吃饭 / 锻炼的词 / 回来了的判断 | `吃饭, 锻炼` / Obsidian、Claude、终端 | 见「硬规则：暂停」 |
| 吃饭 / 锻炼至少多久 | 20 分钟 | 这么久以内不判断「回来了」 |
| DOING 并行排 | 开 | 几件 DOING 重叠在同一段时间里 |
| 预估 vs 实际 / 复盘看最近几天 | 开 / 30 | 见「📏 预估 vs 实际」 |
| 启动时打开今天的日记 | 开 | 按日期分界算「今天」，没有这篇就新建 |
| 启动时左侧栏显示螺旋日程 | 开 | |
| 显示人机协作 / 记录游戏时间 / 显示长期项目提醒 | 开 | 见上一节 |
| 开一轮专注时的大方向 | 🧩 工具, 🎬 创作, 💼 工作 | 逗号分隔，最多 4 个，开头可以带一个表情 |
| 到点怎么问 | 系统对话框 | 另有试验选项「带按钮的系统通知」 |
| 本机提醒的提示音 | Pop | 系统声音的名字或声音文件路径，空着不响 |
| 多久没动算停了 | 40 分钟 | 自动记日记把 DOING 改成 SUSPENDED 的门槛 |
| 每周方向回顾 | 开 | 周日晚上发到 Telegram 或 Discord |
| 提醒发到 Discord 的哪个频道 | 空 | 填了就把不用回答的提醒发到那个频道，见「提醒发到 Discord」 |
| 自动把 Agent 会话记进今天的日记 | 关 | 见「🤖 自动记日记」；间隔默认 20 分钟，模型默认 haiku |

## 和其它插件一起用

- **任务提醒**（[`nautilus-notify`](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/nautilus-notify)）：用螺旋日程算出的排程发 macOS 通知：事件快开始了、钉住的待办过点了、DOING 做太久了、今天排不下了、下一件该做什么，还有早上的今日简报和晚上的收尾提醒。
- **Telegram Companion**（[`telegram-companion`](https://github.com/MatsuriMW/telegram-companion)）：手机上发 `?` 或 `/now`，回复一张今天的螺旋图和图文版的容量、接下来的任务（「任务提醒」定时推送的图文版、「起了」「睡了」的回执也带这张图）；发「起了」「睡了」，把这天实际的开始和结束设成消息发出的时刻（睡了还会收掉进行中的计时）；发 `done 写稿 2h`，把今天那条任务改成 DONE。
- **任务状态快切**（[`task-toggle`](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/task-toggle)）：⌘/ 在 无 → TODO → DOING 时间 → DONE 时间段 之间切换，自动写上开始和完成的时刻。
- **Done To Top**（[`done-to-top`](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/done-to-top)）：把日记里的任务按 DONE / DOING / TODO 分区归位，没做完的整块发送到明天。

## 快捷键

默认都在 ⌃⌥ 下面，Obsidian 设置 → 快捷键里搜「螺旋日程」可以改。记不住就按 **⌃⌥S** 打开快捷面板：所有操作都在里面，打几个字就能找到，右边写着各自的快捷键；当下用不了的（比如没在专注时的「结束这一轮」）不会出现。

| 快捷键 | 做什么 |
|---|---|
| ⌃⌥S | 快捷面板：螺旋日程的所有操作 |
| ⌃⌥V | 现在怎样：这一轮专注每条线还剩多久、吃饭 / 锻炼中、在做的和暂停的、容量、接下来、今天做完几件和 Claude 协作多久 |
| ⌃⌥C | 正在做的事的 Claude 会话：每件 DOING（和这一轮专注里的）期间看起来相关的会话；只是时间重叠的收在「同一时段的其它会话」里；最后是现在还在跑、没对上哪件的会话。每个都能一键在 Claude 里打开 |
| ⇧⌘↵ | 开始光标所在的任务（改成 DOING + 专注） |
| ⌃⌥N | 开始下一件 |
| ⌃⌥F | 开一轮专注（选一个大方向） |
| ⌃⌥E | 结束这一轮专注（问做完了没有） |
| ⌃⌥B | 吃饭 / 锻炼回来了（问要不要切回 DOING） |
| ⌃⌥R | 预估 vs 实际：打开螺旋，展开并滚到复盘那一块 |
| ⌃⌥O | 打开螺旋日程 |
| ⌃⌥T | 设置今天的起床 / 收工时间 |

另外还有两条没设快捷键的命令：「打开今天的日记（凌晨按日界算前一天）」「重新读取 macOS 日历」。
