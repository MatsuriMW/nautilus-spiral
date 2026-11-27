const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const makeMockEl = () => ({ children: [], addClass() {}, empty() {}, createDiv() { return makeMockEl(); }, createEl() { return makeMockEl(); } });

function makeMoment(input, fmt) {
  let d;
  if (typeof input === 'string') {
    const m = /^(\d{4})[-_](\d{2})[-_](\d{2})$/.exec(input);
    d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : new Date(input);
  } else {
    d = input ? new Date(input) : new Date(2026, 10, 27, 15, 0, 0);
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  return {
    format(f = 'YYYY_MM_DD') {
      if (f === 'HH:mm') return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      if (f === 'YYYY-MM-DD') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      return `${d.getFullYear()}_${pad2(d.getMonth() + 1)}_${pad2(d.getDate())}`;
    },
    isoWeekYear: () => d.getFullYear(),
    isoWeek: () => 48,
    hours: () => d.getHours(),
    minutes: () => d.getMinutes(),
    isValid: () => !Number.isNaN(d.getTime()),
    isBefore: () => false,
    subtract(n) { return makeMoment(new Date(d.getTime() - n * 86400000), fmt); },
  };
}

const OB = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Modal: class { constructor() { this.modalEl = makeMockEl(); this.contentEl = makeMockEl(); } open() {} close() {} },
  FuzzySuggestModal: class {},
  Menu: class {},
  TFile: class TFile { constructor(p) { this.path = p; this.basename = path.basename(p, '.md'); this.stat = { mtime: 1 }; } },
  Notice: class {},
  Platform: { isMacOS: true, isDesktopApp: true },
  getLanguage: () => 'zh',
  moment: (input, fmt) => makeMoment(input, fmt),
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
vm.runInNewContext(fs.readFileSync(source, 'utf8'), ctx);
const Plugin = ctx.module.exports;
const C = Plugin.core;
const { DEFAULTS } = C;

(async () => {
  // 1. advanceProgressLine: 0% -> 25% -> 50% -> 75% -> DONE (strictly idempotent)
  {
    let cur = '- TODO [#A] 写文档 1h ^ad-t1';
    const r1 = C.advanceProgressLine(cur, 25, '16:10');
    assert.equal(r1.nextPct, 25);
    assert.equal(r1.done, false);
    assert.equal(r1.changed, true);
    assert.equal(r1.nextRaw, '- TODO [#A] 写文档 1h 25% ^ad-t1');

    const r2 = C.advanceProgressLine(r1.nextRaw, 25, '16:10');
    assert.equal(r2.nextPct, 50);
    assert.equal(r2.nextRaw, '- TODO [#A] 写文档 1h 50% ^ad-t1');

    const r3 = C.advanceProgressLine(r2.nextRaw, 25, '16:10');
    assert.equal(r3.nextPct, 75);
    assert.equal(r3.nextRaw, '- TODO [#A] 写文档 1h 75% ^ad-t1');

    const r4 = C.advanceProgressLine(r3.nextRaw, 25, '16:10');
    assert.equal(r4.nextPct, 100);
    assert.equal(r4.done, true);
    assert.equal(r4.nextRaw, '- DONE 16:10 [#A] 写文档 1h ^ad-t1');

    // Idempotent on DONE / CANCELLED / [x]
    const r5 = C.advanceProgressLine(r4.nextRaw, 25, '16:20');
    assert.equal(r5.changed, false);
    assert.equal(r5.nextRaw, r4.nextRaw);
    assert.equal(C.advanceProgressLine('- [x] 已完成', 25, '16:20').changed, false);
    assert.equal(C.advanceProgressLine('- CANCELLED 不做了 25%', 25, '16:20').changed, false);

    // Non-multiple & fraction input
    const rFrac = C.advanceProgressLine('- DOING 10:00 看论文 1/3 2h', 25, '16:20');
    assert.equal(rFrac.nextPct, 50);
    assert.ok(rFrac.nextRaw.includes('50%') && !rFrac.nextRaw.includes('1/3'));
    const rOdd = C.advanceProgressLine('- TODO 梳理 40% ← 2026_11_25', 25, '16:20');
    assert.equal(rOdd.nextPct, 50);
    assert.ok(rOdd.nextRaw.includes('50%') && rOdd.nextRaw.includes('← 2026_11_25'));
  }

  // 2. respectEventOrder barrier in schedule()
  {
    const md = [
      '- TODO 早晨任务 30m',
      '- 14:00-15:00 评审会议',
      '- TODO 会后整理 30m',
      '- DOING 10:00 正在跑的任务 30m',
    ].join('\n');
    const cfgOff = { ...DEFAULTS, respectEventOrder: false, dayStart: 8, dayEnd: 24, minChunk: 0 };
    const itemsOff = C.parseJournal(md, cfgOff);
    // Inject an external calendar event (line: -1) that must NOT act as an outline barrier
    itemsOff.push({ kind: 'event', state: 'none', label: '外部日历', start: 960, end: 1020, line: -1, indent: 0, prio: false, cal: {} });
    const planOff = C.schedule(itemsOff, cfgOff, 600, 0);
    const afterOff = planOff.queue.find((t) => t.label.includes('会后整理'));
    assert.ok(afterOff.segments[0][0] < 840, 'respectEventOrder=false allows below-event task into morning gap');

    const cfgOn = { ...DEFAULTS, respectEventOrder: true, dayStart: 8, dayEnd: 24, minChunk: 0 };
    const itemsOn = C.parseJournal(md, cfgOn);
    itemsOn.push({ kind: 'event', state: 'none', label: '外部日历', start: 960, end: 1020, line: -1, indent: 0, prio: false, cal: {} });
    const planOn = C.schedule(itemsOn, cfgOn, 600, 0);
    const morningOn = planOn.queue.find((t) => t.label.includes('早晨任务'));
    const afterOn = planOn.queue.find((t) => t.label.includes('会后整理'));
    const doingOn = planOn.queue.find((t) => t.label.includes('正在跑的任务'));
    assert.ok(morningOn.segments[0][0] >= 600 && morningOn.segments[0][1] <= 840, 'task above event keeps morning gap');
    assert.ok(afterOn.segments[0][0] >= 900, `task below 14:00-15:00 event starts >= 15:00 (got ${afterOn.segments[0][0]})`);
    assert.equal(doingOn.segments[0][0], 600, 'DOING task ignores outline event barrier');
  }

  // 3. layoutSpiralLabels: CJK width, non-colliding AABB, Bezier leader paths
  {
    assert.equal(C.displayWidth('Ab1'), 3);
    assert.equal(C.displayWidth('中文Ab'), 6);
    const entries = [];
    for (let i = 0; i < 6; i++) {
      const a = -0.3 + i * 0.04;
      entries.push({
        item: { id: i },
        start: 600 + i * 20,
        end: 620 + i * 20,
        label: `并行任务标题测试编号 ${i + 1}`,
        midAngle: a,
        segR: 135,
        anchorX: 160 + 143 * Math.cos(a),
        anchorY: 160 + 143 * Math.sin(a),
        prioWeight: 1,
      });
    }
    const placed = C.layoutSpiralLabels(entries, { cx: 160, cy: 160 });
    assert.ok(placed.length >= 4, 'clusters still place multiple non-overlapping labels');
    for (let i = 0; i < placed.length; i++) {
      assert.match(placed[i].pathD, /^M .+ Q .+ /);
      for (let j = i + 1; j < placed.length; j++) {
        const A = placed[i], B = placed[j];
        const hit = A.x < B.x + B.w + 4 && A.x + A.w + 4 > B.x && A.y < B.y + B.h + 3 && A.y + A.h + 3 > B.y;
        assert.equal(hit, false, `labels ${i} and ${j} do not overlap`);
      }
    }
  }

  // 4. Mirror embed parsing, applyMirrorLines, source writeback & cache signatures
  {
    assert.equal(C.parseMirrorEmbed('- ![[项目/A#^ad-1]]').blockId, 'ad-1');
    assert.equal(C.parseMirrorEmbed('- 普通列表项'), null);
    const rawDaily = [
      '- ![[项目/A#^ad-1]]',
      '```md',
      '- ![[项目/A#^ad-1]]',
      '```',
      '\t- ![[项目/B#^b2|别名]]',
    ].join('\n');
    const resolved = new Map([
      [0, { path: '项目/A.md', line: 3, blockId: 'ad-1', rawLine: '- TODO [#A] 镜像源任务 1h 25% ^ad-1' }],
      [2, { path: '项目/A.md', line: 3, blockId: 'ad-1', rawLine: '- TODO 围栏内不应展开 ^ad-1' }],
      [4, { path: '项目/B.md', line: 8, blockId: 'b2', rawLine: '  - 14:00-15:00 镜像固定事件 ^b2' }],
    ]);
    const applied = C.applyMirrorLines(rawDaily, resolved);
    const outLines = applied.content.split('\n');
    assert.equal(outLines[0], '- TODO [#A] 镜像源任务 1h 25% ^ad-1');
    assert.equal(outLines[2], '- ![[项目/A#^ad-1]]', 'fenced code block stays untouched');
    assert.equal(outLines[4], '\t- 14:00-15:00 镜像固定事件 ^b2', 'preserves journal tab indent');
    assert.equal(applied.mirrorMap.get(0).path, '项目/A.md');
    assert.equal(applied.mirrorMap.get(4).line, 8);

    const parsed = C.parseJournal(applied.content, DEFAULTS);
    for (const it of parsed) {
      const mr = applied.mirrorMap.get(it.line);
      if (mr) it.mirror = mr;
    }
    assert.equal(parsed[0].mirror.path, '项目/A.md');
    assert.equal(parsed[0].progress, 0.25);

    // SpiralView._mutateUpNext writes progress advance back to mirror source file
    let srcFileText = '# A\n- TODO [#A] 镜像源任务 1h 25% ^ad-1\n';
    const srcTFile = new OB.TFile('项目/A.md');
    const dailyTFile = new OB.TFile('2026_11_27.md');
    const pStub = Object.create(Plugin.prototype);
    pStub.app = { vault: { getAbstractFileByPath: (p) => (p === '项目/A.md' ? srcTFile : dailyTFile) } };
    pStub.settings = { ...DEFAULTS, pomodoro: {} };
    pStub.agentDeck = () => null;
    pStub.journalView = () => null;
    pStub.editFile = async (f, fn) => {
      assert.equal(f.path, '项目/A.md', 'edits source note instead of daily note');
      const lines = srcFileText.split('\n');
      const ch = fn(lines);
      if (ch) srcFileText = lines.join('\n');
      return ch > 0;
    };
    pStub.kwFresh = () => [];
    pStub.kwSound = () => {};
    pStub.sound = () => {};
    const vStub = Object.create(C.SpiralView.prototype);
    vStub.app = pStub.app;
    vStub.plugin = pStub;
    vStub.render = async () => {};
    await vStub.advanceUpNextProgress(dailyTFile, '2026_11_27', parsed[0], 25);
    assert.ok(srcFileText.includes('- TODO [#A] 镜像源任务 1h 50% ^ad-1'), 'source note updated to 50%');

    // Cache signature invalidates on new settings & mirrors
    const baseC = C.pastDayComputeSig({ dayKey: '2026_11_26', content: 'x', cfg: DEFAULTS, cal: null, mirrorSig: '' });
    assert.notEqual(
      baseC,
      C.pastDayComputeSig({ dayKey: '2026_11_26', content: 'x', cfg: { ...DEFAULTS, respectEventOrder: true }, cal: null, mirrorSig: '' }),
    );
    assert.notEqual(
      baseC,
      C.pastDayComputeSig({ dayKey: '2026_11_26', content: 'x', cfg: DEFAULTS, cal: null, mirrorSig: '0:a.md:1:h' }),
    );
    const baseR = C.pastDayRenderSig({ computeSig: baseC, cfg: DEFAULTS, aiDay: null, gameDay: null, deckCount: 0, wideLabels: false });
    assert.notEqual(baseR, C.pastDayRenderSig({ computeSig: baseC, cfg: { ...DEFAULTS, hideDoneOnSpiral: true }, aiDay: null, gameDay: null, deckCount: 0, wideLabels: false }));
    assert.notEqual(baseR, C.pastDayRenderSig({ computeSig: baseC, cfg: { ...DEFAULTS, spiralCollapsed: true }, aiDay: null, gameDay: null, deckCount: 0, wideLabels: false }));
    assert.notEqual(baseR, C.pastDayRenderSig({ computeSig: baseC, cfg: DEFAULTS, aiDay: null, gameDay: null, deckCount: 0, wideLabels: true }));
    assert.notEqual(baseR, C.pastDayRenderSig({ computeSig: baseC, cfg: { ...DEFAULTS, spiralLabelMaxCols: 24 }, aiDay: null, gameDay: null, deckCount: 0, wideLabels: true }));
    assert.notEqual(baseR, C.pastDayRenderSig({ computeSig: baseC, cfg: { ...DEFAULTS, progressStep: 10 }, aiDay: null, gameDay: null, deckCount: 0, wideLabels: false }));
  }

  // 5. Items #1-#9 polish: URL stripping, English 12h AM/PM ranges, bidirectional progress step, dynamic tight viewBox, vertex labels, minute alignment
  {
    // 5a. stripLinkUrls prevents URL numbers from polluting time/duration/progress
    assert.equal(C.stripLinkUrls('[Spec](https://example.com/10-12/30m/50%) `code 1h`'), 'Spec `code 1h`');
    const urlItems = C.parseJournal('- TODO [修复 PR](https://github.com/a/b/issues/10-12/30m/50%) 1h', DEFAULTS);
    assert.equal(urlItems.length, 1);
    assert.equal(urlItems[0].kind, 'task');
    assert.equal(urlItems[0].dur, 60);
    assert.equal(urlItems[0].progress, null);

    // 5b. parseEnglishRange: 9am-11am, 2:30pm to 4pm, 2-4pm, 11-1pm; bare prose 1-2 ignored
    const e1 = C.parseEnglishRange('9am-11am Standup');
    assert.deepEqual([e1.start, e1.end], [540, 660]);
    const e2 = C.parseEnglishRange('2:30pm to 4pm Design sync');
    assert.deepEqual([e2.start, e2.end], [870, 960]);
    const e3 = C.parseEnglishRange('2-4pm Deep work');
    assert.deepEqual([e3.start, e3.end], [840, 960]);
    const e4 = C.parseEnglishRange('11-1pm Lunch');
    assert.deepEqual([e4.start, e4.end], [660, 780]);
    const e5 = C.parseEnglishRange('10-12pm Morning block');
    assert.deepEqual([e5.start, e5.end], [600, 720]);
    const e6 = C.parseEnglishRange('12-2pm Afternoon');
    assert.deepEqual([e6.start, e6.end], [720, 840]);
    const e7 = C.parseEnglishRange('12-1am Late night');
    assert.deepEqual([e7.start, e7.end], [0, 60]);
    const e8 = C.parseEnglishRange('11-1am Midnight');
    assert.deepEqual([e8.start, e8.end], [1380, 1500]);
    assert.equal(C.parseEnglishRange('14am-15am Invalid'), null);
    assert.equal(C.parseEnglishRange('方案 1-2 对比'), null);
    const parsedEn = C.parseJournal('- TODO 2-4pm Design review', DEFAULTS);
    assert.equal(parsedEn[0].kind, 'event');
    assert.equal(parsedEn[0].start, 840);
    assert.equal(parsedEn[0].end, 960);
    assert.equal(parsedEn[0].label, 'Design review');

    // 5c. stepProgressLine forward & backward (10% and 25%) + strict DONE/0% idempotency
    const s10 = C.stepProgressLine('- DOING 文档', 10, '16:00');
    assert.equal(s10.nextPct, 10);
    assert.equal(s10.nextRaw, '- DOING 文档 10%');
    const back1 = C.stepProgressLine('- TODO 文档 75% ^ad-1', -25, '16:00');
    assert.equal(back1.nextPct, 50);
    assert.equal(back1.nextRaw, '- TODO 文档 50% ^ad-1');
    const backZero = C.stepProgressLine('- TODO 文档 25% ^ad-1', -25, '16:00');
    assert.equal(backZero.nextPct, 0);
    assert.equal(backZero.nextRaw, '- TODO 文档 ^ad-1');
    const backNoop = C.stepProgressLine('- TODO 文档 ^ad-1', -25, '16:00');
    assert.equal(backNoop.changed, false);
    const backDoneNoop = C.stepProgressLine('- DONE 10:00 文档 ^ad-1', -25, '16:00');
    assert.equal(backDoneNoop.changed, false);

    // 5d. formatSpiralLabel, contour-hugging 2-line / dense 1-line layout, rounded elbow pathD & tight viewBox
    const fmtAi = C.formatSpiralLabel({
      label: '🤖 agent-deck -> 梳理记忆方案并重设计界面',
      start: 125, end: 250, totalDur: 125, isAi: true, progress: 0.5,
    }, 18, false);
    assert.ok(!fmtAi.text.includes('agent-deck ->'), 'strips project prefix and promotes task title');
    assert.ok(fmtAi.text.startsWith('梳理记忆'), `promoted title got ${fmtAi.text}`);
    assert.equal(fmtAi.meta, '🤖 02:05–04:10 · 2h5m · 50%');

    const fmtDone = C.formatSpiralLabel({ label: '跑步', start: 88, end: 138, totalDur: 44, done: true }, 18, false);
    assert.equal(fmtDone.text, '✓ 跑步');
    assert.equal(fmtDone.meta, '01:28–02:18 · 44m');

    const fmtMir = C.formatSpiralLabel({ label: '镜像待办', start: 600, end: 660, isMirror: true }, 18, true);
    assert.equal(fmtMir.text, '↗ 镜像待办');
    assert.equal(fmtMir.meta, '');
    assert.equal(fmtMir.durText, '1h');

    const rightAndTop = [
      { item: { id: 'r1' }, start: 600, end: 660, totalDur: 60, label: '右侧任务一', midAngle: 0, segR: 135, anchorX: 303, anchorY: 160, toneCls: 'is-main', done: false, prioWeight: 3 },
      { item: { id: 'v1' }, start: 720, end: 760, totalDur: 40, label: '顶点任务二', midAngle: -Math.PI / 2, segR: 140, anchorX: 160, anchorY: 11, toneCls: 'is-event', done: true, prioWeight: 2 },
    ];
    const placedRT = C.layoutSpiralLabels(rightAndTop, { cx: 160, cy: 160, maxCols: 20 });
    assert.equal(placedRT.length, 2);
    const rLb = placedRT.find((x) => x.item.id === 'r1');
    assert.equal(rLb.compact, false);
    assert.equal(rLb.h, 27);
    assert.match(rLb.pathD, /^M .+ L .+ Q .+ L .+$/);
    const vLb = placedRT.find((x) => x.item.id === 'v1');
    assert.equal(vLb.atVertex, true);
    assert.equal(vLb.done, true);
    const vbTight = C.computeSpiralViewBox(placedRT);
    assert.equal(vbTight.x, -10, 'no left-side labels -> left viewBox stays tight at -10');
    assert.ok(vbTight.w < 510, `tight viewBox saves left padding (w=${vbTight.w})`);

    // Dense right side (> 6 labels) switches that side to compact 1-line layout
    const denseRight = Array.from({ length: 8 }, (_, idx) => {
      const a = -0.8 + idx * 0.22;
      return {
        item: { id: `d${idx}` }, start: 480 + idx * 45, end: 520 + idx * 45,
        label: `密集任务${idx + 1}`, midAngle: a, segR: 135,
        anchorX: 160 + 143 * Math.cos(a), anchorY: 160 + 143 * Math.sin(a), prioWeight: 1,
      };
    });
    const placedDense = C.layoutSpiralLabels(denseRight, { cx: 160, cy: 160, maxCols: 18 });
    assert.ok(placedDense.every((lb) => lb.atVertex || lb.compact === true), 'dense side falls back to compact 1-line');

    // 5e. msToNextMinute alignment
    assert.equal(C.msToNextMinute(60000), 60050);
    assert.equal(C.msToNextMinute(60000 + 45000), 15050);
  }

  // 6. Cross-cutoff & overnight 24h time ranges wrap by +1440 (never +720)
  {
    const sleepEv = C.parseJournal('- 2:46~9:42 😴 睡觉', DEFAULTS)[0];
    assert.equal(sleepEv.kind, 'event');
    assert.equal(sleepEv.start, 1606);
    assert.equal(sleepEv.end, 2022);
    assert.equal(sleepEv.end - sleepEv.start, 416);

    const sleepDoneEv = C.parseJournal('- DONE 😴 睡觉 2:46~9:42', DEFAULTS)[0];
    assert.equal(sleepDoneEv.kind, 'event');
    assert.equal(sleepDoneEv.state, 'done');
    assert.equal(sleepDoneEv.start, 1606);
    assert.equal(sleepDoneEv.end, 2022);
    assert.equal(sleepDoneEv.end - sleepDoneEv.start, 416);

    const sleepDoneTask = C.parseJournal('- DONE 2:46~9:42 😴 睡觉', DEFAULTS)[0];
    assert.equal(sleepDoneTask.kind, 'task');
    assert.equal(sleepDoneTask.state, 'done');
    assert.deepEqual([...sleepDoneTask.actual], [1606, 2022]);
    assert.equal(sleepDoneTask.dur, 416);

    const sleepBareDone = C.parseJournal('- DONE 2-9 😴 睡觉', DEFAULTS)[0];
    assert.equal(sleepBareDone.kind, 'task');
    assert.deepEqual([...sleepBareDone.actual], [1560, 1980]);
    assert.equal(sleepBareDone.dur, 420);

    const sleepToEv = C.parseJournal('- 2:46 to 9:42 Sleep', DEFAULTS)[0];
    assert.equal(sleepToEv.kind, 'event');
    assert.equal(sleepToEv.start, 1606);
    assert.equal(sleepToEv.end, 2022);
    assert.equal(sleepToEv.end - sleepToEv.start, 416);

    const overnight23 = C.parseJournal('- 23:00~09:42 睡觉', DEFAULTS)[0];
    assert.equal(overnight23.start, 1380);
    assert.equal(overnight23.end, 2022);
    assert.equal(overnight23.end - overnight23.start, 642);

    const overnight21 = C.parseJournal('- 21:00~09:42 睡觉', DEFAULTS)[0];
    assert.equal(overnight21.start, 1260);
    assert.equal(overnight21.end, 2022);
    assert.equal(overnight21.end - overnight21.start, 762);

    const cfgCutoff0 = { ...DEFAULTS, dayStart: 8, dayEnd: 24, dayCutoff: 0 };
    const overnight22 = C.parseJournal('- 22:00~02:00 加班', cfgCutoff0)[0];
    assert.equal(overnight22.start, 1320);
    assert.equal(overnight22.end, 1560);
    assert.equal(overnight22.end - overnight22.start, 240);

    const morningCutoff0 = C.parseJournal('- 2:46~9:42 😴 睡觉', cfgCutoff0)[0];
    assert.equal(morningCutoff0.start, 166);
    assert.equal(morningCutoff0.end, 582);
    assert.equal(morningCutoff0.end - morningCutoff0.start, 416);

    const enOver1 = C.parseEnglishRange('23:00 to 09:42 Sleep');
    assert.deepEqual([enOver1.start, enOver1.end], [1380, 2022]);
    const enOver2 = C.parseEnglishRange('22:00 to 02:00 Work');
    assert.deepEqual([enOver2.start, enOver2.end], [1320, 1560]);

    // End-to-end pipeline check for 2:46~9:42 😴 睡觉
    assert.equal(C.clock(sleepEv.start), '02:46');
    assert.equal(C.clock(sleepEv.end), '09:42');
    assert.equal(C.dur(sleepEv.end - sleepEv.start), '6h56m');
    const sleepNote = '- 2:46~9:42 😴 睡觉\n- TODO 整理笔记 30m';
    const sleepItems = C.parseJournal(sleepNote, DEFAULTS);
    C.applyWork(sleepItems, { ...DEFAULTS, workLog: {} }, '2026_11_27', 1700, 0, {});
    const sleepPlan = C.schedule(sleepItems, DEFAULTS, 1700, 0, {});
    const sleepCapDefault = C.capacity(sleepItems, sleepPlan, DEFAULTS, 1700, 0, {});
    const owlCfg = { ...DEFAULTS, dayStart: 8, dayEnd: 32, dayCutoff: 8 };
    const sleepItemsOwl = C.parseJournal(sleepNote, owlCfg);
    const sleepPlanOwl = C.schedule(sleepItemsOwl, owlCfg, 1700, 0, {});
    const sleepCapOwl = C.capacity(sleepItemsOwl, sleepPlanOwl, owlCfg, 1700, 0, {});
    const sleepGaps = C.pastGaps(DEFAULTS.dayStart * 60, DEFAULTS.dayEnd * 60, 1700, [[sleepEv.start, sleepEv.end]]);
    const sleepDayRev = C.dayReview(sleepItems, DEFAULTS, { live: true });
    const sleepPeriodRev = C.buildPeriodReview([{ dayKey: '2026_11_27', dateStr: '2026-11-27', content: sleepNote, isToday: true, now: 1700 }], DEFAULTS);
    assert.ok(sleepPlan.available >= 0 && sleepCapDefault.totalFixed === 74 && sleepCapOwl.totalFixed === 314);
    assert.ok(sleepGaps.every(([a, b]) => b > a));
    assert.ok(sleepDayRev.rows.every((r) => (r.actualMinutes ?? 0) >= 0));
    assert.ok(sleepPeriodRev.timeBudget.events >= 0 && sleepPeriodRev.timeBudget.unrecorded >= 0);

    // English AM/PM precedence over RANGE_RE & DONE leading ranges
    const pm1 = C.parseJournal('- 2:30-4pm Meeting', DEFAULTS)[0];
    assert.equal(pm1.kind, 'event');
    assert.deepEqual([pm1.start, pm1.end], [870, 960]);
    assert.equal(pm1.label, 'Meeting');

    const pm2 = C.parseJournal('- 11:00-1:00pm Lunch', DEFAULTS)[0];
    assert.equal(pm2.kind, 'event');
    assert.deepEqual([pm2.start, pm2.end], [660, 780]);
    assert.equal(pm2.label, 'Lunch');

    const pm3 = C.parseJournal('- 9:30-11pm Dinner', DEFAULTS)[0];
    assert.equal(pm3.kind, 'event');
    assert.deepEqual([pm3.start, pm3.end], [1290, 1380]);
    assert.equal(pm3.label, 'Dinner');

    const pmDone1 = C.parseJournal('- DONE 2:30-4pm Meeting', DEFAULTS)[0];
    assert.equal(pmDone1.kind, 'task');
    assert.deepEqual([...pmDone1.actual], [870, 960]);
    assert.equal(pmDone1.dur, 90);

    const pmDone2 = C.parseJournal('- DONE 2-4pm Meeting', DEFAULTS)[0];
    assert.equal(pmDone2.kind, 'task');
    assert.deepEqual([...pmDone2.actual], [840, 960]);
    assert.equal(pmDone2.dur, 120);

    const pmGuard = C.parseJournal('- 14:00-15:00 pm review', DEFAULTS)[0];
    assert.equal(pmGuard.kind, 'event');
    assert.deepEqual([pmGuard.start, pmGuard.end], [840, 900]);
    assert.equal(pmGuard.label, 'pm review');

    // Bare integer range br must not hijack duration ranges
    const durDoneM = C.parseJournal('- DONE 10-15m 整理', DEFAULTS)[0];
    assert.equal(durDoneM.actual, undefined);
    assert.equal(durDoneM.dur, 15);

    const durDoneH = C.parseJournal('- DONE 1-2h 写稿', DEFAULTS)[0];
    assert.equal(durDoneH.actual, undefined);
    assert.equal(durDoneH.dur, 120);

    const durDoneCn = C.parseJournal('- DONE 2-3小时 写稿', DEFAULTS)[0];
    assert.equal(durDoneCn.actual, undefined);
    assert.equal(durDoneCn.dur, 180);

    // Invalid clock bounds rejected
    assert.equal(C.parseJournal('- 10:00-99 价格', DEFAULTS).length, 0);
    assert.equal(C.parseJournal('- 10:75-11:00 错误分钟', DEFAULTS).length, 0);
    assert.equal(C.parseClock('⏱ 10:75–11:00', DEFAULTS), null);

    // clock() and dur() edge cases
    assert.equal(C.clock(59.7), '01:00');
    assert.equal(C.clock(14 * 60 + 59.6), '15:00');
    assert.equal(C.clock(1439.8), '00:00');
    assert.equal(C.clock(-10), '23:50');
    assert.equal(C.clock(1606), '02:46');
    assert.equal(C.clock(2022), '09:42');
    assert.equal(C.dur(416), '6h56m');
    assert.equal(C.dur(-304), '-5h4m');
    assert.equal(C.dur(0), '0m');
  }

  // 7. Chinese period prefixes, symmetric AM/PM inference & zero-length range rejection
  {
    const cnCases = [
      ['- 下午3点到5点 上课', 900, 1020, '上课'],
      ['- 下午3点到4点 开会', 900, 960, '开会'],
      ['- 下午3点-3点半 站会', 900, 930, '站会'],
      ['- 中午12点-1点半 午饭', 720, 810, '午饭'],
      ['- 中午11点半-1点 午饭', 690, 780, '午饭'],
      ['- 晚上8点半-10点 直播', 1230, 1320, '直播'],
      ['- 晚上10点-12点 写总结', 1320, 1440, '写总结'],
      ['- 晚上11点-2点 加班', 1380, 1560, '加班'],
      ['- 晚上11点到早上7点 睡觉', 1380, 1860, '睡觉'],
      ['- 凌晨2点46到早上9点42 睡觉', 1606, 2022, '睡觉'],
    ];
    for (const [line, expS, expE, expLabel] of cnCases) {
      const it = C.parseJournal(line, DEFAULTS)[0];
      assert.equal(it.kind, 'event', line);
      assert.equal(it.start, expS, `${line} start`);
      assert.equal(it.end, expE, `${line} end`);
      assert.equal(it.label, expLabel, `${line} label`);
    }
    const cnPin = C.parseJournal('- TODO 下午3点 打电话 15m', DEFAULTS)[0];
    assert.equal(cnPin.kind, 'event');
    assert.deepEqual([cnPin.start, cnPin.end], [900, 915]);
    assert.equal(cnPin.label, '打电话');
    const cnNoFalse = C.parseJournal('- TODO 下午整理笔记 30m', DEFAULTS)[0];
    assert.equal(cnNoFalse.kind, 'task');
    assert.equal(cnNoFalse.dur, 30);
    assert.equal(cnNoFalse.label, '下午整理笔记');

    const symCases = [
      ['- 2pm-4 Meeting', 840, 960],
      ['- 2:30pm-4 Meeting', 870, 960],
      ['- 12pm-2 Lunch', 720, 840],
      ['- 11:30pm-7:20 Sleep', 1410, 1880],
      ['- 11pm-12 Late', 1380, 1440],
      ['- 10am-12 Morning', 600, 720],
      ['- 11am-1 Lunch', 660, 780],
      ['- 2:00-2:30pm Standup', 840, 870],
      ['- 2:00pm-2:30 Standup', 840, 870],
    ];
    for (const [line, expS, expE] of symCases) {
      const it = C.parseJournal(line, DEFAULTS)[0];
      assert.equal(it.kind, 'event', line);
      assert.deepEqual([it.start, it.end], [expS, expE], line);
    }

    // Zero-length range rejection (explicit 00:00~24:00 preserved)
    assert.equal(C.parseJournal('- 08:00~08:00 同起止', DEFAULTS).length, 0);
    assert.equal(C.parseJournal('- 下午3点半-3点半 测试', DEFAULTS).length, 0);
    assert.equal(C.parseJournal('- 08:00 to 08:00 Test', DEFAULTS).length, 0);
    assert.equal(C.parseJournal('- 2pm-2 Test', DEFAULTS).length, 0);
    const doneZero = C.parseJournal('- DONE 8-8 占位', DEFAULTS)[0];
    assert.equal(doneZero.actual, undefined);
    const fullDay = C.parseJournal('- 00:00~24:00 全天', { ...DEFAULTS, dayStart: 0, dayEnd: 24, dayCutoff: 0 })[0];
    assert.equal(fullDay.end - fullDay.start, 1440);
  }

  // 8. 次日/第二天, single AM/PM, N点 measure guard, cleanLabel preservation, clockDay/clockRange & schedule presets
  {
    const nextDayCases = [
      ['- 23:00-次日7:20 睡觉', 1380, 1880, '睡觉'],
      ['- 23:00~次日07:20 睡觉', 1380, 1880, '睡觉'],
      ['- 23点50分-次日7点20分 睡觉', 1430, 1880, '睡觉'],
      ['- 23:00-第二天7:20 睡觉', 1380, 1880, '睡觉'],
      ['- 晚上11点-次日7点 睡觉', 1380, 1860, '睡觉'],
      ['- 08:00-次日08:00 全天', 480, 1920, '全天'],
    ];
    for (const [line, expS, expE, expL] of nextDayCases) {
      const it = C.parseJournal(line, DEFAULTS)[0];
      assert.equal(it.kind, 'event', line);
      assert.deepEqual([it.start, it.end], [expS, expE], line);
      assert.equal(it.label, expL, `${line} label`);
    }

    const pCall = C.parseJournal('- TODO 3pm Call mom 15m', DEFAULTS)[0];
    assert.equal(pCall.kind, 'event');
    assert.deepEqual([pCall.start, pCall.end], [900, 915]);
    assert.equal(pCall.label, 'Call mom');

    const pStand = C.parseJournal('- TODO 9:30am Standup 30m', DEFAULTS)[0];
    assert.equal(pStand.kind, 'event');
    assert.deepEqual([pStand.start, pStand.end], [570, 600]);
    assert.equal(pStand.label, 'Standup');

    const pRev = C.parseJournal('- TODO 2:30pm Review 30m', DEFAULTS)[0];
    assert.equal(pRev.kind, 'event');
    assert.deepEqual([pRev.start, pRev.end], [870, 900]);
    assert.equal(pRev.label, 'Review');

    const dFinish = C.parseJournal('- DONE 3pm Finish doc', DEFAULTS)[0];
    assert.equal(dFinish.kind, 'task');
    assert.equal(dFinish.doneAt, 900);
    assert.equal(dFinish.label, 'Finish doc');

    const gSpec = C.parseJournal('- DOING 2:30pm Write spec 1h', DEFAULTS)[0];
    assert.equal(gSpec.kind, 'task');
    assert.equal(gSpec.startedAt, 870);
    assert.equal(gSpec.dur, 60);
    assert.equal(gSpec.label, 'Write spec');

    const pGuard = C.parseJournal('- TODO 14:00 pm review 30m', DEFAULTS)[0];
    assert.equal(pGuard.kind, 'event');
    assert.deepEqual([pGuard.start, pGuard.end], [840, 870]);
    assert.equal(pGuard.label, 'pm review');

    // Measure-word "N点" guard
    for (const [line, expDur, expLabel] of [
      ['- TODO 总结3点心得 30m', 30, '总结3点心得'],
      ['- TODO 整理5点反馈 20m', 20, '整理5点反馈'],
      ['- TODO 读第3点到第5点 30m', 30, '读第3点到第5点'],
    ]) {
      const it = C.parseJournal(line, DEFAULTS)[0];
      assert.equal(it.kind, 'task', line);
      assert.equal(it.dur, expDur, line);
      assert.equal(it.label, expLabel, line);
    }
    const call16 = C.parseJournal('- TODO 16点打电话 15m', DEFAULTS)[0];
    assert.equal(call16.kind, 'event');
    assert.deepEqual([call16.start, call16.end], [960, 975]);

    // cleanLabel preservation
    assert.equal(C.parseJournal('- 07:30~08:30 跨8点起床', DEFAULTS)[0].label, '跨8点起床');
    assert.equal(C.parseJournal('- 23:00-07:30 睡了8个半小时', DEFAULTS)[0].label, '睡了8个半小时');
    assert.equal(C.parseJournal('- TODO 报错 10:75 排查', DEFAULTS)[0].label, '报错 10:75 排查');

    // clockDay & clockRange
    assert.equal(C.clockRange(840, 900), '14:00–15:00');
    assert.equal(C.clockRange(1320, 1440), '22:00–00:00');
    assert.equal(C.clockRange(1380, 1880), '23:00–次日07:20');
    assert.equal(C.clockRange(1606, 2022), '次日 02:46–09:42');
    assert.equal(C.clockDay(1606), '次日 02:46');
    assert.equal(C.clockDay(600), '10:00');

    // scheduleConflictHint & SCHEDULE_PRESETS
    const badHint = C.scheduleConflictHint({ dayStart: 8, dayEnd: 24, dayCutoff: 4 });
    assert.ok(badHint.includes('00:00') && badHint.includes('04:00'), badHint);
    assert.ok(C.scheduleConflictHint({ dayStart: 12, dayEnd: 12, dayCutoff: 0 }).length > 0);
    assert.equal(C.SCHEDULE_PRESETS.length, 3);
    for (const pr of C.SCHEDULE_PRESETS) {
      assert.equal(C.scheduleConflictHint(pr), '', `preset ${pr.id} has no conflict`);
    }
  }

  console.log('PASS enhanced: progress advance, event order barrier, outer labels, mirror sync, polish 1-9 & cache sigs');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
