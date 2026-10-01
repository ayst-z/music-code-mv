import { hash1, hash2, clamp, smoothstep } from '../rng.js';

/** 06 — telemetry dashboard. Oscilloscope, bar strip and heat grid, every number from env.t. */
const NB = 36;              // bars in the strip
const NS = 108;             // samples across the oscilloscope trace
const COLS = 24, ROWS = 4;  // heat grid cells

export default {
  id: '06-dataviz',
  start: 18,
  end: 21,

  draw(stage, t, env, p) {
    const { w, h, palette } = env;
    const ctx = stage.ctx;
    stage.background(palette.bg);

    // readouts belong to the WHOLE timeline, so they hang off the global clock
    const gt = env.t;

    const x0 = w * 0.08, x1 = w * 0.92, pw = x1 - x0;
    const size = Math.round(h * 0.021);

    // ---- header
    stage.text('TELEMETRY // T12', x0, h * 0.09, { size, spacing: size * 0.16, color: palette.accent });
    const clock = 't=' + gt.toFixed(2) + 's';
    const cw = stage.measure(clock, size, 400, size * 0.16);
    stage.text(clock, x1 - cw, h * 0.09, { size, spacing: size * 0.16, color: palette.hot });
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = palette.dim;
    ctx.fillRect(x0, h * 0.115, pw, 1);
    ctx.restore();

    // ---- panel A: oscilloscope trace
    const aScope = smoothstep(0.05, 0.45, t);
    const sy0 = h * 0.17, sy1 = h * 0.46, smid = (sy0 + sy1) / 2, samp = (sy1 - sy0) * 0.44;
    const wave = (x) => {
      // three detuned sines plus a quantised jitter — a fake signal that never drifts
      const v = Math.sin(x * 12.4 + gt * 2.3)
        + 0.45 * Math.sin(x * 31.7 - gt * 1.7)
        + 0.2 * Math.sin(x * 57.1 + gt * 0.9);
      const jitter = (hash2(Math.floor(x * 90), Math.floor(gt * 7)) - 0.5) * 0.3;
      return clamp((v / 1.6) + jitter, -1, 1);
    };
    ctx.save();
    ctx.globalAlpha = aScope;
    ctx.strokeStyle = palette.dim;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = x0 + (pw * i) / 12;
      ctx.globalAlpha = aScope * (i % 3 === 0 ? 0.45 : 0.2);
      ctx.beginPath(); ctx.moveTo(x, sy0); ctx.lineTo(x, sy1); ctx.stroke();
    }
    ctx.globalAlpha = aScope * 0.5;
    ctx.beginPath(); ctx.moveTo(x0, smid); ctx.lineTo(x1, smid); ctx.stroke();

    // sample the trace once, then stroke it in runs: cool where it stays in band,
    // hot wherever it leaves it
    ctx.lineJoin = 'round';
    const pts = [];
    for (let i = 0; i < NS; i++) {
      const v = wave(i / (NS - 1));
      pts.push({ x: x0 + (pw * i) / (NS - 1), y: smid - v * samp, hot: Math.abs(v) > 0.78 });
    }
    const drawRun = (from, to, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.shadowColor = color;
      ctx.shadowBlur = width * 5;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        if (i === from) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    let i = 0;
    while (i < NS) {
      let j = i;
      while (j + 1 < NS && pts[j + 1].hot === pts[i].hot) j++;
      ctx.globalAlpha = (pts[i].hot ? 1 : 0.95) * aScope;
      drawRun(Math.max(0, i - 1), Math.min(NS - 1, j + 1),
        pts[i].hot ? palette.hot : palette.base, pts[i].hot ? 3 : 2);
      i = j + 1;
    }
    // probe head at the right edge
    const headY = smid - wave(1) * samp;
    ctx.globalAlpha = aScope;
    ctx.fillStyle = palette.hot;
    ctx.shadowColor = palette.hot;
    ctx.shadowBlur = 14;
    ctx.fillRect(x1 - 4, headY - 4, 8, 8);
    ctx.restore();

    stage.text('signal ' + (3.2 + Math.sin(gt * 0.9) * 1.4).toFixed(2) + ' kHz', x0, sy1 + size * 1.1, {
      size, spacing: size * 0.1, color: palette.dim
    });

    // ---- panel B: bar strip
    const aBars = smoothstep(0.3, 0.7, t);
    const by1 = h * 0.755, bh = h * 0.19;
    let peak = 0, peakI = 0;
    ctx.save();
    ctx.globalAlpha = aBars;
    ctx.fillStyle = palette.dim;
    ctx.fillRect(x0, by1, pw, 1);
    const bw = pw / NB;
    for (let i = 0; i < NB; i++) {
      const k = i / NB;
      const e1 = 0.5 + 0.5 * Math.sin(gt * 1.9 + k * 7.4);
      const e2 = 0.5 + 0.5 * Math.sin(gt * 0.7 - k * 15.1);
      const v = clamp(0.1 + e1 * 0.55 * (0.5 + hash1(i * 3.7)) + e2 * 0.33, 0, 1);
      if (v > peak) { peak = v; peakI = i; }
      const bx = x0 + i * bw;
      const bhh = v * bh;
      ctx.globalAlpha = aBars * (v > 0.82 ? 1 : 0.8);
      ctx.fillStyle = v > 0.82 ? palette.hot : palette.accent;
      ctx.fillRect(bx + bw * 0.15, by1 - bhh, bw * 0.7, bhh);
      // 1 px cap so the bars keep a hard technical edge
      ctx.globalAlpha = aBars;
      ctx.fillStyle = palette.text;
      ctx.fillRect(bx + bw * 0.15, by1 - bhh - 2, bw * 0.7, 2);
    }
    ctx.restore();

    stage.text('peak ' + peak.toFixed(3) + ' @ ' + String(peakI).padStart(2, '0'), x0, by1 + size * 1.6, {
      size, spacing: size * 0.1, color: palette.dim
    });
    const barsLbl = 'BAR STRIP // T12';
    const bw2 = stage.measure(barsLbl, size, 400, size * 0.1);
    stage.text(barsLbl, x1 - bw2, by1 + size * 1.6, { size, spacing: size * 0.1, color: palette.dim });

    // ---- panel C: heat grid
    const aHeat = smoothstep(0.55, 0.95, t);
    const hy0 = h * 0.80, hh = h * 0.075;
    const cw2 = pw / COLS, ch = hh / ROWS;
    const cellV = (i, j) => {
      const s = Math.sin(gt * 1.3 + i * 0.42 - j * 0.61) * 0.5 + 0.5;
      const r = hash2(i * 1.7, j * 2.3 + Math.floor(gt * 3));
      return clamp(s * 0.7 + r * 0.45, 0, 1);
    };
    let hottest = 0, hi = 0, hj = 0;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const v = cellV(i, j);
        if (v > hottest) { hottest = v; hi = i; hj = j; }
      }
    }
    ctx.save();
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const v = cellV(i, j);
        const isMax = i === hi && j === hj;
        ctx.globalAlpha = aHeat * (isMax ? 1 : 0.08 + v * 0.8);
        ctx.fillStyle = isMax ? palette.hot : (v > 0.6 ? palette.accent : palette.base);
        ctx.fillRect(x0 + i * cw2 + 1, hy0 + j * ch + 1, cw2 - 2, ch - 2);
      }
    }
    ctx.globalAlpha = aHeat * 0.9;
    ctx.strokeStyle = palette.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, hy0, pw, hh);
    ctx.restore();

    // labels sit BELOW the grid: above it they would collide with the bar-strip readout
    const heatY = hy0 + hh + size * 1.4;
    stage.text('heat', x0, heatY, { size, spacing: size * 0.1, color: palette.dim });
    const cell = '[' + String(hi).padStart(2, '0') + ',' + hj + '] ' + hottest.toFixed(2);
    const clw = stage.measure(cell, size, 400, size * 0.1);
    stage.text(cell, x1 - clw, heatY, { size, spacing: size * 0.1, color: palette.dim });

    // progress rule
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = palette.dim;
    ctx.fillRect(x0, h * 0.945, pw * p, 2);
    ctx.restore();
  }
};
