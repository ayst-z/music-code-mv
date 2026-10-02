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
      '.dshMvBig .dshMvHead{padding:14px 18px 10px;}' +
      '.dshMvBig .dshMvBody{padding:0 18px 18px;gap:12px;font-size:13px;}' +
      '.dshMvBig .dshMvFoot{padding:10px 18px 14px;}' +
      '@container (min-width: 560px){' +
      '.dshMvBig .dshMvBody{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;}' +
      '.dshMvBig .dshMvBody>[data-section="projects"]{grid-column:1 / -1;}' +
      '.dshMvBig .dshMvBody>*+*{border-top:0;padding-top:0;}' +
      '.dshMvGallery{grid-template-columns:repeat(3, minmax(0, 1fr));}}' +
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
      '.dshMvBig .dshMvCardId,.dshMvBig .dshMvProjSpec,.dshMvBig .dshMvProjMeta{font-size:11px;}' +
      /* 一键进入子代理：hero 主舞台（大按钮 + 说明 + 当前预设一行） */
      '.dshMvHero{display:flex;flex-direction:column;gap:6px;padding:12px;' +
      'border:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));' +
      'border-radius:var(--dsw-radius-md, 6px);background:var(--dsw-alias-bg-layer-1, rgba(148,163,184,.08));}' +
      '.dshMvHeroBtn{font-size:14px;font-weight:600;padding:10px 14px;text-align:center;}' +
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
      'dusk-lofi': 'data:image/webp;base64,UklGRlwDAABXRUJQVlA4IFADAAAwJACdASqAAdgAPt1utFQopqUkITVYERAbiWlu+F6WH88ne7dmlbPwk6Apvta+idzoXkyZMmTOO1TU35f1M/A5B0JzmkKQoZZce72/xemnb6YyADBoAksJ/UwIM8eFawJ1noYgDOfr1eC7hg8/axd2yBnTkDrBVhiDXd7MB27CXI6nKyFXgx25KcfS6Kjo8bmgMyKurEKcGSBCCzZx8+pXOBfVuBw3q3AtOp2wxslefyG1HdfWVJyQuAtVIT8QURAG0edH6AUr/A6eLyGELv43ccAeV9tIjWThOXqUe4jXsuwXJoioNMmQ6QPxE27BY4PCg8b7dzM8j2lYtPTjxImwoXueoeRpFB8gU8tqPN+rVsinUiXnglkHQhJXtOPJdx4B+Ub56Pswr/AAAP7v40qdrjkQe+8NcEDvFmOfk4lkBjSXLwq3gJT+VS6+bM5WDcN84qpW4KPihAEtHebtbzQt7VsaJ4cOE3R+VL1wIpugz+9XPZBY8qgjyfm+Zx3MZVT4tMVdncFtnkmv3Fj5aFfdVMufSzS0rVvYNNr+1u+060iGrmp7ByMR9gLTDYMwugtVCkCztKl+jaxnjQEWf9t6aNIPo+wgzYhCU9u8aEUPb4+76Kt0cOEMgIvngKdvQQDBxVKqiI5ONQZzvFQcr6MDLNz9man+wmzrcFsCLN37uZu2uECrISAtYFutFqr+3EFZZ6KAeeQy7bRIrqu7pvOAn0NNzzCxCF6yagx+pxGHKFiUaXuWylTd1C80D+6tNjFJ7YktNUXHUYGAb162faWX5t4N/wTqN/K3AIaOq0uTCEvSssVZ/9wX/+9M6zzZUmQQFkBG84Oj23afZUMmZH9wh+KY4c1V92Yjaeydmk2rR7MbNfwke13KjbMLLbIgfVvrlC6XCGeK+OGy6wyr58p9D1ttvLegIVZJXK1FC5zaS2Ex95QwH+idBjWlnIxf2Je7k29FDPpdRRLOrtJsHVhK7W+x1QMX/Mp+xYmVb6wB/FmHKkbalmF1TPhYHHv1hTwVP2e+9uCy0tK3lK8IvQphEiSP03O/vrHO4P//Z4oF6SoloKEhTplxT62hFqMGnMPbvJQPRlRCHKC8neQ6EvQEGyhFCvz/bGMu/mo9OHhAAA==',
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
      'phosphor': 'data:image/webp;base64,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',
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
        h('label', { key: 'sl', className: 'dshMvField' }, [
          h('span', { key: 'l', className: 'dshMvKey' }, t('popup.style')),
          h('select', {
            key: 's', className: 'dshMvSel', value: style, onChange: onStyle, 'data-select': 'style'
          }, styleList().map(function (id) {
            // 中文选项：显示风格中文名（宿主 title 中文段 / 内置中文名），value 仍是英文 id
            return h('option', { key: id, value: id }, styleLabel(id, styleTitle(id)));
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
