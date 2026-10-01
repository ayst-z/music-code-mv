/**
 * dsh-music-code-mv — DSH plugin exposing the music-code-mv toolchain.
 *
 * Plain ESM on purpose: a bundle installed from git is never built, so shipping
 * JavaScript means "dsh plugin add" works with no prepare script and no build
 * permission prompt. Types live in JSDoc.
 *
 * Registers six tools on ctx.tools:
 *   music_mv_guide   read the music-code-mv skill / reference docs
 *   music_mv_probe   check the local toolchain (node / chrome / ffmpeg / puppeteer)
 *   music_mv_init    scaffold a new MV project from the bundled template
 *   music_mv_render  render a contact sheet, stills, or a full MP4
 *   music_mv_lyrics  inject an LRC file into a project and report its cues
 *   music_mv_diff    compare two rendered frames (sha1 first, ffmpeg PSNR after)
 *
 * Every heavy lift is delegated to the bundled scripts in skill/scripts, which is
 * the same code path the skill uses when driven directly.
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import Schema from '@deepseek-ai/schemastery';
import { SKILL_DIR, PLUGIN_ROOT, runScript, formatResult } from './lib/runner.js';
import { runFfmpeg } from './skill/scripts/lib/encode.mjs';

export const name = 'music-code-mv';
export const inject = ['tools'];

/**
 * @typedef {object} Config
 * @property {string} projectsDir   default directory for scaffolded projects
 * @property {boolean} softwareGl   force software WebGL (needed with no usable GPU)
 * @property {'png'|'jpeg'} frameFormat  intermediate frame format; jpeg is ~3x faster at 4K
 * @property {string} [chromePath]  override the Chrome/Edge executable
 * @property {string} [ffmpegPath]  override the ffmpeg executable
 */

/** @type {import('@deepseek-ai/schemastery').default<Config>} */
export const Config = Schema.object({
  projectsDir: Schema.string().default('mv'),
  softwareGl: Schema.boolean().default(true),
  frameFormat: Schema.union(['png', 'jpeg']).default('jpeg'),
  chromePath: Schema.string(),
  ffmpegPath: Schema.string()
});

const READABLE = {
  skill: path.join(SKILL_DIR, 'SKILL.md'),
  styles: path.join(SKILL_DIR, 'reference', 'styles.md'),
  techniques: path.join(SKILL_DIR, 'reference', 'techniques.md'),
  threejs: path.join(SKILL_DIR, 'reference', 'threejs.md'),
  environment: path.join(SKILL_DIR, 'reference', 'environment.md'),
  lineage: path.join(SKILL_DIR, 'reference', 'lineage.md')
};

const textTool = (name, description, parameters, run) => defineTool({
  name,
  description,
  parameters,
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }]
  },
  execute: run
});

/** One cue: [mm:ss.xx] lyric — same grammar as template/src/lyrics.js. */
const LRC_CUE = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/;
/** Metadata header: [ar:…] [ti:…] [length:…] — legal LRC, never a cue. */
const LRC_TAG = /^\s*\[[A-Za-z_][A-Za-z0-9_]*:.*\]\s*$/;

/**
 * Parse LRC text into time-sorted cues.
 * Blank lines and [key:value] headers are skipped; anything else that is not a
 * valid [mm:ss.xx] cue throws with the offending line number so the caller can
 * fix the input in one pass. Parsing happens before any file is written.
 */
function parseLrc(text) {
  const cues = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const m = LRC_CUE.exec(raw);
    if (m) {
      const line = m[3].trim();
      if (line) cues.push({ t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000) / 1000, text: line });
      continue;
    }
    if (LRC_TAG.test(raw)) continue;
    throw new Error('malformed LRC at line ' + (i + 1) + ': "' + raw.trim() +
      '" — expected [mm:ss.xx] lyric text (or a [key:value] header)');
  }
  cues.sort((a, b) => a.t - b.t);
  return cues;
}

/** Resolve frames/f%05d.jpg for frame n (png projects fall back to .png). */
function findFrame(projectDir, n) {
  const base = path.join(projectDir, 'frames', 'f' + String(n).padStart(5, '0'));
  if (fs.existsSync(base + '.jpg')) return base + '.jpg';
  if (fs.existsSync(base + '.png')) return base + '.png';
  return null;
}

/** The name we looked for first — quoted verbatim in "missing frame" errors. */
function expectedFrame(projectDir, n) {
  return path.join(projectDir, 'frames', 'f' + String(n).padStart(5, '0') + '.jpg');
}

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

const textBlock = (text) => [{ type: 'text', text }];

export function apply(ctx, config) {
  const cfg = config || {};

  const commonFlags = () => {
    const f = [];
    if (cfg.chromePath) f.push('--chrome=' + cfg.chromePath);
    if (cfg.ffmpegPath) f.push('--ffmpeg=' + cfg.ffmpegPath);
    return f;
  };

  /** Same resolution ladder render.mjs uses: config, env, local static builds, PATH. */
  const findFfmpeg = (startDir) => {
    for (const c of [cfg.ffmpegPath, process.env.FFMPEG_PATH]) if (c && fs.existsSync(c)) return c;
    const rels = [
      'node_modules/ffmpeg-static/ffmpeg.exe', 'node_modules/ffmpeg-static/ffmpeg',
      'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe',
      'node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
      'node_modules/@ffmpeg-installer/darwin-x64/ffmpeg'
    ];
    for (const start of [startDir, PLUGIN_ROOT]) {
      let d = path.resolve(start);
      for (let i = 0; i < 12; i++) {
        for (const rel of rels) {
          const p = path.join(d, rel);
          if (fs.existsSync(p)) return p;
        }
        const up = path.dirname(d);
        if (up === d) break;
        d = up;
      }
    }
    return 'ffmpeg';
  };

  ctx.tools.register(textTool(
    'music_mv_guide',
    'Read the music-code-mv authoring guide. Call this before directing or rendering a code-driven ' +
    'music video. Topics: skill (workflow + rules, read first), styles (T1-T12 look library), ' +
    'techniques (deterministic rendering, headless capture, encoding), threejs (3D shots), ' +
    'environment (toolchain install and fallbacks), lineage (where this form comes from).',
    { topic: { type: 'string', description: 'skill | styles | techniques | threejs | environment | lineage. Defaults to skill.' } },
    async (args) => {
      const topic = String((args && args.topic) || 'skill').toLowerCase();
      const file = READABLE[topic];
      if (!file) return 'Unknown topic "' + topic + '". Available: ' + Object.keys(READABLE).join(', ');
      try { return fs.readFileSync(file, 'utf8'); }
      catch (e) { return 'Could not read ' + file + ': ' + (e && e.message ? e.message : e); }
    }
  ));

  ctx.tools.register(textTool(
    'music_mv_probe',
    'Check whether this machine can render music-code-mv videos: Node, headless Chrome/Edge, ffmpeg, ' +
    'puppeteer-core, three.js and a live WebGL context. Run this first; it prints a READY verdict ' +
    'or names exactly what is missing.',
    { projectDir: { type: 'string', description: 'Project directory to probe for a local node_modules. Defaults to the working directory.' } },
    async (args) => {
      const dir = args && args.projectDir ? path.resolve(String(args.projectDir)) : process.cwd();
      const r = await runScript('probe.mjs', [dir]);
      return formatResult('music-code-mv environment probe', r, { note: 'READY means everything needed for a render is present.' });
    }
  ));

  ctx.tools.register(textTool(
    'music_mv_init',
    'Scaffold a new music-code-mv project (timeline, seeded PRNG, Canvas2D stage with the code-MV look, ' +
    'lyric parsing, and a working 21s six-shot demo). Writes project.json, index.html, ' +
    'storyboard.md, lyrics.lrc and src/.',
    {
      dir: { type: 'string', required: true, description: 'Project directory to create.' },
      force: { type: 'boolean', description: 'Overwrite a non-empty directory.' }
    },
    async (args) => {
      const dir = String(args.dir);
      const argv = [dir];
      if (args.force) argv.push('--force');
      const r = await runScript('init.mjs', argv, { cwd: process.cwd() });
      return formatResult('scaffold ' + dir, r, { note: 'Next: edit storyboard.md, then music_mv_render mode=contact.' });
    }
  ));

  ctx.tools.register(textTool(
    'music_mv_render',
    'Render a music-code-mv project. mode=contact renders evenly spaced keyframes tiled into one PNG ' +
    '(the self-check step — read the image and critique it); mode=stills renders specific ' +
    'timestamps; mode=video renders every frame and encodes an MP4 with ffmpeg. Frames are cached, ' +
    'so a re-run resumes instead of starting over.',
    {
      projectDir: { type: 'string', required: true, description: 'Project directory containing index.html.' },
      mode: { type: 'string', description: 'contact | stills | video | sheet. Defaults to contact.' },
      out: { type: 'string', description: 'Output path, e.g. out/video.mp4.' },
      stills: { type: 'string', description: 'Comma-separated timestamps (seconds) for mode=stills.' },
      width: { type: 'number', description: 'Frame width in pixels.' },
      height: { type: 'number', description: 'Frame height in pixels.' },
      fps: { type: 'number', description: 'Frames per second.' },
      duration: { type: 'number', description: 'Duration in seconds.' },
      keys: { type: 'number', description: 'Keyframes in a contact sheet (default 12).' },
      audio: { type: 'string', description: 'Audio file to mux into the MP4.' },
      force: { type: 'boolean', description: 'Ignore the frame cache.' },
      keepFrames: { type: 'boolean', description: 'Keep the frames directory after encoding.' },
      workers: { type: 'number', description: 'Parallel render processes (default 1); 8-12 recommended for 4K.' },
      gl: { type: 'string', description: 'auto (default) probes hardware GL with blank-frame fallback; gpu forces it; soft forces SwiftShader. chrome engine only.' },
      engine: { type: 'string', description: 'chrome (default, hardware GL) | node (browserless skia fast path; needs @napi-rs/canvas installed).' },
      format: { type: 'string', description: 'jpeg (default) | png — frame container before encoding. png is lossless but ~3x slower.' },
      quality: { type: 'number', description: 'JPEG quality 1-100 (default 95).' },
      orientation: { type: 'string', description: 'landscape | portrait — picks 4K defaults (3840x2160 / 2160x3840) when width AND height are not both given.' },
      depth: { type: 'number', description: 'Output color depth: 8 (default) | 10 | 12. 12 = HEVC main12 (auto-switches to libx265); HDR10 masters are at least 10.' }
    },
    async (args) => {
      const projectDir = path.resolve(String(args.projectDir));
      if (!fs.existsSync(path.join(projectDir, 'index.html'))) {
        return 'No index.html in ' + projectDir + '. Scaffold one with music_mv_init first.';
      }
      const mode = String(args.mode || 'contact');
      if (!['contact', 'stills', 'video', 'sheet'].includes(mode)) {
        // an unknown/typo'd mode used to fall through to the default full render —
        // the most expensive possible answer to a typo
        return 'Unknown mode "' + mode + '". Use contact | stills | video | sheet.';
      }
      if (args.engine !== undefined && !['chrome', 'node'].includes(String(args.engine))) {
        return 'Unknown engine "' + args.engine + '". Use chrome | node.';
      }
      if (args.format !== undefined && !['jpeg', 'jpg', 'png'].includes(String(args.format).toLowerCase())) {
        return 'Unknown format "' + args.format + '". Use jpeg | png.';
      }
      if (args.orientation !== undefined && !['landscape', 'portrait'].includes(String(args.orientation).toLowerCase())) {
        return 'Unknown orientation "' + args.orientation + '". Use landscape | portrait.';
      }
      const argv = ['--project=' + projectDir];
      if (mode === 'contact') argv.push('--contact');
      else if (mode === 'sheet') argv.push('--sheet');
      else if (mode === 'stills') argv.push('--stills=' + String(args.stills || '0'));
      argv.push('--format=' + (args.format || cfg.frameFormat || 'jpeg'));
      if (args.out) argv.push('--out=' + String(args.out));
      if (args.width) argv.push('--w=' + Number(args.width));
      if (args.height) argv.push('--h=' + Number(args.height));
      if (args.fps) argv.push('--fps=' + Number(args.fps));
      if (args.duration) argv.push('--dur=' + Number(args.duration));
      if (args.keys) argv.push('--keys=' + Number(args.keys));
      if (args.audio) argv.push('--audio=' + String(args.audio));
      if (args.orientation && !args.width && !args.height) {
        const portrait = String(args.orientation).toLowerCase() === 'portrait';
        argv.push('--w=' + (portrait ? 2160 : 3840), '--h=' + (portrait ? 3840 : 2160));
      }
      if (args.workers) argv.push('--workers=' + Number(args.workers));
      if (args.gl) argv.push('--gl=' + String(args.gl));
      if (args.engine) argv.push('--engine=' + String(args.engine));
      if (args.quality) argv.push('--quality=' + Number(args.quality));
      if (args.depth) argv.push('--depth=' + Number(args.depth));
      if (args.force) argv.push('--force');
      if (args.keepFrames) argv.push('--keep');
      argv.push(...commonFlags());

      const r = await runScript('render.mjs', argv, { cwd: projectDir });
      const note = mode === 'contact'
        ? 'Open the contact sheet PNG and actually look at it before proceeding.'
        : mode === 'video'
          ? 'MP4 written. Verify duration and streams before delivering.'
          : undefined;
      return formatResult('music-code-mv render (' + mode + ')', r, { note });
    }
  ));

  ctx.tools.register(defineTool({
    name: 'music_mv_lyrics',
    description: 'Inject lyrics into a music-code-mv project: writes <projectDir>/lyrics.lrc, points ' +
      'project.json at it, and reports how many [mm:ss.xx] cues were parsed plus the first and ' +
      'last cue time. Malformed LRC throws an error naming the offending line; a file with zero ' +
      'time cues is refused. Nothing is written when validation fails.',
    parameters: {
      projectDir: { type: 'string', required: true, description: 'Project directory containing project.json.' },
      lrc: { type: 'string', required: true, description: 'Full LRC text to inject, one cue per line: [mm:ss.xx] lyric.' },
      mode: { type: 'string', description: 'replace (default) overwrites lyrics.lrc; append adds the new cues to the existing file.' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Absolute path of the written lyrics file.' },
          cues: { type: 'integer', required: true, description: 'Number of [mm:ss.xx] cues in the file.' },
          firstCue: { type: 'number', required: true, description: 'Timestamp in seconds of the first cue.' },
          lastCue: { type: 'number', required: true, description: 'Timestamp in seconds of the last cue.' }
        }
      },
      render: (_args, v) => textBlock([
        '## music-code-mv lyrics injected',
        'file: ' + v.path,
        'cues: ' + v.cues,
        'span: ' + v.firstCue + 's → ' + v.lastCue + 's',
        'project.json "lyrics" now points at lyrics.lrc'
      ].join('\n'))
    },
    execute: async (args) => {
      if (!args || args.projectDir === undefined || args.projectDir === null || args.projectDir === '') {
        throw new Error('music_mv_lyrics: parameter "projectDir" is required');
      }
      if (typeof args.lrc !== 'string') {
        throw new Error('music_mv_lyrics: parameter "lrc" is required (the full LRC text)');
      }
      const projectDir = path.resolve(String(args.projectDir));
      const mode = args.mode === undefined || args.mode === null || args.mode === '' ? 'replace' : String(args.mode);
      if (mode !== 'replace' && mode !== 'append') {
        throw new Error('music_mv_lyrics: unknown mode "' + mode + '" (use "replace" or "append")');
      }
      const projFile = path.join(projectDir, 'project.json');
      if (!fs.existsSync(projFile)) {
        throw new Error('music_mv_lyrics: no project.json in ' + projectDir + ' — scaffold one with music_mv_init first');
      }

      const file = path.join(projectDir, 'lyrics.lrc');
      let content = args.lrc;
      if (mode === 'append' && fs.existsSync(file)) {
        const prev = fs.readFileSync(file, 'utf8');
        content = (prev === '' || prev.endsWith('\n') ? prev : prev + '\n') + args.lrc;
      }
      // validate the whole file before touching disk
      const cues = parseLrc(content);
      if (!cues.length) {
        throw new Error('music_mv_lyrics: no cues in the LRC (0 lines matched [mm:ss.xx]) — refusing to write lyrics.lrc');
      }

      // read + parse project.json BEFORE touching disk: a malformed project.json
      // must not leave a half-applied mutation (lyrics.lrc written, pointer not set)
      let proj;
      try {
        proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));
      } catch (e) {
        throw new Error('music_mv_lyrics: cannot parse ' + projFile + ' (' +
          (e && e.message ? e.message : e) + ') — nothing was written');
      }
      fs.writeFileSync(file, content, 'utf8');
      proj.lyrics = 'lyrics.lrc';
      fs.writeFileSync(projFile, JSON.stringify(proj, null, 2) + '\n', 'utf8');

      return { path: file, cues: cues.length, firstCue: cues[0].t, lastCue: cues[cues.length - 1].t };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'music_mv_diff',
    description: 'Compare two rendered frames of a music-code-mv project (frames/f00000.jpg, …). ' +
      'Byte-identical frames short-circuit on sha1 and report identical=true with psnr=null; ' +
      'otherwise ffmpeg -lavfi psnr runs and the average dB is returned. A frame that does not ' +
      'exist fails with the exact missing file name.',
    parameters: {
      projectDir: { type: 'string', required: true, description: 'Project directory containing frames/.' },
      a: { type: 'number', required: true, description: 'First frame number (0 = frames/f00000.jpg).' },
      b: { type: 'number', required: true, description: 'Second frame number to compare against a.' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          frameA: { type: 'string', required: true, description: 'Path of the first frame that was compared.' },
          frameB: { type: 'string', required: true, description: 'Path of the second frame that was compared.' },
          identical: { type: 'boolean', required: true, description: 'true when both files are byte-identical.' },
          psnr: { type: 'string', required: true, description: 'ffmpeg PSNR average in dB; the literal string "null" when identical.' },
          note: { type: 'string', required: true, description: 'How the verdict was reached.' }
        }
      },
      render: (_args, v) => textBlock([
        '## music-code-mv frame diff',
        'a: ' + v.frameA,
        'b: ' + v.frameB,
        'identical: ' + v.identical,
        'psnr: ' + (v.psnr === null ? 'null' : v.psnr + ' dB'),
        'note: ' + v.note
      ].join('\n'))
    },
    execute: async (args) => {
      if (!args || args.projectDir === undefined || args.projectDir === null || args.projectDir === '') {
        throw new Error('music_mv_diff: parameter "projectDir" is required');
      }
      const n = {};
      for (const key of ['a', 'b']) {
        const v = args[key];
        if (v === undefined || v === null || v === '') {
          throw new Error('music_mv_diff: parameter "' + key + '" is required (frame number)');
        }
        const num = Number(v);
        if (!Number.isInteger(num) || num < 0) {
          throw new Error('music_mv_diff: parameter "' + key + '" must be a non-negative integer frame number, got ' + JSON.stringify(v));
        }
        n[key] = num;
      }
      const projectDir = path.resolve(String(args.projectDir));
      const fa = findFrame(projectDir, n.a);
      const fb = findFrame(projectDir, n.b);
      if (!fa || !fb) {
        const missing = fa ? n.b : n.a;
        throw new Error('missing frame: ' + expectedFrame(projectDir, missing) +
          ' — render frames first with music_mv_render mode=video');
      }

      const ha = sha1(fa);
      const hb = sha1(fb);
      if (ha === hb) {
        return {
          frameA: fa, frameB: fb, identical: true, psnr: null,
          note: 'sha1 match (' + ha.slice(0, 12) + '…) — byte-identical, PSNR skipped'
        };
      }

      const ffmpeg = findFfmpeg(projectDir);
      const r = await runFfmpeg(ffmpeg, ['-i', fa, '-i', fb, '-lavfi', 'psnr', '-f', 'null', '-']);
      const m = /average:\s*([0-9]+(?:\.[0-9]+)?|inf)/.exec(String(r.stderr || ''));
      if (!m) {
        throw new Error('music_mv_diff: ffmpeg reported no PSNR average (ffmpeg: ' + ffmpeg + '): ' +
          String(r.stderr || '').trim().split('\n').slice(-4).join(' | '));
      }
      return {
        frameA: fa, frameB: fb, identical: false, psnr: m[1],
        note: 'sha1 differs; PSNR from ffmpeg -lavfi psnr (dB — higher is closer, inf is pixel-identical)'
      };
    }
  }));
}
