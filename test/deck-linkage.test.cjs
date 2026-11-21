const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const cssPath = path.join(path.dirname(source), 'styles.css');
const OB = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Modal: class {},
  FuzzySuggestModal: class {},
  getLanguage: () => 'zh',
  moment: (key, format) => ({
    isValid: () => format === 'YYYY-MM-DD' && /^\d{4}-\d{2}-\d{2}$/.test(key),
    format: () => key.replaceAll('-', '_'),
  }),
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
vm.runInNewContext(fs.readFileSync(source, 'utf8') + '\nmodule.exports.TestSessionsModal = AiSessionsModal; module.exports.testProjectAiDay = projectAiDay;', ctx, { filename: source });
const Plugin = ctx.module.exports;
const { DEFAULTS, parseJournal, mainOf, schedule, taskStatus, statusCls, toKeyword, taskPriority, toPriority, cycleUpNextStatus, UP_NEXT_MENU_GROUPS, UP_NEXT_PRIORITY_ITEMS } = Plugin.core;

{
  const p = Object.create(Plugin.prototype);
  const opens = [];
  p.app = { plugins: { plugins: { 'agent-deck': {
    settings: { autoLogState: { '2026_11_20': { session: { key: '对话标题' } } } },
    openSessionBySid: (sid, agent) => opens.push([sid, agent]),
  } } } };
  p.settings = { format: 'YYYY-MM-DD' };
  assert.ok(p.autoKeys('2026-11-20').has('对话标题'), 'daily note filename format must not affect Agent Deck ownership');
  p.app.plugins.plugins['agent-deck'].settings.taskBindings = {
    'other-session': { sid: 'other-session', path: '日记/2026-11-21.md', blockId: 'ad-other' },
    [ 'manual-session' ]: { path: '日记/2026-11-20.md', blockId: 'ad-manual' },
  };
  const bindings = p.deckJournalBindings('2026-11-20', '日记/2026-11-20.md');
  assert.equal(bindings.get('manual-session')?.blockId, 'ad-manual');
  assert.ok(!bindings.has('other-session'));

  const buttons = [];
  const node = { createDiv: () => node, createEl: (_tag, options) => {
    const button = { text: options.text };
    buttons.push(button);
    return button;
  } };
  const modal = new Plugin.TestSessionsModal(p, '验收', []);
  modal.close = () => {};
  modal.session(node, { sid: '11111111-2222-4333-8444-555555555555', agent: 'codex', app: 'Codex Desktop' });
  const primary = buttons.find(button => button.text === '打开会话');
  assert.ok(primary, 'the session list uses Agent Deck instead of defaulting desktop Codex to Terminal');
  primary.onclick();
  assert.deepEqual(opens, [['11111111-2222-4333-8444-555555555555', 'codex']]);

  p.settings = { dayCutoff: 0, dayStart: 8, dayEnd: 32, folder: '日记', format: 'YYYY/MM/DD' };
  assert.equal(p.journalDayCutoff(), 0, 'midnight is a valid option');
  p.settings.dayCutoff = 4.5;
  assert.equal(p.journalDayCutoff(), 4.5, 'the cutoff remains editable');
  assert.equal(p.journalKey({path:'日记/2026/11/20.md'}), '2026/11/20');
  const row = { segs:[[120,135]], wall:15, out:20 };
  const day = { ...row, by:{codex:row}, list:[row] };
  const projected = Plugin.testProjectAiDay(day, {...p.settings, dayCutoff:0});
  assert.equal(JSON.stringify(projected.by.codex.segs), JSON.stringify([[1560,1575]]));
  assert.equal(JSON.stringify(projected.list[0].segs), JSON.stringify([[1560,1575]]));
  assert.equal(JSON.stringify(day.segs), JSON.stringify([[120,135]]), 'visual wrapping leaves measured data intact');
  assert.equal(projected.wall, 15);
}

// 1. parseJournal 提取各任务状态关键词与复选框状态
const items = parseJournal([
  '- TODO 买牛奶 10m',
  '- DOING 写代码 30m',
  '- PAUSED 调样式 15m',
  '- WAITING 等接口 15m',
  '- SUSPENDED 暂缓重构 20m',
  '- TOREVIEW 🤖 审阅改动 15m',
  '- NEEDOK 🤖 审批命令 10m',
  '- ERRORED 🤖 排查失败 10m',
  '- HITLIMIT 🤖 限额等待 10m',
  '- QUEUED 🤖 排队续跑 10m',
  '- DELEGATED 🤖 委派调研 20m',
  '- DONE 10:00-10:30 晨会',
  '- [ ] 复选待办 10m',
  '- [/] 复选进行 10m',
  '- [x] 复选完成 10m',
].join('\n'), DEFAULTS);

assert.deepEqual(
  Array.from(items, (it) => it.kw),
  ['TODO', 'DOING', 'PAUSED', 'WAITING', 'SUSPENDED', 'TOREVIEW', 'NEEDOK', 'ERRORED', 'HITLIMIT', 'QUEUED', 'DELEGATED', 'DONE', 'TODO', 'DOING', 'DONE']
);
assert.deepEqual(
  Array.from(items, (it) => taskStatus(it)),
  ['todo', 'doing', 'paused', 'waiting', 'suspended', 'toreview', 'needok', 'errored', 'hitlimit', 'queued', 'delegated', 'done', 'todo', 'doing', 'done']
);
console.log('PASS parseJournal 与 taskStatus 覆盖全部任务状态');

// 2. Agent Deck 实时会话状态联动与优先级
const doingItem = items.find((it) => it.kw === 'DOING');
const pausedItem = items.find((it) => it.kw === 'PAUSED');
const doneItem = items.find((it) => it.kw === 'DONE');
assert.equal(taskStatus(doingItem, 'wait'), 'toreview', 'Agent Deck wait 实时覆盖 DOING');
assert.equal(taskStatus(doingItem, 'needs-approval'), 'needok', 'Agent Deck needs-approval 实时覆盖 DOING');
assert.equal(taskStatus(doingItem, 'error'), 'errored', 'Agent Deck error 实时覆盖 DOING');
assert.equal(taskStatus(doingItem, 'limit'), 'hitlimit', 'Agent Deck limit 实时覆盖 DOING');
assert.equal(taskStatus(doingItem, 'queued'), 'queued', 'Agent Deck queued 实时覆盖 DOING');
assert.equal(taskStatus(pausedItem, 'run'), 'paused', '用户手动 PAUSED 不被 Agent Deck 覆盖');
assert.equal(taskStatus(doneItem, 'run'), 'done', '已完成任务不被 Agent Deck 覆盖');

// TODO 态的主线/重要/事件保留原色；非 TODO 状态则随状态色变化
assert.equal(statusCls({ kind: 'task', state: 'open', kw: 'TODO', main: true }, 'naut-kw-'), '');
assert.equal(statusCls({ kind: 'task', state: 'open', kw: 'DOING', main: true }, 'naut-kw-'), ' naut-kw-doing');
assert.equal(statusCls({ kind: 'task', state: 'open', kw: 'TODO' }, 'naut-kw-'), ' naut-kw-todo');
assert.equal(statusCls({ kind: 'task', state: 'done', kw: 'DONE', label: '复习卡片 20 张' }, 'naut-kw-'), '', '复习卡片保留青色');
assert.equal(statusCls({ kind: 'event', state: 'open', kw: 'DOING', cal: { color: '#123456' } }, 'naut-kw-'), '', '日历事件保留日历颜色');
console.log('PASS statusCls 联动 Agent Deck 实时状态并保留主线/复习/日历例外');

// 3. styles.css 色板与 Agent Deck keyword.css 一致
const css = fs.readFileSync(cssPath, 'utf8');
const expectedColors = {
  doing: '#c8635f',
  done: '#629c7f',
  paused: '#b39a3e',
  waiting: '#8f7fb6',
  suspended: '#a17f66',
  toreview: '#6fa9b8',
  needok: '#bf7a45',
  errored: '#93606b',
  hitlimit: '#8a5a8c',
  queued: '#6f86a8',
  delegated: '#5b9690',
};
for (const [k, hex] of Object.entries(expectedColors)) {
  assert.ok(css.includes(`--naut-kw-${k}: ${hex};`), `styles.css 应包含 --naut-kw-${k}: ${hex}`);
  assert.ok(css.includes(`.naut-seg.naut-kw-${k}`), `styles.css 应包含 .naut-seg.naut-kw-${k}`);
  assert.ok(css.includes(`.naut-row.is-kw-${k}`), `styles.css 应包含 .naut-row.is-kw-${k}`);
}
console.log('PASS styles.css 状态色板与 Agent Deck 完全一致');

// 4. activate(focus, forceLeft)：安装后强制在左侧打开并展开左侧栏
(async () => {
  const leftSplit = { collapsed: true, expanded: 0, expand() { this.collapsed = false; this.expanded++; } };
  const rightSplit = {};
  let detached = 0;
  let createdInLeft = 0;
  let revealed = null;
  const wrongLeaf = { getRoot: () => rightSplit, detach() { detached++; } };
  const newLeftLeaf = {
    getRoot: () => leftSplit,
    parent: { selected: null, selectTab(l) { this.selected = l; } },
    async setViewState(st) { this.viewState = st; },
  };
  const p = Object.create(Plugin.prototype);
  p.app = {
    workspace: {
      leftSplit,
      getLeavesOfType: () => [wrongLeaf],
      getLeftLeaf: (split) => { createdInLeft++; return split ? newLeftLeaf : null; },
      revealLeaf: (l) => { revealed = l; },
    },
  };
  const leaf = await p.activate(true, true);
  assert.equal(detached, 1, '非左侧栏的旧面板应被移除');
  assert.equal(createdInLeft, 2, 'getLeftLeaf(false) 为空时应回退到 getLeftLeaf(true)');
  assert.equal(leaf, newLeftLeaf);
  assert.equal(newLeftLeaf.viewState.type, 'nautilus-spiral');
  assert.equal(leftSplit.collapsed, false, '应强制展开折叠的左侧栏');
  assert.equal(leftSplit.expanded, 1);
  assert.equal(revealed, newLeftLeaf);

  // focus = false 时同样展开左侧栏并选中 tab
  leftSplit.collapsed = true;
  p.app.workspace.getLeavesOfType = () => [newLeftLeaf];
  await p.activate(false, true);
  assert.equal(leftSplit.collapsed, false);
  assert.equal(newLeftLeaf.parent.selected, newLeftLeaf);
  console.log('PASS activate(focus, forceLeft) 强制在左侧打开并展开左侧栏');

  // 5. 「接下来」三段循环：原状态 → DONE → SUSPENDED → 原状态；以及右键菜单状态切换
  const orig = '- DOING 21:30 [#A] 写代码 30m';
  const step1 = cycleUpNextStatus(orig, null, '22:10');
  assert.equal(step1.nextKw, 'DONE');
  assert.equal(step1.nextRaw, '- DONE 21:30-22:10 [#A] 写代码 30m');
  assert.equal(step1.origRaw, orig);

  const step2 = cycleUpNextStatus(step1.nextRaw, step1.origRaw, '22:10');
  assert.equal(step2.nextKw, 'SUSPENDED');
  assert.equal(step2.nextRaw, '- SUSPENDED [#A] 写代码 30m');
  assert.equal(step2.origRaw, orig);

  const step3 = cycleUpNextStatus(step2.nextRaw, step2.origRaw, '22:10');
  assert.equal(step3.nextKw, 'DOING');
  assert.equal(step3.nextRaw, orig, '第三下应无损恢复原状态');
  assert.equal(step3.origRaw, null);

  assert.equal(toKeyword('- TODO 买牛奶 10m', 'WAITING', '22:10'), '- WAITING 买牛奶 10m');
  assert.equal(toKeyword('- TODO 买牛奶 10m', 'TOREVIEW', '22:10'), '- TOREVIEW 买牛奶 10m');
  assert.equal(toKeyword('- TODO 买牛奶 10m', 'DOING', '22:10'), '- DOING 22:10 买牛奶 10m');
  assert.equal(toKeyword('- todo a 写稿 30m', 'DONE', '22:10'), '- DONE 22:10 [#A] 写稿 30m', '简写 todo a 切状态应展开为 [#A] 不残留原词');
  assert.equal(toKeyword('- DONE [#A] 21:30-22:10 写代码 30m', 'SUSPENDED', '22:15'), '- SUSPENDED [#A] 写代码 30m', 'DONE 优先级在前的时间段应干净剥离');
  assert.equal(toKeyword('- DONE 22:10 买牛奶 10m', 'DONE', '22:15'), '- DONE 22:10 买牛奶 10m', '同状态切换应幂等不改时间戳');
  assert.equal(toKeyword('- PAUSED 🤖 19:17-19:23 写稿 30m', 'TODO', '22:15'), '- TODO 🤖 写稿 30m', 'PAUSED 记录时段切回 TODO 时必须剥离，保留 🤖');
  assert.equal(toKeyword('- DOING 🤖 14:05 写稿 30m', 'DONE', '15:00'), '- DONE 14:05-15:00 🤖 写稿 30m', 'DOING 🤖 后的开始时间应识别并保留 🤖');
  assert.equal(toKeyword('- TODO 14:00-15:00 开会', 'DOING', '13:55'), '- DOING 13:55 14:00-15:00 开会', 'TODO 固定事件预约时段不可误剥');
  assert.equal(toKeyword('- LATER 买牛奶 10m', 'TODO', '22:15'), '- LATER 买牛奶 10m', '等价别名切换应幂等');
  const yesStep = cycleUpNextStatus('- YES 写稿 10m', null, '22:15');
  assert.equal(yesStep.nextKw, 'SUSPENDED', 'YES 归为 DONE，点击应直接切去 SUSPENDED');
  assert.equal(yesStep.nextRaw, '- SUSPENDED 写稿 10m');
  const menuKws = UP_NEXT_MENU_GROUPS.flat().map(([k]) => k);
  for (const k of ['TODO', 'DOING', 'DONE', 'PAUSED', 'WAITING', 'SUSPENDED', 'CANCELLED']) {
    assert.ok(menuKws.includes(k), `右键菜单应包含人工状态 ${k}`);
  }
  for (const k of ['TOREVIEW', 'NEEDOK', 'DELEGATED', 'QUEUED', 'HITLIMIT', 'ERRORED']) {
    assert.ok(!menuKws.includes(k), `右键菜单不应包含 AI 机器状态 ${k}`);
  }
  assert.deepEqual(Array.from(UP_NEXT_PRIORITY_ITEMS, ([p]) => p), ['A', 'B', 'C', ''], '右键菜单应提供 A/B/C/清除 重要程度');
  assert.equal(toPriority('- TODO 写周报 25m', 'A'), '- TODO [#A] 写周报 25m');
  assert.equal(toPriority('- TODO [#A] 写周报 25m', 'B'), '- TODO [#B] 写周报 25m');
  assert.equal(toPriority('- DOING 20:30 [#B] 写周报', 'A'), '- DOING 20:30 [#A] 写周报');
  assert.equal(toPriority('- TODO [#C] 写周报', ''), '- TODO 写周报');
  assert.equal(taskPriority('- DOING 20:30 [#B] 写周报'), 'B');
  assert.equal(taskPriority('- todo a 写周报'), 'A');
  console.log('PASS 「接下来」点击三段循环与右键菜单状态/重要程度切换');

  // 6. 母块/子块状态继承：母块无状态或 TODO 保留子块各自状态；母块为其他状态时覆盖带状态的子块
  const nested = parseJournal([
    '- 普通母块',
    '  - TODO 自由待办 10m',
    '  - DONE 自由完成 10m',
    '- TODO 容器任务',
    '  - DONE 已完成子步 10m',
    '  - DOING 进行中子步 15m',
    '- DOING 正在做的母块',
    '  - TODO 继承进行中 20m',
    '- SUSPENDED 搁置的母块',
    '  - DOING 继承搁置 20m',
    '  - 普通备注无状态',
    '- DONE 做完的母块',
    '  - TODO 继承完成 15m',
    '- CANCELLED 取消的母块',
    '  - TODO 跟着取消 15m',
    '- PAUSED 暂停的母块',
    '^parent-block-id',
    '  - 普通中间层',
    '    - TODO 孙块也继承暂停 10m',
  ].join('\n'), DEFAULTS);
  const byLabel = Object.fromEntries(nested.map((it) => [it.label, it]));
  assert.equal(byLabel['自由待办'].kw, 'TODO');
  assert.equal(byLabel['自由待办'].inheritedFrom, undefined);
  assert.equal(byLabel['自由完成'].kw, 'DONE');
  assert.equal(byLabel['已完成子步'].kw, 'DONE');
  assert.equal(byLabel['已完成子步'].state, 'done');
  assert.equal(byLabel['进行中子步'].kw, 'DOING');
  assert.equal(byLabel['进行中子步'].doing, true);
  assert.equal(byLabel['继承进行中'].kw, 'DOING');
  assert.equal(byLabel['继承进行中'].doing, true);
  assert.equal(byLabel['继承进行中'].inheritedFrom, byLabel['正在做的母块'].line);
  assert.equal(byLabel['继承搁置'].kw, 'SUSPENDED');
  assert.equal(byLabel['继承搁置'].suspended, true);
  assert.equal(byLabel['继承搁置'].doing, false);
  assert.equal(byLabel['普通备注无状态'], undefined, '无状态子块不会被强行变成任务');
  assert.equal(byLabel['继承完成'].kw, 'DONE');
  assert.equal(byLabel['继承完成'].state, 'done');
  assert.equal(byLabel['跟着取消'], undefined, 'CANCELLED 母块下的子任务一起丢弃');
  assert.equal(byLabel['孙块也继承暂停'].kw, 'PAUSED');
  assert.equal(byLabel['孙块也继承暂停'].paused, true);
  assert.equal(byLabel['孙块也继承暂停'].inheritedFrom, byLabel['暂停的母块'].line);

  // schedule() 搁置列表不重复列 container 母块
  const plan = schedule(nested, DEFAULTS, 10 * 60, 0);
  assert.deepEqual(Array.from(plan.suspended, (t) => t.label), ['继承搁置'], '搁置列表应排除 container 母块避免重复');

  // mainOf() 与 parseJournal 遵守同一条母块/子块状态继承规则（含 [x] **01:44** 顺序与 ^block-id）
  const mainDoc = mainOf([
    '- [x] **01:44** 已完成的母块',
    '^done-block-id',
    '  - TODO [#A] 继承完成主线',
    '- CANCELLED 取消的母块',
    '  - TODO [#A] 继承取消主线',
    '- TODO 容器主线',
    '  - DONE [#A] 保留完成子步',
    '  - DOING [#A] 保留进行子步',
  ].join('\n'));
  assert.equal(mainDoc.tasks.length, 3);
  assert.deepEqual(
    Array.from(mainDoc.tasks, (t) => [t.label, t.state]),
    [['继承完成主线', 'done'], ['保留完成子步', 'done'], ['保留进行子步', 'doing']]
  );
  console.log('PASS 母块/子块状态继承（含 schedule 去重与 mainOf 一致性）验证通过');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
