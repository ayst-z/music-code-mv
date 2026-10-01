#!/usr/bin/env node
/**
 * Copy the workspace skill (skills/music-code-mv) into the plugin bundle (skill/).
 * The skill is the single source of truth; the plugin ships a snapshot of it so
 * "dsh plugin add" delivers a working toolchain with no extra steps.
 *
 *   node sync-skill.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'skills', 'music-code-mv');
const DEST = path.join(HERE, 'skill');
const check = process.argv.includes('--check');

if (!fs.existsSync(SRC)) {
  console.error('source skill not found: ' + SRC);
  process.exit(2);
}

function walk(dir, base = dir, out = new Map()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.set(path.relative(base, p), fs.readFileSync(p));
  }
  return out;
}

const src = walk(SRC);
const dest = fs.existsSync(DEST) ? walk(DEST) : new Map();
const diffs = [];
for (const [rel, buf] of src) {
  const other = dest.get(rel);
  if (!other || !other.equals(buf)) diffs.push(rel);
}
for (const rel of dest.keys()) if (!src.has(rel)) diffs.push(rel + ' (extra in bundle)');

if (check) {
  if (diffs.length) {
    console.error('bundle is OUT OF SYNC (' + diffs.length + '):\n  ' + diffs.join('\n  '));
    process.exit(1);
  }
  console.log('bundle is in sync (' + src.size + ' files)');
  process.exit(0);
}

fs.rmSync(DEST, { recursive: true, force: true });
let n = 0;
for (const [rel, buf] of src) {
  const out = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  n++;
}
console.log('synced ' + n + ' files: ' + SRC + ' -> ' + DEST);
