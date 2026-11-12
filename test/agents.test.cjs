const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const OB = {Plugin:class{},ItemView:class{},PluginSettingTab:class{},Modal:class{},FuzzySuggestModal:class{},getLanguage:()=> 'zh'};
const ctx = {require:(id)=>id==='obsidian'?OB:require(id),module:{exports:{}},console,process,Buffer,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(source,'utf8'), ctx, {filename:source});
const {AiUsage,parseLink,DEFAULTS} = ctx.module.exports.core;
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
