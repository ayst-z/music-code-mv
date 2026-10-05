/**
 * 排版适配 / typography fitting —— 算出「正好放下」的字号与换行。
 *
 *   import { fitFont, wrapLines, fitWrap } from './textfit.js';
 *
 * **使用了 Remotion 库（MIT 许可，https://remotion.dev）`fitText()` 的接口语义**
 * （给容器宽算字号、字体先加载、测量与渲染同一样式）；实现为自写 Canvas 版：
 * `measureText` 的宽度对字号是**线性**的，所以一次测量即可精确解，不需要二分。
 *
 * 三个函数都吃一个 `ctx`（或任何带 `font` 与 `measureText` 的对象）——node 里测试可注入 mock。
 */

function withFont(ctx, font, fn) {
  const prev = ctx.font;
  if (font) ctx.font = font;
  try { return fn(); } finally { if (font) ctx.font = prev; }
}

/**
 * 正好放进 withinWidth 的字号（px）。
 * @param {{font:string, measureText:(s:string)=>{width:number}}} ctx
 * @param {string} text 单行文本（换行请用 wrapLines/fitWrap）
 * @param {number} withinWidth 容器宽（px）
 * @param {{font?:string, maxSize?:number, minSize?:number}} [opts]
 *   maxSize/minSize 常用（标题别超过80、别小于可读下限——超界时返回边界值）
 */
export function fitFont(ctx, text, withinWidth, opts = {}) {
  const font = opts.font || ctx.font;
  const base = 100;
  // 必须**在基准字号下测量**（线性折算只在同一次测量的字号上成立）
  const w = withFont(ctx, bumpFont(font, base), () => ctx.measureText(String(text ?? '')).width);
  if (!(w > 0) || !(withinWidth > 0)) return opts.minSize ?? base;
  let size = (withinWidth * base) / w;
  if (opts.maxSize !== undefined) size = Math.min(size, opts.maxSize);
  if (opts.minSize !== undefined) size = Math.max(size, opts.minSize);
  return size;
}

/**
 * 按容器宽贪心换行。中日韩没有空格 → **逐字断**；西文按空格断；
 * 显式 `\n` 永远断行。
 * @param {{font:string, measureText:(s:string)=>{width:number}}} ctx
 * @returns {string[]} 行数组（至少一行）
 */
export function wrapLines(ctx, text, maxWidth, opts = {}) {
  const font = opts.font || ctx.font;
  const src = String(text ?? '');
  if (!src) return [''];
  return withFont(ctx, font, () => {
    const lines = [];
    let line = '';
    const flush = () => { if (line !== '') { lines.push(line); line = ''; } };
    // 先按显式换行分段，段内贪心
    for (const para of src.split('\n')) {
      // CJK 逐字、西文整词（按空格/标点成块），避免把英文单词从中间劈开
      const units = para.match(/[　-鿿]|\s+|[^\s　-鿿]+/g) || [];
      for (const u of units) {
        const cand = line + u;
        if (line !== '' && ctx.measureText(cand).width > maxWidth) {
          flush();
          if (/^\s+$/.test(u)) continue;        // 行首不留空格
          line = u;
        } else {
          line = cand;
        }
        // 安全阀：单个单元（超长英文词/连续符号）本身就超宽 → 空行上按字硬切
        if (line !== '' && ctx.measureText(line).width > maxWidth && line.length > 1) {
          const chars = Array.from(line);
          let cut = 0;
          while (cut < chars.length && ctx.measureText(chars.slice(0, cut + 1).join('')).width <= maxWidth) cut++;
          if (cut > 0 && cut < chars.length) {
            lines.push(chars.slice(0, cut).join(''));
            line = chars.slice(cut).join('');
          }
        }
      }
      flush();
    }
    return lines.length ? lines : [''];
  });
}

/**
 * 宽 + 行数双约束：先按最宽行求字号，再看行数超没超——超了按行数二次收缩并重排。
 * @returns {{fontSize:number, lines:string[]}} 字号 + 换行结果（两者自洽）
 */
export function fitWrap(ctx, text, opts = {}) {
  const withinWidth = opts.withinWidth ?? 400;
  const maxLines = opts.maxLines ?? Infinity;
  const font = opts.font || ctx.font;
  const base = 100;
  // 以 base 字号先排版 → 量最宽行 → 线性反推字号
  const measure = (s, f) => withFont(ctx, f, () => ctx.measureText(s).width);
  // 在 base 字号 + **真实容器宽**下排一次（这就是 base 字号的布局），量最宽行线性反推
  const probeFont = bumpFont(font, base);
  let lines = wrapLines(ctx, text, withinWidth, { font: probeFont });
  const widest = lines.reduce((m, l) => Math.max(m, measure(l, probeFont)), 0);
  let fontSize = widest > 0 ? (withinWidth * base) / widest : base;
  if (opts.maxSize !== undefined) fontSize = Math.min(fontSize, opts.maxSize);
  if (opts.minSize !== undefined) fontSize = Math.max(fontSize, opts.minSize);

  let outFont = bumpFont(font, fontSize);
  lines = wrapLines(ctx, text, withinWidth, { font: outFont });
  // 行数超限：字号 × maxLines/lines 再排一次（一次收敛，不迭代振荡）
  if (lines.length > maxLines && Number.isFinite(maxLines) && maxLines >= 1) {
    fontSize = fontSize * (maxLines / lines.length);
    if (opts.minSize !== undefined) fontSize = Math.max(fontSize, opts.minSize);
    outFont = bumpFont(font, fontSize);
    lines = wrapLines(ctx, text, withinWidth, { font: outFont });
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);   // 极端长词兜底
  }
  return { fontSize, lines };
}

/** 把 'bold 48px X' 里的字号换成 n（无字号则补 16px）。 */
export function bumpFont(font, n) {
  if (/\d+(\.\d+)?px/.test(font)) return font.replace(/(\d+(\.\d+)?)px/, n + 'px');
  return n + 'px ' + font;
}
