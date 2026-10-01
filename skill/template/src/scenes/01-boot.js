import { clamp, smoothstep } from '../rng.js';

/** 01 — boot log. A machine types its own startup, identity lookup fails. */
const LINES = [
  'system boot ......................... ok',
  'mounting /memory ................... ok',
  'loading identity ................... FAILED',
  'retrying ........................... 1/3',
  'retrying ........................... 2/3',
  'retrying ........................... 3/3',
  'identity ........................... not found',
  'falling back to log-only mode',
  'logging everything, deleting nothing'
];

export default {
  id: '01-boot',
  start: 0,
  end: 4,

  draw(stage, t, env, p) {
    const { w, h, palette } = env;
    const ctx = stage.ctx;
    stage.background(palette.bg);

    // cold perspective grid
    const horizon = h * 0.62;
    ctx.save();
    ctx.strokeStyle = palette.dim;
    ctx.lineWidth = 1;
    for (let i = -14; i <= 14; i++) {
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 12, horizon);
      ctx.lineTo(w / 2 + i * (w / 8), h);
      ctx.stroke();
    }
    for (let i = 1; i <= 9; i++) {
      const k = Math.pow(i / 9, 2.2);
      const y = horizon + (h - horizon) * k + ((t * 46) % ((h - horizon) / 9));
      if (y > h) continue;
      ctx.globalAlpha = 0.30 * (1 - k);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();

    // log lines appear one at a time
    const size = Math.round(h * 0.026);
    const lh = size * 1.75;
    const x0 = Math.round(w * 0.08);
    let y = Math.round(h * 0.20);
    const per = 0.34;
    for (let i = 0; i < LINES.length; i++) {
      if (t < i * per) break;
      const local = t - i * per;
      const shown = LINES[i].slice(0, clamp(Math.floor(local * 46), 0, LINES[i].length));
      const bad = /FAILED|not found/.test(LINES[i]);
      stage.text(shown, x0, y, {
        size, color: bad ? palette.hot : palette.base,
        shadow: bad ? palette.hot : palette.base, shadowBlur: bad ? 22 : 10
      });
      if (bad && local < 0.13) {
        // a brief flicker hugging the typed text — never a full-width slab
        const fw = stage.measure(shown, size, 400);
        ctx.save();
        ctx.globalAlpha = 0.26 * (1 - local / 0.13);
        ctx.fillStyle = palette.hot;
        ctx.fillRect(x0 - size * 0.35, y - size * 0.92, fw + size * 0.7, size * 1.18);
        ctx.restore();
      }
      y += lh;
    }
    // the cursor is alive from frame one, so the opening frame is never empty
    if (Math.floor(t * 2.2) % 2 === 0) {
      ctx.fillStyle = palette.base;
      ctx.fillRect(x0, y - size * 0.85, size * 0.62, size * 1.05);
    }

    // title
    const titleA = smoothstep(2.2, 3.1, t);
    if (titleA > 0) {
      ctx.save();
      ctx.globalAlpha = titleA;
      const ts = Math.round(h * 0.085);
      const label = '示例标题';
      const spacing = ts * 0.10;
      const tw = stage.measure(label, ts, 700, spacing);
      stage.text(label, (w - tw) / 2, h * 0.84, {
        size: ts, weight: 700, spacing, color: palette.text,
        shadow: palette.accent, shadowBlur: 26
      });
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = titleA * 0.8;
      const sub = 'SAMPLE TITLE';
      const ss = Math.round(h * 0.021);
      const sp2 = ss * 0.34;
      const sw = stage.measure(sub, ss, 400, sp2);
      stage.text(sub, (w - sw) / 2, h * 0.905, { size: ss, spacing: sp2, color: palette.accent });
      ctx.restore();
    }

    if (t > 3.6) stage.sliceGlitch(t, smoothstep(3.6, 4, t) * 0.6);
  }
};
