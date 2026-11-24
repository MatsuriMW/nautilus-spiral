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
    format: () => String(key || '').replaceAll('-', '_'),
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
vm.runInNewContext(fs.readFileSync(source, 'utf8'), ctx, { filename: source });
const Plugin = ctx.module.exports;
const {
  DEFAULTS,
  parseJournal,
  mainOf,
  taskPriority,
  toPriority,
  toKeyword,
  kwLine,
  kwLineChange,
  expandPriorityLine,
  findPriorityTokens,
} = Plugin.core;

// 1. 解析、主线识别、状态改写与音效正文等价性
{
  const md = [
    '- [ ] a 复选框高优',
    '- [/] b 复选框进行中',
    '- [x] c 复选框完成',
    '- DOING 14:05 a 进行中紧跟时刻',
    '- DONE 14:00-15:00 b 完成时段',
    '- TODO 🤖 a 机器人任务',
    '- todoa 连写简写',
    '- TODO b fix bug',
    '- TODO c cleanup',
    '- TODO a: fix colon',
    '- TODO [#a] 小写方括号',
    '- TODO4AI a 交给 AI',
    '- TODO a book',
    '- TODO A quick call',
    '- TODO C++',
    '- TODO A/B test',
    '- TODO [#A] b站剪辑',
    '- a 普通大纲不算',
    '- no b 小写no不算',
    '- TODO 写关于 `[#B]` 的文档',
    '- todos:',
    '  - a 直接子项',
    '  - b todos第二项',
  ].join('\n');

  const items = parseJournal(md, DEFAULTS);
  const byLabel = (lbl) => items.find((i) => i.label === lbl);

  assert.equal(byLabel('复选框高优')?.priority, 'A');
  assert.equal(byLabel('复选框进行中')?.priority, 'B');
  assert.equal(byLabel('复选框进行中')?.doing, true);
  assert.equal(byLabel('复选框完成')?.priority, 'C');
  assert.equal(byLabel('复选框完成')?.state, 'done');

  const doingTime = byLabel('进行中紧跟时刻');
  assert.equal(doingTime?.priority, 'A');
  assert.equal(doingTime?.startedAt, 14 * 60 + 5);

  const doneSpan = byLabel('完成时段');
  assert.equal(doneSpan?.priority, 'B');
  assert.deepEqual(Array.from(doneSpan?.actual || []), [14 * 60, 15 * 60]);

  const botTask = byLabel('🤖 机器人任务');
  assert.equal(botTask?.priority, 'A');
  assert.equal(botTask?.auto, true);

  assert.equal(byLabel('连写简写')?.priority, 'A');
  assert.equal(byLabel('fix bug')?.priority, 'B');
  assert.equal(byLabel('cleanup')?.priority, 'C');
  assert.equal(byLabel('fix colon')?.priority, 'A');
  assert.equal(byLabel('小写方括号')?.priority, 'A');
  assert.equal(byLabel('直接子项')?.priority, 'A');
  assert.equal(byLabel('todos第二项')?.priority, 'B');

  assert.equal(byLabel('a book')?.priority, undefined);
  assert.equal(byLabel('A quick call')?.priority, undefined);
  assert.equal(byLabel('C++')?.priority, undefined);
  assert.equal(byLabel('A/B test')?.priority, undefined);
  assert.equal(byLabel('b站剪辑')?.priority, 'A');
  assert.equal(byLabel('普通大纲不算'), undefined);
  assert.equal(byLabel('no b 小写no不算'), undefined);
  assert.equal(byLabel('写关于 `[#B]` 的文档')?.priority, undefined);

  const main = mainOf([
    '- [ ] a 复选框主线',
    '- TODO [#a] 小写方括号主线',
    '- TODO4AI a 交给AI主线',
    '- TODO [#B] 非主线',
  ].join('\n'));
  assert.equal(main.blocks.length, 3);
  assert.deepEqual(Array.from(main.tasks, (t) => t.label), ['复选框主线', '小写方括号主线', '交给AI主线']);

  assert.equal(taskPriority('- [ ] a 写稿'), 'A');
  assert.equal(taskPriority('- DOING 14:05 b 写稿'), 'B');
  assert.equal(taskPriority('- TODO [#c] 写稿'), 'C');
  assert.equal(taskPriority('- TODO a book'), '');
  assert.equal(taskPriority('- TODO [#A] b站剪辑'), 'A');
  assert.equal(taskPriority('- a 写稿'), '');
  assert.equal(taskPriority('- a 写稿', true), 'A');

  assert.equal(toPriority('- [ ] a 写稿', 'B'), '- [ ] [#B] 写稿');
  assert.equal(toPriority('- DOING 14:05 b 写稿', 'A'), '- DOING 14:05 [#A] 写稿');
  assert.equal(toPriority('- TODO [#a] 写稿', ''), '- TODO 写稿');
  assert.equal(toPriority('- a 写稿', 'C', true), '- [#C] 写稿');
  assert.equal(toPriority('- TODO 写关于 `[#B]` 的任务', 'A'), '- TODO [#A] 写关于 `[#B]` 的任务');

  assert.equal(toKeyword('- [ ] a 写稿', 'DOING', '20:30'), '- DOING 20:30 [#A] 写稿');
  assert.equal(toKeyword('- DOING 14:05 b 写稿', 'DONE', '15:10'), '- DONE 14:05-15:10 [#B] 写稿');

  assert.deepEqual(Object.assign({}, kwLine('- TODO a 写稿')), Object.assign({}, kwLine('- TODO [#A] 写稿')));
  assert.deepEqual(Object.assign({}, kwLine('- [ ] a 写稿')), Object.assign({}, kwLine('- [ ] [#A] 写稿')));
  assert.deepEqual(Object.assign({}, kwLine('- DOING 14:05 b 写稿')), Object.assign({}, kwLine('- DOING 14:05 [#B] 写稿')));
  assert.deepEqual(Object.assign({}, kwLine('- todoa 写稿')), Object.assign({}, kwLine('- TODO [#A] 写稿')));
  assert.equal(kwLineChange('- TODO a 写稿', '- TODO [#A] 写稿'), null);
  assert.deepEqual(
    Object.assign({}, kwLineChange('- TODO a 写稿', '- DONE 14:00 [#A] 写稿')),
    { body: '写稿', from: 'TODO', to: 'DONE' }
  );
}
console.log('PASS 解析、主线识别、优先级与状态改写覆盖全部模糊输入与边界防护');

// 2. expandPriorityLine 展开与幂等保护
{
  const positive = [
    ['- todo a 写稿', false, '- TODO [#A] 写稿'],
    ['- todoa 写稿', false, '- TODO [#A] 写稿'],
    ['- todo a写稿', false, '- TODO [#A] 写稿'],
    ['- TODO a: fix bug', false, '- TODO [#A] fix bug'],
    ['- TODO b fix bug', false, '- TODO [#B] fix bug'],
    ['- TODO c cleanup', false, '- TODO [#C] cleanup'],
    ['- [ ] a 写稿', false, '- [ ] [#A] 写稿'],
    ['- [/] b 写稿', false, '- [/] [#B] 写稿'],
    ['- [x] c 写稿', false, '- [x] [#C] 写稿'],
    ['- DOING 14:05 a 写稿', false, '- DOING 14:05 [#A] 写稿'],
    ['- DOING a 14:05 写稿', false, '- DOING 14:05 [#A] 写稿'],
    ['- DONE 14:00-15:00 b 写稿', false, '- DONE 14:00-15:00 [#B] 写稿'],
    ['- TODO 🤖 a 写稿', false, '- TODO 🤖 [#A] 写稿'],
    ['- TODO [#a] 写稿', false, '- TODO [#A] 写稿'],
    ['- TODO4AI a 写稿', false, '- TODO4AI [#A] 写稿'],
    ['  - a 写稿', true, '  - [#A] 写稿'],
  ];
  for (const [input, inTodos, expected] of positive) {
    assert.equal(expandPriorityLine(input, inTodos), expected, `expandPriorityLine(${JSON.stringify(input)})`);
  }

  const unchanged = [
    ['- TODO [#A] 写稿', false],
    ['- TODO a book', false],
    ['- TODO A quick call', false],
    ['- TODO C++', false],
    ['- TODO A/B test', false],
    ['- TODO [#A] b站剪辑', false],
    ['  - a 写稿', false],
    ['- no b 写稿', false],
    ['- TODO 写关于 `[#a]` 的文档', false],
    ['- TODO [#A](https://example.com)', false],
  ];
  for (const [input, inTodos] of unchanged) {
    assert.equal(expandPriorityLine(input, inTodos), null, `should stay null: ${JSON.stringify(input)}`);
  }
}
console.log('PASS expandPriorityLine 正向展开与负向防误触验证通过');

// 3. findPriorityTokens 多行扫描（frontmatter / 代码块 / 行内代码 / 链接 / todos 层级 / 偏移不重叠）
{
  const doc = [
    '---',
    'title: todo a frontmatter',
    '- TODO [#A] ignored',
    '---',
    '```markdown',
    '- TODO [#A] fenced backtick',
    '```',
    '~~~',
    '- TODO [#B] fenced tilde',
    '~~~',
    '- TODO `[#A]` 行内代码不渲染',
    '- TODO [#A](https://example.com) 链接不渲染',
    '- TODO [#A] alpha',
    '- TODO [#b] beta',
    '- todoa 紧贴',
    '- [ ] c 模糊',
    '- a 非todos不渲染',
    '- todos:',
    '  - a 直接子项',
    '    - b 孙层不算',
  ].join('\n');

  const tokens = findPriorityTokens(doc);
  assert.equal(tokens.length, 5, '只应命中 5 个有效优先级标记');

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    assert.equal(doc.slice(t.from, t.to), t.raw, 'token offset must slice exact raw text');
    if (i > 0) assert.ok(tokens[i - 1].to <= t.from, 'tokens must be strictly sorted and non-overlapping');
  }

  assert.deepEqual(
    Array.from(tokens, (t) => ({ prio: t.prio, raw: t.raw, fuzzy: t.fuzzy, attached: t.attached })),
    [
      { prio: 'A', raw: '[#A]', fuzzy: false, attached: false },
      { prio: 'B', raw: '[#b]', fuzzy: false, attached: false },
      { prio: 'A', raw: 'a', fuzzy: true, attached: true },
      { prio: 'C', raw: 'c', fuzzy: true, attached: false },
      { prio: 'A', raw: 'a', fuzzy: true, attached: false },
    ]
  );
}
console.log('PASS findPriorityTokens 多行扫描与偏移校验通过');

// 4. 与 logseq-style-tasks 渲染礼让检测
{
  const p = Object.create(Plugin.prototype);
  p.app = { plugins: { enabledPlugins: new Set(), plugins: {} } };
  assert.equal(p.hasExternalPriorityRender(), false);

  p.app.plugins.enabledPlugins.add('logseq-style-tasks');
  p.app.plugins.plugins['logseq-style-tasks'] = { settings: { formatTaskKeywords: false } };
  assert.equal(p.hasExternalPriorityRender(), false);

  p.app.plugins.plugins['logseq-style-tasks'].settings.formatTaskKeywords = true;
  assert.equal(p.hasExternalPriorityRender(), true);
}
console.log('PASS hasExternalPriorityRender 跨插件礼让验证通过');

// 5. styles.css 优先级小方块样式与作用域校验
{
  const css = fs.readFileSync(cssPath, 'utf8');
  for (const sel of ['.naut-prio-badge', '.is-prio-a', '.is-prio-b', '.is-prio-c', '.naut-prio-raw']) {
    assert.ok(css.includes(sel), `styles.css 缺少 ${sel}`);
  }
  const idxVars = css.indexOf('.naut-prio-badge, .naut-prio-raw');
  assert.ok(idxVars >= 0, 'styles.css 应将配色变量定义在 .naut-prio-badge, .naut-prio-raw 上而非局限于 .naut-root');
  const block = css.slice(idxVars, css.indexOf('}', idxVars));
  assert.ok(block.includes('--naut-prio-a:') && block.includes('--naut-prio-b:') && block.includes('--naut-prio-c:'));
}
console.log('PASS styles.css 优先级小方块样式与全局作用域验证通过');
