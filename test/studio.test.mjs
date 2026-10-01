/**
 * 图形界面（宿主端）功能测试 / Studio backend test.
 *
 * 真的起一个 node:http 服务，把 createStudio().handle 挂上去，然后走一遍：
 * 页面 → 状态 → 工程列表 → 文件预览 → 路径越界 → 真渲染一张联系表。
 * Run:  node test/studio.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../lib/studio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const WORK = path.join(PLUGIN, 'test-workdir');
const ROOT = path.resolve(PLUGIN, '..', '..');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
};

console.log('\n=== dsh-music-code-mv studio test ===\n');

const studio = createStudio({ root: ROOT });
const server = http.createServer((req, res) => { studio.handle(req, res); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = 'http://127.0.0.1:' + port;
console.log('studio listening on ' + base);

const get = async (p, opts) => {
  const r = await fetch(base + p, opts);
  return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() };
};

// ---- 页面 ----
const page = await get('/music-mv/studio');
ok('页面可访问且是 HTML', page.status === 200 && page.type.includes('text/html'),
  page.status + ' ' + page.type);
ok('页面是中文界面且标题简洁', page.text.includes('<title>MV 工坊</title>') && page.text.includes('自检'));
ok('页面吃 DSH 设计令牌（原生观感）', page.text.includes('--dsw-alias-bg-base') && page.text.includes('--dsw-alias-label-primary'));
ok('页面支持深浅色同步', page.text.includes('data-theme') && page.text.includes('dsh-music-code-mv') && page.text.includes('postMessage'));

// ---- 状态 ----
const stateRes = await get('/music-mv/api/state');
const state = JSON.parse(stateRes.text);
ok('状态接口返回工程列表', stateRes.status === 200 && Array.isArray(state.projects), 'projects=' + (state.projects || []).length);
ok('状态接口报告工作区', typeof state.root === 'string' && state.root.length > 0, state.root);
const withContact = state.projects.find((p) => p.contact);
ok('工程记录带联系表信息', !!withContact, withContact ? withContact.path : 'none');
const withVideo = state.projects.find((p) => p.video);
ok('工程记录带成片信息', !!withVideo, withVideo ? withVideo.video.path : 'none');

// ---- 文件预览 ----
if (withContact) {
  const img = await fetch(base + '/music-mv/api/file?path=' + encodeURIComponent(withContact.contact.path));
  const buf = Buffer.from(await img.arrayBuffer());
  ok('联系表可以按字节预览', img.status === 200 && img.headers.get('content-type') === 'image/png' && buf.length > 1000,
    img.status + ' ' + buf.length + ' bytes');
  const range = await fetch(base + '/music-mv/api/file?path=' + encodeURIComponent(withContact.contact.path), { headers: { Range: 'bytes=0-99' } });
  ok('文件预览支持 Range', range.status === 206 && range.headers.get('content-range'),
    range.status + ' ' + (range.headers.get('content-range') || ''));
}
if (withVideo) {
  const head = await fetch(base + '/music-mv/api/file?path=' + encodeURIComponent(withVideo.video.path), { headers: { Range: 'bytes=0-63' } });
  const buf = Buffer.from(await head.arrayBuffer());
  ok('成片可以按 Range 读取（video/mp4）', head.status === 206 && head.headers.get('content-type') === 'video/mp4' && buf.length === 64,
    head.status + ' ' + buf.length + ' bytes');
}

// ---- 文本预览 ----
const board = state.projects.find((p) => p.storyboard);
if (board) {
  const txt = await get('/music-mv/api/text?path=' + encodeURIComponent(board.path + '/storyboard.md'));
  ok('分镜文本可读', txt.status === 200 && txt.text.length > 10, txt.status + ' ' + txt.text.length + ' chars');
}

// ---- 路径越界 ----
const escape = await get('/music-mv/api/file?path=' + encodeURIComponent('../../../../Windows/win.ini'));
ok('越界路径被拒绝', escape.status === 403, escape.status + ' ' + escape.text.slice(0, 80));

// ---- 真实渲染一张联系表 ----
console.log('\n--- 通过界面触发渲染（联系表） ---');
// 放在工作区根下第 2 层，才落在 studio 的扫描深度内 / depth 2 so discovery finds it
const proj = path.join(ROOT, 'test-workdir', 'studio-check');
fs.rmSync(proj, { recursive: true, force: true });
const { spawnSync } = await import('node:child_process');
const init = spawnSync(process.execPath, [path.join(PLUGIN, 'skill', 'scripts', 'init.mjs'), proj, '--force'], { encoding: 'utf8' });
ok('脚手架可用', fs.existsSync(path.join(proj, 'index.html')), init.status === 0 ? 'exit 0' : 'exit ' + init.status);
const rel = path.relative(ROOT, proj).split(path.sep).join('/');

const start = await fetch(base + '/music-mv/api/render', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ project: rel, mode: 'contact', keys: 4, width: 480, height: 270 })
});
const startJson = JSON.parse(await start.text());
ok('渲染请求被接受', start.status === 200 && startJson.ok && startJson.job.status === 'running',
  JSON.stringify(startJson).slice(0, 120));

const busy = await fetch(base + '/music-mv/api/render', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ project: rel, mode: 'contact' })
});
ok('同一时刻只允许一个渲染任务', busy.status === 409, busy.status + ' ' + (await busy.text()).slice(0, 90));

let final = null;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = JSON.parse((await get('/music-mv/api/job')).text);
  final = s.job;
  if (final && final.status !== 'running') break;
}
ok('渲染任务跑完', final && final.status === 'done' && final.exitCode === 0,
  final ? final.status + ' exit=' + final.exitCode + ' log=' + final.log.length : 'no job');
ok('任务日志与进度有内容', final && final.log.length > 0 && final.progress && final.progress.pct === 100,
  final ? 'pct=' + final.progress.pct + ' lines=' + final.log.length : '');
ok('联系表落盘', fs.existsSync(path.join(proj, 'out', 'contact.png')),
  fs.existsSync(path.join(proj, 'out', 'contact.png')) ? Math.round(fs.statSync(path.join(proj, 'out', 'contact.png')).size / 1024) + ' KB' : 'missing');

const after = JSON.parse((await get('/music-mv/api/state')).text);
const found = (after.projects || []).find((p) => p.path === rel);
ok('刷新后能列出新联系表', !!found && !!found.contact, found ? JSON.stringify(found.contact) : 'not found');

// ---- 取消 ----
console.log('\n--- 取消任务 ---');
await fetch(base + '/music-mv/api/render', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ project: rel, mode: 'video', duration: 5, width: 1280, height: 720 })
});
await new Promise((r) => setTimeout(r, 1500));
const cancelRes = JSON.parse((await (await fetch(base + '/music-mv/api/cancel', { method: 'POST' })).text()));
ok('取消接口有响应', cancelRes.ok === true, JSON.stringify(cancelRes));

server.close();
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
