#!/usr/bin/env node
/** Scaffold a music-code-mv project from the template.  usage: node init.mjs <dir> [--force] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', 'template');
const args = process.argv.slice(2);
const force = args.includes('--force');
const target = args.find(a => !a.startsWith('--'));
if (!target) { console.error('usage: node init.mjs <project-dir> [--force]'); process.exit(2); }

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

const rel = (p) => path.relative(process.cwd(), p) || '.';
console.log('scaffolded ' + dest);
console.log('');
console.log('next:');
console.log('  1. edit storyboard.md  — shots, seconds, lyric cues, palette');
console.log('  2. edit project.json   — width/height/fps/duration/palette/lyrics');
console.log('  3. edit src/scenes/    — one module per shot, registered in src/scenes/index.js');
console.log('  4. node ' + rel(path.join(HERE, 'render.mjs')) + ' --project=' + rel(dest) + ' --contact');
console.log('     then READ the contact sheet PNG and fix what you see');
console.log('  5. node ' + rel(path.join(HERE, 'render.mjs')) + ' --project=' + rel(dest) + ' --out=out/video.mp4');
