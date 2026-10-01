import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_DIR = path.join(PLUGIN_ROOT, 'skill');
export const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');

/** Run one of the bundled music-code-mv scripts with the current Node executable. */
export function runScript(scriptName, args, opts = {}) {
  const script = path.join(SCRIPTS_DIR, scriptName);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...(opts.env || {}) },
      windowsHide: true
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => resolve({ code: -1, stdout: out, stderr: String((e && e.message) || e) }));
    child.on('close', (code) => {
      const limit = opts.limit || 20000;
      resolve({
        code: code === null ? -1 : code,
        stdout: out.length > limit
          ? out.slice(0, 2000) + '\n...[' + (out.length - limit) + ' chars omitted]...\n' + out.slice(-limit)
          : out,
        stderr: err.length > 6000 ? err.slice(-6000) : err
      });
    });
  });
}

/** Turn a script result into a compact text block for the model. */
export function formatResult(title, r, extra = {}) {
  const lines = ['## ' + title, 'exit: ' + r.code];
  if (extra.note) lines.push(extra.note);
  if (r.stdout && r.stdout.trim()) lines.push('', r.stdout.trim());
  if (r.stderr && r.stderr.trim()) lines.push('', 'stderr:', r.stderr.trim());
  return lines.join('\n');
}
