# Nautilus Spiral（螺旋日程）

> **Give every minute a job.**

A spiral day planner for Obsidian that reads your daily note.

**English** · [简体中文](./README.zh-CN.md) · [使用指南](./docs/guide.zh-CN.md)

<p align="center">
  <img src="assets/demo.gif" width="380" alt="Hovering over the spiral: the line above it instantly shows what each segment was, while the matching segments and list row light up">
</p>

Events stay pinned to their time. To-dos flow from "now" into the free gaps, in list order and by estimated duration. As time moves on, unfinished tasks are pushed forward, and a capacity bar tells you whether today still fits. What you actually did is drawn on the same spiral, so plan and reality sit side by side.

**A 50-second tour** (Chinese captions, with sound). The panel in the film is drawn by the plugin's own code from a made-up daily note:

https://github.com/user-attachments/assets/1e0967bc-d498-456a-9d82-46750d761c08

**The interface is in Chinese**, and so is the full [guide](./docs/guide.zh-CN.md). This page covers what the plugin does, how to install it and what it touches outside your vault.

## Recommended: use it with Agent Deck

[Agent Deck](https://github.com/MatsuriMW/obsidian-agent-deck) is the other half of this setup. Install both:

| Plugin | Owns |
|---|---|
| Nautilus Spiral | The daily note and the plan: spiral scheduling, timing, capacity, reviews — and the agent tracking display (inner rings, status bar, progress rows, `🔗` bindings) |
| Agent Deck | The AI write half: automatic journal logging, status write-back, `💬`, desktop child / side chat / subagent blocks, archive → `DONE`, and delegation from a task line |

To hand over: open **Settings → 追踪 → 停用螺旋日程里的 AI 写入** in Agent Deck, then reload Nautilus Spiral. Nautilus stops writing but keeps its schedule and tracking display; Agent Deck owns the note writes. Without Agent Deck, the co-writing features below still run inside Nautilus itself.

## What it does

- **A 12-hour dial that winds inward.** The outer end is the start of your day, the inner end is the end. Fixed events, planned to-dos, finished tasks and "now" are all on it. Hover any segment and the line above the spiral shows what it is, instantly.
- **Plans itself from your list.** Write `14:00-15:30 meeting` for an event and `TODO reply to mail 20m` for a to-do. Chinese time and duration phrases are understood too (`3点到5点`, `半小时`). The plugin re-plans every minute; you never drag blocks around.
- **Tracks actual time.** A task counts while it is `DOING` and stops when it becomes `DONE`, `PAUSED` or `TODO` again. Interrupted work becomes several spans. A daily review compares planned and actual task by task, and a 30-day review shows how far off your estimates usually are.
- **The time record lives in the note.** Actual spans are written under the task as one line, `⏱ 14:05–14:40, 15:10–15:32 · 57m total`, by the machine for agent sessions and, if you switch it on, for your own tasks too. That line is the source of truth: edit it and the spiral follows.
- **Shows what was not recorded.** Past time with no record of any kind, neither yours nor the machine's, is hatched on the spiral, and one line tells you how much of the day so far is accounted for.
- **Capacity at a glance.** Planned, then remaining / overload / no fitting slot, then the percentage of the day's flexible time still free; below that, flexible and event time as "left now / whole day". A status bar item shows the running timer, or the same capacity summary when nothing is running.
- **Play back the day.** One button sweeps "now" from the start of the day to its end in six seconds and re-plans as it goes. Nothing in the note is changed.
- **Focus rounds.** Start a task with a timer and, optionally, a Raycast Focus session. Or start a round for a broad direction instead of a single task.
- **Calendars, read-only.** Events from macOS Calendar and from Google Calendar (through the Google Calendar API, with an OAuth client you create yourself) can be laid onto the spiral as fixed events. Both can be on at once; the same event is kept once.
- **Small sounds, two moods.** A soft tick when you click a segment or a row, and a short synthesized sound whenever a task changes state anywhere in the vault, whoever changed it (a hotkey, a task plugin, a board, typing). Moving forward (`TODO`, `DOING`, `DONE`) rises and stays soft; stopping or not making it (`PAUSED`, `WAITING`, `SUSPENDED`, `CANCELLED`, `FAILED`) falls, lower and rougher each step. No audio files; one switch turns it off.
- **Agent time.** Reads the local session logs of Claude Code, Codex (desktop app and CLI), WorkBuddy and DeepSeek Harness, and draws when each agent was working as thin inner rings, one colour per agent, with the tokens each one used (output plus fresh input; cache reads are listed separately). You pick which of the four you actually use, and one of them as your primary agent: the primary is tracked in full (all history, cross-day catch-up, the status bar), the others only for sessions active today.
- **A progress line under what you are doing.** In the editor, a `DOING` line gets one row of monospace text under it, filled with `#` like a terminal: `[#########-----------] 45%`. The number is the progress you wrote on the line (`60%`, `2/3`); failing that, the agent session that belongs to the line, if it keeps a to-do list of its own; failing that, time spent against your estimate. When a session is matched, the row also says whether it is running or waiting for you, what its last step was, and how many tokens it has used. You can bind a line to a session by hand, and archiving the session fills the row to 100% and marks the line `DONE`.
- **Active and passive recording, together.** You record on purpose: the plan, the estimates, the states you set by hand. The machine records in the background as your assistant: when each agent session was really moving, and for how long. Both end up in the same daily note and on the same spiral.
- **Human–agent co-writing (optional, off by default).** While an agent session is active, the matching line in your daily note becomes `DOING`; after 40 idle minutes it becomes `PAUSED` and the actual time spans, with the tokens the session used, are written under it. The plugin does not decide on its own that something is `DONE`; archiving a session in the Claude desktop app or in Codex is taken as your explicit signal, and that line is marked `DONE`. The same pass can be run by hand at any time (`⌃⌥L`, or the button beside 「人机协作」), whether or not the automatic one is on.
- **Weekly direction review.** Each session is filed under a broad direction; on Sunday night you get the week's split.

## The journal outline as a dashboard for your agents

<p align="center">
  <img src="assets/agent-lines.gif" width="800" alt="Four DOING tasks in the daily note, each with a row of monospace progress under it: listening to Claude, running, its latest step, tokens; one also has a line 'side chat · open · 8m' below it">
</p>

A daily note is an outline, and one task line stands for one agent session. Nautilus Spiral turns that outline into a dashboard for the agents' work: which one is running, which one is waiting for you, how many tokens each has used and what it said last, all written under the task's own line.

- **One task line, one session.** There are three ways to pair them. A `🔗` line under the task holds the binding in the note itself, so it survives moving the block or rewording the task. With human–agent co-writing on, the plugin pairs them for you. Otherwise a session is matched when its title, or the first thing you said to it, repeats the line. The command 「把这一行绑定到一个 Agent 会话…」 writes the `🔗` line by hand.
- **Sibling lines are agents running side by side.** Several `DOING` lines each have their own session and their own progress row, and the inner rings of the spiral show, one colour per agent, when they were working at the same time.
- **The state follows the session.** Running, waiting for your reply, or quiet for how long: all read from the session logs. When a session stops and waits for you, its line turns `TOREVIEW`; stuck on a permission prompt, `NEEDOK`; stopped on an error that isn't a usage limit (overloaded, network drop, context full), `ERRORED`; when it hits the usage limit, `HITLIMIT`, or `QUEUED` once a resume script has queued it for after the reset; once it moves again, back to `DOING`. Archive the session in the Claude desktop app or in Codex and the row fills to 100% and the line is marked `DONE`.
- **What the agent said last comes back into the outline.** For a task with a `🔗` line, each time the session finishes a turn its last reply is squeezed into one `💬` line under the task: the conclusion when it is done, or the question it stopped to ask you. The next turn replaces it, and the full reply is one click on `🔗` away.
- **Subagents and side chats show up too.** When a Claude Code session dispatches subagents, the progress row ends with `🤖 2 跑 1 完` (two running, one done) and each subagent gets a line below it: its description, running or finished, its latest step and the tokens it used. A side chat opened on that session in the Claude desktop app gets a line as well (open, and for how long). Each time the session finishes a turn, a `🤖 子代理 3：查 runTmux ✓ 16k、查 cue() ✗ 停了 · side chat 1` line is written under the `💬` line as a record. Everything is read locally: subagent logs sit under `subagents/` in the session's folder. A side chat is not written to disk, so all the plugin can see is the claude process the desktop app starts for it; what you asked, whether it is answering, and its tokens stay unknown.
- **Sessions opened from a session nest as child blocks.** When a bound session in the Claude desktop app opens new sessions (the ones listed under it in the sidebar), each becomes a child block of the task with its own `🔗` line, so its state, progress row and `💬` line follow that session. Sessions opened from those nest one level deeper, matching the sidebar. If you already listed a subtask whose text matches the new session's title, that block gets bound instead of a new one being added.
- **The status bar keeps count.** One cell reads `🤖 2 在跑 · 1 等你` (two running, one waiting for you); click it to jump to the line that is waiting.
- **The record stays in the outline and leads back.** A finished task has `⏱ 20:12–21:09 · 共 57m · 885k tok · Claude` under it, and the final "Claude" is a link that reopens that session.
- **Dispatch is left to a companion plugin.** [块去向 (done-to-top)](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/done-to-top) sends a block and its children to the Claude CLI with `⌥⌘S`. It fixes the session ID before the session starts and writes the `🔗` line under the task, so the progress row starts moving right away. Select several sibling blocks and each one gets its own session (siblings run in parallel). Choose 「子块各开一个」 and the parent becomes shared background while every child block gets a session, with each conclusion landing under its own child (depth becomes sub-sessions). Sessions can open in Terminal windows, sit in a background tmux session, or run headless with `claude -p`. Without the plugin, pasting the task as your first message to the agent is enough for the match.

What it does not do: it does not schedule. Dispatched sessions each run on their own, with no queue, no retries and no ordering between them. Only the last reply comes back, as one line; the files an agent changed and its full reply stay out of the outline. Sub-session conclusions land under their own child blocks and are not rolled up into the parent. The `💬` line is written only while the note is open.

## Optional execution layer

When planning is not enough and you want the doing tracked too, four pieces cover what Nautilus Log calls its execution layer. Each is small and can be left alone; with all of them ignored the plugin is still just a spiral and a list of estimates.

- **Timing.** A task is timed while it is `DOING`. The status bar shows how long the most recently started task has been running and how many are running; the text turns red after 45 minutes and asks you to check the timer after 2 hours. Neither stops anything. `⌃⌥V` shows the whole picture.
- **Plan.** The list under the spiral: 「接下来」 is what fits today, in the order it was placed; 「排不下」 is what does not fit. `▶` or `⌘⇧↵` starts a task.
- **Review.** 「📋 今日复盘」 compares planned and actual for each task of the day. Only finished tasks with recorded time count towards the variance; running and paused work is listed but does not move the number. 「📏 预估 vs 实际」 does the same over 30 days.
- **Focus.** `⌃⌥F` starts a round for a broad direction instead of a task. It only keeps time and changes no line in your note. The status bar counts up while it runs.

The difference from Nautilus Log: there is no single master switch and no popover panel. The four pieces live in the status bar, the list and a few hotkeys, and the status bar, the daily review and the 30-day review each have their own toggle in settings.

## Requirements

- **Desktop only.** Developed and used on macOS. The spiral, planning and time tracking are plain Obsidian; calendar, dialogs, sounds, focus prompts and game tracking are macOS-only. Windows and Linux are untested.
- **Daily notes written as lists**, one file per day. Folder and file name format are settings (defaults: `日记/`, `YYYY_MM_DD`).
- Optional: Xcode Command Line Tools (for the macOS calendar helper), Raycast (Focus), the `claude` or `codex` CLI (co-writing), a Google account and your own Google Cloud OAuth client (Google Calendar).

## Installation

Until it is listed in the community directory: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/MatsuriMW/nautilus-spiral/releases/latest) into `<vault>/.obsidian/plugins/nautilus-spiral/`, or add this repository in BRAT.

## Usage

The core needs three things; everything else is optional and listed in the [guide](./docs/guide.zh-CN.md) under 「用到哪个开哪个」.

1. In the plugin settings, set your daily-note **folder** and **file name format** (a moment.js format such as `YYYY-MM-DD`), the hours your day starts and ends, and the date boundary: the time before which you are still writing in yesterday's note. The boundary is a 24-hour clock time such as `08:00` or `4:30`.
2. In today's note, write a couple of list items: `- 14:00-15:00 meeting` and `- TODO reply to mail 20m`.
3. Open the spiral from the ribbon icon or the command 「打开螺旋日程」.

Two rules that edit your note are on by default: at most 3 tasks may be `DOING` at once, and a `DOING` task untouched for 3 hours becomes `PAUSED`. Set either to 0 to turn it off. If you do not use Raycast, switch off 「同时开 Raycast 专注」.

## Works with Telegram Companion

Install [Telegram Companion](https://github.com/MatsuriMW/telegram-companion) next to it and your phone becomes the remote: send `?` to get today's spiral as an image, say when you got up or went to bed to set the day's bounds, pause the clock when you leave for a meal, tick tasks off, and receive the weekly direction review. Nothing to configure here: both plugins enabled is enough. Details in the [guide](./docs/guide.zh-CN.md) under 「和 Telegram Companion 联动」.

## Network, accounts and files outside your vault

Nothing leaves your computer unless you turn on one of the optional features below. There is no telemetry and nothing to pay for.

| What | When | Where it goes |
|---|---|---|
| Session titles, your last few prompts, the end of the last reply, and your open task lines | Only with "co-writing" on, when a new session appears or one goes idle | One local CLI under its own login: `claude` (Anthropic) if it is installed, otherwise `codex` (OpenAI). You can fix the choice in settings. Runs of 12 or more digits are removed first |
| The weekly direction review (text); the spiral image when you ask for it from your phone | Only if Telegram Companion is installed and set up | Telegram Bot API, through your own bot. The bot token is read from Telegram Companion's settings and is not stored by this plugin |
| Reminders, including task names | Only if you set a Discord channel | Your own local `notify-discord` script and the webhook it holds |
| Requests for your calendar list and the day's events; nothing is written to the calendar | Only if you turn on Google Calendar and connect an account | Google: `accounts.google.com` (you sign in and consent in your browser), `oauth2.googleapis.com` (tokens), `www.googleapis.com` (Calendar API). The only scope requested is `calendar.readonly`, through an OAuth client of type "Desktop app" that you create in your own Google Cloud project; the plugin ships no shared key |

Google Calendar needs a Google account. The client secret and the refresh token are kept in Obsidian's secret storage (the system keychain), not in the plugin's `data.json`; on Obsidian versions without secret storage they fall back to `data.json`. While you are connecting, the plugin listens on `127.0.0.1` on a random port to receive the authorization code from your browser, and closes it as soon as the code arrives or after five minutes.

Files read outside the vault, all read-only, and only for the agents switched on in settings (for agents other than the primary, only session files changed today): `~/.claude/projects`, `~/.config/claude/projects` and the Claude desktop app's `claude-code-sessions` folder (which sessions are archived, and which session each one was opened from); it also checks the local process list to spot side chat processes; `~/.codex/sessions`, `~/.codex/archived_sessions` and `~/.codex/session_index.jsonl` (session titles); `~/.workbuddy/projects`. A daily summary is kept in the plugin folder as `ai-usage.json`.

Files written outside the vault: `~/Library/Caches/nautilus-spiral/` (small Swift helpers compiled on first use, for the calendar and an experimental notification app).

Local programs it starts: `osascript` (dialogs), `swiftc` and `codesign` (building the helpers), `afplay` (sounds), `open` (Raycast deeplinks and bringing Obsidian forward), `ps` and `sh` (game tracking), and `claude` or `codex` when co-writing is on (plus your login shell once, to locate `codex` if it is not in a usual place).

## Where the idea comes from

The model is not mine. [Nautilus](https://github.com/tombarys/roam-depot-nautilus) was written for Roam Research by the Czech writer Tomáš Baránek. It reads the day's fixed events and each task's estimated duration, then fills the gaps between events with tasks in list order. As the "now" hand moves, everything unfinished moves back with it; a task that no longer fits before the next event jumps whole to the next free slot, and smaller tasks behind it move up to fill the hole. The rules are deterministic. No AI is involved in the planning.

What makes it work is that every stretch of time gets something assigned to it. The budgeting app YNAB says "give every dollar a job"; [Nautilus Log](https://github.com/404KSG/roam-nautilus-log), a rebuild of Nautilus for Roam, turned that into **"give every minute a job"**:

- **Allocate first, spend second.** Putting a duration on each task spends the day as a budget. However much there is to do, it is arranged inside a budget you can see, and you know at once when you are over.
- **Tasks come to you.** As time advances, whatever can be done next is pulled up to "now". You do not keep re-deciding what to do, or worrying that an interruption has wrecked the rest of the day: every task that has a budget finds a place on the spiral.
- **Plan and record are two separate books.** Nautilus Log added an Org-mode-style logbook beside the plan. The spiral is an elastic forecast built from estimates; the logbook is the stricter evidence of where the time really went. They can be used together or apart.

The thought underneath: time is a real river. You cannot hold it, but you can understand it, plan for it, and use it calmly.

This plugin takes one more step along that line. Part of the "record" book is handed to the machine. You still record actively: the plan, the estimates, the states you change by hand. Meanwhile the agents you work with keep their own session logs, and the plugin reads those as a passive record: which minutes were really worked. Statuses and conclusions come from you; time spans and durations come from the machine, which stays an assistant: it never decides that something is done, and it leaves alone any line you have edited yourself.

## Credits

[Nautilus](https://github.com/tombarys/roam-depot-nautilus) by Tomáš Baránek, and its descendants [Nautilus Enhanced](https://github.com/hopeserena/nautilus-enhanced) and [Nautilus Log](https://github.com/404KSG/roam-nautilus-log), for the spiral day planner and "give every minute a job". The time-budget idea goes back to the [YNAB Method](https://www.ynab.com/the-four-rules/); this plugin is not affiliated with YNAB. Obsidian already has two ports of the Nautilus line: [Nautilus Log](https://github.com/accessiblefish/obsidian-nautilus-log) and [Nautilus Logger](https://github.com/dimpurr/obsidian-nautilus-logger).

This plugin shares the ideas, not the code. The capacity figures, the hatched unrecorded time, the daily review, free-slot hover, the status bar timer and playback follow the rules of Nautilus Log (MIT) so that the numbers mean the same thing; they were written again here for Obsidian, and checked against its `log-core.js` and `timing-core.js`. It was written separately for a different workflow: the daily note itself is the data source, written as a plain list with Logseq-style task keywords, and agent session logs are used as evidence of what actually happened.

MIT licensed.
