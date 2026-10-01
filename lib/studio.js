/**
 * dsh-music-code-mv — 图形界面（宿主端） / Studio backend (host half).
 *
 * 为一支 MV 工程提供一个小型 HTTP 后台服务，挂在 DSH 自带的 webServer 上：
 *   GET  /music-mv/studio          中文图形界面（内嵌右侧边栏 / 亦可独立打开）
 *   GET  /music-mv/api/state       工作区、工程列表、当前任务
 *   POST /music-mv/api/probe       跑一次环境自检
 *   POST /music-mv/api/render      开始渲染（联系表 / 静帧 / 视频）
 *   POST /music-mv/api/cancel      取消当前任务
 *   GET  /music-mv/api/job         当前任务快照
 *   GET  /music-mv/api/file?path=  预览联系表 PNG / 成片 MP4（支持 Range）
 *   GET  /music-mv/api/text?path=  读取 storyboard.md / lyrics.lrc 等文本
 *
 * 没有 webServer（例如纯 base profile）时整个模块不会被激活，六个工具照常工作。
 * Every path is resolved inside the configured workspace root; `..` escapes are rejected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PLUGIN_ROOT, SCRIPTS_DIR } from './runner.js';

export const STUDIO_PREFIX = '/music-mv';
export const STUDIO_PAGE = STUDIO_PREFIX + '/studio';

/** 扫描工程时跳过的目录 / directories never worth descending into. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'frames', 'dist', '.dsh', '.idea', '.vscode']);

const TEXT_EXT = new Set(['.md', '.txt', '.json', '.lrc', '.mjs', '.js', '.html', '.css']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.lrc': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

/** 按 CR?LF 切行（不写反斜杠转义，避免模板/传输层吃掉它们）。 */
const CHUNK_SPLIT = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10));

/**
 * 隐私边界 / privacy boundary
 *
 * 工作室是回环服务：不发任何 ACAO，跨站请求一律拒绝。
 * 通配 CORS 会让用户随手打开的一个网页就能读走工作区文件——这正是要避免的。
 * The studio is a loopback service: no ACAO at all, cross-site requests refused.
 */

/** 只服务回环地址；DSH 若被绑定到 0.0.0.0，这里也不会跟着暴露。 */
export function isLoopback(req) {
  const addr = String((req.socket && (req.socket.remoteAddress || '')) || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/** 顶层导航与同源 iframe 放行；跨站一律拒。 */
export function siteAllowed(req) {
  const site = String((req.headers && req.headers['sec-fetch-site']) || '');
  if (site === '') return true; // 老浏览器与非浏览器客户端由回环 + 自定义头兜住
  return site === 'same-origin' || site === 'none';
}

/** 所有 /api 请求都要带这个头：跨域必须预检，而预检永远拿不到许可。 */
export const STUDIO_HEADER = 'x-music-mv';
export function hasStudioHeader(req) {
  return String((req.headers && req.headers[STUDIO_HEADER]) || '') === 'studio';
}

/** 每个响应都带的兜底头：不许别的源拿去用，也不许猜类型。 */
const SAFE_HEADERS = {
  'cross-origin-resource-policy': 'same-origin',
  'x-content-type-options': 'nosniff'
};

function json(res, code, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(code, {
    ...SAFE_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function fail(res, code, message) {
  json(res, code, { ok: false, error: message });
}

/** 读取请求体（上限 1 MiB）/ read a bounded JSON body. */
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大 / body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求体不是合法 JSON / body is not JSON')); }
    });
    req.on('error', reject);
  });
}

/** 把用户给的相对路径解析到 root 内，越界一律拒绝。 */
function safeResolve(root, rel) {
  if (typeof rel !== 'string' || rel === '') return null;
  if (path.isAbsolute(rel)) {
    const abs = path.resolve(rel);
    return isInside(root, abs) ? abs : null;
  }
  const abs = path.resolve(root, rel);
  return isInside(root, abs) ? abs : null;
}

function isInside(root, abs) {
  const rel = path.relative(path.resolve(root), abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 相对路径里不允许出现隐藏段（.env、.git 之类）。 */
function visiblePath(rel) {
  const norm = String(rel).split(path.sep).join('/');
  return !norm.split('/').some((s) => s.length > 1 && s.startsWith('.'));
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function statOrNull(file) {
  try { return fs.statSync(file); } catch { return null; }
}

/** 工程扫描：root 下最多 3 层，找到带 project.json 的目录 / bounded project discovery. */
export function findProjects(root, maxDepth = 3) {
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const hasManifest = fs.existsSync(path.join(dir, 'project.json'));
    const hasIndex = fs.existsSync(path.join(dir, 'index.html'));
    if (hasManifest && hasIndex) {
      out.push(dir);
      return; // 一个目录同时是一个工程时，不再往下找嵌套工程
    }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  out.sort();
  return out;
}

/** 单个工程的展示信息 / display record for one project. */
export function describeProject(root, dir) {
  const rel = path.relative(root, dir).split(path.sep).join('/') || '.';
  const manifest = readJson(path.join(dir, 'project.json')) || {};
  const outDir = path.join(dir, 'out');
  let video = null;
  const outStat = statOrNull(outDir);
  if (outStat && outStat.isDirectory()) {
    let newest = null;
    for (const name of fs.readdirSync(outDir)) {
      if (!/\.(mp4|mov|webm)$/i.test(name)) continue;
      const st = statOrNull(path.join(outDir, name));
      if (!st) continue;
      if (!newest || st.mtimeMs > newest.mtimeMs) {
        newest = { name, st };
      }
    }
    if (newest) video = { path: rel + '/out/' + newest.name, bytes: newest.st.size, mtime: newest.st.mtimeMs };
  }
  const contactFile = path.join(outDir, 'contact.png');
  const contactStat = statOrNull(contactFile);
  let frames = 0;
  const framesDir = path.join(dir, 'frames');
  try {
    for (const n of fs.readdirSync(framesDir)) if (/\.(jpe?g|png)$/i.test(n)) frames++;
  } catch { /* no frames yet */ }
  const lyricsFile = manifest.lyrics ? path.join(dir, String(manifest.lyrics)) : path.join(dir, 'lyrics.lrc');
  const scenesDir = path.join(dir, 'src', 'scenes');
  let scenes = 0;
  try { scenes = fs.readdirSync(scenesDir).filter((n) => n.endsWith('.js')).length; } catch { /* default template only */ }
  return {
    name: path.basename(dir),
    path: rel,
    width: Number(manifest.width) || null,
    height: Number(manifest.height) || null,
    fps: Number(manifest.fps) || null,
    duration: Number(manifest.duration) || null,
    scenes,
    frames,
    storyboard: fs.existsSync(path.join(dir, 'storyboard.md')),
    lyrics: fs.existsSync(lyricsFile),
    lyricsPath: fs.existsSync(lyricsFile) ? path.relative(root, lyricsFile).split(path.sep).join('/') : null,
    contact: contactStat ? { path: rel + '/out/contact.png', bytes: contactStat.size, mtime: contactStat.mtimeMs } : null,
    video,
    index: fs.existsSync(path.join(dir, 'index.html'))
  };
}

/** 进度行解析：[render] [████░░] 42.0%  42/100 ... / parse the CLI progress bar. */
function parseProgress(text) {
  const pct = /(\d+(?:\.\d+)?)%/.exec(text);
  const frac = /(\d+)\/(\d+)/.exec(text);
  if (!pct && !frac) return null;
  const done = frac ? Number(frac[1]) : null;
  const total = frac ? Number(frac[2]) : null;
  return {
    pct: pct ? Number(pct[1]) : (total ? Math.round((done / total) * 1000) / 10 : null),
    done, total
  };
}

/**
 * 工作室：工程发现 + 渲染任务 + HTTP 路由。
 * One studio instance per plugin activation; it owns at most one render job.
 */
export function createStudio(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const pageFile = path.join(PLUGIN_ROOT, 'lib', 'studio.html');
  const state = {
    root,
    job: null,
    env: null,
    envAt: null,
    mounted: false,
    url: null
  };
  let child = null;
  let seq = 0;

  const snapshot = () => ({
    ok: true,
    root,
    url: state.url,
    job: state.job ? {
      id: state.job.id,
      project: state.job.project,
      mode: state.job.mode,
      status: state.job.status,
      startedAt: state.job.startedAt,
      finishedAt: state.job.finishedAt,
      exitCode: state.job.exitCode,
      progress: state.job.progress,
      log: state.job.log.slice(-80)
    } : null,
    env: state.env,
    envAt: state.envAt
  });

  const listProjects = () => findProjects(root).map((dir) => describeProject(root, dir));

  let projectCache = { at: 0, list: [] };
  function scopedProjects() {
    const now = Date.now();
    if (now - projectCache.at > 2000) projectCache = { at: now, list: findProjects(root) };
    return projectCache.list;
  }

  /** 只允许预览已发现工程目录内的文件 / artifacts must live inside a discovered project. */
  function insideProject(abs) {
    for (const dir of scopedProjects()) {
      if (abs === dir || abs.startsWith(dir + path.sep)) return true;
    }
    return false;
  }

  function pushLog(job, line) {
    if (!line) return;
    job.log.push(line);
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
    const p = parseProgress(line);
    if (p) job.progress = p;
  }

  /** 开始一个渲染任务；同一时刻只允许一个。 */
  function startRender(body) {
    if (child) {
      const err = new Error('已经有一个渲染任务在跑 / a render job is already running');
      err.busy = true;
      throw err;
    }
    const dir = safeResolve(root, body.project || body.projectDir);
    if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) {
      throw new Error('工程不存在或缺少 index.html / project not found: ' + String(body.project || ''));
    }
    const mode = String(body.mode || 'contact');
    if (!['contact', 'stills', 'video', 'sheet'].includes(mode)) {
      throw new Error('未知模式 / unknown mode: ' + mode);
    }
    const argv = ['--project=' + dir, '--format=' + String(body.format || 'jpeg')];
    if (mode === 'contact') argv.push('--contact');
    else if (mode === 'sheet') argv.push('--sheet');
    else if (mode === 'stills') argv.push('--stills=' + String(body.stills || '0'));
    else argv.push('--out=' + String(body.out || 'out/video.mp4'));
    if (mode === 'contact' || mode === 'sheet') argv.push('--out=' + String(body.out || 'out/contact.png'));
    for (const [key, flag] of [['width', 'w'], ['height', 'h'], ['fps', 'fps'], ['duration', 'dur'], ['keys', 'keys'], ['workers', 'workers'], ['quality', 'quality'], ['depth', 'depth']]) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== '') argv.push('--' + flag + '=' + Number(body[key]));
    }
    if (body.audio) argv.push('--audio=' + String(body.audio));
    if (body.gl) argv.push('--gl=' + String(body.gl));
    if (body.force) argv.push('--force');

    const job = {
      id: 'job-' + (++seq),
      project: path.relative(root, dir).split(path.sep).join('/'),
      mode,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      progress: { pct: 0, done: 0, total: null },
      log: []
    };
    state.job = job;
    pushLog(job, '[studio] ' + path.basename(process.execPath) + ' ' + path.join('skill', 'scripts', 'render.mjs') + ' ' + argv.join(' '));
    child = spawn(process.execPath, [path.join(SCRIPTS_DIR, 'render.mjs'), ...argv], {
      cwd: dir,
      windowsHide: true,
      env: { ...process.env }
    });
    const onData = (buf) => {
      for (const line of buf.toString('utf8').split(CHUNK_SPLIT)) {
        const text = line.trim();
        if (text) pushLog(job, text);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => {
      pushLog(job, '[studio] spawn error: ' + (e && e.message ? e.message : e));
      job.status = 'error';
      job.finishedAt = Date.now();
      child = null;
    });
    child.on('close', (code) => {
      job.exitCode = code === null ? -1 : code;
      job.status = code === 0 ? 'done' : (job.status === 'cancelled' ? 'cancelled' : 'error');
      job.finishedAt = Date.now();
      if (job.status === 'done') job.progress = { ...job.progress, pct: 100, done: job.progress.total ?? job.progress.done };
      child = null;
    });
    return job;
  }

  function cancelRender() {
    if (!child) return false;
    const job = state.job;
    if (job) { job.status = 'cancelled'; pushLog(job, '[studio] 取消 / cancel requested'); }
    const pid = child.pid;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch { /* 进程可能已经自行退出 / already gone */ }
    return true;
  }

  /** 跑一次 probe.mjs，结果缓存给界面。 */
  async function runProbe(force = false) {
    if (state.env && !force) return state.env;
    const script = path.join(SCRIPTS_DIR, 'probe.mjs');
    const result = await new Promise((resolve) => {
      const p = spawn(process.execPath, [script, root], { windowsHide: true });
      let out = '';
      p.stdout.on('data', (d) => { out += d.toString(); });
      p.stderr.on('data', (d) => { out += d.toString(); });
      p.on('error', (e) => resolve({ code: -1, text: String(e && e.message || e) }));
      p.on('close', (code) => resolve({ code: code === null ? -1 : code, text: out }));
    });
    state.env = { ready: /READY/.test(result.text) && !/NOT READY/.test(result.text), exit: result.code, text: result.text.trim() };
    state.envAt = Date.now();
    return state.env;
  }

  function sendFile(req, res, abs, download) {
    const st = statOrNull(abs);
    if (!st || !st.isFile()) { fail(res, 404, '文件不存在 / not found: ' + path.basename(abs)); return; }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const headers = {
      ...SAFE_HEADERS,
      'content-type': type,
      'cache-control': 'no-store',
      'accept-ranges': 'bytes'
    };
    if (download) headers['content-disposition'] = 'attachment; filename="' + path.basename(abs).replace(/"/g, '') + '"';
    const range = req.headers && req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (m) {
        let start = m[1] === '' ? null : Number(m[1]);
        let end = m[2] === '' ? null : Number(m[2]);
        if (start === null && end !== null) { start = Math.max(0, st.size - end); end = st.size - 1; }
        if (start !== null && end === null) end = st.size - 1;
        if (start === null || end === null || start > end || start >= st.size) {
          res.writeHead(416, { 'content-range': 'bytes */' + st.size });
          res.end();
          return;
        }
        end = Math.min(end, st.size - 1);
        res.writeHead(206, { ...headers, 'content-range': 'bytes ' + start + '-' + end + '/' + st.size, 'content-length': String(end - start + 1) });
        fs.createReadStream(abs, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, { ...headers, 'content-length': String(st.size) });
    fs.createReadStream(abs).pipe(res);
  }

  function sendPage(res) {
    let html;
    try { html = fs.readFileSync(pageFile, 'utf8'); }
    catch (e) { fail(res, 500, '缺少界面文件 lib/studio.html / missing studio page: ' + (e && e.message || e)); return; }
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      ...SAFE_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store'
    });
    res.end(body);
  }

  /** 路由入口：/music-mv 下的所有请求。 */
  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { fail(res, 400, 'bad url'); return; }
    const p = url.pathname;
    try {
      if (!isLoopback(req)) { fail(res, 403, '只允许本机访问 / loopback only'); return; }
      if (!siteAllowed(req)) { fail(res, 403, '跨站请求已被拒绝 / cross-site request refused'); return; }
      if (p.startsWith(STUDIO_PREFIX + '/api/')) {
        if (req.method === 'OPTIONS') { fail(res, 405, '不提供跨域预检 / no CORS preflight'); return; }
        // <img>/<video> 不会带自定义头，所以 /api/file 靠回环 + Sec-Fetch-Site +
        // Cross-Origin-Resource-Policy 兜住；浏览器读不到它的字节，别的源也用不了它。
        const isMedia = p === STUDIO_PREFIX + '/api/file' && req.method === 'GET';
        if (!isMedia && !hasStudioHeader(req)) {
          fail(res, 403, '缺少 ' + STUDIO_HEADER + ': studio 请求头 / missing studio header');
          return;
        }
      }
      if (p === STUDIO_PREFIX || p === STUDIO_PAGE || p === STUDIO_PREFIX + '/') { sendPage(res); return; }
      if (p === STUDIO_PREFIX + '/api/state') {
        json(res, 200, { ...snapshot(), projects: listProjects() });
        return;
      }
      if (p === STUDIO_PREFIX + '/api/projects') { json(res, 200, { ok: true, root, projects: listProjects() }); return; }
      if (p === STUDIO_PREFIX + '/api/probe') {
        const env = await runProbe(true);
        json(res, 200, { ok: true, env, envAt: state.envAt });
        return;
      }
      if (p === STUDIO_PREFIX + '/api/render') {
        if (req.method !== 'POST') { fail(res, 405, 'POST only'); return; }
        const body = await readBody(req);
        const job = startRender(body);
        json(res, 200, { ok: true, job: { id: job.id, project: job.project, mode: job.mode, status: job.status } });
        return;
      }
      if (p === STUDIO_PREFIX + '/api/cancel') {
        json(res, 200, { ok: true, cancelled: cancelRender() });
        return;
      }
      if (p === STUDIO_PREFIX + '/api/job') { json(res, 200, snapshot()); return; }
      if (p === STUDIO_PREFIX + '/api/file' || p === STUDIO_PREFIX + '/api/text') {
        const rel = String(url.searchParams.get('path') || '');
        const abs = safeResolve(root, rel);
        if (!abs) { fail(res, 403, '路径越界或为空 / path outside the workspace: ' + rel); return; }
        if (!visiblePath(rel)) { fail(res, 403, '不提供隐藏文件 / hidden files are not served: ' + rel); return; }
        if (!insideProject(abs)) { fail(res, 403, '只允许读工程目录内的文件 / only files inside a discovered project: ' + rel); return; }
        if (p.endsWith('/text')) {
          const st = statOrNull(abs);
          if (!st || !st.isFile()) { fail(res, 404, '文件不存在 / not found'); return; }
          if (st.size > 2 * 1024 * 1024) { fail(res, 413, '文本过大 / file too large'); return; }
          const ext = path.extname(abs).toLowerCase();
          if (!TEXT_EXT.has(ext)) { fail(res, 415, '不是可预览文本 / not previewable text'); return; }
          res.writeHead(200, { ...SAFE_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
          res.end(fs.readFileSync(abs));
          return;
        }
        sendFile(req, res, abs, url.searchParams.get('download') === '1');
        return;
      }
      fail(res, 404, '未知的界面接口 / unknown studio endpoint: ' + p);
    } catch (e) {
      fail(res, e && e.busy ? 409 : 500, (e && e.message) ? e.message : String(e));
    }
  }

  return {
    state,
    root,
    handle,
    snapshot,
    listProjects,
    startRender,
    cancelRender,
    runProbe,
    /** 挂到 ctx.webServer 上；返回 disposer。 */
    register(webServer) {
      const dispose = webServer.register({ kind: 'prefix', path: STUDIO_PREFIX, handler: handle });
      state.mounted = true;
      const port = webServer.port;
      state.url = 'http://127.0.0.1:' + String(port) + STUDIO_PAGE;
      return () => { try { dispose(); } finally { state.mounted = false; state.url = null; cancelRender(); } };
    }
  };
}
