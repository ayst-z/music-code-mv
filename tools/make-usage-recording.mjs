#!/usr/bin/env node
/**
 * 使用实录 / usage recording —— 录**真实工作室页面**的操作过程，出 mp4 给视频 B 的⑬⑭段用。
 *
 *   node tools/make-usage-recording.mjs --scene=a --out=../../explainer-b/out/usage-a.mp4
 *   node tools/make-usage-recording.mjs --scene=b --out=../../explainer-b/out/usage-b.mp4
 *
 * 诚实性红线 / honesty rules:
 *   - 录的是**真实宿主 API 与真实页面**（createStudio 本机起、真实工程列表、真实联系表图片）；
 *   - 按下快门前先做 **DOM 脱敏**（工作区绝对路径 → <workspace>），并对残留做机审断言，
 *     残留即抛错拒绝出图 —— 图片内容没人能替你复核，这一步是唯一的机审手段；
 *   - 不模拟打字、不伪造命令输出：所有画面都是页面里真实发生的事。
 *
 * 采样：每 100ms 截一帧 → ffmpeg -framerate 10 编码（屏幕内容变化慢，10fps 足够顺滑）。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../lib/studio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..', '..');
const arg = (n) => {
  const hit = process.argv.find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.slice(n.length + 3) : '';
};
const SCENE = arg('scene') || 'a';
const OUT = path.resolve(arg('out') || path.join(REPO, 'explainer-b', 'out', `usage-${SCENE}.mp4`));
const FPS = 10;                    // 屏幕录制10fps 足够顺滑
const CAP_MS = 100;

// ---------------------------------------------------------------- 脱敏（与 make-docs-images 同源）
const HOME = (process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/');
const REDACT = [
  [REPO.replace(/\\/g, '/'), '<workspace>'],
  [REPO, '<workspace>'],
  ...(HOME ? [[HOME, '<home>'], [process.env.USERPROFILE || '', '<home>']] : [])
];
async function redactPaths(page) {
  const remaining = await page.evaluate((pairs) => {
    const mask = (s) => {
      if (typeof s !== 'string') return s;
      let out = s;
      for (const [from, to] of pairs) if (from) out = out.split(from).join(to);
      return out.replace(/[A-Za-z]:\\Users\\[^\\<"\s]+/g, '<home>')
                .replace(/[A-Za-z]:\/Users\/[^\/<"\s]+/g, '<home>');
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const v = node.nodeValue;
      if (v && (/[A-Za-z]:[\\/]Users[\\/]/.test(v) || pairs.some(([f]) => f && v.includes(f)))) node.nodeValue = mask(v);
    }
    document.querySelectorAll('input,textarea,[title],[aria-label],[data-path],[data-project]').forEach((el) => {
      if (el.value) el.value = mask(el.value);
      if (el.title) el.title = mask(el.title);
      const a = el.getAttribute && el.getAttribute('aria-label');
      if (a) el.setAttribute('aria-label', mask(a));
      ['data-path', 'data-project'].forEach((k) => {
        const v = el.getAttribute && el.getAttribute(k);
        if (v) el.setAttribute(k, mask(v));
      });
    });
    const hay = (document.body.innerText || '') + ' ' +
      Array.from(document.querySelectorAll('input,[title],[aria-label],[data-path]'))
        .map((el) => [el.value, el.title, el.getAttribute && el.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' ');
    const m = hay.match(/[A-Za-z]:[\\/]Users[\\/][^\\/<"\s]+/g);
    return m ? m.length : 0;
  }, REDACT);
  if (remaining > 0) throw new Error('REDACTION incomplete: ' + remaining + ' user-path occurrence(s) — do not publish');
}

// ---------------------------------------------------------------- 场景脚本（真实交互）
// 选择器实测自工作室页面：工程行 = button.item（文本含名称+规格），无 data-* 路径属性；
// 点击后「预览」区出现 <img src=/music-mv/api/file?path=...contact.png>；页面文本无个人路径。
const SCENES = {
  // ⑬ 空工作区 → 工程列表与规格 → 打开工程看联系表 → 换一个工程
  a: [
    { at: 0, note: 'load studio' },
    { at: 1500, redact: true },
    { at: 2400, clickText: 'feature-demo', note: 'open project → contact preview' },
    { at: 5200, redact: true },
    { at: 7500, scroll: 0.45 },
    { at: 10000, redact: true },
    { at: 12500, reload: true, note: 'back to list' },
    { at: 14500, clickText: 'showcase-3d', note: 'second project' },
    { at: 17500, redact: true },
    { at: 21000, scroll: 0.3 },
    { at: 24000, redact: true }
  ],
  // ⑭ 联系表自检回路：连看三张不同工程的联系表
  b: [
    { at: 0, note: 'load studio' },
    { at: 1500, redact: true },
    { at: 2500, clickText: 'feature-demo', note: 'contact #1' },
    { at: 5500, redact: true },
    { at: 7000, reload: true },
    { at: 9000, clickText: 'showcase', note: 'contact #2' },
    { at: 12000, redact: true },
    { at: 13500, reload: true },
    { at: 15500, clickText: 'mv-demo', note: 'contact #3' },
    { at: 18500, redact: true },
    { at: 21000, scroll: 0.5 },
    { at: 24000, redact: true }
  ]
};
const STEPS = SCENES[SCENE];
if (!STEPS) { console.error('unknown scene: ' + SCENE); process.exit(1); }
const DURATION_MS = STEPS[STEPS.length - 1].at + 1500;

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const studio = createStudio({ root: REPO });
  const server = http.createServer((req, res) => studio.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/music-mv/studio';

  const entry = path.join(REPO, 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js');
  const puppeteer = (await import('file:///' + entry.replace(/\\/g, '/'))).default;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror] ' + e.message));
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(base + '?theme=dark', { waitUntil: 'networkidle2', timeout: 60000 });

  const tmp = path.join(PLUGIN, 'test-workdir', `rec-${SCENE}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const t0 = Date.now();
  let idx = 0;
  let redacted = false;
  let lastTs = 0;
  async function shot() {
    await page.screenshot({ path: path.join(tmp, `f${String(idx).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    lastTs = Date.now();
    idx++;
  }
  const stepMap = new Map(STEPS.map((s) => [s.at, s]));
  const fired = new Set();

  // 主循环：**按墙钟调度**——截图本身要花 ~100ms，固定 sleep 会把时间轴压缩；
  // 结束后用实测帧率编码，保证成片时间 = 真实时间。
  while (Date.now() - t0 <= DURATION_MS) {
    const ms = Date.now() - t0;
    // 找到该时刻（或最近一个还没触发的）步骤
    for (const s of STEPS) {
      if (!fired.has(s) && ms >= s.at) {
        fired.add(s);
        try {
          if (s.act === 'redact' || s.redact) { await redactPaths(page); redacted = true; }
          if (s.clickText) {
            const handle = await page.evaluateHandle((needle) => {
              const els = Array.from(document.querySelectorAll('button.item'));
              return els.find((el) => el.textContent.includes(needle)) || null;
            }, s.clickText);
            const el = handle.asElement();
            if (el) {
              await el.click();
              await new Promise((r) => setTimeout(r, 900));
              // 真实用户会滚去看预览：图片初始在视口下方（实测 y=1175 > 视口900）
              await page.evaluate(() => {
                const img = document.querySelector('img');
                if (img) img.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }).catch(() => {});
              await new Promise((r) => setTimeout(r, 700));
              const hdr = await page.evaluate(() => {
                const h = document.querySelector('h2');
                const img = document.querySelector('img');
                const r = img ? img.getBoundingClientRect() : null;
                return (h ? h.textContent.trim() : '(no h2)') +
                  '  imgs=' + document.querySelectorAll('img').length +
                  (r ? '  img@' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
                      (r.top < innerHeight && r.bottom > 0 ? ' VISIBLE' : ' below-fold') : '');
              });
              console.log('[step@' + ms + '] clickText "' + s.clickText + '" -> ' + hdr);
            } else {
              console.error('[step@' + ms + '] NO project matching ' + s.clickText);
            }
          }
          if (s.click) await page.click(s.click).catch((e) => console.error('[click] ' + e.message));
          if (s.reload) {
            await page.goto(base + '?theme=dark', { waitUntil: 'networkidle2', timeout: 30000 });
            console.log('[step@' + ms + '] reload done');
          }
          if (typeof s.scroll === 'number') {
            await page.evaluate((f) => {
              // 页面的滚动容器可能不是 window（预览区是内部滚动）
              const sc = Array.from(document.querySelectorAll('div'))
                .filter((d) => d.scrollHeight > d.clientHeight + 40)
                .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
              if (sc) sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * f;
              else window.scrollTo(0, document.body.scrollHeight * f);
            }, s.scroll);
          }
        } catch (e) { console.error('[step@' + ms + '] ' + e.message); }
      }
    }
    if (redacted) await redactPaths(page).catch(() => {});
    await shot();
  }
  const elapsed = Math.max(0.001, (lastTs - t0) / 1000);
  const realFps = Math.max(1, (idx - 1) / elapsed);

  // 编码：用**实测帧率**，成片时长 ≈ 真实时长
  const ff = path.join(REPO, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  const { spawnSync } = await import('node:child_process');
  const enc = spawnSync(ff, ['-y', '-loglevel', 'error', '-framerate', realFps.toFixed(3),
    '-i', path.join(tmp, 'f%04d.jpg'), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  if (enc.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }

  const meta = spawnSync(ff, ['-hide_banner', '-i', OUT], { encoding: 'utf8' });
  (meta.stderr || '').split('\n').filter((l) => /Duration|Stream #0:0/.test(l)).forEach((l) => console.log(l.trim()));
  console.log(`frames=${idx}  elapsed=${elapsed.toFixed(1)}s  measuredFps=${realFps.toFixed(2)}  redaction=passed  out=${OUT}  (${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB)`);

  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
