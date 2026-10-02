/**
 * 浏览器半边测试 / Client-half test.
 *
 * 不重启 DSH 也能验证 GUI 插件：给一个假的 __ModuleLoader__、假的 React、假的 ctx，
 * 检查它注册了页面类型、界面字典、侧栏原生状态页、标题栏 codeMV 弹层（分级 UI、
 * 联系表直渲面板、风格画廊、锚点定位），并保持开工四级降级与渲染分条这些硬需求。
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

const SRC = fs.readFileSync(CLIENT, 'utf8');

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

/** 把一棵（可能含函数组件的）树摊平 / flatten a tree, expanding function components. */
const walkAll = (node, out = []) => {
  if (Array.isArray(node)) { node.forEach((n) => walkAll(n, out)); return out; }
  if (!node || typeof node !== 'object') return out;
  if (typeof node.type === 'function') { walkAll(node.type(node.props || {}), out); return out; }
  out.push(node);
  const kids = node.props && node.props.children;
  if (Array.isArray(kids)) kids.forEach((k) => walkAll(k, out));
  else walkAll(kids, out);
  return out;
};

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
ok('字典里有中文文案（页面类型 + 弹层分区 + 帧率预设）',
  calls.dictionaries.dict.zh['type.label'] === 'MV 工坊' &&
  calls.dictionaries.dict.zh['popup.section.status'] === '总览' &&
  calls.dictionaries.dict.zh['popup.fps'] === '帧率',
  calls.dictionaries.dict.zh['type.label']);
ok('注册了页面类型（kind + 指南入口）',
  !!calls.definition && calls.definition.kind === 'music-mv-studio' &&
  typeof calls.definition.title === 'function' && Array.isArray(calls.definition.guide) &&
  calls.definition.guide.length === 1, calls.definition ? calls.definition.kind : '');
const paneSlot = calls.slots.find(function (s) { return s.spec.name === 'sidebar.right.pane.tab'; });
const dockSlot = calls.slots.find(function (s) { return s.spec.name === 'shell.overlay'; });
ok('槽位挂在 sidebar.right.pane.tab', !!paneSlot && paneSlot.spec.key === 'dsh-music-code-mv',
  paneSlot ? JSON.stringify(paneSlot.spec) : 'missing');
ok('没有右下角悬浮窗（shell.overlay 不再注册）', !dockSlot, dockSlot ? JSON.stringify(dockSlot.spec) : 'no dock');
ok('源码里不留悬浮窗残骸', !SRC.includes('DOCK_ID') && !SRC.includes('StudioDock') &&
  !SRC.includes("'music-mv-dock'"), 'dock fully removed');
ok('页面主体有离线降级分支（仍能直接把要求交给模型）',
  SRC.includes("svc === 'absent'") && SRC.includes("'fallback.noService'") &&
  SRC.includes('askAgent('), 'sidebar fallback wired');
ok('离线交接走 HANDOFF_PROMPT（不联网、先装载 skill）',
  SRC.includes('askAgent(ctx, HANDOFF_PROMPT)') && mod.__internals.handoffPrompt.indexOf('/music-code-mv') === 0,
  mod.__internals.handoffPrompt.slice(0, 40) + '…');
ok('字典有队友/子代理开工文案（中文优先，中英对齐）',
  !!calls.dictionaries.dict.zh['popup.teammate'] && !!calls.dictionaries.dict.en['popup.teammate'] &&
  calls.dictionaries.dict.zh['popup.teammate'] === '以队友/子代理开工',
  calls.dictionaries.dict.zh['popup.teammate'] + ' / ' + calls.dictionaries.dict.en['popup.teammate']);
ok('开工走队友/子代理四级降级（原生→宿主→当前会话→剪贴板）',
  SRC.includes("ctx.get('agentTeams')") && SRC.includes('spawnTeammate') &&
  SRC.includes("apiPost('/kickoff'") && SRC.includes('kickoffViaConversation') &&
  SRC.includes('kickoffViaClipboard') && SRC.includes('SKILL_COMMAND'),
  'kickoff chain wired');
ok('离线回落里的开工也改成队友/子代理', SRC.includes('startTeammate(ctx)'), 'fallback kickoff rewired');
ok('注册了若干 effect（可随插件卸载）', calls.effects >= 4, 'effects=' + calls.effects);
ok('自动打开了一次工坊页', calls.opened.length === 1 && calls.opened[0] === 'music-mv-studio',
  JSON.stringify(calls.opened));
ok('自动打开记录了 localStorage 标记', store.get('dsh-music-code-mv.studio.opened') === '1');
ok('自动打开的定时器已停止', intervals.every((i) => i.cleared), intervals.length + ' timer(s)');

// ---- 侧栏主体：原生 DOM 状态镜像（不内嵌网页）----
const popupT = (k) => (calls.dictionaries.dict.zh[k] !== undefined ? calls.dictionaries.dict.zh[k] : k);
const paneTree = paneSlot.component({ t: popupT });
const paneNodes = walkAll(paneTree);
const paneTypes = paneNodes.map((n) => n.type);
ok('侧栏页是原生 DOM：工具条 + 状态区，无 iframe',
  !paneTypes.includes('iframe') && paneTypes.includes('strong') && paneTypes.includes('button'),
  paneTypes.filter((x) => typeof x === 'string').join(','));
const paneButtons = paneNodes.filter((n) => n.type === 'button');
ok('工具条只有「刷新」，不放网页按钮（在浏览器打开 / 复制地址已移除）',
  paneButtons.length === 1 && paneButtons[0].props.children === '刷新' &&
  !SRC.includes("t('action.open')") && !SRC.includes("t('action.copy')"),
  paneButtons.map((b) => b.props.children).join(','));
ok('侧栏主体带状态读取（读取中起步，200ms 首拍）',
  paneNodes.some((n) => n.props && n.props.className === 'dshMvDim') &&
  SRC.includes('schedule(200)'), 'native status mirror');
ok('侧栏离线分支带离线标记与交接按钮（data-sidebar-offline / HANDOFF）',
  SRC.includes("'data-sidebar-offline'") && SRC.includes("'fallback.handoff'") &&
  SRC.includes('onHandoff'), 'offline branch wired');

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
const entryNodes = walkAll(entryTree);
const entryBtn = entryNodes.find((n) => n.type === 'button');
const entryLabel = entryNodes.find((n) => n.props && n.props.className === 'dshMvEntryLabel');
ok('入口渲染按钮 + 图标 + label + 悬停提示',
  !!entryBtn && entryBtn.props['data-music-mv-entry'] === '1' &&
  typeof entryBtn.props.title === 'string' && entryBtn.props.title === entryBtn.props['aria-label'] &&
  entryBtn.props.title === calls.dictionaries.dict.zh['entry.tooltip'] &&
  !!entryNodes.find((n) => n.type === 'svg') && !!entryLabel && entryLabel.props.children === 'codeMV',
  entryBtn ? String(entryBtn.props.title) : 'no button');
ok('自适应：容器查询 + 窗口查询都把 label 折叠成纯图标',
  SRC.includes('@container (max-width: 760px)') && SRC.includes('@media (max-width: 960px)') &&
  SRC.includes('.dshMvEntryLabel{display:none;') && SRC.includes('dsh-music-code-mv-entry-style') &&
  SRC.includes("'conversation.session.header.utilities'"),
  'adaptive css + slot source wired');
ok('适配：弹层宽度随视口收缩、自己就是查询容器（分级网格可降列）',
  SRC.includes('width:min(340px, calc(100vw - 24px))') && SRC.includes('container-type:inline-size') &&
  SRC.includes('@container (max-width: 300px){.dshMvGallery{grid-template-columns:1fr;}}'),
  'responsive popup + gallery');
ok('适配：预览图随容器缩放不撑破面板', SRC.includes('max-width:100%;height:auto'), 'fluid preview image');
// 点击 → 切换原生弹层（不直接把用户甩进网页）
calls.opened.length = 0;
ok('入口按钮带 aria-expanded 且有点击处理器',
  !!entryBtn && entryBtn.props['aria-expanded'] === false && typeof entryBtn.props.onClick === 'function',
  entryBtn ? 'aria-expanded=' + String(entryBtn.props['aria-expanded']) : 'no button');
ok('入口按钮持有 ref（弹层按它实测锚点）',
  !!entryBtn && !!entryBtn.props.ref && SRC.includes('getBoundingClientRect'), 'anchor measurement wired');
if (entryBtn && typeof entryBtn.props.onClick === 'function') entryBtn.props.onClick();
ok('点入口本身不强行开网页（弹层才是入口）', calls.opened.length === 0, JSON.stringify(calls.opened));

// ---- 原生弹层：结构、动作、开工降级 ----
const popupTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, openStudio: entryInject ? entryInject.openStudio : function () {}, onClose: function () {}
});
const popupNodes = walkAll(popupTree);
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
ok('弹层四个动作：开工 / 联系表面板 / 风格画廊 / 复制路径',
  acts.length === 4 && acts.map((n) => n.props['data-act']).join(',') === 'teammate,render,styles,copy',
  acts.map((n) => n.props['data-act']).join(','));
ok('开工是第一动作且是主按钮',
  !!acts[0] && acts[0].props['data-act'] === 'teammate' &&
  String(acts[0].props.className).indexOf('dshMvActPrimary') >= 0,
  acts[0] ? String(acts[0].props.className) : 'missing');
// 三区结构：固定头部 / 可滚主体 / 钉底动作区
const headNode = popupNodes.find((n) => n.props && n.props.className === 'dshMvHead');
const bodyNode = popupNodes.find((n) => n.props && n.props.className === 'dshMvBody');
const footNode = popupNodes.find((n) => n.props && n.props.className === 'dshMvFoot');
const actsList = popupNodes.find((n) => n.props && n.props.className === 'dshMvActions');
ok('三区结构：头部（含状态药丸）→ 主体 → 钉底动作区',
  !!headNode && !!bodyNode && !!footNode && !!actsList &&
  popupNodes.indexOf(headNode) < popupNodes.indexOf(bodyNode) &&
  popupNodes.indexOf(bodyNode) < popupNodes.indexOf(footNode) &&
  popupNodes.indexOf(actsList) > popupNodes.indexOf(footNode),
  'head/body/foot ordered');
const pill = popupNodes.find((n) => n.props && n.props.className === 'dshMvPill');
ok('头部连接状态药丸（读取中起步，颜色之外还有文字）',
  !!pill && pill.props['data-state'] === 'probing' && pill.props.children === '读取中',
  pill ? String(pill.props['data-state']) + '/' + String(pill.props.children) : 'missing');
ok('弹层打开即聚焦（tabIndex -1 + ref），键盘直接落在对话框里',
  !!popupRoot && popupRoot.props.tabIndex === -1 && !!popupRoot.props.ref, 'focus on open');
ok('回执区 aria-live=polite（不抢焦点地播报）', SRC.includes("'aria-live': 'polite'"), 'aria-live wired');
ok('渲染动作如实回执（没有工程 / 失败 / 成功各自如实）',
  SRC.includes("say('popup.renderNone')") &&
  SRC.includes("'popup.renderSent'") && SRC.includes("'popup.renderFailed'"),
  'honest render notices');
ok('联系表是插件直渲：POST /music-mv/api/render，不经过模型',
  SRC.includes("apiPost('/render'") && SRC.includes("mode: 'contact'") &&
  !SRC.includes('ASK_SHEET') && !SRC.includes('popup.askSheet'), 'native render, no model');
ok('取消渲染走宿主接口且回执如实（有任务/没任务/失败分开说）',
  SRC.includes("apiGet('/cancel'") && SRC.includes("'popup.cancelled'") &&
  SRC.includes("'popup.cancelNothing'") && SRC.includes("'popup.cancelFailed'"), 'cancel wiring');
ok('二级面板有返回键；联系表面板动作是 开始渲染 + 取消渲染（取消只在跑任务时可点）',
  SRC.includes("'data-act': 'back'") && SRC.includes("'data-act': 'start'") &&
  SRC.includes("'data-act': 'cancel'") && SRC.includes('disabled: !!busy || !running'),
  'tier-2 chrome wired');
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
ok('locale 不再带已废弃的页面类型文案（entry.unavailable 已随面板重构移除）',
  !('unavailable' in (zhLoc.entry || {})) && !('unavailable' in (enLoc.entry || {})),
  Object.keys(zhLoc.entry || {}).join(','));
ok('locale 的 entry 键与运行时字典逐一对齐',
  Object.keys(zhLoc.entry).every((k) => calls.dictionaries.dict.zh['entry.' + k] !== undefined) &&
  Object.keys(enLoc.entry).every((k) => calls.dictionaries.dict.en['entry.' + k] !== undefined),
  Object.keys(zhLoc.entry).length + ' entry keys');

// ---- 锚点定位：默认对话框不再错位 ----
const a1 = mod.__internals.popupAnchor({ bottom: 100, right: 800 }, 1200, 800, 340);
ok('锚点：贴按钮下沿 + 右缘对齐', a1.top === '105px' && a1.right === '400px', JSON.stringify(a1));
const a2 = mod.__internals.popupAnchor({ bottom: 100, right: 1199 }, 1200, 800, 340);
ok('锚点：贴屏右缘时留 8px 边', a2.right === '8px', JSON.stringify(a2));
const a3 = mod.__internals.popupAnchor({ bottom: 100, right: 50 }, 1200, 800, 340);
ok('锚点：按钮靠左时整体回收进屏内', a3.right === (1200 - 340 - 8) + 'px', JSON.stringify(a3));
const a4 = mod.__internals.popupAnchor({ bottom: 700, right: 800 }, 1200, 600, 340);
ok('锚点：下方放不下就向上收（不出下缘）', a4.top === (600 - 140) + 'px', JSON.stringify(a4));
const anchoredTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, anchor: { top: '105px', right: '400px' }, onClose: function () {}
});
const anchoredRoot = walkAll(anchoredTree).find((n) => n.props && n.props['data-music-mv-popup'] === '1');
ok('量到锚点就用 fixed 精确定位（否则退回 CSS absolute）',
  !!anchoredRoot && anchoredRoot.props.style && anchoredRoot.props.style.position === 'fixed' &&
  anchoredRoot.props.style.top === '105px' && anchoredRoot.props.style.right === '400px' &&
  popupRoot.props.style === null,
  JSON.stringify(anchoredRoot ? anchoredRoot.props.style : null));

// ---- 展开大窗（与弹层同级切换，不占满屏幕）与动画 / expand + motion ----
ok('展开大窗尺寸：min(760px, 100vw-32) + max-height 76vh（不出视口、不覆盖整屏）',
  SRC.includes('.dshMvPopupBig{width:min(760px, calc(100vw - 32px));') &&
  SRC.includes('max-height:min(76vh, calc(100vh - 140px))') &&
  !SRC.includes('fullscreenStyle') && !SRC.includes("borderRadius: '0'"),
  'big window sizing, no viewport takeover');
const bigAnchor = mod.__internals.popupAnchor({ bottom: 100, right: 200 }, 1200, 800, 760);
ok('大窗档位重算锚点：760 宽时左缘也不出屏（右缘收到 432px）',
  bigAnchor.right === (1200 - 760 - 8) + 'px', JSON.stringify(bigAnchor));
store.set('dsh-music-code-mv.fullscreen', '1');
const fsTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, anchor: { top: '105px', right: '400px' }, onClose: function () {}
});
const fsNodes = walkAll(fsTree);
const fsRoot = fsNodes.find((n) => n.props && n.props['data-music-mv-popup'] === '1');
const fsBtn = fsNodes.find((n) => n.props && n.props['data-fs'] === '1');
ok('记住展开偏好：重开就是大窗（类 dshMvPopupBig + **同一锚点** fixed + 开关「收起」）',
  !!fsRoot && String(fsRoot.props.className).indexOf('dshMvPopupBig') >= 0 &&
  !!fsRoot.props.style && fsRoot.props.style.position === 'fixed' &&
  fsRoot.props.style.top === '105px' && fsRoot.props.style.right === '400px' &&
  !!fsBtn && fsBtn.props['aria-pressed'] === true && fsBtn.props.children === '收起',
  fsBtn ? String(fsBtn.props.children) : 'missing');
store.delete('dsh-music-code-mv.fullscreen');
ok('默认态开关文案「展开」、aria-pressed=false（可键盘操作）',
  popupNodes.some((n) => n.props && n.props['data-fs'] === '1' &&
    n.props.children === '展开' && n.props['aria-pressed'] === false &&
    typeof n.props.onClick === 'function'), 'toggle present');
const toggled = [];
const controlledTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, expanded: true,
  onToggleExpanded: function (v) { toggled.push(v); }, onClose: function () {}
});
const ctrlBtn = walkAll(controlledTree).find((n) => n.props && n.props['data-fs'] === '1');
if (ctrlBtn && typeof ctrlBtn.props.onClick === 'function') ctrlBtn.props.onClick();
ok('受控切换：点开关通知父级收起并持久化偏好（父级按档位重量锚点）',
  toggled.length === 1 && toggled[0] === false &&
  store.get('dsh-music-code-mv.fullscreen') === '0' &&
  SRC.includes('measure(next ? EXPANDED_WIDTH : POPUP_WIDTH)'),
  JSON.stringify(toggled));
store.delete('dsh-music-code-mv.fullscreen');
ok('Esc 在大窗时先收起、再按一次才关弹层',
  SRC.includes('if (bigRef.current)') && SRC.includes("lsSet(LS_FS, '0')"), 'esc order');
ok('动画：开屏 / 切级 / 大窗 / 遮罩四段关键帧 + 悬停过渡 + 尊重减少动效',
  SRC.includes('@keyframes dshMvPop') && SRC.includes('@keyframes dshMvPanel') &&
  SRC.includes('@keyframes dshMvBig') && SRC.includes('@keyframes dshMvFade') &&
  SRC.includes('prefers-reduced-motion') && SRC.includes('transition:background .12s ease'),
  'motion + reduced-motion');
ok('切级时主体重挂播放滑入动画（body key 跟面板走）',
  SRC.includes("key: 'body-' + panel"), 'panel remount');
ok('大窗宽屏两栏排版 + 画廊升到 3/4 列（容器查询）',
  SRC.includes('@container (min-width: 560px)') && SRC.includes('@container (min-width: 860px)') &&
  SRC.includes('.dshMvPopupBig .dshMvBody{display:grid'), 'responsive big grid');
ok('图片可读性：大窗展示图 112px / 风格条 96px / 缩略 88×50 / 预览整幅 contain；常态 56px 起步',
  SRC.includes('.dshMvPopupBig .dshMvCardArt,.dshMvPopupBig .dshMvCardImg{height:112px;}') &&
  SRC.includes('.dshMvPopupBig .dshMvStrip{height:96px;}') &&
  SRC.includes('.dshMvPopupBig .dshMvThumb{width:88px;height:50px;}') &&
  SRC.includes('max-height:52vh;object-fit:contain') &&
  SRC.includes('.dshMvCardArt{display:block;height:56px;'), 'readable images');
ok('选项框对比度：实底背景 + 加粗边框 + option 同色 + 字段标签/分区标题提亮',
  SRC.includes('background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.22))') &&
  SRC.includes('border:1px solid var(--dsw-alias-border-l3') &&
  SRC.includes('.dshMvSel option{background:var(--dsw-specific-menu') &&
  SRC.includes('.dshMvField .dshMvKey{color:var(--dsw-alias-label-secondary') &&
  SRC.includes('.dshMvSectionTitle{color:var(--dsw-alias-label-secondary'), 'select contrast');

// ---- 状态区分块：读取中 / 离线 / 就绪（纯函数各写一套断言）----
const retrySpy = function () {};
const probeNodes = walkAll(mod.__internals.popupBody(popupT, 'probing', null, retrySpy));
const probeBar = probeNodes.find((n) => n.type === 'progress');
ok('读取中态：一句话 + 不确定态原生进度条',
  !!probeBar && !('value' in probeBar.props) &&
  probeNodes.some((n) => n.props && n.props['data-phase'] === 'probing') &&
  probeNodes.some((n) => n.props && n.props.children === '正在读取宿主状态…'),
  probeBar ? 'progress(no value)' : 'missing');
const offNodes = walkAll(mod.__internals.popupBody(popupT, 'absent', null, retrySpy));
const offlineMsg = offNodes.find((n) => n.props && n.props['data-offline'] === '1');
const retryBtn = offNodes.find((n) => n.props && n.props['data-act'] === 'retry');
ok('离线态：错误文案 + 「还能用什么」提示 + 重试按钮',
  !!offlineMsg && !!retryBtn &&
  offNodes.some((n) => n.props && String(n.props.className).indexOf('dshMvHint') >= 0),
  offlineMsg ? 'offline + retry' : 'missing');
ok('重试按钮直接接回调（点了重挂轮询）', !!retryBtn && retryBtn.props.onClick === retrySpy, 'retry wired');
const readyJob = {
  project: 'feature-demo', mode: 'contact', status: 'running',
  startedAt: Date.now() - 50000, progress: { pct: 50, done: 5, total: 10 }
};
const readyState = {
  root: '/w/mv',
  projects: [{
    name: 'demo', path: 'demo', width: 1280, height: 720, fps: 30, duration: 21, scenes: 6,
    contact: { path: 'demo/out/contact.png', bytes: 100, mtime: 42 }
  }],
  job: readyJob
};
const readyNodes = walkAll(mod.__internals.popupBody(popupT, 'ready', readyState, retrySpy));
const sections = readyNodes.filter((n) => n.props && typeof n.props['data-section'] === 'string');
ok('就绪态分三节：总览 + 工程管理 + 渲染状态',
  sections.map((n) => n.props['data-section']).join(',') === 'status,projects,render',
  sections.map((n) => n.props['data-section']).join(','));
const overviewRows = readyNodes.filter((n) => n.props && n.props['data-overview-row']);
ok('总览两行：工作区 + 工程（真实数据，不是占位）',
  overviewRows.map((n) => n.props['data-overview-row']).join(',') === 'workspace,projects' &&
  overviewRows[0].props.children[1].props.children === '/w/mv',
  overviewRows.map((n) => n.props['data-overview-row']).join(','));
// ---- 工程管理（统一管理界面的列表）----
const projBtns = readyNodes.filter((n) => n.props && n.props['data-project']);
ok('工程管理：每个工程一行（data-project，点进联系表面板）',
  projBtns.length === 1 && projBtns[0].props['data-project'] === 'demo' &&
  projBtns[0].type === 'button',
  projBtns.map((b) => b.props['data-project']).join(','));
const projKids = walkAll(projBtns[0]);
const projImg = projKids.find((n) => n.type === 'img');
ok('工程行带联系表缩略图（同源真实渲染产物）',
  !!projImg && projImg.props.src.indexOf('/music-mv/api/file?path=demo%2Fout%2Fcontact.png') === 0,
  projImg ? projImg.props.src.slice(0, 60) : 'missing');
const projSpec = projKids.find((n) => n.props && String(n.props.className).indexOf('dshMvProjSpec') >= 0);
ok('工程行显示规格（1280×720 · 30 fps · 21s · 6 场景）',
  !!projSpec && String(projSpec.props.children) === '1280×720 · 30 fps · 21s · 6 场景',
  projSpec ? String(projSpec.props.children) : 'missing');
const projMeta = projKids.find((n) => n.props && String(n.props.className).indexOf('dshMvProjMeta') >= 0);
ok('工程行标出产物状态（有联系表）',
  !!projMeta && String(projMeta.props.children) === '有联系表',
  projMeta ? String(projMeta.props.children) : 'missing');
const openSpyCalls = [];
const readyNodes2 = walkAll(mod.__internals.popupBody(popupT, 'ready', readyState, retrySpy,
  function (v) { openSpyCalls.push(v); }));
const projBtn2 = readyNodes2.find((n) => n.props && n.props['data-project']);
if (projBtn2 && typeof projBtn2.props.onClick === 'function') projBtn2.props.onClick();
ok('点工程行把该工程交给联系表面板（组件里同步选中并跳转）',
  openSpyCalls.length === 1 && openSpyCalls[0] === 'demo', JSON.stringify(openSpyCalls));
const readyJobRows = readyNodes.filter((n) => n.props && n.props['data-job-row']);
ok('渲染状态分条 5 条（任务/进度/速度/预计/状态）', readyJobRows.length === 5,
  readyJobRows.map((n) => n.props['data-job-row']).join(','));
const readyBar = readyNodes.find((n) => n.type === 'progress');
ok('渲染中：原生进度条带真实 value',
  !!readyBar && readyBar.props.value === 50 && readyBar.props['data-job-progress'] === 50 &&
  readyBar.props.max === 100, readyBar ? 'value=' + readyBar.props.value : 'missing');
const idleNodes = walkAll(mod.__internals.popupBody(popupT, 'ready', { root: '/w', projects: [] }, retrySpy));
ok('没任务时不画进度条（不摆装饰动画），分条如实写「暂无渲染任务」',
  !idleNodes.some((n) => n.type === 'progress') &&
  idleNodes.some((n) => n.props && n.props['data-job-row'] === '任务' &&
    n.props.children[1].props.children === '暂无渲染任务'),
  'idle: no bar, honest empty text');

// ---- 联系表二级面板：插件直渲 + 实时进度 + 同源预览 ----
const contactProject = {
  name: 'demo', path: 'demo', width: 1280, height: 720,
  contact: { path: 'demo/out/contact.png', bytes: 100, mtime: 1700000000000 }
};
const rpNodes = walkAll(mod.__internals.renderPanelBody(popupT, {
  phase: 'ready', projects: [contactProject], selectedPath: 'demo', job: readyJob,
  onPick: retrySpy, onRetry: retrySpy
}));
const rpSelect = rpNodes.find((n) => n.type === 'select');
ok('联系表面板：工程下拉（标准标签）+ 实时分条 + 预览图',
  !!rpSelect && rpSelect.props['data-select'] === 'project' &&
  rpNodes.filter((n) => n.props && n.props['data-job-row']).length === 5 &&
  rpNodes.some((n) => n.type === 'img'),
  rpSelect ? rpSelect.props['data-select'] : 'missing');
const rpOption = rpNodes.find((n) => n.type === 'option');
ok('工程选项带规格（名称 · 宽×高）',
  !!rpOption && String(rpOption.props.children).indexOf('demo · 1280×720') === 0,
  rpOption ? String(rpOption.props.children) : 'missing');
const rpImg = rpNodes.find((n) => n.type === 'img');
ok('预览图走同源 /music-mv/api/file（路径 + mtime 防缓存 → 渲完自动换新图）',
  !!rpImg && rpImg.props.src.indexOf('/music-mv/api/file?path=demo%2Fout%2Fcontact.png') === 0 &&
  rpImg.props.src.indexOf('&t=1700000000000') > 0 && typeof rpImg.props.alt === 'string',
  rpImg ? rpImg.props.src : 'missing');
const rpNoContact = walkAll(mod.__internals.renderPanelBody(popupT, {
  phase: 'ready', projects: [{ name: 'x', path: 'x', contact: null }], selectedPath: 'x',
  job: null, onPick: retrySpy, onRetry: retrySpy
}));
ok('还没有联系表时给空态文案（不摆占位图）',
  !rpNoContact.some((n) => n.type === 'img') &&
  rpNoContact.some((n) => n.props && n.props['data-empty'] === 'preview'),
  'honest preview empty state');
const rpNoProjects = walkAll(mod.__internals.renderPanelBody(popupT, {
  phase: 'ready', projects: [], selectedPath: '', job: null, onPick: retrySpy, onRetry: retrySpy
}));
ok('没有可渲染工程时如实写「没有可渲染的工程」',
  rpNoProjects.some((n) => n.props && n.props['data-empty'] === 'projects' &&
    n.props.children === '没有可渲染的工程'), 'empty project list');
const rpOff = walkAll(mod.__internals.renderPanelBody(popupT, {
  phase: 'absent', projects: [], selectedPath: '', job: null, onRetry: retrySpy
}));
ok('联系表面板离线时如实显示离线 + 重试',
  rpOff.some((n) => n.props && n.props['data-offline'] === '1') &&
  rpOff.some((n) => n.props && n.props['data-act'] === 'retry'), 'offline panel');
ok('预览地址构造是纯函数（无工程/无联系表 → 空串）',
  mod.__internals.contactUrl(null) === '' &&
  mod.__internals.contactUrl({ contact: null }) === '', 'contactUrl guards');

// ---- 风格画廊：美术功能的展示图（真实配色）----
const cardInput = {
  presets: [
    { id: 'deepseek', title: 'DeepSeek 蓝黑', summary: '深蓝自发光压在近黑上。', palette: { bg: '#0f0f0f', base: '#4d6bfe', hot: '#ffb020' } },
    { id: 'claude', title: '暖纸', summary: '', palette: null }
  ],
  styles: ['deepseek', 'claude']
};
const cards = mod.__internals.styleCards(cardInput, []);
ok('画廊卡片带出宿主的标题 / 说明 / 配色',
  cards.length === 2 && cards[0].title === 'DeepSeek 蓝黑' &&
  cards[0].palette && cards[0].palette.bg === '#0f0f0f' && cards[0].summary.length > 0,
  cards.map((c) => c.id).join(','));
ok('宿主没给配色的风格不编造颜色（palette 为 null）', cards[1].palette === null, 'no fake palette');
const fbCards = mod.__internals.styleCards(null, ['gpt', 'grok']);
ok('离线退回内置清单（只有 id，无展示图）',
  fbCards.length === 2 && fbCards.every((c) => c.palette === null && c.title === ''),
  fbCards.map((c) => c.id).join(','));
const gallery = walkAll(mod.__internals.styleGallery(popupT, cards, 'deepseek', function () {}));
const galleryGrid = gallery.find((n) => n.props && n.props['data-gallery'] === '1');
const cardBtns = gallery.filter((n) => n.props && n.props['data-style']);
ok('画廊网格 + 每张卡片都是按钮（data-style）',
  !!galleryGrid && cardBtns.length === 2, cardBtns.map((b) => b.props['data-style']).join(','));
const onCard = cardBtns.find((b) => b.props['data-style'] === 'deepseek');
const offCard = cardBtns.find((b) => b.props['data-style'] === 'claude');
ok('选中卡片高亮 + aria-pressed',
  !!onCard && String(onCard.props.className).indexOf('dshMvCardOn') >= 0 &&
  onCard.props['aria-pressed'] === true &&
  !!offCard && String(offCard.props.className).indexOf('dshMvCardOn') < 0,
  onCard ? String(onCard.props.className) : 'missing');
const showcaseMap = mod.__internals.showcase;
const showcaseIds = Object.keys(showcaseMap);
ok('展示图内嵌：preset 缩略以 data URI 落进客户端（256×144 WebP，离线可用、无需宿主路由）',
  showcaseIds.length >= 16 && showcaseIds.includes('deepseek') && showcaseIds.includes('claude') &&
  showcaseIds.every((k) => showcaseMap[k].indexOf('data:image/webp;base64,') === 0),
  showcaseIds.length + ' images');
const art = walkAll(onCard).find((n) => n.props && String(n.props.className).indexOf('dshMvCardArt') >= 0);
ok('展示图：画廊卡片用内嵌真图（data-showcase）',
  !!art && art.type === 'img' && art.props['data-showcase'] === '1' &&
  String(art.props.src).indexOf('data:image/webp;base64,') === 0,
  art ? String(art.props.src).slice(0, 32) : 'missing');
const demoGallery = walkAll(mod.__internals.styleGallery(popupT, [
  { id: 'demo-style', title: 'Demo', summary: '', palette: { bg: '#101010', base: '#202020', hot: '#303030' } }
], 'demo-style', function () {}));
const demoArt = demoGallery.find((n) => n.props && String(n.props.className).indexOf('dshMvCardArt') >= 0);
ok('没有内嵌图的风格回落到配色渐变（宿主真实配色）',
  !!demoArt && demoArt.type === 'span' && demoArt.props.style &&
  String(demoArt.props.style.background).indexOf('#101010') >= 0,
  demoArt ? String(demoArt.props.style && demoArt.props.style.background).slice(0, 50) : 'missing');
const summary = gallery.find((n) => n.props && n.props['data-style-summary'] !== undefined);
ok('选中风格下面挂它的说明（分级信息）',
  !!summary && summary.props['data-style-summary'] === 'deepseek' &&
  String(summary.props.children) === '深蓝自发光压在近黑上。',
  summary ? String(summary.props.children) : 'missing');
const offGallery = walkAll(mod.__internals.styleGallery(popupT, [{ id: 'x', title: '', summary: '', palette: null }], 'x', function () {}));
const offArt = offGallery.find((n) => n.props && String(n.props.className).indexOf('dshMvCardArtOff') >= 0);
ok('没有配色时给灰块 + 如实标注「离线：没有配色展示」',
  !!offArt && offGallery.some((n) => n.props && n.props.children === '离线：没有配色展示'),
  offArt ? 'off swatch' : 'missing');

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
ok('弹层轮询：有任务 700ms / 无任务 2500ms，关闭即 clearTimeout',
  SRC.includes('schedule(running ? 700 : 2500)') && SRC.includes('clearTimeout(timer)') &&
  !SRC.includes('setInterval(refresh'), 'poll wiring + cleanup');
ok('重试重挂轮询（retry 计数是 effect 依赖）',
  SRC.includes('}, [retryState[0]]);') && SRC.includes("data-act': 'retry'"), 'retry dep wired');
ok('同源状态通道：postMessage 显式 origin、监听先核对 origin、绝不通配',
  SRC.includes('window.postMessage(') && SRC.includes('ev.origin !== location.origin') &&
  /postMessage\([^)]*origin\s*\)/.test(SRC) && !/postMessage\([^)]*,\s*'\*'\s*\)/.test(SRC) &&
  SRC.includes('broadcastState(next)'), 'same-origin channel');

// ---- 开工前选预设 / presets picked before kickoff ----
const optsTree = mod.__internals.EntryPopup({
  t: popupT, ctx: ctx, openStudio: function () { return 'tab'; }, onClose: function () {}
});
const optsNodes = walkAll(optsTree);
const optsRoot = optsNodes.find((n) => n.props && n.props['data-music-mv-opts'] === '1');
ok('弹层里有开工预设区（在动作按钮之前）', !!optsRoot, optsRoot ? 'present' : 'missing');
const selects = optsNodes.filter((n) => n.type === 'select');
ok('三个下拉：清晰度 + 风格 + 帧率（标准标签，非自定义元素）',
  selects.length === 3 && selects[0].props['data-select'] === 'tier' &&
  selects[1].props['data-select'] === 'style' && selects[2].props['data-select'] === 'fps',
  selects.map((s) => s.props['data-select']).join(','));
const strip = optsNodes.find((n) => n.props && n.props['data-showcase'] === 'strip');
ok('预设区带选中风格的展示图（默认 deepseek → 内嵌真图）',
  !!strip && strip.type === 'img' && String(strip.props.src).indexOf('data:image/webp;base64,') === 0,
  strip ? String(strip.props.src).slice(0, 32) : 'missing');
const fpsSelect = selects[2];
const fpsValues = Array.isArray(fpsSelect.props.children) ? fpsSelect.props.children.map((o) => o.props.value) : [];
ok('帧率第一项是「跟随工程」（没选就不写进提示词，不编造）',
  fpsValues[0] === '' && String(fpsSelect.props.children[0].props.children) === '跟随工程',
  fpsValues.join(','));
ok('帧率档覆盖常用值（24/30/60/120），显示成「30 fps」',
  fpsValues.includes('30') && fpsValues.includes('60') && fpsValues.includes('120') &&
  fpsSelect.props.children.some((o) => o.props.children === '30 fps'),
  fpsValues.join(','));
ok('清晰度档用宿主 RENDER_TIERS 的中文标题（内置兜底）',
  optsNodes.some((n) => n.type === 'option' && String(n.props.children).indexOf('480×270') >= 0) &&
  optsNodes.some((n) => n.type === 'option' && String(n.props.children).indexOf('3840×2160') >= 0),
  'tier titles present');
ok('风格清单覆盖 16 个预设 id（内置兜底）',
  mod.__internals.FALLBACK_STYLES.length === 16 &&
  optsNodes.some((n) => n.type === 'option' && n.props.value === 'deepseek'),
  mod.__internals.FALLBACK_STYLES.length + ' style ids');
ok('帧率内置清单以「跟随工程」打头',
  mod.__internals.FALLBACK_FPS[0] === '' && mod.__internals.FALLBACK_FPS.includes(30),
  JSON.stringify(mod.__internals.FALLBACK_FPS));
ok('字典含分条与预设的中英文案（中文优先）',
  ['popup.progress', 'popup.speed', 'popup.eta', 'popup.state',
    'popup.kickoffOpts', 'popup.tier', 'popup.style', 'popup.fps', 'popup.fpsFollow',
    'popup.offlinePresets', 'popup.styles', 'popup.stylesPanel', 'popup.noSwatch', 'popup.styleNone',
    'popup.renderStart', 'popup.renderCancel', 'popup.preview', 'popup.previewNone',
    'popup.section.projects', 'popup.hasContact', 'popup.hasVideo',
    'popup.fullscreen', 'popup.exitFullscreen']
    .every((k) => typeof calls.dictionaries.dict.zh[k] === 'string' &&
      typeof calls.dictionaries.dict.en[k] === 'string') &&
  calls.dictionaries.dict.zh['popup.progress'] === '进度' &&
  calls.dictionaries.dict.en['popup.progress'] === 'Progress' &&
  calls.dictionaries.dict.zh['popup.fps'] === '帧率' &&
  calls.dictionaries.dict.zh['popup.section.projects'] === '工程管理',
  'zh-first + en mirrored');

const kickExtra = mod.__internals.kickoffExtra('标准 1280×720', 'deepseek');
ok('预设写进开工提示词',
  kickExtra.indexOf('交付分辨率：标准 1280×720') === 0 &&
  kickExtra.indexOf('风格预设：deepseek') > 0, kickExtra);
ok('帧率也写进开工提示词（选了才写）',
  mod.__internals.kickoffExtra('', '', '60') === '帧率：60fps。' &&
  mod.__internals.kickoffExtra('标准 1280×720', 'deepseek', '60').endsWith('帧率：60fps。'),
  mod.__internals.kickoffExtra('', '', '60'));
ok('没选的项不编造', mod.__internals.kickoffExtra('', '') === '' &&
  mod.__internals.kickoffExtra('', 'gpt') === '风格预设：gpt。' &&
  mod.__internals.kickoffExtra('', '', '') === '',
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
const kickFps = mod.__internals.kickoffExtra('', '', '60');
await mod.__internals.startTeammate(ctxNative2, kickFps);
ok('原生开工把帧率一并带进提示词',
  spawnArgs2.length === 2 && String(spawnArgs2[1].prompt).indexOf('帧率：60fps') > 0,
  spawnArgs2.length > 1 ? String(spawnArgs2[1].prompt).slice(-30) : 'no spawn');
ok('预设清单取自同源宿主接口，离线才用内置并如实标注',
  SRC.includes("API_BASE + '/presets'") && SRC.includes("'popup.offlinePresets'") &&
  SRC.includes('FALLBACK_STYLES'), 'preset source + honest offline note');

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
