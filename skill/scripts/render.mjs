#!/usr/bin/env node
/**
 * music-code-mv renderer — deterministic virtual-time frame renderer + ffmpeg encoder.
 *
 *   node render.mjs --project=<dir> [options]
 *
 * Output modes
 *   --contact            contact sheet of N keyframes (the self-check step)
 *   --stills=1.5,4,9.2   specific timestamps as images
 *   --sheet              rebuild the contact sheet from already-rendered frames
 *   (default)            full video: every frame + MP4
 *
 * Performance
 *   --engine=chrome|node  chrome (default): headless-Chrome screenshots;
 *                         node: browserless skia engine — no Chrome, much faster,
 *                         needs @napi-rs/canvas (pnpm add @napi-rs/canvas)
 *   --workers=<n>        render frames in n parallel processes (default 1)
 *   --gl=auto|gpu|soft   auto probes hardware GL and falls back to software
 *   --encoder=<id>       auto picks the best hardware encoder (qsv > nvenc > amf > x264)
 *   --preset= --crf=     software encoder tuning (default medium / 17)
 *   --hdr10              10-bit HEVC, Rec.2020 + PQ, HDR10 mastering metadata
 *   --depth=8|10|12      output color depth (12 = HEVC main12, auto-selects libx265;
 *                        source frames are 8-bit canvas renders, 10/12 is encode precision)
 *
 * Incremental
 *   Frames are reused when the file exists AND its render signature is unchanged.
 *   A scene can declare \`deps: ['./src/style.js']\` to narrow the blast radius.
 *   --force ignores all signatures and re-renders everything.
 *
 * Other
 *   --w= --h= --fps= --dur=    overrides for project.json
 *   --start=<f> --end=<f>      partial frame range
 *   --format=jpeg|png --quality=<1-100>   default jpeg(95); png only when lossless needed
 *   --audio=<file> --audio-codec= --audio-bitrate=
 *   --keep                     keep the frames directory
 *   --chrome=<path> --ffmpeg=<path>
 *   --verbose
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createProgress, parseProgressLine } from './lib/progress.mjs';
import { createSignature, loadSignatures, saveSignatures } from './lib/signature.mjs';
import { pickEncoder, buildEncodeArgs, runFfmpeg } from './lib/encode.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opt = {};
const positional = [];
for (const a of argv) {
  const m = /^--([^=]+)(?:=([\s\S]*))?$/.exec(a);
  if (m) opt[m[1]] = m[2] === undefined ? true : m[2];
  else positional.push(a);
}
const verbose = !!opt.verbose;
const log = (...a) => { if (!opt.quiet) console.log('[render]', ...a); };
const vlog = (...a) => { if (verbose) console.log('[render]', ...a); };

const projectDir = path.resolve(opt.project || positional[0] || '.');
if (!fs.existsSync(projectDir)) { console.error('project dir not found: ' + projectDir); process.exit(2); }

const loadJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const proj = loadJson(path.join(projectDir, 'project.json')) || {};

const W = Number(opt.w || proj.width || 1280);
const H = Number(opt.h || proj.height || 720);
const FPS = Number(opt.fps || proj.fps || 30);
const DUR = Number(opt.dur || proj.duration || 10);
const TOTAL = Math.max(1, Math.round(DUR * FPS));
const OUT = path.resolve(projectDir, String(opt.out || 'out/video.mp4'));
const FRAMES = path.join(projectDir, 'frames');
const CACHE = path.join(projectDir, '.cache');
const SIGFILE = path.join(CACHE, 'signatures.json');
const KEYS = Number(opt.keys || 12);
const COLS = Number(opt.cols || 4);
const KEYW = Number(opt.keyw || 320);
// Default jpeg: PNG frame encoding dominated the per-frame cost (measured 6.7fps
// vs 25.3fps at 4K60x8 workers). Pass --format=png when lossless stills matter.
const FMT = /^(png)$/i.test(String(opt.format || '')) ? 'png' : 'jpeg';
const EXT = FMT === 'jpeg' ? 'jpg' : 'png';
const QUALITY = Number(opt.quality || 95);
const ENGINE = String(opt.engine || 'chrome');
if (ENGINE !== 'chrome' && ENGINE !== 'node') {
  console.error('unknown --engine=' + ENGINE + ' (use chrome or node)');
  process.exit(2);
}
const DEPTH = opt.depth === undefined ? 8 : Number(opt.depth);
if (![8, 10, 12].includes(DEPTH)) {
  console.error('unknown --depth=' + opt.depth + ' (use 8, 10 or 12)');
  process.exit(2);
}

const WORKERS = Math.max(1, Number(opt.workers || 1));
const WORKER_INDEX = opt.worker === undefined ? -1 : Number(opt.worker);
const IS_WORKER = WORKER_INDEX >= 0;
const frameName = (f) => 'f' + String(f).padStart(5, '0') + '.' + EXT;
const framePath = (f) => path.join(FRAMES, frameName(f));

// ---------------------------------------------------------------- tools
function findChrome() {
  const cands = [
    opt.chrome, process.env.CHROME_PATH, process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return null;
}
function findUpFrom(start, rel) {
  let d = start;
  for (let i = 0; i < 10; i++) {
    const p = path.join(d, rel);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
function findFfmpeg() {
  for (const c of [opt.ffmpeg, process.env.FFMPEG_PATH]) if (c && fs.existsSync(c)) return c;
  for (const rel of [
    'node_modules/ffmpeg-static/ffmpeg.exe', 'node_modules/ffmpeg-static/ffmpeg',
    'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe',
    'node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
    'node_modules/@ffmpeg-installer/darwin-x64/ffmpeg'
  ]) {
    const p = findUpFrom(projectDir, rel);
    if (p) return p;
  }
  return 'ffmpeg';
}
function findNodeModules(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    const nm = path.join(d, 'node_modules');
    if (fs.existsSync(nm)) return nm;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { total += fs.statSync(p).size; } catch { /* ignore */ } }
    }
  };
  walk(dir);
  return total;
}

function loadPuppeteer(fromDir) {
  for (const base of [fromDir, HERE, process.cwd()]) {
    try {
      const r = createRequire(path.join(base, 'noop.js'));
      return import(pathToFileURL(r.resolve('puppeteer-core')).href);
    } catch { /* next */ }
  }
  return import('puppeteer-core');
}

const CHROME = opt.chrome || findChrome();
const FFMPEG = findFfmpeg();
const NODE_MODULES = findNodeModules(projectDir);

// ---------------------------------------------------------------- static server
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm'
};
function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('bad request'); }
    const send = (file) => {
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 ' + file); }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      });
    };
    if (urlPath.startsWith('/node_modules/')) {
      if (!NODE_MODULES) { res.writeHead(404); return res.end('no node_modules'); }
      const nmFile = path.normalize(path.join(NODE_MODULES, urlPath.slice('/node_modules/'.length)));
      if (!nmFile.startsWith(NODE_MODULES)) { res.writeHead(403); return res.end('forbidden'); }
      return send(nmFile);
    }
    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const file = path.normalize(path.join(projectDir, rel));
    if (!file.startsWith(projectDir)) { res.writeHead(403); return res.end('forbidden'); }
    send(file);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- GL flags
function glArgs(mode) {
  if (mode === 'gpu') {
    return ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization', '--enable-zero-copy'];
  }
  return ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
}

// ---------------------------------------------------------------- encode
async function encode() {
  const start = Math.max(0, Number(opt.start || 0));
  const end = Math.min(TOTAL, Number(opt.end || TOTAL));
  let encoder;
  try {
    encoder = await pickEncoder(FFMPEG, opt.encoder || 'auto');
  } catch (e) {
    console.error('[render] ' + e.message);
    process.exit(4);
  }
  const hdr10 = !!opt.hdr10;
  if (hdr10 && encoder.family === 'qsv') {
    log('WARNING: QSV cannot embed HDR10 mastering metadata; use --encoder=libx265 for a compliant master');
  }
  if (DEPTH >= 10) {
    // 12-bit is a software-x265 job (hw paths top out at 10-bit P010); 10-bit
    // only needs an HEVC/AV1-capable encoder, so H.264 encoders swap out too
    const needSwap = DEPTH === 12 ? encoder.id !== 'libx265'
      : !(encoder.id === 'libx265' || encoder.id.startsWith('hevc') || encoder.id.startsWith('av1'));
    if (needSwap) {
      try {
        const alt = await pickEncoder(FFMPEG, 'libx265');
        log('depth ' + DEPTH + '-bit: encoder ' + encoder.id + ' -> ' + alt.id + ' (high bit depth)');
        encoder = alt;
      } catch (e) {
        console.error('[render] --depth=' + DEPTH + ' needs libx265 in this ffmpeg build: ' + e.message);
        process.exit(4);
      }
    }
  }
  log('encoder: ' + encoder.label + (hdr10 ? '  [HDR10 / Rec.2020 PQ / 10-bit]' : '') +
    (DEPTH >= 10 ? '  [' + DEPTH + '-bit color]' : ''));

  const args = buildEncodeArgs({
    fps: FPS, startNumber: start,
    // bound the output to the requested range: image2 keeps reading contiguous
    // files on disk, so frames left over from a longer previous run would
    // otherwise be silently appended to this encode
    frames: Math.max(1, end - start),
    framePattern: path.join(FRAMES, 'f%05d.' + EXT),
    out: OUT, audio: opt.audio ? path.resolve(projectDir, String(opt.audio)) : null,
    encoder, preset: String(opt.preset || 'medium'), crf: Number(opt.crf || 17),
    hdr10, depth: DEPTH, audioCodec: opt['audio-codec'], audioBitrate: opt['audio-bitrate']
  });
  // ffmpeg never creates directories: a fresh scaffold has no out/, and a custom
  // --out=sub/video.mp4 would otherwise fail only AFTER the whole render
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await runFfmpeg(FFMPEG, args);

  const size = fs.statSync(OUT).size;
  let probe = '';
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const r = await promisify(execFile)(FFMPEG, ['-i', OUT], { maxBuffer: 1 << 24 }).catch(e => ({ stderr: e.stderr || '' }));
    probe = (r.stderr || '').split('\n').filter(l => /Duration|Stream #/.test(l)).join('\n');
  } catch { /* ignore */ }
  log('OK  ' + (size / 1048576).toFixed(2) + ' MB  ' + OUT);
  if (probe) console.log(probe.trim());
  return { size, encoder };
}

// ---------------------------------------------------------------- worker
async function runWorker() {
  // Two engines, one set of render modes below:
  //   node   — browserless skia renderer (self-written fast path)
  //   chrome — classic headless-Chrome screenshot path
  let server = null;
  let browser = null;
  let page = null;
  let renderer = null;
  let exitCode = 0;
  let shoot = null;
  let scenesFn = null;
  // chrome-branch handles (the chrome block inside try{} references them)
  let requestedGl = String(opt.gl || 'auto');
  let glMode = requestedGl === 'soft' ? 'soft' : 'gpu';
  let launch = null;
  let URL = null;

  if (ENGINE === 'node') {
    const { createNodeRenderer } = await import(pathToFileURL(path.join(HERE, 'lib', 'skia-engine.mjs')).href);
    renderer = await createNodeRenderer({
      projectDir, width: W, height: H, fps: FPS, duration: DUR,
      format: FMT, quality: QUALITY, verbose
    });
    shoot = renderer.shoot;
    scenesFn = async () => renderer.scenes();
    if (!IS_WORKER) log('engine: node (skia, browserless)' + (opt.gl ? '  [note: --gl is chrome-only]' : ''));
  } else {
    const puppeteer = (await loadPuppeteer(projectDir)).default;
    server = await startServer();
    const PORT = server.address().port;
    URL = 'http://127.0.0.1:' + PORT + '/index.html';

    launch = (mode) => puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', ...glArgs(mode),
        '--hide-scrollbars', '--mute-audio',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', '--force-device-scale-factor=1',
        '--font-render-hinting=none']
    });

    browser = await launch(glMode);
  }

  try {
    if (ENGINE === 'chrome') {
    const newPage = async () => {
      const p = await browser.newPage();
      await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      p.on('pageerror', e => console.error('[page error]', e.message));
      // scene draw failures are caught in-page and reported via console.error;
      // without forwarding them a broken scene renders silently and the bad
      // frames get cached as if they were good
      p.on('console', m => {
        const type = typeof m.type === 'function' ? m.type() : m.type;
        if (type !== 'error') { if (verbose) vlog('page:', m.text()); return; }
        const loc = typeof m.location === 'function' ? m.location() : null;
        const url = (loc && loc.url) || '';
        if (/favicon\.ico$/i.test(url)) return;   // headless Chrome probes the icon; not a project error
        console.error('[page]' + (url ? ' (' + url + ')' : '') + ': ' + m.text());
      });
      await p.evaluateOnNewDocument((w, h, fps, dur) => {
        window.__MV__ = { width: w, height: h, fps: fps, duration: dur };
      }, W, H, FPS, DUR);
      await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
      await p.waitForFunction('window.__ready === true', { timeout: 120000 });
      return p;
    };

    page = await newPage();

    // hardware GL sanity probe: a blank frame means the GPU path is unusable
    if (glMode === 'gpu' && requestedGl === 'auto') {
      await page.evaluate((t) => window.renderAt(t), 0);
      const stats = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return null;
        const tmp = document.createElement('canvas');
        tmp.width = 64; tmp.height = 36;
        const g = tmp.getContext('2d');
        g.drawImage(c, 0, 0, 64, 36);
        const d = g.getImageData(0, 0, 64, 36).data;
        let sum = 0, max = 0;
        for (let i = 0; i < d.length; i += 4) {
          const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
          sum += v; if (v > max) max = v;
        }
        return { mean: sum / (d.length / 4), max };
      });
      const usable = stats && stats.max > 6;
      if (!usable) {
        if (!IS_WORKER) log('hardware GL produced a blank frame — falling back to software rendering');
        await browser.close();
        glMode = 'soft';
        browser = await launch(glMode);
        page = await newPage();
      } else if (!IS_WORKER) {
        const renderer = await page.evaluate(() => {
          const gl = document.querySelector('canvas').getContext('webgl2') ||
                     document.querySelector('canvas').getContext('webgl');
          if (!gl) return 'canvas2d';
          const d = gl.getExtension('WEBGL_debug_renderer_info');
          return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl';
        });
        log('GL: hardware (' + renderer + ')');
      }
    } else if (!IS_WORKER) {
      log('GL: ' + (glMode === 'gpu' ? 'hardware (forced)' : 'software'));
    }

    // page.evaluate/screenshot carry no built-in timeout: a page whose renderAt never
    // returns (wedged renderer, runaway scene) blocked the run forever with zero output.
    const SHOOT_TIMEOUT_MS = 120000;
    shoot = async (t, file) => {
      const work = (async () => {
        await page.evaluate((tt) => window.renderAt(tt), t);
        await page.screenshot(FMT === 'jpeg'
          ? { path: file, type: 'jpeg', quality: QUALITY }
          : { path: file, type: 'png' });
      })();
      let timer = null;
      try {
        await Promise.race([
          work,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(
              'frame t=' + t.toFixed(3) + ' stuck for ' + (SHOOT_TIMEOUT_MS / 1000) +
              's — window.renderAt() never returned (wedged renderer?)')), SHOOT_TIMEOUT_MS);
          })
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    scenesFn = async () => page.evaluate(() => {
      const t = window.MV && window.MV.timeline;
      if (!t || !t.scenes) return null;
      return t.scenes.map(s => ({ id: s.id, start: s.start, end: s.end, deps: s.deps || null }));
    });
    } // ENGINE === 'chrome'

    // ---------- stills
    if (opt.stills) {
      const times = String(opt.stills).split(',').map(Number).filter(n => !isNaN(n));
      const dir = path.join(CACHE, 'stills');
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < times.length; i++) {
        if (IS_WORKER && i % WORKERS !== WORKER_INDEX) continue;
        const f = path.join(dir, 's' + String(i).padStart(3, '0') + '_t' + times[i].toFixed(2) + '.' + EXT);
        await shoot(times[i], f);
        console.log(f);
      }
      return;
    }

    // ---------- contact sheet
    if (opt.contact) {
      const n = Math.max(2, KEYS);
      const dir = path.join(CACHE, 'contact');
      fs.mkdirSync(dir, { recursive: true });
      const marks = [];
      for (let i = 0; i < n; i++) {
        const t = (DUR * i) / (n - 1);
        const safe = Math.min(t, Math.max(0, DUR - 1 / FPS));
        marks.push(safe);
        if (IS_WORKER && i % WORKERS !== WORKER_INDEX) continue;
        await shoot(safe, path.join(dir, 'c' + String(i).padStart(4, '0') + '.' + EXT));
      }
      if (IS_WORKER) return;
      const rows = Math.ceil(n / COLS);
      fs.mkdirSync(path.dirname(path.resolve(projectDir, String(opt.out || 'out/contact.png'))), { recursive: true });
      const outPng = path.resolve(projectDir, String(opt.out || 'out/contact.png'));
      await runFfmpeg(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '1',
        '-i', path.join(dir, 'c%04d.' + EXT),
        '-vf', 'scale=' + KEYW + ':-2,tile=' + COLS + 'x' + rows, '-frames:v', '1', outPng]);
      log('contact sheet: ' + outPng + '  (' + n + ' keys)');
      console.log(outPng);
      return;
    }

    // ---------- rebuild sheet from frames
    if (opt.sheet) {
      if (IS_WORKER) return;
      const files = fs.readdirSync(FRAMES).filter(f => /^f\d+\.(png|jpg)$/.test(f)).sort();
      const tmp = path.join(CACHE, 'sheet');
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      const step = Math.max(1, Math.floor(files.length / KEYS));
      let n = 0;
      for (let i = 0; i < files.length && n < KEYS; i += step, n++) {
        fs.copyFileSync(path.join(FRAMES, files[i]), path.join(tmp, 'c' + String(n).padStart(4, '0') + '.' + EXT));
      }
      const outPng = path.resolve(projectDir, String(opt.out || 'out/contact.png'));
      fs.mkdirSync(path.dirname(outPng), { recursive: true });
      await runFfmpeg(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '1',
        '-i', path.join(tmp, 'c%04d.' + EXT),
        '-vf', 'scale=' + KEYW + ':-2,tile=' + COLS + 'x' + Math.ceil(n / COLS), '-frames:v', '1', outPng]);
      log('contact sheet: ' + outPng);
      console.log(outPng);
      return;
    }

    // ---------- full render
    fs.mkdirSync(FRAMES, { recursive: true });

    // scene metadata drives the incremental signature
    const scenes = await scenesFn();
    const sig = scenes ? createSignature(projectDir, { width: W, height: H, fps: FPS, duration: DUR, engine: ENGINE, quality: QUALITY }) : null;
    const sigStore = opt.force ? {} : loadSignatures(SIGFILE);

    const start = Math.max(0, Number(opt.start || 0));
    const end = Math.min(TOTAL, Number(opt.end || TOTAL));
    const mine = [];
    for (let f = start; f < end; f++) if (!IS_WORKER || f % WORKERS === WORKER_INDEX) mine.push(f);

    let rendered = 0, reused = 0;
    let lastReport = 0;
    // standalone (non-worker) runs used to print nothing for the whole loop — a long
    // serial render was indistinguishable from a hang. Report progress like the supervisor.
    const serialBar = IS_WORKER ? null : createProgress({ total: mine.length, label: 'render' });
    for (const f of mine) {
      const file = framePath(f);
      let frameSig = null;
      if (sig && scenes) {
        const live = scenes.filter(s => f / FPS >= s.start && f / FPS < s.end);
        frameSig = sig.forFrame(live.map(s => ({ id: s.id, deps: s.deps })));
      }
      const exists = fs.existsSync(file);
      const cached = exists && (!frameSig || sigStore[String(f)] === frameSig);
      if (cached) {
        reused++;
      } else {
        await shoot(f / FPS, file);
        rendered++;
        if (frameSig) sigStore[String(f)] = frameSig;
      }
      const done = rendered + reused;
      if (IS_WORKER) {
        if (Date.now() - lastReport > 200 || done === mine.length) {
          lastReport = Date.now();
          console.log('##PROGRESS ' + done + ' ' + mine.length);
        }
      } else if (serialBar) {
        serialBar.update(done);
      }
    }

    if (!IS_WORKER) {
      if (serialBar) serialBar.done(null);
      saveSignatures(SIGFILE, sigStore);
      log('frames: ' + rendered + ' rendered, ' + reused + ' reused' +
        (reused > 0 ? '  (incremental — ' + ((reused / Math.max(1, rendered + reused)) * 100).toFixed(0) + '% skipped)' : ''));
      await encode();
      if (opt.clean) {
        fs.rmSync(FRAMES, { recursive: true, force: true });
        log('frame cache purged (--clean)');
      } else {
        const bytes = dirSize(FRAMES);
        log('frame cache kept: ' + (bytes / 1073741824).toFixed(2) + ' GB in frames/  (this is what makes re-renders incremental; pass --clean to purge)');
      }
    } else {
      console.log('##PROGRESS ' + (rendered + reused) + ' ' + mine.length);
      console.log('##STATS ' + rendered + ' ' + reused);
      // parallel workers cannot share the signature store: each persists a shard
      saveSignatures(path.join(CACHE, 'sig.' + WORKER_INDEX + '.json'), sigStore);
    }
  } catch (e) {
    console.error('[render] FAILED:', (e && e.message) ? e.message : e);
    exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (renderer) await renderer.close().catch(() => {});
    if (server) server.close();
  }
  process.exit(exitCode);
}

// ---------------------------------------------------------------- supervisor
async function runSupervisor() {
  const n = Math.min(WORKERS, Math.max(1, TOTAL - Math.max(0, Number(opt.start || 0))));
  log('parallel render: ' + n + ' workers, ' + TOTAL + ' frames, ' + W + 'x' + H + ' @ ' + FPS + 'fps');

  const passThrough = [];
  for (const [k, v] of Object.entries(opt)) {
    if (['workers', 'worker', 'project'].includes(k)) continue;
    if (v === true) passThrough.push('--' + k);
    else passThrough.push('--' + k + '=' + v);
  }
  passThrough.push('--project=' + projectDir);
  passThrough.push('--quiet');

  const rangeStart = Math.max(0, Number(opt.start || 0));
  const rangeEnd = Math.min(TOTAL, Number(opt.end || TOTAL));
  const rangeTotal = Math.max(1, rangeEnd - rangeStart);
  const progress = createProgress({ total: rangeTotal, label: 'render' });
  const children = [];
  const done = new Array(n).fill(0);
  const totals = new Array(n).fill(0);
  const stats = new Array(n).fill(null);

  const spawnWorker = (i) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...passThrough, '--worker=' + i, '--workers=' + n], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env }
    });
    child.stdout.on('data', (buf) => {
      for (const line of buf.toString().split('\n')) {
        const p = parseProgressLine(line);
        if (p) { done[i] = p.done; totals[i] = p.total; progress.update(done.reduce((a, b) => a + b, 0)); continue; }
        const st = /^##STATS (\d+) (\d+)$/.exec(line.trim());
        if (st) { stats[i] = { rendered: Number(st[1]), reused: Number(st[2]) }; continue; }
        if (line.trim() && verbose) console.log('[w' + i + '] ' + line.trim());
      }
    });
    child.stderr.on('data', (b) => { const s = b.toString().trim(); if (s) console.error('[w' + i + '] ' + s); });
    return child;
  };

  for (let i = 0; i < n; i++) children.push(spawnWorker(i));

  const codes = await Promise.all(children.map(c => new Promise(res => c.on('close', res))));
  progress.update(rangeTotal);
  progress.done(null);

  const failed = codes.filter(c => c !== 0).length;
  if (failed) { console.error('[render] ' + failed + ' worker(s) failed'); process.exit(1); }

  // merge signature shards written by the workers
  const merged = loadSignatures(SIGFILE);
  let shards = 0;
  for (let i = 0; i < n; i++) {
    const shard = path.join(CACHE, 'sig.' + i + '.json');
    if (!fs.existsSync(shard)) continue;
    try {
      Object.assign(merged, JSON.parse(fs.readFileSync(shard, 'utf8')));
      shards++;
    } catch { /* ignore */ }
    fs.rmSync(shard, { force: true });
  }
  if (shards) { saveSignatures(SIGFILE, merged); log('incremental signatures updated from ' + shards + ' worker shard(s)'); }

  const rendered = stats.reduce((a, s) => a + (s ? s.rendered : 0), 0);
  const reused = stats.reduce((a, s) => a + (s ? s.reused : 0), 0);
  log('all workers finished in ' + (progress.elapsedMs / 1000).toFixed(1) + 's');
  log('frames: ' + rendered + ' rendered, ' + reused + ' reused' +
      (reused > 0 ? '  (incremental — ' + ((reused / Math.max(1, rendered + reused)) * 100).toFixed(0) + '% skipped)' : ''));
  await encode();
  if (opt.clean) {
    fs.rmSync(FRAMES, { recursive: true, force: true });
    log('frame cache purged (--clean)');
  } else {
    log('frame cache kept: ' + (dirSize(FRAMES) / 1073741824).toFixed(2) + ' GB in frames/  (this is what makes re-renders incremental; pass --clean to purge)');
  }
}

// ---------------------------------------------------------------- main
if (ENGINE === 'chrome' && !CHROME) { console.error('No Chrome/Edge found. Pass --chrome=<path> or set CHROME_PATH.'); process.exit(3); }

if (!IS_WORKER && WORKERS > 1 && !opt.contact && !opt.stills && !opt.sheet) {
  await runSupervisor();
} else {
  await runWorker();
}
