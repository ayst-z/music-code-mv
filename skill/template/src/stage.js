import { hash1, hash2 } from './rng.js';

/**
 * Canvas2D stage with the code-MV look helpers baked in.
 * Everything here is deterministic: any randomness is keyed off the frame time.
 */
export function createStage({ width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  // offscreen used for the cheap bloom pass
  const gw = Math.max(1, width >> 3), gh = Math.max(1, height >> 3);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = gw; glowCanvas.height = gh;
  const gctx = glowCanvas.getContext('2d');

  // cached scanline pattern: one dark line every N pixels
  let scanPattern = null, scanGap = 0;
  function scanPatternFor(gap) {
    if (scanPattern && scanGap === gap) return scanPattern;
    const c = document.createElement('canvas');
    c.width = 1; c.height = gap;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1, 1);
    scanPattern = ctx.createPattern(c, 'repeat');
    scanGap = gap;
    return scanPattern;
  }

  // cached noise tile for grain
  const NOISE = 256;
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = NOISE; noiseCanvas.height = NOISE;
  {
    const g = noiseCanvas.getContext('2d');
    const img = g.createImageData(NOISE, NOISE);
    for (let i = 0; i < NOISE * NOISE; i++) {
      const v = (hash2(i % NOISE, (i / NOISE) | 0) * 255) | 0;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 26;
    }
    g.putImageData(img, 0, 0);
  }
  let noisePattern = null;

  let vig = null;
  function vignetteGradient() {
    if (vig) return vig;
    const r = Math.hypot(width, height) * 0.62;
    vig = ctx.createRadialGradient(width / 2, height / 2, r * 0.28, width / 2, height / 2, r);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.82)');
    return vig;
  }

  let noiseShift = 0;

  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';

  const stage = {
    canvas, ctx, width, height, MONO,

    begin() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
    },

    /** Fill the frame. Use a palette colour, never a hardcoded hex. */
    background(color) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
    },

    /** Fade the previous frame toward a colour — cheaper than clearing, gives motion trails. */
    fade(color, amount) {
      ctx.save();
      ctx.globalAlpha = amount;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },

    /** CRT phosphor lines. alpha around 0.05-0.16, gap 2-4. */
    scanlines(alpha = 0.10, gap = 3) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = scanPatternFor(gap);
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },

    vignette(strength = 1) {
      ctx.save();
      ctx.globalAlpha = strength;
      ctx.fillStyle = vignetteGradient();
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },

    /** Film grain. The offset drifts with t so it shimmers without reading a clock. */
    grain(t, alpha = 0.45) {
      if (!noisePattern) noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
      noiseShift = (noiseShift + 37) % NOISE;
      const ox = -((hash1(Math.floor(t * 24) * 91.7) * NOISE) | 0);
      const oy = -((hash1(Math.floor(t * 24) * 57.3 + 5) * NOISE) | 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ox, oy);
      ctx.fillStyle = noisePattern;
      ctx.fillRect(0, 0, width + NOISE, height + NOISE);
      ctx.restore();
    },

    /** Cheap bloom: downscale, upscale back with additive blending. Much faster than ctx.filter. */
    bloom(alpha = 0.45) {
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.globalCompositeOperation = 'source-over';
      gctx.globalAlpha = 1;
      gctx.clearRect(0, 0, gw, gh);
      gctx.drawImage(canvas, 0, 0, gw, gh);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glowCanvas, 0, 0, gw, gh, -8, -8, width + 16, height + 16);
      ctx.restore();
    },

    /** Horizontal slice displacement. intensity 0..1. Deterministic in t. */
    sliceGlitch(t, intensity = 0.5) {
      const bands = 2 + Math.round(intensity * 16);
      const tick = Math.floor(t * 12);
      for (let i = 0; i < bands; i++) {
        const r1 = hash2(i * 3.1, tick);
        const r2 = hash2(i * 7.7 + 2, tick);
        const y = Math.floor(r1 * height);
        const hh = 3 + Math.floor(r2 * height * 0.05);
        const dx = (hash2(i * 5.3 + 9, tick) - 0.5) * width * 0.18 * intensity;
        ctx.drawImage(canvas, 0, y, width, hh, dx, y, width, hh);
      }
    },

    /** Channel-ish separation by re-compositing shifted copies of the frame. */
    chroma(amount = 2, alpha = 0.18) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha;
      ctx.drawImage(canvas, amount, 0);
      ctx.drawImage(canvas, -amount, 0);
      ctx.restore();
    },

    /** Text with manual letter spacing. Returns the advance width. */
    text(str, x, y, opts = {}) {
      const size = opts.size || 32;
      const weight = opts.weight || 400;
      const family = opts.family || MONO;
      const spacing = opts.spacing || 0;
      ctx.save();
      ctx.font = weight + ' ' + size + 'px ' + family;
      ctx.textBaseline = opts.baseline || 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = opts.color || '#e8f7ff';
      if (opts.shadow) { ctx.shadowColor = opts.shadow; ctx.shadowBlur = opts.shadowBlur || 18; }
      let cx = x;
      if (spacing) {
        for (const ch of str) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
      } else {
        ctx.fillText(str, x, y);
        cx += ctx.measureText(str).width;
      }
      ctx.restore();
      return cx - x;
    },

    measure(str, size, weight = 400, spacing = 0, family = MONO) {
      ctx.save();
      ctx.font = weight + ' ' + size + 'px ' + family;
      let w = ctx.measureText(str).width;
      if (spacing) w += (str.length - 1) * spacing;
      ctx.restore();
      return w;
    },

    /** Per-frame finishing pass, called automatically by main.js. Configure via project.json fx. */
    end(t, env) {
      // project.json fx is the baseline; a scene may override it via its own fx field,
      // which is how UI/typography shots skip the expensive bloom+chroma passes.
      const fx = Object.assign({}, (env && env.project && env.project.fx) || {}, (env && env.fx) || {});
      if (fx.chroma !== false) stage.chroma(fx.chromaAmount || 2, fx.chromaAlpha || 0.18);
      if (fx.scanlines !== false) stage.scanlines(fx.scanAlpha || 0.10, fx.scanGap || 3);
      if (fx.bloom !== false) stage.bloom(fx.bloomAlpha || 0.45);
      if (fx.vignette !== false) stage.vignette(fx.vignette || 1);
      if (fx.grain !== false) stage.grain(t, fx.grainAlpha || 0.45);
    }
  };

  return stage;
}
