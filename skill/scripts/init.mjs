#!/usr/bin/env node
/**
 * Scaffold a music-code-mv project from the template.
 *   usage: node init.mjs <dir> [--force] [--preset=<id>]
 *          node init.mjs --list-presets
 * 预设见 ../presets/*.json：一次给好配色、后期、时长、分镜与占位歌词，生成即可渲染。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', 'template');
const PRESETS = path.join(HERE, '..', 'presets');
const args = process.argv.slice(2);
const force = args.includes('--force');
const presetArg = args.find(a => a.startsWith('--preset='));
const presetId = presetArg ? presetArg.slice('--preset='.length) : '';
const target = args.find(a => !a.startsWith('--'));

/** 读一个预设 / load one preset by id. */
function loadPreset(id) {
  const file = path.join(PRESETS, id + '.json');
  if (!fs.existsSync(file)) {
    const all = fs.existsSync(PRESETS) ? fs.readdirSync(PRESETS).filter(n => n.endsWith('.json')).map(n => n.replace('.json', '')) : [];
    throw new Error('unknown preset "' + id + '" (available: ' + all.join(', ') + ')');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (args.includes('--list-presets')) {
  const files = fs.existsSync(PRESETS) ? fs.readdirSync(PRESETS).filter(n => n.endsWith('.json')).sort() : [];
  for (const name of files) {
    const p = JSON.parse(fs.readFileSync(path.join(PRESETS, name), 'utf8'));
    console.log(String(p.id).padEnd(14) + String(p.title || '').padEnd(24) + (p.summary || ''));
  }
  process.exit(0);
}

if (!target) { console.error('usage: node init.mjs <project-dir> [--force] [--preset=<id>]'); process.exit(2); }

const dest = path.resolve(target);
if (fs.existsSync(dest) && fs.readdirSync(dest).length && !force) {
  console.error('directory not empty: ' + dest + '  (use --force to overwrite)');
  process.exit(2);
}
fs.mkdirSync(dest, { recursive: true });

const name = path.basename(dest);
function copy(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); }
    else {
      let text = fs.readFileSync(s, 'utf8');
      text = text.split('__NAME__').join(name);
      fs.writeFileSync(d, text, 'utf8');
    }
  }
}
copy(TEMPLATE, dest);

// make the shared node_modules reachable from the project root for /node_modules/ serving
const parent = path.dirname(dest);
if (fs.existsSync(path.join(parent, 'node_modules')) && !fs.existsSync(path.join(dest, 'node_modules'))) {
  try { fs.symlinkSync(path.join(parent, 'node_modules'), path.join(dest, 'node_modules'), 'junction'); }
  catch { /* render.mjs also walks up to find node_modules */ }
}

// ---- 应用预设：配色 / 后期 / 时长 / 分镜 / 占位歌词 ----
const NL = String.fromCharCode(10);
if (presetId) {
  let preset;
  try { preset = loadPreset(presetId); }
  catch (e) { console.error(String(e.message || e)); process.exit(2); }
  const projFile = path.join(dest, 'project.json');
  const project = JSON.parse(fs.readFileSync(projFile, 'utf8'));
  if (preset.palette) project.palette = { ...project.palette, ...preset.palette };
  if (preset.fx) project.fx = { ...project.fx, ...preset.fx };
  if (preset.duration) project.duration = preset.duration;
  project.preset = preset.id;
  fs.writeFileSync(projFile, JSON.stringify(project, null, 2) + NL, 'utf8');
  if (preset.storyboard && Array.isArray(preset.storyboard.shots)) {
    const rows = preset.storyboard.shots.map((s, i) =>
      '| ' + (i + 1) + ' | ' + s.id + ' | ' + s.start + '–' + s.end + ' | ' + s.what + ' | ' + s.style + ' | ' + (s.lyric || '—') + ' |');
    fs.writeFileSync(path.join(dest, 'storyboard.md'), [
      '# ' + name + ' — storyboard（preset: ' + preset.id + '）', '',
      preset.storyboard.summary || '', '',
      '| # | shot id | start–end | what happens | style | lyric cue |',
      '|---|---|---|---|---|---|',
      ...rows, '',
      '## Palette', '',
      '```json', JSON.stringify(preset.palette || {}, null, 2), '```', '',
      '## Rules',
      '- The renderer owns time. Nothing in src/scenes/ may read the wall clock or call Math.random().',
      '- After every change: render a contact sheet, then actually look at it.',
      ''
    ].join(NL), 'utf8');
  }
  if (Array.isArray(preset.lyrics) && preset.lyrics.length) {
    fs.writeFileSync(path.join(dest, 'lyrics.lrc'), preset.lyrics.join(NL) + NL, 'utf8');
  }
}

const rel = (p) => path.relative(process.cwd(), p) || '.';
console.log('scaffolded ' + dest + (presetId ? '  (preset: ' + presetId + ')' : ''));
console.log('');
console.log('next:');
console.log('  1. edit storyboard.md  — shots, seconds, lyric cues, palette');
console.log('  2. edit project.json   — width/height/fps/duration/palette/lyrics');
console.log('  3. edit src/scenes/    — one module per shot, registered in src/scenes/index.js');
console.log('  4. node ' + rel(path.join(HERE, 'render.mjs')) + ' --project=' + rel(dest) + ' --contact');
console.log('     then READ the contact sheet PNG and fix what you see');
console.log('  5. node ' + rel(path.join(HERE, 'render.mjs')) + ' --project=' + rel(dest) + ' --out=out/video.mp4');
