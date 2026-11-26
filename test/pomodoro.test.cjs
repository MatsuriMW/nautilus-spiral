const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const openedModals = [];
const builtMenus = [];
const notices = [];
const makeMockEl = (tag = 'div', opts = {}) => ({
  tag,
  cls: opts.cls || '',
  text: opts.text || '',
  children: [],
  addClass() {},
  empty() { this.children = []; },
  createDiv(o = {}) { const c = makeMockEl('div', o); this.children.push(c); return c; },
  createEl(t, o = {}) { const c = makeMockEl(t, o); this.children.push(c); return c; },
});
const OB = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Modal: class { constructor() { this.modalEl = makeMockEl('div'); this.contentEl = makeMockEl('div'); } open() { openedModals.push(this); } close() {} },
  FuzzySuggestModal: class {},
  Menu: class {
    constructor() { this.items = []; builtMenus.push(this); }
    addSeparator() { this.items.push({ sep: true }); }
    addItem(fn) {
      const it = { title: '', checked: false, disabled: false, setTitle(t) { this.title = t; }, setChecked(v) { this.checked = v; }, setDisabled(v) { this.disabled = v; }, onClick(cb) { this.cb = cb; } };
      fn(it);
      this.items.push(it);
    }
    showAtMouseEvent() {}
  },
  TFile: class TFile { constructor(p) { this.path = p; this.basename = path.basename(p, '.md'); this.stat = { mtime: 1 }; } },
  Notice: class { constructor(msg) { notices.push(msg); } },
  getLanguage: () => 'zh',
  moment: (input) => {
    const d = input ? new Date(input) : new Date(2026, 10, 21, 20, 30, 0);
    return {
      format: (fmt) => (fmt === 'HH:mm' ? '20:30' : '2026_11_21'),
      hours: () => d.getHours(),
      minutes: () => d.getMinutes(),
      isValid: () => true,
      isBefore: () => false,
      subtract: () => ({ valueOf: () => 0, format: () => '2026_11_21' }),
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
  applyWork,
  dayReview,
  schedule,
  SpiralView,
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

  // Complete task with existing ⏱ writes single timestamp DONE HH:mm (no fabricated multi-hour span)
  noteLines = ['- DOING 14:00 写周报 1h', '\t- ⏱ 14:00–14:25、19:00–19:25 · 共 50m'];
  const ok = await p.completePomodoroTask({ path: fakeFile.path, key: '写周报', label: '写周报' });
  assert.equal(ok, true);
  assert.equal(noteLines[0], '- DONE 20:30 写周报 1h');

  // Task-switch settlement: switching Pomodoro from Task A to Task B settles A (⏱ + PAUSED) and binds B even with line shift
  {
    let lines = ['- TODO 任务A 1h', '- TODO 任务B 30m'];
    const swFile = new OB.TFile('日记/2026_11_21.md');
    const sp = Object.create(Plugin.prototype);
    sp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    sp.settings.folder = '日记';
    sp.settings.format = 'YYYY_MM_DD';
    sp.states = new Map();
    sp.today = () => ({ format: () => '2026_11_21' });
    sp.saveData = async () => {};
    sp.saveSoon = () => {};
    sp.sound = () => {};
    sp.kwSound = () => {};
    sp.kwFresh = () => [];
    sp.refresh = () => {};
    sp.app = { vault: { getAbstractFileByPath: (fp) => (fp === swFile.path ? swFile : null) } };
    sp.readLiveContent = async () => lines.join('\n');
    sp.editFile = async (_f, fn) => {
      const next = [...lines];
      const n = fn(next);
      if (n) lines = next;
      return n;
    };
    const it0 = parseJournal(lines.join('\n'), sp.settings);
    await sp.startPomodoro(25, { file: swFile, dayKey: '2026_11_21', item: it0[0] });
    const tAStart = new Date(2026, 10, 21, 16, 0, 0).getTime();
    sp.settings.pomodoro.active.start = tAStart;
    sp.settings.pomodoro.active.end = tAStart + 25 * 60e3;
    const realNow2 = Date.now;
    Date.now = () => tAStart + 10 * 60e3;
    try {
      const it1 = parseJournal(lines.join('\n'), sp.settings);
      await sp.startPomodoro(25, { file: swFile, dayKey: '2026_11_21', item: it1[1] });
    } finally {
      Date.now = realNow2;
    }
    assert.match(lines[0], /^- PAUSED 任务A 1h$/);
    assert.match(lines[1], /^\t- ⏱ 16:00–16:10 · 共 10m$/);
    assert.match(lines[2], /^- DOING .* 任务B 30m$/);
    assert.equal(sp.settings.pomodoro.active.task?.key, '任务B');
  }

  // Manual status leave via observe() stops active Pomodoro & queues ⏱ even when clockToNote=false; rename migrates active task
  {
    const oFile = new OB.TFile('日记/2026_11_21.md');
    const op = Object.create(Plugin.prototype);
    op.settings = JSON.parse(JSON.stringify(DEFAULTS));
    op.settings.folder = '日记';
    op.settings.format = 'YYYY_MM_DD';
    op.settings.clockToNote = false;
    op.states = new Map();
    op.today = () => ({ format: () => '2026_11_21' });
    op.saveData = async () => {};
    op.saveSoon = () => {};
    op.sound = () => {};
    op.kwSound = () => {};
    op.kwFresh = () => [];
    op.refresh = () => {};
    const queued = [];
    op.queueClock = (f, keys) => queued.push({ path: f.path, keys });
    let doc = '- DOING 原名称 30m';
    op.observe(oFile, doc, false);
    const startMs = new Date(2026, 10, 21, 17, 0, 0).getTime();
    op.settings.pomodoro = { preset: '25', customMinutes: 45, active: { id: startMs, dayKey: '2026_11_21', start: startMs, end: startMs + 25 * 60e3, minutes: 25, task: { path: oFile.path, key: '原名称', label: '原名称' } } };
    // Rename while DOING -> keeps active Pomodoro and migrates task key
    op.observe(oFile, '- DOING 新名称 30m', true);
    assert.ok(op.settings.pomodoro.active);
    assert.equal(op.settings.pomodoro.active.task.key, '新名称');
    assert.equal(queued.length, 0);
    // Mark DONE manually -> auto-stops Pomodoro and queues ⏱
    const realNow3 = Date.now;
    Date.now = () => startMs + 8 * 60e3;
    try {
      op.observe(oFile, '- DONE 17:08 新名称 30m', true);
    } finally {
      Date.now = realNow3;
    }
    assert.equal(op.settings.pomodoro.active, null);
    assert.equal(queued.length, 1);
    assert.deepEqual(Array.from(queued[0].keys), ['新名称']);
    assert.ok(op.settings.workLog['2026_11_21']['新名称'].length >= 1);

    // Keep DOING after early stop (task already has ⏱) -> later DONE still queues clock update even when clockToNote=false
    const kFile = new OB.TFile('日记/2026_11_21.md');
    const kp = Object.create(Plugin.prototype);
    kp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    kp.settings.folder = '日记';
    kp.settings.format = 'YYYY_MM_DD';
    kp.settings.clockToNote = false;
    kp.states = new Map();
    kp.today = () => ({ format: () => '2026_11_21' });
    kp.saveData = async () => {};
    kp.saveSoon = () => {};
    kp.sound = () => {};
    kp.kwSound = () => {};
    kp.kwFresh = () => [];
    kp.refresh = () => {};
    let kLines = ['- DOING 续做任务 1h', '\t- ⏱ 14:00–14:12 · 共 12m'];
    kp.settings.workLog['2026_11_21'] = { 续做任务: [[14 * 60, 14 * 60 + 12], [14 * 60 + 12, null]] };
    let kQueued = [];
    kp.queueClock = (_f, keys) => { kQueued = keys; };
    kp.observe(kFile, kLines.join('\n'), false);
    kp.observe(kFile, '- DONE 14:40 续做任务 1h\n\t- ⏱ 14:00–14:12 · 共 12m', true);
    assert.deepEqual(Array.from(kQueued), ['续做任务']);

    // Stale disk snapshot during an open editor switch preserves active Pomodoro if live editor still shows DOING
    const sFile = new OB.TFile('日记/2026_11_21.md');
    const sp = Object.create(Plugin.prototype);
    sp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    sp.settings.folder = '日记';
    sp.settings.format = 'YYYY_MM_DD';
    sp.states = new Map();
    sp.today = () => ({ format: () => '2026_11_21' });
    sp.saveData = async () => {};
    sp.saveSoon = () => {};
    sp.queueClock = () => {};
    let liveEditorVal = '- DOING 16:15 切换新任务 30m';
    sp.journalView = () => ({ editor: { getValue: () => liveEditorVal } });
    sp.settings.pomodoro.active = {
      id: 1,
      dayKey: '2026_11_21',
      start: startMs,
      end: startMs + 25 * 60e3,
      minutes: 25,
      task: { path: sFile.path, key: '切换新任务', label: '切换新任务' },
    };
    sp.observe(sFile, '- TODO 切换新任务 30m', false);
    sp.observe(sFile, '- TODO 切换新任务 30m', true);
    assert.ok(sp.settings.pomodoro.active, 'stale disk snapshot must not clear active Pomodoro while editor is DOING');
    liveEditorVal = '- PAUSED 切换新任务 30m';
    sp.observe(sFile, '- PAUSED 切换新任务 30m', true);
    assert.equal(sp.settings.pomodoro.active, null);
  }

  // autoClock preserves disjoint pre-existing ⏱ segments without double-counting merged short-gap spans
  {
    const mergedText = p.autoClock(
      '- PAUSED 跨设备任务 2h\n\t- ⏱ 09:00–10:00 · 共 1h',
      '跨设备任务',
      [[14 * 60, 14 * 60 + 25]]
    );
    assert.match(mergedText, /09:00–10:00、14:00–14:25 · 共 1h25m$/);
    const shortGapText = p.autoClock(
      '- PAUSED 短间隔任务 1h\n\t- ⏱ 14:00–14:42 · 共 37m',
      '短间隔任务',
      [[14 * 60, 14 * 60 + 25], [14 * 60 + 30, 14 * 60 + 42]]
    );
    assert.match(shortGapText, /14:00–14:42 · 共 37m$/);
  }

  // parseJournal + applyWork + dayReview + computeReview with DONE HH:mm + ⏱ child line
  {
    const revNote = [
      '- DONE 21:25 写周报 1h',
      '\t- ⏱ 16:00–16:25、21:00–21:25 · 共 50m',
      '- DONE 14:42 短间隙复核 30m',
      '\t- ⏱ 14:00–14:42 · 共 37m',
      '- DONE 18:02 写稿 2h',
    ].join('\n');
    const revItems = parseJournal(revNote, p.settings);
    assert.equal(revItems[0].est, 60);
    assert.equal(revItems[2].est ?? null, null);
    applyWork(revItems, p.settings, '2026_11_21', 22 * 60, 0);
    const dr = dayReview(revItems, p.settings, { live: true });
    assert.equal(dr.rows[0].state, 'compared');
    assert.equal(dr.rows[0].plannedMinutes, 60);
    assert.equal(dr.rows[0].actualMinutes, 50);
    assert.equal(dr.rows[0].varianceMinutes, -10);
    assert.equal(dr.rows[1].state, 'compared');
    assert.equal(dr.rows[1].actualMinutes, 37);
    assert.equal(dr.rows[2].state, 'no-estimate');
    assert.equal(dr.rows[2].actualMinutes, 120);

    // computeReview also honors clock.total and preserved est
    const rp = Object.create(Plugin.prototype);
    rp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    rp.settings.folder = '日记';
    rp.settings.format = 'YYYY_MM_DD';
    rp.today = () => OB.moment();
    const rf = new OB.TFile('日记/2026_11_21.md');
    rp.app = { vault: { getAbstractFileByPath: (fp) => (fp === rf.path ? rf : null), cachedRead: async () => revNote } };
    const rData = await rp.computeReview(1);
    assert.equal(rData.n, 2);
    assert.equal(rData.sumE, 90);
    assert.equal(rData.sumA, 87);

    // zero-span DONE HH:mm-HH:mm and DONE HH:mm-HH:mm + multi-segment ⏱ preserve est & use clock.total
    const extraItems = parseJournal([
      '- DONE 21:20-21:20 零时长标记 30m',
      '\t- ⏱ 21:03–21:21 · 共 18m',
      '- DONE 16:15-16:33 多段任务 30m',
      '\t- ⏱ 16:00–16:10、16:15–16:33 · 共 28m',
    ].join('\n'), p.settings);
    assert.equal(extraItems[0].est, 30);
    assert.equal(extraItems[1].est, 30);
    applyWork(extraItems, p.settings, '2026_11_21', 22 * 60, 0);
    const edr = dayReview(extraItems, p.settings, { live: true });
    assert.equal(edr.rows[0].state, 'compared');
    assert.equal(edr.rows[0].plannedMinutes, 30);
    assert.equal(edr.rows[0].actualMinutes, 18);
    assert.equal(edr.rows[1].state, 'compared');
    assert.equal(edr.rows[1].plannedMinutes, 30);
    assert.equal(edr.rows[1].actualMinutes, 28);

    // same-minute DONE transition writes single HH:mm instead of HH:mm-HH:mm
    let sameMinNote = '- DOING 20:30 同分钟完成 30m';
    const smFile = new OB.TFile('日记/2026_11_21.md');
    const smp = Object.create(Plugin.prototype);
    smp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    smp.app = { vault: { getAbstractFileByPath: (fp) => (fp === smFile.path ? smFile : null) } };
    smp.readLiveContent = async () => sameMinNote;
    smp.editFile = async (_f, fn) => {
      const lines = sameMinNote.split('\n');
      const changed = fn(lines);
      if (changed) sameMinNote = lines.join('\n');
      return changed;
    };
    smp.kwFresh = () => [];
    smp.kwSound = () => {};
    smp.refresh = () => {};
    await smp.setPomodoroTaskKeyword({ path: smFile.path, key: '同分钟完成' }, 'DONE');
    assert.equal(sameMinNote, '- DONE 20:30 同分钟完成 30m');
  }

  // startPomodoroAtCursor binds manual open task and rejects 🤖 / DONE
  {
    let curLines = ['- TODO 光标任务 20m', '- TODO 🤖 自动任务 10m', '- DONE 10:00 已完成 10m'];
    const cFile = new OB.TFile('日记/2026_11_21.md');
    const cp = Object.create(Plugin.prototype);
    cp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    cp.settings.folder = '日记';
    cp.settings.format = 'YYYY_MM_DD';
    cp.today = () => ({ format: () => '2026_11_21' });
    cp.saveData = async () => {};
    cp.sound = () => {};
    cp.kwSound = () => {};
    cp.kwFresh = () => [];
    cp.refresh = () => {};
    cp.app = { vault: { getAbstractFileByPath: (fp) => (fp === cFile.path ? cFile : null) } };
    cp.readLiveContent = async () => curLines.join('\n');
    cp.editFile = async (_f, fn) => { const next = [...curLines]; const n = fn(next); if (n) curLines = next; return n; };
    const mkEd = (line) => ({ getCursor: () => ({ line }), getValue: () => curLines.join('\n') });
    assert.equal(await cp.startPomodoroAtCursor(mkEd(1), { file: cFile }), null);
    assert.equal(await cp.startPomodoroAtCursor(mkEd(2), { file: cFile }), null);
    const activeCur = await cp.startPomodoroAtCursor(mkEd(0), { file: cFile });
    assert.equal(activeCur?.task?.key, '光标任务');
    assert.match(curLines[0], /^- DOING /);
  }

  // openUpNextMenu places Pomodoro at the top, supports segment header & active-task stop toggle, hides 按预估 on 🤖, and hides Pomodoro on non-today
  {
    const view = Object.create(SpiralView.prototype);
    view.plugin = p;
    view._hideDotTip = () => {};
    const f = new OB.TFile('日记/2026_11_21.md');
    const ev = { preventDefault() {}, stopPropagation() {} };
    await p.setPomodoroPreset('25');
    builtMenus.length = 0;
    view.openUpNextMenu(ev, f, '2026_11_21', { kind: 'task', state: 'open', kw: 'TODO', dur: 45, explicitDur: true, label: '写方案 45m' });
    const items1 = builtMenus.at(-1).items.filter((x) => !x.sep);
    const titles1 = items1.map((x) => x.title);
    assert.ok(titles1[0].includes('用番茄钟开始（25m）'));
    assert.ok(titles1[1].includes('按预估开始（45m）'));
    assert.ok(titles1.indexOf('TODO · 待办') > 1);

    // Spiral segment header + active task switches top action to "Stop current Pomodoro" (including inheritedFrom parent proxy)
    p.settings.pomodoro.active = { id: 99, dayKey: '2026_11_21', start: Date.now() - 60e3, end: Date.now() + 24 * 60e3, minutes: 25, task: { path: f.path, key: '母块任务', label: '母块任务' } };
    builtMenus.length = 0;
    view.openUpNextMenu(ev, f, '2026_11_21', { kind: 'task', state: 'open', kw: 'DOING', dur: 25, inheritedFrom: 0, inheritedLabel: '母块任务', label: '子任务' }, '', { header: '子任务 · 14:00–14:25' });
    const itemsAct = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.equal(itemsAct[0].title, '子任务 · 14:00–14:25');
    assert.equal(itemsAct[0].disabled, true);
    assert.ok(itemsAct[1].title.includes('结束当前番茄钟'));
    assert.ok(!itemsAct.some((x) => x.title.includes('用番茄钟开始')));
    await itemsAct[1].cb();
    assert.equal(p.settings.pomodoro.active, null);

    builtMenus.length = 0;
    view.openUpNextMenu(ev, f, '2026_11_21', { kind: 'task', state: 'open', kw: 'TODO', dur: 25, explicitDur: true, auto: true, label: '🤖 AI任务' });
    const titles2 = builtMenus.at(-1).items.filter((x) => !x.sep).map((x) => x.title);
    assert.ok(titles2[0].includes('用番茄钟开始（25m）'));
    assert.ok(titles2[1].includes('快速 15m'));
    assert.ok(!titles2.some((t) => t.includes('按预估')));

    // Custom 90m preset offers quick 25m and 15m alternatives; inheritedFrom without opts.header shows parent header
    await p.setPomodoroPreset('custom');
    await p.setPomodoroCustom(90);
    builtMenus.length = 0;
    view.openUpNextMenu(ev, f, '2026_11_21', { kind: 'task', state: 'open', kw: 'TODO', dur: 15, inheritedFrom: 0, inheritedLabel: '主线母块', label: '子步骤' });
    const items90 = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.equal(items90[0].disabled, true);
    assert.ok(items90[0].title.includes('随母块「主线母块」'));
    assert.ok(items90[1].title.includes('用番茄钟开始（1h30m）'));
    assert.ok(items90[2].title.includes('快速 25m'));
    assert.ok(items90[3].title.includes('快速 15m'));
    await p.setPomodoroPreset('25');

    builtMenus.length = 0;
    view.openUpNextMenu(ev, f, '2026_11_20', { kind: 'task', state: 'open', kw: 'TODO', dur: 45, explicitDur: true, label: '昨天任务 45m' });
    const titles3 = builtMenus.at(-1).items.filter((x) => !x.sep).map((x) => x.title);
    assert.ok(!titles3.some((t) => t.includes('番茄钟') || t.includes('按预估') || t.includes('快速')));

    // openDoneMenu shows disabled header + 定位到日记
    builtMenus.length = 0;
    view.openDoneMenu(ev, f, { kind: 'task', state: 'done', line: 3, label: '已做完的事' }, { header: '已做完的事 · 10:00–10:30' });
    const doneItems = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.equal(doneItems[0].title, '已做完的事 · 10:00–10:30');
    assert.equal(doneItems[0].disabled, true);
    assert.equal(doneItems[1].title, '定位到日记');
  }

  // openEventMenu: standalone labeled Pomodoro (no auto-bind to DOING, no note edit, toggle to stop, history label, Another round keeps standalone)
  {
    const evView = Object.create(SpiralView.prototype);
    let evNote = ['- DOING 正在做的任务'];
    const evFile = new OB.TFile('日记/2026_11_21.md');
    let evEdits = 0;
    const ep = Object.create(Plugin.prototype);
    ep.settings = JSON.parse(JSON.stringify(DEFAULTS));
    ep.settings.folder = '日记';
    ep.settings.format = 'YYYY_MM_DD';
    ep.states = new Map();
    ep.today = () => ({ format: () => '2026_11_21' });
    ep.saveData = async () => {};
    ep.saveSoon = () => {};
    ep.sound = () => {};
    ep.kwSound = () => {};
    ep.kwFresh = () => [];
    ep.refresh = () => {};
    ep.app = { vault: { getAbstractFileByPath: (fp) => (fp === evFile.path ? evFile : null) } };
    ep.readLiveContent = async () => evNote.join('\n');
    ep.editFile = async () => { evEdits++; return 0; };
    evView.plugin = ep;
    evView._hideDotTip = () => {};
    const ev = { preventDefault() {}, stopPropagation() {} };

    const noteEvent = { kind: 'event', state: 'open', start: 840, end: 900, label: '产品评审' };
    await ep.setPomodoroPreset('custom');
    await ep.setPomodoroCustom(90);
    builtMenus.length = 0;
    evView.openEventMenu(ev, evFile, '2026_11_21', noteEvent, { header: '产品评审 · 14:00–15:00' });
    const evItems90 = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.ok(evItems90[1].title.includes('独立番茄钟（1h30m，不改日记）'));
    assert.ok(evItems90[2].title.includes('独立 25m（不改日记）'));
    assert.ok(evItems90[3].title.includes('独立 15m（不改日记）'));
    await ep.setPomodoroPreset('25');

    builtMenus.length = 0;
    evView.openEventMenu(ev, evFile, '2026_11_21', noteEvent, { header: '产品评审 · 14:00–15:00' });
    const evItems1 = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.equal(evItems1[0].title, '产品评审 · 14:00–15:00');
    assert.equal(evItems1[0].disabled, true);
    assert.ok(evItems1[1].title.includes('独立番茄钟（25m，不改日记）'));
    assert.ok(evItems1[2].title.includes('独立 15m（不改日记）'));
    assert.equal(evItems1[3].title, '定位到日记');
    await evItems1[1].cb();
    assert.equal(ep.settings.pomodoro.active.task, null);
    assert.equal(ep.settings.pomodoro.active.label, '产品评审');
    assert.equal(evEdits, 0);

    // Same event right-click now toggles to Stop current Pomodoro
    builtMenus.length = 0;
    evView.openEventMenu(ev, evFile, '2026_11_21', noteEvent, { header: '产品评审 · 14:00–15:00' });
    const evItems2 = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.ok(evItems2[1].title.includes('结束当前番茄钟'));

    // openActivePomoMenu without 2nd arg reads live settings.pomodoro.active, and hides 定位到日记 for standalone
    builtMenus.length = 0;
    evView.openActivePomoMenu(ev);
    const actStandalone = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.equal(actStandalone[0].disabled, true);
    assert.ok(actStandalone[0].title.includes('产品评审'));
    assert.ok(actStandalone[1].title.includes('结束当前番茄钟'));
    assert.ok(!actStandalone.some((x) => x.title === '定位到日记'));

    // openActivePomoMenu with no active Pomodoro (2nd arg omitted) does not build a stale menu
    const savedAct = ep.settings.pomodoro.active;
    ep.settings.pomodoro.active = null;
    const menuCountBeforeNull = builtMenus.length;
    evView.openActivePomoMenu(ev);
    assert.equal(builtMenus.length, menuCountBeforeNull);
    ep.settings.pomodoro.active = savedAct;

    // openActivePomoMenu on task-bound active Pomodoro shows 定位到日记
    builtMenus.length = 0;
    evView.openActivePomoMenu(ev, { dayKey: '2026_11_21', start: Date.now(), end: Date.now() + 10 * 60e3, minutes: 25, task: { path: evFile.path, key: '写周报', label: '写周报' } });
    const actBound = builtMenus.at(-1).items.filter((x) => !x.sep);
    assert.equal(actBound[0].disabled, true);
    assert.ok(actBound[1].title.includes('结束当前番茄钟'));
    assert.equal(actBound[2].title, '定位到日记');

    // Complete standalone labeled Pomodoro -> records label in history, keeps note untouched, and "Another round" preserves standalone label
    await ep.completePomodoro(ep.settings.pomodoro.active);
    assert.equal(ep.settings.pomodoroHistory['2026_11_21'].at(-1).label, '产品评审');
    assert.equal(evEdits, 0);
    const doneModal = openedModals.at(-1);
    doneModal.onOpen();
    assert.ok(doneModal.contentEl.children.some((c) => c.text && c.text.includes('产品评审')));
    const btnBar = doneModal.contentEl.children.at(-1);
    const againBtn = btnBar.children.find((b) => b.text === '再来一轮');
    assert.ok(againBtn);
    await againBtn.onclick();
    assert.equal(ep.settings.pomodoro.active.task, null);
    assert.equal(ep.settings.pomodoro.active.label, '产品评审');

    // Calendar event uses 打开日历, non-today & done events hide Pomodoro
    const calEvent = { kind: 'event', state: 'open', start: 960, end: 1020, label: '外部会议', cal: { calendar: 'Work' } };
    builtMenus.length = 0;
    evView.openEventMenu(ev, evFile, '2026_11_21', calEvent, { header: '外部会议 · 16:00–17:00' });
    assert.equal(builtMenus.at(-1).items.filter((x) => !x.sep).at(-1).title, '打开日历');

    builtMenus.length = 0;
    evView.openEventMenu(ev, evFile, '2026_11_20', noteEvent);
    assert.ok(!builtMenus.at(-1).items.some((x) => x.title && x.title.includes('番茄钟')));

    builtMenus.length = 0;
    evView.openEventMenu(ev, evFile, '2026_11_21', { ...noteEvent, state: 'done' });
    assert.ok(!builtMenus.at(-1).items.some((x) => x.title && x.title.includes('番茄钟')));

    // Early stop on 🤖 auto task >= 1m (logged: false) must report elapsed minutes via session tracking, NOT "未满 1 分钟"
    const aiStart = Date.now() - 12 * 60e3;
    ep.settings.pomodoro.active = {
      id: aiStart,
      dayKey: '2026_11_21',
      start: aiStart,
      end: aiStart + 25 * 60e3,
      minutes: 25,
      task: { path: evFile.path, key: '🤖 AI任务', label: '🤖 AI任务' },
    };
    const modalsBeforeAi = openedModals.length;
    await ep.stopPomodoro(false, { ask: true });
    assert.equal(openedModals.length, modalsBeforeAi + 1);
    const aiModal = openedModals.at(-1);
    aiModal.onOpen();
    const aiTexts = aiModal.contentEl.children.map((c) => c.text).join('\n');
    assert.ok(aiTexts.includes('已做 12m'));
    assert.ok(aiTexts.includes('由会话自动统计'));
    assert.ok(!aiTexts.includes('未满 1 分钟'));
  }

  // _mutateUpNext recovers when a ⏱ line inserted above shifted item.line by +1
  {
    let mLines = ['- PAUSED 任务A 1h', '\t- ⏱ 16:00–16:15 · 共 15m', '- DOING 16:15 任务B 30m'];
    const mf = new OB.TFile('日记/2026_11_21.md');
    const mp = Object.create(Plugin.prototype);
    mp.settings = JSON.parse(JSON.stringify(DEFAULTS));
    mp.settings.folder = '日记';
    mp.settings.format = 'YYYY_MM_DD';
    mp.today = () => ({ format: () => '2026_11_21' });
    mp.saveData = async () => {};
    mp.sound = () => {};
    mp.kwSound = () => {};
    mp.kwFresh = () => [];
    mp.refresh = () => {};
    mp.app = { vault: { getAbstractFileByPath: (fp) => (fp === mf.path ? mf : null) } };
    mp.editFile = async (_f, fn) => { const next = [...mLines]; const n = fn(next); if (n) mLines = next; return n; };
    const mv = Object.create(SpiralView.prototype);
    mv.plugin = mp;
    mv.render = async () => {};
    // Stale item.line = 1 (before ⏱ was inserted at line 1) still mutates line 2 (- DOING 16:15 任务B 30m) instead of corrupting the ⏱ child line
    await mv.cycleUpNext(mf, '2026_11_21', { kind: 'task', state: 'open', kw: 'DOING', line: 1, label: '任务B' }, 0);
    assert.equal(mLines[1], '\t- ⏱ 16:00–16:15 · 共 15m');
    assert.match(mLines[2], /^- DONE .* 任务B 30m$/);
  }

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
