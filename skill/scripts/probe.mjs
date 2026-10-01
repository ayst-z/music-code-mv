#!/usr/bin/env node
/** music-code-mv environment probe — prints toolchain paths and a READY verdict. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argDir = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = path.resolve(argDir || process.cwd());

const rows = [];
const add = (ok, name, detail) => rows.push({ ok, name, detail });

add(true, 'node', process.version);

const chromeCands = [
  process.env.CHROME_PATH, process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const chrome = chromeCands.find(c => c && fs.existsSync(c));
add(!!chrome, 'chrome', chrome || 'NOT FOUND — install Chrome/Edge or set CHROME_PATH');

function findUp(start, rel) {
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

const ffRel = [
  'node_modules/ffmpeg-static/ffmpeg.exe', 'node_modules/ffmpeg-static/ffmpeg',
  'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe',
  'node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
  'node_modules/@ffmpeg-installer/darwin-x64/ffmpeg'
];
let ffmpeg = process.env.FFMPEG_PATH || null;
for (const rel of ffRel) { if (ffmpeg) break; ffmpeg = findUp(projectDir, rel); }
add(!!ffmpeg, 'ffmpeg', ffmpeg || 'NOT FOUND — npm install ffmpeg-static (allow its install script), or @ffmpeg-installer/ffmpeg');

const nm = findUp(projectDir, 'node_modules');
add(!!nm, 'node_modules', nm || 'NOT FOUND — npm install three puppeteer-core ffmpeg-static');

function resolveDep(name, fromDir) {
  for (const base of [fromDir, HERE]) {
    try {
      return createRequire(path.join(base, 'noop.js')).resolve(name);
    } catch { /* next */ }
  }
  return null;
}

let puppeteerOk = false, puppeteerMod = null;
const ppPath = resolveDep('puppeteer-core', projectDir);
if (ppPath) {
  try { puppeteerMod = (await import(pathToFileURL(ppPath).href)).default; puppeteerOk = !!puppeteerMod; }
  catch { puppeteerOk = false; }
}
add(puppeteerOk, 'puppeteer-core', puppeteerOk ? ppPath : 'NOT importable — npm install puppeteer-core');

const threePath = resolveDep('three', projectDir);
let threeOk = false;
try { threeOk = !!(threePath && fs.existsSync(path.join(path.dirname(threePath), '..', 'build', 'three.module.js'))); } catch { threeOk = false; }
const threeFile = nm ? path.join(nm, 'three', 'build', 'three.module.js') : null;
threeOk = !!(threeFile && fs.existsSync(threeFile));
add(threeOk, 'three (optional)', threeOk ? threeFile : 'not installed — only needed for 3D shots');

// live headless-WebGL check
let webgl = 'skipped (chrome or puppeteer missing)';
if (chrome && puppeteerOk) {
  let b = null;
  try {
    b = await puppeteerMod.launch({
      executablePath: chrome, headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader',
        '--use-gl=angle', '--use-angle=swiftshader']
    });
    const p = await b.newPage();
    await p.setContent('<canvas id="c" width="64" height="64"></canvas>');
    webgl = await p.evaluate(() => {
      const c = document.getElementById('c');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'NO WEBGL CONTEXT';
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.VERSION);
    });
  } catch (e) {
    webgl = 'FAILED: ' + (e && e.message ? e.message : e);
  } finally {
    // a throw between launch and close used to leak the headless Chrome process
    if (b) await b.close().catch(() => {});
  }
}
add(!/FAILED|NO WEBGL/.test(webgl) && webgl !== 'skipped (chrome or puppeteer missing)', 'webgl (live test)', webgl);

let w = 0;
for (const r of rows) w = Math.max(w, r.name.length);
console.log('');
for (const r of rows) console.log((r.ok ? '  OK   ' : '  MISS ') + r.name.padEnd(w + 2) + r.detail);
const bad = rows.filter(r => !r.ok);
console.log('');
console.log(bad.length === 0
  ? 'READY — music-code-mv can render.'
  : 'NOT READY — ' + bad.length + ' item(s) missing: ' + bad.map(b => b.name).join(', '));
process.exit(bad.length === 0 ? 0 : 1);
