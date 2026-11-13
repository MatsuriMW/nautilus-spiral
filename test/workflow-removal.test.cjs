const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const OB = {Plugin:class{},ItemView:class{},PluginSettingTab:class{},Modal:class{},FuzzySuggestModal:class{},getLanguage:()=> 'zh'};
const ctx = {require:(id)=>id==='obsidian'?OB:require(id),module:{exports:{}},console,process,Buffer,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(source,'utf8'), ctx, {filename:source});
const Plugin = ctx.module.exports;
const p = Object.create(Plugin.prototype);
const {DEFAULTS,parseJournal} = Plugin.core;
p.settings = {...DEFAULTS,doingLimit:0};
p.todayFile = () => ({path:'today.md'});
p.autoKeys = () => new Set();
p.touch = () => {};
p.goalCheck = () => {};
p.aiWork = () => () => false;
p.editTasks = () => {throw Error('Writing a break must not change task state');};
for(const key of ['startBreak','askBack','tgBreakStart','tgBreakEnd','suggestFocus']) assert.equal(typeof p[key],'undefined');
assert.equal('breakWords' in DEFAULTS,false);
(async()=>{
 for(const word of ['吃饭','锻炼']) {
  const content=`- DOING 写稿 30分钟\n- ${word}`;
  await p.enforce({path:'today.md',basename:'today'},content,new Map([['写稿',{doing:true}]]));
  assert.ok(parseJournal(content,p.settings).some(t=>t.doing));
  assert.equal(p.settings.breakState,undefined);
 }
 console.log('PASS removed break/focus entry points; eating and exercise leave DOING tasks unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;});
