import { hash1, smoothstep, easeOut } from '../rng.js';

/** 02 — kinetic lyric. One line owns the frame: glitch on entry, dust underneath. */
export default {
  id: '02-lyric',
  start: 4,
  end: 9,

  draw(stage, t, env, p) {
    const { w, h, palette } = env;
    const ctx = stage.ctx;
    stage.background(palette.bg);

    // drifting dust field
    const N = 220;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const sx = hash1(i * 1.37) * w;
      const sy = hash1(i * 2.71 + 3) * h;
      const sp = 6 + hash1(i * 3.11) * 26;
      let yy = (sy - t * sp) % h;
      if (yy < 0) yy += h;
      ctx.globalAlpha = 0.10 + 0.35 * hash1(i * 5.7);
      ctx.fillStyle = i % 7 === 0 ? palette.hot : palette.accent;
      const s = 1 + Math.floor(hash1(i * 9.1) * 2);
      ctx.fillRect(sx, yy, s, s);
    }
    ctx.restore();

    // Lyrics live on the GLOBAL timeline, so use env.t (this shot's local time
    // starts at 0 and would never match a lyric cue).
    const gt = env.t;
    const line = env.lyricAt(gt);
    if (!line) return;

    const enter = smoothstep(0, 0.45, line.age);
    const scale = 0.88 + easeOut(enter) * 0.12;
    const size = Math.round(h * 0.125);
    const spacing = size * 0.06;
    const tw = stage.measure(line.text, size, 700, spacing);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = enter;

    // scrim so the type always wins against the background
    ctx.fillStyle = 'rgba(4,6,12,0.55)';
    ctx.fillRect(-tw / 2 - size * 0.45, -size * 0.95, tw + size * 0.9, size * 1.55);

    stage.text(line.text, -tw / 2, size * 0.35, {
      size, weight: 700, spacing, color: palette.text,
      shadow: palette.accent, shadowBlur: 30
    });
    ctx.restore();

    // underline sweep on entry
    const sw = smoothstep(0.1, 0.7, line.age);
    if (sw < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - sw;
      ctx.fillStyle = palette.hot;
      ctx.fillRect(0, h / 2 + h * 0.125, w * (1 - sw), 2);
      ctx.restore();
    }

    // glitch is punctuation: only on the entry beat
    if (line.age < 0.35) stage.sliceGlitch(t, (1 - line.age / 0.35) * 0.9);

    // shot progress rule
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = palette.dim;
    ctx.fillRect(w * 0.08, h * 0.92, w * 0.84 * p, 2);
    ctx.restore();
  }
};
