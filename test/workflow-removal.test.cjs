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
for(const key of [
  'startBreak','askBack','tgBreakStart','tgBreakEnd','suggestFocus','projects','recomputeProjects','scheduleProjects','progPoll','lineProgressExtension','agentAlert','permScan','queueScan','agentScan','bindSession',
  'session','startTask','startAtCursor','startNext','begin','startSession','extendRaycast','tickFocus','watchRaycast','probe','askLine','askDone','finish','endSession','dropFromSession'
]) assert.equal(typeof p[key],'undefined', key + ' must be removed');
const removedSettings = ['autoLog', 'agentKw', 'autoLogArchiveDone', 'resultBack', 'lineProgress', 'agentAlert', 'focus', 'focusMinutes', 'focusCategories', 'focusMode', 'focusAutoComplete', 'focusAsk', 'focusSession'];
for (const key of removedSettings) assert.equal(key in DEFAULTS, false, key + ' is no longer a Spiral setting');
assert.equal('focusMinutes' in Plugin.core, false, 'focusMinutes helper must be removed');
assert.equal(/raycast:\/\//i.test(fs.readFileSync(source, 'utf8')), false, 'no raycast:// deeplinks remain');
assert.equal('breakWords' in DEFAULTS,false);
assert.equal('showProjects' in DEFAULTS,false);
(async()=>{
 const legacy = Object.create(Plugin.prototype);
 legacy.loadData = async () => ({autoLog:true, agentKw:true, autoLogArchiveDone:true, resultBack:true, lineProgress:true, agentAlert:true, focus:true, focusMinutes:25, focusCategories:'social', focusMode:'block', focusAutoComplete:true, focusAsk:true, focusSession:{start:1,items:[]}, showAi:true});
 let saved;
 legacy.saveData = async data => { saved = {...data}; };
 const stop = new Error('settings loaded');
 legacy.applyColors = () => { throw stop; };
 await assert.rejects(() => legacy.onload(), error => error === stop);
 for (const key of removedSettings) assert.equal(key in legacy.settings, false, 'legacy ' + key + ' is discarded');
 for (const key of removedSettings) assert.equal(key in saved, false, 'removed setting ' + key + ' is not persisted');
 assert.equal(legacy.settings.showAi, true, 'read-only AI display is preserved');
 for(const word of ['吃饭','锻炼']) {
  const content=`- DOING 写稿 30分钟\n- ${word}`;
  await p.enforce({path:'today.md',basename:'today'},content,new Map([['写稿',{doing:true}]]));
  assert.ok(parseJournal(content,p.settings).some(t=>t.doing));
  assert.equal(p.settings.breakState,undefined);
 }
 console.log('PASS removed break/focus entry points; eating and exercise leave DOING tasks unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;});
