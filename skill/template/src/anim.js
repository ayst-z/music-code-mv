/**
 * 动画驱动语汇 / motion drivers —— 帧 = t 的纯函数，所以这里每个函数只吃 t（或 frame），
 * 不维护任何跨帧状态：乱序渲染、断点续渲、多 worker 都得到同一结果。
 *
 *   import { interpolate, spring, SPRING } from './anim.js';
 *
 * interpolate：多段线性映射（默认 clamp 出界，忘写 clamp 是最常见的越界 bug）
 *   const opacity = interpolate(ts, [0, 0.5], [0, 1]);                 // 入场 0.5s
 *   const scale   = interpolate(ts, [0, 0.4, 4.6, 5], [1, 1, 1, 0.96]); // 多点
 *
 * spring：物理弹簧，0→1（可 from/to），自然的“有生命力”的缓动
 *   const p = spring(ts, { fps, durationInFrames: fps * 0.5 });   // 拉伸到正好 0.5s 走完
 *   const x = interpolate(p, [0, 1], [0, 200]);                   // spring 当驱动器
 */

/**
 * 多段映射。input 必须递增；出界默认 clamp（extrapolate 可改）。
 * @param {number} x        当前值（通常是 t 或 ts）
 * @param {number[]} input  输入关键点，如 [0, 0.5]
 * @param {number[]} output 对应输出
 * @param {{clamp?: boolean, easing?: (u: number) => number}} [opts]
 *   clamp=false 时线性外推（少用；scale 外推会飞出画面）
 */
export function interpolate(x, input, output, opts = {}) {
  const clamp = opts.clamp !== false;
  const ease = opts.easing;
  const n = input.length;
  if (n !== output.length) throw new Error('interpolate: input/output length mismatch');
  if (n === 0) return 0;
  if (x <= input[0]) {
    if (clamp || n === 1) return output[0];
    const k = (x - input[0]) / (input[1] - input[0]);
    return output[0] + k * (output[1] - output[0]);
  }
  if (x >= input[n - 1]) {
    if (clamp || n === 1) return output[n - 1];
    const k = (x - input[n - 2]) / (input[n - 1] - input[n - 2]);
    return output[n - 1] + k * (output[n - 1] - output[n - 2]);
  }
  for (let i = 0; i < n - 1; i++) {
    if (x <= input[i + 1]) {
      let u = (x - input[i]) / (input[i + 1] - input[i]);
      if (ease) u = ease(u);
      return output[i] + u * (output[i + 1] - output[i]);
    }
  }
  return output[n - 1];
}

/** 常用缓动（都吃 0→1 的 u，返回 0→1）。入场默认 easeOutCubic/Back，出场 easeInQuad 更快。 */
export const Easing = {
  linear: (u) => u,
  inQuad: (u) => u * u,
  outQuad: (u) => u * (2 - u),
  outCubic: (u) => 1 - Math.pow(1 - u, 3),
  inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  /** 带一点回弹的出场（卡片落位很常用），c1=1.70158 */
  outBack: (u, c1 = 1.70158) => 1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2),
};

/** 物理弹簧的手感预设（mass/damping/stiffness 语义）。阻尼比 ζ = c / (2√(k·m))：ζ≈1 最快且不过冲。 */
export const SPRING = {
  /** 默认手感：ζ=0.5，带一点回弹（约 +16% 过冲），落位活 */
  bouncy: { mass: 1, damping: 10, stiffness: 100 },
  /** 临界阻尼 ζ=1：**既不回弹又最快收敛**——正文/大字入场用（回弹会让字抖）。
   *  （damping=100 也不回弹，但过阻尼 slow root 要 ~5s 才到位，实际很少直接用。） */
  noBounce: { mass: 1, damping: 20, stiffness: 100 },
  /** 紧致快弹：小质量高刚度，适合徽章/按钮这类小元素 */
  snappy: { mass: 0.6, damping: 14, stiffness: 220 },
  /** 迟缓厚重：大质量低刚度，适合大块面板/镜头级运动 */
  heavy: { mass: 2.4, damping: 26, stiffness: 60 },
};

/**
 * 阻尼谐振子弹簧 0→1（可 from/to）。**闭式解析解**——固定步长欧拉在 damping 大时会数值
 * 爆炸（实测 damping=100 @30fps 直接发散到 1e32），解析解对任意 mass/damping/stiffness 都稳定。
 * **纯函数**：只吃 t，解析式求值，乱序渲染/断点续渲结果一致。
 *
 * @param {number} t     当前时间（秒）
 * @param {{fps?: number, from?: number, to?: number, delay?: number,
 *          durationInFrames?: number, overshootClamping?: boolean,
 *          config?: {mass?: number, damping?: number, stiffness?: number}}} [opts]
 *
 * 语义：`durationInFrames` 把曲线拉伸到正好那么长（先按自然收敛时长算比例、按压缩后的
 * 时刻求值）；`delay` 让前几帧停在初值——**错峰入场**靠它（第 i 张卡片 delay = i×0.06s）；
 * `overshootClamping` 为 true 时不许越过目标。
 */
export function spring(t, opts = {}) {
  const fps = opts.fps || 30;
  const cfg = Object.assign({}, SPRING.bouncy, opts.config || {});
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const delay = opts.delay || 0;
  const clampOvershoot = !!opts.overshootClamping;

  const tRel = t - delay;
  if (tRel <= 0) return from;

  let evalT = tRel;
  if (opts.durationInFrames && opts.durationInFrames > 0) {
    const natural = naturalSettleSec(cfg);          // 自然收敛时长
    const want = opts.durationInFrames / fps;       // 想要的时长
    evalT = tRel * (natural / Math.max(1e-6, want)); // 拉伸/压缩时间轴
  }

  const m = cfg.mass, k = cfg.stiffness, c = cfg.damping;
  const w0 = Math.sqrt(k / m);                      // 无阻尼自然频率
  const zeta = c / (2 * Math.sqrt(k * m));          // 阻尼比
  const y0 = from - to;                             // 相对目标的初始偏移，初速 0
  let y;
  if (zeta < 1 - 1e-9) {                            // 欠阻尼：衰减振荡（默认手感，带一点回弹）
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    y = Math.exp(-zeta * w0 * evalT) *
        (y0 * Math.cos(wd * evalT) + (zeta * w0 / wd) * y0 * Math.sin(wd * evalT));
  } else if (zeta > 1 + 1e-9) {                     // 过阻尼：缓慢逼近、无振荡（noBounce 落在这一侧）
    const s = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + s, r2 = -zeta * w0 - s;
    const A = y0 * r2 / (r2 - r1);
    const B = y0 - A;
    y = A * Math.exp(r1 * evalT) + B * Math.exp(r2 * evalT);
  } else {                                          // 临界阻尼
    const e = Math.exp(-w0 * evalT);
    y = y0 * (1 + w0 * evalT) * e;
  }
  let x = to + y;
  if (clampOvershoot) {
    if (to >= from && x > to) x = to;
    if (to < from && x < to) x = to;
  }
  if (opts.durationInFrames) {
    const D = opts.durationInFrames / fps;
    if (tRel >= D) return to;                      // 到指定时长即落位
  }
  return x;
}

/** 自然收敛时长（秒）：解析解上二分找 |y|<0.001 的最早时刻。 */
function naturalSettleSec(cfg) {
  const m = cfg.mass, k = cfg.stiffness, c = cfg.damping;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const y0 = -1;
  const at = (tt) => {
    let y;
    if (zeta < 1 - 1e-9) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      y = Math.exp(-zeta * w0 * tt) * (y0 * Math.cos(wd * tt) + (zeta * w0 / wd) * y0 * Math.sin(wd * tt));
    } else if (zeta > 1 + 1e-9) {
      const s = w0 * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * w0 + s, r2 = -zeta * w0 - s;
      const A = y0 * r2 / (r2 - r1);
      y = A * Math.exp(r1 * tt) + (y0 - A) * Math.exp(r2 * tt);
    } else {
      y = y0 * (1 + w0 * tt) * Math.exp(-w0 * tt);
    }
    return Math.abs(y);
  };
  let lo = 0, hi = 0.5;
  while (hi < 30 && at(hi) > 0.001) hi *= 1.6;      // 先找到上界
  for (let i = 0; i < 48; i++) {                    // 再二分到足够精确
    const mid = (lo + hi) / 2;
    if (at(mid) > 0.001) lo = mid; else hi = mid;
  }
  return hi;
}

/**
 * 感知线性的缩放映射：scale 的**可见面积**随 scale² 变，直接线性插值会显得先慢后快。
 * 做法与惯用口径一致——先对输出取平方再插值、开方还原，任意区间都成立；
 * 半程时返回 sqrt(中点)，也就是“可见面积走了一半”。
 */
export function scaleInterpolate(x, input, output, opts = {}) {
  const sq = output.map((v) => v * v);
  const raw = interpolate(x, input, sq, opts);
  return Math.sign(raw) * Math.sqrt(Math.abs(raw));
}
