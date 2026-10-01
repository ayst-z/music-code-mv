/**
 * LRC lyrics: [mm:ss.xx] line  (plus a graceful empty fallback).
 * Parsing happens once at boot, never during rendering.
 */
export async function loadLyrics(url) {
  if (!url) return [];
  let text = '';
  try { text = await (await fetch(url)).text(); } catch { return []; }
  const out = [];
  const re = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/;
  for (const raw of text.split(/\r?\n/)) {
    const m = re.exec(raw);
    if (!m) continue;
    const t = Number(m[1]) * 60 + Number(m[2]);
    const line = m[3].trim();
    if (line) out.push({ t, text: line });
  }
  out.sort((a, b) => a.t - b.t);
  for (let i = 0; i < out.length; i++) {
    out[i].until = i + 1 < out.length ? out[i + 1].t : out[i].t + 4;
  }
  return out;
}

/** The lyric line live at time t (holds each line until the next cue). */
export function lyricAt(lyrics, t) {
  if (!lyrics || !lyrics.length) return null;
  let cur = null;
  for (const l of lyrics) { if (l.t <= t) cur = l; else break; }
  if (!cur) return null;
  return { t: cur.t, text: cur.text, until: cur.until, age: t - cur.t, life: Math.max(0.001, cur.until - cur.t) };
}
