/**
 * dsh-music-code-mv — 浏览器半边 / client half.
 *
 * 控制面板分两级（分级 UI，全标准 DOM + DSH 设计令牌）：
 * 1) 标题栏右上角 codeMV 弹层 = 主控制面板 —— 状态（分区 + 原生 <progress>）、开工预设
 *    （清晰度 / 风格 / 帧率），加两个二级面板：联系表直渲（插件自己 POST /music-mv/api/render，
 *    实时进度 + 同源 <img> 预览）与风格画廊（每张卡片带配色展示图）。
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
      'sidebar.hint': '操作、开工预设与联系表渲染都在标题栏 codeMV 弹层里；这个页面只显示状态。',
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
      // 分区标题：总览 / 工程管理 / 渲染状态 / 开工预设 / 操作 / section titles
      'popup.section.status': '总览',
      'popup.section.projects': '工程管理',
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
      'popup.style': '风格',
      'popup.fps': '帧率',
      'popup.fpsFollow': '跟随工程',
      'popup.offlinePresets': '离线：用内置预设清单',
      'popup.actions': '操作',
      'popup.close': '关闭',
      'popup.teammate': '以队友/子代理开工',
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
      'popup.fullscreen': '全屏',
      'popup.exitFullscreen': '退出全屏',
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
      'sidebar.hint': 'Actions, kickoff presets and contact-sheet rendering live in the codeMV popup in the title bar; this page only shows status.',
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
      'popup.section.status': 'Overview',
      'popup.section.projects': 'Projects',
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
      'popup.style': 'Style',
      'popup.fps': 'Frame rate',
      'popup.fpsFollow': 'Follow the project',
      'popup.offlinePresets': 'Offline: using the built-in preset list',
      'popup.actions': 'Actions',
      'popup.close': 'Close',
      'popup.teammate': 'Start as teammate / subagent',
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
      'popup.fullscreen': 'Fullscreen',
      'popup.exitFullscreen': 'Exit fullscreen',
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

    // ---- 标题栏右上角入口 / conversation-titlebar top-right entry ----
    /** 入口样式只注入一次，重复载入留同一份 / one style node per page. */
    var ENTRY_STYLE_ID = 'dsh-music-code-mv-entry-style';
    /** 图标与文案；窄宽度折叠成纯图标（容器查询优先，窗口查询兜底）；弹层走宿主菜单令牌、只用标准标签。 */
    var ENTRY_CSS =
      '.dshMvRoot{position:relative;}' +
      '.dshMvEntry{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;' +
      'border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));' +
      'border-radius:var(--dsw-radius-md, 6px);background:transparent;cursor:pointer;' +
      'color:var(--dsw-alias-label-secondary, #9aa3ad);font:500 12px/1 var(--dsw-font-family, inherit);}' +
      '.dshMvEntry:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #e6e9ee);}' +
      '.dshMvEntry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, #4176e6);outline-offset:1px;}' +
      '.dshMvEntryIcon{display:flex;flex:none;}' +
      '.dshMvEntryLabel{white-space:nowrap;}' +
      '@container (max-width: 760px){.dshMvEntryLabel{display:none;}.dshMvEntry{padding:0 6px;}}' +
      '@media (max-width: 960px){.dshMvEntryLabel{display:none;}.dshMvEntry{padding:0 6px;}}' +
      '.dshMvBackdrop{position:fixed;inset:0;z-index:99;background:transparent;}' +
      /* 三区结构：固定头部（标题 + 连接状态 + 关闭）/ 可滚动主体（分区状态）/ 固定动作区（主按钮钉底） */
      '.dshMvPopup{z-index:100;box-sizing:border-box;position:absolute;top:calc(100% + 5px);right:0;' +
      'width:min(340px, calc(100vw - 24px));max-height:min(74vh, calc(100vh - 140px));' +
      'container-type:inline-size;' +
      'overflow:hidden;display:flex;flex-direction:column;border:0;' +
      'border-radius:var(--dsw-radius-lg, 12px);background:var(--dsw-specific-menu, #232324);' +
      'color:var(--dsw-alias-label-primary, #f9fafb);box-shadow:var(--dsw-elevation-prominent, 0 6px 24px rgba(0,0,0,.28));' +
      'backdrop-filter:var(--dsw-menu-backdrop-filter);font:12px/1.5 var(--dsw-font-family, system-ui, sans-serif);}' +
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
      '.dshMvClose{font:inherit;line-height:1;cursor:pointer;padding:2px 6px;border-radius:var(--dsw-radius-sm, 6px);' +
      'color:var(--dsw-alias-label-tertiary, #adb2b8);background:transparent;border:0;}' +
      '.dshMvClose:hover{background:var(--dsw-alias-fill-l1, rgba(148,163,184,.14));color:var(--dsw-alias-label-primary, #f9fafb);}' +
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
      '.dshMvCardArt{display:block;height:44px;' +
      'border-radius:var(--dsw-radius-sm, 6px);border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));}' +
      '.dshMvCardArtOff{background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.18));' +
      'display:flex;align-items:center;justify-content:center;text-align:center;padding:0 4px;}' +
      '.dshMvCardName{font-weight:600;font-size:11px;line-height:1.3;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dshMvCardId{font-size:10px;color:var(--dsw-alias-label-tertiary, #adb2b8);}' +
      /* 卡片展示图（内嵌缩略）与预设区的选中风格条 */
      '.dshMvCardImg{width:100%;height:44px;object-fit:cover;}' +
      '.dshMvStrip{display:block;width:100%;height:40px;object-fit:cover;' +
      'border-radius:var(--dsw-radius-md, 6px);border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));}' +
      /* 工程管理行：缩略图 + 名称/规格 + 产物标记（统一管理界面） */
      '.dshMvProj{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:4px;' +
      'cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-secondary, #9aa3ad);' +
      'background:transparent;border:1px solid transparent;border-radius:var(--dsw-radius-sm, 6px);}' +
      '.dshMvProj:hover,.dshMvProj:focus-visible{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvThumb{display:block;flex:none;width:48px;height:27px;object-fit:cover;' +
      'border-radius:4px;border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));' +
      'background:var(--dsw-alias-bg-layer-2, rgba(148,163,184,.18));}' +
      '.dshMvProjInfo{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}' +
      '.dshMvProjName{font-weight:600;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dshMvProjSpec{font-size:10px;color:var(--dsw-alias-label-tertiary, #adb2b8);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dshMvProjMeta{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary, #adb2b8);}' +
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
      /* 分区标题提一档对比度（11px 小字不压 tertiary） */
      '.dshMvSectionTitle{color:var(--dsw-alias-label-secondary, #9aa3ad);}' +
      /* 全屏按钮（aria-pressed 可键盘操作） */
      '.dshMvFsBtn{font:inherit;line-height:1;cursor:pointer;padding:3px 7px;white-space:nowrap;' +
      'border-radius:var(--dsw-radius-sm, 6px);color:var(--dsw-alias-label-secondary, #9aa3ad);' +
      'background:transparent;border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));}' +
      '.dshMvFsBtn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvFsBtn[aria-pressed="true"]{color:var(--dsw-alias-state-business-primary, #4176e6);' +
      'border-color:var(--dsw-alias-state-business-primary, #4176e6);}' +
      /* 专属全屏界面：占满视口（与对话/轨迹平级的整屏视图），宽屏分两栏、动作条横排 */
      '.dshMvPopupFs{border-radius:0;animation:dshMvFs .18s ease-out;}' +
      '.dshMvPopupFs .dshMvHead{padding:14px 18px 10px;}' +
      '.dshMvPopupFs .dshMvBody{padding:0 18px 18px;gap:12px;}' +
      '.dshMvPopupFs .dshMvFoot{padding:10px 18px 14px;}' +
      '@container (min-width: 560px){' +
      '.dshMvPopupFs .dshMvBody{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;}' +
      '.dshMvPopupFs .dshMvBody>[data-section="projects"]{grid-column:1 / -1;}' +
      '.dshMvPopupFs .dshMvBody>*+*{border-top:0;padding-top:0;}' +
      '.dshMvGallery{grid-template-columns:repeat(3, minmax(0, 1fr));}}' +
      '@container (min-width: 860px){' +
      '.dshMvGallery{grid-template-columns:repeat(4, minmax(0, 1fr));}' +
      '.dshMvPopupFs .dshMvFoot .dshMvActions{flex-direction:row;flex-wrap:wrap;}' +
      '.dshMvPopupFs .dshMvFoot .dshMvActions>li{flex:1 1 170px;}}' +
      /* 动画：开屏弹入 / 分级切换滑入 / 全屏铺开；悬停走短过渡；尊重系统「减少动态效果」 */
      '@keyframes dshMvPop{from{opacity:0;transform:translateY(-6px) scale(.985);}to{opacity:1;transform:none;}}' +
      '@keyframes dshMvPanel{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:none;}}' +
      '@keyframes dshMvFs{from{opacity:.35;transform:scale(.985);}to{opacity:1;transform:none;}}' +
      '@keyframes dshMvFade{from{opacity:0;}to{opacity:1;}}' +
      '.dshMvPopup{animation:dshMvPop .16s ease-out;}' +
      '.dshMvBackdrop{animation:dshMvFade .16s ease-out;}' +
      '.dshMvBody{animation:dshMvPanel .18s ease-out;}' +
      '.dshMvAct,.dshMvCard,.dshMvProj,.dshMvEntry,.dshMvSel,.dshMvBack,.dshMvFsBtn{' +
      'transition:background .12s ease,color .12s ease,border-color .12s ease,opacity .12s ease;}' +
      '@media (prefers-reduced-motion: reduce){' +
      '.dshMvPopup,.dshMvBackdrop,.dshMvBody,.dshMvPopupFs{animation:none;}' +
      '.dshMvAct,.dshMvCard,.dshMvProj,.dshMvEntry,.dshMvSel,.dshMvBack,.dshMvFsBtn{transition:none;}}';

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
    var LS_FS = 'dsh-music-code-mv.fullscreen';   // 全屏偏好 / remember fullscreen

    /**
     * 风格展示图：skill/reference/img/preset-*.png 的 256×144 WebP 缩略（data URI 内嵌），
     * 离线可用、零额外路由；由 scripts/embed-showcase.py 灌入，空表也能跑（回落配色块）。
     * Showcase thumbnails embedded as data URIs — real artwork, no network, no host route.
     */
        var SHOWCASE_IMAGES = {
      'claude': 'data:image/webp;base64,UklGRmoFAABXRUJQVlA4IF4FAACwJACdASoAAZAAPtForVEoJjK1pHQIurAaCWdue7PIVdKruU+wdatY8yOC00T21x5a+N9gye7PegZ54ndYd7ARCXxmIvtUid7PVDlB33XoUNnmqV1Ezw37ahaug40/VUciS+ZrA2BDXx+bxJEl8OxllyEF609pxtrNBeiaMcoWdhr/z8gRNkyEwO9np6HJB11uFez9soG8gPygkuKzn4kdTZifKOO0v4nBvc5SRcS9Q0XmRP9DaH0shP6V2I6jYCTXAAlRrV8Amp55sJK9S0iSZLHCzG0zWP0Zif4bRPtEzDTirZzbFfB93JlA/pqN6Gasi+73d/FGDOR352GxwoXWxDPB/2OHhvx2v2T4KzqhM7i4EHiqsCjisEbrrsCWb3zNYbpvQRLRI3F4SDv1QAD+8EfOXBTDd05Ce3ZlJUn9jBdtbIz3bW56ZjVegc8WMKaL0/g2DvD51BO2S39NE2Ne9okrnvUPp5X9E7BFniPRl6Yg7dIdI5GAIFCFaeK+7DzbMt2G+tB+/cFU5FQTqAVLLaUbOIA6vteYJrQQTNI/Cropa/BV6LnaR5AU6rJfm3URcqyhzR7edGDZrlT6OmOnUuW9nNyxvXBq8mlqlgGIgx7bXOkF65PAD0jXY01rcZEzcS4f6T8s4Bku9BYlZIAQy3lSDk/7KM/BHWPh7KfaglgyPhotCLfeFiklsvHaO50WdYe9bkHLFE7VwLAC6bMRkgVX71UmSNOJ9MXIZoUziYiGa1f3tmLAVBE9XD+uSxdfcveqRTTaFke0LE0KzrUArlDMK6WXZh3FI7p5Wbm+qwyAuNIWsah27tlNLO7qMvkTknI9OUwg3Vx8AueYixFt5DEDVMEchvLhdIr+GCWoGxBFhb9Vc+yzq8ma6PmIzcFpceaVjY2V/nX65ev8BZ8UkVkaIjGMD4Uf1bHspE4Hy1l1hETGQm9vCMu+nGZSNELvff06UkxufV2cH4zBj3WGsL3w2Ku1vo1DJd+ifGgHRbofJUupXXJsQ13a816w4oFM+LU18qw4yK3DzCNRpiFVSX3FlfGnzPZhh6wIab/DdPBVSFrF3Qf+ienAW/V3Yj83kvwUpEmprKFyd3LNlXm+YciHYRuZh1Oi/KwzI9nzkUKq8j8/iL9EGfGMN/qaXMRh1nmhvPeZBHCtHaWLnhoWKYBN+VlLjSWzbYik92rHlmt5jlFX24gYBegNjeE+jKumMS6x9rAwdPpL9p04lSiVwszbThwLZE9FbXDfXHpxRT1Xowd+zOHLW4jv6n75cbV0qswqtcnO94ftsGTd2L1eAAepUs8l9jVk9kz+WVgRYnauUFHydca3zqpFb44YergEQMgRK41lPCIY80ycnmb3Y1Nau1XqvYn/8itSBxLvcwchrQS9h+lkSr7k0agfP1fnbSaNd5keJ4FSjxC57ubiwLqaH1sqZvonoW5oU1MpD1JmvvqShnQw4k/CxJ9ksbDhbc91aC8j/a17kmEWK8U1viCwrZkDxIsK2zkU9ocH1LC29F2GcS1clwEHvEWPEIp3BWIfBGmQuCRb4qGyKEen+yhaBWrTmuQCg4aMnu0PdRI1oX6H5oxD82cNsDhCFuZYzaxujQQKe7RD73f5ufPzl2LCcjRaUTRs67myowprzPYevWpd46Cn7Hr2Y1O6YQ8N9MaF5rAmmbsfN0tLZGAiJsOdAp3PgxW7pyuY1t/Okjpbc8lcEKyrrmSTwBMU47F67MxD9Xp3waavhXLQfDzS4RW8b9+NWyIOnPzDp0XjWtrjGFzcsvtX+baK3tMF29PPxuDsEnlvjixeskBZFzIBpH520f1YaolhFJQAAAA=',
      'deepseek': 'data:image/webp;base64,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',
      'doubao': 'data:image/webp;base64,UklGRqYFAABXRUJQVlA4IJoFAABQJACdASoAAZAAPtForFCoJqSnJXgI4QAaCWNuvUKfKeFs0Vc/ufHR+W78Po63EHmA84/TWC1c69W7R+I20IfDAjT1ME1r682qAV6ufw5sMnG6EvQQ7zV3wodr/1QCX3cHERgBPqYc7pM5UGNmrseP7glHdzckt31yShIWftsoHuyyjHzUvWJsrWQVSP0Wt0qwUdww6XXS5fnM4BpyJ0nQCP2mfOHCFKa0aR3ZUqaR+K9ZfGGIOFLfptDczhTD8EomUIfN4kk97XSxWKpEKQcjDfmYUr1tHFCEqMJG2eL/SEdisgloGk5oawA4vMjkMIGh3Zy5k/orY6qk0l0UosX7jW9LMkZstw9mg0iR5VmRcBifXkpxBfpb4H71SfOpqzuzBS7IW1FzY20PAAD+8QzMxHTFeCPi1MsZ73T4J0obfAieKh3PPcmkouVY3jqGr6JWg6NeX8CXbzCIpP8sI4eukCGH9EswKQvIgWICiHQ/4qM3azYQHb/3lh4C8AOtQHM9wJFk4C51GgQH8z9uvBsYoP9tfyYlm5tje6Yz5ysAg8EP0j9efUZ5XHVLJ/j9sXgAUVKTYVCUeJ/8VGODMymcLI+q8Z74lefL0EkkNs3BM4pNeaWGr9/j9lkri9onTv5TdGaCmlIZuSlH9DSKj/sDHZcAgyDmRD6F0sVoOEu02Lhr6MgIKHmJ5N6ICmDCHQ6+21BOjqlzVaFnFxFk0eSRIIoofGh2G8J7YrbLT+S6KWIneFe1l7acquvnGyfsRJvTLG8gByz+HfQe9Nh4CR1nq6bXtoPJgxw6/KiXcwr/N0JChgMk9R5zvUXIK5nt1dUK3g+dwMxJjCpVrXagcWu2yNV8BQ71x6ECTTgrcbuH9H9LJC7cglHPK3B7ptQCoy79+hqm3KB1ZgXkL+JkesJ6snhEYSTNVInZBT3JwIHSxxbtKXmgV4rTiJtuBJhqadYu5dHBR7RGG1h+S5czzdBhC2HBJxEpiIi0lrF9fTvz/rmMUMibTBTerhL4/HAIq4OKgzJ0wEj4Xd5NBF7HuZNg7vX23CSEdjLyProv6SNoiLI9YB6zdFt6EyhTcpd6w9mt0rUcYVvxj2Q/TMXcCAPVacQwsgBPUBHWv3thBVqIEInL3xaQUy7uGX/ezeOOsnRMH20NYhXO0Cx5Nxa7fx9RpF654MMCYVX8Sshm02F/LrHn7jFhx19P6CZHoD8yFOG/0EAec9n3rQCn2m6WmbwD0diBmOEBG/98Oa7JBZrIwXoCeVbsLRa3hiI0KzWZ9nytxTWRXq4q5LQS5te0Yp+te7hQ3DHeDYGbLVh6TJzEYC5vDm4wgvMEvOERV3WLKRV6Cc9o4+lrDUug4SmZtcm/Iyv+mulh1odgvrLwlHWa5gb3NcgdnE/MZES+Wlunj0Lm0UXkIhWxWXse5FtGzD+9QzdfbgVcXhGR/oinv+o4BZu5P85NDWTmTCZqG1NOHi/SKLiKRrxGaKnsEJ9LqHWtvJ726SspWNinJeZ6Q0/VN7hrq7vQQxCY8L3KgHgUTx4zs75EeN8Ru8qEuPZDbk9uooDSBz95zkTUlQPR8/xyDbhHbdUOB/h6taBPazBaMwrYg0C2dCYgFoJFyXIarF+p+EaM6SClNMuH5mtJW8IvInA/ASmfHHmhgxXJdJW7suquA1NhN7hTchKyKPj1RiFxMBNX+r0JmxIK6CtLeJ85RAb4WEioZMwRQI3HIwbd+ATkXnUt/FZcKbf0czSlwZUj9yr9zEGI4VF831uYNlvwoA5QPtGw1eHLDSrigagAMnY/QvFmJLPII7sV7EB27joWZjPZjFr7UXGItGWFihbv7W8Curi2GJTFhUROwQrJnKfXLRm2+Qs11JJ1U23eN8TzbKoJ6WVr9DjOLco6On6xRP2KNccvnliAAAA=',
      'dusk-lofi': 'data:image/webp;base64,UklGRuABAABXRUJQVlA4INQBAAAQEgCdASoAAZAAPtFosVKoJqUnoTmYMQAaCWlu3V8QqUAfen9cMdIPn0GhqVGvwvl8sj8fyABRvVj/u91Ws046VHb9HuoQYEi6uh21UII/Sb2p0aPh4iyrZ0ZD4KKKSK3w1wR6Qr29Arj2ZKMGTfxf0ShC/EraAgU/EyUtEaoerumetvNTsZFJDMZIqQme0VIdUqUnUAfeAQAA/vAgAvqkmSaT6M2FsHx+JOdEknjG61JeKkYGP3mcHOjQeEofQvNv1ZuzmAT8s7f0beI4VVe7Z0pBazKP+h9/n0XRNNcv0D9fUUy9+qvPOaGgZHyf8zgyB0P9ha5uMmvofkeyaoij1TepOckq/+Xpinfv9byunN0Phm9O1qxu2cVQn5x+esIk/H1goFzjthZ0gkV6U1hTHPGzVsW9Lu+/9jRbzzhGxNMthYsScUtNTrSjPZzwT6nrz8rrs1dTHBVjTDjIq/xOyKvglI+uCtBRs1KKnC7VqaiZAWU2mNQpunG4XwONws09zUK+fjoVMGPEMt2K/kIgB/UqBTpyC0aigyqFrYNvp00QOFDDkeREUOVzlIPvVyRnilzGk8AB5J7VBgeDkxIrgqm8PjoXi3KSLukKThAEr0AAAAA=',
      'fairy': 'data:image/webp;base64,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',
      'gemini': 'data:image/webp;base64,UklGRq4FAABXRUJQVlA4IKIFAAAwJACdASoAAZAAPtFmrVGoJSSjpLGJCQAaCWVuhY3TPqUVR1xd6P3W9MtoZSK100MOBJINtfbOKh3TZpxZYaDmXWNt3ruUeh17V76esbhZkGPp9s7WAKawVlpsw8FeDiGfXi7D0xy4c2izQ6b5rv8GOnP3ibC+ndX6dqNWKHdbFyZgVUz28Qrw0Ppri2sWE9HNL0JEOBTkZutZCYnCQ7ko18g72gQV2xZIRrLKIk6bQUsRzgDCDurrqwC6JFX/0UhIKk1knhfUJw0znttH+y3TyJh23jE8336fHkk+OWsXvyJQBhox9dqmF57AK2sr+U0jDQvg+kePmKX3I1J+xLEWrO83rLQNTPfPboemzCatxw4eJSuz7GLYB0MaFxeAoBqoRuJKGHkHCBIAAP7vwhz9F6rxDdYP9wUqLnUaAgHm8bYWqVpPaaKtoP4mWZu+6qad6mWInQ0oxMZ9tZ4QW44G5hubOnt+ucN/ADp0YMZe0kfn8cFWCY0MPxqChO4jEEYrC+yc2CbjRODvfF2Y+7vpTaxEI7qccqmtURXxyJCYGc53itVjVxdFQjyT0npTVYRbT5sHRomNZt5Wu83vArzs6fDxA+s2/XjdR29JoujBFSvBLlBUAf40MqoJQ/O7vG32fV0CAmdenKEOcOOK8ANd/uK+lDU9P5Wu1YkRvnZU11hRVGyVIaNr58UuZRw1F508d4VopPQykA1Xz6GY3hg52OkHsNp0Y4EWVFEUVaGc7yWANJZYpUI5KM0R6NIzh2F1k+YTfnwxiJkxol20izQQBBULJm6Hc+dHSSWrc00ozbceYjZNJJ8idbSfJo8CNFvj0MpbPWBW7jmmmx1eagt8+Q+5O3lvyb/nV9Hpw9msMAT/tj345SDTcp47zYcXoV0Y2dlgCuk1o9C5+au4UAic+rfZJjneLlXytyrj/2G3Dwd4W9D7veCdergWf4VTzbs00R/UfEZSE7iNxfDeGPE1BTgw9lAAiVaescVrTCNmORMh+uQOrXGp9q1bmJlasq+w86LRtj1zcwWyvG6c/1f6mrfViPjpaIo/cZHixKW/idgNei2EKvlNUDH0kfxtdbqLmVGSD2Laz6aZjnzrXQUYEV3P4jdMuKA6HSegwILkCI3H8YBA08b0Q0RZzPQlSzJMuOwIzWI4Pf5+y6pqO8ZTA7Zzuhl+ACj88VLANJhn5eDUX7XCyZC/ZhFjeiAnGmawaoEB9dgmCvlVqk3v4oQx7bUriXinrBbW53XIopEY98MRyplSMQDeMPzqX61mrcyKB1bw+4x9/Nt8jwoolXnmQRzH/b69npE6EinOmpzLhoD01n9vMvzgErEZldz+aUQ4YP3s6m/dx507tfBLYxsmPRWrc1X8wR+jcMuRTiwV11m9SLkgXxTC6Kpe+rb1efsCvrMFtrl4ouRzjFwHPb8TIGDoPGQCrCzpkIqxMKA4dJmV8RoaQ0Fv1MZ7vfKYhhsfiseEf8WgEBLHomisthOF+svp4hLYGx/M1eeAdriggANWhi7mCugLhGyAMKVhl2QR4ysf9G7FY/lDRhusXflOcgpiDd6qNnpVBKYpNLy0HPYoWYGhemRkuB3spYHZom4SJMDH5bHpKUAKXipXClkUwuzFga+zEAyccyuRe8d/JY7chwH0RV1+DSMuPp2fyZSZHYfVxCk+pYfymckoOi1PrTAyGwnGi1D91ceKblRSF9t7HOxuYvUNfGB7rlZ3D77jzoE1KbSHTXMYnhsScNyY+PyUeqIweKzTXcCJ3jzS5rQBgTJmQW3vX870nRDnzjuNMsHEYKRQ4a2lj/GQNrc7Jqa9dvGIo3mie7/eJkYb3oXfWJs9VJtC0sX5GTOQ0d/QPjEDTuTdufyMG6I22UQUmNEVSH1AMzkTRDEKthWLKIc/5Tg0Ha0cl059ZYg9EAAAAA==',
      'gpt': 'data:image/webp;base64,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',
      'grok': 'data:image/webp;base64,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',
      'ink-paper': 'data:image/webp;base64,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',
      'kimi': 'data:image/webp;base64,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',
      'llama': 'data:image/webp;base64,UklGRl4FAABXRUJQVlA4IFIFAADwHwCdASoAAZAAPtForlEoJqQnJHs4yQAaCWMfjNRxXEwnTWsanvrLn+V75nox3CXmO82HTQjGuSLBo78/AyPteUrHcBMuT76738iMi5+AguxPxtN6QATkbVKxtCcoUFIOxL+aO1zWa6crSDYJa4m9zIfDGsw6lW6hWKqxfZpIJ7TlFxJ9gHvK0OmVCdv28kBun9LI3lJxvpUvq6UNZyUDGaUvCyxZ+3OgvPMvpTdBMjygiZrh2WpbJOwsX7wqM9xqLxg/I0c2TasOiJJFfnuUWEL4SH5yCywv/zEVAIK7T4NCvaNM76L9gb2cx4tDj0CWf/5/22tmOUbApfPPZEnxuTAWXPz1ILAA/u/i9hvYUecAeS4cmZYUV3J3yv85O9mi5nFxrdGR1Hhkr+sZ8jA1MxzyxSGoEeGtqjeujTIpN5FuRI9nk/jy04A3soaUVvPo7Nn6CQblSFz04BKuBmttR64GBgd7aAsoIKzzoWfpo7DHELLVBFXaPfWJPsUNtuZYx60q++4qSbn0wyYU6q3tjQPEBWYYGVMyuDeI+KaTWAybB7h0MD6sejrvSRcF5AliVZOUOhxrRkEvs+Z/U0m1oE2Xbyroiz97b9+TYhUrjbLY6K5ivateqzT9JYFkVpCeJZE3rp595U3CgorwcGA0qIsvTRlcFF6QdK2qg+LNtNubNZlYpD1RVVhei+bJv0BL5ttPWiB1P+akqwz+36zceTzQyWCJQbvnxDCEdHCFnKT2dZwI5tohdLkTXHwnmFOVtQwhbzFLIpZ5ktQgeCry5tOaNk44zzCENs1iI4d2XRbL0bu5F4rRUXrAYjXCmn9L7wQ5rsDM50OUitPXvE6QBUmf5EnCf7nGDQFAXtWKXI36kyx92jaqdUi8EweOUp+OVn4WzUPRg4rkEipm4D2wWR2vJVfQr5em4s7o2Qcy/AW35wi1fuKVyzdlnh7M+2wlvzIrHIrsrI2hvr2Zd4VY0rHaC7Skt1Qufb/z7mdqsLavJnsdwzJPILaUvKPUWqlgw3z3uCtZrS8c7aqQSE42984fqLGURtiv2b3i3XGx6YNfkLvx80/z34MtHPb8mnZs2mrphSZjwlSh0hTYNjrxpfKkxwKMMc1xjUXBUIq8+0f6+aBsqFgWA5qM2IimgoR0anKWmiqsGktQd93ulluvghBQDG2La3qRtItB4f8uzEust4y/WEvOCTmvEbzZFYiCBeY4J1QcPJOkNlAhr8jG8MnOzCwsG6qU1Y9Jinf8QuIRJNsqM8aibP6ttkGsbg0ZsEJtQfox/B4i52irfUvxh8Vnfg4TXfJLkHYOrZG4F3MO/8E/2HsN3yHFrh40CSEYW8et95Qqfn1FUz5JxZlA7PE+uhw2dYiCFCISHiSS8vCHwJ1ARB5+td0iv1VKZRvrnz1Vkc91vMcFs88YB4YULBwioyQRFVML0S5B04CmcRHBq4EkZA7dKPfCf86sr9eu/x/hEFzH/ReA0A57wIi3WX4G6dzNsxf7eK8BgXMf/lSKoxbZp1u01z+EIFjAPsQdlmhroA/iIoUj40SLQD5fE0LLZXOyewHOhHyvtzUdoemwhrIxPHklnmf4YveV7lZtghiZu77lp4Vjis7n6tWWMphjmyPioDqLC0ruE8vo0/SfAeXfsfM7IrMes/y+VsMMoIE8naY0LA+o3NEjjmO0XS+7pMnPRFybBPA9Kj5Ux426BGGS5nc+Y8HsVrGUOgwipalYGk9mIhKkLsY2AihYySMk9UN3BZhtXXHkudewa3yfIE7dkRuBKJ7FnE/v9I+MsA03i5XKhHnE/A3DI9yAAAA=',
      'midjourney': 'data:image/webp;base64,UklGRqAFAABXRUJQVlA4IJQFAACQIQCdASoAAZAAPtFmp1CoJaQnJzMJSQAaCWcG+IncIjXQaZWY3cXKGJMfIGUxswR3bx6HTa6ulV0+tMaV+jEc2cIG3toAHK+xK+b0L0szVMOnQACevmoll3cjJAbzRbIK5EaGL6RGqxQSlxo/+mdA6gROXT+Hy+w8aktA0FJ0ocPgoMggKq7X0KTP17DfwxmPzkqVa7M9Zrm0EFyhgALTApvTxxKrv1AYIYLTvKzFfal8CxVN//aGWyANwETCJd74p6etYlK9Eud39QSbZc7t23MI9MzcnoOW+SIti9BnCGA0/ZIpGQHb7ub407h401dc2f/C+zqDuUmydbaanemyDgiquEKdt0WvmcVPrhBvvjWaX0sgAP7uSwBj6stRDyt4uGQiT6P+ez0LBN8qqc8guqksJGzFLMlH6UMtMccb6zJEVoaasJfASDmBAoV21GCWk7L5ZDWxQ/+EtCTVgBd7EbpCV3ZDZogT9n4NlSnEfvT+N/DoKLfrwsTC6fdBVkgEpxPJpfp8RzpRunjkQ005tBIlygqEBV8hvHWDgr3XKG6tHGKvUwSYO4elyYflUFQhLsLVDC9JikaPhL1dJxfd898g7Qs3QL6dNc/kXZImbYmnTf2synxfL9iaKaTLF8Yj4ZHE9yY7Jq4jl3NIICSbNPp4mCXUt8eeZ/ncegrZVextk8IeMMa8GzDCyyvI/FEPD8pR/i//i0+KUqLSWxFjhDUdVU5A2jMElYwSSSG4E3ticHKksD7AfQKa1I7lXmgdmyEcYzH7jY4H8WLj3ZX1ep49iPek3/MapnHl1MPYnrVAoBgdJTv/H0FfXI2jxg6NW0APWt8Na7k8+4gpCvZ4Nneiv51IY15Vdke3U0I8ZRTPWVjKrZGCyUjvLAScYgzJDL/m4T+gvRC8212qMEHbL1QhKnXstre3fO8GMU2cGjYpPv+QEJ262KszLCXQksaiu6QcXbXKrgxSn6S5o9S6DeNqxLyAJw2ScJKydwmk8uPJlfrRuVb51Ku6J+lyCBXiEKNZ0RTDdiG3S3+9x0lSioM+VtcORW0KsWbJnG0TLhg2IGstL98TbGwnI/mMjgE5I2zuf5Ry3tU2dZG4twXGLYJmzvuLM9fdjPDQ6u9A/teBiGcbFUwtcvoDnY4RZGUhvHZByzQhRK4XLzndh+PTtWp3f1gl1Ix+PqxICdWy/VHxKyAmID9I3syOumFJdAZvs9a7w9bymd+bz3FK6EUFShsAidJ0TuTjLtRPO3ViLWIpe81IHOt3Jdcz5d5Evpd5QXtCoaaJ/H+JsUu71EF3dcUdy6xRmVEGR1RI03rh3Hvvkw6KWON0vjFJhbzQ+jyRKphx89inSe+Kr4v22yQ7gxD3pjijJlgw7qruOTw9CGKMYaLkCTUViCBKb3WxbChLb7dg9aEYCqHzSJCWU3R0sdtYt6+sqt9GZ5prqlR9POOZ2E9iTEzrqEW/VPgiKMpGuV7l/W4sAMNsjc86nsnpDNI63G1pXO91wOvcLWp2H3e81yiLHhY0w+U00q6cyp6zS3X0BldqY4dWG7AZBEX5rz+/CSqmSXhJcaNmwJEc45cMtiO/y7cR6tc6F+zzVNyYj3mQccb7MGC34NykOacJjQUAJhAZE1jMGwSyM3pyB0PDkCQ2mjoB+00csQHWqPBskMYbrCT3Kd4YnseXKGdjNHsdL4QESKPvhRS1Q/SVZY1z1LADymRwEV1ztAXwaYMz2nijrKMaEKExdgpbNNsSPHMjMsEnCjeDpSUmVBcCVLgjL7tlwZAhXsa9+mpff5xCCV3V+PS5w6K4KNz4jIlVh2r5FQ37w6jyOWB1cXwyY0tDKO31KbE7zUg7rfPCwDPhEmy0mqd2vI8B5aTcGh/79lWpuliczRMzesMIoLqJHnwAAAA=',
      'mistral': 'data:image/webp;base64,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',
      'neon-rain': 'data:image/webp;base64,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',
      'phosphor': 'data:image/webp;base64,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',
      'qwen': 'data:image/webp;base64,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',
      'zhipu': 'data:image/webp;base64,UklGRrIFAABXRUJQVlA4IKYFAABQIgCdASoAAZAAPtFmqVEoJaQnJnEpGQAaCWVuvUV9PNljw/KzszejfCvCYS45k84o5Bn1BXlK0Pn+eh1z6uAA270a9jchzT09u0v4eddrUS2NXE/u+ibOAL2ALbgPRwrsfj6m2stht6QnntnTdIPjLgi7FrhVz7Jb1QQpGxZ1NaafoJSA9RdVVPL2PIuCrAYYSuQTSc7C/Qyqu9mgJBGatClNgqWz1kjIsuVIx7wKEyp+wPnHSxATlqFLwsMhoCRt2DJup/xzhxH1UHnPRS5XsxmjuProOrExOjz1wSU5v+eh38kFzqJSf1AF1hiS5ZtfTqaX3xZQhdhbdAlLe+cyC1vkQyOYUzP2gLGvql3EsaXeIYQT0dQppdoAAP7x5ort20EGT2HhSLiBE+k7dfzni252ngGqeH9Cs97HDY1hTst+WX1mS2xnK87NTsRZilUcZSNFkQighdmLTLCgNPPK+ohI2B+2pUgWRQLjXXHdKYuG5U8JqDKSsgHJMHdegSPt/0DZJ5CRd8UOorN20HToKlbhwWi/AvSqvI/BUr1QOCfv35jsDKDMIk3YtR9BiI6CEsoNhMeJ4NhUd4ma7Ku/14vDVh7d+x5BKg9ddhgFKLgn+jBDI3vTrvvqAGqaHegOIvZe6kE7ieWmQzvYXgZ/2B07fUEmzBVQvw4SXRhCMBI94mqydeqG1ku9v4H6lcbnLmnnTsN+Wcrrzu63uSnp5Q+6tvYjD0Ewnbzwiwi+E5KJHE0SjLKNa2yi35USfBAzl8gBGRm17tRkm4V5nfWxz+q5MfYUZbPYmt4MXKmwvWyZxF56CyAni/RVC+f2Qz/MXWEBTStXH3SLj4/+WYZkPHcj/KZMTCGcLL8lEtnDiQCIrS1349XSkOt3u2rJLxbyuK0/pYXmsy8C/ySiLOmY63QBKiJV0iCQKanw8emfjwbsiWqbYumRiocwFjRVPwf9Fws9UuIhkvzMPPFNApC19OOSfzia+/J3UIYsCuLpmw+YGjx8Vuxc9puLCM9iLdKEJ3ddLCdGBb8FLDkRASBoCzGha7l3SPhZTwJ+wpxD7mRUvB2ntoNaaJ8gMeBjjFAml2vbhJCOxkEfdosEUuK73Qx/o7XAN/BL+EVDqZQb9p+Wkdk4MHKe5w1zsB4USlD4coH1ckTsnqsWWyw3CzwCP/wNpmh6jClz8uh9RLN7UP46I2Llkxhc6H4lhj991dyesaj9xiw45xXqw161NxnK8qYynFjQ+EWIUOAXPDIltwXrC1IoQgTWuyPg+iC+vWDTWChG6v48/q1HPTDtzPl3kS+l3lBe0KFdLIb9++bPXBqm82NiLAeceCd+Zh3ZhFc7juIiSvQuz4jtKLiW8QYb2zhi6zJQW++4ScDaX8hfJc5evKTvyXrIW7yuHURn8fX165E/FVcZ+KjkLlsa4OiDWkd2SM+H9ZNfdA4hz6xnip+gXPbSXlO50bDc+xTRAi6/mBTbC7zK0xFCesrf9FkpVI8PFItVrFnbM7ltUKP7fWFoZViqF0A+j6CEAy+sQShfGPzZXFN4a6CwwPfaN6cNXgN5T+NXhn0ZuytQ6QIF+raviUjd2z2nHVqrVahmbsgFTNlFzEAw7oq42Jr/QfUpHo26vw17JgD93MDhC/TiT9zJEjezB/kpV8cijz26Lr1Z1V8VCwC4ZEcROHg+Q7wYi7hmAqju5RE4HsmzJtYGYMLoWZsegik4OfSWS4UF7Qo5HN+SkXqzUGkTFzAIZHM8s9A8RToMcr8pYl1bi1mCSx4oj8Hs4bmNeDJ8gXGNgXvQIlNYcPmV9bJpwoqWdHfT7gCwSqXX8R6ktxcajP2xAewZ8f85f6XVtxylqySz/JhOnxTOfbxETI0tkGAQzslq61OSaV2AD1Jbh1dXc3PyhlOxj+HydaWK94J5tPn9qmyP9IC48AA='
    };
    /** 某个风格的展示图地址；没有就空串（调用方回落到配色渐变/灰块）。 */
    function showcaseFor(id) {
      var v = String(id || '');
      return (SHOWCASE_IMAGES && SHOWCASE_IMAGES[v]) || '';
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
     * 工程管理行：联系表缩略图（同源 /music-mv/api/file，真实渲染产物）+ 名称 + 规格 + 产物标记；
     * 点它直接进联系表面板（统一管理界面的入口）。没有联系表就放灰块，不摆占位图。
     */
    function projectRow(t, p, onOpen) {
      var v = p.path || p.name;
      var specs = [];
      if (p.width && p.height) specs.push(p.width + '×' + p.height);
      if (p.fps) specs.push(p.fps + ' fps');
      if (p.duration) specs.push(Math.round(p.duration) + 's');
      if (p.scenes) specs.push(p.scenes + ' 场景');
      var url = contactUrl(p);
      var meta = [];
      if (p.contact) meta.push(t('popup.hasContact'));
      if (p.video) meta.push(t('popup.hasVideo'));
      return h('button', {
        key: v, type: 'button', className: 'dshMvProj',
        onClick: onOpen ? function () { onOpen(v); } : undefined,
        'data-project': v
      }, [
        url
          ? h('img', { key: 'thumb', className: 'dshMvThumb', src: url, alt: '', 'aria-hidden': 'true' })
          : h('span', { key: 'thumb', className: 'dshMvThumb dshMvThumbOff', 'aria-hidden': 'true' }),
        h('span', { key: 'info', className: 'dshMvProjInfo' }, [
          h('span', { key: 'name', className: 'dshMvProjName' }, p.name || v),
          h('span', { key: 'spec', className: 'dshMvProjSpec' }, specs.join(' · ') || '—')
        ]),
        h('span', { key: 'meta', className: 'dshMvProjMeta' }, meta.join(' · '))
      ]);
    }

    /**
     * 状态区三种形态（纯函数，测试各写一套断言）：
     * 读取中 → 一句话 + 不确定态进度条；离线 → 错误文案 + 还能用什么 + 重试按钮；
     * 就绪 → 「总览」与「渲染状态」两节，渲染节里才是分条与原生进度条。
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
      // 工程管理：每个工程一行（缩略图 + 规格 + 产物标记），点一行进联系表面板
      var listKids = projects.length
        ? projects.map(function (p) { return projectRow(t, p, onOpenProject); })
        : [h('div', { key: 'empty', className: 'dshMvDim', 'data-empty': 'projects' }, t('popup.renderNone'))];
      var job = data && data.job ? data.job : null;
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
        sectionNode(t, 'projects', 'popup.section.projects', listKids),
        sectionNode(t, 'render', 'popup.section.render', renderKids)
      ];
    }

    /**
     * 弹层锚点（纯函数，测试直接算）：fixed 定位 + 实测按钮矩形 ——
     * 顶边贴入口按钮下沿、右缘对齐按钮右缘；越界就往屏幕里收，绝不跑到屏外。
     * Fixed-position anchor measured from the entry button; clamped to the viewport.
     */
    function popupAnchor(rect, vw, vh, popupWidth) {
      var width = Math.min(popupWidth || 300, Math.max(160, vw - 16));
      var top = rect.bottom + 5;
      if (top > vh - 140) top = vh - 140;
      if (top < 8) top = 8;
      var right = vw - rect.right;
      if (right < 8) right = 8;
      if (vw - right - width < 8) right = vw - width - 8;
      if (right < 8) right = 8;
      return { top: Math.round(top) + 'px', right: Math.round(right) + 'px' };
    }

    /** 全屏样式（纯函数，测试直接看字段）：占满视口，与对话/轨迹平级的整屏观感。 */
    function fullscreenStyle() {
      return {
        position: 'fixed', top: '0', right: '0', left: '0', bottom: '0',
        width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: '0'
      };
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
            h('span', { key: 'name', className: 'dshMvCardName' }, c.title || c.id),
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
      var onClose = props.onClose;
      // 重开弹层时用上一次广播的实测状态即时回填（真实数据、随后照常轮询刷新；没有就从「读取中」开始）
      var st = React.useState(function () { return lastState || { phase: 'probing', data: null }; });
      var phase = st[0].phase;
      var data = st[0].data;
      var retryState = React.useState(0);   // 「重试」重挂轮询 effect / retry restarts the poll
      var rootRef = React.useRef(null);
      var panelState = React.useState('main');  // 分级 UI：main | render | styles
      var panel = panelState[0];
      var projectState = React.useState('');    // 联系表面板选中的工程（'' = 自动挑最近）
      // 专属全屏界面：记住上次的全屏选择；Esc 先退全屏、再关弹层
      var fsState = React.useState(lsGet(LS_FS, '0') === '1');
      var fs = fsState[0];
      var fsRef = React.useRef(false);
      fsRef.current = fs;
      var noticeState = React.useState('');
      var busyState = React.useState(false);
      var notice = noticeState[0];
      var busy = busyState[0];
      // 开工预设：默认取上次的选择 / kickoff presets, defaulting to the last choice
      var tierState = React.useState(lsGet(LS_TIER, 'standard'));
      var styleState = React.useState(lsGet(LS_STYLE, 'deepseek'));
      var fpsState = React.useState(lsGet(LS_FPS, ''));   // '' = 跟随工程，不写进提示词 / follow the project
      var tier = tierState[0];
      var style = styleState[0];
      var fps = fpsState[0];
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

      /** 档位与风格清单：取宿主的；取不到就用内置清单并如实标注离线。 */
      React.useEffect(function () {
        if (typeof fetch !== 'function') { optState[1]({ offline: true }); return undefined; }
        var alive = true;
        fetch(API_BASE + '/presets', { headers: API_HEADERS })
          .then(function (r) { if (!r.ok) throw new Error('presets ' + r.status); return r.json(); })
          .then(function (d) {
            if (!alive) return;
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
          .catch(function () { if (alive) optState[1]({ offline: true }); });
        return function () { alive = false; };
      }, []);

      React.useEffect(function () {
        function onKey(e) {
          if (!e || e.key !== 'Escape') return;
          if (fsRef.current) { fsState[1](false); lsSet(LS_FS, '0'); return; }
          if (onClose) onClose();
        }
        try { document.addEventListener('keydown', onKey); } catch (err) { /* no DOM */ }
        return function () {
          try { document.removeEventListener('keydown', onKey); } catch (err) { /* no DOM */ }
        };
      }, []);

      // 打开即聚焦弹层本体：键盘用户直接落在对话框里，Tab 与 Esc 从这里开始
      React.useEffect(function () {
        try {
          if (rootRef.current && typeof rootRef.current.focus === 'function') rootRef.current.focus();
        } catch (err) { /* no DOM */ }
      }, []);

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
      function onTier(e) { var v = e && e.target ? e.target.value : ''; tierState[1](v); lsSet(LS_TIER, v); }
      function onStyle(e) { var v = e && e.target ? e.target.value : ''; styleState[1](v); lsSet(LS_STYLE, v); }
      function onFps(e) { var v = e && e.target ? e.target.value : ''; fpsState[1](v); lsSet(LS_FPS, v); }

      /** 以队友/子代理开工：四级降级，每一级都回报真实模式；预设随提示词一起带过去。 */
      function onTeammate() {
        if (busy) return;
        busyState[1](true);
        var extra = kickoffExtra(tierTitle(tier), style, fps);
        Promise.resolve()
          .then(function () { return startTeammate(ctx, extra); })
          .then(function (res) {
            busyState[1](false);
            say(res && KICKOFF_NOTICE[res.mode] ? KICKOFF_NOTICE[res.mode] : 'popup.teammateNone');
          }, function () { busyState[1](false); say('popup.teammateNone'); });
      }

      /** 分级 UI 导航：主面板 → 联系表渲染 / 风格画廊（返回键在面板头部）。 */
      function onOpenRender() { panelState[1]('render'); }
      function onOpenStyles() { panelState[1]('styles'); }
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
        h('label', { key: 'tl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.tier')),
          h('select', {
            key: 's', className: 'dshMvSel', value: tier, onChange: onTier, 'data-select': 'tier'
          }, tierList().map(function (x) {
            return h('option', { key: x.id, value: x.id }, x.title || x.id);
          }))
        ]),
        h('label', { key: 'sl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.style')),
          h('select', {
            key: 's', className: 'dshMvSel', value: style, onChange: onStyle, 'data-select': 'style'
          }, styleList().map(function (id) {
            return h('option', { key: id, value: id }, id);
          }))
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
            return h('option', { key: v || 'follow', value: v }, v ? v + ' fps' : t('popup.fpsFollow'));
          }))
        ]),
        opts && opts.offline ? h('div', { key: 'off', className: 'dshMvNotice' }, t('popup.offlinePresets')) : null
      ]);

      // 主体按分级切换：状态+预设 / 联系表二级面板 / 风格画廊二级面板
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
        bodyContent = popupBody(t, phase, data, onRetry, onOpenProject).concat([presetBlock]);
      }

      var connKey = phase === 'ready' ? 'popup.connOk' : (phase === 'absent' ? 'popup.connOff' : 'popup.connProbe');
      var noticeNode = notice
        ? h('div', { key: 'notice', className: 'dshMvNotice', 'data-notice': '1', 'aria-live': 'polite' }, notice)
        : null;

      // 头部：二级面板多一个返回键，标题跟着面板走
      var headKids = [];
      if (isRender || isStyles) {
        headKids.push(h('button', {
          key: 'back', type: 'button', className: 'dshMvBack',
          onClick: onBack, 'aria-label': t('popup.back'), 'data-act': 'back'
        }, '←'));
      }
      headKids.push(h('span', { key: 'title', className: 'dshMvTitle' },
        t(isRender ? 'popup.renderPanel' : (isStyles ? 'popup.stylesPanel' : 'entry.label'))));
      headKids.push(h('span', { key: 'conn', className: 'dshMvPill', 'data-conn': phase, 'data-state': phase }, t(connKey)));
      headKids.push(h('span', { key: 'spacer', className: 'dshMvSpacer' }));
      // 全屏开关：aria-pressed 可读状态，文案随状态切换（全屏 / 退出全屏）
      headKids.push(h('button', {
        key: 'fs', type: 'button', className: 'dshMvFsBtn',
        onClick: function () {
          var next = !fs;
          fsState[1](next);
          lsSet(LS_FS, next ? '1' : '0');
        },
        'data-fs': '1', 'aria-pressed': !!fs,
        'aria-label': String(t(fs ? 'popup.exitFullscreen' : 'popup.fullscreen')),
        title: String(t(fs ? 'popup.exitFullscreen' : 'popup.fullscreen'))
      }, String(t(fs ? 'popup.exitFullscreen' : 'popup.fullscreen'))));
      headKids.push(h('button', {
        key: 'close', type: 'button', className: 'dshMvClose',
        onClick: onClose, 'aria-label': t('popup.close')
      }, '✕'));

      // 动作区按分级切换（钉底；主动作实底在最上，次动作描边）
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
          h('li', { key: 'tm' },
            h('button', {
              type: 'button', className: 'dshMvAct dshMvActPrimary',
              onClick: onTeammate, disabled: !!busy, 'data-act': 'teammate'
            }, t('popup.teammate'))),
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

      // 定位：全屏优先（占满视口）；否则用实测锚点 fixed 对齐，量不到退回 CSS absolute
      var popupStyle = fs
        ? fullscreenStyle()
        : (props.anchor && props.anchor.top
          ? { position: 'fixed', top: props.anchor.top, right: props.anchor.right }
          : null);

      return h('div', {
        className: 'dshMvPopup' + (fs ? ' dshMvPopupFs' : ''),
        role: 'dialog',
        tabIndex: -1,
        ref: rootRef,
        style: popupStyle,
        'aria-label': String(t('entry.label') || 'codeMV'),
        'data-music-mv-popup': '1'
      }, [
        // 头部（固定）：返回键（二级面板）+ 标题 + 连接状态药丸 + 全屏开关 + 关闭
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
     * 标题栏右上角入口：图标 + codeMV 文案，窄宽度折叠成纯图标（纯 CSS，容器查询优先）。
     * 点开是上面那个原生弹层 —— 入口本身不内嵌网页、不创建自定义元素。
     * The title-bar entry: icon + codeMV label, collapsing to icon-only in narrow containers.
     */
    function TitlebarEntry(props) {
      var t = props.t;
      var openState = React.useState(false);
      var open = openState[0];
      var probeState = React.useState('unknown'); // unknown | ready | absent
      React.useEffect(function () {
        if (typeof fetch !== 'function') return undefined;
        var alive = true;
        fetch('/music-mv/api/state', { headers: { 'x-music-mv': 'studio' } })
          .then(function (r) { if (alive) probeState[1](r && r.ok ? 'ready' : 'absent'); })
          .catch(function () { if (alive) probeState[1]('absent'); });
        return function () { alive = false; };
      }, []);
      var title = probeState[0] === 'absent' ? t('entry.offline') : t('entry.tooltip');
      var btnRef = React.useRef(null);
      var anchorState = React.useState(null);   // 实测锚点：量不到就退回 CSS absolute 定位

      /** 打开前量一次入口按钮的矩形，弹层按它做 fixed 定位（默认对话框不再错位）。 */
      function measure() {
        try {
          var el = btnRef.current;
          var vw = (typeof window !== 'undefined' && window.innerWidth) || 0;
          var vh = (typeof window !== 'undefined' && window.innerHeight) || 0;
          if (!el || typeof el.getBoundingClientRect !== 'function' || !vw || !vh) return null;
          var r = el.getBoundingClientRect();
          if (!r || typeof r.bottom !== 'number' || typeof r.right !== 'number') return null;
          return popupAnchor(r, vw, vh, 340);
        } catch (e) { return null; }
      }

      function click() {
        if (!open) anchorState[1](measure());
        openState[1](!open);
      }
      function close() { openState[1](false); }

      var kids = [
        h('button', {
          key: 'btn',
          type: 'button',
          ref: btnRef,
          className: 'dshMvEntry',
          title: title,
          'aria-label': title,
          'aria-expanded': !!open,
          onClick: click,
          'data-music-mv-entry': '1'
        }, [
          h('span', { key: 'icon', className: 'dshMvEntryIcon', 'aria-hidden': 'true' },
            h('svg', { width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', focusable: 'false' }, [
              h('rect', { key: 'frame', x: '1.5', y: '3.5', width: '13', height: '9', rx: '1.5', stroke: 'currentColor', strokeWidth: '1.3' }),
              h('path', { key: 'slats', d: 'M6.2 3.5 4.6 6.5M9.6 3.5 8 6.5M13 3.5 11.4 6.5', stroke: 'currentColor', strokeWidth: '1.3', strokeLinecap: 'round' }),
              h('path', { key: 'play', d: 'M6.6 8.7 9.4 10.25 6.6 11.8Z', fill: 'currentColor' })
            ])),
          h('span', { key: 'label', className: 'dshMvEntryLabel' }, t('entry.label'))
        ])
      ];
      if (open) {
        kids.push(h('div', {
          key: 'backdrop', className: 'dshMvBackdrop', 'aria-hidden': 'true', onClick: close
        }));
        kids.push(h(EntryPopup, {
          key: 'popup', t: props.t, ctx: props.ctx, anchor: anchorState[0], onClose: close
        }));
      }
      return h('div', { className: 'dshMvRoot' }, kids);
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
      // 标题栏右上角入口：conversation.session.header.utilities（replaceRisk: none，不占 .corner）
      ctx.effect(function () {
        return ctx.slots.inject('conversation.session.header.utilities', function () {
          return ctx.slots.register({
            name: 'conversation.session.header.utilities',
            id: 'music-mv-studio-entry',
            order: 900,
            locale: NS,
            inject: function () {
              return {
                ctx: ctx,
                // 入口级回退句柄（不在弹层 UI 暴露）：页面类型在就开页，否则退回宿主工作室地址
                openStudio: function () { return openStudioPage(ctx); }
              };
            }
          }, TitlebarEntry);
        });
      }, 'music-code-mv: 标题栏入口 / titlebar entry');
      // 同源状态通道：弹层广播的实测状态在这里回填，重开弹层即时显示 / same-origin state channel
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
    // 测试钩子：直接渲染弹层与入口，省掉一整套状态桩 / test-only handles
    exports.__internals = {
      EntryPopup: EntryPopup,
      TitlebarEntry: TitlebarEntry,
      popupBody: popupBody,
      progressNode: progressNode,
      popupAnchor: popupAnchor,
      fullscreenStyle: fullscreenStyle,
      contactUrl: contactUrl,
      renderPanelBody: renderPanelBody,
      styleCards: styleCards,
      styleGallery: styleGallery,
      projectRow: projectRow,
      showcase: SHOWCASE_IMAGES,
      startTeammate: startTeammate,
      KICKOFF_NOTICE: KICKOFF_NOTICE,
      jobLine: jobLine,
      jobRows: jobRows,
      kickoffExtra: kickoffExtra,
      composePrompt: composePrompt,
      handoffPrompt: HANDOFF_PROMPT,
      FALLBACK_TIERS: FALLBACK_TIERS,
      FALLBACK_STYLES: FALLBACK_STYLES,
      FALLBACK_FPS: FALLBACK_FPS
    };
    return module.exports;
  }
});
