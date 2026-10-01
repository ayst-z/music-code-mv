/**
 * 界面截图自检 / screenshot the studio page for visual review.
 * Run:  node test/studio-shot.mjs [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStudio } from '../lib/studio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const ROOT = path.resolve(PLUGIN, '..', '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(PLUGIN, 'test-workdir', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const puppeteer = (await import(pathToFileURL(path.join(ROOT, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js')).href)).default;

const studio = createStudio({ root: ROOT });
const server = http.createServer((req, res) => { studio.handle(req, res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = 'http://127.0.0.1:' + port + '/music-mv/studio';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
});
const shots = [];
for (const [name, w, h, theme] of [['wide-dark', 1180, 900, 'dark'], ['wide-light', 1180, 900, 'light'], ['sidebar-dark', 400, 940, 'dark'], ['sidebar-light', 400, 940, 'light']]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '?theme=' + theme, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: name.indexOf('wide') === 0 });
  shots.push({ name, file, errors });
  await page.close();
}
await browser.close();
server.close();
for (const s of shots) console.log(s.name + ': ' + s.file + (s.errors.length ? '  ERRORS: ' + s.errors.join(' | ') : '  (no page errors)'));
