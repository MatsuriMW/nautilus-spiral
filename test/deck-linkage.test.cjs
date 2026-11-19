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
const { DEFAULTS, parseJournal, taskStatus, statusCls, toKeyword, cycleUpNextStatus, UP_NEXT_MENU_GROUPS } = Plugin.core;

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
  const menuKws = UP_NEXT_MENU_GROUPS.flat().map(([k]) => k);
  for (const k of ['TODO', 'DOING', 'DONE', 'PAUSED', 'WAITING', 'SUSPENDED', 'CANCELLED', 'TOREVIEW', 'NEEDOK', 'DELEGATED', 'QUEUED', 'HITLIMIT', 'ERRORED']) {
    assert.ok(menuKws.includes(k), `右键菜单应包含 ${k}`);
  }
  console.log('PASS 「接下来」点击三段循环与右键菜单状态切换');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
