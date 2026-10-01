/**
 * 隐私与确定性闸门 / privacy + determinism gate.
 *
 * 这是给「不定期更新渲染内核和色彩风格」用的：每改一次 skill 或预设就跑它。
 * 它只做静态与契约检查，不联网、不渲染，秒级。
 * Run:  node test/privacy.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const SKILL = path.join(PLUGIN, 'skill');
const PRESETS = path.join(SKILL, 'presets');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
};

console.log('');
console.log('=== dsh-music-code-mv privacy + determinism gate ===');

const SKIP = new Set(['node_modules', '.git', 'test-workdir', '.cache', 'out', 'frames', 'dist']);
function collect(dir, filter, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, filter, out);
    else if (filter(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => p.slice(PLUGIN.length + 1).split(path.sep).join('/');

/** 去掉注释，避免把「不要用 Math.random」这类说明当成违规。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '/' && n === '/') {
      const end = src.indexOf(String.fromCharCode(10), i);
      i = end < 0 ? src.length : end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const hits = (files, re, code) => {
  const found = [];
  for (const f of files) {
    let text = fs.readFileSync(f, 'utf8');
    if (code) text = stripComments(text);
    const lines = text.split(String.fromCharCode(10));
    lines.forEach((l, i) => { re.lastIndex = 0; if (re.test(l)) found.push(rel(f) + ':' + (i + 1) + '  ' + l.trim().slice(0, 110)); });
  }
  return found;
};

// ---- 1. 运行时代码里不许有出网调用 ----
const RUNTIME = [
  path.join(PLUGIN, 'index.js'),
  ...collect(path.join(PLUGIN, 'lib'), (n) => /\.(js|html)$/.test(n)),
  ...collect(path.join(SKILL, 'scripts'), (n) => /\.(js|mjs)$/.test(n)),
  ...collect(path.join(SKILL, 'template'), (n) => /\.(js|html)$/.test(n))
];
console.log('\n--- 出网调用 / outbound calls ---');
const externalUrl = hits(RUNTIME, /https?:\/\/(?!127\.0\.0\.1|localhost)[^\s"'<>)\]]+/g, true);
ok('运行时代码里没有外部 URL', externalUrl.length === 0, externalUrl.join(' | ') || 'none');

const beacons = hits(RUNTIME, /\b(XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.geolocation)\b/g, true);
ok('没有遥测/信标类 API', beacons.length === 0, beacons.join(' | ') || 'none');

// 只认真正的 SDK 名；「telemetry」这种词在这套代码里是画在屏幕上的标签
const trackers = hits(RUNTIME, /\b(mixpanel|sentry|amplitude|posthog|google-analytics|gtag)\b/gi, true);
ok('没有埋点字样', trackers.length === 0, trackers.join(' | ') || 'none');

// 相对/同源 fetch 是允许的：模板读 project.json、界面读自己的 /music-mv/api
const fetchCalls = hits(RUNTIME, /\bfetch\s*\(/g, true);
ok('fetch 只出现在同源/相对场景（人工确认清单很短）', fetchCalls.length <= 12, fetchCalls.length + ' call sites');

// ---- 2. 任何文件都不许带个人路径与密钥 ----
const ALL = collect(PLUGIN, (n) => /\.(js|mjs|json|md|html|yml|txt)$/.test(n));
console.log('\n--- 个人路径与密钥 / personal paths and secrets ---');
const personal = hits(ALL, /C:\\Users\\[^\\\s"']+|\/Users\/[A-Za-z0-9_.-]+/g);
ok('仓库里没有个人绝对路径', personal.length === 0, personal.join(' | ') || 'none');
const secrets = hits(ALL, /\b(sk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]\s*['"][^'"]{8,})/gi);
ok('仓库里没有密钥', secrets.length === 0, secrets.join(' | ') || 'none');

// ---- 3. 渲染内核的确定性 ----
console.log('\n--- 渲染确定性 / determinism ---');
const SCENES = collect(path.join(SKILL, 'template', 'src'), (n) => /\.js$/.test(n));
const wallClock = hits(SCENES, /\b(Date\.now|performance\.now|requestAnimationFrame)\s*\(/g, true);
ok('模板场景代码不读墙钟', wallClock.length === 0, wallClock.join(' | ') || 'none');
const rand = hits(SCENES, /\bMath\.random\s*\(/g, true);
ok('模板场景代码不用 Math.random', rand.length === 0, rand.join(' | ') || 'none');

const scenesIndex = fs.existsSync(path.join(SKILL, 'template', 'src', 'scenes', 'index.js'))
  ? fs.readFileSync(path.join(SKILL, 'template', 'src', 'scenes', 'index.js'), 'utf8') : '';
ok('场景注册表存在且按数组顺序绘制', /export default \[/.test(scenesIndex));

// ---- 4. 工作室的隐私契约 ----
console.log('\n--- 工作室隐私契约 / studio contract ---');
const studioJs = fs.readFileSync(path.join(PLUGIN, 'lib', 'studio.js'), 'utf8');
ok('没有通配 CORS', !/access-control-allow-origin/i.test(studioJs));
ok('校验回环来源', /isLoopback/.test(studioJs) && /remoteAddress/.test(studioJs));
ok('校验 Sec-Fetch-Site', /sec-fetch-site/.test(studioJs));
ok('要求 x-music-mv 请求头', /STUDIO_HEADER/.test(studioJs) && /hasStudioHeader/.test(studioJs));
ok('只读工程目录内的文件', /insideProject/.test(studioJs) && /visiblePath/.test(studioJs));

const page = fs.readFileSync(path.join(PLUGIN, 'lib', 'studio.html'), 'utf8');
ok('界面所有 /api 调用都带头', (page.match(/apiFetch\(/g) || []).length >= 6 && /'x-music-mv': 'studio'/.test(page));
ok('界面只认同源父窗口消息', /ev\.origin !== window\.location\.origin/.test(page));
const client = fs.readFileSync(path.join(PLUGIN, 'lib', 'client.js'), 'utf8');
ok('postMessage 不使用通配目标', /postMessage\([^)]*origin\s*\)/.test(client) && !/postMessage\([^)]*,\s*'\*'\s*\)/.test(client));

// ---- 5. DeepSeek 配色 ----
console.log('\n--- DeepSeek 配色 / palette ---');
ok('界面用 DSH 业务主色令牌', /--dsw-alias-state-business-primary/.test(page) && /--dsw-static-deepseek-500/.test(page));
ok('兜底色是 DeepSeek 蓝', /#4176e6/.test(page) && /#7aaaff/.test(page));
ok('客户端转发 DeepSeek 静态色令牌',
  /--dsw-static-deepseek-500/.test(client) && /--dsw-alias-state-business-primary/.test(client));

// ---- 6. 预设仍然可用 ----
console.log('\n--- 预设 / presets ---');
const files = fs.existsSync(PRESETS) ? fs.readdirSync(PRESETS).filter((n) => n.endsWith('.json')).sort() : [];
ok('四个预设都在', files.length >= 4, files.join(', '));
const NEED = ['bg', 'dim', 'base', 'accent', 'hot', 'text'];
for (const name of files) {
  const p = JSON.parse(fs.readFileSync(path.join(PRESETS, name), 'utf8'));
  const paletteKeys = NEED.every((k) => typeof (p.palette || {})[k] === 'string');
  const shots = Array.isArray(p.storyboard && p.storyboard.shots) && p.storyboard.shots.length >= 4;
  const shotsValid = shots && p.storyboard.shots.every((s) => s.start < s.end && s.what && s.style);
  const cues = Array.isArray(p.lyrics) && p.lyrics.filter((l) => /^\[\d+:\d+(\.\d+)?\]/.test(l)).length >= 3;
  const fxOk = p.fx && typeof p.fx === 'object' && typeof p.fx.bloom === 'boolean';
  ok('预设可用: ' + p.id, paletteKeys && shotsValid && cues && fxOk && Number(p.duration) > 0,
    'palette=' + paletteKeys + ' shots=' + shotsValid + ' lyrics=' + cues + ' fx=' + !!fxOk);
}

console.log('');
console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
console.log('');
process.exit(fail === 0 ? 0 : 1);
