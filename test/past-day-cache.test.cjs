const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const VAULT_MAIN = '/Users/chenchen/Library/Mobile Documents/iCloud~md~obsidian/Documents/马自立/.obsidian/plugins/nautilus-spiral/main.js';
const source = process.argv[2] || (fs.existsSync(VAULT_MAIN) ? VAULT_MAIN : path.join(__dirname, '..', 'main.js'));

function makeMoment(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0);
  const api = {
    format(fmt) {
      const yy = String(base.getFullYear());
      const mm = String(base.getMonth() + 1).padStart(2, '0');
      const dd = String(base.getDate()).padStart(2, '0');
      if (fmt === 'YYYY-MM-DD') return `${yy}-${mm}-${dd}`;
      if (fmt === 'YYYY_MM_DD') return `${yy}_${mm}_${dd}`;
      return `${yy}-${mm}-${dd}`;
    },
    clone() { return makeMoment(api.format('YYYY-MM-DD')); },
    add(n) {
      const next = new Date(base.getTime() + n * 86400000);
      const yy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, '0');
      const dd = String(next.getDate()).padStart(2, '0');
      return makeMoment(`${yy}-${mm}-${dd}`);
    },
    hours() { return 12; },
    minutes() { return 0; },
    isValid() { return true; },
  };
  return api;
}

const OB = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Modal: class {},
  FuzzySuggestModal: class {},
  TFile: class TFile { constructor(p) { this.path = p; } },
  Notice: class {},
  Platform: { isDesktopApp: true, isMacOS: true },
  getLanguage: () => 'zh',
  moment: (input) => makeMoment(input || '2026-11-22'),
};

const ctx = {
  require: (id) => (id === 'obsidian' ? OB : require(id)),
  module: { exports: {} },
  console,
  process,
  Buffer,
  setTimeout,
  clearTimeout,
  window: { setTimeout, clearTimeout, setInterval, clearInterval },
};
vm.createContext(ctx);
const code = fs.readFileSync(source, 'utf8') + '\nmodule.exports.__test = { isPastDate, pastDayComputeSig, pastDayRenderSig, SpiralPlugin: module.exports, SpiralView };';
vm.runInContext(code, ctx, { filename: source });

const { isPastDate, pastDayComputeSig, pastDayRenderSig, SpiralPlugin } = ctx.module.exports.__test;

(async () => {
  // 1. isPastDate boundary
  const today = makeMoment('2026-11-22');
  assert.equal(isPastDate(makeMoment('2026-11-21'), today), true);
  assert.equal(isPastDate(makeMoment('2026-11-22'), today), false);
  assert.equal(isPastDate(makeMoment('2026-11-23'), today), false);

  // 2. Fingerprints invalidate on content / bounds / calendar / aiDay changes
  const baseCfg = {
    dayStart: 8, dayEnd: 24, dayCutoff: 4, defaultDur: 30,
    showMain: true, showAi: true, trackGames: true, showUnrecorded: true,
    dayBounds: {}, doneTimes: {}, workLog: {},
  };
  const c1 = pastDayComputeSig({ dayKey: '2026_11_21', content: '- DONE 写代码', cfg: baseCfg, cal: null });
  const c2 = pastDayComputeSig({ dayKey: '2026_11_21', content: '- DONE 写代码', cfg: baseCfg, cal: null });
  const c3 = pastDayComputeSig({ dayKey: '2026_11_21', content: '- DONE 写代码并补测', cfg: baseCfg, cal: null });
  assert.equal(c1, c2);
  assert.notEqual(c1, c3);

  const r1 = pastDayRenderSig({ computeSig: c1, cfg: baseCfg, aiDay: { wall: 10, out: 100, fresh: 200, cached: 50, calls: 2, sessions: 1 }, gameDay: null, deckCount: 1 });
  const r2 = pastDayRenderSig({ computeSig: c1, cfg: baseCfg, aiDay: { wall: 20, out: 100, fresh: 200, cached: 50, calls: 2, sessions: 1 }, gameDay: null, deckCount: 1 });
  assert.notEqual(r1, r2);

  // 3. calendarFor: past day cached without error does NOT reload after 120s; today DOES; errored past day DOES
  let calLoads = [];
  const p = Object.create(SpiralPlugin.prototype);
  p.settings = { calendar: true, googleCal: false };
  p.gcal = { connected: () => false };
  p.today = () => makeMoment('2026-11-22');
  p.cal = { cache: new Map(), busy: new Set() };
  p.loadCalendar = (_date, key) => calLoads.push(key);

  const oldTs = Date.now() - 600_000;
  p.cal.cache.set('2026-11-21', { at: oldTs, items: [], allDay: [] });
  p.calendarFor(makeMoment('2026-11-21'));
  assert.deepEqual(calLoads, [], 'past day valid calendar cache should not reload after 120s');

  p.cal.cache.set('2026-11-20', { at: oldTs, items: [], allDay: [], error: 'timeout' });
  p.calendarFor(makeMoment('2026-11-20'));
  assert.deepEqual(calLoads, ['2026-11-20'], 'past day errored calendar cache should retry');

  p.cal.cache.set('2026-11-22', { at: oldTs, items: [], allDay: [] });
  p.calendarFor(makeMoment('2026-11-22'));
  assert.deepEqual(calLoads, ['2026-11-20', '2026-11-22'], 'today calendar cache should refresh after 120s');

  // 4. aiUsage({ skipScan: true }) does not trigger scanAi for past days
  let scanCalls = 0;
  p.aiStore = { days: { '2026_11_21': { wall: 15 } } };
  p._aiAt = 0;
  p._aiBusy = false;
  p.scanAi = () => { scanCalls++; };
  p.aiCalendar = () => '4|YYYY_MM_DD';
  await p.aiUsage({ skipScan: true });
  assert.equal(scanCalls, 0, 'past day aiUsage({ skipScan: true }) should not trigger scanAi');
  await p.aiUsage();
  assert.equal(scanCalls, 1, 'today aiUsage() should trigger scanAi when stale');

  console.log('PASS 历史日期缓存（指纹、日历长缓存、跳过后台 AI 重扫）验证通过');
})();
