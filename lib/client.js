/**
 * dsh-music-code-mv — 浏览器半边 / client half.
 *
 * 在 DSH 图形界面右侧边栏注册一个「MV 工坊」页面：内嵌 /music-mv/studio（宿主半边提供），
 * 中文界面，可看工程、看联系表与成片、直接触发渲染。
 *
 * 手写 ModuleLoader 包（见 dsh-client-modules 的 __ModuleLoader__.load 约定），
 * 因此本包不需要任何构建步骤：dsh plugin add 之后即可用。
 *
 * Registers one right-sidebar page type: 'MV Studio' (Chinese), an iframe over the
 * host-served /music-mv/studio surface. No bundler, no build step.
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
    /** 页面类型 id 与 kind / page type identity. */
    var STUDIO_ID = 'dsh-music-code-mv';
    var STUDIO_KIND = 'music-mv-studio';
    /** 打开记忆键：自动打开只发生一次 / auto-open happens once per browser. */
    var OPENED_KEY = 'dsh-music-code-mv.studio.opened';

    var zh = {
      'type.label': 'MV 工坊',
      'guide.title': 'MV 工坊',
      'guide.description': '看工程、看联系表与成片、直接开始渲染',
      'tab.title': 'MV 工坊',
      'action.reload': '重新载入',
      'action.open': '在浏览器打开',
      'action.copy': '复制地址',
      'state.loading': '正在载入界面…',
      'state.noOrigin': '当前页面不是从宿主 HTTP 地址加载的，无法内嵌工作室；请用下面的地址在浏览器打开。',
      'state.failed': '工作室界面没能载入。确认插件已加载，然后点「重新载入」。',
      'hint.title': 'MV 工坊',
      'fallback.title': 'MV 工坊（离线模式）',
      'fallback.noService': '这个 profile 里没有 webServer，工作室页面不可用；面板按钮会把要求直接交给模型，功能不受影响。',
      'entry.label': 'codeMV',
      'entry.tooltip': 'codeMV · MV 工坊 / MV Studio',
      'entry.offline': 'MV 工坊（离线：宿主接口不可达，弹层里会如实显示离线）',
      'entry.unavailable': '打不开工作室页面：插件页面类型没有注册成功。',
      'popup.probing': '正在读取宿主状态…',
      'popup.offline': '离线：宿主接口不可达，工作区与渲染状态读取失败（不显示占位数据）。',
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
      'popup.offlinePresets': '离线：用内置预设清单',
      'popup.actions': '操作',
      'popup.close': '关闭',
      'popup.openStudio': '打开工作室页面',
      'fallback.askSheet': '让模型渲一张联系表',
      'popup.teammate': '以队友/子代理开工',
      'popup.teammateNative': '已通过宿主原生服务开工（teammate/subagent）',
      'popup.teammateHost': '已交给宿主接口开工（teammate/subagent）',
      'popup.teammateCurrent': '已在当前会话发出开工指令：以子代理/队友形式执行',
      'popup.teammateClipboard': '开工指令已复制到剪贴板',
      'popup.teammateNone': '开不了工：宿主没有可用接口，剪贴板也不可用。',
      'popup.render': '渲染联系表',
      'popup.renderSent': '渲染请求已提交',
      'popup.renderFailed': '渲染请求失败（宿主接口不可用）',
      'popup.renderNone': '没有可渲染的工程',
      'popup.copyPath': '复制工作区路径',
      'popup.copied': '已复制工作区路径',
      'popup.copyFailed': '复制失败：当前拿不到工作区路径'
    };
    var en = {
      'type.label': 'MV Studio',
      'guide.title': 'MV Studio',
      'guide.description': 'Browse projects, review contact sheets and films, render right here',
      'tab.title': 'MV Studio',
      'action.reload': 'Reload',
      'action.open': 'Open in browser',
      'action.copy': 'Copy URL',
      'state.loading': 'Loading the studio surface…',
      'state.noOrigin': 'This page is not served over the host HTTP origin, so the studio cannot be embedded. Open the URL below in a browser.',
      'state.failed': 'The studio surface failed to load. Check the plugin is active, then press Reload.',
      'hint.title': 'MV Studio',
      'fallback.title': 'MV Studio (offline mode)',
      'fallback.noService': 'This profile has no webServer, so the studio page is unavailable; the panel hands requests straight to the model.',
      'entry.label': 'codeMV',
      'entry.tooltip': 'codeMV · MV Studio / MV 工坊',
      'entry.offline': 'MV Studio (offline: host API unreachable — the popup says so honestly)',
      'entry.unavailable': 'The studio page cannot be opened: the plugin page type failed to register.',
      'popup.probing': 'Reading host state…',
      'popup.offline': 'Offline: host API unreachable — workspace and render state cannot be read (no placeholder data shown).',
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
      'popup.offlinePresets': 'Offline: using the built-in preset list',
      'popup.actions': 'Actions',
      'popup.close': 'Close',
      'popup.openStudio': 'Open the studio page',
      'fallback.askSheet': 'Have the model render a contact sheet',
      'popup.teammate': 'Start as teammate / subagent',
      'popup.teammateNative': 'Started through the host native service (teammate/subagent)',
      'popup.teammateHost': 'Handed to the host interface (teammate/subagent)',
      'popup.teammateCurrent': 'Kickoff instruction sent to the current session: run as subagent/teammate',
      'popup.teammateClipboard': 'Kickoff instruction copied to the clipboard',
      'popup.teammateNone': 'Cannot start: no host interface available and the clipboard is unavailable.',
      'popup.render': 'Render contact sheet',
      'popup.renderSent': 'Render request submitted',
      'popup.renderFailed': 'Render request failed (host API unavailable)',
      'popup.renderNone': 'No project to render',
      'popup.copyPath': 'Copy workspace path',
      'popup.copied': 'Workspace path copied',
      'popup.copyFailed': 'Copy failed: no workspace path available'
    };

    function studioUrl() {
      try {
        if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
          return location.origin + '/music-mv/studio';
        }
      } catch (e) { /* 无 location：退化为不可内嵌 / no location */ }
      return '';
    }

    function Toolbar(props) {
      var t = props.t;
      var url = props.url;
      var button = function (label, onClick) {
        return h('button', {
          type: 'button',
          onClick: onClick,
          style: {
            font: 'inherit', fontSize: '12px', color: 'inherit', background: 'transparent',
            border: '1px solid currentColor', borderRadius: '7px', padding: '3px 9px',
            cursor: 'pointer', opacity: 0.85
          }
        }, label);
      };
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
          borderBottom: '1px solid rgba(127,127,127,.28)', fontSize: '12px', flex: '0 0 auto'
        }
      }, [
        h('strong', { key: 'title', style: { fontWeight: 600, letterSpacing: '.04em' } }, t('tab.title')),
        h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
        button(t('action.reload'), function () { props.onReload(); }),
        url ? button(t('action.open'), function () { window.open(url, '_blank', 'noopener'); }) : null,
        url ? button(t('action.copy'), function () {
          try { navigator.clipboard.writeText(url); } catch (e) { /* clipboard unavailable */ }
        }) : null
      ]);
    }

    /** 转发给 iframe 的 DSH 设计令牌（够用即可，不搬整张表）。 */
    var TOKEN_NAMES = [
      '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3',
      '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-label-caption',
      '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3',
      '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-hover-solid',
      '--dsw-alias-state-business-primary', '--dsw-alias-state-error-primary', '--dsw-alias-state-success-primary',
      '--dsw-alias-state-warn-primary', '--dsw-alias-brand-primary',
      '--dsw-static-deepseek-400', '--dsw-static-deepseek-450', '--dsw-static-deepseek-500',
      '--dsw-static-deepseek-600', '--dsw-static-blue-500',
      '--dsw-static-neutral-bluish-50', '--dsw-static-neutral-bluish-950',
      '--dsw-radius-sm', '--dsw-radius-md', '--dsw-radius-lg', '--dsw-radius-xl',
      '--dsw-font-family'
    ];

    /** 读 DSH 当前主题：深浅标记 + 令牌值。 / read the host theme. */
    function readTheme() {
      var snap = { dark: false, tokens: {} };
      try {
        var body = document.body;
        if (body && body.hasAttribute('data-ds-dark-theme')) snap.dark = true;
        var cs = window.getComputedStyle(body || document.documentElement);
        for (var i = 0; i < TOKEN_NAMES.length; i++) {
          var v = cs.getPropertyValue(TOKEN_NAMES[i]);
          if (v && v.trim()) snap.tokens[TOKEN_NAMES[i]] = v.trim();
        }
      } catch (e) { /* 没有 DOM 时退化为浅色 / no DOM: light */ }
      return snap;
    }

    function StudioBody(props) {
      var t = props.t;
      var nonceState = React.useState(0);
      var nonce = nonceState[0];
      var bump = nonceState[1];
      var urlState = React.useState(studioUrl());
      var url = urlState[0];
      var svcState = React.useState('probing'); // probing | ready | absent
      var svc = svcState[0];
      var setSvc = svcState[1];
      React.useEffect(function () {
        var alive = true;
        try {
          fetch('/music-mv/api/state', { headers: { 'x-music-mv': 'studio' } })
            .then(function (r) { if (alive) setSvc(r.ok ? 'ready' : 'absent'); })
            .catch(function () { if (alive) setSvc('absent'); });
        } catch (e) { setSvc('absent'); }
        return function () { alive = false; };
      }, [nonce]);
      var frameRef = React.useRef(null);
      var themeState = React.useState(readTheme());
      var theme = themeState[0];

      function pushTheme() {
        var win = frameRef.current && frameRef.current.contentWindow;
        if (!win) return;
        var snap = readTheme();
        try {
          // 只发给自己的同源 iframe，不用通配目标 / never post to '*'
          var origin = (typeof location !== 'undefined' && location.origin) || '';
          win.postMessage({ source: 'dsh-music-code-mv', type: 'theme', dark: snap.dark, tokens: snap.tokens }, origin);
        } catch (e) { /* iframe 还没准备好 / not ready */ }
      }

      React.useEffect(function () {
        pushTheme();
        var observer = null;
        try {
          if (typeof MutationObserver === 'function' && document.body) {
            observer = new MutationObserver(pushTheme);
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style', 'class'] });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
          }
        } catch (e) { /* 观察不到就只在载入时同步一次 / sync on load only */ }
        return function () { if (observer) observer.disconnect(); };
      }, [nonce]);

      var src = url + '?' + (nonce ? 'r=' + nonce + '&' : '') + 'theme=' + (theme && theme.dark ? 'dark' : 'light');
      var children = [];
      children.push(h(Toolbar, { key: 'bar', t: t, url: url, onReload: function () { bump(nonce + 1); } }));
      if (!url || svc === 'absent') {
        children.push(h('div', {
          key: 'msg',
          style: { padding: '14px', fontSize: '12px', lineHeight: 1.8, opacity: 0.85 }
        }, [
          h('div', { key: 'title', style: { fontWeight: 600, marginBottom: '6px' } }, t('fallback.title')),
          h('div', { key: 'hint' }, svc === 'absent' ? t('fallback.noService') : t('state.noOrigin')),
          h('div', { key: 'actions', style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
            h('button', { key: 'start', type: 'button', onClick: function () { if (props.onKickoff) props.onKickoff(''); } }, t('popup.teammate')),
            h('button', { key: 'ask', type: 'button', onClick: function () { if (props.onAsk) props.onAsk('用 music_mv_render 渲一张联系表（480×270 草稿），然后用读图工具看它。'); } }, t('fallback.askSheet'))
          ])
        ]));
      } else {
        children.push(h('iframe', {
          key: 'frame',
          ref: frameRef,
          title: t('tab.title'),
          src: src,
          onLoad: pushTheme,
          style: { flex: '1 1 auto', width: '100%', minHeight: '320px', border: '0', background: 'transparent' }
        }));
      }
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }
      }, children);
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
      try { await navigator.clipboard.writeText(SKILL_COMMAND + ' '); } catch (e) { /* clipboard may be blocked */ }
      return { ok: false, mode: 'clipboard' };
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
      '.dshMvPopup{z-index:100;box-sizing:border-box;position:absolute;top:calc(100% + 5px);right:0;' +
      'width:300px;max-width:min(320px, calc(100vw - 32px));max-height:min(70vh, calc(100vh - 140px));' +
      'overflow:auto;display:flex;flex-direction:column;gap:8px;padding:10px;border:0;' +
      'border-radius:var(--dsw-radius-lg, 12px);background:var(--dsw-specific-menu, #232324);' +
      'color:var(--dsw-alias-label-primary, #f9fafb);box-shadow:var(--dsw-elevation-prominent, 0 6px 24px rgba(0,0,0,.28));' +
      'backdrop-filter:var(--dsw-menu-backdrop-filter);font:12px/1.5 var(--dsw-font-family, system-ui, sans-serif);}' +
      '.dshMvHead{display:flex;align-items:center;gap:6px;}' +
      '.dshMvTitle{font-weight:600;letter-spacing:.02em;}' +
      '.dshMvClose{font:inherit;line-height:1;cursor:pointer;padding:2px 6px;border-radius:var(--dsw-radius-sm, 6px);' +
      'color:var(--dsw-alias-label-tertiary, #adb2b8);background:transparent;border:0;}' +
      '.dshMvClose:hover{background:var(--dsw-alias-fill-l1, rgba(148,163,184,.14));color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvRow{display:flex;gap:8px;align-items:baseline;justify-content:space-between;}' +
      '.dshMvKey{color:var(--dsw-alias-label-tertiary, #adb2b8);flex:none;}' +
      '.dshMvVal{color:var(--dsw-alias-label-secondary, #9aa3ad);max-width:190px;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap;text-align:right;}' +
      '.dshMvDim,.dshMvNotice{color:var(--dsw-alias-label-tertiary, #adb2b8);font-size:11px;}' +
      '.dshMvActions{list-style:none;margin:0;padding:8px 0 0;border-top:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));' +
      'display:flex;flex-direction:column;gap:4px;}' +
      '.dshMvAct{box-sizing:border-box;width:100%;text-align:left;font:inherit;cursor:pointer;padding:6px 8px;' +
      'border-radius:var(--dsw-radius-sm, 6px);color:var(--dsw-alias-label-secondary, #9aa3ad);background:transparent;' +
      'border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));}' +
      '.dshMvAct:hover,.dshMvAct:focus-visible{background:var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14));' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvAct:disabled{opacity:.5;cursor:default;}' +
      '.dshMvActPrimary{color:var(--dsw-alias-state-business-primary, #4176e6);' +
      'border-color:var(--dsw-alias-state-business-primary, #4176e6);}' +
      '.dshMvOpts{display:flex;flex-direction:column;gap:6px;padding-top:8px;' +
      'border-top:1px solid var(--dsw-alias-border-l1, rgba(148,163,184,.2));}' +
      '.dshMvField{display:flex;gap:8px;align-items:center;justify-content:space-between;}' +
      '.dshMvSel{flex:1;min-width:0;box-sizing:border-box;font:inherit;padding:4px 6px;' +
      'border:1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.35));' +
      'border-radius:var(--dsw-radius-sm, 6px);background:transparent;' +
      'color:var(--dsw-alias-label-primary, #f9fafb);}' +
      '.dshMvSel:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, #4176e6);outline-offset:1px;}';

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

    /** 开工前选好的预设写进提示词；没选就不加，绝不编造。 */
    function kickoffExtra(tierTitle, styleId) {
      var bits = [];
      if (tierTitle) bits.push('交付分辨率：' + tierTitle);
      if (styleId) bits.push('风格预设：' + styleId);
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
    var LS_TIER = 'dsh-music-code-mv.kickoff.tier';
    var LS_STYLE = 'dsh-music-code-mv.kickoff.style';

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

    /**
     * codeMV 弹层：宿主原生 DOM —— 标准标签 + 设计令牌，不创建自定义元素、不内嵌网页。
     * 每一行都读 /music-mv/api/state 的实测值；接口不可达就如实写离线，不摆占位数据。
     * Native-DOM popup for the codeMV entry: standard tags and host design tokens only.
     */
    function EntryPopup(props) {
      var t = props.t;
      var ctx = props.ctx;
      var onClose = props.onClose;
      var st = React.useState({ phase: 'probing', data: null });
      var phase = st[0].phase;
      var data = st[0].data;
      var noticeState = React.useState('');
      var busyState = React.useState(false);
      var notice = noticeState[0];
      var busy = busyState[0];
      // 开工预设：默认取上次的选择 / kickoff presets, defaulting to the last choice
      var tierState = React.useState(lsGet(LS_TIER, 'standard'));
      var styleState = React.useState(lsGet(LS_STYLE, 'deepseek'));
      var tier = tierState[0];
      var style = styleState[0];
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
              st[1]({ phase: 'ready', data: d || null });
              var running = !!(d && d.job && d.job.status === 'running');
              schedule(running ? 700 : 2500);
            })
            .catch(function () { if (alive) { st[1]({ phase: 'absent', data: null }); schedule(2500); } });
        }
        schedule(300);
        return function () { alive = false; if (timer) clearTimeout(timer); };
      }, []);

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
            optState[1]({ offline: false, tiers: tiers, styles: styles });
          })
          .catch(function () { if (alive) optState[1]({ offline: true }); });
        return function () { alive = false; };
      }, []);

      React.useEffect(function () {
        function onKey(e) { if (e && e.key === 'Escape' && onClose) onClose(); }
        try { document.addEventListener('keydown', onKey); } catch (err) { /* no DOM */ }
        return function () {
          try { document.removeEventListener('keydown', onKey); } catch (err) { /* no DOM */ }
        };
      }, []);

      var projects = data && Array.isArray(data.projects) ? data.projects : [];
      function say(key) { noticeState[1](String(t(key) || '')); }

      function tierList() { return (opts && opts.tiers) || FALLBACK_TIERS; }
      function styleList() { return (opts && opts.styles) || FALLBACK_STYLES; }
      function tierTitle(id) {
        var hit = tierList().filter(function (x) { return x.id === id; })[0];
        return hit ? hit.title : '';
      }
      function onTier(e) { var v = e && e.target ? e.target.value : ''; tierState[1](v); lsSet(LS_TIER, v); }
      function onStyle(e) { var v = e && e.target ? e.target.value : ''; styleState[1](v); lsSet(LS_STYLE, v); }

      /** 以队友/子代理开工：四级降级，每一级都回报真实模式；预设随提示词一起带过去。 */
      function onTeammate() {
        if (busy) return;
        busyState[1](true);
        var extra = kickoffExtra(tierTitle(tier), style);
        Promise.resolve()
          .then(function () { return startTeammate(ctx, extra); })
          .then(function (res) {
            busyState[1](false);
            say(res && KICKOFF_NOTICE[res.mode] ? KICKOFF_NOTICE[res.mode] : 'popup.teammateNone');
          }, function () { busyState[1](false); say('popup.teammateNone'); });
      }

      /** 渲染第一张联系表：没有工程就如实说没有，不假装提交成功。 */
      function onRender() {
        if (busy) return;
        if (!projects.length) { say('popup.renderNone'); return; }
        var target = projects[0];
        busyState[1](true);
        Promise.resolve()
          .then(function () { return apiPost('/render', { project: target.path || target.name, mode: 'contact' }); })
          .then(function (d) { busyState[1](false); say(d && d.ok ? 'popup.renderSent' : 'popup.renderFailed'); },
            function () { busyState[1](false); say('popup.renderFailed'); });
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

      /** 打开已注册的工坊页；页面类型缺席时如实提示，不伪造。 */
      function onOpenStudio() {
        var how = 'none';
        try { how = props.openStudio ? props.openStudio() : 'none'; } catch (e) { how = 'none'; }
        if (how === 'none') { say('entry.unavailable'); return; }
        if (onClose) onClose();
      }

      var rows = [];
      if (phase === 'probing') {
        rows.push(h('div', { key: 'probe', className: 'dshMvDim' }, t('popup.probing')));
      } else if (phase === 'absent') {
        rows.push(h('div', { key: 'absent', className: 'dshMvNotice' }, t('popup.offline')));
      } else {
        rows.push(h('div', { key: 'ws', className: 'dshMvRow' }, [
          h('span', { key: 'k', className: 'dshMvKey' }, t('popup.workspace')),
          h('span', { key: 'v', className: 'dshMvVal', title: String((data && data.root) || '') },
            String((data && data.root) || '—'))
        ]));
        rows.push(h('div', { key: 'pj', className: 'dshMvRow' }, [
          h('span', { key: 'k', className: 'dshMvKey' }, t('popup.projects')),
          h('span', { key: 'v', className: 'dshMvVal' },
            String(t('popup.projectsValue')).replace('{count}', projects.length))
        ]));
        // 渲染状态分条：任务 / 进度 / 速度 / 预计 / 状态
        var jr = jobRows(t, data && data.job ? data.job : null);
        for (var i = 0; i < jr.length; i++) {
          rows.push(h('div', {
            key: 'job' + i, className: 'dshMvRow', 'data-job-row': jr[i][0]
          }, [
            h('span', { key: 'k', className: 'dshMvKey' }, jr[i][0]),
            h('span', { key: 'v', className: 'dshMvVal' }, String(jr[i][1]))
          ]));
        }
      }

      // 开工前的预设选择（清晰度 / 风格），离线时如实标注
      var presetBlock = h('div', { key: 'opts', className: 'dshMvOpts', 'data-music-mv-opts': '1' }, [
        h('div', { key: 'h', className: 'dshMvDim' }, t('popup.kickoffOpts')),
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
        opts && opts.offline ? h('div', { key: 'off', className: 'dshMvNotice' }, t('popup.offlinePresets')) : null
      ]);

      return h('div', {
        className: 'dshMvPopup',
        role: 'dialog',
        'aria-label': String(t('entry.label') || 'codeMV'),
        'data-music-mv-popup': '1'
      }, [
        h('div', { key: 'head', className: 'dshMvHead' }, [
          h('span', { key: 'title', className: 'dshMvTitle' }, t('entry.label')),
          h('button', {
            key: 'close', type: 'button', className: 'dshMvClose',
            onClick: onClose, 'aria-label': t('popup.close')
          }, '✕')
        ])
      ].concat(rows).concat([
        presetBlock,
        notice ? h('div', { key: 'notice', className: 'dshMvNotice', 'data-notice': '1' }, notice) : null,
        h('ul', { key: 'acts', className: 'dshMvActions' }, [
          h('li', { key: 'tm' },
            h('button', {
              type: 'button', className: 'dshMvAct dshMvActPrimary',
              onClick: onTeammate, disabled: !!busy, 'data-act': 'teammate'
            }, t('popup.teammate'))),
          h('li', { key: 'op' },
            h('button', { type: 'button', className: 'dshMvAct', onClick: onOpenStudio, 'data-act': 'studio' },
              t('popup.openStudio'))),
          h('li', { key: 'rd' },
            h('button', {
              type: 'button', className: 'dshMvAct', onClick: onRender, disabled: !!busy, 'data-act': 'render'
            }, t('popup.render'))),
          h('li', { key: 'cp' },
            h('button', { type: 'button', className: 'dshMvAct', onClick: onCopyPath, 'data-act': 'copy' },
              t('popup.copyPath')))
        ])
      ]));
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
      var notice = React.useState('');
      React.useEffect(function () {
        if (typeof fetch !== 'function') return undefined;
        var alive = true;
        fetch('/music-mv/api/state', { headers: { 'x-music-mv': 'studio' } })
          .then(function (r) { if (alive) probeState[1](r && r.ok ? 'ready' : 'absent'); })
          .catch(function () { if (alive) probeState[1]('absent'); });
        return function () { alive = false; };
      }, []);
      var title = notice[0] || (probeState[0] === 'absent' ? t('entry.offline') : t('entry.tooltip'));

      function click() { notice[1](''); openState[1](!open); }
      function close() { openState[1](false); }

      var kids = [
        h('button', {
          key: 'btn',
          type: 'button',
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
          key: 'popup', t: props.t, ctx: props.ctx, openStudio: props.openStudio, onClose: close
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
      ctx.effect(function () {
        return ctx.slots.inject('sidebar.right.pane.tab', function () {
          return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: STUDIO_ID, locale: NS }, function (props) {
            return h(StudioBody, Object.assign({}, props, {
              onAsk: function (text) { return askAgent(ctx, String(text || '')); },
              // 离线回落里的「开工」同样以队友/子代理形式执行 / same teammate kickoff offline
              onKickoff: function () { return startTeammate(ctx); }
            }));
          });
        });
      }, 'music-code-mv: 页面主体 / studio page body');
      // 右下角常驻悬浮窗已移除：入口收进标题栏 codeMV 弹层，开工走队友/子代理。
      // The bottom-right dock is gone; the entry lives in the title bar instead.
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
                openStudio: function () { return openStudioPage(ctx); }
              };
            }
          }, TitlebarEntry);
        });
      }, 'music-code-mv: 标题栏入口 / titlebar entry');
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
      startTeammate: startTeammate,
      KICKOFF_NOTICE: KICKOFF_NOTICE,
      jobLine: jobLine,
      jobRows: jobRows,
      kickoffExtra: kickoffExtra,
      composePrompt: composePrompt,
      FALLBACK_TIERS: FALLBACK_TIERS,
      FALLBACK_STYLES: FALLBACK_STYLES
    };
    return module.exports;
  }
});
