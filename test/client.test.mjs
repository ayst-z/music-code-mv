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
  sidebarRightTabs: {
    register(def) { calls.definition = def; return () => {}; },
    get(kind) { return calls.definition && calls.definition.kind === kind ? calls.definition : undefined; }
  },
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
ok('没有右下角悬浮窗（shell.overlay 不再注册）', !dockSlot, dockSlot ? JSON.stringify(dockSlot.spec) : 'no dock');
ok('源码里不留悬浮窗残骸', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return !src.includes('DOCK_ID') && !src.includes('StudioDock') && !src.includes("'music-mv-dock'");
})(), 'dock fully removed');
ok('页面主体有离线降级分支（仍能直接把要求交给模型）', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("svc === 'absent'") && src.includes("'fallback.noService'") &&
    src.includes('askAgent(');
})(), 'sidebar fallback wired');
ok('字典有队友/子代理开工文案（中文优先，中英对齐）',
  !!calls.dictionaries.dict.zh['popup.teammate'] && !!calls.dictionaries.dict.en['popup.teammate'] &&
  calls.dictionaries.dict.zh['popup.teammate'] === '以队友/子代理开工',
  calls.dictionaries.dict.zh['popup.teammate'] + ' / ' + calls.dictionaries.dict.en['popup.teammate']);
ok('开工走队友/子代理四级降级（原生→宿主→当前会话→剪贴板）', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("ctx.get('agentTeams')") && src.includes('spawnTeammate') &&
    src.includes("apiPost('/kickoff'") && src.includes('kickoffViaConversation') &&
    src.includes('kickoffViaClipboard') && src.includes('SKILL_COMMAND');
})(), 'kickoff chain wired');
ok('离线回落里的开工也改成队友/子代理', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes('startTeammate(ctx)');
})(), 'fallback kickoff rewired');
ok('注册了若干 effect（可随插件卸载）', calls.effects >= 4, 'effects=' + calls.effects);
ok('自动打开了一次工坊页', calls.opened.length === 1 && calls.opened[0] === 'music-mv-studio',
  JSON.stringify(calls.opened));
ok('自动打开记录了 localStorage 标记', store.get('dsh-music-code-mv.studio.opened') === '1');
ok('自动打开的定时器已停止', intervals.every((i) => i.cleared), intervals.length + ' timer(s)');

// ---- 标题栏右上角入口 / conversation-titlebar top-right entry ----
const utilSlot = calls.slots.find(function (s) { return s.spec.name === 'conversation.session.header.utilities'; });
ok('入口挂在 conversation.session.header.utilities 槽位', !!utilSlot,
  utilSlot ? utilSlot.spec.id : 'missing');
ok('入口 id / order / locale（右侧排列、走自身字典）',
  !!utilSlot && utilSlot.spec.id === 'music-mv-studio-entry' && utilSlot.spec.order >= 100 &&
  utilSlot.spec.locale === 'musicCodeMv',
  utilSlot ? JSON.stringify({ id: utilSlot.spec.id, order: utilSlot.spec.order, locale: utilSlot.spec.locale }) : '');
const entryInject = utilSlot && typeof utilSlot.spec.inject === 'function' ? utilSlot.spec.inject() : null;
ok('入口注入了 openStudio 句柄', !!entryInject && typeof entryInject.openStudio === 'function');
const entryT = (k) => (calls.dictionaries.dict.zh[k] !== undefined ? calls.dictionaries.dict.zh[k] : k);
const entryTree = utilSlot ? utilSlot.component({ t: entryT, openStudio: entryInject ? entryInject.openStudio : function () {} }) : null;
const entryNodes = [];
const walkEntry = (node) => {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'function') { walkEntry(node.type(node.props || {})); return; }
  entryNodes.push(node);
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) kids.forEach(walkEntry); else walkEntry(kids);
};
walkEntry(entryTree);
const entryBtn = entryNodes.find((n) => n.type === 'button');
const entryLabel = entryNodes.find((n) => n.props && n.props.className === 'dshMvEntryLabel');
ok('入口渲染按钮 + 图标 + label + 悬停提示',
  !!entryBtn && entryBtn.props['data-music-mv-entry'] === '1' &&
  typeof entryBtn.props.title === 'string' && entryBtn.props.title === entryBtn.props['aria-label'] &&
  entryBtn.props.title === calls.dictionaries.dict.zh['entry.tooltip'] &&
  !!entryNodes.find((n) => n.type === 'svg') && !!entryLabel && entryLabel.props.children === 'codeMV',
  entryBtn ? String(entryBtn.props.title) : 'no button');
ok('自适应：容器查询 + 窗口查询都把 label 折叠成纯图标', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes('@container (max-width: 760px)') && src.includes('@media (max-width: 960px)') &&
    src.includes('.dshMvEntryLabel{display:none;') && src.includes('dsh-music-code-mv-entry-style') &&
    src.includes("'conversation.session.header.utilities'");
})(), 'adaptive css + slot source wired');
// 点击 → 切换原生弹层（不直接把用户甩进网页）
calls.opened.length = 0;
ok('入口按钮带 aria-expanded 且有点击处理器',
  !!entryBtn && entryBtn.props['aria-expanded'] === false && typeof entryBtn.props.onClick === 'function',
  entryBtn ? 'aria-expanded=' + String(entryBtn.props['aria-expanded']) : 'no button');
if (entryBtn && typeof entryBtn.props.onClick === 'function') entryBtn.props.onClick();
ok('点入口本身不强行开网页（弹层才是入口）', calls.opened.length === 0, JSON.stringify(calls.opened));

// ---- 原生弹层：结构、动作、开工降级 ----
const popupT = (k) => (calls.dictionaries.dict.zh[k] !== undefined ? calls.dictionaries.dict.zh[k] : k);
const popupTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, openStudio: entryInject ? entryInject.openStudio : function () {}, onClose: function () {}
});
const popupNodes = [];
const walkPopup = (node) => {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'function') { walkPopup(node.type(node.props || {})); return; }
  popupNodes.push(node);
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) kids.forEach(walkPopup); else walkPopup(kids);
};
walkPopup(popupTree);
const popupRoot = popupNodes.find((n) => n.props && n.props['data-music-mv-popup'] === '1');
ok('弹层是原生 DOM（div + role=dialog + aria-label）',
  !!popupRoot && popupRoot.type === 'div' && popupRoot.props.role === 'dialog' &&
  typeof popupRoot.props['aria-label'] === 'string',
  popupRoot ? popupRoot.type + ' role=' + popupRoot.props.role : 'missing');
ok('弹层里没有自定义元素、没有内嵌网页',
  !popupNodes.some((n) => typeof n.type === 'string' && /^[a-z]+(-[a-z0-9]+)+$/.test(n.type)) &&
  !popupNodes.some((n) => n.type === 'iframe'),
  popupNodes.map((n) => n.type).filter((x) => typeof x === 'string').join(','));
const acts = popupNodes.filter((n) => n.props && n.props['data-act']);
ok('弹层四个动作：开工 / 打开页面 / 渲染 / 复制路径',
  acts.length === 4 && acts.map((n) => n.props['data-act']).join(',') === 'teammate,studio,render,copy',
  acts.map((n) => n.props['data-act']).join(','));
ok('开工是第一动作且是主按钮',
  !!acts[0] && acts[0].props['data-act'] === 'teammate' &&
  String(acts[0].props.className).indexOf('dshMvActPrimary') >= 0,
  acts[0] ? String(acts[0].props.className) : 'missing');
ok('渲染动作如实回执（没有工程 / 失败 / 成功各自如实）', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("say('popup.renderNone')") &&
    src.includes("'popup.renderSent'") && src.includes("'popup.renderFailed'");
})(), 'honest render notices');
// 没有宿主接口时，开工降级到底并**承认**没成功（不伪造）
const kicked = await mod.__internals.startTeammate(ctx);
ok('无宿主接口时如实降级到底（不谎报成功）',
  !!kicked && kicked.ok === false && kicked.mode === 'none', JSON.stringify(kicked));
// 命中宿主原生 agentTeams 服务 → 以子代理形式开工
const spawnArgs = [];
const ctxNative = Object.assign({}, ctx, {
  get: function (name) {
    return name === 'agentTeams'
      ? { spawnTeammate: function (o) { spawnArgs.push(o); return Promise.resolve({ id: 't1' }); } }
      : null;
  }
});
const nativeRes = await mod.__internals.startTeammate(ctxNative);
ok('命中原生服务即以子代理形式开工',
  !!nativeRes && nativeRes.ok === true && nativeRes.mode === 'native' && spawnArgs.length === 1 &&
  spawnArgs[0].mode === 'subagent' && String(spawnArgs[0].prompt).indexOf('/music-code-mv') === 0,
  JSON.stringify(nativeRes));
ok('开工提示词点名 spawn_teammate / subagent',
  String(spawnArgs.length ? spawnArgs[0].prompt : '').indexOf('spawn_teammate') > 0,
  'prompt=' + String(spawnArgs.length ? spawnArgs[0].prompt.slice(0, 48) : ''));
// 页面类型缺席 → 退回宿主工作室地址（真实地址，不伪造）
const realTabGet = ctx.sidebarRightTabs.get;
const realWindowOpen = globalThis.window.open;
const openedUrls = [];
ctx.sidebarRightTabs.get = function () { return undefined; };
globalThis.window.open = function (u) { openedUrls.push(String(u)); };
const howUrl = entryInject ? entryInject.openStudio() : 'none';
ok('页面类型缺席时退回宿主工作室地址', howUrl === 'url' && openedUrls.length === 1 &&
  openedUrls[0] === 'http://127.0.0.1:19387/music-mv/studio',
  howUrl + ' ' + JSON.stringify(openedUrls));
// 连宿主地址都没有 → 如实返回 none（离线提示，不伪造）
globalThis.window.location = { protocol: 'file:', origin: 'null' };
globalThis.location = globalThis.window.location;
const howNone = entryInject ? entryInject.openStudio() : 'missing';
ok('拿不到任何数据源时如实返回 none', howNone === 'none', howNone);
globalThis.window.location = { protocol: 'http:', origin: 'http://127.0.0.1:19387' };
globalThis.location = globalThis.window.location;
ctx.sidebarRightTabs.get = realTabGet;
globalThis.window.open = realWindowOpen;
// locale 双文件镜像入口文案（中文优先）
const zhLoc = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'locale', 'zh.json'), 'utf8'));
const enLoc = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'locale', 'en.json'), 'utf8'));
ok('locale 双文件镜像了入口文案（中文优先）',
  !!zhLoc.entry && !!enLoc.entry && zhLoc.entry.label === 'codeMV' &&
  zhLoc.entry.tooltip === calls.dictionaries.dict.zh['entry.tooltip'] &&
  enLoc.entry.label === calls.dictionaries.dict.en['entry.label'] &&
  enLoc.entry.tooltip === calls.dictionaries.dict.en['entry.tooltip'],
  zhLoc.entry ? zhLoc.entry.label + ' / ' + enLoc.entry.label : 'missing');

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

// ---- 渲染状态分条展示 / itemised render status ----
const jrNone = mod.__internals.jobRows(popupT, null);
ok('无任务时仍是 5 条，且算不出的值给「—」（不摆假数据）',
  jrNone.length === 5 && jrNone[1][1] === '—' && jrNone[2][1] === '—' && jrNone[3][1] === '—',
  JSON.stringify(jrNone));
ok('分条标签：任务/进度/速度/预计/状态',
  jrNone.map((r) => r[0]).join(',') === [
    popupT('popup.job'), popupT('popup.progress'), popupT('popup.speed'),
    popupT('popup.eta'), popupT('popup.state')
  ].join(','),
  jrNone.map((r) => r[0]).join(' | '));

const nowMs = Date.now();
const jrRun = mod.__internals.jobRows(popupT, {
  project: 'feature-demo', mode: 'video', status: 'running',
  startedAt: nowMs - 50000, progress: { pct: 50, done: 4560, total: 9120 }
});
const jobMap = {};
jrRun.forEach((r) => { jobMap[r[0]] = r[1]; });
ok('运行中：进度同时给百分比与 已渲/总帧',
  /50%/.test(jobMap[popupT('popup.progress')]) && /4560\/9120/.test(jobMap[popupT('popup.progress')]),
  jobMap[popupT('popup.progress')]);
ok('运行中：速度是实测 fps（done/elapsed）',
  /^\d+\.\d fps$/.test(jobMap[popupT('popup.speed')]), jobMap[popupT('popup.speed')]);
ok('运行中：预计剩余算得出 mm:ss',
  /^\d+:\d{2}$/.test(jobMap[popupT('popup.eta')]), jobMap[popupT('popup.eta')]);
const jrDone = mod.__internals.jobRows(popupT, { status: 'done', startedAt: nowMs - 1000, progress: {} });
const doneMap = {};
jrDone.forEach((r) => { doneMap[r[0]] = r[1]; });
ok('已结束：状态如实说完成、预计归零',
  doneMap[popupT('popup.state')] === popupT('popup.jobDone') && doneMap[popupT('popup.eta')] === '0:00',
  JSON.stringify(doneMap));
ok('弹层轮询：有任务 700ms / 无任务 2500ms，关闭即 clearTimeout', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes('schedule(running ? 700 : 2500)') && src.includes('clearTimeout(timer)') &&
    !src.includes('setInterval(refresh');
})(), 'poll wiring + cleanup');

// ---- 开工前选预设 / presets picked before kickoff ----
const optsTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, openStudio: function () { return 'tab'; }, onClose: function () {}
});
const optsNodes = [];
const walkOpts = (node) => {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'function') { walkOpts(node.type(node.props || {})); return; }
  optsNodes.push(node);
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) kids.forEach(walkOpts); else walkOpts(kids);
};
walkOpts(optsTree);
const optsRoot = optsNodes.find((n) => n.props && n.props['data-music-mv-opts'] === '1');
ok('弹层里有开工预设区（在动作按钮之前）', !!optsRoot, optsRoot ? 'present' : 'missing');
const selects = optsNodes.filter((n) => n.type === 'select');
ok('两个下拉：清晰度 + 风格（标准标签，非自定义元素）',
  selects.length === 2 && selects[0].props['data-select'] === 'tier' &&
  selects[1].props['data-select'] === 'style',
  selects.map((s) => s.props['data-select']).join(','));
ok('清晰度档用宿主 RENDER_TIERS 的中文标题（内置兜底）',
  optsNodes.some((n) => n.type === 'option' && String(n.props.children).indexOf('480×270') >= 0) &&
  optsNodes.some((n) => n.type === 'option' && String(n.props.children).indexOf('3840×2160') >= 0),
  'tier titles present');
ok('风格清单覆盖 16 个预设 id（内置兜底）',
  mod.__internals.FALLBACK_STYLES.length === 16 &&
  optsNodes.some((n) => n.type === 'option' && n.props.value === 'deepseek'),
  mod.__internals.FALLBACK_STYLES.length + ' style ids');
ok('字典含分条与预设的中英文案（中文优先）',
  ['popup.progress', 'popup.speed', 'popup.eta', 'popup.state',
    'popup.kickoffOpts', 'popup.tier', 'popup.style', 'popup.offlinePresets']
    .every((k) => typeof calls.dictionaries.dict.zh[k] === 'string' &&
      typeof calls.dictionaries.dict.en[k] === 'string') &&
  calls.dictionaries.dict.zh['popup.progress'] === '进度' &&
  calls.dictionaries.dict.en['popup.progress'] === 'Progress',
  'zh-first + en mirrored');

const kickExtra = mod.__internals.kickoffExtra('标准 1280×720', 'deepseek');
ok('预设写进开工提示词',
  kickExtra.indexOf('交付分辨率：标准 1280×720') === 0 &&
  kickExtra.indexOf('风格预设：deepseek') > 0, kickExtra);
ok('没选的项不编造', mod.__internals.kickoffExtra('', '') === '' &&
  mod.__internals.kickoffExtra('', 'gpt') === '风格预设：gpt。',
  JSON.stringify(mod.__internals.kickoffExtra('', '')));
ok('composePrompt 无预设时只发基础指令',
  mod.__internals.composePrompt('') === mod.__internals.composePrompt(undefined) &&
  mod.__internals.composePrompt('').indexOf('交付分辨率') < 0, 'base only');
ok('composePrompt 带预设时追加在基础指令之后',
  mod.__internals.composePrompt(kickExtra).endsWith('\n' + kickExtra) &&
  mod.__internals.composePrompt(kickExtra).indexOf('/music-code-mv') === 0, 'appended');

const spawnArgs2 = [];
const ctxNative2 = Object.assign({}, ctx, {
  get: function (n) {
    return n === 'agentTeams'
      ? { spawnTeammate: function (o) { spawnArgs2.push(o); return Promise.resolve({}); } }
      : null;
  }
});
await mod.__internals.startTeammate(ctxNative2, kickExtra);
ok('原生开工把清晰度与风格一并带进提示词',
  spawnArgs2.length === 1 &&
  String(spawnArgs2[0].prompt).indexOf('交付分辨率：标准 1280×720') > 0 &&
  String(spawnArgs2[0].prompt).indexOf('风格预设：deepseek') > 0,
  spawnArgs2.length ? String(spawnArgs2[0].prompt).slice(-48) : 'no spawn');
ok('预设清单取自同源宿主接口，离线才用内置并如实标注', (function () {
  const src = fs.readFileSync(CLIENT, 'utf8');
  return src.includes("API_BASE + '/presets'") && src.includes("'popup.offlinePresets'") &&
    src.includes('FALLBACK_STYLES');
})(), 'preset source + honest offline note');

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
