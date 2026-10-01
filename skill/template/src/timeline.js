/**
 * Scene scheduler. A scene is { id, start, end, draw(stage, tLocal, env, progress) }.
 * Overlapping scenes composite in array order — later entries paint on top.
 *
 * Each scene is handed its OWN local time, while env.t holds global timeline time.
 * Lyrics, beats and anything spanning several shots must use env.t, never tLocal.
 */
export class Timeline {
  constructor(scenes, project) {
    this.scenes = (scenes || []).filter(Boolean).slice().sort((a, b) => a.start - b.start);
    this.project = project || {};
  }

  active(t) {
    return this.scenes.filter(s => t >= s.start && t < s.end);
  }

  shotAt(t) {
    const a = this.active(t);
    return a.length ? a[a.length - 1].id : 'gap';
  }

  draw(stage, t, env) {
    const active = this.active(t);
    if (!active.length) { stage.background(env.palette.bg); return; }
    for (const s of active) {
      const dur = Math.max(1e-6, s.end - s.start);
      const local = t - s.start;
      const p = Math.min(1, Math.max(0, local / dur));
      env.t = t;              // global time — use for lyrics and beats
      env.local = local;      // this shot's own time
      env.fx = s.fx || null;  // optional per-scene finishing-pass override
      stage.ctx.save();
      try { s.draw(stage, local, env, p); }
      catch (e) { console.error('scene "' + s.id + '" failed at t=' + t + ': ' + e.message); }
      stage.ctx.restore();
    }
  }

  get extent() {
    if (!this.scenes.length) return { start: 0, end: 0 };
    return {
      start: Math.min(...this.scenes.map(s => s.start)),
      end: Math.max(...this.scenes.map(s => s.end))
    };
  }
}
