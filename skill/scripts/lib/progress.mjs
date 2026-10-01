/**
 * Single-line progress bar with throughput and ETA.
 * Falls back to periodic plain lines when stdout is not a TTY (CI, log files).
 */
export function createProgress({ total, label = 'render', enabled = true }) {
  const tty = enabled && process.stdout.isTTY;
  const started = Date.now();
  let lastDraw = 0;
  let lastDone = 0;
  let lastAt = started;
  let emaFps = 0;
  let maxLine = 0;

  const BAR = 24;

  function fmtDuration(ms) {
    if (!isFinite(ms) || ms < 0) return '--:--';
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0
      ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
      : m + ':' + String(sec).padStart(2, '0');
  }

  return {
    /** @param {number} done frames finished (rendered + reused) */
    update(done, extra = {}) {
      if (!enabled) return;
      const now = Date.now();
      const dt = (now - lastAt) / 1000;
      if (dt >= 0.25 && done > lastDone) {
        const inst = (done - lastDone) / dt;
        emaFps = emaFps ? emaFps * 0.75 + inst * 0.25 : inst;
        lastDone = done;
        lastAt = now;
      }
      if (tty && now - lastDraw < 120) return;
      if (!tty && now - lastDraw < 4000) return;
      lastDraw = now;

      const pct = total > 0 ? Math.min(1, done / total) : 0;
      const filled = Math.round(pct * BAR);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR - filled);
      const eta = emaFps > 0 ? ((total - done) / emaFps) * 1000 : NaN;
      let line = '  [' + bar + '] ' + String((pct * 100).toFixed(1)).padStart(5) + '%  ' +
        String(done).padStart(String(total).length) + '/' + total;
      if (emaFps > 0) line += '  ' + emaFps.toFixed(1) + ' fps';
      line += '  ETA ' + fmtDuration(eta);
      if (extra.note) line += '  ' + extra.note;

      if (tty) {
        const pad = maxLine > line.length ? ' '.repeat(maxLine - line.length) : '';
        process.stdout.write('\r' + line + pad);
        maxLine = Math.max(maxLine, line.length);
      } else {
        console.log('[' + label + '] ' + line.trim());
      }
    },
    done(note) {
      if (tty) process.stdout.write('\r' + ' '.repeat(maxLine + 2) + '\r');
      if (note) console.log('  ' + note);
    },
    get fps() { return emaFps; },
    get elapsedMs() { return Date.now() - started; }
  };
}

/** Parse "##PROGRESS <done> <total>" lines emitted by workers. */
export function parseProgressLine(line) {
  const m = /^##PROGRESS (\d+) (\d+)$/.exec(line.trim());
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
}
