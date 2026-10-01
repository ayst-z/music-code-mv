import { hash1, smoothstep } from '../rng.js';

/** 05 — isometric stack field. Pure 2D projection: no three.js, depth sorted by hand. */
const GRID = 7;   // GRID x GRID columns on the floor
const MAXL = 2.2; // tallest column, in tile-height units

export default {
  id: '05-isometric',
  start: 15,
  end: 18,

  draw(stage, t, env, p) {
    const { w, h, palette } = env;
    const ctx = stage.ctx;
    stage.background(palette.bg);

    // 2:1 isometric tile, fitted so the floor diamond plus the tallest column stays in frame
    // corners run 0..GRID (a cell occupies gx..gx+1), so the floor measures GRID tiles
    const TW = Math.min(w * 0.90 / GRID, h * 0.78 / (GRID / 2 + MAXL * 0.31));
    const TH = TW * 0.5;
    const TZ = TH * 0.62;

    // screen position of a grid corner raised z units
    const px = (gx, gy) => (gx - gy) * TW * 0.5;
    const py = (gx, gy, z) => (gx + gy) * TH * 0.5 - z * TZ;

    // slow camera drift — a function of the shot clock, so still deterministic
    const ox = w / 2 + Math.sin(t * 0.5) * w * 0.02;
    // ground sits just above the HUD band, tallest column still clears the top edge
    const oy = h * 0.83 - GRID * TH + Math.cos(t * 0.37) * h * 0.012;
    const P = (gx, gy, z) => [ox + px(gx, gy), oy + py(gx, gy, z)];

    // height of one column: a diagonal wave over a static per-cell amplitude
    const level = (gx, gy) => {
      const seed = hash1(gx * 12.9 + gy * 4.1 + 0.7);
      const a = Math.sin(t * 1.15 + (gx + gy) * 0.62);
      const b = Math.sin(t * 0.61 - (gx - gy) * 0.44);
      return 0.25 + seed * 0.5 + (0.5 + 0.5 * (a * 0.6 + b * 0.4)) * 1.4;
    };

    // floor grid, drawn first and un-scaled so the shot is never empty
    ctx.save();
    ctx.strokeStyle = palette.dim;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.32;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      let a = P(i, 0, 0), b = P(i, GRID, 0);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      a = P(0, i, 0); b = P(GRID, i, 0);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();

    // painter's order: far corner first, near corner last — one sort per frame is all we owe
    const rise = 0.3 + 0.7 * smoothstep(0, 0.35, t);
    const cells = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) cells.push({ gx, gy, depth: gx + gy });
    }
    cells.sort((a, b) => a.depth - b.depth);

    ctx.save();
    ctx.lineWidth = 1;
    for (const c of cells) {
      const { gx, gy } = c;
      const L = level(gx, gy) * rise;
      const hot = hash1(gx * 5.3 + gy * 7.7 + 2.1) > 0.91;   // magenta stays rare
      const top = hot ? palette.hot : palette.base;

      const t00 = P(gx, gy, L), t10 = P(gx + 1, gy, L);
      const t11 = P(gx + 1, gy + 1, L), t01 = P(gx, gy + 1, L);
      const b10 = P(gx + 1, gy, 0), b11 = P(gx + 1, gy + 1, 0), b01 = P(gx, gy + 1, 0);

      // right face (+gx side), left face (+gy side), then the top rhombus
      const face = (pts, color, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = palette.bg;
        ctx.stroke();
      };
      face([t10, t11, b11, b10], palette.dim, 0.95);
      face([t01, t11, b11, b01], palette.accent, 0.5);
      face([t00, t10, t11, t01], top, 1);

      // lit edge on the top face keeps neighbouring columns readable
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = hot ? palette.text : palette.accent;
      ctx.beginPath();
      ctx.moveTo(t00[0], t00[1]); ctx.lineTo(t10[0], t10[1]);
      ctx.lineTo(t11[0], t11[1]);
      ctx.stroke();
    }
    ctx.restore();

    // HUD: shot label left, column count right, progress rule under both
    const size = Math.round(h * 0.021);
    stage.text('ISOMETRIC STACK // T11', w * 0.08, h * 0.885, {
      size, spacing: size * 0.16, color: palette.accent
    });
    const read = 'grid ' + GRID + 'x' + GRID;
    const rw = stage.measure(read, size, 400, size * 0.16);
    stage.text(read, w * 0.92 - rw, h * 0.885, { size, spacing: size * 0.16, color: palette.dim });
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = palette.dim;
    ctx.fillRect(w * 0.08, h * 0.92, w * 0.84 * p, 2);
    ctx.restore();
  }
};
