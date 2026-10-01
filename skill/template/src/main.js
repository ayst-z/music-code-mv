import { createStage } from './stage.js';
import { Timeline } from './timeline.js';
import { loadLyrics, lyricAt } from './lyrics.js';
import scenes from './scenes/index.js';

const MV = window.__MV__ || { width: 1280, height: 720, fps: 30, duration: 12 };

/** Preload images listed in project.json "assets" so renderAt never awaits. */
async function loadImages(list) {
  const out = {};
  await Promise.all((list || []).map(src => new Promise((res) => {
    const img = new Image();
    img.onload = () => { out[src] = img; res(); };
    img.onerror = () => { res(); };
    img.src = src;
  })));
  return out;
}

async function boot() {
  const project = await fetch('./project.json').then(r => r.json()).catch(() => ({}));
  const stage = createStage({ width: MV.width, height: MV.height });
  const images = await loadImages(project.assets);
  const lyrics = await loadLyrics(project.lyrics, stage);
  const timeline = new Timeline(scenes, project);

  const env = {
    w: MV.width, h: MV.height, fps: MV.fps, duration: MV.duration,
    project,
    palette: project.palette || {
      bg: '#04060c', base: '#5eead4', accent: '#22d3ee',
      hot: '#ff2fa0', text: '#e8f7ff', dim: '#1d4b73'
    },
    lyrics,
    images,
    lyricAt: (t) => lyricAt(lyrics, t),
    stage
  };

  // The one contract the renderer depends on: a pure function of virtual time.
  window.renderAt = (t) => {
    stage.begin(t);
    timeline.draw(stage, t, env);
    stage.end(t, env);
  };
  // exposed for debugging: page.evaluate(() => MV.env.lyrics.length)
  window.MV = { env, timeline, shotAt: (t) => timeline.shotAt(t) };

  window.renderAt(0);
  await document.fonts.ready.catch(() => {});
  window.renderAt(0);
  window.__ready = true;
}

boot();
