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
      'hint.title': 'MV 工坊'
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
      'hint.title': 'MV Studio'
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
          win.postMessage({ source: 'dsh-music-code-mv', type: 'theme', dark: snap.dark, tokens: snap.tokens }, '*');
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
