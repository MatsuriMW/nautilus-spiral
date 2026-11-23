const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const OB = {Plugin:class{},ItemView:class{},PluginSettingTab:class{},Modal:class{},FuzzySuggestModal:class{},getLanguage:()=> 'zh'};
const ctx = {require:(id)=>id==='obsidian'?OB:require(id),module:{exports:{}},console,process,Buffer,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(source,'utf8'), ctx, {filename:source});
const {AiUsage,parseLink,DEFAULTS,parseJournal,applyWork,schedule,isAutoTask,formatTaskDur,formatTaskTip,detectJournal,formatRegex} = ctx.module.exports.core;
const ai = new AiUsage(DEFAULTS);
const tool = (name,input) => ({type:'assistant',message:{content:[{type:'tool_use',name,input}]}});
ai.liveClaude({type:'user',message:{content:'实现设置'}},'claude-test',1);
ai.liveClaude(tool('TaskCreate',{subject:'增加配置'}),'claude-test',2);
ai.liveClaude(tool('TaskCreate',{subject:'验证'}),'claude-test',3);
ai.liveClaude(tool('TaskUpdate',{taskId:'1',status:'completed'}),'claude-test',4);
assert.equal(ai.live.get('claude-test').todo.done,1);
assert.equal(ai.live.get('claude-test').todo.total,2);
assert.equal(ai.live.get('claude-test').todo.cur,'验证');
assert.equal(ai.live.get('claude-test').turns,1);
ai.liveClaude({type:'user',message:{content:[{type:'tool_result',content:'ok'}]}},'claude-test',5);
assert.equal(ai.live.get('claude-test').turns,1);
ai.liveClaude({type:'user',message:{content:'继续'}},'claude-test',6);
assert.equal(ai.live.get('claude-test').turns,2);
console.log('PASS Claude steps and real-user turns');
const sid='11111111-2222-3333-4444-555555555555';
assert.equal(parseLink(`\t- 🔗 Antigravity：任务 \`${sid}\``).agent,'antigravity');
assert.equal(DEFAULTS.aiAgents.antigravity,true);
assert.equal(DEFAULTS.aiAgents.dsh,true);
// 只隔离日历归属与用量累积，验证实际 Antigravity 事件解析。
ai.stale=()=>false;
ai.touchSess=()=>({key:'day',day:{},s:{}});
ai.addPrompt=()=>{};
const fc={sid,titles:new Map(),msgs:new Map()};
const ingest = (d,n) => ai.ingestAntigravity(JSON.stringify({...d,created_at:new Date(1000*n).toISOString()}),fc,new Set());
ingest({type:'USER_INPUT',content:'<USER_REQUEST>实现功能</USER_REQUEST>'},1);
assert.equal(ai.live.get(sid).turns,1);
ingest({type:'PLANNER_RESPONSE',content:'完成'},2);
assert.equal(ai.live.get(sid).state,'wait');
ingest({type:'USER_INPUT',content:'验证结果'},3);
assert.equal(ai.live.get(sid).turns,2);
assert.equal(ai.live.get(sid).state,'run');
console.log('PASS Antigravity link, states and two turns; DSH enabled');
const {aiSegmentSessions, aiHoverSession} = ctx.module.exports.core;
const sessions = [
 {sid:'short',agent:'codex',min:200,segs:[[1400,1440],[1450,1500]],title:'短重叠',out:300},
 {sid:'long',agent:'codex',min:60,segs:[[1420,1490]],title:'长重叠',out:200},
 {sid:'other',agent:'claude',min:90,segs:[[1420,1490]]},
];
const hits=aiSegmentSessions(sessions,'codex',1430,1470);
assert.deepEqual(Array.from(hits,x=>[x.sid,x.overlap]),[['long',40],['short',30]]);
assert.equal(sessions[0].overlap,undefined);
assert.equal(hits[0].out,200); // 本日用量原样保留，不能冒充本段用量
const info=aiHoverSession(hits[0],{state:'run',turns:3,model:'test-model',lastText:'最近回复'},true);
assert.equal(info.state,'run');assert.equal(info.progress,'第 3 轮');
const historical=aiHoverSession(hits[0],{state:'run',turns:3,lastText:'今天的回复'},false);
assert.equal(historical.state,null);assert.equal(historical.reply,'');
console.log('PASS agent hover uses segment overlap and separates daily tokens from historical/live state');

assert.equal(aiHoverSession(hits[0],{lastText:'- [发布说明](https://example.com/very-long-url)'},true).reply,'发布说明');
console.log('PASS reply previews strip Markdown links and list markers');

// 双击 Agent 内圈展开详情卡：把公开版里挂在 hit 上的事件接线取出来实际跑一遍，
// 确认双击展开的是同一张卡，且单击、悬停、回车的行为没被改掉。
// 这里测的是事件处理本身，不依赖 Obsidian 的 DOM；界面上的真实点击仍需人工验证。
const js = fs.readFileSync(source, 'utf8');
const block = js.slice(js.indexOf('hit.dataset.agent'), js.indexOf('// 再往里一圈：游戏时间'));
assert.ok(block.length > 0, '公开版里应有 Agent 内圈的事件接线');
assert.ok(block.includes('const show = (expanded = false, explicit = false)'), '详情卡由同一个 show() 生成');
assert.ok(block.includes('naut-ai-hover-card'), '展开后创建同一张详情卡');
const listeners = {}, calls = [];
vm.runInNewContext(
  block.split('\n').filter((l) => /^\s*hit\.addEventListener\(/.test(l)).join('\n'),
  { hit: { addEventListener: (type, fn) => { listeners[type] = fn; } }, show: (...args) => calls.push(args), leaveHover: () => {} }
);
assert.deepEqual(Object.keys(listeners).sort(), ['blur','click','dblclick','focus','keydown','mouseenter','mouseleave'].sort());
const evt = () => ({ prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } });
let e = evt();
listeners.dblclick(e);
assert.deepEqual(calls.pop(), [true, true], '双击应展开详情卡');
assert.equal(e.prevented, 1);
assert.equal(e.stopped, 1);
listeners.click();
assert.deepEqual(calls.pop(), [false, true], '单击仍只显示简讯');
listeners.mouseenter();
assert.deepEqual(calls.pop(), [], '悬停行为不变');
listeners.focus();
assert.deepEqual(calls.pop(), [], '聚焦行为不变');
e = evt(); e.key = 'Enter';
listeners.keydown(e);
assert.deepEqual(calls.pop(), [true, true], '回车仍展开详情卡');
assert.equal(e.prevented, 1);
e = evt(); e.key = 'a';
listeners.keydown(e);
assert.equal(calls.length, 0, '其他按键不响应');
console.log('PASS 双击内圈展开详情卡；单击、悬停、回车行为不变');

const parsedAiTasks = parseJournal([
  '- DONE 🤖 18:46-19:10 修复颜色解析',
  '- DOING 🤖 20:37-21:40 运行测试 30m',
  '- PAUSED 🤖 19:17-19:23 中断任务'
].join('\n'), DEFAULTS);
assert.equal(parsedAiTasks.length, 3);
assert.equal(JSON.stringify(parsedAiTasks.map(it => [it.kind, it.state, it.doing, it.paused, it.label.startsWith('🤖 ')])), JSON.stringify([
  ['task', 'done', false, false, true],
  ['task', 'open', true, false, true],
  ['task', 'open', false, true, true]
]));
console.log('PASS parseJournal 正确识别带 🤖 时段的 DONE/DOING/PAUSED 任务');

// 自动记的未完成行「TOREVIEW 🤖 21:59-00:06」：那段就是 AI 回传的真实占用 → 整段一块、时长也按它算
const spanItems = parseJournal([
  '- TOREVIEW 🤖 21:59-00:06 排查箭头',
  '- PAUSED 🤖 06:42-08:19 折叠对齐',
  '- TOREVIEW 🤖 手写没区间的审阅'
].join('\n'), DEFAULTS);
assert.equal(spanItems[0].dur, 127, '21:59-00:06 按 127 分钟算，不再回落默认时长');
assert.equal(JSON.stringify(spanItems[0].aiSpan), JSON.stringify([1319, 1446]));
assert.equal(spanItems[1].dur, 97, '06:42-08:19 跨 dayCutoff 分界也要算对（以前会得到负数）');
assert.equal(spanItems[2].aiSpan, undefined, '没写区间的行没有 aiSpan');
assert.equal(spanItems[2].dur, DEFAULTS.defaultDur);
// applyWork：整段当 worked，不被 ⏱ 行拆成碎块，合计就是整段
const spanCfg = {...DEFAULTS, workLog: {}};
const spanItems2 = parseJournal(['- TOREVIEW 🤖 21:59-00:06 排查箭头', '\t- ⏱ 21:59–22:10、22:30–22:40 · 共 21m'].join('\n'), spanCfg);
applyWork(spanItems2, spanCfg, '2026_11_20', 23 * 60 + 20, 0, {});
assert.equal(JSON.stringify(spanItems2[0].worked), JSON.stringify([[1319, 1446]]), 'worked 是整段');
assert.equal(spanItems2[0].spentToday, 127);
console.log('PASS 自动记的 🤖 区间按整段算时长与块（含跨分界）');

// 自动记的 🤖 未完成任务在「没做完 / 接下来」列表的时长文案：不套默认 15m 预估，也不显示假的「99% · 剩 5m」
const autoDurItems = parseJournal([
  '- TOREVIEW 🤖 21:59-00:06 排查箭头',
  '- TOREVIEW 🤖 确认步骤尺方案',
  '\t- ⏱ 14:00–14:07 · 共 7m',
  '- PAUSED 🤖 确认spec第一原则后再落地实现',
  '- DOING 🤖 20:37-20:47 运行测试 30m',
  '- TODO 普通手写任务 20m',
].join('\n'), spanCfg);
applyWork(autoDurItems, spanCfg, '2026_11_20', 23 * 60 + 20, -1, {});
schedule(autoDurItems, spanCfg, 23 * 60 + 20, -1, {});
assert.equal(isAutoTask(autoDurItems[0]), true);
assert.equal(formatTaskDur(autoDurItems[0]), '已做 2h7m', '带 aiSpan 的历史 🤖 行应显示已做时长而非 96% · 剩 5m');
assert.equal(formatTaskTip(autoDurItems[0]), '', '无手写预估的 🤖 行不提示假预估');
assert.equal(formatTaskDur(autoDurItems[1]), '已做 7m', '只记了 ⏱ 的 🤖 行应显示已做 7m 而非 47% · 剩 8m');
assert.equal(formatTaskDur(autoDurItems[2]), '15m', '无用时的任务保留默认时长显示');
assert.equal(formatTaskDur(autoDurItems[3]), '33% · 剩 20m', '手写了 30m 预估的 🤖 行仍按预估展示进度');
assert.equal(formatTaskDur(autoDurItems[4]), '20m', '普通手写未开始任务照常显示预估时长');
console.log('PASS 自动记的 🤖 未完成任务时长展示（不弹假 99% · 剩 5m）');

// 日记在哪：没手填就自动认出格式和目录（核心「日记」插件 → Periodic Notes → 翻库猜）
assert.ok(formatRegex('YYYY-MM-DD').test('2026-11-20'), 'YYYY-MM-DD 认得出');
assert.ok(!formatRegex('YYYY-MM-DD').test('2026_11_20'), 'YYYY-MM-DD 不认下划线写法');
const p2 = (n) => String(n).padStart(2, '0');
const dname = (ago) => { const d = new Date(Date.now() - ago * 864e5); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fakeVault = (paths) => ({ vault: { getFiles: () => paths.map((x) => ({ path: x })) } });
const detScan = detectJournal(fakeVault([`日记/${dname(0)}.md`, `日记/${dname(1)}.md`, `归档/${dname(4)}.md`]), { ...DEFAULTS, journalAuto: true });
assert.equal(detScan.folder, '日记', '日期命名的文件最多、最近还在写的那一处');
assert.equal(detScan.format, 'YYYY-MM-DD', '认出的是横线写法，不是默认的下划线');
const detDaily = detectJournal({ ...fakeVault([`Daily/${dname(0)}.md`]), internalPlugins: { getPluginById: (id) => (id === 'daily-notes' ? { enabled: true, instance: { options: { folder: 'Daily', format: 'YYYY/MM/DD' } } } : null) } }, { ...DEFAULTS, journalAuto: true });
assert.equal(detDaily.folder, 'Daily', '核心「日记」插件的设置优先于翻库');
assert.equal(detDaily.format, 'YYYY/MM/DD');
const detManual = detectJournal(fakeVault([`日记/${dname(0)}.md`]), { ...DEFAULTS, journalAuto: false, folder: '我的日记', format: 'YYYY.MM.DD' });
assert.equal(detManual.folder, '我的日记', '手填了就不自动改');
assert.equal(detManual.format, 'YYYY.MM.DD');
console.log('PASS 日记目录/格式自动检测（核心插件优先、翻库猜、手填优先）');
