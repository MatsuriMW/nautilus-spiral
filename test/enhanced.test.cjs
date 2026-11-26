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

    // 5d. Vertex label placement + tight dynamic viewBox (right-only labels keep left bound tight!)
    const rightAndTop = [
      { item: { id: 'r1' }, start: 600, end: 660, label: '右侧任务一', midAngle: 0, segR: 135, anchorX: 303, anchorY: 160, toneCls: 'is-main', done: false, prioWeight: 3 },
      { item: { id: 'v1' }, start: 720, end: 760, label: '顶点任务二', midAngle: -Math.PI / 2, segR: 140, anchorX: 160, anchorY: 11, toneCls: 'is-event', done: true, prioWeight: 2 },
    ];
    const placedRT = C.layoutSpiralLabels(rightAndTop, { cx: 160, cy: 160, maxCols: 20 });
    assert.equal(placedRT.length, 2);
    const vLb = placedRT.find((x) => x.item.id === 'v1');
    assert.equal(vLb.atVertex, true);
    assert.equal(vLb.done, true);
    const vbTight = C.computeSpiralViewBox(placedRT);
    assert.equal(vbTight.x, -10, 'no left-side labels -> left viewBox stays tight at -10');
    assert.ok(vbTight.w < 500, `tight viewBox saves left padding (w=${vbTight.w})`);

    // 5e. msToNextMinute alignment
    assert.equal(C.msToNextMinute(60000), 60050);
    assert.equal(C.msToNextMinute(60000 + 45000), 15050);
  }

  console.log('PASS enhanced: progress advance, event order barrier, outer labels, mirror sync, polish 1-9 & cache sigs');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
