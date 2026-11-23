const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const openedModals = [];
const OB = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Modal: class { constructor() { this.contentEl = { empty() {} }; } open() { openedModals.push(this); } close() {} },
  FuzzySuggestModal: class {},
  TFile: class TFile { constructor(p) { this.path = p; } },
  Notice: class {},
  getLanguage: () => 'zh',
  moment: (input) => {
    const d = input ? new Date(input) : new Date(2026, 10, 21, 20, 30, 0);
    return {
      format: (fmt) => (fmt === 'HH:mm' ? '20:30' : '2026_11_21'),
      hours: () => d.getHours(),
      minutes: () => d.getMinutes(),
      isValid: () => true,
      isBefore: () => false,
      subtract: () => ({ valueOf: () => 0 }),
    };
  },
};

const ctx = {
  require: (id) => (id === 'obsidian' ? OB : require(id)),
  module: { exports: {} },
  console,
  process,
  Buffer,
  Date,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(fs.readFileSync(source, 'utf8'), ctx, { filename: source });
const Plugin = ctx.module.exports;
const {
  DEFAULTS,
  pomoMinutes,
  pomoTimeRange,
  pomoSplit,
  pomoFormatLeft,
  parseJournal,
  schedule,
} = Plugin.core;

// 1. Preset resolution & clamping
assert.equal(pomoMinutes({ preset: '15', customMinutes: 40 }), 15);
assert.equal(pomoMinutes({ preset: '25', customMinutes: 40 }), 25);
assert.equal(pomoMinutes({ preset: 'custom', customMinutes: 40 }), 40);
assert.equal(pomoMinutes({ preset: 'custom', customMinutes: 0 }), 45);
assert.equal(pomoMinutes({ preset: 'custom', customMinutes: 999 }), 240);
assert.equal(pomoMinutes(null), 25);

// 2. Time range normalization (daytime + midnight crossover + after midnight)
const cfg = { ...DEFAULTS, dayStart: 8, dayEnd: 32, dayCutoff: 8 };
{
  const start = new Date(2026, 10, 21, 23, 50, 0).getTime();
  const end = start + 25 * 60e3;
  const [a, b] = pomoTimeRange({ start, end }, cfg);
  assert.equal(a, 23 * 60 + 50);
  assert.equal(b, 23 * 60 + 50 + 25);
}
{
  const start = new Date(2026, 10, 22, 1, 15, 0).getTime();
  const end = start + 15 * 60e3;
  const [a, b] = pomoTimeRange({ start, end }, cfg);
  assert.equal(a, 1440 + 75);
  assert.equal(b, 1440 + 90);
}

// 3. Split into elapsed (realized) vs reserved (unrealized)
const plain = (x) => JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(pomoSplit(600, 625, 595)), { elapsed: null, reserved: [600, 625] });
assert.deepEqual(plain(pomoSplit(600, 625, 610)), { elapsed: [600, 610], reserved: [610, 625] });
assert.deepEqual(plain(pomoSplit(600, 625, 630)), { elapsed: [600, 625], reserved: null });

// 4. Countdown formatting
assert.equal(pomoFormatLeft(25 * 60e3), '25:00');
assert.equal(pomoFormatLeft(61_100), '01:02');
assert.equal(pomoFormatLeft(0), '00:00');
assert.equal(pomoFormatLeft(-5000), '00:00');

// 5. Plugin lifecycle: independent start/cancel/complete + optional task binding
(async () => {
  const p = Object.create(Plugin.prototype);
  p.settings = JSON.parse(JSON.stringify(DEFAULTS));
  p.settings.folder = '日记';
  p.settings.format = 'YYYY_MM_DD';
  p.states = new Map();
  p.today = () => ({ format: () => '2026_11_21' });
  p.saveData = async () => {};
  p.saveSoon = () => {};
  p.sound = () => {};
  p.kwSound = () => {};
  p.kwFresh = () => [];
  p.refresh = () => {};
  assert.equal(p.journalFile, undefined);

  // Independent start & cancel -> no journal edits, no history entry
  let edited = 0;
  p.editFile = async () => { edited++; return 1; };
  await p.setPomodoroPreset('15');
  const a1 = await p.startPomodoro();
  assert.equal(a1.minutes, 15);
  assert.equal(a1.task, null);
  assert.equal(edited, 0);
  await p.stopPomodoro(false);
  assert.equal(p.settings.pomodoro.active, null);
  assert.equal((p.settings.pomodoroHistory['2026_11_21'] || []).length, 0);

  // Independent start & complete -> recorded in pomodoroHistory
  await p.setPomodoroPreset('custom');
  await p.setPomodoroCustom(35);
  const a2 = await p.startPomodoro();
  assert.equal(a2.minutes, 35);
  await p.stopPomodoro(true);
  assert.equal(p.settings.pomodoroHistory['2026_11_21'].length, 1);
  assert.equal(p.settings.pomodoroHistory['2026_11_21'][0].minutes, 35);

  // Task-bound start -> switches TODO to DOING; complete writes ⏱ to note even with clockToNote=false
  let noteLines = ['- TODO 写周报 25分钟'];
  const fakeFile = new OB.TFile('日记/2026_11_21.md');
  p.app = { vault: { getAbstractFileByPath: (fp) => (fp === fakeFile.path ? fakeFile : null) } };
  p.readLiveContent = async () => noteLines.join('\n');
  p.editFile = async (_f, fn) => {
    const next = [...noteLines];
    const n = fn(next);
    if (n) noteLines = next;
    return n;
  };
  const items = parseJournal(noteLines.join('\n'), p.settings);
  const a3 = await p.startPomodoro(25, { file: fakeFile, dayKey: '2026_11_21', item: items[0] });
  assert.match(noteLines[0], /^- DOING /);
  assert.equal(a3.task.label, '写周报');

  // autoClock unions overlapping segments rather than double-counting duration
  const overlapped = p.autoClock('- DOING 测试重叠', '测试重叠', [[600, 625], [600, 626]]);
  assert.match(overlapped, /10:00–10:26 · 共 26m$/);

  // Active Pomodoro does NOT alter schedule()
  const plan = schedule(parseJournal(noteLines.join('\n'), p.settings), p.settings, 600, 0);
  assert.equal(plan.queue.length, 1);

  // Completing task-bound Pomodoro writes ⏱ actual time line & workLog even when clockToNote is false
  assert.equal(p.settings.clockToNote, false);
  const baseStart = new Date(2026, 10, 21, 14, 0, 0).getTime();
  p.settings.pomodoro.active.start = baseStart;
  p.settings.pomodoro.active.end = baseStart + 25 * 60e3;
  await p.stopPomodoro(true);
  assert.equal(noteLines.length, 2);
  assert.match(noteLines[1], /^\t- ⏱ 14:00–14:25 · 共 25m$/);
  assert.equal(p.settings.workLog['2026_11_21']['写周报'].length, 1);

  // Auto-bind current DOING task when starting from top bar (taskSpec == null)
  const a4 = await p.startPomodoro(25);
  assert.ok(a4.task);
  assert.equal(a4.task.label, '写周报');
  // Early stop after >= 1m logs actual elapsed time without adding to pomodoroHistory
  const prevHistCount = p.settings.pomodoroHistory['2026_11_21'].length;
  const r2Start = new Date(2026, 10, 21, 14, 30, 0).getTime();
  p.settings.pomodoro.active.start = r2Start;
  p.settings.pomodoro.active.end = r2Start + 25 * 60e3;
  const realNow = Date.now;
  Date.now = () => r2Start + 12 * 60e3;
  try {
    await p.stopPomodoro(false, { ask: true });
  } finally {
    Date.now = realNow;
  }
  assert.equal(p.settings.pomodoroHistory['2026_11_21'].length, prevHistCount);
  assert.match(noteLines[1], /^\t- ⏱ 14:00–14:42 · 共 37m$/);
  assert.equal(openedModals.length, 1);
  assert.equal(openedModals[0].opts.early, true);
  assert.equal(openedModals[0].opts.elapsedMin, 12);

  // Regression: observe() while PomodoroDoneModal is open must NOT reopen a duplicate [now, null] segment
  {
    const obsNote = ['- DOING 复盘整理'];
    const obsFile = new OB.TFile('日记/2026_11_21.md');
    p.app = { vault: { getAbstractFileByPath: (fp) => (fp === obsFile.path ? obsFile : null) } };
    p.readLiveContent = async () => obsNote.join('\n');
    p.editFile = async (_f, fn) => {
      const next = [...obsNote];
      const n = fn(next);
      if (n) obsNote.splice(0, obsNote.length, ...next);
      return n;
    };
    p.observe(obsFile, obsNote.join('\n'), false);
    assert.equal(p.settings.workLog['2026_11_21']['复盘整理'].some((s) => s[1] == null), true);
    const activeObs = await p.startPomodoro(25);
    assert.equal(activeObs.task?.key, '复盘整理');
    const obsStart = new Date(2026, 10, 21, 20, 30, 0).getTime();
    p.settings.pomodoro.active.start = obsStart;
    p.settings.pomodoro.active.end = obsStart + 25 * 60e3;
    Date.now = () => obsStart + 12 * 60e3;
    try {
      await p.stopPomodoro(false, { ask: true });
    } finally {
      Date.now = realNow;
    }
    assert.equal(p._pomoModalTask?.dayKey, '2026_11_21');
    assert.equal(p._pomoModalTask?.key, '复盘整理');
    p.observe(obsFile, obsNote.join('\n'), true);
    assert.equal(p.settings.workLog['2026_11_21']['复盘整理'].some((s) => s[1] == null), false);
    openedModals[openedModals.length - 1].onClose();
    assert.equal(p._pomoModalTask, null);
    p.app = { vault: { getAbstractFileByPath: (fp) => (fp === fakeFile.path ? fakeFile : null) } };
    p.readLiveContent = async () => noteLines.join('\n');
    p.editFile = async (_f, fn) => {
      const next = [...noteLines];
      const n = fn(next);
      if (n) noteLines = next;
      return n;
    };
  }

  // Early stop at 45s (< 1m): must NOT round to 1m, must NOT log, and modal gets logged: false
  const noteSnap45 = noteLines.join('\n');
  await p.startPomodoro(25);
  const r3Start = new Date(2026, 10, 21, 15, 0, 0).getTime();
  p.settings.pomodoro.active.start = r3Start;
  p.settings.pomodoro.active.end = r3Start + 25 * 60e3;
  Date.now = () => r3Start + 45e3;
  try {
    await p.stopPomodoro(false, { ask: true });
  } finally {
    Date.now = realNow;
  }
  assert.equal(noteLines.join('\n'), noteSnap45);
  const lastModal = openedModals[openedModals.length - 1];
  assert.equal(lastModal.opts.early, true);
  assert.equal(lastModal.opts.elapsedMin, 0);
  assert.equal(lastModal.opts.logged, false);

  // "Keep DOING" resumes an open workLog segment [now, null]
  const resumed = await p.resumePomodoroDoing(a3.task, '2026_11_21');
  assert.equal(resumed, true);
  assert.ok(p.settings.workLog['2026_11_21']['写周报'].some((s) => s[1] == null));

  // Pause task from PomodoroDoneModal switches DOING -> PAUSED
  const paused = await p.pausePomodoroTask(a3.task);
  assert.equal(paused, true);
  assert.match(noteLines[0], /^- PAUSED /);

  // Complete task switches to DONE
  const ok = await p.completePomodoroTask(a3.task);
  assert.equal(ok, true);
  assert.match(noteLines[0], /^- DONE /);

  // No open DOING task -> starting from top bar stays independent (no note edit, no early-stop modal)
  const beforeNoDoing = noteLines.join('\n');
  const modalsBefore = openedModals.length;
  const a5 = await p.startPomodoro(15);
  assert.equal(a5.task, null);
  await p.stopPomodoro(false, { ask: true });
  assert.equal(noteLines.join('\n'), beforeNoDoing);
  assert.equal(openedModals.length, modalsBefore);

  // Regression: autoKeys normalizes bold Agent Deck keys and Pomodoro never auto-binds 🤖 AI tasks
  {
    const aiNote = ['- DOING 🤖 21:14-23:43 **agent-deck -> 任务**'];
    const aiFile = new OB.TFile('日记/2026_11_21.md');
    p.app = {
      vault: { getAbstractFileByPath: (fp) => (fp === aiFile.path ? aiFile : null) },
      plugins: { plugins: { 'agent-deck': { settings: { autoLogState: { '2026_11_21': { s1: { key: '🤖 **agent-deck -> 任务**' } } } } } } },
    };
    p.readLiveContent = async () => aiNote.join('\n');
    const ak = p.autoKeys('2026_11_21');
    assert.ok(ak.has('🤖 **agent-deck -> 任务**'));
    assert.ok(ak.has('🤖 agent-deck -> 任务'));
    assert.equal(await p.activeDoingTaskRef('2026_11_21'), null);
    aiNote.push('- DOING 手写任务');
    const picked = await p.activeDoingTaskRef('2026_11_21');
    assert.equal(picked?.key, '手写任务');
    const now = Date.now();
    assert.equal(await p.recordPomodoroWork({ dayKey: '2026_11_21', start: now - 120e3, task: { key: '🤖 agent-deck -> 任务', label: '🤖 agent-deck -> 任务', path: aiFile.path } }, now), false);
    assert.equal(await p.resumePomodoroDoing({ key: '🤖 agent-deck -> 任务' }, '2026_11_21'), false);
  }

  console.log('PASS pomodoro presets, spiral range/split, independent & task-bound lifecycle, clock writeback & pause');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
