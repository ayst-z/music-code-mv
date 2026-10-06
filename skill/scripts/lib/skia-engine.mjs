/**
 * music-code-mv browserless render engine — the self-written renderer.
 *
 * Renders a project's scene modules directly onto skia (@napi-rs/canvas) in
 * the current Node process: no Chrome, no CDP round-trips, no screenshot
 * surface sync. For pure Canvas2D projects (all shipped styles) this removes
 * the entire browser stack from the per-frame path.
 *
 * Contract parity with the Chrome engine:
 *   - window.__MV__ is set before src/main.js is imported
 *   - boot() runs, then window.__ready gates first shoot
 *   - window.renderAt(t) draws synchronously; frames are encoded to jpeg/png
 *   - window.MV.timeline exposes scene metadata for the incremental signature
 *
 * DOM shims cover exactly the surface the shipped entry uses:
 *   window.__MV__/renderAt/MV/__ready, document.fonts.ready,
 *   document.createElement('canvas'), document.body.appendChild, Image, fetch.
 *
 * Fidelity note: skia text rasterization differs slightly from Chrome's
 * (font fallback metrics), so frames are deterministic within this engine but
 * not pixel-identical to Chrome frames. The engine name is part of the render
 * signature so the two caches never mix.
 *
 * Dependency: pnpm add @napi-rs/canvas  (resolved upward from the project dir)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveCanvasLib(startDirs) {
  for (const base of startDirs) {
    if (!base) continue;
    try {
      const req = createRequire(path.join(base, 'probe.js'));
      return req('@napi-rs/canvas');
    } catch { /* next */ }
  }
  const err = new Error(
    'engine=node needs @napi-rs/canvas — install it once with ' +
    '"pnpm add @napi-rs/canvas" (or npm i @napi-rs/canvas) in the project workspace');
  err.code = 'ENGINE_DEP';
  throw err;
}

function registerSystemFonts(GlobalFonts) {
  if (process.platform !== 'win32' || !GlobalFonts || !GlobalFonts.registerFromPath) return 0;
  const dir = path.join(process.env.WINDIR || 'C:/Windows', 'Fonts');
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  // the shipped styles use ui-monospace/Cascadia/Consolas + sans fallbacks;
  // register the Windows families Chrome would pick for those stacks
  const want = /^(consol|cour|arial|times|verdana|segoeui|calibri|msyh)/i;
  let n = 0;
  for (const f of names) {
    if (!/\.(ttf|otf|ttc)$/i.test(f) || !want.test(f)) continue;
    try { GlobalFonts.registerFromPath(path.join(dir, f)); n++; } catch { /* dup or bad file */ }
  }
  return n;
}

/**
 * Boot the project in-process and return { shoot, scenes, close }.
 */
export async function createNodeRenderer(opts) {
  const { projectDir, width, height, fps, duration, format = 'jpeg', quality = 95 } = opts;
  const canvasLib = resolveCanvasLib([
    projectDir, path.resolve(projectDir, '..'),
    path.resolve(HERE, '..', '..', '..'),  // skills/<skill>/scripts/lib -> workspace root
    HERE, process.cwd()
  ]);
  const { createCanvas, GlobalFonts, Image: NativeImage } = canvasLib;
  if (typeof createCanvas !== 'function') {
    throw new Error('engine=node: @napi-rs/canvas did not expose createCanvas()');
  }
  if (!NativeImage) {
    throw new Error('engine=node: @napi-rs/canvas did not expose Image() — projects with assets need it');
  }
  const fonts = registerSystemFonts(GlobalFonts);

  const entry = path.join(projectDir, 'src', 'main.js');
  if (!fs.existsSync(entry)) {
    throw new Error('engine=node: entry not found: ' + entry + ' (expected <project>/src/main.js)');
  }

  const resolveAsset = (u) => {
    const s = String(u);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      throw new Error('engine=node: remote assets are not supported (' + s + ')');
    }
    return path.resolve(projectDir, s.replace(/^\.\//, ''));
  };

  // ---------------------------------------------------------------- shims
  let mainCanvas = null;
  const bootErrors = [];
  const onBootError = (e) => { bootErrors.push(e); };
  process.on('unhandledRejection', onBootError);

  const win = {
    __MV__: { width, height, fps, duration },
    devicePixelRatio: 1
  };
  const doc = {
    fonts: { ready: Promise.resolve() },
    body: {
      appendChild(el) { mainCanvas = el; return el; },
      removeChild() { return null; }
    },
    createElement(tag) {
      const t = String(tag).toLowerCase();
      if (t !== 'canvas') {
        throw new Error('engine=node: document.createElement("' + t + '") is unsupported — ' +
          'the node engine serves pure Canvas2D projects; use --engine=chrome for DOM projects');
      }
      return createCanvas(1, 1);
    },
    querySelector() { return mainCanvas; },
    addEventListener() {},
    removeEventListener() {}
  };

  class NodeImage extends NativeImage {
    constructor() { super(); this._src = ''; }
    set src(v) {
      this._src = String(v);
      try {
        const buf = fs.readFileSync(resolveAsset(this._src));
        super.src = buf;
        if (typeof this.onload === 'function') this.onload();
      } catch (e) {
        if (typeof this.onerror === 'function') this.onerror(e);
      }
    }
    get src() { return this._src; }
  }

  const fetchShim = async (url) => {
    const file = resolveAsset(url);
    const buf = await fs.promises.readFile(file);
    const text = buf.toString('utf8');
    return {
      ok: true, status: 200, url: file,
      json: async () => JSON.parse(text),
      text: async () => text,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
  };

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.Image = NodeImage;
  globalThis.fetch = fetchShim;
  globalThis.devicePixelRatio = 1;
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  }

  // ---------------------------------------------------------------- boot
  try {
    await import(pathToFileURL(entry).href);
  } catch (e) {
    process.off('unhandledRejection', onBootError);
    const hint = (e && /Cannot use import statement|require is not defined|Unexpected token/.test(e.message))
      ? ' — hint: the project needs {\"type\":\"module\"} in the nearest package.json'
      : '';
    throw new Error('engine=node: failed to import ' + entry + ': ' + e.message + hint);
  }
  const deadline = Date.now() + 120000;
  while (!win.__ready) {
    if (bootErrors.length) {
      process.off('unhandledRejection', onBootError);
      throw new Error('engine=node: boot() failed: ' + (bootErrors[0] && bootErrors[0].message));
    }
    if (Date.now() > deadline) {
      process.off('unhandledRejection', onBootError);
      throw new Error('engine=node: window.__ready never became true (boot() hung?)');
    }
    await new Promise((r) => setTimeout(r, 8));
  }
  process.off('unhandledRejection', onBootError);

  // ---------------------------------------------------------------- api
  const shoot = async (t, file) => {
    await win.renderAt(t);
    if (!mainCanvas) throw new Error('engine=node: no canvas was attached to document.body');
    const buf = format === 'jpeg'
      ? mainCanvas.toBuffer('image/jpeg', quality)
      : mainCanvas.toBuffer('image/png');
    fs.writeFileSync(file, buf);
    return buf;   // 编码器只见 stdin：返回字节给调用方喂管道（文件=缓存）
  };

  const scenes = () => {
    const tl = win.MV && win.MV.timeline;
    if (!tl || !tl.scenes) return null;
    return tl.scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, deps: s.deps || null }));
  };

  if (opts.verbose) {
    console.log('[node-engine] booted ' + path.basename(projectDir) + '  ' + width + 'x' + height +
      '  fonts=' + fonts);
  }

  return { shoot, scenes, close: async () => { /* nothing to close */ } };
}
