import { hash1, hash2, smoothstep } from '../rng.js';

/** 03 — log rain + closing card. The system keeps writing after the song stops. */
const WORDS = ['log', 'loop', 'retry', 'null', '404', 'flush', 'trace', 'idle', 'echo', 'dead', 'wait', 'self'];

export default {
  id: '03-log-rain',
  start: 9,
  end: 12,

  draw(stage, t, env, p) {
    const { w, h, palette } = env;
    const ctx = stage.ctx;
    stage.background(palette.bg);

    const size = Math.round(h * 0.030);
    const cols = Math.max(4, Math.floor(w / (size * 5.4)));
    const ROWS = 13;
    ctx.save();
    ctx.font = '600 ' + size + 'px ' + stage.MONO;
    for (let c = 0; c < cols; c++) {
      const speed = 70 + hash1(c * 4.7) * 190;
      const x = (c + 0.5) * (w / cols);
      for (let r = 0; r < ROWS; r++) {
        const seed = c * 31 + r;
        const y = ((r * size * 2.7 + t * speed) % (h + size * 22)) - size * 11;
        const fade = 1 - Math.abs(y - h * 0.5) / (h * 0.66);
        if (fade <= 0) continue;
        const word = WORDS[Math.floor(hash2(seed, Math.floor(t * 6 + r)) * WORDS.length)];
        ctx.globalAlpha = Math.max(0, fade) * (0.10 + hash1(seed) * 0.34);
        ctx.fillStyle = hash1(seed * 1.7) > 0.88 ? palette.hot : palette.base;
        ctx.fillText(word, x, y);
      }
    }
    ctx.restore();

    // closing card
    const cardA = smoothstep(1.2, 2.0, t);
    if (cardA > 0) {
      ctx.save();
      // knock the rain back behind the card so the type always wins
      const dim = ctx.createLinearGradient(0, h * 0.28, 0, h * 0.72);
      dim.addColorStop(0, 'rgba(4,6,12,0)');
      dim.addColorStop(0.5, 'rgba(4,6,12,0.94)');
      dim.addColorStop(1, 'rgba(4,6,12,0)');
      ctx.globalAlpha = cardA;
      ctx.fillStyle = dim;
      ctx.fillRect(0, h * 0.28, w, h * 0.44);

      ctx.globalAlpha = cardA;
      ctx.fillStyle = 'rgba(4,6,12,0.90)';
      ctx.fillRect(0, h * 0.375, w, h * 0.255);

      const ts = Math.round(h * 0.062);
      const label = '示例标题';
      const spacing = ts * 0.14;
      const tw = stage.measure(label, ts, 700, spacing);
      stage.text(label, (w - tw) / 2, h * 0.515, {
        size: ts, weight: 700, spacing, color: palette.text,
        shadow: palette.hot, shadowBlur: 28
      });

      ctx.globalAlpha = cardA;
      const sub = 'sample subtitle';
      const ss = Math.round(h * 0.021);
      const sp2 = ss * 0.30;
      const sw = stage.measure(sub, ss, 400, sp2);
      stage.text(sub, (w - sw) / 2, h * 0.585, {
        size: ss, spacing: sp2, color: palette.text,
        shadow: palette.accent, shadowBlur: 12
      });
      ctx.restore();
    }
  }
};
