<div align="center">

<img src="assets/hero-banner.en.svg" width="100%" alt="Nautilus Spiral — Daily-note-driven spiral day planner for Obsidian" />

<br />

**English** · [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-3b82f6.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/MatsuriMW/nautilus-spiral?color=ef5b5b&label=release)](https://github.com/MatsuriMW/nautilus-spiral/releases)

[**Install**](#quick-start-install--use) · [User Guide](./docs/guide.md) · [Works with Agent Deck](#works-with-agent-deck) · [Roadmap](https://matsuri.site/portfolio/journal-workflow/#wishlist) · [X (@Matsurimywaifu)](https://x.com/Matsurimywaifu)

</div>

<p align="center">
  <img src="./assets/demo.gif" width="380" alt="Nautilus Spiral live demo: spiral day dial, Pomodoro timer, and Up next task list">
</p>

Turn today's daily note into a spiral timeline: fixed events stay pinned to their times, and to-dos flow automatically from "now" into the free gaps by list order and estimated duration. As the day moves on, unfinished tasks shift forward and the capacity bar tells you at a glance whether today still fits.

A 50-second tour (Chinese captions, with sound):

https://github.com/user-attachments/assets/c1ccdeaf-1e4b-4798-bcfd-d04401101979

The interface switches automatically between English and Chinese based on Obsidian's language setting.

## Contents

- [What It Does](#what-it-does)
- [Quick Start: Install & Use](#quick-start-install--use)
- [Works with Agent Deck](#works-with-agent-deck)
- [Feedback & Updates](#feedback--updates)

---

## What It Does

### Spiral Day Planner & Capacity at a Glance
- **12-hour spiral dial**: The outer ring starts your day and spirals inward to the end. Fixed events, scheduled to-dos, completed blocks, and the "now" pointer live on one view—hover any segment for instant details.
- **Automatic scheduling & time budget**: Write events and to-dos in your daily note and let Nautilus Spiral place them into free gaps, continuously showing planned time, spare/overload, and remaining percentage.
- **Mainline tasks (`[#A]`)**: Mark up to 3 top-priority blocks a day to schedule them first, highlight them in their own color, and track progress at the top.
- **Unrecorded time & day playback**: Past stretches with no records appear hatched; click Play in the header to replay the whole day in 6 seconds without touching your note.
- **Automatic timing & reviews**: Switching a task to `DOING` starts timing automatically, feeding today's plan-vs-actual review, a 30-day estimate calibration, and a status bar indicator.
- **Read-only calendar sync**: Optionally pull events from macOS Calendar or Google Calendar into the spiral as fixed blocks.
- **Subtle motion & sound cues**: Gentle synthesized feedback on clicks and task status changes (can be muted in settings).

### Lightweight Pomodoro & Up Next Quick Actions
- **Three-preset Pomodoro (`15m` / `25m` / `Custom`)**: Right under capacity on today's view, pick a preset and click play to reserve an upcoming focus block—independently, auto-bound to your current manual `DOING` task, or linked to a specific task via right-click (`🍅 Start Pomodoro` or `🍅 Start with estimate`, plus the editor command for the task at cursor). When a round finishes (or stops early after ≥1 min), actual time is automatically written back under the task as `- ⏱ HH:MM–HH:MM · total Xm` for day review and AI planning; switching tasks settles and pauses the previous task cleanly.
- **Reserved time on the spiral**: An active Pomodoro renders on the spiral's outer rail as a **solid arc for elapsed time + dashed arc with a hollow end dot for the unrealized reservation**, without pushing scheduled tasks back; completed rounds stay as subtle arcs.
- **Fast status & priority actions**: Click a task's status dot in "Up next" to cycle `DONE → SUSPENDED → original state`; right-click tasks in "Up next", "Mainline", "Won't fit", or "Parked" to pick a human status (`TODO` / `DOING` / `DONE` / `PAUSED` / `WAITING` / `SUSPENDED` / `CANCELLED`), set priority (`[#A]` / `[#B]` / `[#C]` / clear), or start a Pomodoro.

<p align="center">
  <img src="./assets/pomodoro.png" width="360" alt="Active Pomodoro bar and spiral outer rail showing elapsed solid arc and unrealized dashed reservation">
  <img src="./assets/upnext-menu.png" width="360" alt="Up Next context menu with human statuses, A/B/C priority, and Start Pomodoro">
</p>

A walkthrough of Pomodoro timing, multi-segment actual-time logging, and daily review (English captions):

https://github.com/user-attachments/assets/253781c1-fbfe-43d4-9c41-cc9446c6a369

---

## Quick Start: Install & Use

### 1. Install
- **Community Plugins / BRAT**: Search for **Nautilus Spiral** in Obsidian Community Plugins, or install via BRAT using `MatsuriMW/nautilus-spiral`.
- **Manual**: Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MatsuriMW/nautilus-spiral/releases/latest) into `.obsidian/plugins/nautilus-spiral/` and enable it in Settings.

### 2. Ready Out of the Box
- On first enable, Nautilus Spiral opens in the **left sidebar** and automatically detects your Obsidian Daily Notes folder and date format (you can override them in settings anytime).
- If today's daily note doesn't exist yet, opening the spiral creates it for you.

### 3. Write in Today's Daily Note
Use regular bullet items and the spiral updates live:

```markdown
- 14:00-15:00 Team sync
- TODO [#A] Draft proposal 45m
- TODO Reply to emails 15m
- DOING Organize spec notes 30m
```

- **Fixed events**: Include a time range (e.g. `14:00-15:00`) to pin it to the spiral.
- **To-dos & estimates**: Use `TODO` / `DOING` / `DONE` (or checkboxes `[ ]` / `[/]` / `[x]`) with an estimate (`15m`, `1.5h`); tasks without one use the default duration.
- **Mainline**: Tag 1–3 key items with `[#A]` (or shorthand `todo a`), or right-click any item in "Up next" to set its priority.
- **Adjust today's hours**: Drag the hollow start/end handles on the spiral—or click `☀️--:--–🌙--:--` at the top—to match when you actually started or plan to wrap up.

> No global hotkeys are bound by default; assign any command you want in Obsidian Settings → Hotkeys. See the [User guide](./docs/guide.md) for more details.

---

## Works with Agent Deck

On its own, Nautilus Spiral is a focused personal planner and Pomodoro tool. Pair it with [Agent Deck](https://github.com/MatsuriMW/obsidian-agent-deck) and your daily note becomes a live dashboard for all your AI agents:

<p align="center">
  <img src="./assets/spiral-agent-outline.png" width="820" alt="Nautilus Spiral side by side with the daily note outline showing Agent Deck statuses, rounds, and token usage">
</p>

- **Automatic AI session logging**: Agent Deck writes sessions from Claude Code, Codex, WorkBuddy, DeepSeek Harness, and Antigravity into your daily note, keeping status, rounds, summaries, and completion up to date.
- **Inner-ring visualization**: Nautilus Spiral draws each agent's active spans on color-coded inner rings and summarizes collaboration time and token usage under the capacity bar.
- **Live status sync**: Spiral blocks and "Up next" rows reflect each agent's live state (running, to review, needs approval, queued, hit limit, errored), and clicking a task's AI badge opens the linked session details.
- **Shared day cutoff**: Both plugins share the same day boundary so late-night sessions stay grouped under the right day.

---

## Feedback & Updates

Planned features and requests live on the [Roadmap](https://matsuri.site/portfolio/journal-workflow/#wishlist)—feel free to suggest ideas or vote. You can also follow updates and share feedback on Twitter: [@Matsurimywaifu](https://x.com/Matsurimywaifu).

MIT License.
