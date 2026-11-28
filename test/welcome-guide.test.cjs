const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = process.argv[2] || path.join(__dirname, '..', 'main.js');
const code = fs.readFileSync(source, 'utf8');

function makeMoment(input, fmt) {
  let d;
  if (typeof input === 'string') {
    const m = /^(\d{4})[-_](\d{2})[-_](\d{2})$/.exec(input);
    d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : new Date(input);
  } else {
    d = input ? new Date(input) : new Date(2026, 10, 28, 15, 0, 0);
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const api = {
    format(f = 'YYYY_MM_DD') {
      if (f === 'HH:mm') return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      if (f === 'YYYY-MM-DD') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      return `${d.getFullYear()}_${pad2(d.getMonth() + 1)}_${pad2(d.getDate())}`;
    },
    hours: () => d.getHours(),
    minutes: () => d.getMinutes(),
    isValid: () => !Number.isNaN(d.getTime()),
    subtract(n) { return makeMoment(new Date(d.getTime() - n * 86400000), fmt); },
    startOf() { return makeMoment(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0), fmt); },
    diff(other) {
      const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const b = new Date(other.year ? other.year() : d.getFullYear(), other.month ? other.month() : d.getMonth(), other.date ? other.date() : d.getDate());
      return Math.round((a - b) / 86400000);
    },
    year: () => d.getFullYear(),
    month: () => d.getMonth(),
    date: () => d.getDate(),
  };
  return api;
}

function loadPluginHarness({ lang = 'zh' } = {}) {
  const scheduledTimeouts = [];
  const TFile = class TFile {
    constructor(filePath) {
      this.path = filePath;
      this.basename = path.basename(filePath, '.md');
      this.extension = path.extname(filePath).slice(1);
      this.stat = { mtime: Date.now() };
    }
  };
  const OB = {
    Plugin: class Plugin {
      constructor() {
        this.manifest = { id: 'nautilus-spiral', version: '2.6.19', dir: '.obsidian/plugins/nautilus-spiral' };
        this.commands = [];
      }
      addCommand(cmd) { this.commands.push(cmd); return cmd; }
      registerView() {}
      registerMarkdownCodeBlockProcessor() {}
      addRibbonIcon() {}
      registerInterval() {}
      registerObsidianProtocolHandler() {}
      addSettingTab() {}
      registerEvent() {}
      registerEditorExtension() {}
      registerMarkdownPostProcessor() {}
      register() {}
    },
    ItemView: class {},
    PluginSettingTab: class {},
    Modal: class { constructor() { this.modalEl = {}; this.contentEl = {}; } open() {} close() {} },
    FuzzySuggestModal: class {},
    MarkdownView: class {},
    MarkdownRenderChild: class {},
    setIcon: () => {},
    Notice: class {},
    TFile,
    Platform: { isMacOS: true, isDesktopApp: true },
    getLanguage: () => lang,
    moment: (input, fmt) => makeMoment(input, fmt),
    debounce: (fn) => { const f = (...args) => fn(...args); f.cancel = () => {}; return f; },
  };
  const doc = { body: { style: { setProperty() {}, removeProperty() {} }, querySelectorAll: () => [] } };
  const ctx = {
    require: (id) => {
      if (id === 'obsidian') return OB;
      if (id === '@codemirror/view') return { EditorView: { updateListener: { of: () => ({}) } }, ViewPlugin: { fromClass: () => ({}) }, Decoration: {}, WidgetType: class {} };
      if (id === '@codemirror/state') return { RangeSetBuilder: class {} };
      return require(id);
    },
    module: { exports: {} },
    console,
    process,
    Buffer,
    Date,
    window: {
      document: doc,
      MutationObserver: class { observe() {} disconnect() {} },
      setTimeout: (fn, ms) => { scheduledTimeouts.push({ fn, ms }); return scheduledTimeouts.length; },
      clearTimeout: () => {},
      setInterval: () => 1,
      clearInterval: () => {},
    },
    document: doc,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(code, ctx, { filename: source });
  return { Plugin: ctx.module.exports, TFile, scheduledTimeouts };
}

function makeFakeApp({ TFile, initialFiles = {} } = {}) {
  const files = new Map();
  const folders = new Set();
  for (const [p, content] of Object.entries(initialFiles)) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    if (dir) folders.add(dir);
    files.set(p, { file: new TFile(p), content });
  }
  const leaves = [];
  let activeLeaf = null;
  let promptCalls = 0;
  const app = {
    internalPlugins: { getPluginById: () => null },
    plugins: { plugins: {} },
    vault: {
      adapter: { readBinary: async () => new ArrayBuffer(0) },
      getAbstractFileByPath(p) {
        if (files.has(p)) return files.get(p).file;
        if (folders.has(p)) return { path: p };
        return null;
      },
      async createFolder(dir) {
        folders.add(dir);
      },
      async create(p, content) {
        const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
        if (dir) folders.add(dir);
        const f = new TFile(p);
        files.set(p, { file: f, content });
        return f;
      },
      async read(f) {
        return files.get(f.path)?.content ?? '';
      },
      async cachedRead(f) {
        return files.get(f.path)?.content ?? '';
      },
      async modify(f, next) {
        const entry = files.get(f.path);
        if (!entry) throw new Error(`Missing file: ${f.path}`);
        entry.content = next;
      },
      on: () => ({}),
      getMarkdownFiles: () => [...files.values()].map((e) => e.file),
    },
    workspace: {
      leftSplit: { collapsed: false, expand() {} },
      rootSplit: {},
      onLayoutReady(cb) { app._layoutReadyCallbacks.push(cb); },
      on: () => ({}),
      iterateAllLeaves(cb) { leaves.forEach(cb); },
      iterateRootLeaves(cb) { leaves.forEach(cb); },
      getLeavesOfType: () => [],
      getLeftLeaf: () => ({ setViewState: async () => {}, getRoot: () => app.workspace.leftSplit }),
      getMostRecentLeaf: () => leaves[0] || null,
      getLeaf(mode) {
        const leaf = {
          mode,
          view: null,
          stateHistory: [],
          getViewState() { return { type: 'markdown', pinned: false, state: leaf._state || {} }; },
          async setViewState(vs) { leaf._state = vs.state; leaf.stateHistory.push(vs); },
          async openFile(file, opts) {
            leaf.view = { file };
            leaf._state = opts?.state || {};
            leaf.openedWith = { path: file.path, opts };
          },
        };
        leaves.push(leaf);
        return leaf;
      },
      revealLeaf(leaf) { activeLeaf = leaf; },
      setActiveLeaf(leaf) { activeLeaf = leaf; },
    },
    _layoutReadyCallbacks: [],
    _files: files,
    _folders: folders,
    _leaves: leaves,
    _getActiveLeaf: () => activeLeaf,
    _incPrompt: () => { promptCalls += 1; },
    _getPromptCalls: () => promptCalls,
  };
  return app;
}

(async () => {
  const { Plugin } = loadPluginHarness({ lang: 'zh' });
  const C = Plugin.core;

  // 1. Version helpers & auto-trigger rules
  assert.deepEqual([...C.parseVersionTuple('2.6.19')], [2, 6, 19]);
  assert.deepEqual([...C.parseVersionTuple('v2.6')], [2, 6, 0]);
  assert.equal(C.parseVersionTuple(''), null);
  assert.equal(C.compareVersionTuple('2.6.19', '2.6.18'), 1);
  assert.equal(C.compareVersionTuple('2.6.19', '2.6.19'), 0);
  assert.equal(C.compareVersionTuple('2.6.18', '2.6.19'), -1);

  assert.equal(C.shouldAutoOpenWelcomeGuide('2.6.19', ''), true, 'fresh install triggers once');
  assert.equal(C.shouldAutoOpenWelcomeGuide('2.6.19', undefined), true, 'missing seen version triggers once');
  assert.equal(C.shouldAutoOpenWelcomeGuide('2.6.19', '2.6.18'), true, 'upgrading from <=2.6.18 triggers once');
  assert.equal(C.shouldAutoOpenWelcomeGuide('2.6.19', '2.6.19'), false, 'same version does not re-trigger');
  assert.equal(C.shouldAutoOpenWelcomeGuide('2.6.20', '2.6.19'), false, 'patch upgrade >= floor does not re-trigger without floor bump');
  assert.equal(C.shouldAutoOpenWelcomeGuide('2.7.0', '2.6.19', { floor: '2.7.0' }), true, 'future floor bump triggers again');

  // 2. Bilingual content, ordering, safety invariants, and journal isolation
  const mdZh = C.buildWelcomeGuideMarkdown({ zh: true, version: '2.6.19' });
  const mdEn = C.buildWelcomeGuideMarkdown({ zh: false, version: '2.6.19' });

  for (const [label, md] of [['zh', mdZh], ['en', mdEn]]) {
    assert.ok(md.includes('## 中文指南'), `${label}: includes Chinese section`);
    assert.ok(md.includes('## English Guide'), `${label}: includes English section`);
    assert.ok(md.includes('Agent Deck'), `${label}: covers Agent Deck pairing`);
    assert.ok(md.includes('nautilus-spiral'), `${label}: covers embedded daily spiral`);
    assert.ok(md.includes('打开螺旋日程示例与使用指南') && md.includes('Open Nautilus Spiral guide & example note'), `${label}: mentions Command Palette reopen`);
    assert.ok(md.includes('![[示例项目笔记#^demo-mirror-task]]') && md.includes('![[Example Project Note#^demo-mirror-task]]'), `${label}: includes mirror task examples`);
    assert.deepEqual([...C.openTasks(md)], [], `${label}: sample tasks must stay inside code fences so widgets/TODOseq ignore them`);

    // Ensure no unescaped ```nautilus-spiral block outside 4-backtick wrappers
    let inQuadFence = false;
    md.split('\n').forEach((line, idx) => {
      if (/^````/.test(line)) { inQuadFence = !inQuadFence; return; }
      if (!inQuadFence) {
        assert.equal(/^```\s*nautilus-spiral\b/.test(line), false, `${label}: line ${idx + 1} must not have unescaped nautilus-spiral fence`);
      }
    });
  }
  assert.ok(mdZh.indexOf('## 中文指南') < mdZh.indexOf('## English Guide'), 'zh UI puts Chinese guide first');
  assert.ok(mdEn.indexOf('## English Guide') < mdEn.indexOf('## 中文指南'), 'en UI puts English guide first');

  // Guide path must never fall inside default daily note folders or match date filenames
  assert.equal(C.WELCOME_GUIDE_PATH.startsWith('日记/'), false);
  assert.equal(C.WELCOME_GUIDE_PATH.startsWith('Journal/'), false);
  assert.equal(C.formatRegex('YYYY_MM_DD').test(path.basename(C.WELCOME_GUIDE_PATH, '.md')), false);

  // 3. Upgrade path simulation (existing user on <=2.6.18 -> 2.6.19)
  {
    const { Plugin: P, TFile, scheduledTimeouts } = loadPluginHarness({ lang: 'zh' });
    const saved = [];
    const todayNote = '日记/2026_11_28.md';
    const app = makeFakeApp({ TFile, initialFiles: { [todayNote]: '- TODO 测试\n' } });
    const plugin = new P();
    plugin.app = app;
    let persisted = { autoOpened: true, folder: '日记', format: 'YYYY_MM_DD', openTodayOnStartup: true, revealOnStartup: true };
    plugin.loadData = async () => ({ ...persisted });
    plugin.saveData = async (next) => { persisted = JSON.parse(JSON.stringify(next)); saved.push(persisted.welcomeGuideVersion); };
    const activated = [];
    plugin.activate = async (focus, forceLeft) => { activated.push([focus, forceLeft]); return null; };
    plugin.setupStatusBar = () => {};
    plugin.setupWidgetInbox = () => {};
    plugin.pollGames = () => {};
    plugin.tickPomodoro = () => {};
    plugin.applyColors = () => {};

    await plugin.onload();
    for (const cb of app._layoutReadyCallbacks) await cb();
    const startupTimer = scheduledTimeouts.find((t) => t.ms === 600);
    assert.ok(startupTimer, '600ms startup timer registered');
    await startupTimer.fn();

    assert.ok(app._files.has(C.WELCOME_GUIDE_PATH), 'upgrade path creates bilingual guide note');
    assert.equal(persisted.welcomeGuideVersion, '2.6.19', 'persists welcomeGuideVersion after upgrade auto-open');
    const openedGuideLeaf = app._leaves.find((l) => l.view?.file?.path === C.WELCOME_GUIDE_PATH);
    assert.ok(openedGuideLeaf, 'upgrade path opens guide note in a tab');
    assert.deepEqual({ ...openedGuideLeaf._state }, { mode: 'source', source: false }, 'opens in Live Preview');
    assert.ok(app._leaves.some((l) => l.view?.file?.path === todayNote), 'still opens today note when available');
    assert.ok(activated.some(([focus, forceLeft]) => focus === false && forceLeft === true), 'reveals left sidebar without stealing focus');

    // Second startup must NOT reopen or overwrite user edits
    await app.vault.modify(app._files.get(C.WELCOME_GUIDE_PATH).file, 'USER EDITED GUIDE\n');
    const leafCountBefore = app._leaves.length;
    await startupTimer.fn();
    assert.equal(app._leaves.length, leafCountBefore, 'second startup does not reopen guide');
    assert.equal(app._files.get(C.WELCOME_GUIDE_PATH).content, 'USER EDITED GUIDE\n', 'second startup preserves user edits');

    // Manual Command Palette reopen preserves existing edits on same version and brings leaf forward
    const cmd = plugin.commands.find((c) => c.id === 'open-guide');
    assert.ok(cmd, 'open-guide command registered');
    await cmd.callback();
    assert.equal(app._files.get(C.WELCOME_GUIDE_PATH).content, 'USER EDITED GUIDE\n', 'manual reopen preserves existing edits on same version');
    assert.equal(app._getActiveLeaf(), openedGuideLeaf, 'manual reopen focuses existing guide tab');

    // Deleting the file and running manual command recreates it
    app._files.delete(C.WELCOME_GUIDE_PATH);
    await cmd.callback();
    assert.ok(app._files.has(C.WELCOME_GUIDE_PATH), 'manual reopen recreates deleted guide file');
    assert.ok(app._files.get(C.WELCOME_GUIDE_PATH).content.includes('## 中文指南'));

    // Version bump refreshes existing guide file
    app._files.get(C.WELCOME_GUIDE_PATH).content = 'OLD VERSION CONTENT';
    plugin.settings.welcomeGuideVersion = '2.6.18';
    await cmd.callback();
    assert.ok(app._files.get(C.WELCOME_GUIDE_PATH).content.includes('## 中文指南'), 'version upgrade refreshes guide content');
    assert.equal(persisted.welcomeGuideVersion, '2.6.19');
  }

  // 4. Fresh-install simulation (no data.json, no today note, unconfigured policy)
  {
    const { Plugin: P, TFile, scheduledTimeouts } = loadPluginHarness({ lang: 'en' });
    const app = makeFakeApp({ TFile });
    const plugin = new P();
    plugin.app = app;
    let persisted = null;
    plugin.loadData = async () => persisted;
    plugin.saveData = async (next) => { persisted = JSON.parse(JSON.stringify(next)); };
    plugin.activate = async () => null;
    plugin.setupStatusBar = () => {};
    plugin.setupWidgetInbox = () => {};
    plugin.pollGames = () => {};
    plugin.tickPomodoro = () => {};
    plugin.applyColors = () => {};
    plugin.promptJournalPolicyIfNeeded = async () => { app._incPrompt(); return { saved: false }; };

    await plugin.onload();
    for (const cb of app._layoutReadyCallbacks) await cb();
    const startupTimer = scheduledTimeouts.find((t) => t.ms === 600);
    await startupTimer.fn();

    assert.equal(persisted.autoOpened, true, 'fresh install marks autoOpened');
    assert.equal(persisted.welcomeGuideVersion, '2.6.19', 'fresh install persists welcomeGuideVersion');
    assert.equal(app._getPromptCalls(), 0, 'fresh install opens bilingual guide without blocking on missing-daily-note modal');
    const guideEntry = app._files.get(C.WELCOME_GUIDE_PATH);
    assert.ok(guideEntry, 'fresh install creates bilingual guide note');
    assert.ok(guideEntry.content.indexOf('## English Guide') < guideEntry.content.indexOf('## 中文指南'), 'English UI writes English section first');
  }

  const { Plugin: P, TFile } = loadPluginHarness({ lang: 'zh' });
  const isStrippedPublic = !/\bREVIEW_RE\b/.test(code);

  // 5. Public defaults, Discord webhook validation/sending, and game polling guards
  {
    assert.equal(C.isValidDiscordWebhook('https://discord.com/api/webhooks/1234567890/abc_DEF-123'), true);
    assert.equal(C.isValidDiscordWebhook('https://canary.discord.com/api/webhooks/123/token?wait=true'), true);
    assert.equal(C.isValidDiscordWebhook('https://example.com/api/webhooks/123/token'), false);
    assert.equal(C.isValidDiscordWebhook(''), false);

    assert.equal(C.DEFAULTS.trackGames, false, 'gaming time tracking is opt-in by default');
    assert.equal(C.DEFAULTS.gameProcs.includes('Hearthstone'), false, 'no personal game defaults');
    assert.equal(C.DEFAULTS.widgetPlan.includes('上班计划'), false, 'neutral default plan note');

    if (isStrippedPublic) {
      assert.equal('discordChannel' in C.DEFAULTS, false, 'local notify-discord setting stripped in public');
      assert.equal('askVia' in C.DEFAULTS, false, 'experimental Swift notify setting stripped in public');
      const pSeed = Object.create(P.prototype);
      const seed = pSeed.journalSeed(makeMoment('2026-11-28'));
      assert.equal(seed, '---\ndate: 2026-11-28\n---\n', 'public journalSeed uses universal date frontmatter');
    }

    const pWebhook = Object.create(P.prototype);
    pWebhook.settings = { ...C.DEFAULTS };
    const secrets = new Map([['nautilus-spiral-discord-webhook', 'https://discord.com/api/webhooks/999/secretToken']]);
    pWebhook.app = { secretStorage: { getSecret: (k) => secrets.get(k) || '', setSecret: (k, v) => secrets.set(k, v), deleteSecret: (k) => secrets.delete(k) } };
    const posted = [];
    // Patch OB.requestUrl via fresh VM context with requestUrl support
    const obHook = {
      Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, FuzzySuggestModal: class {},
      TFile, getLanguage: () => 'zh', moment: (i, f) => makeMoment(i, f),
      Platform: { isMacOS: false, isDesktopApp: true },
      requestUrl: async (req) => { posted.push(req); return { status: 204 }; },
    };
    const ctx2 = { require: (id) => (id === 'obsidian' ? obHook : require(id)), module: { exports: {} }, console, process, Buffer, Date, setTimeout, clearTimeout };
    vm.runInNewContext(code, ctx2, { filename: source });
    const P2 = ctx2.module.exports;
    const inst = Object.create(P2.prototype);
    inst.settings = { ...P2.core.DEFAULTS };
    inst.app = { secretStorage: pWebhook.app.secretStorage };
    const ok = await inst.toDiscord('Test reminder');
    assert.equal(ok, true, 'toDiscord posts via Discord Webhook');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].method, 'POST');
    assert.equal(posted[0].url, 'https://discord.com/api/webhooks/999/secretToken');
    assert.equal(JSON.parse(posted[0].body).content, 'Test reminder');

    // Non-macOS / trackGames=false pollGames must be a safe no-op
    inst.settings.trackGames = false;
    await inst.pollGames();
    inst.settings.trackGames = true;
    await inst.pollGames(); // isMacOS is false in obHook
  }

  console.log('PASS welcome-guide: version rules, bilingual content, code-block safety, upgrade & fresh-install triggers, manual reopen, and clean public defaults');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
