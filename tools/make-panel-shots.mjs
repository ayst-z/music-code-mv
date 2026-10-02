#!/usr/bin/env node
/**
 * 生成**控制面板**的真实截图 / capture the real control panel.
 *
 *   node tools/make-panel-shots.mjs
 *
 * 做法：不截图 DSH 外壳（GUI 需要登录），而是用一个迷你 React 运行时在本地页面里
 * 挂载**真实的 lib/client.js 组件**（连样式都由真实代码 ensureEntryStyle() 注入），
 * 点开 codeMV 弹层后截图 —— 因此图里的结构、文案、CSS 全部来自仓库里的真实源码。
 *
 * 状态数据用的是**写死的样例**（工作区路径掩码为 <workspace>，无任务），
 * 这是组件渲染图，不是运行中 GUI 的抓图；caption 必须如实说明。
 *
 * Screenshotting the real popup without the DSH shell: mount the actual component
 * with a minimal React runtime, let the real code inject its own CSS, then shoot.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..', '..');
const IMG = path.join(REPO, 'skills', 'music-code-mv', 'reference', 'img');

const CLIENT_JS = fs.readFileSync(path.join(PLUGIN, 'lib', 'client.js'), 'utf8');
const FONT = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';

/** 样例状态：路径掩码、无渲染任务 —— 组件渲染图不冒充实时数据。 */
const STATE = {
  ok: true, root: '<workspace>', url: 'http://127.0.0.1:19387/music-mv/studio',
  job: null, env: {}, envAt: Date.now(),
  projects: [
    { name: 'feature-demo', path: 'feature-demo', width: 3840, height: 2160, fps: 120, duration: 76, scenes: 6, frames: 9120, contact: { path: 'feature-demo/out/contact.png' } },
    { name: 'showcase-3d', path: 'showcase-3d', width: 1280, height: 720, fps: 30, duration: 31, scenes: 6, frames: 930, contact: null },
    { name: 'demo15', path: 'demo15', width: 1920, height: 1080, fps: 60, duration: 15, scenes: 5, frames: 900, contact: null }
  ]
};
const TIERS = [
  { id: 'draft', title: '草稿 480×270' }, { id: 'standard', title: '标准 1280×720' },
  { id: 'high', title: '高清 1920×1080' }, { id: 'vertical', title: '竖版 1080×1920' },
  { id: 'uhd', title: '4K 3840×2160' }
];
const PRESET_IDS = ['claude', 'deepseek', 'doubao', 'dusk-lofi', 'gemini', 'gpt', 'grok', 'ink-paper',
  'kimi', 'llama', 'midjourney', 'mistral', 'neon-rain', 'phosphor', 'qwen', 'zhipu', 'fairy'];
// 配色取自 skills/.../presets/*.json（真实数据，用于画廊色块）
const paletteOf = (id) => {
  const p = JSON.parse(fs.readFileSync(path.join(REPO, 'skills', 'music-code-mv', 'presets', id + '.json'), 'utf8'));
  return p.palette;
};
const PRESETS = PRESET_IDS.map((id) => {
  const p = JSON.parse(fs.readFileSync(path.join(REPO, 'skills', 'music-code-mv', 'presets', id + '.json'), 'utf8'));
  return { id, title: p.title || id, summary: (p.summary || '').slice(0, 90), duration: p.duration || 20, palette: p.palette, shots: (p.storyboard && p.storyboard.shots || []).length };
});

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>codeMV panel shot</title>
<style>
  html,body{margin:0;padding:0;height:100%;}
  body{background:${'#16171b'};color:#e6e9ee;font:13px/1.5 ${FONT};
       display:flex;flex-direction:column;}
  .fakebar{height:44px;display:flex;align-items:center;gap:10px;padding:0 14px;
       border-bottom:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.03);}
  .fakebar .dot{width:9px;height:9px;border-radius:50%;background:#4176e6;}
  .fakebar .txt{color:#9aa3ad;font-size:12px;}
  .fakebar .grow{flex:1}
  .stage{flex:1;padding:22px 26px;overflow:hidden;}
  .ph{color:#7b8391;font-size:13px;letter-spacing:.04em;}
  #slot{position:relative;}
</style>
<script>
  window.__MM_STATE__ = __STATE__;
  window.__MM_PRESETS__ = __PRESETS__;
  window.__MM_TIERS__ = __TIERS__;
  // 样例数据：state 路径已掩码；presets/tiers 来自真实文件
  window.fetch = function (url) {
    var u = String(url);
    if (u.indexOf('/music-mv/api/state') >= 0)
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(window.__MM_STATE__); } });
    if (u.indexOf('/music-mv/api/presets') >= 0)
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true, presets: window.__MM_PRESETS__, tiers: window.__MM_TIERS__ }); } });
    return Promise.resolve({ ok: false, json: function () { return Promise.reject(new Error('mock')); } });
  };
  // ---- 迷你 React 运行时（组件只用 createElement/useState/useEffect/useRef）----
  var store = new Map(), fx = new Set(), cur = { key: '', idx: 0 };
  window.React = {
    Fragment: 'Fragment',
    createElement: function (type, props) {
      var kids = Array.prototype.slice.call(arguments, 2);
      var p = {};
      Object.keys(props || {}).forEach(function (k) { p[k] = props[k]; });
      // React 约定：children 既在 argv 里、也挂在 props.children 上
      if (kids.length === 1) p.children = kids[0];
      else if (kids.length > 1) p.children = kids;
      return { type: type, props: p, kids: kids };
    },
    useState: function (init) {
      var k = cur.key + '#' + cur.idx++;
      if (!store.has(k)) store.set(k, typeof init === 'function' ? init() : init);
      return [store.get(k), function (v) {
        store.set(k, typeof v === 'function' ? v(store.get(k)) : v);
        window.__MM_RENDER__();
      }];
    },
    useEffect: function (fn) {
      var k = cur.key + '#fx' + cur.idx++;
      if (!fx.has(k)) { fx.add(k); Promise.resolve().then(function () { try { fn(); } catch (e) { console.error(e); } }); }
    },
    useRef: function (v) {
      var k = cur.key + '#ref' + cur.idx++;
      if (!store.has(k)) store.set(k, { current: v });
      return store.get(k);
    }
  };
  window.__ModuleLoader__ = { load: function (reg) { window.__MM_REG__ = reg; } };
</script>
<script src="./client.js"></script>
</head><body>
  <div class="fakebar"><span class="dot"></span><span class="txt">对话 / Conversation</span><span class="grow"></span></div>
  <div class="stage">
    <div class="ph">— 以下是真实源码渲染出来的 codeMV 控制面板 —</div>
    <div id="slot"></div>
  </div>
<script>
  // 挂载真实组件
  var DICT = { zh: {}, en: {} };
  var slots = [];
  var ctx = {
    effect: function (fn) { var d = fn(); return typeof d === 'function' ? d : function () {}; },
    locale: {
      bind: function (ns) { return function (k) { return (DICT.zh[k] !== undefined ? DICT.zh[k] : k); }; },
      register: function (ns, dict) { DICT = dict; return function () {}; }
    },
    sidebarRightTabs: { register: function () { return function () {}; }, get: function () { return undefined; } },
    sidebarRight: { openTab: function () {} },
    slots: {
      inject: function (name, cb) { return cb(); },
      register: function (spec, comp) { slots.push({ spec: spec, comp: comp }); return function () {}; }
    },
    get: function () { return null; }
  };
  var mod = (function () {
    var reg = window.__MM_REG__;
    if (!reg) throw new Error('client.js did not register — __ModuleLoader__ shim missing?');
    return reg.factory(function (name) {
      if (name === 'react') return window.React;
      throw new Error('unexpected require: ' + name);
    });
  })();
  if (typeof mod.apply !== 'function') throw new Error('client.js exports no apply()');
  mod.apply(ctx);                                   // 注册字典 + 对话视图环标签页
  // 标题栏小按钮已按用户指示移除；唯一操作面是对话视图环里的标签页
  var entry = slots.filter(function (s) { return s.spec.name === 'conversation.view'; })[0];
  if (!entry) throw new Error('conversation.view slot not registered — client.js changed?');
  var injected = typeof entry.spec.inject === 'function' ? (entry.spec.inject() || {}) : {};

  function mount(vnode, key, parent) {
    if (vnode === null || vnode === undefined || vnode === false || vnode === '') return null;
    // 文本子节点：React 的 children 大多是字符串，不处理就一个字都渲染不出来
    if (typeof vnode === 'string' || typeof vnode === 'number') {
      parent.appendChild(document.createTextNode(String(vnode)));
      return null;
    }
    if (Array.isArray(vnode)) { vnode.forEach(function (k, i) { mount(k, key + ':' + i, parent); }); return null; }
    if (typeof vnode.type === 'function') {
      var save = { key: cur.key, idx: cur.idx };
      cur.key = key + ':' + (vnode.type.name || 'anon'); cur.idx = 0;
      var out;
      try { out = vnode.type(vnode.props); } finally { cur.key = save.key; cur.idx = save.idx; }
      return mount(out, key + '/c', parent);
    }
    if (vnode.type === window.React.Fragment || vnode.type === 'Fragment') {
      vnode.kids.forEach(function (k, i) { mount(k, key + '#f' + i, parent); });
      return null;
    }
    var el = document.createElement(vnode.type);
    var props = vnode.props || {};
    Object.keys(props).forEach(function (p) {
      var v = props[p];
      if (v === null || v === undefined || v === false) return;
      if (p === 'children' || p === 'key') return;
      if (/^on[A-Z]/.test(p)) { el[p.toLowerCase()] = v; return; }
      if (p === 'className') { el.setAttribute('class', v); return; }
      if (p === 'style' && typeof v === 'object') { Object.assign(el.style, v); return; }
      if (typeof v === 'function') { el[p.toLowerCase()] = v; return; }
      el.setAttribute(p === 'htmlFor' ? 'for' : p, v === true ? '' : String(v));
    });
    (function append(kids, pref) {
      (kids || []).forEach(function (k, i) { mount(k, pref + ':' + i, el); });
    })(vnode.kids, key);
    parent.appendChild(el);
    return el;
  }

  window.__MM_RENDER__ = function () {
    var slot = document.getElementById('slot');
    slot.innerHTML = '';
    var save = { key: cur.key, idx: cur.idx };
    cur.key = 'root'; cur.idx = 0;
    try {
      mount(window.React.createElement(entry.comp, {
        t: function (k) { return (DICT.zh[k] !== undefined ? DICT.zh[k] : k); },
        ctx: injected.ctx || ctx                     // spec.inject() 给的就是 ctx
      }), 'root', slot);
    } finally { cur.key = save.key; cur.idx = save.idx; }
  };
  window.__MM_RENDER__();
  // 标签页直接就是主面板（无需点击）；两次重渲染让状态/预设效果落地
  setTimeout(function () {
    window.__MM_RENDER__();
    setTimeout(function () {
      window.__MM_RENDER__();
      document.title = 'ready';
      window.__MM_READY__ = true;
    }, 250);
  }, 60);
</script>
</body></html>`;

function buildPage() {
  return PAGE
    .replace('__STATE__', JSON.stringify(STATE))
    .replace('__TIERS__', JSON.stringify(TIERS))
    .replace('__PRESETS__', JSON.stringify(PRESETS));
}

async function main() {
  fs.mkdirSync(IMG, { recursive: true });
  const html = buildPage();
  const tmp = path.join(PLUGIN, 'test-workdir', 'panel-shot');
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'index.html'), html, 'utf8');
  // client.js 与页面同目录（脚本标签是相对路径）
  fs.copyFileSync(path.join(PLUGIN, 'lib', 'client.js'), path.join(tmp, 'client.js'));

  const server = http.createServer((req, res) => {
    const f = path.join(tmp, decodeURIComponent(req.url.replace(/^\//, '') || 'index.html'));
    if (!f.startsWith(tmp) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('nope'); }
    const ext = path.extname(f);
    res.setHeader('content-type', ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/index.html';

  const entry = path.join(REPO, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js');
  const puppeteer = (await import('file:///' + entry.replace(/\\/g, '/'))).default;
  const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=1.5']
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console] ' + m.text()); });
  await page.setViewport({ width: 1180, height: 760, deviceScaleFactor: 1.5 });
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction('window.__MM_READY__ === true', { timeout: 15000 }).catch(() => {
    console.error('panel did not become ready — see page errors above');
  });
  await new Promise((r) => setTimeout(r, 350));

  const out = path.join(IMG, 'panel-codeMV.png');
  await page.screenshot({ path: out });
  console.log('panel shot: ' + out + '  (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
