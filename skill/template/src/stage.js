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

    /** Fade the previous frame toward a colour — cheaper than clearing, gives motion trails.
     *  注意：这条路**读的是上一帧**，多 worker 乱序渲染时不可复现；要可复现的拖影用 trail()。 */
    fade(color, amount) {
      ctx.save();
      ctx.globalAlpha = amount;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },

    /**
     * 确定性长曝光拖影 / deterministic shutter trails —— 与 fade() 的区别是**不读上一帧**：
     * 只把 draw 在 t, t−step, t−2step… 各画一遍、alpha 递减，所以帧仍然是 t 的纯函数，
     * 多 worker 乱序、断点续渲都不改结果（参考 styles.md R1：pdoom 风的快门拖影）。
     *
     *   stage.trail(t, (tt) => drawMover(tt), { step: 0.045, samples: 6, decay: 0.62 });
     *
     * trail 已按越早越淡设好 globalAlpha；回调里通常什么都不用做，
     * 只有想按颜色逐笔加权时才用第二个参数（那种情况自己把 globalAlpha 设回 1 再画）。
     */
    trail(t, draw, opts = {}) {
      const step = opts.step ?? 0.045;
      const samples = opts.samples ?? 6;
      const decay = opts.decay ?? 0.62;
      ctx.save();
      for (let i = samples; i >= 1; i--) {          // 先画远的（更淡），近的压在上面
        const a = Math.pow(decay, i);
        ctx.globalAlpha = a;
        draw(t - i * step, a);
      }
      ctx.globalAlpha = 1;
      draw(t, 1);
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

    /** Film grain. The offset changes with t so it shimmers without reading a clock.
     *  连续 t 驱动 → 任意 fps 下每帧都不同；早先用 Math.floor(t*24) 的写法在 120fps 下
     *  五帧共用一个偏移（等于静止），且 noiseShift 是算了没用的死变量。 */
    grain(t, alpha = 0.45) {
      if (!noisePattern) noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
      const ox = -((hash1(t * 91.7) * NOISE) | 0);
      const oy = -((hash1(t * 57.3 + 5) * NOISE) | 0);
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

    /**
     * 广角畸变（桶形曲率 / barrel warp）—— T13 CRT 的「管面是弯的」。
     * 把画布按行切条，每条绕中心水平缩放：中心放得最多、边缘几乎不变，
     * 竖线因此被弯成桶形。这是 Canvas2D 上便宜且可信的曲率实现；
     * NumPy 版请直接用 meshgrid 做 UV 重采样（见 reference/numpy-pillow.md）。
     * amount 0.10–0.22 之间最像真管子；再大就变成鱼眼了。
     */
    barrel(amount = 0.16, rows = 56) {
      if (!(amount > 0)) return;
      const off = document.createElement('canvas');
      off.width = width; off.height = height;
      off.getContext('2d').drawImage(canvas, 0, 0);
      const rowH = height / rows;
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < rows; i++) {
        const y0 = Math.round(i * rowH);
        const y1 = Math.round((i + 1) * rowH);
        const v = ((y0 + y1) / 2) / height * 2 - 1;          // -1..1，离中心多远
        const scale = 1 + amount * (1 - v * v);               // 中心放大、边缘保持 1 → 永远铺满
        const dw = width * scale;
        ctx.drawImage(off, 0, y0, width, y1 - y0,
          (width - dw) / 2, y0, dw, y1 - y0);
      }
      ctx.restore();
    },

    /**
     * 束斑模糊（粒子模糊 / beam-spot blur）—— 电子束打在荧光粉上是一个**软光斑**，
     * 不是刀切的像素。亮度越高扩散越大，所以它和 bloom 是一对：bloom 管「溢出」，
     * 这个管「焦外」。radius 按分辨率给：720p 用 1.0–2.5，4K 用 3–6。
     * 配合 `filter` 一次性软焦；本帧自绘（与 chroma 同一模式，浏览器会先取源快照）。
     */
    beamBlur(radius = 1.5) {
      if (!(radius > 0)) return;
      ctx.save();
      ctx.filter = 'blur(' + radius + 'px)';
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    },

    /**
     * 荫罩 / 光栅条掩膜（T13 的「什么屏幕」，和扫描线是两回事）：
     *   'triad'   —— 三色点/条（shadow mask），红绿蓝横排；
     *   'grille'  —— 垂直条纹（aperture grille），并额外画**一根横向阻尼线**
     *                （Trinitron 的签名，只有一根，居中偏下）。
     * 用 multiply 叠：它压暗的是「缝」，不是给画面涂色。
     */
    mask(kind = 'grille', alpha = 0.3, cell = 3) {
      const c = document.createElement('canvas');
      const s = Math.max(2, Math.round(cell));
      c.width = kind === 'triad' ? s * 3 : s;
      c.height = s;
      const g = c.getContext('2d');
      if (kind === 'triad') {
        g.fillStyle = '#ff0000'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#00ff00'; g.fillRect(s, 0, s, s);
        g.fillStyle = '#0000ff'; g.fillRect(s * 2, 0, s, s);
      } else {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, Math.max(1, s - 1), s);
        g.fillStyle = '#000000'; g.fillRect(s - 1, 0, 1, s);
      }
      const pat = ctx.createPattern(c, 'repeat');
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      if (kind === 'grille') {
        // Trinitron 阻尼线：一根极淡的横线，位置固定（确定性）
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = Math.min(0.45, alpha * 1.1);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, Math.round(height * 0.58), width, Math.max(1, Math.round(height * 0.0018)));
        ctx.restore();
      }
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
