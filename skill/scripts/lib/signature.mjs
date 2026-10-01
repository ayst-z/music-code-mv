import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Incremental rendering.
 *
 * A frame is reused when BOTH the file exists and its render signature is
 * unchanged. The signature covers everything that can change the pixels:
 * size/fps, project.json, and the source of every scene live at that frame.
 *
 * Scenes may declare `deps: ['./src/style.js']` to narrow the blast radius of a
 * change. Without deps a scene falls back to the whole src/ tree, which is
 * correct but conservative.
 */
export function fileHash(p) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
  } catch {
    return 'missing';
  }
}

/** Hash every file under a directory tree, order-stable. */
export function treeHash(dir) {
  const h = crypto.createHash('sha1');
  const walk = (d, base) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, base);
      else {
        h.update(path.relative(base, p));
        try { h.update(fs.readFileSync(p)); } catch { /* ignore */ }
      }
    }
  };
  walk(dir, dir);
  return h.digest('hex').slice(0, 12);
}

/**
 * Hash a module and everything it imports, transitively.
 * This is what makes per-scene invalidation automatic: a scene only re-renders
 * when its own file, or something it actually imports, changed.
 */
function transitiveHash(file, seen = new Set(), depth = 0) {
  const h = crypto.createHash('sha1');
  const visit = (f, d) => {
    if (d > 8) return;
    const key = path.resolve(f);
    if (seen.has(key)) return;
    seen.add(key);
    let src = '';
    try { src = fs.readFileSync(key, 'utf8'); } catch { return; }
    h.update(path.basename(key));
    h.update(src);
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const base = path.resolve(path.dirname(key), spec);
      for (const cand of [base, base + '.js', base + '.mjs', path.join(base, 'index.js')]) {
        try {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { visit(cand, d + 1); break; }
        } catch { /* ignore */ }
      }
    }
  };
  visit(file, depth);
  return h.digest('hex').slice(0, 12);
}

/**
 * Map scene id -> dependency hash by reading src/scenes/*.js.
 * The renderer only receives {id, start, end} from the page, so the file layout
 * is recovered here: the scene file declares `id: '...'` and its imports are
 * resolved relative to that file.
 */
export function scanSceneModules(projectDir) {
  const dir = path.join(projectDir, 'src', 'scenes');
  const map = new Map();
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return map; }
  for (const f of files) {
    if (!f.endsWith('.js') || f === 'index.js') continue;
    const full = path.join(dir, f);
    let src = '';
    try { src = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const idm = /id:\s*['"`]([^'"`]+)['"`]/.exec(src);
    if (!idm) continue;
    map.set(idm[1], transitiveHash(full));
  }
  return map;
}

export function createSignature(projectDir, { width, height, fps, duration }) {
  let globalSrc = 'none';
  try { globalSrc = treeHash(path.join(projectDir, 'src')); } catch { /* ignore */ }
  const projectJson = fileHash(path.join(projectDir, 'project.json'));
  const base = [width, height, fps, duration, projectJson].join('|');
  const sceneCache = new Map();
  const scanned = scanSceneModules(projectDir);

  function sceneSig(scene) {
    if (sceneCache.has(scene.id)) return sceneCache.get(scene.id);
    let sig;
    if (Array.isArray(scene.deps) && scene.deps.length) {
      // explicit deps always win
      sig = 'deps:' + scene.deps.map(d => d + ':' + fileHash(path.resolve(projectDir, d))).join(',');
    } else if (scanned.has(scene.id)) {
      // automatic: the scene file plus its transitive imports
      sig = 'auto:' + scanned.get(scene.id);
    } else {
      // unknown layout: be conservative, any src change invalidates
      sig = 'global:' + globalSrc;
    }
    sceneCache.set(scene.id, sig);
    return sig;
  }

  return {
    /** Signature for one frame given the scenes covering it. */
    forFrame(scenes) {
      const ids = scenes.map(s => s.id + '#' + sceneSig(s)).sort().join('+');
      return crypto.createHash('sha1').update(base + '|' + ids).digest('hex').slice(0, 16);
    },
    globalSrc,
    projectJson
  };
}

export function loadSignatures(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
export function saveSignatures(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}
