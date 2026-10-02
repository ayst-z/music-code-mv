/**
 * dsh-music-code-mv — 浏览器半边 / client half.
 *
 * 控制面板（分级 UI，全标准 DOM + DSH 设计令牌）：
 * 1) 对话视图环的「MV 工坊」标签页（与对话/轨迹平级，conversation.view）= 唯一操作面：
 *    顶部**一键进入子代理**（hero 大按钮 + 当前预设一行），状态分区（原生 <progress>）、
 *    开工预设（清晰度[含自定义 + 横竖屏切换]/风格[中文选项]/帧率），两个二级面板：
 *    联系表直渲（插件自己 POST /music-mv/api/render，实时进度 + 同源 <img> 预览）与
 *    风格画廊（每张卡片带内嵌展示图）。标题栏 codeMV 小按钮已按用户要求移除。
 * 2) 右侧边栏「MV 工坊」页面 = 原生 DOM 状态镜像 + 离线降级交接（把要求交给模型）。
 * 按用户要求零网页对接：面板不内嵌任何页面、UI 里没有 window.open。
 *
 * 手写 ModuleLoader 包（见 dsh-client-modules 的 __ModuleLoader__.load 约定），
 * 因此本包不需要任何构建步骤：dsh plugin add 之后即可用。
 *
 * Tiered native control panel: a title-bar popup (status, presets, contact-sheet
 * render panel, style gallery) plus a native sidebar status page with an offline
 * hand-off. No embedded web pages, no bundler, no build step.
 */
window.__ModuleLoader__.load({
  id: 'dsh-music-code-mv',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var h = React.createElement;

    /** 文案命名空间 / copy namespace. */
    var NS = 'musicCodeMv';
    /** 页面类型 id 与 kind（侧栏原生状态页用；功能面板在弹层里）/ page type identity. */
    var STUDIO_ID = 'dsh-music-code-mv';
    var STUDIO_KIND = 'music-mv-studio';
    /** 打开记忆键：自动打开只发生一次 / auto-open happens once per browser. */
    var OPENED_KEY = 'dsh-music-code-mv.studio.opened';

    var zh = {
      'type.label': 'MV 工坊',
      'guide.title': 'MV 工坊',
      'guide.description': '看工程、看联系表与成片、直接开始渲染',
      'tab.title': 'MV 工坊',
      'action.reload': '刷新',
      'state.loading': '正在读取宿主状态…',
      'fallback.title': 'MV 工坊（离线模式）',
      'fallback.noService': '这个 profile 里没有 webServer，状态与渲染接口都读不到；下面的按钮不联网也能把要求交给模型。',
      'fallback.handoff': '把要求交给模型',
      'fallback.handoffSent': '已把要求交给当前会话',
      'fallback.handoffClipboard': '会话不可用：指令已复制到剪贴板',
      'sidebar.hint': '操作、开工预设与联系表渲染都在「MV 工坊」标签页里（与对话/轨迹同级）；这个页面只显示状态。',
      'entry.label': 'codeMV',
      'entry.tooltip': 'codeMV · MV 工坊 / MV Studio',
      'entry.offline': 'MV 工坊（离线：宿主接口不可达，弹层里会如实显示离线）',
      // 状态区：读取中 / 已连接 / 离线，一句话说清面板现在能不能信 / connection pill
      'popup.connProbe': '读取中',
      'popup.connOk': '已连接',
      'popup.connOff': '离线',
      'popup.probing': '正在读取宿主状态…',
      'popup.offline': '离线：宿主接口不可达，工作区与渲染状态读取失败（不显示占位数据）。',
      'popup.offlineHint': '宿主接口不通时，「以队友/子代理开工」仍可用（四级降级，最终把要求交给当前会话或剪贴板）；联系表渲染与复制路径依赖宿主接口，会如实报失败。',
      'popup.offlineRender': '离线：渲染状态读不到，不显示占位数据。',
      'popup.retry': '重试',
      // 进度行的「剩余」显示：运行中给实测剩余时间，覆盖率行给剩余帧数，完成/算不出如实标注
      'popup.remainTime': '剩余 {v}',
      'popup.remainFrames': '剩 {n} 帧',
      'popup.remainDone': '已完成',
      // 创建预设 = AI 智能体操作：把指令交给模型，会话不可用就复制
      'popup.createPreset': '创建预设',
      'popup.presetSent': '已把「创建预设」交给当前会话（AI 智能体操作）',
      'popup.presetClipboard': '会话不可用：创建预设指令已复制到剪贴板',
      // 分区标题：总览 / 工程进度 / 渲染状态 / 开工预设 / 操作 / section titles
      'popup.section.status': '总览',
      'popup.section.progress': '工程进度',
      'popup.section.render': '渲染状态',
      'popup.hasContact': '有联系表',
      'popup.hasVideo': '有成片',
      'popup.workspace': '工作区',
      'popup.projects': '工程',
      'popup.job': '任务',
      'popup.projectsValue': '{count} 个工程',
      'popup.jobNone': '暂无渲染任务',
      'popup.jobRunning': '渲染中 {pct}%',
      'popup.jobDone': '上次渲染完成',
      'popup.jobError': '上次渲染失败',
      'popup.jobCancelled': '上次渲染已取消',
      'popup.progress': '进度',
      'popup.speed': '速度',
      'popup.eta': '预计',
      'popup.state': '状态',
      'popup.kickoffOpts': '开工预设（会写进提示词）',
      'popup.tier': '清晰度',
      'popup.tierCustom': '自定义',
      'popup.orientation': '横竖屏切换',
      'popup.w': '宽',
      'popup.h': '高',
      'popup.style': '风格',
      'popup.fps': '帧率',
      'popup.fpsFollow': '跟随工程',
      'popup.offlinePresets': '离线：用内置预设清单',
      'popup.actions': '操作',
      'popup.teammate': '以队友/子代理开工',
      'popup.heroStart': '一键进入子代理',
      'popup.heroSub': '以队友/子代理形式在当前上下文开工：四级降级（原生→宿主→当前会话→剪贴板），每一级都如实回报。',
      'popup.heroChips': '当前预设：',
      'popup.heroNoPresets': '未选预设：按工程默认开工。',
      'popup.teammateNative': '已通过宿主原生服务开工（teammate/subagent）',
      'popup.teammateHost': '已交给宿主接口开工（teammate/subagent）',
      'popup.teammateCurrent': '已在当前会话发出开工指令：以子代理/队友形式执行',
      'popup.teammateClipboard': '开工指令已复制到剪贴板',
      'popup.teammateNone': '开不了工：宿主没有可用接口，剪贴板也不可用。',
      'popup.render': '渲染联系表',
      'popup.renderPanel': '渲染联系表',
      'popup.renderSent': '渲染请求已提交',
      'popup.renderFailed': '渲染请求失败（宿主接口不可用）',
      'popup.renderNone': '没有可渲染的工程',
      'popup.renderProject': '选择工程',
      'popup.renderStart': '开始渲染',
      'popup.renderCancel': '取消渲染',
      'popup.cancelled': '已请求取消渲染',
      'popup.cancelFailed': '取消失败：宿主接口不可用',
      'popup.cancelNothing': '没有正在跑的渲染任务',
      'popup.styles': '风格画廊',
      'popup.stylesPanel': '风格画廊',
      'popup.noSwatch': '离线：没有配色展示',
      'popup.styleNone': '选一个风格，这里会显示它的配色与说明。',
      'popup.back': '返回',
      'popup.preview': '预览',
      'popup.previewNone': '还没有联系表：选好工程点「开始渲染」，渲染完这里自动出图。',
      'popup.copyPath': '复制工作区路径',
      'popup.copied': '已复制工作区路径',
      'popup.copyFailed': '复制失败：当前拿不到工作区路径'
    };
    var en = {
      'type.label': 'MV Studio',
      'guide.title': 'MV Studio',
      'guide.description': 'Browse projects, review contact sheets and films, render right here',
      'tab.title': 'MV Studio',
      'action.reload': 'Refresh',
      'state.loading': 'Reading host state…',
      'fallback.title': 'MV Studio (offline mode)',
      'fallback.noService': 'This profile has no webServer, so state and render APIs are unreachable; the buttons below hand the request to the model without any network.',
      'fallback.handoff': 'Hand the request to the model',
      'fallback.handoffSent': 'Request handed to the current session',
      'fallback.handoffClipboard': 'No session available: the instruction was copied to the clipboard',
      'sidebar.hint': 'Actions, kickoff presets and contact-sheet rendering live in the "MV Studio" tab (peer of Chat/Trajectory); this page only shows status.',
      'entry.label': 'codeMV',
      'entry.tooltip': 'codeMV · MV Studio / MV 工坊',
      'entry.offline': 'MV Studio (offline: host API unreachable — the popup says so honestly)',
      'popup.connProbe': 'Reading',
      'popup.connOk': 'Connected',
      'popup.connOff': 'Offline',
      'popup.probing': 'Reading host state…',
      'popup.offline': 'Offline: host API unreachable — workspace and render state cannot be read (no placeholder data shown).',
      'popup.offlineHint': 'While the host API is down, "Start as teammate / subagent" still works (four-stage fallback ending in the current session or clipboard — the request reaches the model); contact-sheet rendering and path copy depend on the host API and fail honestly.',
      'popup.offlineRender': 'Offline: render status unavailable — no placeholder data shown.',
      'popup.retry': 'Retry',
      'popup.remainTime': 'Remaining {v}',
      'popup.remainFrames': '{n} frames left',
      'popup.remainDone': 'Done',
      'popup.createPreset': 'Create preset',
      'popup.presetSent': 'Preset creation handed to the current session (AI agent operation)',
      'popup.presetClipboard': 'No session available: the preset-creation instruction was copied to the clipboard',
      'popup.section.status': 'Overview',
      'popup.section.progress': 'Project progress',
      'popup.section.render': 'Render status',
      'popup.hasContact': 'Contact sheet ready',
      'popup.hasVideo': 'Video ready',
      'popup.workspace': 'Workspace',
      'popup.projects': 'Projects',
      'popup.job': 'Job',
      'popup.projectsValue': '{count} projects',
      'popup.jobNone': 'No render job yet',
      'popup.jobRunning': 'Rendering {pct}%',
      'popup.jobDone': 'Last render finished',
      'popup.jobError': 'Last render failed',
      'popup.jobCancelled': 'Last render cancelled',
      'popup.progress': 'Progress',
      'popup.speed': 'Speed',
      'popup.eta': 'ETA',
      'popup.state': 'State',
      'popup.kickoffOpts': 'Kickoff presets (written into the prompt)',
      'popup.tier': 'Quality',
      'popup.tierCustom': 'Custom',
      'popup.orientation': 'Toggle orientation',
      'popup.w': 'Width',
      'popup.h': 'Height',
      'popup.style': 'Style',
      'popup.fps': 'Frame rate',
      'popup.fpsFollow': 'Follow the project',
      'popup.offlinePresets': 'Offline: using the built-in preset list',
      'popup.actions': 'Actions',
      'popup.teammate': 'Start as teammate / subagent',
      'popup.heroStart': 'Enter subagent — one click',
      'popup.heroSub': 'Kick off as teammate/subagent in this context: four-stage fallback (native → host → current session → clipboard), each stage reported honestly.',
      'popup.heroChips': 'Presets: ',
      'popup.heroNoPresets': 'No presets selected: starts with the project defaults.',
      'popup.teammateNative': 'Started through the host native service (teammate/subagent)',
      'popup.teammateHost': 'Handed to the host interface (teammate/subagent)',
      'popup.teammateCurrent': 'Kickoff instruction sent to the current session: run as subagent/teammate',
      'popup.teammateClipboard': 'Kickoff instruction copied to the clipboard',
      'popup.teammateNone': 'Cannot start: no host interface available and the clipboard is unavailable.',
      'popup.render': 'Render contact sheet',
      'popup.renderPanel': 'Contact sheet',
      'popup.renderSent': 'Render request submitted',
      'popup.renderFailed': 'Render request failed (host API unavailable)',
      'popup.renderNone': 'No project to render',
      'popup.renderProject': 'Project',
      'popup.renderStart': 'Start render',
      'popup.renderCancel': 'Cancel render',
      'popup.cancelled': 'Cancel requested',
      'popup.cancelFailed': 'Cancel failed: host API unavailable',
      'popup.cancelNothing': 'No render job is running',
      'popup.styles': 'Style gallery',
      'popup.stylesPanel': 'Style gallery',
      'popup.noSwatch': 'Offline: no palette to show',
      'popup.styleNone': 'Pick a style to see its palette and description.',
      'popup.back': 'Back',
      'popup.preview': 'Preview',
      'popup.previewNone': 'No contact sheet yet: pick a project and press "Start render" — the preview appears here automatically.',
      'popup.copyPath': 'Copy workspace path',
      'popup.copied': 'Workspace path copied',
      'popup.copyFailed': 'Copy failed: no workspace path available'
    };

    // ───────────────────── 同源状态通道 / same-origin state channel ─────────────────────
    /**
     * 面板状态只在**同一个窗口、同一个 origin**内回环：弹层每轮询到一次实测状态就广播一次，
     * 监听方先核对 origin 再核对 source；重开弹层时用上一次的真实状态即时回填（随后照常轮询刷新）。
     * postMessage 永远显式指定 origin，绝不使用通配目标。
     * Same-window, same-origin state channel: explicit origin, never a wildcard target.
     */
    var MESSAGE_SOURCE = 'dsh-music-code-mv';
    /** 最近一次广播的实测状态；null = 还没读到过（不是占位数据）。 */
    var lastState = null;

    function broadcastState(state) {
      try {
        if (typeof window === 'undefined' || typeof window.postMessage !== 'function') return;
        var origin = (typeof location !== 'undefined' && location.origin) || '';
        if (!origin || origin === 'null') return;
        window.postMessage({ source: MESSAGE_SOURCE, type: 'state', state: state }, origin);
      } catch (e) { /* 广播失败不影响轮询本身 / broadcasting is best effort */ }
    }

    function onPanelMessage(ev) {
      try {
        if (!ev || typeof location === 'undefined' || ev.origin !== location.origin) return;
        var d = ev.data;
        if (!d || d.source !== MESSAGE_SOURCE || d.type !== 'state') return;
        lastState = d.state || null;
      } catch (e) { /* 脏消息直接忽略 / ignore malformed messages */ }
    }

    // ───────────────────────── 宿主 API 助手 / host API helpers ─────────────────────────
    var API_BASE = '/music-mv/api';
    var API_HEADERS = { 'x-music-mv': 'studio' };

    function apiGet(pathname) {
      return fetch(API_BASE + pathname, { headers: API_HEADERS }).then(function (r) { return r.json(); });
    }
    function apiPost(pathname, body) {
      return fetch(API_BASE + pathname, {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, API_HEADERS),
        body: JSON.stringify(body || {})
      }).then(function (r) { return r.json(); });
    }
    /** 最近有产物的工程，弹层的渲染动作拿它当默认目标。 */
    function newestProject(list) {
      var best = null, bestAt = -1;
      (list || []).forEach(function (p) {
        var at = Math.max(p.contact ? p.contact.mtime : 0, p.video ? p.video.mtime : 0);
        if (at > bestAt) { bestAt = at; best = p; }
      });
      return best || (list && list[0]) || null;
    }

    /** skill 的调用形式：首条消息就带 /music-code-mv，宿主会据此装载 skill。 */
    var SKILL_COMMAND = '/music-code-mv';

    /**
     * 离线交接的首条消息：宿主接口（webServer）不可达时，把用户关于 MV 工坊的请求直接交给模型。
     * 联系表渲染不走这条路 —— 那是插件自渲染的二级面板（用户明确要求不经过模型）。
     */
    var HANDOFF_PROMPT = SKILL_COMMAND +
      ' 宿主接口不可达（离线模式）：请把用户关于 MV 工坊的请求接过去——先读 guide 与 presets，能推进的直接推进，做不到的如实说明。';

    /**
     * 「创建预设」交给模型的首条消息（AI 智能体操作）：
     * 按 skill 的预设契约生成新风格，自检通过后即可在「风格画廊」里选用。
     */
    var CREATE_PRESET_PROMPT = SKILL_COMMAND +
      ' 创建一个新的风格预设：先读 skill/reference/presets.md 与 presets/ 现有预设的结构' +
      '（palette、storyboard 分镜、占位歌词、fx、duration），起一个不冲突的 id，' +
      '生成完整 JSON 写进 skill/presets/，跑 python skill/scripts/audit-presets.py 自检通过，' +
      '最后把 id 告诉我 —— 我在「MV 工坊 → 风格画廊」里选它就能用。';

    function lastWorkspaceId(ctx) {
      try {
        var ws = ctx.get('workspaces');
        var snap = ws.list.getSnapshot();
        var items = (snap && snap.items) || [];
        return items.length ? (items[items.length - 1].workspaceId || '') : '';
      } catch (e) { return ''; }
    }

    function lastSessionId(ctx) {
      try {
        var sessions = ctx.get('sessions');
        var snap = sessions.list.getSnapshot();
        var ids = (snap && snap.ids) || [];
        return ids.length ? ids[ids.length - 1] : '';
      } catch (e) { return ''; }
    }

    /** 用会话作用域拿 conversation，root 作用域是发不出去的。 */
    function scopedConversation(ctx, sessionId) {
      try {
        var sessions = ctx.get('sessions');
        if (!sessions || typeof sessions.scope !== 'function') return null;
        var scope = sessions.scope(sessionId);
        if (!scope) return null;
        var conv = typeof scope.get === 'function' ? scope.get('conversation') : scope.conversation;
        return conv && typeof conv.send === 'function' ? conv : null;
      } catch (e) { return null; }
    }

    /**
     * 一键开启对话：新建/复用会话 → 前端导航过去 → 首条消息发 /music-code-mv。
     * 逐级降级，最后一档是把命令复制到剪贴板，绝不留下一个没反应的按钮。
     */
    async function askAgent(ctx, text) {
      var sessions = null, uiWorkspace = null;
      try { sessions = ctx.get('sessions'); } catch (e) { /* optional */ }
      try { uiWorkspace = ctx.get('uiWorkspace'); } catch (e) { /* optional */ }
      var workspaceId = lastWorkspaceId(ctx);
      var sessionId = '';
      try { if (sessions && workspaceId) sessionId = await sessions.create({ workspaceId: workspaceId }); } catch (e) { /* fall through */ }
      if (!sessionId) sessionId = lastSessionId(ctx);
      try {
        if (sessionId && uiWorkspace && typeof uiWorkspace.openSession === 'function') uiWorkspace.openSession(sessionId);
        else if (uiWorkspace && typeof uiWorkspace.startSession === 'function') uiWorkspace.startSession(workspaceId || undefined);
      } catch (e) { /* navigation is best effort */ }
      if (sessionId) {
        var scoped = scopedConversation(ctx, sessionId);
        if (scoped) {
          try { await scoped.send(text); return { ok: true, mode: 'session' }; } catch (e) { /* fall through */ }
        }
      }
      try {
        var conv = ctx.get('conversation');
        if (conv && typeof conv.send === 'function') { await conv.send(text); return { ok: true, mode: 'current' }; }
      } catch (e) { /* fall through */ }
      try { await navigator.clipboard.writeText(text || (SKILL_COMMAND + ' ')); } catch (e) { /* clipboard may be blocked */ }
      return { ok: false, mode: 'clipboard' };
    }




    // ---- 侧栏「MV 工坊」页面：原生 DOM 状态镜像 / sidebar page, native DOM only ----
    /** 侧栏工具条：标题 + 刷新；不放「在浏览器打开/复制地址」——用户要求零网页对接。 */
    function Toolbar(props) {
      var t = props.t;
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
          borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2))',
          fontSize: '12px', flex: '0 0 auto'
        }
      }, [
        h('strong', { key: 'title', style: { fontWeight: 600, letterSpacing: '.04em' } }, t('tab.title')),
        h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
        h('button', {
          key: 'reload', type: 'button', className: 'dshMvAct dshMvActInline',
          onClick: props.onReload
        }, t('action.reload'))
      ]);
    }

    /**
     * 侧栏页面主体（原生 DOM 版）：状态镜像 + 离线降级交接。
     * 不内嵌任何网页、不提供「在浏览器打开」—— 按用户要求「不要有任何网页对接」；
     * 功能面板（开工预设、联系表渲染、复制路径）全部在标题栏 codeMV 弹层里。
     * Offline branch still hands the request to the model — without any network.
     */
    function StudioBody(props) {
      var t = props.t;
      var svcState = React.useState('probing'); // probing | ready | absent
      var svc = svcState[0];
      var setSvc = svcState[1];
      var dataState = React.useState(null);
      var data = dataState[0];
      var nonceState = React.useState(0);
      var nonce = nonceState[0];
      var noticeState = React.useState('');
      var notice = noticeState[0];

      /** 与弹层同一节奏：有任务 700ms、无任务 2500ms；卸载即停，绝不在后台空转。 */
      React.useEffect(function () {
        if (typeof fetch !== 'function') { setSvc('absent'); return undefined; }
        var alive = true;
        var timer = null;
        function schedule(ms) { if (alive) timer = setTimeout(tick, ms); }
        function tick() {
          fetch('/music-mv/api/state', { headers: { 'x-music-mv': 'studio' } })
            .then(function (r) { if (!r.ok) throw new Error('state ' + r.status); return r.json(); })
            .then(function (d) {
              if (!alive) return;
              dataState[1](d || null);
              setSvc('ready');
              schedule(d && d.job && d.job.status === 'running' ? 700 : 2500);
            })
            .catch(function () { if (alive) { setSvc('absent'); schedule(2500); } });
        }
        schedule(200);
        return function () { alive = false; if (timer) clearTimeout(timer); };
      }, [nonce]);

      /** 离线开工：四级降级链，每一级如实回报（链路终点就是把提示词交给模型）。 */
      function onKickoff() {
        Promise.resolve()
          .then(function () { return props.onKickoff ? props.onKickoff() : { ok: false, mode: 'none' }; })
          .then(function (res) {
            noticeState[1](res && KICKOFF_NOTICE[res.mode] ? t(KICKOFF_NOTICE[res.mode]) : t('popup.teammateNone'));
          }, function () { noticeState[1](t('popup.teammateNone')); });
      }

      /** 离线交接：不联网，把请求交给当前会话（拿不到会话就复制指令）。 */
      function onHandoff() {
        Promise.resolve()
          .then(function () { return props.onHandoff ? props.onHandoff() : { ok: false, mode: 'clipboard' }; })
          .then(function (res) {
            noticeState[1](res && res.ok ? t('fallback.handoffSent') : t('fallback.handoffClipboard'));
          }, function () { noticeState[1](t('fallback.handoffClipboard')); });
      }

      var kids = [h(Toolbar, { key: 'bar', t: t, onReload: function () { nonceState[1](nonce + 1); } })];
      var body = null;
      if (svc === 'probing') {
        body = h('div', { key: 'probe', className: 'dshMvDim' }, t('state.loading'));
      } else if (svc === 'absent') {
        body = h('div', {
          key: 'offline', 'data-sidebar-offline': '1',
          style: { padding: '14px', fontSize: '12px', lineHeight: 1.8 }
        }, [
          h('div', { key: 'title', style: { fontWeight: 600, marginBottom: '6px' } }, t('fallback.title')),
          h('div', { key: 'hint', className: 'dshMvDim' }, t('fallback.noService')),
          h('div', { key: 'acts', style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
            h('button', {
              key: 'tm', type: 'button', className: 'dshMvAct', onClick: onKickoff
            }, t('popup.teammate')),
            h('button', {
              key: 'ho', type: 'button', className: 'dshMvAct', onClick: onHandoff
            }, t('fallback.handoff'))
          ])
        ]);
      } else {
        var projects = data && Array.isArray(data.projects) ? data.projects : [];
        var job = data && data.job ? data.job : null;
        var rows = [
          ['ws', t('popup.workspace'), String((data && data.root) || '—')],
          ['pj', t('popup.projects'), String(t('popup.projectsValue')).replace('{count}', projects.length)],
          ['job', t('popup.job'), jobLine(t, job)]
        ];
        var ready = [];
        for (var i = 0; i < rows.length; i++) {
          ready.push(h('div', { key: rows[i][0], className: 'dshMvRow' }, [
            h('span', { key: 'k', className: 'dshMvKey' }, rows[i][1]),
            h('span', { key: 'v', className: 'dshMvVal', title: rows[i][2] }, rows[i][2])
          ]));
        }
        var bar = progressNode(t, job);
        if (bar) ready.push(bar);
        ready.push(h('div', { key: 'hint', className: 'dshMvDim', 'data-sidebar-hint': '1' }, t('sidebar.hint')));
        body = h('div', { key: 'ready', style: { padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' } }, ready);
      }
      kids.push(body);
      if (notice) kids.push(h('div', { key: 'notice', className: 'dshMvNotice', 'data-notice': '1', 'aria-live': 'polite' }, notice));
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: '12px' }
      }, kids);
    }

    // ---- 面板样式：标签页是唯一外壳，样式只注入一次 / panel styles, injected once ----
    /** 样式只注入一次，重复载入留同一份 / one style node per page. */
    var ENTRY_STYLE_ID = 'dsh-music-code-mv-entry-style';
    /** 三区结构：固定头部（标题 + 连接状态）/ 可滚动主体（分区状态）/ 固定动作区（主按钮钉底）。 */
    var ENTRY_CSS =
      '.dshMvPopup{position:relative;box-sizing:border-box;display:flex;flex-direction:column;' +
      'height:100%;min-height:0;overflow:hidden;container-type:inline-size;border:0;' +
      'color:var(--dsw-alias-label-primary, #f9fafb);' +
      'font:13px/1.5 var(--dsw-font-family, system-ui, sans-serif);' +
      'animation:dshMvPop .16s ease-out;}' +
      '.dshMvPopup:focus{outline:none;}' +
      '.dshMvHead{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:10px 10px 8px;}' +
      '.dshMvTitle{font-weight:600;letter-spacing:.02em;}' +
      /* 连接状态药丸：读取中 / 已连接 / 离线，颜色之外还有文字，不靠颜色单独传达状态 */
      '.dshMvPill{font-size:10px;line-height:1;padding:3px 6px;border-radius:var(--dsw-radius-xl, 999px);' +
      'border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));' +
      'color:var(--dsw-alias-label-tertiary, #adb2b8);white-space:nowrap;}' +
      '.dshMvPill[data-state="ready"]{color:var(--dsw-alias-state-success-primary, #2f9e63);' +
      'border-color:var(--dsw-alias-state-success-primary, #2f9e63);}' +
      '.dshMvPill[data-state="absent"]{color:var(--dsw-alias-state-error-primary, #e5484d);' +
      'border-color:var(--dsw-alias-state-error-primary, #e5484d);}' +
      '.dshMvSpacer{flex:1 1 auto;}' +
      '.dshMvBody{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:0 10px 10px;}' +
      /* 视觉分组：主体里每相邻两块之间一条分隔线，块内是「标签—值」行 */
      '.dshMvBody>*+*{border-top:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));padding-top:8px;}' +
      '.dshMvSection,.dshMvPhase{display:flex;flex-direction:column;gap:6px;}' +
      '.dshMvSectionTitle{font-size:11px;font-weight:600;letter-spacing:.06em;' +
      'color:var(--dsw-alias-label-tertiary, #adb2b8);}' +
      '.dshMvRow{display:flex;gap:8px;align-items:baseline;justify-content:space-between;}' +
      '.dshMvKey{color:var(--dsw-alias-label-tertiary, #adb2b8);flex:none;}' +
      '.dshMvVal{color:var(--dsw-alias-label-secondary, #9aa3ad);max-width:190px;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap;text-align:right;}' +
      '.dshMvDim,.dshMvHint,.dshMvNotice{color:var(--dsw-alias-label-tertiary, #adb2b8);font-size:11px;}' +
      '.dshMvHint,.dshMvNotice{line-height:1.6;}' +
      '.dshMvError{color:var(--dsw-alias-state-error-primary, #e5484d);font-size:11px;line-height:1.6;}' +
      /* 原生进度条：渲染中用真实 value，读取中不给 value（浏览器画不确定态），没任务就不画 */
      '.dshMvProgress{box-sizing:border-box;width:100%;height:6px;border:0;margin-top:2px;' +
      'border-radius:var(--dsw-radius-sm, 6px);background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.18));' +
      'accent-color:var(--dsw-alias-state-business-primary, var(--dsw-static-deepseek-500, #4176e6));}' +
      '.dshMvFoot{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px;' +
      'border-top:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));}' +
      '.dshMvActions{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}' +
      '.dshMvAct{box-sizing:border-box;width:100%;text-align:left;font:inherit;cursor:pointer;padding:6px 8px;' +
      'border-radius:var(--dsw-radius-sm, 6px);color:var(--dsw-alias-label-secondary, #9aa3ad);background:transparent;' +
      'border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));}' +
      '.dshMvAct:hover,.dshMvAct:focus-visible{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvAct:disabled{opacity:.5;cursor:default;}' +
      /* 主动作实底：整块弹层里唯一一个填充按钮，主次一眼可分 */
      '.dshMvActPrimary{color:#fff;font-weight:600;' +
      'background:var(--dsw-alias-state-business-primary, #4176e6);' +
      'border-color:var(--dsw-alias-state-business-primary, #4176e6);}' +
      '.dshMvActPrimary:hover,.dshMvActPrimary:focus-visible{color:#fff;opacity:.92;' +
      'background:var(--dsw-alias-state-business-primary, #4176e6);}' +
      '.dshMvActInline{width:auto;padding:4px 10px;}' +
      /* 二级面板返回键 */
      '.dshMvBack{font:inherit;line-height:1;cursor:pointer;padding:2px 7px;' +
      'border-radius:var(--dsw-radius-sm, 6px);color:var(--dsw-alias-label-tertiary, #adb2b8);' +
      'background:transparent;border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));}' +
      '.dshMvBack:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      /* 联系表预览图：原生 <img>，随容器缩放，不撑破面板 */
      '.dshMvPreview{display:block;max-width:100%;height:auto;' +
      'border-radius:var(--dsw-radius-md, 6px);border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));' +
      'background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.18));}' +
      /* 风格画廊：两列卡片网格，窄容器降为一列（容器查询，弹层自己就是容器） */
      '.dshMvGallery{display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:6px;}' +
      '@container (max-width: 300px){.dshMvGallery{grid-template-columns:1fr;}}' +
      '.dshMvCard{display:flex;flex-direction:column;gap:4px;padding:6px;text-align:left;cursor:pointer;' +
      'font:inherit;border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));' +
      'border-radius:var(--dsw-radius-md, 6px);background:transparent;' +
      'color:var(--dsw-alias-label-secondary, #9aa3ad);}' +
      '.dshMvCard:hover,.dshMvCard:focus-visible{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvCardOn{border-color:var(--dsw-alias-state-business-primary, #4176e6);' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      /* 展示图：宿主配色画的渐变色块；拿不到配色就是灰块 + 文字（如实，不编颜色） */
      '.dshMvCardArt{display:block;height:56px;' +
      'border-radius:var(--dsw-radius-sm, 6px);border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));}' +
      '.dshMvCardArtOff{background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.18));' +
      'display:flex;align-items:center;justify-content:center;text-align:center;padding:0 4px;}' +
      '.dshMvCardName{font-weight:600;font-size:11px;line-height:1.3;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dshMvCardId{font-size:10px;color:var(--dsw-alias-label-tertiary, #adb2b8);}' +
      /* 卡片展示图（内嵌缩略）与预设区的选中风格条 */
      '.dshMvCardImg{width:100%;height:56px;object-fit:cover;}' +
      '.dshMvStrip{display:block;width:100%;height:48px;object-fit:cover;' +
      'border-radius:var(--dsw-radius-md, 6px);border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));}' +
      /* 工程管理行：缩略图 + 名称/规格 + 产物标记（统一管理界面） */
      '.dshMvProj{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:4px;' +
      'cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-secondary, #9aa3ad);' +
      'background:transparent;border:1px solid transparent;border-radius:var(--dsw-radius-sm, 6px);}' +
      '.dshMvProj:hover,.dshMvProj:focus-visible{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvThumb{display:block;flex:none;width:56px;height:32px;object-fit:cover;' +
      'border-radius:4px;border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));' +
      'background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.18));}' +
      '.dshMvProjInfo{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}' +
      '.dshMvProjName{font-weight:600;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dshMvProjSpec{font-size:10px;color:var(--dsw-alias-label-tertiary, #adb2b8);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dshMvOpts{display:flex;flex-direction:column;gap:6px;}' +
      '.dshMvField{display:flex;gap:8px;align-items:center;justify-content:space-between;}' +
      /* 选项框对比度：实底背景 + 加粗边框 + 字段标签提亮；下拉展开的 option 同样上色（不靠透明底） */
      '.dshMvField .dshMvKey{color:var(--dsw-alias-label-secondary, #9aa3ad);}' +
      '.dshMvSel{flex:1;min-width:0;box-sizing:border-box;font:inherit;padding:5px 7px;' +
      'border:1px solid var(--dsw-alias-border-l3, rgba(148,163,184,.55));' +
      'border-radius:var(--dsw-radius-sm, 6px);' +
      'background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.22));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvSel:hover{border-color:var(--dsw-alias-label-tertiary, #adb2b8);}' +
      '.dshMvSel option{background:var(--dsw-specific-menu, #232324);' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvSel:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, #4176e6);outline-offset:1px;}' +
      /* 自定义宽高输入：与下拉同款实底 + 加粗边框（对比度一致） */
      '.dshMvNum{flex:0 1 76px;min-width:48px;box-sizing:border-box;font:inherit;padding:4px 6px;' +
      'border:1px solid var(--dsw-alias-border-l3, rgba(148,163,184,.55));' +
      'border-radius:var(--dsw-radius-sm, 6px);' +
      'background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.22));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvNum:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, #4176e6);outline-offset:1px;}' +
      /* 分区标题提一档对比度（11px 小字不压 tertiary） */
      '.dshMvSectionTitle{color:var(--dsw-alias-label-secondary, #9aa3ad);}' +
      /* 标签页（conversation.view）：铺满视图区的唯一外壳，恒挂 dshMvBig 放大排版 */
      '.dshMvPage{position:relative;top:auto;right:auto;width:100%;max-width:none;' +
      'height:100%;max-height:none;border-radius:0;background:transparent;box-shadow:none;' +
      'animation:dshMvBig .18s ease-out;}' +
      /* 紧凑排版：单列依次排开、收紧留白（用户：不要太分散、紧凑一点） */
      '.dshMvBig .dshMvHead{padding:12px 14px 8px;}' +
      '.dshMvBig .dshMvBody{padding:0 14px 14px;gap:8px;font-size:13px;}' +
      '.dshMvBig .dshMvFoot{padding:8px 14px 12px;}' +
      '.dshMvBig .dshMvSection,.dshMvBig .dshMvPhase{gap:5px;}' +
      '@container (min-width: 560px){' +
      '.dshMvGallery{grid-template-columns:repeat(3, minmax(0, 1fr));}' +
      '.dshMvBig .dshMvProjProg{flex:0 1 340px;}}' +
      '@container (min-width: 860px){' +
      '.dshMvGallery{grid-template-columns:repeat(4, minmax(0, 1fr));}' +
      '.dshMvBig .dshMvFoot .dshMvActions{flex-direction:row;flex-wrap:wrap;}' +
      '.dshMvBig .dshMvFoot .dshMvActions>li{flex:1 1 170px;}}' +
      /* 图片可读性：常态给足底，标签页里成倍放大（展示图 112px、风格条 96px、缩略 88×50、预览整幅 contain） */
      '.dshMvBig .dshMvCardArt,.dshMvBig .dshMvCardImg{height:112px;}' +
      '.dshMvBig .dshMvStrip{height:96px;}' +
      '.dshMvBig .dshMvThumb{width:88px;height:50px;}' +
      '.dshMvBig .dshMvPreview{width:100%;max-height:52vh;object-fit:contain;}' +
      '.dshMvBig .dshMvCardName,.dshMvBig .dshMvProjName{font-size:12px;}' +
      '.dshMvBig .dshMvCardId,.dshMvBig .dshMvProjSpec{font-size:11px;}' +
      /* 进度展示面板行：右侧进度条 + 百分比，行内依次排开；正在跑的工程描主色边 */
      '.dshMvProjProg{display:flex;flex-direction:column;align-items:flex-end;gap:2px;' +
      'flex:0 1 46%;min-width:88px;}' +
      '.dshMvProjProg .dshMvProgress{margin-top:0;}' +
      '.dshMvProgPct{font-size:10px;color:var(--dsw-alias-label-tertiary, #adb2b8);white-space:nowrap;}' +
      /* 剩余时间行：默认次级色；正在跑的剩余时间（实测）用主色强调 */
      '.dshMvProgLeft{color:var(--dsw-alias-label-secondary, #9aa3ad);}' +
      '.dshMvProgLeft[data-live="1"]{color:var(--dsw-alias-state-business-primary, #4176e6);font-weight:600;}' +
      '.dshMvProjOn{border-color:var(--dsw-alias-state-business-primary, #4176e6);}' +
      /* 一键进入子代理：hero 主舞台（大按钮 + 说明 + 当前预设一行），内距收紧 */
      '.dshMvHero{display:flex;flex-direction:column;gap:5px;padding:10px 12px;' +
      'border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));' +
      'border-radius:var(--dsw-radius-md, 6px);background:var(--dsw-alias-bg-layer-1, rgba(148,163,184,.08));}' +
      '.dshMvHeroBtn{font-size:14px;font-weight:600;padding:9px 14px;text-align:center;}' +
      '.dshMvChips{font-size:11px;color:var(--dsw-alias-label-secondary, #9aa3ad);}' +
      /* 动画：开屏弹入 / 分级切换滑入 / 标签页展开；悬停走短过渡；尊重系统「减少动态效果」 */
      '@keyframes dshMvPop{from{opacity:0;transform:translateY(-6px) scale(.985);}to{opacity:1;transform:none;}}' +
      '@keyframes dshMvPanel{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:none;}}' +
      '@keyframes dshMvBig{from{opacity:.35;transform:translateY(-4px) scale(.99);}to{opacity:1;transform:none;}}' +
      '.dshMvBody{animation:dshMvPanel .18s ease-out;}' +
      '.dshMvAct,.dshMvCard,.dshMvProj,.dshMvSel,.dshMvBack{' +
      'transition:background .12s ease,color .12s ease,border-color .12s ease,opacity .12s ease;}' +
      '@media (prefers-reduced-motion: reduce){' +
      '.dshMvPopup,.dshMvBody,.dshMvPage{animation:none;}' +
      '.dshMvAct,.dshMvCard,.dshMvProj,.dshMvSel,.dshMvBack{transition:none;}}';

    function ensureEntryStyle() {
      try {
        if (typeof document === 'undefined' || !document.head) return;
        if (document.getElementById(ENTRY_STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = ENTRY_STYLE_ID;
        el.textContent = ENTRY_CSS;
        document.head.appendChild(el);
      } catch (e) { /* 无 DOM 时跳过 / no DOM: skip */ }
    }

    /** 开工首条消息：装载 skill，并要求以 subagent / teammate 形式在当前上下文执行。 */
    var TEAMMATE_PROMPT = SKILL_COMMAND + ' 请以队友/子代理形式在当前上下文开工：用宿主的 spawn_teammate / subagent 能力把任务交给队友或子代理——先读 guide 与 presets，按 skill 流程在当前工作区推进一支 MV（先分镜，再逐镜头，联系表自检）。';

    /**
     * 队友/子代理开工，逐级降级，每级都如实回报模式、绝不伪造成功：
     * 1) 宿主原生服务 ctx.get('agentTeams').spawnTeammate（客户端目前没有该服务，命中即用）；
     * 2) 宿主半边契约 POST /music-mv/api/kickoff（等宿主落地，落地后自动生效）；
     * 3) 在当前会话发出「以子代理/队友形式开工」的指令；
     * 4) 复制开工指令到剪贴板。
     * Kick off as teammate/subagent with honest per-stage fallbacks.
     * @returns {Promise<{ok: boolean, mode: 'native'|'host'|'current'|'clipboard'|'none'}>}
     */
    /**
     * 开工提示词 = 基础指令 + 用户在弹层里**提前选好的预设**（清晰度档、风格预设）。
     * 没选就只发基础指令，绝不编造用户没选的值。
     */
    function composePrompt(extra) {
      var s = String(extra || '').trim();
      return s ? TEAMMATE_PROMPT + '\n' + s : TEAMMATE_PROMPT;
    }

    function startTeammate(ctx, extra) {
      var prompt = composePrompt(extra);
      var native = null;
      try { native = typeof ctx.get === 'function' ? ctx.get('agentTeams') : null; } catch (e) { native = null; }
      if (native && typeof native.spawnTeammate === 'function') {
        return Promise.resolve().then(function () {
          return native.spawnTeammate({ parentSessionId: lastSessionId(ctx), mode: 'subagent', prompt: prompt });
        }).then(function () { return { ok: true, mode: 'native' }; },
          function () { return kickoffViaHost(ctx, prompt); });
      }
      return kickoffViaHost(ctx, prompt);
    }

    /** 宿主半边契约：命中说明宿主已提供原生开工接口。 */
    function kickoffViaHost(ctx, prompt) {
      return Promise.resolve().then(function () {
        return apiPost('/kickoff', { mode: 'teammate', prompt: prompt });
      }).then(function (d) {
        if (d && d.ok === true) return { ok: true, mode: 'host' };
        return kickoffViaConversation(ctx, prompt);
      }, function () { return kickoffViaConversation(ctx, prompt); });
    }

    /** 当前会话上下文：把「以子代理/队友形式开工」的指令交给当前对话。 */
    function kickoffViaConversation(ctx, prompt) {
      try {
        var conv = typeof ctx.get === 'function' ? ctx.get('conversation') : null;
        if (conv && typeof conv.send === 'function') {
          return Promise.resolve(conv.send(prompt)).then(
            function () { return { ok: true, mode: 'current' }; },
            function () { return kickoffViaClipboard(prompt); });
        }
      } catch (e) { /* 继续降级 / keep falling back */ }
      return kickoffViaClipboard(prompt);
    }

    /** 剪贴板兜底：指令还在，用户可以自己贴。 */
    function kickoffViaClipboard(prompt) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          return Promise.resolve(navigator.clipboard.writeText(prompt)).then(
            function () { return { ok: true, mode: 'clipboard' }; },
            function () { return { ok: false, mode: 'none' }; });
        }
      } catch (e) { /* 剪贴板被拦 / clipboard blocked */ }
      return Promise.resolve({ ok: false, mode: 'none' });
    }

    /**
     * 宿主工作室地址（仅作入口级回退句柄，**不进弹层 UI**：面板按用户要求零网页对接）。
     * Host studio URL, kept only as the entry-level fallback handle (not a panel action).
     */
    function studioUrl() {
      try {
        if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
          return location.origin + '/music-mv/studio';
        }
      } catch (e) { /* 无 location：退化为不可打开 / no location: nothing to open */ }
      return '';
    }

    /**
     * 打开工坊页，逐级降级并**如实回报走了哪一级**：
     * 已注册的页面类型 → 宿主工作室地址 → 'none'（调用方给离线提示，不伪造成功）。
     * Open the studio page, reporting honestly which level actually worked.
     */
    function openStudioPage(ctx) {
      try {
        if (ctx.sidebarRightTabs && typeof ctx.sidebarRightTabs.get === 'function' &&
            ctx.sidebarRightTabs.get(STUDIO_KIND)) {
          ctx.sidebarRight.openTab(STUDIO_KIND);
          return 'tab';
        }
      } catch (e) { /* 服务缺席：继续降级 / service missing: fall through */ }
      var url = studioUrl();
      if (url) {
        try { window.open(url, '_blank', 'noopener'); return 'url'; } catch (e) { /* 被拦：降级为提示 */ }
      }
      return 'none';
    }

    /** 开工模式 → 文案：四级降级各自如实回报，绝不把失败说成成功。 */
    var KICKOFF_NOTICE = {
      native: 'popup.teammateNative',
      host: 'popup.teammateHost',
      current: 'popup.teammateCurrent',
      clipboard: 'popup.teammateClipboard',
      none: 'popup.teammateNone'
    };

    /** 当前任务那一行的文案（running 带百分比，其余按状态说人话）。 */
    function jobLine(t, job) {
      if (!job) return t('popup.jobNone');
      if (job.status === 'running') {
        var pct = job.progress && job.progress.pct != null ? job.progress.pct : 0;
        return String(t('popup.jobRunning')).replace('{pct}', pct);
      }
      if (job.status === 'done' || job.status === 'succeeded') return t('popup.jobDone');
      if (job.status === 'error' || job.status === 'failed') return t('popup.jobError');
      if (job.status === 'cancelled') return t('popup.jobCancelled');
      return t('popup.jobNone');
    }

    /**
     * 渲染状态**分条**返回：任务 / 进度 / 速度 / 预计 / 状态。
     * 算不出来的一律给「—」，不猜、不摆占位动画。
     * Render status as separate rows; anything uncomputable shows an em dash.
     */
    function jobRows(t, job) {
      var dash = '—';
      if (!job) {
        return [
          [t('popup.job'), t('popup.jobNone')],
          [t('popup.progress'), dash],
          [t('popup.speed'), dash],
          [t('popup.eta'), dash],
          [t('popup.state'), t('popup.jobNone')]
        ];
      }
      var p = job.progress || {};
      var done = typeof p.done === 'number' ? p.done : null;
      var total = typeof p.total === 'number' ? p.total : null;
      var pct = p.pct != null ? p.pct : null;
      var progress = pct != null
        ? pct + '%' + (total ? '   ' + done + '/' + total : '')
        : (total ? done + '/' + total : dash);
      var elapsed = job.startedAt ? Math.max(0, (Date.now() - Number(job.startedAt)) / 1000) : 0;
      var fps = (done != null && elapsed > 0.5) ? done / elapsed : null;
      var speed = fps != null ? fps.toFixed(1) + ' fps' : dash;
      var eta = dash;
      if (job.status !== 'running') {
        eta = '0:00';
      } else if (total != null && done != null && fps) {
        var secs = Math.max(0, Math.round((total - done) / fps));
        eta = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      }
      var task = String(job.project || '') + (job.mode ? '  ·  ' + job.mode : '');
      return [
        [t('popup.job'), task || dash],
        [t('popup.progress'), progress],
        [t('popup.speed'), speed],
        [t('popup.eta'), eta],
        [t('popup.state'), jobLine(t, job)]
      ];
    }

    /** 开工前选好的预设写进提示词；没选（含「跟随工程」）就不加，绝不编造。 */
    function kickoffExtra(tierTitle, styleId, fps) {
      var bits = [];
      if (tierTitle) bits.push('交付分辨率：' + tierTitle);
      if (styleId) bits.push('风格预设：' + styleId);
      if (fps) bits.push('帧率：' + fps + 'fps');
      return bits.length ? bits.join('；') + '。' : '';
    }

    /** 从标题里解析「宽×高」（'高清 1920×1080' → {w,h}）；解析不出返回 null，不猜。 */
    function parseDims(text) {
      var m = /(\d+)\s*[×x]\s*(\d+)/.exec(String(text || ''));
      return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : null;
    }

    /** 横竖屏：宽高对调；输入为空返回 null。 */
    function swapDims(dims) {
      return dims && dims.w > 0 && dims.h > 0 ? { w: dims.h, h: dims.w } : null;
    }

    /** 尺寸 → 内置档（对不上返回 null → 调用方落到「自定义」，不硬凑）。 */
    function findTierByDims(tiers, dims) {
      if (!dims) return null;
      var want = dims.w + '×' + dims.h;
      var hit = (tiers || []).filter(function (x) {
        return String((x && x.title) || '').indexOf(want) >= 0;
      })[0];
      return hit || null;
    }

    /**
     * 交付分辨率描述：自定义档带用户输入的宽×高；输入非法就返回空串 —— 不编造。
     * resolutionLabel('custom', …, '1500', '900') → '自定义 1500×900'
     */
    function resolutionLabel(tier, title, customLabel, w, h) {
      if (tier === 'custom') {
        var nw = parseInt(w, 10), nh = parseInt(h, 10);
        return nw > 0 && nh > 0 ? String(customLabel) + ' ' + nw + '×' + nh : '';
      }
      return title || '';
    }

    /** 接口不可用时的内置清单（静态文案，不是用户数据）/ bundled offline fallbacks. */
    var FALLBACK_TIERS = [
      { id: 'draft', title: '草稿 480×270' },
      { id: 'standard', title: '标准 1280×720' },
      { id: 'high', title: '高清 1920×1080' },
      { id: 'vertical', title: '竖版 1080×1920' },
      { id: 'uhd', title: '4K 3840×2160' }
    ];
    var FALLBACK_STYLES = ['claude', 'deepseek', 'doubao', 'dusk-lofi', 'gemini', 'gpt', 'grok',
      'ink-paper', 'kimi', 'llama', 'midjourney', 'mistral', 'neon-rain', 'phosphor', 'qwen', 'zhipu'];
    /** 帧率档：'' = 跟随工程（不覆盖），其余是常用档（静态清单，不是用户数据）。 */
    var FALLBACK_FPS = ['', 24, 25, 30, 60, 120];
    var LS_TIER = 'dsh-music-code-mv.kickoff.tier';
    var LS_STYLE = 'dsh-music-code-mv.kickoff.style';
    var LS_FPS = 'dsh-music-code-mv.kickoff.fps';
    var LS_CUSTOM_W = 'dsh-music-code-mv.kickoff.w';   // 自定义分辨率 / custom size
    var LS_CUSTOM_H = 'dsh-music-code-mv.kickoff.h';

    /**
     * 风格展示图：skill/reference/img/preset-*.png 的 256×144 WebP 缩略（data URI 内嵌），
     * 离线可用、零额外路由；由 scripts/embed-showcase.py 灌入，空表也能跑（回落配色块）。
     * Showcase thumbnails embedded as data URIs — real artwork, no network, no host route.
     */
                    var SHOWCASE_IMAGES = {
      'claude': 'data:image/webp;base64,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',
      'deepseek': 'data:image/webp;base64,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',
      'doubao': 'data:image/webp;base64,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',
      'dusk-lofi': 'data:image/webp;base64,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',
      'fairy': 'data:image/webp;base64,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',
      'gemini': 'data:image/webp;base64,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',
      'gpt': 'data:image/webp;base64,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',
      'grok': 'data:image/webp;base64,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',
      'ink-paper': 'data:image/webp;base64,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',
      'kimi': 'data:image/webp;base64,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',
      'llama': 'data:image/webp;base64,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',
      'midjourney': 'data:image/webp;base64,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',
      'mistral': 'data:image/webp;base64,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',
      'neon-rain': 'data:image/webp;base64,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',
      'phosphor': 'data:image/webp;base64,UklGRr4QAABXRUJQVlA4ILIQAAAQewCdASoAAiABPsFepk8nqbAtJpMpcgAYCWVuzCW8lLaXax4+9f5qPMH7PybHzfS3LOv8oqFN7/4/nQmDhwyB2Q4Wi8/lQ5T6G9DKrHPpq4WNmt1m68CNm91tR+qIqjYXd6ITFr/A9TVBCCfL62/g9ee6F+U/ZRzuzWj27P1kMOcDHLvhIjcrXx6ZodCZnkf2km8ZuE76BlWSioEioQ0xJNPResMT1Oqve/P+9hYWTX9UPLyhKV5gLPO2Ix3kNIJAeULLMV8z14ofKfl+AQehLDSCIBPwPzRpR7HNAedgv5aGJ8T6lhmJWRR8fh2hTDES+YyjUedBSOhVlmF8urIgp0eKtNIz25xmYmTmdWgoJX8vRT2W+VYNWmVoMxOxULYy/tMxtmQMMVIe/i45q05DHQzomT3UawrfssYt+ZBkHm8nlnr10MtYTUldVm79Q/CwAKRam0tHiVEakiADbMgIkAkwtswVtQdx/nOMA2LxBHsASDOE+oAOX3mPp/DkMITVtn4aReBTsgophn7ycKdXoUBDvuUXU7+htMmgrMW182ExoLRT+x64wMfnPY0C7ItVszTsrepuB00h2jDKvw3uAv2cbUVDSZ67kXS8TVw4KWB1kfSytKaJYg4q4ccRnNzmPXTHF6iKL8in0IXElqg5SAlQoJNB3EielnePtAqLo0WH1nVxPrX5HeEZRIw1AoxJpOtqoICVy+ovw9ynSKUtuOrPAdGlLpbBgpDyhZ5yfJxl8E001RrwEM4ZUkmihSjUgWpnzS/rFB3qg8xGMGVCmoQu1Mobk7ALbi85nfEZy0PTkewh5z4wpyBbCabbKNdU/4SPRSQRTASbi2RsqEERsy2c/CJaVXewmewQD8Q6H8rp/PamETtXOXrQWZqYxzh0gDYbJ4ZBc4uQmtxX2BW+CedqyIIiZTn3SM+lM2UrH+eiNspnz8n4H2qM8ID13yVFei8kDJic8VeOxugUbEtqqALeIe54+5tiyT2NtDwwuWdeoP/dyYd+pb7Mjp3DaNHOaZU5Ddj/XeOcvuliKtK+lhtW+56206P0hn098/nZ8YfBFhOjQ+ZdWbAtZCMVWXExBnQ5LE0LSB3QT7NrfXkPykgGZAl4QA49lS1tw83bciQJvbJ/0gTU9JtGT7kYqz6skdj8q2z60FZuSmekoDOEiTgj2lcJcF35bHXtVFbBwZabo31xcekmxfu+nMhE9k8m94Do8++JJ+AO3l3MGXX4xCMTdZ6F8M9inAcqYtcS3DZQhKEaTDyiv1PdNzLZ0XJrt1I62cgEKQUfFuzvyuTVWigEmYkvXude+brSvYL5uAAA/vcxccgytPEqjr2T7hRO4q602SVM0xYEpbhfQrVnoDR7TxgfviZPv/spSQmhjpsyBi8grotJ7Fg+aCgL1L9EItusUgme/B8dfL1aNZ24FHS2nvg3bna2AmgcsNB+o8kD8J2gcTp1YxVVgI3g8U9xdhWqwXkdWhG/tAyGQqhDTkHzEQwxd7KWgsJDaUtGpUbmPmA14VhH0VW1sZ8wmJcH1EHy9YiFeDDZy9UyOW5fdJxxFcVrmlHGA4cKbcAAhKWlv8Yw42qWCd8zdrWjvoMnSQFnLaSEsmeFOEu2BlDyIIvR76zyGIDKhX+AbzBE8iIADChIl1XicKn/VfoHf9KADAo0R4MLdEpa+A0wgRFpMCsM8GZ3PmLc3tWXCN4/qmi4hyovYSZ6UgM7cZ8ume/ZgoWiponsdJDDU/ZX8eHnnfTucjwLBZA27M/+37tS6OdYbRyGv4GmFqs2TuJMWOnYlZiFlG7FF+/yHuDmDGeP3Y9lEhQyywxVPdXcMhlsJJtkRQkcQFeFjKX5vf7+7E1Ifi4ny3Iu77feyjpdOm4x8JBJhw5TETWhdCXeOs3iPOOFNJgZq22r598pAwUWeWJG3rraWDJeYl5aFv+uGQzS+v+/1xOT0WZXhVZB+urG1btHxTl8k+PxLek/rEksHiB5uhyL/K41D79oiy1Y2cxegtoGzH6L1y3k9tT99Cobxp+NbzgisUmry0S/4ZQYiX3FNr4IJe4yYEt5WlLf0eOp4lQK/BTileBb+j+srplfJ93ajTQEvuRwJ2uthJKSCXId9XR3HzYQi1+FaIKEJevO+EaM97+zsaDm33NnjiCQGLEq+1zsqlLHYMz49a5rWowmYsMBcMWt1Ho8EyZSDAm5n34viJ2xQ4ErVRFHcxtI/0KcOQZVlb6bx17PtY9Vwlfkx01dv+IT/PCkWaNPtyxnmGGzy+uyMAyGElJcezUYrG5o3q12nn4pCMgEsCdpMDms7W6ZU/9FvH/dSe8LjzoNIvy9+HHUWABxGDKWeRp+CK9zzTogz2s8my4+BmLJx/9/Mbso3fZm/s8/++eWDxwMacGVUI51hmHutlZXb62fQx/pII/az6meOObwP+Wu6kTw2ygnFVITOoGUvFAFJM6iRvvqVEbV5iNM7bLLaoNM/A9GAysJ2qKh2aaYouctclcqGA3g2HBhk5q/L/+uWe89FySq7P5aqDBKaVAUUtHgDyRWDzCCkuJfECM1QgZp3zQRmBWpXuynB0gGlcJG02myYs5RyLTucwQS9w4Fohim9f7V6cI4gUEUlV81Ca9lJ8KYU+4jP0MuxzYFb88Sa+/1+40eANRaDHguYky/ajOfQT4CosDX/n5YD0vBKHxPLu66/69UAUxomThVyehbyQCsadIDz900OqYWR5oxYwiIQKlB7x86XGzHXbi0TgEzs+luAKj+CnKDpN9YVYIxl02oxb4Khyll0ocZ0+gs0KDp++nUk50N/Tab4vd1gGymJSeavH4GJ5MmMGvM2hFKjlre+iRpJXMuFZZY6qRSqMABWrue8BUG9CfAOz1CoAVp6EOCpRblKm6lI53crti0x485b8/GkFt2XOsSGTfR242f3VBUWsSGzPFafy9PromLhAQ26EiXzmYQ32Cif17rmfetntOjyg8RDj7rnl28SSHnrGgp4lhe2+ZJiOis8bsNH6DDfaT6yqUTb8RgL7ZUw4N4cSK6Oulqm0cxYAG6n4HEK83RNID+TjUqdGxqHQpOOKfz4xq8OQjtcYTEsJ7gOWlV/QrNt1Ws/z2F/uLrnP4N8wAJTpKCzmNIsIAbxkSOy9A2dV8R9gq3zmAZMwEDzR5LMzQ0MWEGbBvfC0O93krF0kg/gP53Otaxr/16QxnR+1YhqePrr6h1/3Ao4+U071lrFaXEbp8m0uTZtZsDscq0NOiF8BsXPZ/xrM53NKfGfkH5r6A3kbO6UmP/xxV3nI4F7iYzIoAIzCABGI184uCSshu48QS4RAzXQKaXl89Db6oirIZAVlVmyp4HVlXzokocJi8H0itXrpmWJa655DDaKR1hL1JgBnHm+Ju4b2o+Xx/Sk79VJF1//c8Dv86/MHa+VIFjJ42bskDQLsCH33tZd8OLl8GvscD3bznNg/DuwG/uG805LG/G4mBjx5vqAdLsx5jb80xhBZsfMBFkJ47mJHdoGfqs4kSa2jG23EOP48FrO/tAZSHb+W39wUAg8VKo8PDhmAOVfQ43AUTmbRr9Yk2UQG1ot0Z55MLhSnmK/D90RuJSMXYrXzRy+2DthUxhhvdnpk7MYnsn9mQiffUIQ97Mai0l/FeuzjlZOqz5EDb8No6p8MXvu2IUJ1ua1gchCi8MoKQCJFfrHI1UId6ecrZkaI9ikoWsB86nEdhMXKmhRtpmzo4cf1Wjw4AUJ12+cGn22/5NJy5Ta20X0YIqLuJC9HqBe381dDmTFo2MLBNQ6MYEBZI1ob8w7+UwQBuP6PDtomTPhRsnnek6ueWnZSfsnfnbJNEkmY7geKS62H2XZiRtpjYx1wzozAvDHR+l0ssGmfyBmKDW0gOX2MOfPl1j9na+NSTnixLgdVy1gXT3mx2f2XufH3YJMcacTodWQY3XG7tIGMybMKXvhi2dGCc0HmSU51VOILJ9kH+e5CtKPlPuUVwChX9ntSkfjUShKUPhCWgbM/ahBUMFoauRX+fAWlNMdYh4jWn6bJc6WzlbU7Ec8lFZSrX5RLJXWbhpSS1hhI0H1xBNgklKXfHLi4wBGDUz2JG+uEFLLgOH93msvHo4f+bLEpEsPeAYvSDig/k56BxBcsKS/qijyvx8vafg6rVMAlSkCVxgTqSXgldZsku0wkPURPyF9WAv1vydEflsSYF+OqLkUjbnNtY5CYAttThJI/Z2s7MnNcUwcw+o8vlfH6wHNPOV5BzJLXcUzqJcH7wGAVzPSuYG3d5ZoOlg5rCX9iKsW0O+h5CqMy9DMQ+9/S+5b8fBahjVKnrRnzzNeQUMOcXqGeMURWmjYJcrfV4rE3dP1wyMC1MAPfPrm6EWlfFQJfs0xqwH5/9anofGTlhbd0kUMlqtBZLmtpzYtn5/OI2Dd7bZJ0by1D6bDO5mnxtqn8tF4uYVdOADeJFdLpPWxxSo8VNyG99f65ojF5J+PRkNPogG/ixFPOEjph8NY63mfL7fq19UD3pwogs07Dh8LUt6jW1xASD/Ub/zwpO0rZ21zz2Rs5byndZFzzHyNi6Zu55zn+w5o7jM2yiJat4aTdObe1q6sBtE5yvFiGs/k5nbYIM5HAbCDS0AtfUTtzmru+PKcpsjBkkMlGJqu9I5Ut0+71u1FL0T2qObLRzUZpU988XHyEMAh37tZeWtv///bF5ZgKGuHK379eujjHz6LwpDLlhJE6syD+hmUbLJmOwH71vzHGRNWO9BDGq+DUS3/38KPf1BboOz6/9EAaX++Oh/6Ttux6Vgprf3pXpw+Xxlixgw6sRglZcdhkxj85mJrJAckp9cRHO0rNIZo4cZ1qoYTNDZ/xlqscxZOHJN2+Uhia32B7AOvDa2lg2vYj6+Gz18uvcnqmV6oG/qUZdaMNzIov+CK0JaAQLn3Ju/xcv7DjviEVkOYGb0SGAltfgTNKI3N4HGfvrBnXp5er2xY5jsp3Ilb4MIuzWZx9jtJOcn8s2riT4jwK/Nu0d8jp5wMyQ5eJ/L0Mdte6hsIxf0+Gr/EBgL3+AUSTvMoUyr1PPj7vH5Ix/4eiWzpOMRvvd8TIlplocwJ1zkRB6Tm2Ru/dLcx3GBZUMABgYZeVLrmz1HZzBIjCl/61TxFM9cV7pE1qWIZGCL/gVtgZFSBa5IYaLQ5Vsm0hJQYDQjb5umQQlVfhAHqwP355p1HgMU25HtNsyP6QcizgJodNAtcl8LTnZZmL4Jyh7xby0aS8LmfpXgJXfsiiHqUMKRNJk+Ev7KWpNbJnyAanWFQIw6wFfZbZwVjDmO+E13lNltfm2cpaPF/2aXjt3UndRN15VlCEpCFiUF0HFxyEHHrGYaajPUBe6SshO2U6XsaX9P4yRExQD+REXNaoV9SvLB+VpSnrbATKp9W7LgGSjFJI2OYobAnFAQyfCS4JoxaSisc+uuxbyu1CqJx4Qpk6GqO2K98PfApMHLp5nNSuoz2rDB0HQFpDTTJjTdTFl1imPi6A5GdxD5POkt9xLXdALNmgM0ewyYGgkHfa477fTlk6mW/ytnfypkZfHBbBTTcE5NEe2Ypkxunrf7yeWX782qgcOjQ3bsGccswq+wiNv1LlFc0ksxYQryrKB+dHhMe0/ACEOsDjh5EeBfTjBZWvGgFowU0Sh6ly8JgTnMAhJg4u1Eru9VHbL1js4twt952tn12pU4AFF6/gKIoch1BggAAA==',
      'qwen': 'data:image/webp;base64,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',
      'zhipu': 'data:image/webp;base64,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'
    };
    /** 某个风格的展示图地址；没有就空串（调用方回落到配色渐变/灰块）。 */
    function showcaseFor(id) {
      var v = String(id || '');
      return (SHOWCASE_IMAGES && SHOWCASE_IMAGES[v]) || '';
    }

    /**
     * 内置风格的中文名（离线兜底，与 skill/presets 的 title 中文段一致）——
     * 下拉里绝不让英文 id 裸奔：宿主 title 的中文段 → 内置中文名 → 原始 id。
     */
    var FALLBACK_STYLE_TITLES = {
      claude: 'Claude 橙白', deepseek: 'DeepSeek 蓝黑', doubao: 'Doubao 豆包蓝',
      'dusk-lofi': '落日低保真', fairy: 'Fairy 仙灵', gemini: 'Gemini 蓝紫渐变',
      gpt: 'GPT 黑白', grok: 'Grok 灰黑', 'ink-paper': '纸墨', kimi: 'Kimi 冷蓝',
      llama: 'Llama 蓝', midjourney: 'Midjourney 航海蓝', mistral: 'Mistral 焰橙',
      'neon-rain': '霓虹雨夜', phosphor: '磷光终端', qwen: 'Qwen 紫青', zhipu: 'Zhipu 智谱蓝'
    };
    /** 风格的中文显示名：title 取「中文段」（'中文 / English' 的前半），否则内置中文名，最后才回落 id。 */
    function styleLabel(id, title) {
      if (title) return String(title).split(' / ')[0];
      var v = String(id || '');
      return FALLBACK_STYLE_TITLES[v] || v;
    }

    function lsGet(key, fallback) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return fallback;
        var v = window.localStorage.getItem(key);
        return v == null || v === '' ? fallback : v;
      } catch (e) { return fallback; }
    }
    function lsSet(key, value) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, String(value));
      } catch (e) { /* private mode / 记不住就算了 */ }
    }

    /** 分区块：标准 <section> + 无障碍标题，把状态切成可扫读的组 / grouped sections. */
    function sectionNode(t, key, titleKey, kids) {
      return h('section', { key: key, className: 'dshMvSection', 'data-section': key }, [
        h('div', { key: 'title', className: 'dshMvSectionTitle', role: 'heading', 'aria-level': 2 }, t(titleKey))
      ].concat(kids));
    }

    /**
     * 渲染中的原生 <progress>：有百分比就给 value（浏览器画确定态），
     * running 但算不出百分比就不给 value（不确定态）；没任务干脆不画，不摆装饰动画。
     */
    function progressNode(t, job) {
      if (!job || job.status !== 'running') return null;
      var p = job.progress || {};
      var props = { key: 'progress', className: 'dshMvProgress', max: 100, 'aria-label': String(t('popup.progress')) };
      if (typeof p.pct === 'number') { props.value = p.pct; props['data-job-progress'] = p.pct; }
      return h('progress', props);
    }

    /** 「标签—值」行；data-overview-row 供测试定位 / one labelled row. */
    function overviewRow(t, key, labelKey, value, title) {
      return h('div', { key: key, className: 'dshMvRow', 'data-overview-row': key }, [
        h('span', { key: 'k', className: 'dshMvKey' }, t(labelKey)),
        h('span', { key: 'v', className: 'dshMvVal', title: title || '' }, value)
      ]);
    }

    /**
     * 单个工程的渲染进度（纯函数）：
     * 正在跑的工程 → 任务实测 pct；否则用帧缓存覆盖率 frames ÷ (时长 × 帧率)；
     * 两个都算不出 → 返回 null（不编造：调用方只显示「—」，不画假条）。
     */
    function projectProgress(project, job) {
      if (!project) return null;
      var path = String(project.path || project.name || '');
      var live = !!(job && job.project && path && String(job.project) === path);
      if (live && job.status === 'running' && job.progress && typeof job.progress.pct === 'number') {
        var jp = job.progress;
        return {
          pct: Math.max(0, Math.min(100, Math.round(jp.pct))),
          done: typeof jp.done === 'number' ? jp.done : null,
          total: typeof jp.total === 'number' ? jp.total : null,
          live: true
        };
      }
      var fps = Number(project.fps), dur = Number(project.duration);
      var total = fps > 0 && dur > 0 ? Math.round(fps * dur) : null;
      var frames = typeof project.frames === 'number' ? project.frames : null;
      if (total == null || frames == null) return null;
      return {
        pct: Math.max(0, Math.min(100, Math.round((frames / total) * 100))),
        done: frames, total: total, live: false
      };
    }

    /**
     * 进度行的「剩余」文案（纯函数，与 jobRows 的预计同口径）：
     * 正在跑 → 实测速度算剩余时间（剩余 mm:ss）；覆盖率行 → 剩余帧数；归零 → 已完成；
     * 跑着但算不出速度 / 没有进度 → 「—」（不编造时间）。
     */
    function remainingText(t, prog, job) {
      if (!prog) return '—';
      if (prog.live && job) {
        var elapsed = job.startedAt ? Math.max(0, (Date.now() - Number(job.startedAt)) / 1000) : 0;
        if (prog.done != null && prog.total != null && elapsed > 0.5) {
          var fps = prog.done / elapsed;
          if (fps > 0) {
            var secs = Math.max(0, Math.round((prog.total - prog.done) / fps));
            return String(t('popup.remainTime'))
              .replace('{v}', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
          }
        }
        return '—';
      }
      if (prog.done != null && prog.total != null) {
        var left = prog.total - prog.done;
        if (left <= 0) return String(t('popup.remainDone'));
        return String(t('popup.remainFrames')).replace('{n}', left);
      }
      return '—';
    }

    /**
     * 工程进度行（进度展示面板，所有工程依次排开）：
     * 缩略图 + 名称/规格（产物标记并入同一行）+ 右侧进度条与百分比；正在跑的工程高亮。
     * 点行进联系表面板；算不出进度就显示「—」。
     */
    function projectRow(t, p, onOpen, job) {
      var v = p.path || p.name;
      var specs = [];
      if (p.width && p.height) specs.push(p.width + '×' + p.height);
      if (p.fps) specs.push(p.fps + ' fps');
      if (p.duration) specs.push(Math.round(p.duration) + 's');
      if (p.scenes) specs.push(p.scenes + ' 场景');
      var meta = [];
      if (p.contact) meta.push(t('popup.hasContact'));
      if (p.video) meta.push(t('popup.hasVideo'));
      var specLine = specs.join(' · ') || '—';
      if (meta.length) specLine += ' · ' + meta.join(' · ');
      var url = contactUrl(p);
      var prog = projectProgress(p, job);
      var running = !!(prog && prog.live);
      var rightCell = prog
        ? h('span', { key: 'prog', className: 'dshMvProjProg' }, [
            h('progress', {
              key: 'bar', className: 'dshMvProgress', max: 100, value: prog.pct,
              'data-project-progress': v
            }),
            h('span', { key: 'pct', className: 'dshMvProgPct' },
              prog.pct + '%' + (prog.total != null ? ' · ' + prog.done + '/' + prog.total + ' 帧' : '')),
            // 剩余时间显示：运行中 = 实测剩余 mm:ss（主色强调），其余 = 剩余帧数 / 已完成
            h('span', {
              key: 'left', className: 'dshMvProgPct dshMvProgLeft',
              'data-project-remain': v, 'data-live': prog.live ? '1' : '0'
            }, remainingText(t, prog, job))
          ])
        : h('span', { key: 'prog', className: 'dshMvProgPct', 'data-project-progress': v + '-none' }, '—');
      return h('button', {
        key: v, type: 'button',
        className: 'dshMvProj' + (running ? ' dshMvProjOn' : ''),
        onClick: onOpen ? function () { onOpen(v); } : undefined,
        'data-project': v,
        'data-running': running ? '1' : '0'
      }, [
        url
          ? h('img', { key: 'thumb', className: 'dshMvThumb', src: url, alt: '', 'aria-hidden': 'true' })
          : h('span', { key: 'thumb', className: 'dshMvThumb dshMvThumbOff', 'aria-hidden': 'true' }),
        h('span', { key: 'info', className: 'dshMvProjInfo' }, [
          h('span', { key: 'name', className: 'dshMvProjName' }, p.name || v),
          h('span', { key: 'spec', className: 'dshMvProjSpec' }, specLine)
        ]),
        rightCell
      ]);
    }

    /**
     * 状态区三种形态（纯函数，测试各写一套断言）：
     * 读取中 → 一句话 + 不确定态进度条；离线 → 错误文案 + 还能用什么 + 重试按钮；
     * 就绪 →「总览 / 工程进度 / 渲染状态」三节依次排开：所有工程的进度条在工程进度节。
     */
    function popupBody(t, phase, data, onRetry, onOpenProject) {
      if (phase === 'probing') {
        return [h('div', { key: 'probe', className: 'dshMvPhase', 'data-phase': 'probing' }, [
          h('div', { key: 'msg', className: 'dshMvDim' }, t('popup.probing')),
          h('progress', { key: 'bar', className: 'dshMvProgress', max: 100, 'aria-label': String(t('popup.probing')) })
        ])];
      }
      if (phase === 'absent') {
        return [h('div', { key: 'absent', className: 'dshMvPhase', 'data-phase': 'absent' }, [
          h('div', { key: 'msg', className: 'dshMvError', 'data-offline': '1' }, t('popup.offline')),
          h('div', { key: 'hint', className: 'dshMvHint' }, t('popup.offlineHint')),
          h('button', {
            key: 'retry', type: 'button', className: 'dshMvAct dshMvActInline',
            onClick: onRetry, 'data-act': 'retry'
          }, t('popup.retry'))
        ])];
      }
      var projects = data && Array.isArray(data.projects) ? data.projects : [];
      var root = String((data && data.root) || '—');
      var statusKids = [
        overviewRow(t, 'workspace', 'popup.workspace', root, (data && data.root) ? root : ''),
        overviewRow(t, 'projects', 'popup.projects',
          String(t('popup.projectsValue')).replace('{count}', projects.length), '')
      ];
      var job = data && data.job ? data.job : null;
      // 进度展示面板：所有工程一条一条排开（缩略图 + 规格 + 进度条）；正在跑的工程用任务实测值
      var listKids = projects.length
        ? projects.map(function (p) { return projectRow(t, p, onOpenProject, job); })
        : [h('div', { key: 'empty', className: 'dshMvDim', 'data-empty': 'projects' }, t('popup.renderNone'))];
      var renderKids = [];
      var bar = progressNode(t, job);
      if (bar) renderKids.push(bar);
      // 渲染状态分条：任务 / 进度 / 速度 / 预计 / 状态
      var jr = jobRows(t, job);
      for (var i = 0; i < jr.length; i++) {
        renderKids.push(h('div', {
          key: 'job' + i, className: 'dshMvRow', 'data-job-row': jr[i][0]
        }, [
          h('span', { key: 'k', className: 'dshMvKey' }, jr[i][0]),
          h('span', { key: 'v', className: 'dshMvVal' }, String(jr[i][1]))
        ]));
      }
      return [
        sectionNode(t, 'status', 'popup.section.status', statusKids),
        sectionNode(t, 'progress', 'popup.section.progress', listKids),
        sectionNode(t, 'render', 'popup.section.render', renderKids)
      ];
    }

    /** 联系表预览地址：同源 /music-mv/api/file（<img> 不带自定义头，宿主对媒体请求放行）。 */
    function contactUrl(project) {
      if (!project || !project.contact || !project.contact.path) return '';
      return '/music-mv/api/file?path=' + encodeURIComponent(project.contact.path) +
        '&t=' + String(project.contact.mtime || 0);
    }

    /**
     * 「渲染联系表」二级面板主体（纯函数，测试直接调）：
     * 选工程 → 插件自己 POST /music-mv/api/render（不经过模型）→ 同一轮询给实时进度 →
     * 同源 <img> 预览（mtime 参与缓存键，渲染完自动换新图）。离线时如实显示离线 + 重试。
     */
    function renderPanelBody(t, opts) {
      opts = opts || {};
      var phase = opts.phase || 'ready';
      if (phase === 'probing') {
        return [h('div', { key: 'probe', className: 'dshMvPhase', 'data-phase': 'probing' }, [
          h('div', { key: 'msg', className: 'dshMvDim' }, t('popup.probing')),
          h('progress', { key: 'bar', className: 'dshMvProgress', max: 100, 'aria-label': String(t('popup.probing')) })
        ])];
      }
      if (phase === 'absent') {
        return [h('div', { key: 'absent', className: 'dshMvPhase', 'data-phase': 'absent' }, [
          h('div', { key: 'msg', className: 'dshMvError', 'data-offline': '1' }, t('popup.offline')),
          h('div', { key: 'hint', className: 'dshMvHint' }, t('popup.offlineRender')),
          h('button', {
            key: 'retry', type: 'button', className: 'dshMvAct dshMvActInline',
            onClick: opts.onRetry, 'data-act': 'retry'
          }, t('popup.retry'))
        ])];
      }
      var projects = opts.projects || [];
      var selected = opts.selectedPath || '';
      var project = null;
      for (var i = 0; i < projects.length; i++) {
        var pv = projects[i].path || projects[i].name;
        if (pv === selected) { project = projects[i]; break; }
      }
      if (!project && projects.length) project = projects[0];
      var pickerKids = [];
      if (!projects.length) {
        pickerKids.push(h('div', { key: 'empty', className: 'dshMvDim', 'data-empty': 'projects' }, t('popup.renderNone')));
      } else {
        pickerKids.push(h('label', { key: 'pl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.renderProject')),
          h('select', {
            key: 's', className: 'dshMvSel',
            value: project ? (project.path || project.name) : '',
            onChange: opts.onPick, 'data-select': 'project'
          }, projects.map(function (p) {
            var v = p.path || p.name;
            return h('option', { key: v, value: v },
              p.name + (p.width && p.height ? ' · ' + p.width + '×' + p.height : ''));
          }))
        ]));
      }
      var kids = [sectionNode(t, 'picker', 'popup.renderProject', pickerKids)];

      // 实时状态：与主面板同一套分条 + 原生进度条（同一个轮询、同一个任务）
      var job = opts.job || null;
      var liveKids = [];
      var bar = progressNode(t, job);
      if (bar) liveKids.push(bar);
      var jr = jobRows(t, job);
      for (var j = 0; j < jr.length; j++) {
        liveKids.push(h('div', { key: 'job' + j, className: 'dshMvRow', 'data-job-row': jr[j][0] }, [
          h('span', { key: 'k', className: 'dshMvKey' }, jr[j][0]),
          h('span', { key: 'v', className: 'dshMvVal' }, String(jr[j][1]))
        ]));
      }
      kids.push(sectionNode(t, 'live', 'popup.section.render', liveKids));

      // 预览：渲染完 contact.mtime 变化 → src 换 → 自动出新图；没有就如实说没有
      var url = contactUrl(project);
      var previewKids = url
        ? [h('img', { key: 'img', className: 'dshMvPreview', src: url, alt: String(t('popup.preview')), 'data-preview': '1' })]
        : [h('div', { key: 'none', className: 'dshMvDim', 'data-empty': 'preview' }, t('popup.previewNone'))];
      kids.push(sectionNode(t, 'preview', 'popup.preview', previewKids));
      return kids;
    }

    /** 画廊卡片数据：宿主返回的 title/summary/palette 是「展示图」的原料；离线只剩 id，不编造颜色。 */
    function styleCards(opts, fallbackIds) {
      var full = (opts && opts.presets) || [];
      var map = {};
      full.forEach(function (p) { if (p && p.id) map[String(p.id)] = p; });
      var ids = (opts && opts.styles && opts.styles.length) ? opts.styles : (fallbackIds || []);
      return ids.map(function (id) {
        var hit = map[String(id)] || null;
        return {
          id: String(id),
          title: (hit && hit.title) || '',
          label: styleLabel(id, (hit && hit.title) || ''),   // 中文显示名 / Chinese label
          summary: (hit && hit.summary) || '',
          palette: (hit && hit.palette) || null
        };
      });
    }

    /**
     * 风格画廊（二级面板，纯函数）：每张卡片自带「展示图」——
     * 用宿主返回的真实配色画的渐变色块；拿不到配色就放灰块 + 如实标注，绝不编造颜色。
     * 选中的卡片下面挂它的 summary（分级信息：名字 → 一句话说明）。
     */
    function styleGallery(t, cards, selectedId, onPick) {
      if (!cards.length) {
        return [h('div', { key: 'empty', className: 'dshMvDim', 'data-empty': 'styles' }, t('popup.renderNone'))];
      }
      var kids = [h('div', { key: 'grid', className: 'dshMvGallery', 'data-gallery': '1' },
        cards.map(function (c) {
          var pal = c.palette || null;
          var selected = String(c.id) === String(selectedId);
          var showcase = showcaseFor(c.id);
          var artStyle = pal ? {
            background: 'linear-gradient(135deg, ' +
              [pal.bg, pal.dim, pal.base, pal.accent, pal.hot].filter(Boolean).join(', ') + ')'
          } : null;
          return h('button', {
            key: c.id, type: 'button',
            className: 'dshMvCard' + (selected ? ' dshMvCardOn' : ''),
            onClick: function () { onPick(c.id); },
            'data-style': c.id,
            'aria-pressed': selected
          }, [
            // 展示图优先：内嵌的真实 preset 缩略图；没有图才落到配色渐变；再没有就灰块+如实标注
            showcase
              ? h('img', {
                  key: 'art', className: 'dshMvCardArt dshMvCardImg', src: showcase,
                  alt: '', 'aria-hidden': 'true', 'data-showcase': '1'
                })
              : (artStyle
                ? h('span', { key: 'art', className: 'dshMvCardArt', style: artStyle, 'aria-hidden': 'true' })
                : h('span', { key: 'art', className: 'dshMvCardArt dshMvCardArtOff', 'aria-hidden': 'true' },
                    h('span', { key: 't', className: 'dshMvDim' }, t('popup.noSwatch')))),
            h('span', { key: 'name', className: 'dshMvCardName' }, c.label || c.title || c.id),
            h('span', { key: 'id', className: 'dshMvCardId' }, c.id)
          ]);
        }))];
      var hit = null;
      for (var i = 0; i < cards.length; i++) {
        if (String(cards[i].id) === String(selectedId)) { hit = cards[i]; break; }
      }
      kids.push(h('div', {
        key: 'summary', className: 'dshMvHint',
        'data-style-summary': hit ? hit.id : ''
      }, hit && hit.summary ? hit.summary : t('popup.styleNone')));
      return kids;
    }

    /**
     * codeMV 弹层：宿主原生 DOM —— 标准标签 + 设计令牌，不创建自定义元素、不内嵌网页。
     * 每一行都读 /music-mv/api/state 的实测值；接口不可达就如实写离线，不摆占位数据。
     * Native-DOM popup for the codeMV entry: standard tags and host design tokens only.
     */
    function EntryPopup(props) {
      var t = props.t;
      var ctx = props.ctx;
      // 重开时用上一次广播的实测状态即时回填（真实数据、随后照常轮询刷新；没有就从「读取中」开始）
      var st = React.useState(function () { return lastState || { phase: 'probing', data: null }; });
      var phase = st[0].phase;
      var data = st[0].data;
      var retryState = React.useState(0);   // 「重试」重挂轮询 effect / retry restarts the poll
      var panelState = React.useState('main');  // 分级 UI：main | render | styles
      var panel = panelState[0];
      var projectState = React.useState('');    // 联系表面板选中的工程（'' = 自动挑最近）
      var noticeState = React.useState('');
      var busyState = React.useState(false);
      var notice = noticeState[0];
      var busy = busyState[0];
      // 开工预设：默认取上次的选择 / kickoff presets, defaulting to the last choice
      var tierState = React.useState(lsGet(LS_TIER, 'standard'));
      var styleState = React.useState(lsGet(LS_STYLE, 'deepseek'));
      var fpsState = React.useState(lsGet(LS_FPS, ''));   // '' = 跟随工程，不写进提示词 / follow the project
      var cwState = React.useState(lsGet(LS_CUSTOM_W, '1920'));   // 自定义档：宽（横竖屏切换也写这里）
      var chState = React.useState(lsGet(LS_CUSTOM_H, '1080'));   // 自定义档：高
      var tier = tierState[0];
      var style = styleState[0];
      var fps = fpsState[0];
      var cw = cwState[0];
      var ch = chState[0];
      var optState = React.useState(null);   // null = 还没取到 / not fetched yet
      var opts = optState[0];

      /**
       * 轮询宿主状态：弹层开着才刷，有任务 700ms，无任务 2500ms，
       * 关闭时 clearTimeout —— 绝不在后台空转。
       */
      React.useEffect(function () {
        if (typeof fetch !== 'function') { st[1]({ phase: 'absent', data: null }); return undefined; }
        var alive = true;
        var timer = null;
        function schedule(ms) { if (alive) timer = setTimeout(tick, ms); }
        function tick() {
          fetch('/music-mv/api/state', { headers: { 'x-music-mv': 'studio' } })
            .then(function (r) { if (!r.ok) throw new Error('state ' + r.status); return r.json(); })
            .then(function (d) {
              if (!alive) return;
              var next = { phase: 'ready', data: d || null };
              st[1](next);
              broadcastState(next);
              var running = !!(d && d.job && d.job.status === 'running');
              schedule(running ? 700 : 2500);
            })
            .catch(function () {
              if (!alive) return;
              var next = { phase: 'absent', data: null };
              st[1](next);
              broadcastState(next);
              schedule(2500);
            });
        }
        schedule(300);
        return function () { alive = false; if (timer) clearTimeout(timer); };
      }, [retryState[0]]);

      /**
       * 档位与风格清单：取宿主的；取不到就用内置清单并如实标注离线。
       * 挂载时取一次，**打开风格画廊时再取一次** —— 模型刚创建的新预设立刻可见。
       */
      function fetchPresets() {
        if (typeof fetch !== 'function') { optState[1]({ offline: true }); return; }
        fetch(API_BASE + '/presets', { headers: API_HEADERS })
          .then(function (r) { if (!r.ok) throw new Error('presets ' + r.status); return r.json(); })
          .then(function (d) {
            var tiers = d && Array.isArray(d.tiers) && d.tiers.length ? d.tiers : FALLBACK_TIERS;
            var styles = d && Array.isArray(d.presets) && d.presets.length
              ? d.presets.map(function (p) { return p && p.id; }).filter(Boolean)
              : FALLBACK_STYLES;
            var fpsChoices = d && Array.isArray(d.fps) && d.fps.length ? d.fps : FALLBACK_FPS;
            // 整份预设对象留着：title/summary/palette 是风格画廊「展示图」的原料
            var presetCards = d && Array.isArray(d.presets) ? d.presets : [];
            optState[1]({
              offline: false, tiers: tiers, styles: styles, fps: fpsChoices, presets: presetCards
            });
          })
          .catch(function () { optState[1]({ offline: true }); });
      }
      React.useEffect(function () { fetchPresets(); }, []);

      var projects = data && Array.isArray(data.projects) ? data.projects : [];
      function say(key) { noticeState[1](String(t(key) || '')); }

      function tierList() { return (opts && opts.tiers) || FALLBACK_TIERS; }
      function styleList() { return (opts && opts.styles) || FALLBACK_STYLES; }
      /** 帧率清单永远以「跟随工程」打头：没选就不写进提示词，绝不编造帧率。 */
      function fpsList() {
        var list = (opts && opts.fps) || FALLBACK_FPS;
        var hasFollow = list.some(function (id) { return String(id) === ''; });
        return hasFollow ? list : [''].concat(list);
      }
      function tierTitle(id) {
        var hit = tierList().filter(function (x) { return x.id === id; })[0];
        return hit ? hit.title : '';
      }
      /** 某个风格的宿主 title（拿不到就空串，交 styleLabel 走内置中文名）。 */
      function styleTitle(id) {
        var presets = (opts && opts.presets) || [];
        for (var i = 0; i < presets.length; i++) {
          if (presets[i] && String(presets[i].id) === String(id)) return String(presets[i].title || '');
        }
        return '';
      }
      function onTier(e) { var v = e && e.target ? e.target.value : ''; tierState[1](v); lsSet(LS_TIER, v); }
      function onStyle(e) { var v = e && e.target ? e.target.value : ''; styleState[1](v); lsSet(LS_STYLE, v); }
      function onFps(e) { var v = e && e.target ? e.target.value : ''; fpsState[1](v); lsSet(LS_FPS, v); }
      /** 自定义宽高：只留数字（最多 5 位），空值回落默认（lsGet 把 '' 当缺省）。 */
      function onW(e) {
        var v = String(e && e.target ? e.target.value : '').replace(/[^0-9]/g, '').slice(0, 5);
        cwState[1](v); lsSet(LS_CUSTOM_W, v);
      }
      function onH(e) {
        var v = String(e && e.target ? e.target.value : '').replace(/[^0-9]/g, '').slice(0, 5);
        chState[1](v); lsSet(LS_CUSTOM_H, v);
      }

      /** 当前尺寸：自定义档取输入值，内置档从标题解析；都取不到返回 null（不猜）。 */
      function currentDims() {
        if (tier === 'custom') {
          var w = parseInt(cw, 10), h = parseInt(ch, 10);
          return w > 0 && h > 0 ? { w: w, h: h } : null;
        }
        return parseDims(tierTitle(tier));
      }

      /** 横竖屏切换：当前尺寸对调 → 对得上内置档就切档，对不上落「自定义」并记住输入。 */
      function onToggleOrientation() {
        var dims = swapDims(currentDims());
        if (!dims) return;
        var hit = findTierByDims(tierList(), dims);
        if (hit) { tierState[1](hit.id); lsSet(LS_TIER, hit.id); return; }
        cwState[1](String(dims.w));
        chState[1](String(dims.h));
        lsSet(LS_CUSTOM_W, dims.w);
        lsSet(LS_CUSTOM_H, dims.h);
        tierState[1]('custom');
        lsSet(LS_TIER, 'custom');
      }

      /** 以队友/子代理开工：四级降级，每一级都回报真实模式；预设随提示词一起带过去。 */
      function onTeammate() {
        if (busy) return;
        busyState[1](true);
        var tierBit = resolutionLabel(tier, tierTitle(tier), String(t('popup.tierCustom')), cw, ch);
        var extra = kickoffExtra(tierBit, style, fps);
        Promise.resolve()
          .then(function () { return startTeammate(ctx, extra); })
          .then(function (res) {
            busyState[1](false);
            say(res && KICKOFF_NOTICE[res.mode] ? KICKOFF_NOTICE[res.mode] : 'popup.teammateNone');
          }, function () { busyState[1](false); say('popup.teammateNone'); });
      }

      /** 分级 UI 导航：主面板 → 联系表渲染 / 风格画廊（返回键在面板头部）。 */
      function onOpenRender() { panelState[1]('render'); }
      function onOpenStyles() { fetchPresets(); panelState[1]('styles'); }
      function onBack() { panelState[1]('main'); }

      /** 工程管理行点进来：选中该工程并直接进联系表面板（统一管理界面的动线）。 */
      function onOpenProject(v) {
        projectState[1](String(v || ''));
        panelState[1]('render');
      }

      /** 画廊里挑风格：与主面板的下拉共用同一份 localStorage 记忆。 */
      function onStylePick(id) {
        var v = String(id || '');
        styleState[1](v);
        lsSet(LS_STYLE, v);
      }

      function onPickProject(e) { var v = e && e.target ? e.target.value : ''; projectState[1](v); }

      function selectedProject() {
        for (var i = 0; i < projects.length; i++) {
          var v = projects[i].path || projects[i].name;
          if (v === projectState[0]) return projects[i];
        }
        return newestProject(projects);
      }

      /**
       * 直接渲染联系表：插件自己调宿主接口（不经过模型），
       * 回执如实 —— 成功说提交、失败带宿主报错原文（例如「已有任务在跑」）。
       */
      function onStartRender() {
        if (busy) return;
        var target = selectedProject();
        if (!target) { say('popup.renderNone'); return; }
        busyState[1](true);
        Promise.resolve()
          .then(function () { return apiPost('/render', { project: target.path || target.name, mode: 'contact' }); })
          .then(function (d) {
            busyState[1](false);
            if (d && d.ok) { say('popup.renderSent'); return; }
            noticeState[1](String((d && d.error) || t('popup.renderFailed')));
          }, function () { busyState[1](false); say('popup.renderFailed'); });
      }

      /** 取消渲染：没任务在跑时如实说「没有任务」，不谎报取消成功。 */
      function onCancelRender() {
        if (busy) return;
        busyState[1](true);
        Promise.resolve()
          .then(function () { return apiGet('/cancel'); })
          .then(function (d) {
            busyState[1](false);
            if (d && d.cancelled) say('popup.cancelled');
            else if (d && d.ok) say('popup.cancelNothing');
            else say('popup.cancelFailed');
          }, function () { busyState[1](false); say('popup.cancelFailed'); });
      }

      /** 创建预设（AI 智能体操作）：把指令交给当前会话；会话不可用就复制指令，两级都如实回报。 */
      function onCreatePreset() {
        if (busy) return;
        busyState[1](true);
        Promise.resolve()
          .then(function () { return askAgent(ctx, CREATE_PRESET_PROMPT); })
          .then(function (res) {
            busyState[1](false);
            say(res && res.ok ? 'popup.presetSent' : 'popup.presetClipboard');
          }, function () { busyState[1](false); say('popup.presetClipboard'); });
      }

      function onCopyPath() {
        var root = data && data.root ? String(data.root) : '';
        if (!root || typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) {
          say('popup.copyFailed'); return;
        }
        Promise.resolve(navigator.clipboard.writeText(root)).then(
          function () { say('popup.copied'); },
          function () { say('popup.copyFailed'); });
      }

      /** 重试：先如实切回「读取中」，再重挂轮询 effect（retry 计数是它的依赖）。 */
      function onRetry() {
        st[1]({ phase: 'probing', data: null });
        retryState[1](retryState[0] + 1);
      }

      // 分级 UI：主面板 / 联系表渲染 / 风格画廊
      var isRender = panel === 'render';
      var isStyles = panel === 'styles';
      var running = !!(data && data.job && data.job.status === 'running');

      // 开工前的预设选择（清晰度 / 风格 / 帧率），离线时如实标注
      var presetBlock = h('section', {
        key: 'opts', className: 'dshMvSection dshMvOpts',
        'data-music-mv-opts': '1', 'data-section': 'presets'
      }, [
        h('div', { key: 'h', className: 'dshMvSectionTitle', role: 'heading', 'aria-level': 2 }, t('popup.kickoffOpts')),
        // 清晰度行：下拉（含「自定义」档）+ 横竖屏切换按钮（当前尺寸对调，能对上内置档就切档）
        h('div', { key: 'tl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.tier')),
          h('select', {
            key: 's', className: 'dshMvSel', value: tier, onChange: onTier,
            'data-select': 'tier', 'aria-label': String(t('popup.tier'))
          }, tierList().map(function (x) {
            return h('option', { key: x.id, value: x.id }, x.title || x.id);
          }).concat([
            h('option', { key: 'custom', value: 'custom' }, t('popup.tierCustom'))
          ])),
          h('button', {
            key: 'or', type: 'button', className: 'dshMvAct dshMvActInline',
            onClick: onToggleOrientation, 'data-orient': '1',
            'aria-label': String(t('popup.orientation')), title: String(t('popup.orientation'))
          }, '⇄')
        ]),
        // 自定义尺寸：只在「自定义」档出现（宽/高数字输入，随横竖屏切换联动，写进开工提示词）
        tier === 'custom'
          ? h('div', { key: 'cs', className: 'dshMvField', 'data-custom-size': '1' }, [
              h('span', { key: 'wl', className: 'dshMvKey' }, t('popup.w')),
              h('input', {
                key: 'w', className: 'dshMvNum', type: 'number', min: 16, max: 7680,
                value: cw, onChange: onW, 'data-num': 'w', 'aria-label': String(t('popup.w'))
              }),
              h('span', { key: 'hl', className: 'dshMvKey' }, t('popup.h')),
              h('input', {
                key: 'h', className: 'dshMvNum', type: 'number', min: 16, max: 7680,
                value: ch, onChange: onH, 'data-num': 'h', 'aria-label': String(t('popup.h'))
              })
            ])
          : null,
        // 风格行：中文选项下拉 + 「创建预设」（AI 智能体操作：交给模型生成新风格，画廊里刷新即见）
        h('div', { key: 'sl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.style')),
          h('select', {
            key: 's', className: 'dshMvSel', value: style, onChange: onStyle,
            'data-select': 'style', 'aria-label': String(t('popup.style'))
          }, styleList().map(function (id) {
            // 中文选项：显示风格中文名（宿主 title 中文段 / 内置中文名），value 仍是英文 id
            return h('option', { key: id, value: id }, styleLabel(id, styleTitle(id)));
          })),
          h('button', {
            key: 'new', type: 'button', className: 'dshMvAct dshMvActInline',
            onClick: onCreatePreset, disabled: !!busy, 'data-act': 'createPreset',
            'aria-label': String(t('popup.createPreset')), title: String(t('popup.createPreset'))
          }, t('popup.createPreset'))
        ]),
        // 选中风格的展示图：内嵌 preset 缩略图，选完立刻看到这个风格长什么样
        showcaseFor(style)
          ? h('img', {
              key: 'strip', className: 'dshMvStrip', src: showcaseFor(style),
              alt: String(t('popup.preview')), 'data-showcase': 'strip'
            })
          : null,
        h('label', { key: 'fl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.fps')),
          h('select', {
            key: 's', className: 'dshMvSel', value: fps, onChange: onFps, 'data-select': 'fps'
          }, fpsList().map(function (id) {
            var v = String(id);
            return h('option', { key: v || 'follow', value: v }, v ? v + ' 帧/秒' : t('popup.fpsFollow'));
          }))
        ]),
        opts && opts.offline ? h('div', { key: 'off', className: 'dshMvNotice' }, t('popup.offlinePresets')) : null
      ]);

      // 一键进入子代理：标签页的主舞台（大按钮 + 说明 + 当前预设一行，点了就走四级降级开工链）
      var resBit = resolutionLabel(tier, tierTitle(tier), String(t('popup.tierCustom')), cw, ch);
      var styleBit = styleLabel(style, styleTitle(style));
      var fpsBit = fps ? (fps + ' 帧/秒') : '';
      var chipBits = [resBit, styleBit, fpsBit].filter(Boolean);
      var heroNode = h('div', { key: 'hero', className: 'dshMvHero', 'data-hero': '1' }, [
        h('button', {
          key: 'go', type: 'button', className: 'dshMvAct dshMvActPrimary dshMvHeroBtn',
          onClick: onTeammate, disabled: !!busy, 'data-act': 'teammate'
        }, t('popup.heroStart')),
        h('div', { key: 'sub', className: 'dshMvHint' }, t('popup.heroSub')),
        h('div', { key: 'chips', className: 'dshMvChips', 'data-hero-chips': '1' },
          chipBits.length ? (t('popup.heroChips') + chipBits.join(' · ')) : t('popup.heroNoPresets'))
      ]);

      // 主体按分级切换：hero + 状态 + 预设 / 联系表二级面板 / 风格画廊二级面板
      var bodyContent;
      if (isRender) {
        bodyContent = renderPanelBody(t, {
          phase: phase,
          projects: projects,
          selectedPath: projectState[0],
          job: data && data.job ? data.job : null,
          onPick: onPickProject,
          onRetry: onRetry
        });
      } else if (isStyles) {
        bodyContent = styleGallery(t, styleCards(opts, FALLBACK_STYLES), style, onStylePick);
        if (opts && opts.offline) {
          bodyContent = bodyContent.concat([
            h('div', { key: 'off', className: 'dshMvNotice', 'data-offline-presets': '1' }, t('popup.offlinePresets'))
          ]);
        }
      } else {
        bodyContent = [heroNode]
          .concat(popupBody(t, phase, data, onRetry, onOpenProject))
          .concat([presetBlock]);
      }

      var connKey = phase === 'ready' ? 'popup.connOk' : (phase === 'absent' ? 'popup.connOff' : 'popup.connProbe');
      var noticeNode = notice
        ? h('div', { key: 'notice', className: 'dshMvNotice', 'data-notice': '1', 'aria-live': 'polite' }, notice)
        : null;

      // 头部：二级面板多一个返回键，标题跟着面板走（标签页即外壳，无关闭/展开键）
      var headKids = [];
      if (isRender || isStyles) {
        headKids.push(h('button', {
          key: 'back', type: 'button', className: 'dshMvBack',
          onClick: onBack, 'aria-label': t('popup.back'), 'data-act': 'back'
        }, '←'));
      }
      headKids.push(h('span', { key: 'title', className: 'dshMvTitle' },
        t(isRender ? 'popup.renderPanel' : (isStyles ? 'popup.stylesPanel' : 'type.label'))));
      headKids.push(h('span', { key: 'conn', className: 'dshMvPill', 'data-conn': phase, 'data-state': phase }, t(connKey)));
      headKids.push(h('span', { key: 'spacer', className: 'dshMvSpacer' }));

      // 动作区按分级切换（钉底）：开工的主动作已上移到 hero，这里放次级动作
      var footActs;
      if (isRender) {
        footActs = [
          h('li', { key: 'st' },
            h('button', {
              type: 'button', className: 'dshMvAct dshMvActPrimary',
              onClick: onStartRender, disabled: !!busy, 'data-act': 'start'
            }, t('popup.renderStart'))),
          h('li', { key: 'cn' },
            h('button', {
              type: 'button', className: 'dshMvAct',
              onClick: onCancelRender, disabled: !!busy || !running, 'data-act': 'cancel'
            }, t('popup.renderCancel')))
        ];
      } else if (isStyles) {
        footActs = [
          h('li', { key: 'tm' },
            h('button', {
              type: 'button', className: 'dshMvAct dshMvActPrimary',
              onClick: onTeammate, disabled: !!busy, 'data-act': 'teammate'
            }, t('popup.teammate'))),
          h('li', { key: 'cp' },
            h('button', { type: 'button', className: 'dshMvAct', onClick: onCopyPath, 'data-act': 'copy' },
              t('popup.copyPath')))
        ];
      } else {
        footActs = [
          h('li', { key: 'rd' },
            h('button', { type: 'button', className: 'dshMvAct', onClick: onOpenRender, 'data-act': 'render' },
              t('popup.render'))),
          h('li', { key: 'sg' },
            h('button', { type: 'button', className: 'dshMvAct', onClick: onOpenStyles, 'data-act': 'styles' },
              t('popup.styles'))),
          h('li', { key: 'cp' },
            h('button', { type: 'button', className: 'dshMvAct', onClick: onCopyPath, 'data-act': 'copy' },
              t('popup.copyPath')))
        ];
      }

      return h('div', {
        className: 'dshMvPopup dshMvPage dshMvBig',
        role: 'region',
        'aria-label': String(t('type.label')),
        'data-music-mv-popup': '1'
      }, [
        // 头部（固定）：返回键（二级面板）+ 标题 + 连接状态药丸
        h('div', { key: 'head', className: 'dshMvHead' }, headKids),
        // 主体（可滚）：分级内容；key 跟着面板走 → 切级时重挂并播放滑入动画
        h('div', { key: 'body-' + panel, className: 'dshMvBody' }, bodyContent),
        // 动作区（钉底）：回执 + 分级动作
        h('div', { key: 'foot', className: 'dshMvFoot' }, [
          noticeNode,
          h('ul', { key: 'acts', className: 'dshMvActions' }, footActs)
        ])
      ]);
    }

    /**
     * 对话视图环里的「MV 工坊」标签页（与对话/轨迹**平级**，注册进 conversation.view）：
     * 全幅管理界面，顶部一键进入子代理，下面是状态分区与开工预设。
     * A first-class view tab next to Chat/Trajectory: one-click subagent hero on top.
     */
    function MusicMvView(props) {
      return h(EntryPopup, { t: props.t, ctx: props.ctx });
    }

    var inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'];

    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      var definition = {
        id: STUDIO_ID,
        kind: STUDIO_KIND,
        priority: 'extension',
        title: function () { return t('type.label'); },
        guide: [{
          id: 'studio',
          order: 20,
          title: function () { return t('guide.title'); },
          description: function () { return t('guide.description'); }
        }]
      };
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); },
        'music-code-mv: 界面字典 / studio dictionaries');
      ctx.effect(function () { return ctx.sidebarRightTabs.register(definition); },
        'music-code-mv: 页面类型 / studio page type');
      // 侧栏主体：原生 DOM 状态镜像（无 iframe、无 window.open —— 用户要求「不要有任何网页对接」），
      // 离线降级仍在：开工走队友/子代理四级链，交接把请求直接交给模型。功能面板全部在 codeMV 弹层。
      ctx.effect(function () {
        return ctx.slots.inject('sidebar.right.pane.tab', function () {
          return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: STUDIO_ID, locale: NS }, function (props) {
            return h(StudioBody, Object.assign({}, props, {
              onKickoff: function () { return startTeammate(ctx); },
              onHandoff: function () { return askAgent(ctx, HANDOFF_PROMPT); }
            }));
          });
        });
      }, 'music-code-mv: 页面主体 / studio page body');
      // 右下角常驻悬浮窗仍不恢复：入口在标题栏 codeMV 弹层 / no bottom-right dock.
      // 入口样式：只挂一份，卸载时摘掉 / one style node, removed on dispose.
      ctx.effect(function () {
        ensureEntryStyle();
        return function () {
          try {
            var el = document.getElementById(ENTRY_STYLE_ID);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          } catch (e) { /* 无 DOM / no DOM */ }
        };
      }, 'music-code-mv: 入口样式 / entry style');
      // 对话视图环：注册成与对话/轨迹平级的「MV 工坊」标签页（宿主声明 conversation.view 后自动出现；
      // 标签条按注册项自动生成 label，点击由宿主 activateView 切换，仅激活时挂载）
      ctx.effect(function () {
        return ctx.slots.inject('conversation.view', function () {
          return ctx.slots.register({
            name: 'conversation.view',
            id: 'music-mv',
            order: 20,
            locale: NS,
            label: function () { return t('type.label'); },
            inject: function () { return { ctx: ctx }; }
          }, MusicMvView);
        });
      }, 'music-code-mv: 对话视图环 / conversation view ring');
      // 同源状态通道：面板广播的实测状态在这里回填，重开时即时显示 / same-origin state channel
      ctx.effect(function () {
        try {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return function () {};
          }
          window.addEventListener('message', onPanelMessage);
          return function () {
            try { window.removeEventListener('message', onPanelMessage); } catch (e) { /* no DOM */ }
          };
        } catch (e) { return function () {}; }
      }, 'music-code-mv: 同源状态通道 / same-origin state channel');
      autoOpen(ctx);
    }

    /** 第一次打开时自动开一次「MV 工坊」，之后交给用户。 */
    function autoOpen(ctx) {
      var done = false;
      try { done = window.localStorage.getItem(OPENED_KEY) === '1'; } catch (e) { done = false; }
      if (done) return;
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        try {
          ctx.sidebarRight.openTab(STUDIO_KIND);
          clearInterval(timer);
          try { window.localStorage.setItem(OPENED_KEY, '1'); } catch (e) { /* private mode */ }
        } catch (e) {
          if (tries > 30) clearInterval(timer);
        }
      }, 2000);
    }

    exports.apply = apply;
    exports.inject = inject;
    // 测试钩子：直接渲染面板与各级纯函数，省掉一整套状态桩 / test-only handles
    exports.__internals = {
      EntryPopup: EntryPopup,
      popupBody: popupBody,
      progressNode: progressNode,
      contactUrl: contactUrl,
      renderPanelBody: renderPanelBody,
      styleCards: styleCards,
      styleGallery: styleGallery,
      projectRow: projectRow,
      projectProgress: projectProgress,
      remainingText: remainingText,
      createPresetPrompt: CREATE_PRESET_PROMPT,
      showcase: SHOWCASE_IMAGES,
      styleLabel: styleLabel,
      FALLBACK_STYLE_TITLES: FALLBACK_STYLE_TITLES,
      openStudioPage: openStudioPage,
      startTeammate: startTeammate,
      KICKOFF_NOTICE: KICKOFF_NOTICE,
      jobLine: jobLine,
      jobRows: jobRows,
      kickoffExtra: kickoffExtra,
      parseDims: parseDims,
      swapDims: swapDims,
      findTierByDims: findTierByDims,
      resolutionLabel: resolutionLabel,
      composePrompt: composePrompt,
      handoffPrompt: HANDOFF_PROMPT,
      FALLBACK_TIERS: FALLBACK_TIERS,
      FALLBACK_STYLES: FALLBACK_STYLES,
      FALLBACK_FPS: FALLBACK_FPS
    };
    return module.exports;
  }
});
