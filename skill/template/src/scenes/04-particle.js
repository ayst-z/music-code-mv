import { hash1, smoothstep, pulse } from '../rng.js';

/** 04 — orbital particle field. A seeded swarm circles one hot core, each particle dragging a low-alpha trail. */
const N = 320;      // particles in the field
const TRAIL = 8;    // ghost samples per particle — the trail is drawn, never accumulated
const STEP = 0.06;  // seconds between trail samples

/** palette hex -> rgba, so glows and halos never hardcode a colour. */
const rgba = (hex, a) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};

export default {
  id: '04-particle',
  start: 12,
  end: 15,

  draw(stage, t, env, p) {
    const { w, h, palette } = env;
    const ctx = stage.ctx;
    stage.background(palette.bg);

    const cx = w / 2;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.46;
    // never a black frame: the field is already 35% grown on the cut
    const grow = 0.35 + 0.65 * smoothstep(0, 0.3, t);
    const beat = pulse(t, 1.6);

    // halo: one soft gradient lifting the middle of the frame out of pure black
    const haloR = R * (0.95 + beat * 0.08);
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
    halo.addColorStop(0, rgba(palette.hot, 0.30 * grow));
    halo.addColorStop(0.35, rgba(palette.accent, 0.14 * grow));
    halo.addColorStop(1, rgba(palette.bg, 0));
    ctx.save();
    ctx.fillStyle = halo;
    ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
    ctx.restore();

    // dial: orbit guides plus a ring of tick marks, the shot's technical frame
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const rx = R * (0.44 + i * 0.21);
      ctx.strokeStyle = i === 2 ? palette.base : palette.dim;
      ctx.globalAlpha = (i === 2 ? 0.5 : 0.4) * grow;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * (0.34 + i * 0.07), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const TICKS = 48;
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2;
      const long = i % 6 === 0;
      const r0 = R * 1.02, r1 = r0 + (long ? R * 0.055 : R * 0.025);
      ctx.globalAlpha = (long ? 0.7 : 0.34) * grow;
      ctx.strokeStyle = long ? palette.accent : palette.dim;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.94);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.94);
      ctx.stroke();
    }
    ctx.restore();

    // the swarm: every value below is a function of i and t only — no state, no clock
    ctx.save();
    for (let i = 0; i < N; i++) {
      const s = i * 1.618 + 0.5;                   // golden-ratio stride decorrelates the hashes
      const body = i % 17 === 0;                   // every 17th particle is a lit body
      const radius = (0.12 + hash1(s * 2.3) * 0.92) * R * grow;
      const speed = (0.35 + hash1(s * 5.1) * 1.3) * (hash1(s * 3.7) > 0.35 ? 1 : -1);
      const squash = 0.32 + hash1(s * 7.9) * 0.5;   // projection flattens the orbit plane
      const tilt = hash1(s * 9.7) * Math.PI;        // orbit orientation in screen space
      const phase = hash1(s * 11.3) * Math.PI * 2;
      const hot = hash1(s * 13.1) > 0.93;           // magenta stays rare
      const color = hot ? palette.hot : (i % 3 ? palette.base : palette.accent);

      for (let g = TRAIL - 1; g >= 0; g--) {
        const tt = t - g * STEP;
        const a = phase + speed * tt;
        // orbit in its own plane, then rotate flat: cheap depth without WebGL
        const ox = Math.cos(a) * radius;
        const oy = Math.sin(a) * radius * squash;
        const x = cx + ox * Math.cos(tilt) - oy * Math.sin(tilt);
        const y = cy + ox * Math.sin(tilt) + oy * Math.cos(tilt);
        const depth = 0.5 + 0.5 * Math.sin(a + phase);        // 0 far side … 1 near side
        let size = (1.4 + depth * 2.8) * (g === 0 ? 1.5 : 0.9) * (hot ? 1.4 : 1);
        if (body) size *= 2.4;
        const fade = Math.pow(1 - g / TRAIL, 1.7);
        ctx.globalAlpha = (0.2 + depth * 0.6) * fade * grow;
        ctx.fillStyle = color;
        if (body && g === 0) {
          // lit bodies carry their own glow instead of a trail head
          ctx.shadowColor = color;
          ctx.shadowBlur = 18;
        }
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();

    // core: one hot nucleus, glowing through the stage bloom pass at frame end
    const coreR = R * (0.05 + beat * 0.018) * grow;
    ctx.save();
    ctx.globalAlpha = grow;
    ctx.shadowColor = palette.hot;
    ctx.shadowBlur = 26 + beat * 26;
    ctx.fillStyle = palette.hot;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = palette.text;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // shockwave: one expanding ring per beat, fading as it crosses the field
    const ring = (t * 0.62) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - ring) * 0.5 * grow;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, coreR + ring * R * 0.9, (coreR + ring * R * 0.9) * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // HUD: shot label left, shot clock right, progress rule under both
    const size = Math.round(h * 0.021);
    stage.text('ORBITAL FIELD // T10', w * 0.08, h * 0.885, {
      size, spacing: size * 0.16, color: palette.accent
    });
    const clock = 't+' + t.toFixed(2);
    const cw = stage.measure(clock, size, 400, size * 0.16);
    stage.text(clock, w * 0.92 - cw, h * 0.885, {
      size, spacing: size * 0.16, color: palette.dim
    });
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = palette.dim;
    ctx.fillRect(w * 0.08, h * 0.92, w * 0.84 * p, 2);
    ctx.restore();
  }
};
