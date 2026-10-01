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
      'dock.title': 'MV 工坊',
      'dock.pill': 'MV 工坊',
      'dock.collapse': '收起控制面板',
      'dock.expand': '展开控制面板',
      'dock.noProject': '还没有工程，先用 music_mv_init 建一个。',
      'dock.hasSheet': '有联系表',
      'dock.noSheet': '无联系表',
      'dock.hasVideo': '有成片',
      'dock.noVideo': '无成片',
      'dock.contact': '联系表',
      'dock.open': '完整面板',
      'dock.start': '开启对话',
      'dock.started': '已开启新对话，skill 已装载',
      'dock.copied': '已复制 /music-code-mv，粘贴到输入框发送',
      'dock.starting': '正在开启…',
      'dock.cancel': '取消',
      'dock.rendering': '渲染中',
      'dock.sheet': '联系表'
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
      'dock.title': 'MV Studio',
      'dock.pill': 'MV Studio',
      'dock.collapse': 'Collapse the control panel',
      'dock.expand': 'Expand the control panel',
      'dock.noProject': 'No project yet — scaffold one with music_mv_init.',
      'dock.hasSheet': 'sheet ready',
      'dock.noSheet': 'no sheet',
      'dock.hasVideo': 'film ready',
      'dock.noVideo': 'no film',
      'dock.contact': 'Sheet',
      'dock.open': 'Full panel',
      'dock.start': 'Start chat',
      'dock.started': 'New chat opened with the skill loaded',
      'dock.copied': 'Copied /music-code-mv — paste it into the composer',
      'dock.starting': 'Starting…',
      'dock.cancel': 'Cancel',
      'dock.rendering': 'Rendering',
      'dock.sheet': 'Contact sheet'
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
      if (!url) {
        children.push(h('div', {
          key: 'msg',
          style: { padding: '14px', fontSize: '12px', lineHeight: 1.7, opacity: 0.8 }
        }, t('state.noOrigin')));
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


    // ───────────────────────── 常驻侧边控制面板 / always-on side panel ─────────────────────────
    var DOCK_ID = 'music-mv-dock';
    var DOCK_COLLAPSED_KEY = 'dsh-music-code-mv.dock.collapsed';
    var API_BASE = '/music-mv/api';
    var DOCK_HEADERS = { 'x-music-mv': 'studio' };

    function readCollapsed() {
      try { return window.localStorage.getItem(DOCK_COLLAPSED_KEY) === '1'; } catch (e) { return false; }
    }
    function writeCollapsed(v) {
      try { window.localStorage.setItem(DOCK_COLLAPSED_KEY, v ? '1' : '0'); } catch (e) { /* private mode */ }
    }
    function apiGet(pathname) {
      return fetch(API_BASE + pathname, { headers: DOCK_HEADERS }).then(function (r) { return r.json(); });
    }
    function apiPost(pathname, body) {
      return fetch(API_BASE + pathname, {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, DOCK_HEADERS),
        body: JSON.stringify(body || {})
      }).then(function (r) { return r.json(); });
    }
    function newestProject(list) {
      var best = null, bestAt = -1;
      (list || []).forEach(function (p) {
        var at = Math.max(p.contact ? p.contact.mtime : 0, p.video ? p.video.mtime : 0);
        if (at > bestAt) { bestAt = at; best = p; }
      });
      return best || (list && list[0]) || null;
    }

    var DOCK = {
      wrap: {
        position: 'fixed', right: '14px', bottom: '14px', zIndex: 2147483000,
        width: '248px', maxHeight: '62vh', overflow: 'auto', boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-layer-2, #232324)',
        color: 'var(--dsw-alias-label-primary, #f9fafb)',
        border: '1px solid var(--dsw-alias-border-l2, #ffffff1f)',
        borderRadius: 'var(--dsw-radius-lg, 12px)',
        boxShadow: '0 6px 24px rgba(0,0,0,.28)',
        font: '12px/1.5 var(--dsw-font-family, system-ui, sans-serif)'
      },
      pill: {
        position: 'fixed', right: '14px', bottom: '14px', zIndex: 2147483000,
        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
        padding: '7px 12px', borderRadius: '999px',
        background: 'var(--dsw-alias-bg-layer-2, #232324)',
        color: 'var(--dsw-alias-label-primary, #f9fafb)',
        border: '1px solid var(--dsw-alias-border-l2, #ffffff1f)',
        boxShadow: '0 6px 20px rgba(0,0,0,.28)',
        font: '12px/1 var(--dsw-font-family, system-ui, sans-serif)'
      },
      head: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderBottom: '1px solid var(--dsw-alias-border-l2, #ffffff1f)' },
      body: { padding: '8px 10px 10px' },
      dot: { width: '7px', height: '7px', borderRadius: '50%', flex: 'none' },
      title: { fontWeight: 600, letterSpacing: '.02em' },
      dim: { color: 'var(--dsw-alias-label-tertiary, #adb2b8)', fontSize: '11px' },
      btn: {
        font: 'inherit', cursor: 'pointer', padding: '3px 9px', borderRadius: '8px',
        color: 'inherit', background: 'transparent',
        border: '1px solid var(--dsw-alias-border-l2, #ffffff1f)'
      },
      btnPrimary: { color: 'var(--dsw-alias-state-business-primary, #4176e6)', borderColor: 'var(--dsw-alias-state-business-primary, #4176e6)' },
      select: {
        width: '100%', boxSizing: 'border-box', marginBottom: '6px',
        font: 'inherit', color: 'inherit', padding: '3px 6px', borderRadius: '8px',
        background: 'var(--dsw-alias-bg-base, #151517)',
        border: '1px solid var(--dsw-alias-border-l2, #ffffff1f)'
      },
      bar: { height: '5px', borderRadius: '999px', overflow: 'hidden', background: 'var(--dsw-alias-interactive-bg-hover, #ffffff14)', marginTop: '6px' },
      thumb: { width: '100%', borderRadius: '8px', marginTop: '6px', border: '1px solid var(--dsw-alias-border-l2, #ffffff1f)', display: 'block' }
    };

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
    async function startSkillConversation(ctx, hint) {
      var text = SKILL_COMMAND + (hint ? ' ' + hint : '');
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

    function StudioDock(props) {
      var t = props.t;
      var openState = React.useState(!readCollapsed());
      var open = openState[0];
      var setOpen = openState[1];
      var dataState = React.useState(null);
      var data = dataState[0];
      var setData = dataState[1];
      var selRef = React.useRef('');
      var selState = React.useState('');
      var selected = selState[0];
      var setSelected = selState[1];
      var errState = React.useState('');
      var err = errState[0];
      var setErr = errState[1];
      var msgState = React.useState('');
      var msg = msgState[0];
      var setMsg = msgState[1];
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      function refresh() {
        apiGet('/state').then(function (s) {
          setData(s);
          if (!selRef.current) {
            var p = newestProject(s.projects);
            if (p) { selRef.current = p.path; setSelected(p.path); }
          }
        }).catch(function () { setData(false); });
      }
      React.useEffect(function () {
        refresh();
        var timer = setInterval(refresh, 5000);
        return function () { clearInterval(timer); };
      }, []);

      if (data === false) return null; // 宿主半边没挂上就不显示 / host half absent
      var projects = (data && data.projects) || [];
      var cur = null;
      for (var i = 0; i < projects.length; i++) if (projects[i].path === selected) cur = projects[i];
      if (!cur) cur = newestProject(projects);
      var job = data && data.job;
      var running = !!(job && job.status === 'running');
      var ready = !!(data && data.env && data.env.ready);
      var pct = job && job.progress && job.progress.pct != null ? job.progress.pct : 0;

      function toggle() {
        var next = !open;
        setOpen(next);
        writeCollapsed(!next);
      }
      function render(mode) {
        if (!cur) return;
        setErr('');
        apiPost('/render', { project: cur.path, mode: mode, width: mode === 'contact' ? 480 : undefined, height: mode === 'contact' ? 270 : undefined, keys: mode === 'contact' ? 4 : undefined })
          .then(function (r) { if (r && r.ok === false) setErr(String(r.error)); refresh(); })
          .catch(function (e) { setErr(String(e)); });
      }

      if (!open) {
        return h('button', {
          type: 'button', title: t('dock.expand'), onClick: toggle,
          style: Object.assign({}, DOCK.pill, { cursor: 'pointer' })
        }, [
          h('span', { key: 'dot', style: Object.assign({}, DOCK.dot, { background: ready ? 'var(--dsw-alias-state-success-primary, #4ade80)' : 'var(--dsw-alias-label-tertiary, #adb2b8)' }) }),
          h('span', { key: 'label' }, t('dock.pill'))
        ]);
      }

      var rows = [];
      rows.push(h('div', { key: 'head', style: DOCK.head }, [
        h('span', { key: 'dot', style: Object.assign({}, DOCK.dot, { background: ready ? 'var(--dsw-alias-state-success-primary, #4ade80)' : 'var(--dsw-alias-state-warn-primary, #e2b04a)' }) }),
        h('span', { key: 'title', style: DOCK.title }, t('dock.title')),
        h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
        h('button', { key: 'hide', type: 'button', title: t('dock.collapse'), onClick: toggle, style: DOCK.btn }, '—')
      ]));

      var body = [];
      if (!projects.length) {
        body.push(h('div', { key: 'none', style: DOCK.dim }, t('dock.noProject')));
      } else {
        var options = projects.map(function (p) { return h('option', { key: p.path, value: p.path }, p.name); });
        body.push(h('select', {
          key: 'sel', value: cur ? cur.path : '', style: DOCK.select,
          onChange: function (e) { selRef.current = e.target.value; setSelected(e.target.value); }
        }, options));
        if (cur) {
          body.push(h('div', { key: 'meta', style: DOCK.dim },
            (cur.width || '?') + '×' + (cur.height || '?') + ' @' + (cur.fps || '?') + 'fps · ' + (cur.contact ? t('dock.hasSheet') : t('dock.noSheet')) + ' · ' + (cur.video ? t('dock.hasVideo') : t('dock.noVideo'))));
        }
        var actions = [];
        actions.push(h('button', {
          key: 'kickoff', type: 'button', disabled: busy,
          onClick: function () {
            setBusy(true);
            setMsg(t('dock.starting'));
            Promise.resolve(props.onKickoff(cur ? cur.path : ''))
              .then(function (r) { setMsg(r && r.ok ? t('dock.started') : t('dock.copied')); })
              .catch(function () { setMsg(t('dock.copied')); })
              .then(function () { setBusy(false); });
          },
          style: Object.assign({}, DOCK.btn, DOCK.btnPrimary)
        }, t('dock.start')));
        actions.push(h('button', { key: 'contact', type: 'button', disabled: running, onClick: function () { render('contact'); }, style: Object.assign({}, DOCK.btn, { marginLeft: '6px' }) }, t('dock.contact')));
        actions.push(h('button', { key: 'open', type: 'button', onClick: function () { try { props.openStudio(); } catch (e) { /* no session */ } }, style: Object.assign({}, DOCK.btn, { marginLeft: '6px' }) }, t('dock.open')));
        if (running) actions.push(h('button', { key: 'cancel', type: 'button', onClick: function () { apiPost('/cancel', {}).then(refresh); }, style: Object.assign({}, DOCK.btn, { marginLeft: '6px' }) }, t('dock.cancel')));
        var actionRow = h('div', { key: 'actions', style: { marginTop: '8px' } }, actions);
        body.push(actionRow);
        if (running) {
          body.push(h('div', { key: 'bar', style: DOCK.bar },
            h('i', { style: { display: 'block', height: '100%', width: Math.max(3, Math.min(100, pct)) + '%', background: 'var(--dsw-alias-state-business-primary, #4176e6)' } })));
          body.push(h('div', { key: 'pct', style: Object.assign({}, DOCK.dim, { marginTop: '4px' }) }, t('dock.rendering') + ' ' + Math.round(pct) + '%'));
        }
        if (cur && cur.contact) {
          body.push(h('img', { key: 'thumb', alt: t('dock.sheet'), src: API_BASE + '/file?path=' + encodeURIComponent(cur.contact.path) + '&t=' + cur.contact.mtime, style: DOCK.thumb }));
        }
      }
      if (msg) body.push(h('div', { key: 'msg', style: Object.assign({}, DOCK.dim, { marginTop: '6px' }) }, msg));
      if (err) body.push(h('div', { key: 'err', style: { color: 'var(--dsw-alias-state-error-primary, #f07171)', marginTop: '6px' } }, err));
      rows.push(h('div', { key: 'body', style: DOCK.body }, body));

      return h('div', { style: DOCK.wrap, 'data-music-mv-dock': '1' }, rows);
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
          return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: STUDIO_ID, locale: NS }, StudioBody);
        });
      }, 'music-code-mv: 页面主体 / studio page body');
      // 常驻控制面板：插件一载入就一直在，可以收起但不会被卸载
      ctx.effect(function () {
        return ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({ name: 'shell.overlay', id: DOCK_ID, locale: NS, order: 80 }, function (props) {
            return h(StudioDock, Object.assign({}, props, {
              openStudio: function () { ctx.sidebarRight.openTab(STUDIO_KIND); },
              onKickoff: function (projectPath) {
                var hint = '用「MV 工坊」开始：先读 guide 与 presets，按 skill 流程在当前工作区推进一支 MV（先分镜，再逐镜头，联系表自检）。';
                if (projectPath) hint += ' 目标工程：' + projectPath + '。';
                return startSkillConversation(ctx, hint);
              }
            }));
          });
        });
      }, 'music-code-mv: 侧边控制面板 / side control panel');
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
    return module.exports;
  }
});
