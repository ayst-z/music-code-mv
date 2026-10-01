#!/usr/bin/env node
/**
 * 生成说明文档用的实拍图 / regenerate the real documentation images.
 *
 *   node tools/make-docs-images.mjs [--skill=<dir>] [--skip-shots]
 *
 * 产出（默认写进 skill 的唯一事实来源，再由 sync-skill.mjs 打包）：
 *   reference/img/studio-dark.png   界面（深色）
 *   reference/img/studio-light.png  界面（浅色）
 *   reference/img/preset-<id>.png   每个预设的一张三帧联系表
 *
 * 改过渲染内核或配色后重跑它，文档里的图就跟着更新。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStudio } from '../lib/studio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..', '..');
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : '';
};
const skillArg = arg('skill');
const SKILL = skillArg
  ? path.resolve(skillArg)
  : (fs.existsSync(path.join(REPO, 'skills', 'music-code-mv'))
      ? path.join(REPO, 'skills', 'music-code-mv')
      : path.join(PLUGIN, 'skill'));
const IMG = path.join(SKILL, 'reference', 'img');
const WORK = path.join(PLUGIN, 'test-workdir', 'docs');
const NODE = process.execPath;

fs.mkdirSync(IMG, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
console.log('skill dir : ' + SKILL);
console.log('image dir : ' + IMG);

// ---- 1. 每个预设渲一张小联系表 ----
const PRESET_DIR = path.join(SKILL, 'presets');
const INLINE_INIT = path.resolve(PLUGIN, '..', '..', 'skills', 'music-code-mv', 'scripts', 'init.mjs');
const INIT = fs.existsSync(INLINE_INIT) ? INLINE_INIT : path.join(SKILL, 'scripts', 'init.mjs');
const RENDER = path.join(SKILL, 'scripts', 'render.mjs');
const presets = fs.readdirSync(PRESET_DIR).filter((n) => n.endsWith('.json')).map((n) => n.replace('.json', '')).sort();
for (const id of presets) {
  const dir = path.join(WORK, id);
  fs.rmSync(dir, { recursive: true, force: true });
  const a = spawnSync(NODE, [INIT, dir, '--force', '--preset=' + id], { encoding: 'utf8' });
  if (a.status !== 0) { console.error('init failed for ' + id + ': ' + (a.stderr || a.stdout)); continue; }
  const b = spawnSync(NODE, [RENDER, '--project=' + dir, '--contact', '--keys=3', '--w=480', '--h=270', '--format=jpeg'], { encoding: 'utf8' });
  const sheet = path.join(dir, 'out', 'contact.png');
  if (b.status !== 0 || !fs.existsSync(sheet)) { console.error('render failed for ' + id + ': ' + (b.stderr || b.stdout).slice(-300)); continue; }
  const dest = path.join(IMG, 'preset-' + id + '.png');
  fs.copyFileSync(sheet, dest);
  console.log('preset sheet: ' + path.relative(SKILL, dest) + '  (' + Math.round(fs.statSync(dest).size / 1024) + ' KB)');
}

// ---- 2. 界面截图（深浅各一张）----
if (process.argv.includes('--skip-shots')) {
  console.log('skipped studio screenshots');
  process.exit(0);
}
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let puppeteer = null;
try {
  const entry = path.join(REPO, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js');
  puppeteer = (await import(pathToFileURL(entry).href)).default;
} catch (e) {
  console.error('puppeteer-core 不可用，跳过界面截图 / puppeteer-core unavailable: ' + (e && e.message));
  process.exit(0);
}

const studio = createStudio({ root: REPO });
const server = http.createServer((req, res) => { studio.handle(req, res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/music-mv/studio';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1120, height: 820, deviceScaleFactor: 1.5 });
  await page.goto(base + '?theme=' + theme, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const dest = path.join(IMG, 'studio-' + theme + '.png');
  await page.screenshot({ path: dest });
  console.log('studio shot: ' + path.relative(SKILL, dest) + '  (' + Math.round(fs.statSync(dest).size / 1024) + ' KB)');
  await page.close();
}
await browser.close();
server.close();
console.log('done');
