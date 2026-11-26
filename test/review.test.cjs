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
    isoWeekYear() { return d.getFullYear(); },
    isoWeek() {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      return Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
    },
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
  // 1. AI 数据源收口：复用 Agent Deck 21+ Agent，跳过螺旋自身 scanAi()；无 Agent Deck 时回退内置库
  let scanCalled = 0;
  const deckPlugin = {
    spiralUsageSnapshot: (fmt) => ({
      source: 'agent-deck',
      agents: {
        claude: { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#a86f58' },
        hermes: { id: 'hermes', name: 'Hermes Agent', short: 'Hermes', color: '#b57536' },
        cursor: { id: 'cursor', name: 'Cursor', short: 'Cursor', color: '#10b981' },
      },
      enabledAgents: ['claude', 'hermes', 'cursor'],
      days: {
        '2026_11_27': {
          wall: 60, agent: 90, out: 3000, fresh: 1000, cached: 500, calls: 6, prompts: 4,
          segs: [[600, 660]],
          by: {
            claude: { wall: 30, agent: 30, out: 1000, segs: [[600, 630]] },
            hermes: { wall: 30, agent: 30, out: 1200, segs: [[610, 640]] },
            cursor: { wall: 30, agent: 30, out: 800, segs: [[630, 660]] },
          },
          proj: { demo: { min: 90, out: 3000, agents: { claude: 30, hermes: 30, cursor: 30 } } },
          models: { 'claude-opus': 1000, 'hermes-pro': 1200 },
          list: [
            { sid: 'h1', agent: 'hermes', dir: 'demo', min: 30, out: 1200, segs: [[610, 640]] },
            { sid: 'c1', agent: 'cursor', dir: 'demo', min: 30, out: 800, segs: [[630, 660]] },
          ],
        },
      },
    }),
  };
  const p = Object.create(Plugin.prototype);
  p.settings = { ...DEFAULTS, format: 'YYYY_MM_DD' };
  p.app = { plugins: { plugins: { 'agent-deck': deckPlugin } }, vault: { adapter: { read: async () => '{}' } } };
  p._ai = { scan: async () => { scanCalled++; } };

  const store = await p.aiUsage({ skipScan: false });
  assert.equal(store._fromDeck, true, '存在 Agent Deck 时 aiUsage 直接返回其数据源');
  await p.scanAi();
  assert.equal(scanCalled, 0, '存在 Agent Deck 时 scanAi 自动跳过不重复扫盘');
  const picked = C.aiPick(store.days['2026_11_27'], p.settings);
  assert.deepEqual([...C.dayAgentKeys(picked)], ['claude', 'cursor', 'hermes'], '保留全部 21+ Agent 分桶不被 aiPick 裁掉');
  assert.equal(C.aiAgentName('hermes', p._deckAgentCatalog), 'Hermes');
  assert.equal(C.aiAgentColor('cursor', p._deckAgentCatalog), '#10b981');

  // 无 Agent Deck 时安全回退
  p.app = { plugins: { plugins: {} }, vault: { adapter: { read: async () => JSON.stringify({ days: { '2026_11_27': { wall: 20, segs: [[600, 620]], by: { claude: { wall: 20, segs: [[600, 620]] } } } } }) } } };
  const fallbackStore = await p.aiUsage({ skipScan: true });
  assert.equal(fallbackStore.days['2026_11_27'].wall, 20, '无 Agent Deck 时正常回退内置 aiStore');
  console.log('PASS 1. AI 数据源收口（Agent Deck 统一数据源 / 跳过扫盘 / 21+ Agent / 独立回退）验证通过');

  // 2. 人机用时拆分（番茄钟手工 ⏱ + Agent Deck ⏱ + 🤖 子块上卷）
  const splitMd = [
    '- DONE 鉴权改造 1h #dev [[Auth]]',
    '  - ⏱ 09:00–09:25 · 共 25m',
    '  - ⏱ 10:00–10:30 · 共 30m · 12k tok · Claude <!-- ad-clock:aaaa1111 -->',
    '- DONE 母块带子块 1h #dev',
    '  - ⏱ 11:00–11:20 · 共 20m',
    '  - DONE 🤖 子任务调研',
    '    - ⏱ 11:30–12:00 · 共 30m · 8k tok · Hermes <!-- ad-clock:bbbb2222 -->',
  ].join('\n');
  const splitItems = C.parseJournal(splitMd, DEFAULTS);
  C.applyWork(splitItems, DEFAULTS, '2026_11_27', 16 * 60, 0);
  assert.equal(splitItems[0]._humanMin, 25);
  assert.equal(splitItems[0]._aiMin, 30);
  assert.equal(splitItems[0]._aiTok, 12000);
  assert.equal(splitItems[1]._humanMin, 20);
  assert.equal(splitItems[1]._aiMin, 30);
  assert.equal(splitItems[1]._aiTok, 8000);
  console.log('PASS 2. 人机用时拆分（同任务多 ⏱ + 🤖 子块上卷）验证通过');

  // 3. 番茄钟提前中断记录进 pomodoroInterrupted 且不污染 pomodoroHistory
  const sp = Object.create(Plugin.prototype);
  const nowMs = Date.now();
  sp.settings = {
    ...DEFAULTS,
    pomodoro: { preset: '25', customMinutes: 45, active: { id: 1, dayKey: '2026_11_27', start: nowMs - 6 * 60000, end: nowMs + 19 * 60000, minutes: 25, label: '写周报', task: null } },
    pomodoroHistory: {},
    pomodoroInterrupted: {},
  };
  sp.saveData = async () => {};
  sp.sound = () => {};
  sp.refresh = () => {};
  await sp.stopPomodoro(false, { ask: false, silent: true });
  assert.equal((sp.settings.pomodoroHistory['2026_11_27'] || []).length, 0, '提前中止不进入 pomodoroHistory');
  assert.equal(sp.settings.pomodoroInterrupted['2026_11_27'].length, 1, '提前中止满 1 分钟记入 pomodoroInterrupted');
  console.log('PASS 3. 番茄钟中断统计与 pomodoroHistory 隔离验证通过');

  // 4. 6 维度扩展复盘（时间账单 / 兑现与顺延 / 人机杠杆 / 24h 热力与碎片 / 双侧偏差与原因 / 分类校准 / Markdown）
  const d1 = [
    '- DONE [#A] 主线设计 1h #dev [[ProjX]]',
    '  - ⏱ 09:00–10:30 · 共 1h30m',
    '  - DONE 🤖 自动补测',
    '    - ⏱ 10:30–11:00 · 共 30m · 10k tok · Claude <!-- ad-clock:1111aaaa -->',
    '- DONE 简单收尾 2h #ops',
    '  - ⏱ 14:00–14:30 · 共 30m',
    '- TODO 卡壳任务 30m ← 2026_11_25',
    '- 15:00-16:00 周会',
  ].join('\n');
  const d2 = [
    '- DONE [#A] 架构梳理 30m #dev [[ProjX]]',
    '  - ⏱ 10:00–11:00 · 共 1h',
    '- TODO 卡壳任务 30m ← 2026_11_26',
  ].join('\n');
  const d3 = [
    '- TODO 卡壳任务 30m',
  ].join('\n');

  const reasons = { '2026_11_25|主线设计 #dev ProjX': 'scope' };
  const rev = C.buildPeriodReview([
    {
      dayKey: '2026_11_25', dateStr: '2026-11-25', path: '日记/2026_11_25.md', content: d1,
      bounds: { start: 9 * 60, end: 18 * 60 },
      aiDay: { wall: 30, agent: 60, out: 10000, fresh: 2000, segs: [[630, 660]] },
      gameSegs: [],
      pomoDone: [{ minutes: 25 }],
      pomoInterrupted: [{ elapsed: 7 }],
    },
    {
      dayKey: '2026_11_26', dateStr: '2026-11-26', path: '日记/2026_11_26.md', content: d2,
      bounds: { start: 9 * 60, end: 18 * 60 },
      aiDay: null,
      gameSegs: [],
      pomoDone: [{ minutes: 25 }],
      pomoInterrupted: [],
    },
    {
      dayKey: '2026_11_27', dateStr: '2026-11-27', path: '日记/2026_11_27.md', content: d3,
      bounds: { start: 9 * 60, end: 18 * 60 },
      aiDay: null,
      gameSegs: [],
      pomoDone: [],
      pomoInterrupted: [],
    },
  ], { ...DEFAULTS, format: 'YYYY_MM_DD' }, { mode: 'week', label: '2026-W48', reasons });

  assert.equal(rev.estimate.n, 3);
  assert.equal(rev.estimate.worstOver[0].label, '主线设计 #dev ProjX');
  assert.equal(rev.estimate.worstUnder[0].label, '简单收尾 #ops');
  assert.equal(rev.fulfillment.mainDone, 2);
  assert.equal(rev.fulfillment.mainTotal, 2);
  assert.equal(rev.fulfillment.stalledCount, 1, '跨 3 天未收口任务计为卡壳');
  assert.equal(rev.humanAi.aiWallTotal, 30);
  assert.equal(rev.humanAi.aiAgentTotal, 60);
  assert.equal(rev.humanAi.leverageRatio, 2);
  assert.equal(rev.rhythm.fragmentation.pomoDoneCount, 2);
  assert.equal(rev.rhythm.fragmentation.pomoInterruptedCount, 1);
  assert.equal(rev.reasons.totalTagged, 1);
  assert.equal(rev.reasons.items[0].id, 'scope');
  assert.ok(rev.rhythm.hourly[9].workMin > 0, '24h 热力统计记录了 09:00 工作分钟');

  const cal = C.calibratedEstimate('- TODO 新功能 #dev 1h', 60, rev.estimate.catMap);
  assert.ok(cal && cal.calibratedMin === 120, `#dev 历史 ×2.0 校准 1h -> 120m (got ${cal?.calibratedMin})`);

  const md = C.formatReviewMarkdown(rev, DEFAULTS);
  assert.ok(md.includes('周复盘') && md.includes('时间账单') && md.includes('高估最多') && md.includes('手写反思'), 'Markdown 复盘卡片结构完整');
  const prompt = C.formatReviewAiPrompt(rev, DEFAULTS);
  assert.ok(prompt.includes('时间账单') && prompt.includes(md), 'AI 复盘提示词包含账单与提示');
  console.log('PASS 4. 6 维度扩展复盘、分类校准与 Markdown/Agent 导出验证通过');
})();
