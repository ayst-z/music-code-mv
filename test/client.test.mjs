/**
 * 浏览器半边测试 / Client-half test.
 *
 * 不重启 DSH 也能验证 GUI 插件：给一个假的 __ModuleLoader__、假的 React、假的 ctx，
 * 检查它注册了页面类型、界面字典、槽位主体，并且会打开一次「MV 工坊」。
 * Run:  node test/client.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const CLIENT = path.join(PLUGIN, 'lib', 'client.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
};

console.log('');
console.log('=== dsh-music-code-mv client test ===');

// ---- 假 React：只实现本包用到的部分 ----
const React = {
  createElement: function (type, props) {
    const kids = Array.prototype.slice.call(arguments, 2);
    return { type: type, props: Object.assign({}, props || {}, { children: kids.length > 1 ? kids : kids[0] }) };
  },
  Fragment: 'Fragment',
  useState(init) { return [typeof init === 'function' ? init() : init, function () {}]; },
  useEffect() {},
  useRef(v) { return { current: v }; }
};

// ---- 假的 interval：手动推进，验证自动打开的重试 ----
const intervals = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => { const id = { fn: fn, ms: ms, cleared: false }; intervals.push(id); return id; };
globalThis.clearInterval = (id) => { if (id) id.cleared = true; };

// ---- 假的浏览器环境 ----
const store = new Map();
let loaded = null;
globalThis.window = {
  location: { protocol: 'http:', origin: 'http://127.0.0.1:19387' },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v))
  },
  __ModuleLoader__: { load(reg) { loaded = reg; } },
  open() {}
};
globalThis.location = globalThis.window.location;

await import(pathToFileURL(CLIENT).href);
ok('包用 __ModuleLoader__.load 注册自己', !!loaded && loaded.id === 'dsh-music-code-mv',
  loaded ? 'id=' + loaded.id : 'no registration');
ok('factory 是函数', !!loaded && typeof loaded.factory === 'function');

const factoryRequire = (name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
};
const mod = loaded.factory(factoryRequire);
ok('导出 apply 与 inject', typeof mod.apply === 'function' && Array.isArray(mod.inject),
  'inject=' + JSON.stringify(mod.inject));
for (const need of ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']) {
  ok('inject 声明了 ' + need, mod.inject.includes(need));
}

// ---- 假 ctx ----
const calls = { dictionaries: null, definition: null, slots: [], opened: [], effects: 0 };
const ctx = {
  effect(fn, label) { calls.effects++; const d = fn(); return typeof d === 'function' ? d : () => {}; },
  locale: {
    bind: () => (key) => key,
    register(ns, dict) { calls.dictionaries = { ns: ns, dict: dict }; return () => {}; }
  },
  sidebarRightTabs: { register(def) { calls.definition = def; return () => {}; } },
  sidebarRight: { openTab(kind) { calls.opened.push(kind); } },
  slots: {
    inject(name, cb) { calls.slotsInject = (calls.slotsInject || []).concat([name]); return cb(); },
    register(spec, component) { calls.slots.push({ spec: spec, component: component }); return () => {}; }
  }
};
mod.apply(ctx);
// 自动打开是 setInterval 里的第一次尝试；测试里手动推进
ok('自动打开建了一个定时器', intervals.length === 1, intervals.length + ' timer(s)');
if (intervals[0]) intervals[0].fn();

ok('注册了界面字典', !!calls.dictionaries && calls.dictionaries.ns === 'musicCodeMv');
const zhKeys = Object.keys(calls.dictionaries.dict.zh).sort().join(',');
const enKeys = Object.keys(calls.dictionaries.dict.en).sort().join(',');
ok('中英文字典键一致', zhKeys === enKeys, zhKeys.split(',').length + ' keys');
ok('字典里有中文文案', calls.dictionaries.dict.zh['type.label'] === 'MV 工坊');
ok('注册了页面类型（kind + 指南入口）',
  !!calls.definition && calls.definition.kind === 'music-mv-studio' &&
  typeof calls.definition.title === 'function' && Array.isArray(calls.definition.guide) &&
  calls.definition.guide.length === 1, calls.definition ? calls.definition.kind : '');
const paneSlot = calls.slots.find(function (s) { return s.spec.name === 'sidebar.right.pane.tab'; });
const dockSlot = calls.slots.find(function (s) { return s.spec.name === 'shell.overlay'; });
ok('槽位挂在 sidebar.right.pane.tab', !!paneSlot && paneSlot.spec.key === 'dsh-music-code-mv',
  paneSlot ? JSON.stringify(paneSlot.spec) : 'missing');
ok('常驻面板挂在 shell.overlay', !!dockSlot && dockSlot.spec.id === 'music-mv-dock',
  dockSlot ? JSON.stringify(dockSlot.spec) : 'missing');
ok('面板在无 webServer 时可离线工作', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("probe === 'absent'") && src.includes("'dock.noService'") &&
    src.includes('askAgent(') && !src.includes('setInterval(refresh, 5000)');
})(), 'offline rail wired');
ok('页面主体有离线降级分支', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("svc === 'absent'") && src.includes("'fallback.noService'");
})(), 'sidebar fallback wired');
ok('字典有一键开启对话文案', !!calls.dictionaries.dict.zh['dock.start'] && !!calls.dictionaries.dict.en['dock.start'],
  calls.dictionaries.dict.zh['dock.start'] + ' / ' + calls.dictionaries.dict.en['dock.start']);
ok('面板实现了一键开启对话（按钮 + onKickoff + 会话作用域发送）', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("t('dock.start')") && src.includes('onKickoff') &&
    src.includes('startSkillConversation') && src.includes('sessions.scope(') &&
    src.includes('SKILL_COMMAND');
})(), 'kickoff wiring present');
ok('常驻面板默认展开（一直显示）', (function () {
  const tree = dockSlot && dockSlot.component({ t: (k) => k, openStudio: function () {} });
  let hit = false;
  const scan = (node) => {
    if (!node || typeof node !== 'object' || hit) return;
    if (typeof node.type === 'function') { scan(node.type(node.props || {})); return; }
    if (node.props && node.props['data-music-mv-dock'] === '1') { hit = true; return; }
    const kids = node.props && node.props.children;
    if (Array.isArray(kids)) kids.forEach(scan); else scan(kids);
  };
  scan(tree);
  return hit;
})(), 'dock rendered');
ok('注册了若干 effect（可随插件卸载）', calls.effects >= 4, 'effects=' + calls.effects);
ok('自动打开了一次工坊页', calls.opened.length === 1 && calls.opened[0] === 'music-mv-studio',
  JSON.stringify(calls.opened));
ok('自动打开记录了 localStorage 标记', store.get('dsh-music-code-mv.studio.opened') === '1');
ok('自动打开的定时器已停止', intervals.every((i) => i.cleared), intervals.length + ' timer(s)');

// ---- 主体组件能渲染出 iframe ----
const tree = paneSlot.component({ t: (k) => k });
const flat = [];
const walk = (node) => {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'function') { walk(node.type(node.props || {})); return; }
  flat.push(node.type);
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) kids.forEach(walk); else walk(kids);
};
walk(tree);
ok('页面主体渲染出 iframe', flat.includes('iframe'), flat.join(','));
const frameNode = (function find(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'iframe') return node;
  if (typeof node.type === 'function') return find(node.type(node.props || {}));
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) { for (const k of kids) { const hit = find(k); if (hit) return hit; } return null; }
  return find(kids);
})(tree);
ok('iframe 地址带 theme 参数（主题同步）', !!frameNode && /theme=(dark|light)/.test(frameNode.props.src), frameNode ? frameNode.props.src : 'no iframe');
ok('iframe 挂了 ref 与 onLoad（用于推进设计令牌）', !!frameNode && !!frameNode.props.ref && typeof frameNode.props.onLoad === 'function');

// ---- 没有 http origin 时给出提示而不是坏 iframe ----
globalThis.window.location = { protocol: 'file:', origin: 'null' };
globalThis.location = globalThis.window.location;
const tree2 = paneSlot.component({ t: (k) => k });
const flat2 = [];
const walk2 = (node) => {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'function') { walk2(node.type(node.props || {})); return; }
  flat2.push(node.type);
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) kids.forEach(walk2); else walk2(kids);
};
walk2(tree2);
ok('file:// 下不渲染 iframe（改为提示）', !flat2.includes('iframe'), flat2.join(','));

// ---- 第二次运行不再自动打开 ----
calls.opened.length = 0;
intervals.length = 0;
const mod2 = loaded.factory(factoryRequire);
mod2.apply(ctx);
ok('已打开过就不再自动打开', calls.opened.length === 0 && intervals.length === 0);

globalThis.setInterval = realSetInterval;
console.log('');
console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
console.log('');
process.exit(fail === 0 ? 0 : 1);
