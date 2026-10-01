/**
 * Functional test for the dsh-music-code-mv plugin.
 *
 * Loads the plugin with a mock Cordis context, verifies the registered tools
 * match the documented defineTool contract, then actually executes them:
 * probe -> init -> contact sheet. Run with:  node test/plugin.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const WORK = path.join(PLUGIN, 'test-workdir');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
};

console.log('\n=== dsh-music-code-mv plugin test ===\n');

// ---- load the plugin exactly as Cordis would ----
const mod = await import(pathToFileURL(path.join(PLUGIN, 'index.js')).href);

ok('plugin exports a name', typeof mod.name === 'string' && mod.name.length > 0, 'name=' + mod.name);
ok('plugin declares inject', Array.isArray(mod.inject) && mod.inject.includes('tools'), 'inject=' + JSON.stringify(mod.inject));
ok('plugin exports apply()', typeof mod.apply === 'function');
ok('plugin exports a Config schema', !!mod.Config && mod.Config.type === 'object',
  'type=' + (mod.Config && mod.Config.type));

// schemastery 3.x instances carry no .resolve(); walk the serialized schema
// graph (refs/meta.default/dict) the same way a host resolves config defaults
function resolveDefaults(schema) {
  const j = JSON.parse(JSON.stringify(schema));
  const refs = j.refs || {};
  const walk = (id) => {
    const n = refs[String(id)];
    if (!n) return undefined;
    // object nodes carry meta.default={} themselves; the dict must win, with
    // meta.default only seeding keys the dict does not override
    if (n.type === 'object' && n.dict) {
      const out = (n.meta && n.meta.default && typeof n.meta.default === 'object')
        ? { ...n.meta.default } : {};
      for (const [k, rid] of Object.entries(n.dict)) {
        const v = walk(rid);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    if (n.meta && Object.prototype.hasOwnProperty.call(n.meta, 'default')) return n.meta.default;
    return undefined;
  };
  return walk(j.uid) || {};
}
const config = resolveDefaults(mod.Config);
ok('Config defaults resolve', config.frameFormat === 'jpeg' && config.projectsDir === 'mv',
  JSON.stringify(config));

// ---- mock ctx: capture what the plugin registers ----
const registered = [];
const ctx = { tools: { register: (t) => registered.push(t) } };
mod.apply(ctx, config);

const names = registered.map(t => t.name).sort();
ok('registers 7 tools（含图形界面入口）', registered.length === 7, names.join(', '));

const byName = Object.fromEntries(registered.map(t => [t.name, t]));
for (const n of ['music_mv_guide', 'music_mv_probe', 'music_mv_init', 'music_mv_render']) {
  const t = byName[n];
  ok('tool contract: ' + n,
    !!t && typeof t.description === 'string' && t.description.length > 20 &&
    !!t.parameters && typeof t.execute === 'function' &&
    !!t.output && typeof t.output.render === 'function' && !!t.output.schema,
    t ? 'params: ' + Object.keys(t.parameters).join(',') : 'MISSING');
}

for (const n of ['music_mv_lyrics', 'music_mv_diff', 'music_mv_studio']) {
  const t = byName[n];
  ok('tool contract: ' + n,
    !!t && typeof t.description === 'string' && t.description.length > 20 &&
    !!t.parameters && typeof t.execute === 'function' &&
    !!t.output && typeof t.output.render === 'function' && !!t.output.schema,
    t ? 'params: ' + Object.keys(t.parameters).join(',') : 'MISSING');
}

// ---- execute the tools for real ----
console.log('\n--- music_mv_guide ---');
const guide = await byName.music_mv_guide.execute({ topic: 'skill' });
ok('guide returns the skill document', typeof guide === 'string' && guide.includes('music-code-mv') && guide.length > 1000,
  guide.length + ' chars');

console.log('\n--- music_mv_probe ---');
const probe = await byName.music_mv_probe.execute({ projectDir: PLUGIN });
ok('probe reports a verdict', /READY|NOT READY/.test(probe), probe.split('\n').filter(l => /READY/.test(l))[0] || '');

console.log('\n--- music_mv_init ---');
fs.rmSync(WORK, { recursive: true, force: true });
const initOut = await byName.music_mv_init.execute({ dir: path.join(WORK, 'mv-test'), force: true });
ok('init scaffolds a project', fs.existsSync(path.join(WORK, 'mv-test', 'index.html')) &&
  fs.existsSync(path.join(WORK, 'mv-test', 'src', 'scenes', 'index.js')));

console.log('\n--- music_mv_render (contact) ---');
const renderOut = await byName.music_mv_render.execute({
  projectDir: path.join(WORK, 'mv-test'), mode: 'contact', keys: 4, width: 480, height: 270
});
const sheet = path.join(WORK, 'mv-test', 'out', 'contact.png');
ok('contact render produced a sheet', fs.existsSync(sheet) && fs.statSync(sheet).size > 1000,
  fs.existsSync(sheet) ? Math.round(fs.statSync(sheet).size / 1024) + ' KB' : 'missing');

console.log('\n--- error handling ---');
const bad = await byName.music_mv_render.execute({ projectDir: path.join(WORK, 'nope'), mode: 'contact' });
ok('render refuses a project with no index.html', typeof bad.text === 'string' && bad.text.includes('No index.html'));
ok('渲染返回 {text, attachment}（图片块可选）',
  typeof bad.text === 'string' && byName.music_mv_render.output.schema.properties.attachment !== undefined &&
  typeof byName.music_mv_render.output.schema.properties.attachment.additionalProperties === 'boolean');
ok('render 输出渲染成块', Array.isArray(byName.music_mv_render.output.render({}, bad)) &&
  byName.music_mv_render.output.render({}, bad)[0].type === 'text');
const badTopic = await byName.music_mv_guide.execute({ topic: 'nonsense' });
ok('guide rejects an unknown topic', typeof badTopic === 'string' && badTopic.includes('Unknown topic'));

// ---- 中文优先 / zh-first ----
console.log('\n--- 中文（zh-first）---');
const cjk = new RegExp('[\\u4e00-\\u9fff]');
ok('工具描述是中文优先', registered.every(t => cjk.test(t.description)),
  registered.filter(t => !cjk.test(t.description)).map(t => t.name).join(',') || 'all zh-first');
ok('渲染错误提示中英并列', bad.text.includes('没有 index.html') && bad.text.includes('No index.html'), bad.text.slice(0, 80));

// ---- 图形界面：挂到模拟 webServer 上 / studio wiring ----
console.log('\n--- 图形界面 / studio ---');
const routes = [];
let studioTool = null;
const fakeWeb = { port: 45678, register(route) { routes.push(route); return () => { routes.length = 0; }; } };
const ctx2 = {
  tools: { register: (t) => { if (t.name === 'music_mv_studio') studioTool = t; } },
  // 桌面版进程的 cwd 是 profile 目录：工作区根必须来自注册表，不能来自 cwd
  get(name) {
    if (name !== 'workspaceRegistry') return undefined;
    return { list: () => [{ path: PLUGIN, sessionIds: ['s1'] }] };
  },
  inject(deps, cb) {
    ok('图形界面只依赖 webServer', Array.isArray(deps) && deps.length === 1 && deps[0] === 'webServer', JSON.stringify(deps));
    cb({ webServer: fakeWeb, effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; } });
  }
};
mod.apply(ctx2, { ...config }); // 不给 studioRoot：走 workspaceRegistry 解析
ok('注册了 /music-mv 前缀路由', routes.length === 1 && routes[0].kind === 'prefix' && routes[0].path === '/music-mv',
  routes.map(r => r.kind + ' ' + r.path).join(',') || 'none');
ok('studio 工具已注册', !!studioTool);
const studioInfo = await studioTool.execute({});
ok('studio 工具返回中文摘要与地址',
  studioInfo.includes('MV 工坊') && studioInfo.includes('/music-mv/studio') && studioInfo.includes('工程 projects'),
  studioInfo.split('\n').slice(0, 3).join(' | '));
ok('工作室根目录解析到注册表里的工作区（不是 cwd）',
  studioInfo.includes('工作区 workspace: ' + PLUGIN), studioInfo.split('\n')[2]);
const studioUrl = await studioTool.execute({ action: 'url' });
ok('studio action=url 只回地址', /^http:\/\/127\.0\.0\.1:\d+\/music-mv\/studio$/.test(studioUrl), studioUrl);

const fakeRes = {
  code: 0, headers: null, body: null,
  writeHead(code, headers) { this.code = code; this.headers = headers; },
  end(body) { this.body = Buffer.isBuffer(body) ? body.toString('utf8') : String(body); }
};
await routes[0].handler({
  url: '/music-mv/api/state', method: 'GET',
  headers: { 'x-music-mv': 'studio' },
  socket: { remoteAddress: '127.0.0.1' }
}, fakeRes);
ok('工作室状态接口返回 200 JSON', fakeRes.code === 200 && /application\/json/.test(fakeRes.headers['content-type']),
  fakeRes.code + ' ' + fakeRes.headers['content-type']);
const stateJson = JSON.parse(fakeRes.body);
ok('状态接口列出工程', Array.isArray(stateJson.projects) && stateJson.projects.length >= 1,
  (stateJson.projects || []).length + ' projects');

// ---- music_mv_lyrics: scaffold a second project, inject a real LRC ----
console.log('\n--- music_mv_init (tool-check) ---');
const TC = path.join(WORK, 'tool-check');
await byName.music_mv_init.execute({ dir: TC, force: true });
ok('init scaffolds tool-check',
  fs.existsSync(path.join(TC, 'index.html')) && fs.existsSync(path.join(TC, 'project.json')),
  TC);

console.log('\n--- music_mv_lyrics ---');
const LRC = [
  '[ar:Tool Check]',
  '[ti:Fixture]',
  '[00:00.50] opening line',
  '[00:02.00] middle line',
  '[00:04.25] closing line'
].join('\n');
const ly = await byName.music_mv_lyrics.execute({ projectDir: TC, lrc: LRC });
ok('lyrics writes lyrics.lrc verbatim',
  fs.readFileSync(path.join(TC, 'lyrics.lrc'), 'utf8') === LRC);
ok('project.json lyrics points at lyrics.lrc',
  JSON.parse(fs.readFileSync(path.join(TC, 'project.json'), 'utf8')).lyrics === 'lyrics.lrc');
ok('lyrics reports cues/firstCue/lastCue',
  ly && ly.cues === 3 && ly.firstCue === 0.5 && ly.lastCue === 4.25 && /lyrics\.lrc$/.test(ly.path),
  JSON.stringify(ly));
const lyBlock = byName.music_mv_lyrics.output.render({ projectDir: TC }, ly);
ok('lyrics output renders a text block',
  Array.isArray(lyBlock) && lyBlock.length === 1 && lyBlock[0].type === 'text' &&
  lyBlock[0].text.includes('cues: 3'), lyBlock[0] ? lyBlock[0].text.split('\n')[2] : 'no block');

let lrcErr = null;
try { await byName.music_mv_lyrics.execute({ projectDir: TC, lrc: '[00:00.50] fine\n[00:0x.5] broken' }); }
catch (e) { lrcErr = e; }
ok('malformed LRC throws with the line number',
  lrcErr instanceof Error && /line 2/.test(lrcErr.message),
  lrcErr ? lrcErr.message : 'NO ERROR');
ok('malformed LRC leaves the injected file untouched',
  fs.readFileSync(path.join(TC, 'lyrics.lrc'), 'utf8') === LRC);

let zeroErr = null;
try { await byName.music_mv_lyrics.execute({ projectDir: TC, lrc: '[ar:headers only]\n[ti:no cues]' }); }
catch (e) { zeroErr = e; }
ok('zero-cue LRC is rejected',
  zeroErr instanceof Error && /cue/i.test(zeroErr.message),
  zeroErr ? zeroErr.message : 'NO ERROR');

let lrcParamErr = null;
try { await byName.music_mv_lyrics.execute({ projectDir: TC }); } catch (e) { lrcParamErr = e; }
ok('lyrics validates required params',
  lrcParamErr instanceof Error && /"lrc"/.test(lrcParamErr.message),
  lrcParamErr ? lrcParamErr.message : 'NO ERROR');

// ---- music_mv_diff: needs real frames, so render a few ----
console.log('\n--- music_mv_render (video) + music_mv_diff ---');
await byName.music_mv_render.execute({
  projectDir: TC, mode: 'video', duration: 0.2, width: 480, height: 270
});
const f0 = path.join(TC, 'frames', 'f00000.jpg');
const f1 = path.join(TC, 'frames', 'f00001.jpg');
ok('video render produced frames', fs.existsSync(f0) && fs.existsSync(f1),
  fs.readdirSync(path.join(TC, 'frames')).join(', '));

const same = await byName.music_mv_diff.execute({ projectDir: TC, a: 0, b: 0 });
ok('diff: same frame is identical with psnr null',
  same.identical === true && same.psnr === null && /f00000\.jpg$/.test(same.frameA) &&
  typeof same.note === 'string', JSON.stringify(same));

const adj = await byName.music_mv_diff.execute({ projectDir: TC, a: 0, b: 1 });
ok('diff: adjacent frames differ and report a psnr',
  adj.identical === false && typeof adj.psnr === 'string' && adj.psnr.length > 0 && Number(adj.psnr) > 0 &&
  /f00001\.jpg$/.test(adj.frameB), JSON.stringify(adj));

let missErr = null;
try { await byName.music_mv_diff.execute({ projectDir: TC, a: 0, b: 99 }); } catch (e) { missErr = e; }
ok('diff: missing frame names the file',
  missErr instanceof Error && missErr.message.includes('f00099.jpg'),
  missErr ? missErr.message : 'NO ERROR');

let diffParamErr = null;
try { await byName.music_mv_diff.execute({ projectDir: TC, a: 0 }); } catch (e) { diffParamErr = e; }
ok('diff validates required params',
  diffParamErr instanceof Error && /"b"/.test(diffParamErr.message),
  diffParamErr ? diffParamErr.message : 'NO ERROR');

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
