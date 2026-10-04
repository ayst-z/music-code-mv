#!/usr/bin/env node
/**
 * Blender 引擎渲染 + 编码 / render frames through headless Blender, then encode.
 *
 *   node scripts/render-blender.mjs --project=<dir> [--start=0 --end=11]
 *       [--out=out/video.mp4]            # 默认 out/video.mp4（相对工程）
 *       [--script=blender/scene.py]      # 程序化建景路线（帧号反推 t，确定性）
 *       [--blend=blender/scene.blend]    # .blend 直渲路线（-o/-F/-s/-e/-a）
 *       [--blender=<path>]               # 默认自动探测（PATH → 已知安装位）
 *       [--fps=] [--audio=] [--encoder=auto] [--preset=] [--crf=] [--depth=8]
 *       [--force]                        # 忽略签名缓存
 *
 * 帧仍是 t 的纯函数：python 路线用帧号反推 t（t = frame / fps），同一帧号必须
 * 得到同一像素；.blend 路线的确定性由场景自身负责（固定 seed、无墙钟）。
 *
 * 缓存：.cache/signatures-blender.json（按帧存签名）。签名 = 工程基线
 * （尺寸/fps/project.json/src 树）+ **场景目录整树哈希**（.blend、.py 及其依赖
 * 全在内）——改场景文件即整段失效。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createProgress } from './lib/progress.mjs';
import { pickEncoder, buildEncodeArgs, runFfmpeg } from './lib/encode.mjs';
import { createSignature, loadSignatures, saveSignatures, fileHash, treeHash } from './lib/signature.mjs';

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
const log = (...a) => { if (!opt.quiet) console.log('[blender]', ...a); };

const projectDir = path.resolve(opt.project || positional[0] || '.');
if (!fs.existsSync(projectDir)) { console.error('project dir not found: ' + projectDir); process.exit(2); }
const loadJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const proj = loadJson(path.join(projectDir, 'project.json')) || {};

const W = Number(opt.w || proj.width || 1280);
const H = Number(opt.h || proj.height || 720);
const FPS = Number(opt.fps || proj.fps || 24);
const DUR = Number(opt.dur || proj.duration || 10);
const TOTAL = Math.max(1, Math.round(DUR * FPS));
const START = Math.max(0, Number(opt.start || 0));
const END = Math.max(START, Number(opt.end !== undefined ? opt.end : TOTAL - 1));
const COUNT = END - START + 1;
const OUT = path.resolve(projectDir, String(opt.out || 'out/video.mp4'));
const FRAMES = path.join(projectDir, 'frames');
const SIGFILE = path.join(projectDir, '.cache', 'signatures-blender.json');
const SCENE_DIR = path.join(projectDir, 'blender');
const frameName = (n) => 'f' + String(n).padStart(5, '0') + '.png';
const framePath = (n) => path.join(FRAMES, frameName(n));

function findFfmpeg() {
  // 从 scripts/ 逐级向上找 node_modules（与 render.mjs 的 findUpFrom 同思路）
  const ups = [];
  let d = HERE;
  for (let i = 0; i < 8; i++) { ups.push(d); d = path.dirname(d); }
  const cands = [
    opt.ffmpeg, process.env.FFMPEG_PATH,
    ...ups.flatMap(u => [
      path.join(u, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(u, 'node_modules', 'ffmpeg-static', 'ffmpeg')
    ]),
    'ffmpeg'
  ].filter(Boolean);
  for (const c of cands) {
    try { cp.execFileSync(c, ['-hide_banner', '-version'], { stdio: 'ignore' }); return c; } catch { /* next */ }
  }
  console.error('ffmpeg not found (pass --ffmpeg= or install ffmpeg-static)');
  process.exit(3);
}

/** 自动探测 Blender：--blender → BLENDER_PATH → PATH → 已知安装位。 */
function findBlender() {
  const known = [
    'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    '/Applications/Blender.app/Contents/MacOS/Blender',
    '/usr/bin/blender'
  ];
  const cands = [opt.blender, process.env.BLENDER_PATH, 'blender', ...known].filter(Boolean);
  for (const c of cands) {
    try {
      const out = cp.execFileSync(c, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n')[0];
      if (/Blender\s+\d/.test(out)) return { path: c, version: out.trim() };
    } catch { /* next */ }
  }
  return null;
}

// ---------------------------------------------------------------- main
const cp = await import('node:child_process');
const FFMPEG = findFfmpeg();

const scriptPath = opt.script ? path.resolve(projectDir, String(opt.script))
  : (fs.existsSync(path.join(SCENE_DIR, 'scene.py')) ? path.join(SCENE_DIR, 'scene.py') : null);
const blendPath = opt.blend ? path.resolve(projectDir, String(opt.blend))
  : (fs.existsSync(path.join(SCENE_DIR, 'scene.blend')) ? path.join(SCENE_DIR, 'scene.blend') : null);
if (!scriptPath && !blendPath) {
  console.error('no scene found: pass --script=…py or --blend=…blend (or put blender/scene.py | blender/scene.blend in the project)');
  process.exit(2);
}
const bl = findBlender();
if (!bl) {
  console.error('Blender not found. Install from https://www.blender.org/download/ (or winget install BlenderFoundation.Blender),');
  console.error('then re-run, or pass --blender="C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe"');
  process.exit(3);
}
log('blender: ' + bl.version + '  (' + bl.path + ')');
log('scene:   ' + (scriptPath ? 'python ' + path.relative(projectDir, scriptPath) : '') +
  (scriptPath && blendPath ? ' + ' : '') + (blendPath ? 'blend ' + path.relative(projectDir, blendPath) : ''));

// ---- 签名（场景目录整树进哈希：.blend/.py/依赖全在内）----
const sig = createSignature(projectDir, { width: W, height: H, fps: FPS, duration: DUR, engine: 'blender', quality: String(opt.crf || '') });
const baseSig = sig.forGlobal() + '|scene:' +
  (fs.existsSync(SCENE_DIR) ? treeHash(SCENE_DIR) : 'none') +
  '|py:' + fileHash(scriptPath || 'none') + '|blend:' + fileHash(blendPath || 'none');
const store = loadSignatures(SIGFILE);
const isCached = (n) => !opt.force && fs.existsSync(framePath(n)) && store[n] === baseSig;

const missing = [];
for (let n = START; n <= END; n++) if (!isCached(n)) missing.push(n);
log((END - START + 1 - missing.length) + '/' + (END - START + 1) + ' frames cached' +
  (missing.length ? ', rendering ' + missing.length : ''));

// ---- 渲染：把缺失帧并成连续段，每段一次 Blender 调用 ----
if (missing.length) {
  fs.mkdirSync(FRAMES, { recursive: true });
  const runs = [];
  let s = missing[0], prev = missing[0];
  for (let i = 1; i <= missing.length; i++) {
    if (i === missing.length || missing[i] !== prev + 1) { runs.push([s, prev]); s = missing[i]; }
    prev = missing[i];
  }
  const bar = createProgress({ total: missing.length, label: 'blender' });
  let done = 0;
  for (const [rs, re] of runs) {
    const args = scriptPath
      ? ['-b', '--factory-startup', '--python', scriptPath, '--',
         '--out', FRAMES, '--start', String(rs), '--end', String(re),
         '--width', String(W), '--height', String(H), '--fps', String(FPS)]
      : ['-b', blendPath, '-o', path.join(FRAMES, 'f#####').replace(/\\/g, '/'),
         '-F', 'PNG', '-s', String(rs), '-e', String(re), '-a'];
    if (!scriptPath) log('note: .blend route renders at the resolution stored in the .blend');
    await new Promise((resolve, reject) => {
      const child = cp.spawn(bl.path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = [];
      const onData = (d) => {
        const s2 = d.toString();
        tail.push(s2); if (tail.length > 40) tail.shift();
        for (const m of s2.matchAll(/Fra:(\d+)/g)) {
          const f = Number(m[1]);
          if (f >= rs && f <= re) bar.update(Math.min(missing.length, done + (f - rs + 1)));
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) { done += re - rs + 1; bar.update(done); resolve(); }
        else reject(new Error('blender exited ' + code + '\n' + tail.join('').split('\n').slice(-8).join('\n')));
      });
    });
    for (let n = rs; n <= re; n++) store[n] = baseSig;
  }
  bar.done('rendered ' + missing.length + ' frames');
  saveSignatures(SIGFILE, store);
}

// ---- 编码（带进度条：runFfmpeg({totalFrames,label}) 解析 -progress pipe:1）----
const encoder = await pickEncoder(FFMPEG, opt.encoder || 'auto');
const audio = opt.audio ? path.resolve(projectDir, String(opt.audio)) : null;
const args = buildEncodeArgs({
  fps: FPS, startNumber: START, framePattern: path.join(FRAMES, 'f%05d.png'),
  out: OUT, audio, encoder, preset: String(opt.preset || 'medium'), crf: Number(opt.crf || 17),
  depth: opt.depth === undefined ? 8 : Number(opt.depth),
  frames: COUNT,
  audioCodec: opt['audio-codec'], audioBitrate: opt['audio-bitrate']
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await runFfmpeg(FFMPEG, args, { totalFrames: COUNT, label: 'encode' });

const size = fs.statSync(OUT).size;
let probe = '';
try {
  const { execFileSync } = cp;
  try { execFileSync(FFMPEG, ['-i', OUT], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) {
    probe = String(e.stderr || '').split('\n').filter(l => /Duration|Stream #/.test(l)).join('\n');
  }
} catch { /* ignore */ }
log('OK  ' + (size / 1048576).toFixed(2) + ' MB  ' + OUT);
if (probe) console.log(probe.trim());
