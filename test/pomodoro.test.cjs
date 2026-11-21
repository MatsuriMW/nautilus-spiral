const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const OB = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Modal: class {},
  FuzzySuggestModal: class {},
  TFile: class TFile { constructor(p) { this.path = p; } },
  Notice: class {},
  getLanguage: () => 'zh',
  moment: (input) => {
    const d = input ? new Date(input) : new Date(2026, 10, 21, 20, 30, 0);
    return {
      format: (fmt) => (fmt === 'HH:mm' ? '20:30' : '2026_11_21'),
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
  p.today = () => ({ format: () => '2026_11_21' });
  p.saveData = async () => {};
  p.sound = () => {};
  p.kwSound = () => {};
  p.kwFresh = () => [];
  p.refresh = () => {};

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

  // Task-bound start -> switches TODO to DOING; completePomodoroTask -> switches to DONE
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

  // Active Pomodoro does NOT alter schedule()
  const plan = schedule(parseJournal(noteLines.join('\n'), p.settings), p.settings, 600, 0);
  assert.equal(plan.queue.length, 1);

  const ok = await p.completePomodoroTask(a3.task);
  assert.equal(ok, true);
  assert.match(noteLines[0], /^- DONE /);

  console.log('PASS pomodoro presets, spiral range/split, independent & task-bound lifecycle');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
