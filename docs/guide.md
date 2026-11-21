# Nautilus Spiral — User Guide

[English](./guide.md) · [简体中文](./guide.zh-CN.md) · **User guide**

How to configure it, how to write your daily note, and what every number means: all here. Start with "Usage" in the [English README](../README.md) to get the basics working, then come back and read what you need.

**Contents**

- Setup: [Turn on what you use](#turn-on-what-you-use) · [Settings](#settings) · [Hotkeys](#hotkeys)
- Planning: [How to write your daily note](#how-to-write-your-daily-note) · [Scheduling rules](#scheduling-rules) · [How to read the spiral](#how-to-read-the-spiral) · [Looking at other days](#looking-at-other-days)
- Execution: [Start working on a task](#start-working-on-a-task) · [Timing](#timing-how-long-something-actually-took) · [Hard rules: pausing](#hard-rules-pausing) · [Day review](#-day-review) · [Estimate vs actual](#-estimate-vs-actual)
- Agents: [Agent sessions into the note](#-agent-sessions-into-the-note-thats-agent-decks-job) · [What the agent was doing](#-what-the-agent-was-doing-while-you-did-this) · [Optional modules](#optional-modules)
- Integrations: [How reminders go out](#how-reminders-go-out) · [macOS Calendar](#-macos-calendar) · [Google Calendar](#-google-calendar) · [Telegram Companion](#works-with-telegram-companion) · [Other plugins](#works-with-other-plugins)

## Turn on what you use

| What | What you need first | Where to turn it on | Default |
|---|---|---|---|
| Schedule macOS Calendar events | Xcode Command Line Tools (`xcode-select --install`); allow Obsidian to access your calendar the first time | "Read macOS Calendar" | Off |
| Schedule Google Calendar events | A Google account and an OAuth client you create yourself in Google Cloud; see "📅 Google Calendar" | "Read Google Calendar" | Off |
| Draw agent work time and tokens on the inner rings | Claude Code, Codex, WorkBuddy or DeepSeek Harness used on this Mac (the plugin reads the session logs they leave locally and a local stats API). Pick a primary under "🤖 Primary agent and tracked agents", then turn on any others you use; leaving an unused one on does no harm | "Show agent collaboration" | On, all five enabled |
| Send reminders to Discord | Your own command-line script that posts to Discord, at `~/.local/bin/notify-discord`, called as `notify-discord --as <display name> <channel> <message>` | "Discord channel for reminders" | Empty |
| See the spiral, set your day bounds and tick tasks on your phone | Telegram Companion, see "Works with Telegram Companion" below | Nothing to turn on; just enable both plugins | — |
| Track gaming time | macOS; enter the process keywords of the games you play in settings | "Track gaming time" | On |

Outside macOS you get only the basics — the spiral, scheduling and timing — plus agent collaboration; calendars, dialogs, sounds and gaming time all depend on macOS.

## How to write your daily note

```markdown
- 08:00-08:30 breakfast
- 12:00-13:00 lunch
- 14:30-15:30 meeting with Alex
- DONE 07:30-08:00 run
- **09:40** thought of a topic: time budget
- DOING 09:10 write script 2h 40%
- TODO edit video 1.5h ⭐
- TODO reply to mail 20m
- TODO tidy notes
- WAITING wait for the contract 1h
- TODO 16:00 call mom
```

Open the spiral at 10 AM and this is what the plugin reads:

| Time | Task | Note |
|---|---|---|
| 09:10–10:00 | write script | the part already done, drawn faded |
| 10:00–11:12 | write script | estimated 2h, 40% written, 1h12m left |
| 11:12–12:00, 13:00–13:42 | edit video | split by lunch (a piece is only cut if it is at least 25 minutes); ⭐, drawn red |
| 13:42–14:02 | reply to mail | |
| 14:02–14:17 | tidy notes | no duration, so the default 15 minutes |
| 16:00–16:15 | call mom | a to-do with a time is treated as an event, pinned at 16:00 |
| — | wait for the contract | WAITING: parked, not scheduled, takes no capacity |

Below the capacity bar there are only two lines, with icons down the left: "📋 Planned 3h17m · Spare 8h28m · 64% free" and "🤖 Agents 2h10m · 6.3M tok" (a day counts from 8:00 to 24:00; on days with no agents there is no second line). While schedulable time is draining away, 📋 turns into a blinking 🔥. All the details are in the tooltips: hover the first line for the schedulable and event budgets, your historical calibration, reviews, gaming and whether there is a record; hover the second for the split by agent, work hours and tokens, and each workstream. For what every number means see "The numbers on the capacity bar".

### What each line is read as

| What you write | Read as | Examples |
|---|---|---|
| A list item with a time range | **Fixed event** (yellow) | `14:00-15:30 meeting`, `3点到5点 class`, `9点半-10 commute` |
| A task keyword or a checkbox | **To-do** (blue) | `TODO reply to mail 20m`, `- [ ] reply to mail 20m` |
| A time written inside a to-do | **Pinned to-do**, treated as an event | `TODO 16:00 call 15m` |
| Starts with `**07:37**` and is not a task | **Record point**, drawn as a small dot on the spiral | `**07:37** get up` |
| Any other plain list item | Not scheduled | |

The Chinese time forms in the examples (`3点到5点`, `9点半-10`) parse as well.

Keywords and checkboxes:

| State | What to write |
|---|---|
| To-do | `TODO`, `LATER`, `[ ]` |
| In progress (scheduled first) | `DOING`, `NOW`, `IN-PROGRESS`, `[/]` |
| Paused (stops for now, still scheduled; the time done so far is deducted when you continue) | `PAUSED` |
| Agent session stopped halfway (scheduled like paused; Agent Deck switches it by session state, see "How a task matches an agent session") | `TOREVIEW` (waiting for you), `NEEDOK` (waiting for you to click Allow), `ERRORED` (stopped on an error), `HITLIMIT` (hit a usage limit), `QUEUED` (queued after the limit, resumes on its own when its turn comes), `DELEGATED` (handed to an agent, the session is running; it switches by session state when it stops and goes back to `DOING` when it moves again) |
| Parked (not pushed short-term; not scheduled, takes no capacity) | `SUSPENDED`, `WAITING`, `WAIT` |
| Done | `DONE`, `[x]` |
| Cancelled (ignored) | `CANCELED`, `CANCELLED`, `FAILED`, `[-]` |

When you list several to-dos at once you don't have to write `TODO` on every line: start with a line `- todos:` (upper or lower case, half- or full-width colon: `todos:` or `todos：`), and the direct children under it with no keyword all count as `TODO`. The keyword is only written into a line when you change its state (`1. write script` → `1. DOING 14:05 write script`); a child with its own keyword follows that, and one level further down is detail, not a task. TODOseq and block routing read the same syntax.

```markdown
- todos:
	1. write script 2h
	2. edit video 1.5h
		- trim the opening first (detail, not a task)
	3. DOING 10:20 reply to mail
```

A duration can go anywhere in the task text: `30m`, `45min`, `2h`, `1.5h`, `2h30m`, and the Chinese forms `半小时` (half an hour), `两小时` (two hours), `一个半小时` (an hour and a half) and `25～30分钟` (a range counts as its upper bound).

Progress is written `40%`, `1/3`, `三分之一` (a third) or `一半` (half). With progress, the remaining time follows it: `3h 40%` leaves 1h48m.

Important markers: if a task contains `[[important]]`, `[[重要]]`, `⭐` or `‼️` (change these in settings) it is drawn red.

### A time right after the keyword is a record

| What you write | Meaning |
|---|---|
| `DOING 14:05 write script` | started at 14:05 |
| `DONE 18:02 write script` | finished at 18:02 |
| `DONE 14:00-15:30 write script`, `DONE 10-12 write script` | actually worked during that stretch |

These are manual records and take priority over everything else. Without them the plugin records it itself: when a task becomes DOING it starts timing, and when it becomes DONE it notes the finishing time.

### After midnight counts as yesterday

`01:30-02:00 wrap up` written at 1 AM belongs to the previous day's note and is drawn in that day's night. How late still counts as the previous day is set by "Daily note cutoff" (08:00 by default).

Fill this in as a 24-hour time: `08:00`, `4:30` or `23:30` all work, and a single number works too (`8` = 08:00). If it can't be read the field turns red and reverts when you leave it.

The companion plugins read this setting when working out which note is "today" too, and follow it when you change it: journal cleanup's "Tidy today's note" and "Archive a line", block routing's "Send to today / tomorrow", task reminders, and Telegram Companion.

## Scheduling rules

1. **Where planning starts**: today starts from "now"; future days from the start of the day; for past days, everything unfinished counts as "Unfinished".
2. **Events claim their place first**: fixed events and pinned to-dos inside their time span take their slots first, and only the gaps left over go to to-dos.
3. **Queue order**: DOING first, then the rest in note order from top to bottom.
   - **Several DOING side by side**: they all start now, overlap in the same stretch and take only the longest one's time. Three 25-minute tasks take 25 minutes, not 75. On the spiral each is drawn on its own line, staggered a little along the spiral. The rest of the to-dos come after that stretch. Turn off "Run DOING tasks in parallel" in settings to put them back to back.
4. **Finding a gap**: each to-do goes into the earliest gap it fits in.
   - **Short tasks go in whole**: if a gap is too small it jumps to the next one that is big enough, instead of being cut into fragments like "18 minutes + 2 minutes".
   - **Small tasks fill forward**: gaps that were skipped are left for smaller tasks behind. With a stand-up at 10:30, a 40-minute weekly report doesn't fit in 10:00–10:30 and moves after the stand-up; the 20-minute reply to mail behind it fills 10:00–10:20. "Up next" lists tasks in the order they were actually placed.
   - **Long tasks can be split**, but every piece (including the last) is at least 25 minutes. A task too short to split into two 25-minute pieces counts as a short task.
   - A task in progress is not bound by this: it carries on from now.
   - "Shortest chunk" is a setting; set it to 0 to go back to the old way of splitting from the earliest gap and filling it.
5. **How much is left**: with progress, use the progress; without it but with time already done, use "estimate − already done" (including time done on earlier days), leaving at least 5 minutes.
6. **A parent is not counted twice**: when a parent has children and no duration of its own, the time counts only on the children.
7. **What doesn't fit by the end of the day** goes to "Won't fit" and the capacity bar turns red.

### The numbers on the capacity bar

The definitions follow Nautilus Log on Roam. Two lines:

| Number | Meaning |
|---|---|
| Planned | how much longer all the unfinished to-dos still need |
| Spare | how much is still free after everything planned is placed |
| Overload | how far planned work exceeds the schedulable time. When it appears, Spare is not shown |
| No gap fits | enough time in total, but no single free gap is long enough for some task; this many minutes could not be placed. Only shown when there is no overload |
| n% free | Spare ÷ schedulable time for the whole day. Any spare at all shows at least 1%; exactly full is 0% |
| Schedulable a / b | time you can still schedule from now until the end of the day / schedulable time for the whole day after events |
| Events a / b | event time not yet past / event time for the whole day. Overlapping events count as a union, the same minute is not counted twice |

🔥 in front of "Schedulable" or "Events" says which budget is draining this minute. For past days schedulable is 0 and everything unfinished counts as overload. After 10 finished tasks, if your estimates are off by more than 15% overall, the first line gains one more phrase: "About 4h10m going by your history".

## How to read the spiral

- The spiral is a 12-hour dial that winds from the start of the day (outermost) to its end (innermost). The numbers around the outside are clock hours.
- **Colours**: warm yellow is events, blue is to-dos, red is anything with an important marker, green is done, cyan is flashcard reviews. Pale blue is time already done; solid blue is what is planned next; the piece of what you are doing from now on slowly breathes. The palette is tuned for low-saturation light themes, and you can change it in settings.
- **Animations pause when you switch apps**: the breathing, the blinking 🔥 and the "now" glow loop forever, so when Obsidian isn't in front they stop on the current frame and resume when you come back. While any loop is running the whole window has to be redrawn every frame, which burns battery when left open in the background.
- **The dark grey hand** is now; a ring of dots spreads out from the dot on it, and the current time is written in the middle.
- **Hover any segment** and the fixed line above the spiral immediately shows in bold what that segment is, with its start and end time and duration in front; no need to stop and wait for a tooltip. At the same time that task's other segments and its row in the list light up, and the other segments fade; the reverse works too, hovering a row in the list.
- **Click any segment** to jump to that line in the note (calendar events open the Calendar app).
- **Hatching** is past time with no record at all: no event, no finished task, no worked span, no agent session and no gaming. Hovering the first line under the capacity bar gives the same figures in its tooltip, "📝 9h20m gone · 6h05m recorded (65%) · 3h15m unrecorded", and says how much of the recorded time you recorded and how much only the machine did. It is a fact about scheduling, not a verdict that the time was wasted. Today counts up to now; past days count the whole day. "Show unrecorded time" in settings turns it off.
- **Free time** is invisible until you hover it: the segment lights up and the line above shows "Free slot" with its start and end and its length; the one "now" falls in says "Free now". Past days have no free slots and show none.
- **Play back the whole day**: click ▷ at the top and "now" sweeps from the start of the day to its end in six seconds, to-dos flow forward with it and the hatching grows; at the end it returns to the real now. It only redraws; the note is not changed. Past days play too.
- **The two hollow handles** are the day's actual start and end. Drag along the spiral to change them (5-minute steps), double-click to restore the default. If you got up at 10 today, drag the start to 10:00: the earlier stretch is drawn dashed and the capacity is recalculated.
- **Type the times directly**: click "☀️10:00–🌙--:--" at the top, or run the command "Set today's start / end of day", and type the start and end in the dialog (`10:30`, `1030` and `10点半` all work; for an end after midnight write `2:30`, which counts toward that night). Both can be empty; an empty one uses the old default, so in the morning you can fill in just the start and add the end when you really stop (or send "睡了" on Telegram). "Now" fills in the current time; "Default" clears the fields.

The list under the spiral is grouped: Fixed events, Up next, Won't fit, ⏸ On hold, Worked on · moved away, Done. Click any row to jump to its place in the note.

## Start working on a task

There is no separate "Start" button: making a task `DOING` in the note is starting it.

- Click the status icon in "Up next" to cycle states, or right-click to pick a human status (`TODO` / `DOING` / `DONE` / `PAUSED` / `WAITING` / `SUSPENDED` / `CANCELLED`), set priority (`[#A]` / `[#B]` / `[#C]` / clear), or "Start Pomodoro"; you can also edit the keyword directly in the note, or use the Task status toggle plugin's `⌘/`.
- When the line says `DOING`, the plugin takes the time after it (or the current time if none is written) as the start and counts from there; when it becomes `DONE`, `PAUSED` or back to `TODO`, counting stops. Interrupt and resume, and it is several spans, recorded span by span.
- The estimate can go after the keyword or at the end of the line, both work (`15 minutes`, `15 分钟`, `15m`, `1.5h`); without one, "Default task length" applies. Scheduling and the reviews both use it.

### 🍅 Lightweight Pomodoro

On today's view, the compact bar under capacity offers `15m` / `25m` / `Custom` presets and a play button:

- **Independent or task-bound**: click play to reserve an upcoming block without touching the note, or right-click a task in "Up next" → "🍅 Start Pomodoro" to switch it to `DOING` and get a completion prompt offering "Mark DONE / Another round / Close".
- **On the spiral's outer rail**: an active Pomodoro splits into a solid arc for elapsed time and a dashed arc with a hollow end dot for the unrealized reservation, without pushing scheduled tasks back; completed rounds stay as subtle arcs on the outer rail (cancelling early leaves no trace).

## Timing: how long something actually took

The plugin watches the note and records it itself:

- A task becoming DOING starts a span. Going back to TODO or becoming DONE ends it. Interrupt and resume, and it becomes several spans.
- Rename a task in progress and its timer moves under the new name; it is the same thing.
- A task moved to tomorrow unfinished (a line ending in a source marker like `← 2026_09_30`) counts the time done on earlier days too.
- If a task was changed to DOING while Obsidian was closed, it is filled in when you next open: a written start time is used, otherwise the opening time.
- For a finished task the finishing time is taken in this order: a time written after DONE > the `**07:37**` timestamp > the moment the plugin saw it become DONE.
- A task without a duration that has recorded spans counts its actual time when done.

Timing records are kept in the plugin's `data.json` for 45 days. That is the working copy; the source of truth is the `⏱` line in the note, see the next section.

### The ⏱ line: actual spans in the note

```
- DONE 🤖 add hover text to Nautilus Spiral
	- ⏱ 09:59–10:18, 10:33–10:34, 20:10–20:40 · total 50m · 48k tok · [Claude](claude://resume?session=…)
```

Child items starting with `⏱` under a task are the spans that task actually took. They are neither tasks nor events and scheduling ignores them; the spiral, the list, the day review and the estimate review use them to work out actual time.

- **Who writes it**: for lines under Agent Deck's automatic journal logging, Agent Deck writes it when the task is parked or done, followed by the tokens the session under that line used that day (output + input read, cache hits not counted) and which agent recorded it; with a single Claude session, the word Claude is a link that takes you back to that session. After you turn on "Write actual time into the note" in settings, tasks you do yourself get one too: a line is written when it stops being DOING (done, paused, back to TODO), in the same form, without the agent's name. That setting is off by default, because it edits the note more.
- **It wins**: while a task isn't being worked on, actual time comes from this line. If you think the machine got it wrong, edit the line and the spiral follows. After 45 days, or on another computer, the plugin's own records are gone and this line is all there is, which is why "Review the last N days" can go up to 365.
- **Three cases don't follow it**: a task in progress (it is still being written; this line is from the last stop); one with too many spans where only the last 8 are written and the line starts with `…` (the timing records are used while they still exist); and one ending in `← 2026_09_30` (moved from another day, so the `⏱` it carries describes the original day).
- **Any form is read**: separators between spans can be the Chinese enumeration comma `、`, a comma or a semicolon; between start and end, `–`, `-`, `~` or `到` (Chinese "to") all work; the total can be `共 57m` or `共 1小时21分` (Chinese "total"). If a total is written it is used, because nearby spans (less than 10 minutes apart) were merged when written, and adding the spans back would count the gaps too.

### How a task matches an agent session

When a session is matched, its state, latest step and tokens show on the inner rings and in "Agent inner-ring details". The row of characters under the task line is gone (removed in 2.4.0, replaced by the detail card on the inner rings).

**How sessions are matched**: a line logged by Agent Deck is used directly; otherwise it looks at the name (the session title and the line are the same, or one contains the other), or at what you sent in the session containing the line's words. So paste a task line as your first message to Claude / Codex and that session's state starts showing under it. If several sessions match, the most recently active one. Only sessions active today are searched.

**The `🔗` line**: it says which session the task is bound to, and it still holds when the block is moved, sent to another day, or the task is reworded. Claude's `🔗` is a link that opens the session in the Claude desktop app; other agents have no such link, and their session id goes in backticks. Block routing writes this line itself when it sends a block to the Claude CLI; to undo it, delete the line.

**Archived**: when the matched session is archived in the Claude desktop app, Codex or DeepSeek Harness, the details show it as archived; marking this line `DONE` and wrapping up the `⏱` line and the `🔗` is Agent Deck's job.

### 💬, subagents and child sessions

These things written into the note are all Agent Deck's work now; the spiral only displays them:

- **The `💬` line**: for tasks with a `🔗`, each time the session finishes a turn Agent Deck squeezes the last reply into one `- 💬 …` line under the task. The spiral shows that line faded, and scheduling and state sounds skip it.
- **subagents and side chats**: when the matched session is a Claude Code session, the subagents it dispatches and the side chats you opened on it in the Claude desktop app all count into "Agent inner-ring details" (description, running or finished, latest step, tokens; a side chat says open and for how long). Subagent logs sit under `subagents/` in the session folder; a side chat is not written to disk, so all that can be seen is the claude process the desktop app starts for it.
- **Sessions opened from a session**: in the Claude desktop app, when a bound session opens new sessions, Agent Deck writes each as a child block of the task with its own `🔗`; these child blocks are ordinary children of the task.

### Status bar

A permanent cell in the bottom right, with the spiral not even open:

- **Working**: `▶ 12:34 · write weekly report · 2 tasks`, how long the most recently started one has been going and how many are in progress; with a mainline it also carries `· 🎯1/3`. After 45 minutes straight the timer turns red, after 2 hours it becomes "⚠ Check the timer"; both are only hints and never stop anything (both thresholds are fixed defaults).
- **Not working**: today's capacity, `🌀 Planned 2h10m · Spare 45m · 23% free`, orange when overloaded or when no gap fits.
- **Click it**: click to open Nautilus Spiral, ⌥-click to go to the line in progress in the note, ⇧-click to open today's note in a side split.

### UI sounds

All of them are short sounds synthesized on the spot; no audio files. Edits in the editor (⌘/, clicking a keyword, typing) sound right away, without waiting for the note to be written to disk. They stay silent when Obsidian isn't in front; "UI sounds" in settings turns them all off with one switch. The reminder sound is set separately.

**A click**: any segment on the spiral (event, task, agent line, hatching, free slot), any row in the list (Up next, Done, Agents, Day review…), and the rows and buttons in the "Status now" panel all give one soft tick.

**A task changes state**: in any note in the vault, when a line's keyword changes it sounds, whoever changed it: clicking a keyword in TODOseq, a ⌘/ quick switch, dragging on a board, typing. The sound has two moods:

| State | Sound | Mood |
|---|---|---|
| `TODO` | triangle wave, one clean note | Moving forward: sine and triangle, the pitch rises; the most heard `DONE` doesn't rise, it lands on the tonic, lower and softer |
| `DOING` | up a fifth | |
| `DONE` | two notes gently up, landing on the tonic, slower attack | |
| `PAUSED` | one soft step down | Stopping, not making it: the pitch falls, lower each step, and the waveform gets rougher |
| `WAITING` | the same note twice, hanging | |
| `SUSPENDED` | down a fourth | |
| `CANCELLED` | square wave, a short fall | |
| `FAILED` | sawtooth, lowest and heaviest | |

Checkboxes count too: `[ ]` is TODO, `[/]` is DOING, `[x]` is DONE, `[-]` is CANCELLED. Removing the keyword entirely gives a short note.

No sound in a few cases: a new line, a deleted line, a line that only moved or was reworded; three or more lines changing at once (that's a sync or a bulk tidy, not you clicking); the seconds while the machine tidies the note itself; and before the first save after a note is opened (it has to know what the note looked like first to compare).

The start and end of playback each have their own sound.

## Hard rules: pausing

Today's note only. Every time one of these rules turns a task PAUSED, a system notification is sent; click it to jump to the line.

- **At most 3 DOING at once**: starting the 4th changes the earliest started to PAUSED. Work handed to an agent doesn't count and isn't paused: tasks logged by Agent Deck, tasks with a `🔗` under them, and tasks auto-matched to a session, together with the whole block they are in (the top-level item and its children). Send a whole block of material to Claude and five or six lines in it can be DOING while you still start three of your own.
- **3 hours untouched and it pauses**: if a DOING line and its children haven't changed for 3 hours, it becomes PAUSED. Lines logged by Agent Deck are exempt.

Both the limit and the hours are settings; 0 turns the matching rule off.

`PAUSED` vs `SUSPENDED`: PAUSED is just a stop, still scheduled on the spiral, and ⌘/ continues it; SUSPENDED (and WAITING) is parked, not pushed short-term, not scheduled and takes no capacity, listed under "💤 Parked". In TODOseq, PAUSED sits under "Not started" and SUSPENDED under "Waiting".

## 🎯 Mainline

The one to three things that matter most in a day. Write `[#A]` on a task (or the short form `TODO a write résumé`, `todo a写简历`), and the whole block it is in (the top-level item and its children) is one mainline block for the day; `[#A]` children without a keyword under a `todos:` parent and `TODO4AI [#A]` handed to AI count too; at most 3 blocks a day, taken in note order, and the extras don't count (journal cleanup lowers them to `[#B]`).

- A "🎯 Mainline" section at the top of the list; when scheduling they go after DOING and before other to-dos; on the spiral they are drawn in green.
- One line under the capacity bar, `🎯 ●◐○ Mainline 1/3 · Next`: ● done, ◐ doing, ○ not started, ✕ failed (`FAILED`), one per A-level task. The completion rate counts A-level tasks: cancelled ones don't count, failed ones count toward the total but not as done, and never as "Next".
- In the "🎯 Mainline" section of the list, the few the scheduler ignores are still listed: `TODO4AI [#A]` says "Handed to AI", `FAILED [#A]` says "Failed".
- The status bar shows the next mainline task when no timer is running.
- At the reminder times (15:00 and 22:00 by default), if the mainline isn't finished and you're not working on it, you get one reminder; if no mainline is set, you're reminded to set one.
- After the date cutoff, the previous day's completion rate is written into that note's properties `mainline: 2/3` and `mainline-rate: 67`.

**Set the goal before you start**: as soon as a mainline task (the A-level line) becomes DOING, a dialog asks "When is this done?" for any task that has no goal yet. Write one sentence you can check against and press Return or "Set it and start"; it is recorded as the first line under the task:

```markdown
- DOING 14:05 [#A] write résumé
	- 🎯 Goal: résumé PDF sent to 3 companies; the QR code on the project page scans
```

Click "Not yet" or close the dialog and the line goes back to TODO: no goal, no start for mainline tasks. It is checked every minute as well, so mainline tasks already in progress are asked too. Work handed to an agent is not asked. The `🎯 Goal:` line, like `🔗` and `⏱`, is a marker line: neither a task nor an event (a time in it doesn't count either), and no state sound; block routing carries it when it sends the block to an agent, which makes it a ready-made acceptance criterion.

**Draggable progress bar**: under the first line of each mainline block in the note (the top-level item) there is a thin progress bar, not after the child blocks; one bar per A-level task in the block (no name when there is only one). Drag it to a percentage (5% per cell), and releasing writes the progress into that line: existing `40%`, `1/3`, `三分之一`, `一半` is replaced, otherwise it is appended at the end (before tails like the block ID, `%%` comments and `← date`). A finished one shows "✓ Done". Turn mainline off in settings and the bar isn't drawn either.

## 🗓 macOS widgets

Four widgets, for the desktop or the Notification Center sidebar:

- **Today's mainline** (small, medium): how many are done, which is running / the next one and its goal (orange when there is no goal); on medium, a progress ring and the last 7 days' completion on the left, and every task listed on the right.
- **Doing** (small, medium): the `DOING` tasks in today's note and how long each has run (the timer runs on its own, no refresh needed); mainline ones carry a target.
- **To-dos** (small, medium, large): every unfinished item in the vault — list items with `TODO` / `LATER` and Markdown task boxes `- [ ]` (not inside code blocks), recently edited notes first, the total in the top right corner; medium and large also say which note each one is from. Click the circle to tick it off in that note: the box gets checked, `TODO` / `LATER` becomes `DONE`.
- **Plan Gantt** (large, extra large): five weeks from this Monday. The data comes from the "Plan note" in settings (`Plan.md` by default, created from a template if missing): list items with `🛫 start`, `⏳ scheduled` or `📅 due` dates each get a bar (the Tasks plugin's syntax), one with a single date becomes a diamond on that day; the nearest heading above, or a top-level list item without dates, is a group, one colour per group; done ones (`DONE`, `[x]`, `✅ date`) are drawn faded, ones past their due date and unfinished are drawn red; children without dates are not drawn, which is the right place for detail.

```markdown
- job hunt
	- [ ] rework résumé 🛫 2026-10-26 📅 2026-11-01
		- projects summarized on a portfolio page, a QR code instead of a string of links
	- [ ] send the first batch 📅 2026-11-20
- tutoring
	- [ ] classes and follow-up feedback 🛫 2026-10-26 📅 2026-11-29
```

Mainline and Doing show a ✕ for failed (`FAILED`). Each widget has a refresh button in its top right corner: it asks Nautilus Spiral to recalculate right away; when Obsidian isn't open it just rereads the data it already has.

**Two-way**: every row has a circle in front; click it to mark the task done in the note (the plan note for the Gantt) and click a done one to undo: a mainline or Doing line becomes `DONE 14:05-15:30 …` (one not yet started becomes `DONE 15:30`), undoing changes it back to `TODO` and removes the time after DONE; a Gantt row gets its checkbox ticked and a `✅ date`, and undoing reverses it. The widget redraws at once; with Obsidian open the note is changed within a second or two, and with it closed the taps are stored in `inbox/` and applied next time. If the widget is still showing yesterday (the date cutoff passed but it hasn't refreshed), nothing is changed.

Click a name to jump back to that line in Obsidian (mainline and Doing to the note, Gantt to the plan note, to-dos to the note they're in); click anywhere else to open today's note. A link on a widget is handed to the widget app first (that's how WidgetKit delivers it), which passes it to Obsidian through the plugin's `obsidian://nautilus-open?note=…&kind=…&text=…`.

**How it finds the line**: for your own lines in mainline and Doing, the plugin appends a block ID at the end (`^nw-` plus six characters) and the link carries it, so a reworded or moved line is still found. Three kinds don't get one: the line your cursor is on (you're typing, the end can't suddenly grow something), lines logged by Agent Deck, and lines with 🤖 (Agent Deck recognises its lines by the whole line, and a changed tail would break that). Those, and the Gantt and to-dos, carry the item's text in the link (to-dos also a line number) and look up which line it is on when clicked, so you can add lines above without refreshing the widget.

**Install**: the widgets are a separate macOS app, with the source in `widgets/` in the plugin repo. You need Xcode, XcodeGen (`brew install xcodegen`) and an Apple Development certificate (Xcode → Settings → Accounts, sign in with an Apple ID; a free account is enough), then run `./build.sh` in `widgets/`; it compiles, signs and installs to `~/Applications/NautilusWidgets.app`. Then turn on "Export data for widgets" in Nautilus Spiral's settings, fill in "Plan note", right-click the desktop → "Edit Widgets" → search "Nautilus Spiral" ("螺旋日程" on a Chinese system; the widgets follow the macOS system language and their labels are bilingual) and drag the four out; for the Notification Center sidebar, click the time in the top right and "Edit Widgets" at the bottom.

**How it updates**: the plugin recalculates on the same minute as the mainline calculation and again when today's note changes; only when the mainline, Doing, to-dos or plan content really changed (a state, a wording, an item added or removed) does it write the data to `~/Library/Application Support/Nautilus Spiral/widgets.json` and then call `nautilus-widgets://reload` to have the app refresh the widgets in the background (it quits two seconds after refreshing, it doesn't stay running). The system gives widgets a limited number of refreshes, so the widget doesn't poll: it only swaps the picture at noon and midnight (whether mainline counts as stale, the Gantt's "today" moving on). The widget runs in a sandbox with read and write access to that one folder (to drop taps into `inbox/`). When Obsidian isn't open, mainline stays as it last was and the widget says "Mainline stopped on …".

Double-click `NautilusWidgets.app` to open a window showing how the four widgets look now; `NautilusWidgets.app/Contents/MacOS/NautilusWidgets --render <directory>` draws each size as a PNG (one light, one dark).

## 🤖 Agent sessions into the note: that's Agent Deck's job

Without Agent Deck, Nautilus Spiral is a task management plugin and you can skip this section; if you want what an agent did recorded in your note, install Agent Deck as well.

What you write in the note is the estimate; an agent's session log is the actual record it writes itself. Turning that passive record back into the note (the line whose session is running becomes `DOING`, a stopped one becomes `PAUSED` with a `⏱` span, an archived one becomes `DONE`, work the reply asks for gets its own `TODO 🤖 …`) is now done only by [Agent Deck](https://github.com/MatsuriMW/obsidian-agent-deck). Nautilus Spiral used to have its own set (automatic journal logging, switching a task's state when a session stops, writing the session's conclusion under the task, the agent summary in the status bar, the weekly direction review, and their hotkeys); it overlapped with Agent Deck and has been removed.

Nautilus still reads the session logs and displays: collaboration time and tokens, the thin lines on the inner rings, and the session details you open by hovering or double-clicking a segment on the inner rings. It also recognises lines Agent Deck logged (it reads the session-to-line pairs it records): time comes from when the session was really moving, not from the "becomes DOING, start timing" rule, and it isn't subject to the DOING limit or the idle pause.

## 🤖 What the agent was doing while you did this

During the spans a task took, if any agent sessions were working, `🤖2` appears after that row in the list, and hovering the segment on the spiral shows it too.

- **Looking only at time would count unrelated sessions running at the same time**, so it looks at content too: if a word from the task name appears in the session title, or in what you sent in the session, it "looks related". The number after 🤖 is how many are related. Time overlap alone with no visible relation leaves the 🤖 faded.
- **Click 🤖** to open the list, split into "looks related" and "other sessions in the same period", showing each session's title, your first message, working directory, how long it overlaps this task and how many tokens it used (output + input read).
- **Back to that session**: a session started in the Claude desktop app opens with "Open in Claude" through `claude://resume?session=…`; one started in a terminal uses "Continue in terminal", which runs `claude --resume …` in its working directory; Codex sessions have "Continue in terminal" too, running `codex resume …`; you can also copy the command and run it yourself. WorkBuddy sessions are only listed; go find them in their own window.

The data comes from the same local session logs the agent collaboration section reads; with several things in parallel, one session can be attached to several tasks at once.

## 📋 Day review

"📋 Today's review" in the list answers one question: which of today's tasks differed from the estimate, and by how much. Folded by default, with the conclusion in the title (how many done, how far off), and opening it shows the task-by-task comparison in note order. On a past day it shows that day's.

| State | What it means |
|---|---|
| Compared | done, with actual time recorded. The row shows the difference: actual − estimate, `+12m` is over |
| Not timed | done, but no actual time recorded. It says "Not timed", not 0 |
| Doing | not finished, in progress |
| Paused | not finished, not running, worked on earlier |
| Not started | no time spent yet |
| No estimate | the line was never planned: an automatic 🤖 line, or `DONE 18:02 write script 2h` which records how long it took. Only actual is listed; it doesn't enter the comparison |

- The summary counts only the "Compared" ones: estimated total, actual total, how far off. Both sides are the same set of tasks; running and paused ones don't move the difference.
- Estimates come from the duration on the line, or the default task length, because that's what scheduling used too.
- Fixed events don't count (a time span is an agreement, not an estimate), nor do big items with children, nor flashcard reviews.
- Being over is highlighted in orange; being under isn't marked: saved time isn't a credit, and extra time isn't a fault.
- The Telegram "slept" receipt and the "Status now" panel carry this summary line too.

The first five states and the summary follow Nautilus Log's daily review; "No estimate" is added here, because machine-written lines have no estimate and comparing them to the default 15 minutes would mean nothing.

## 📏 Estimate vs actual

"📏 Estimate vs actual · last 30 days" at the bottom of the list shows whether the durations you write hold up over time:

- Overall: among the finished tasks, the estimated total, the actual total, how many percent over or under that is overall, how many were underestimated, overestimated or about right (within ±20%), and how many times an estimate a task usually takes.
- By tag / link: lines with `#voiceover` or `[[a project]]` are grouped by them, and the groups with the biggest difference are listed, e.g. "×1.6 #voiceover 5 tasks".
- Most underestimated: click one to jump to that line in the day's note.
- The calibration on the capacity bar: after 10 tasks, if the overall difference is over 15%, the first line gets one more phrase, "About 4h10m going by your history", meaning how long these to-dos will really take at your usual pace.

Only tasks like this count: done, with an estimate written and actual time recorded. Actual time comes from `DONE start-end`, or from the spans the plugin recorded while DOING. Tasks you write as DOING and change to DONE when done naturally satisfy these. `DONE 18:02 write script 2h` doesn't count, because that 2h is actual, not an estimate. Timing records are kept for 45 days, so at most 45 days are looked at.

## How reminders go out

- **Ones that need no answer** (auto-pause, mainline reminders): if a Discord channel is set they go to Discord, see the next section; otherwise a notification pops on this Mac and a sound plays. The same kind of reminder arriving within a few seconds is folded into one.
- **Ones that need a button click** (after an auto-pause, "Pause a different one" / "Still working — back to DOING"): a system notification with buttons pops on this Mac; click one and it does that.
- **Sound**: put a system sound name (Pop, Glass, Ping, Tink, Submarine…) or the path to a sound file in "Reminder sound on this Mac"; empty = silent.

"Interactive reminder style" in settings controls the second kind: "Default notification" pops a normal notification on this Mac; "System notification with buttons (experimental)" compiles a tiny notification app on this Mac and puts the buttons on the notification. It needs the system to allow this app to send notifications, and on some macOS versions the system won't trust a locally signed app so nothing is ever delivered, which is why it is off by default.

## Reminders to Discord

If you use Discord as the one place where machine reminders collect, Nautilus Spiral's reminders can go there too. Put a channel name in "Discord channel for reminders" and the plugin calls the local `notify-discord <channel> <message>` script (the webhook address is the script's own business; the plugin never touches it). Empty = don't send.

- **Reminders that need no answer** (auto-paused for going over the limit or being idle too long, mainline reminders) go to Discord. Once sent, they don't pop on this Mac again.
- **Ones that need a button click** ("Pause a different one", "Still working / back to DOING") still pop on this Mac; Discord only gets a line in the log. A webhook can only send and can't receive what you clicked, so buttons can't go into Discord.
- The content sent includes the task name, i.e. the text of that line in the note.

## 📅 Google Calendar

Besides macOS Calendar you can read Google Calendar directly, through the Google Calendar API. Both can be on at once; the same event on both sides (a Google account also added to macOS Calendar, say) is kept once. Use this if you're not on a Mac, or if you don't want to add your Google account to the system.

It uses your own OAuth client; the plugin ships no shared key. Set it up once, about five minutes:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (any name).
2. Under "APIs & Services → Library", search for Google Calendar API and click "Enable".
3. "APIs & Services → OAuth consent screen": choose "External" as the user type, fill in the app name and your email; add your own Google account under "Test users".
4. "APIs & Services → Credentials → Create credentials → OAuth client ID": choose **Desktop app** as the application type. You get a client ID and a client secret.
5. Back in Obsidian: Settings → Nautilus Spiral → Google Calendar, turn on "Read Google Calendar", enter the client ID and secret, and click "Connect". The browser opens Google's sign-in; pick the account, allow "See your calendar", and once the page says "Connected" you can close it.

After that it behaves like macOS Calendar:

- Read-only: the only scope requested is `calendar.readonly`; it doesn't change the calendar and doesn't write into the note.
- It reads only the calendars checked (shown) in the Google Calendar interface; "Skip these calendars" applies to it too, and "List calendars" shows the names.
- Segments and rows use that calendar's own colour and carry 📅 in the list; click one to open the event in the browser.
- All-day events take no time and are listed under "Fixed events"; cancelled ones and invites you declined don't count; one already written by hand in the note is not duplicated.
- It rereads every two minutes; the command "Reload calendars (macOS Calendar / Google Calendar)" rereads right away.
- If authorization expires or you revoke it in your Google account, a line under the capacity bar asks you to reconnect. While the app is still in "Testing", Google lets authorization expire every 7 days; if that's annoying, "publish" the app on the consent screen.
- "Disconnect" deletes the stored authorization. The client secret and authorization are kept in the system keychain (Obsidian's secret storage), not in the plugin's `data.json`, so they don't travel with the vault.

## 📅 macOS Calendar

After you turn on "Read macOS Calendar" in settings, events from the system Calendar app (iCloud, Exchange, Google accounts, subscribed calendars — anything the Calendar app can show) are placed on the spiral as fixed events:

- Read-only: it doesn't change the calendar and doesn't write into the note.
- Segments and rows use that calendar's own colour and carry 📅 in the list; click one to open the Calendar app.
- All-day events take no time and are listed under "Fixed events". When the calendar can't be read, a line with "📅" under the capacity bar says why.
- Cancelled events and invites you declined don't count; the same event in several calendars (two holiday calendars, say) counts once; one already written by hand in the note is not duplicated.
- "Skip these calendars" excludes calendars you don't want scheduled; "List" in settings shows the names of all calendars on this Mac.
- It rereads every two minutes; the command "Reload calendars (macOS Calendar / Google Calendar)" rereads right away.
- The task reminders plugin and Telegram's `?` count calendar events towards capacity too. When a calendar event is about to start, task reminders doesn't send another notification; the Calendar app reminds you itself.

Reading the calendar uses the system's EventKit: the first time, the plugin compiles a small Swift reader on this Mac into `~/Library/Caches/nautilus-spiral/` (it needs the Xcode command line tools; without them run `xcode-select --install`), and then the system asks "Obsidian would like to access your calendar"; choose Allow. You can turn it off at any time in System Settings → Privacy & Security → Calendars.

## Looking at other days

- `‹` `›` at the top page back and forth; "Today" returns to today.
- Open any daily note from the calendar or the file list and the spiral switches to that day.
- Past days: show what was actually done and what wasn't finished. Future days: planned from the start of the day.

The conclusion and progress of the same session are written by Agent Deck into the same task with a block ID. The spiral identifies items by block ID, and shows finished steps when Claude has a TaskCreate / TaskUpdate list; without a list, and for Codex, WorkBuddy, DSH and Antigravity, it shows "Turn N". `📋` and `❓` child lines are recognised as session records. Change the automatic-entry threshold, timing, CLI and model in Agent Deck's "Tracking → Automatic journal".

## Optional modules

These modules can all be turned off in settings:

- **🤖 Agents**: reads the session logs agents leave on this Mac and shows on the "🤖" line under the capacity bar how long you collaborated that day and how many tokens were used (output + input read; hover for output, input and cache hits, how much each agent used, and how long each workstream took), draws when each agent was working as thin lines on the inner rings, and lists them at the bottom of the list by project with a 7-day bar chart; click a project row to list its sessions for that day and go straight back to one. Five are supported; pick under "🤖 Primary agent and tracked agents":
  - **Claude** (`~/.claude/projects`): Claude Code, and Code sessions in the Claude desktop app.
  - **Codex** (`~/.codex/sessions`): the desktop app and the `codex` CLI both count. Tokens are the cumulative usage Codex records itself, so they match the numbers in its own interface; session titles come from `session_index.jsonl`; archived sessions are still read from `archived_sessions`; the time and tokens of sub-threads like automatic review are recorded under the main session, not as a session of their own.
  - **WorkBuddy** (`~/.workbuddy/projects`): the desktop app.
  - **DeepSeek Harness** (`~/.dsh/sessions` plus the local `dsh-token-usage-stats` API): reads zstd session logs; usage stats are filled in when the API is available. Archive state comes from `~/.dsh/storages/workspace.json`.
  - **Antigravity** (`~/.gemini/antigravity/brain/<session id>/.system_generated/logs/transcript.jsonl`): reads user input, planning replies and tool calls, and shows the state and turn count.

  **The primary agent is tracked in full, the rest only today**: the primary reads all of its session history; the other agents that are on read only session files active today and count only today's activity — today's time, tokens and inner rings as usual, older sessions are not looked at. Whatever was already summed up on earlier days stays. The primary is always on; after switching the primary, the last two weeks of logs are read again.

  One ring and one colour per agent: Claude orange, Codex grey-black, WorkBuddy teal, DeepSeek blue, Antigravity a blue-green-gold gradient; the token numbers and the bar chart in the list use the same colours. A turned-off agent is no longer read; its already summed history is kept but hidden, and comes back when you turn it on again. The totals are also saved as `ai-usage.json` in the plugin folder, so history survives Claude Code clearing its old logs.
- **🃏 Flashcard review**: the Second Brain's daily review records `DONE 14:10-14:12 复习卡片 23 张（…）` in the note ("复习卡片 = review cards", 5 seconds each); that stretch is drawn cyan on the spiral, the row in the list is cyan on the left too, and the day's total is in the tooltip on the first line of the capacity bar.
- **🎮 Gaming**: every minute it checks whether you're playing (both the process keywords and the "count only when in front" apps are settings), draws a purple line on the innermost ring, and records it in `game-log.json`. Only recorded while Obsidian is open.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Day starts at | 8 | Where the spiral begins |
| Day ends at | 32 | Where the spiral and the schedule stop; over 24 means after midnight (32 = 8 AM the next day) |
| Daily note cutoff | 08:00 | Before this time it still counts as the previous day's note. 24-hour time (`08:00`, `4:30`); a single number works too |
| Default task length | 15 minutes | Tasks without a duration use this |
| Find the daily note automatically | On | Follows your Obsidian *Daily notes* (or *Periodic Notes*) folder and format; with neither installed it scans the vault for the commonest date-named pattern that is still being written. Turn it off, or fill in *Daily note folder* / *file name format*, to set it yourself (moment.js syntax) |
| Important markers | `[[important]], [[重要]], ⭐, ‼️` | Comma-separated |
| Shortest chunk | 25 minutes | The minimum length of each piece when a task is split by events; 0 = split and fill |
| Read macOS Calendar / Skip these calendars | Off / empty | See "📅 macOS Calendar" |
| Read Google Calendar / Client ID / Client secret | Off / empty / empty | See "📅 Google Calendar"; the secret is in the system keychain |
| Max DOING at once / Pause DOING after idle | 3 / 3 hours | 0 = off; blocks handed to an agent don't count toward the limit |
| Mainline / Mainline reminder times | On / `15:00, 22:00` | See "🎯 Mainline" |
| Export data for widgets / Plan note | Off / `Plan.md` | See "🗓 macOS widgets"; the plan note is created if it doesn't exist |
| Run DOING tasks in parallel | On | Several DOING overlap in the same stretch |
| Estimate vs actual / Review the last N days | On / 30 | See "📏 Estimate vs actual"; at most 365 days, and anything past 45 days relies on the `⏱` lines in the notes |
| Day review | On | See "📋 Day review" |
| Show unrecorded time | On | The hatching on the spiral, and the "📝 gone / recorded / unrecorded" line in the capacity bar tooltip |
| Write actual time into the note | Off | Tasks you do yourself also get a `⏱` line under them; see "The ⏱ line" |
| Status bar | On | The permanent cell in the bottom right; see "Status bar" |
| UI sounds | On | The click tick, task state changes, playback start and end; see "UI sounds" |
| Open today's note on startup | On | "Today" follows the cutoff; created if it doesn't exist |
| Show Nautilus Spiral in the left sidebar on startup | On | |
| Show agent collaboration / Track gaming time | On | See the previous section |
| Primary agent | Claude | The one tracked in full: all history; always on |
| Tracked agents | Claude, Codex, WorkBuddy, DeepSeek Harness and Antigravity all on | Only the ones that are on are read, drawn into the spiral and counted; non-primary ones only for sessions active today |
| Interactive reminder style | Default notification | Also an experimental "System notification with buttons"; see "How reminders go out" |
| Reminder sound on this Mac | Pop | A system sound name or a path to a sound file; empty = silent |
| Discord channel for reminders | empty | When set, reminders that need no answer go to that channel; see "Reminders to Discord" |

## Works with Telegram Companion

[Telegram Companion](https://github.com/MatsuriMW/telegram-companion) is another plugin by the same author: messages you send to a Telegram bot land in the day's note, and when you want to talk it reads your last week of notes before it speaks. The two grew up together, and with both installed your phone becomes Nautilus Spiral's remote:

| You, in Telegram | On the Nautilus Spiral side |
|---|---|
| send `?` or `/now` | a picture of today's spiral comes back, with what's in progress, the next few, and what doesn't fit |
| send 起了 ("up") or 睡了 ("slept") | set the day's actual start and end to the time you said, and work out when you went to sleep and for how long |
| send `done write script 2h`, `doing write script` | change the matching task in today's note and fill in the time (this one also needs Done To Top) |
| Sunday evening | a "this week's direction" review arrives |
| chat with it | it can see how many tasks are done today, how much is left and when you stopped these days, not just the words in the note |

**Setup**: first follow Telegram Companion's own getting-started guide (create a bot, enter the token, send it a message so it knows you). After that just enable both plugins; there is nothing to fill in on the Nautilus side: the bot token and your chat id live only in Telegram Companion's settings, and Nautilus Spiral reads them when it wants to send.

Add [task reminders](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/nautilus-notify) too and the timed schedule picture and to-dos carried over for days (with buttons) are pushed to the same bot.

Telegram Companion only runs on the desktop, and Obsidian on your computer has to be open for messages from your phone to be picked up.

## Works with other plugins

- **Task reminders** ([`nautilus-notify`](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/nautilus-notify)): sends macOS notifications from the schedule Nautilus Spiral worked out: an event about to start, a pinned to-do whose time has passed, a DOING task running too long, today no longer fitting, what's next, plus a morning briefing and an evening wrap-up.
- **Telegram Companion** ([`telegram-companion`](https://github.com/MatsuriMW/telegram-companion)): see the previous section.
- **Task status toggle** ([`task-toggle`](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/task-toggle)): ⌘/ cycles none → TODO → DOING time → DONE time span, writing the start and finish times automatically.
- **Block routing** ([`done-to-top`](https://github.com/MatsuriMW/Obsidian-Plugins/tree/main/done-to-top)): files the tasks in the note into DONE / DOING / TODO sections and sends the whole unfinished block to tomorrow. `⌥⌘S` sends a block to the Claude CLI and records the `🔗` under it: select several sibling blocks and each gets its own session; choose "one session per child block" and the parent becomes shared background while every child gets a session. Where a session runs is a setting of its own: a Terminal window, a background tmux (no window on the desktop; `tmux attach` when you want to look), or headless with `claude -p`.

## Hotkeys

No global hotkeys are preset; search "Nautilus Spiral" in Obsidian Settings → Hotkeys to change them. You can also run "Quick panel" from the command palette: every action is there, a few letters find it, and each shows its hotkey on the right; ones that can't be used right now don't appear.

| Hotkey | What it does |
|---|---|
| not set | Quick panel: every Nautilus Spiral action |
| not set | Status now: one panel, from capacity and what's in progress to the reviews and agent collaboration; click any row to jump to that line in the note |
| not set | Agent sessions for what you're doing: sessions that look related during each DOING task; ones that only overlap in time are collected under "Other sessions in the same period"; at the end, sessions still running that match no task |
| not set | Estimate vs actual: open the spiral, expand and scroll to the review |
| not set | Open Nautilus Spiral |
| not set | Set today's start / end of day |
| not set | Test a system notification with buttons (experimental) |

Two more commands have no hotkey: "Open today's daily note (before the day cutoff it's still yesterday)" and "Reload calendars (macOS Calendar / Google Calendar)".

## Agent inner-ring details

Hovering an agent segment shows only its time, agent and short title. Click an agent segment to pin its hover summary so you can move your pointer up to click **Details** without hovering other segments (click the segment again, click **×**, press Escape, or click outside to unpin). Click **Details**, or double-click the segment, to expand the card; click **Hide details** or press Escape inside the card to close it. The expanded card stays open when the pointer leaves and across same-day redraws, and closes when changing dates.

Cards list sessions by overlap with the selected segment, with full task titles, live state, steps or turns, latest action, model, directory and recent reply. Segment overlap time, daily session time and daily tokens are labeled separately. Tokens are output plus fresh input for the whole daily session, never estimated per segment. Historical dates omit today's live state and reply. The first three sessions appear in the card; a separate action opens the complete list. Linked journal tasks and supported clients can be opened directly.

Automatic journal writing, record granularity, compaction thresholds and record folding are configured in Agent Deck. Nautilus reads and displays that information without writing duplicate AI records.
