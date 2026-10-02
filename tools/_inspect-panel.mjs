/** 快查：弹层到底渲染出了什么（DOM 事实，不猜）。 / DOM facts for the panel harness page. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..', '..');
const dir = path.join(PLUGIN, 'test-workdir', 'panel-shot');

const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.replace(/^\//, '') || 'index.html'));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('nope'); }
  res.setHeader('content-type', path.extname(f) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/index.html';

const entry = path.join(REPO, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js');
const puppeteer = (await import('file:///' + entry.replace(/\\/g, '/'))).default;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox']
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.setViewport({ width: 1180, height: 760, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__MM_READY__ === true', { timeout: 15000 }).catch(() => console.log('NOT READY'));
await new Promise((r) => setTimeout(r, 300));

const facts = await page.evaluate(() => {
  const popup = document.querySelector('[data-music-mv-popup]');
  const entryBtn = document.querySelector('[data-music-mv-entry]');
  const r = popup ? popup.getBoundingClientRect() : null;
  const rows = popup ? Array.from(popup.querySelectorAll('.dshMvRow')).map((n) => n.textContent.trim()) : [];
  const acts = popup ? Array.from(popup.querySelectorAll('[data-act]')).map((n) => n.getAttribute('data-act') + '=' + n.textContent.trim()) : [];
  const sels = popup ? Array.from(popup.querySelectorAll('select')).map((n) => n.getAttribute('data-select') + '(' + n.options.length + ')') : [];
  const panels = popup ? Array.from(popup.querySelectorAll('[data-music-mv-panel],[data-panel]')).map((n) => n.getAttribute('data-music-mv-panel') || n.getAttribute('data-panel')) : [];
  const styleInjected = !!document.getElementById('dsh-music-code-mv-entry-style');
  return {
    entryBtn: !!entryBtn,
    entryLabel: entryBtn ? entryBtn.textContent : null,
    popup: !!popup,
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    rows, acts, sels, panels, styleInjected,
    textLen: popup ? popup.textContent.length : 0,
    progress: popup ? popup.querySelectorAll('progress').length : 0
  };
});
console.log(JSON.stringify(facts, null, 1));
await browser.close();
server.close();
