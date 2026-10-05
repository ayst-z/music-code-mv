/**
 * 逐词字幕 / word-timed captions —— 纯数据 + 纯函数，时间只来自参数本身。
 *
 *   import { captionPages, pageAt, tokenIndexAt, wordsFromLine } from './captions.js';
 *
 * 数据形状（标准 caption 记录，段级或词级都用它）：
 *   { text, startMs, endMs, timestampMs, confidence }
 *   text 对空格敏感：**每个词前带空格**（分页靠空格断词），画布渲染要自己保留空格。
 *
 * 用途：分组分页（一页 2–4 词或整句）→ 每页 tokens 逐词高亮 = 卡拉OK/打字机效果。
 */

/**
 * 把词级 captions 分成「页」（一屏一组词）。
 * 规则：页内累计时长超过 combineMs 就在**下一个以空格开头的 caption** 处断页；
 * breakOnSilenceMs 给定后，与上一词的间隙 ≥ 该值也断页（0 = 每词一页）；
 * 每页的 durationMs = 下一页的起始 - 本页起始（让字幕在停顿期间继续在屏）。
 *
 * @param {{text:string,startMs:number,endMs:number}[]} captions
 * @param {{combineTokensWithinMilliseconds?: number, breakOnSilenceAfterMilliseconds?: number}} [opts]
 * @returns {{text:string,startMs:number,durationMs:number,
 *            tokens:{text:string,fromMs:number,toMs:number}[]}[]}
 */
export function captionPages(captions, opts = {}) {
  const combine = opts.combineTokensWithinMilliseconds ?? 1200;
  const silence = opts.breakOnSilenceAfterMilliseconds;
  const out = [];
  let cur = null;

  const close = (endMs) => {
    if (!cur) return;
    cur.durationMs = Math.max(0, (endMs ?? cur.lastEnd) - cur.startMs);
    delete cur.lastEnd;
    out.push(cur);
    cur = null;
  };

  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    const startsWithSpace = /^\s/.test(c.text);
    if (cur && startsWithSpace) {
      const pageDur = c.endMs - cur.startMs;
      const gap = c.startMs - cur.lastEnd;
      const durBreak = pageDur > combine;
      const silenceBreak = silence !== undefined && silence !== null &&
        (silence === 0 ? true : gap >= silence);
      if (durBreak || silenceBreak) close(c.startMs);   // 断在下一页的起点上
    }
    if (!cur) {
      // 新页：页文本去前导空格（token 保留原样——空格是断词标记，逐词渲染靠它对齐）
      cur = { text: startsWithSpace ? c.text.trimStart() : c.text,
              startMs: c.startMs, durationMs: 0, tokens: [], lastEnd: c.endMs };
      cur.tokens.push({ text: c.text, fromMs: c.startMs, toMs: c.endMs });
      continue;                                        // 本条已入页
    }
    cur.text += c.text;
    cur.tokens.push({ text: c.text, fromMs: c.startMs, toMs: c.endMs });
    cur.lastEnd = c.endMs;
  }
  if (cur) close(cur.lastEnd);
  // 每页时长延到下一页起点（停顿期间字幕仍在屏）
  for (let i = 0; i < out.length - 1; i++) {
    out[i].durationMs = Math.max(out[i].durationMs, out[i + 1].startMs - out[i].startMs);
  }
  return out;
}

/** 当前时刻的页（abs ms）；越界返回 null。 */
export function pageAt(pages, ms) {
  for (const p of pages) {
    if (ms >= p.startMs && ms < p.startMs + p.durationMs) return p;
  }
  return null;
}

/** 页内当前高亮词下标（卡拉OK）；不在任何词区间返回 -1。 */
export function tokenIndexAt(page, ms) {
  if (!page) return -1;
  const n = page.tokens.length;
  for (let i = 0; i < n; i++) {
    if (ms >= page.tokens[i].fromMs && ms < page.tokens[i].toMs) return i;
  }
  // 尾部余量：最后的词到页尾保持高亮，词间隙归前一词
  for (let i = n - 1; i >= 0; i--) {
    if (ms >= page.tokens[i].toMs && ms < page.startMs + page.durationMs) return i;
    if (ms < page.tokens[i].fromMs) continue;
  }
  return n ? 0 : -1;
}

/**
 * 段级时间 → 词级估计：一段只有一个起止时（LRC/旁白段级），按**字重**把时长分给每个词。
 * 确定性、纯函数；这是**估算**——真对齐（强制对齐/Whisper）到位后，把产出直接喂 captionPages 即可。
 * 中文按字计 1，西文按字符 0.6（近似说话耗时），标点不占时。
 *
 * @param {{text:string,startMs:number,endMs:number}} seg
 * @returns {{text:string,startMs:number,endMs:number}[]} 每个词一条（词前带空格，除句首）
 */
export function wordsFromLine(seg) {
  const raw = String(seg.text || '').trim();
  if (!raw) return [];
  // 中文按字切、西文按词切，混合文本也能工作
  const units = raw.match(/[一-鿿]|[^\s一-鿿]+/g) || [];
  const weights = units.map((u) => {
    if (/[一-鿿]/.test(u)) return u.length;
    if (/[\p{L}\p{N}]/u.test(u)) return u.length * 0.6;
    return 0.12;                                   // 标点：几乎不占时但保留节拍
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(1, seg.endMs - seg.startMs);
  let t = seg.startMs;
  return units.map((u, i) => {
    const dur = (weights[i] / total) * span;
    const w = { text: (i === 0 ? u : ' ' + u), startMs: Math.round(t), endMs: Math.round(t + dur) };
    t += dur;
    return w;
  });
}
