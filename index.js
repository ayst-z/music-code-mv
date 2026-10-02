/**
 * dsh-music-code-mv — DSH plugin exposing the music-code-mv toolchain.
 *
 * Plain ESM on purpose: a bundle installed from git is never built, so shipping
 * JavaScript means "dsh plugin add" works with no prepare script and no build
 * permission prompt. Types live in JSDoc.
 *
 * 还注册一块图形界面：当 profile 里有 webServer 时，在 /music-mv/studio 上挂一个中文
 * 工作室（内嵌在 DSH 右侧边栏「MV 工坊」里，也可以直接用浏览器打开）。宿主半边见
 * lib/studio.js，浏览器半边见 lib/client.js。
 *
 * Registers seven tools on ctx.tools:
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
import { createStudio, STUDIO_PAGE, findProjects } from './lib/studio.js';
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
 * @property {string} [studioRoot]  图形界面扫描工程的工作区根目录（默认按 resolveStudioRoot 阶梯解析：配置 → 宿主 cwd → 注册表里有 MV 工程的那个）
 */

/** @type {import('@deepseek-ai/schemastery').default<Config>} */
export const Config = Schema.object({
  projectsDir: Schema.string().default('mv'),
  softwareGl: Schema.boolean().default(true),
  frameFormat: Schema.union(['png', 'jpeg']).default('jpeg'),
  chromePath: Schema.string(),
  ffmpegPath: Schema.string(),
  studioRoot: Schema.string()
});

const READABLE = {
  skill: path.join(SKILL_DIR, 'SKILL.md'),
  presets: path.join(SKILL_DIR, 'reference', 'presets.md'),
  styles: path.join(SKILL_DIR, 'reference', 'styles.md'),
  techniques: path.join(SKILL_DIR, 'reference', 'techniques.md'),
  threejs: path.join(SKILL_DIR, 'reference', 'threejs.md'),
  environment: path.join(SKILL_DIR, 'reference', 'environment.md'),
  lineage: path.join(SKILL_DIR, 'reference', 'lineage.md')
};

/**
 * 文本 + 可选图片：联系表这类产物直接作为 image 块回到对话里，
 * 因此不需要起 HTTP 服务也能「看见」渲染结果。
 * Text plus an optional image block, so artifacts land in the chat itself.
 */
const textOrImageTool = (name, description, parameters, run) => defineTool({
  name,
  description,
  parameters,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', required: true },
        attachment: { type: 'object', additionalProperties: true, description: '可选图片附件 / optional image attachment' }
      }
    },
    render: (_args, value) => {
      const blocks = [];
      if (value && value.attachment) blocks.push({ type: 'image', attachment: value.attachment });
      blocks.push({ type: 'text', text: (value && value.text) || '' });
      return blocks;
    }
  },
  execute: run
});

/** 把磁盘上的图片存成可放进对话的附件；没有 attachments 服务就返回 null。 */
async function attachImage(ctx, file) {
  const attachments = typeof ctx.get === 'function' ? ctx.get('attachments') : undefined;
  if (!attachments || typeof attachments.saveImage !== 'function' || !fs.existsSync(file)) return null;
  try {
    const mediaType = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
    return await attachments.saveImage({ data: fs.readFileSync(file), mediaType, name: path.basename(file) });
  } catch {
    return null; // 图片存不进去不影响渲染本身 / a failed attach never fails the render
  }
}

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

/**
 * 找「用户的工作区」，而不是宿主进程的 cwd —— 桌面版进程的 cwd 是 profile 目录，
 * 用它当工作区根会扫不到任何工程（面板空白的根因）。
 * Resolve the user's workspace instead of the host process cwd.
 */
function resolveStudioRoot(ctx, cfg) {
  const candidates = [];
  const push = (p) => {
    if (typeof p !== 'string' || !p) return;
    const abs = path.resolve(p);
    if (!candidates.includes(abs)) candidates.push(abs);
  };
  if (cfg && cfg.studioRoot) push(cfg.studioRoot);
  push(process.cwd()); // 命令行在工程目录里启动时，它就是答案 / CLI launched from the project
  try {
    const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null;
    const list = registry && typeof registry.list === 'function' ? registry.list() : [];
    for (const w of list.slice().reverse()) push(w && w.path);
  } catch { /* 没有注册表就只用上面两个 / no registry */ }
  const existing = candidates.filter((c) => { try { return fs.existsSync(c) && fs.statSync(c).isDirectory(); } catch { return false; } });
  // 注册表里可能有好几个项目目录：优先挑真的**有 MV 工程**的那个，
  // 否则面板会对着一个空工作区显示「没有工程」—— 用户看到的就是「没成功」。
  for (const c of existing) {
    try { if (findProjects(c).length > 0) return c; } catch { /* 扫不动就跳过 */ }
  }
  return existing[0] || process.cwd();
}

export function apply(ctx, config) {
  const cfg = config || {};

  /**
   * 所有工具的路径参数都相对「用户工作区」解析，而不是宿主进程的 cwd ——
   * 桌面版进程的 cwd 是 profile 目录，裸 path.resolve 会把相对路径写到工作区外
   * （对话里默认的启动位置就错了）。与图形界面共用同一条 resolveStudioRoot 阶梯。
   * Every tool resolves paths against the user's workspace, never the host cwd.
   */
  const fromWorkspace = (p) => path.resolve(resolveStudioRoot(ctx, cfg), String(p));

  /**
   * 图形界面的宿主半边。有 webServer 的 profile（Web / 桌面版）里会挂到
   * /music-mv/studio；纯 base profile 里保持为 null，工具照常工作。
   */
  const studio = { current: null };
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      const instance = createStudio(cfg.studioRoot
        ? { root: cfg.studioRoot }
        : { resolveRoot: () => resolveStudioRoot(ctx, cfg) });
      const dispose = instance.register(webCtx.webServer);
      studio.current = instance;
      if (typeof webCtx.effect === 'function') {
        webCtx.effect(() => () => { studio.current = null; dispose(); }, 'music-code-mv: 工作室路由');
      }
    });
  }

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
    '读取 music-code-mv 创作指南。指导或渲染纯代码 MV 之前先调它。主题：skill（流程与铁律，先读）、' +
    'presets（四个开箱即用的预设：配色+后期+时长+分镜+占位歌词）、styles（T1-T12 风格库）、' +
    'techniques（确定性渲染、无头截帧、编码）、threejs（3D 镜头）、' +
    'environment（工具链安装与降级）、lineage（这种形式的来龙去脉）。' +
    ' / Read the music-code-mv authoring guide before directing a code-driven music video.',
    { topic: { type: 'string', description: '主题 topic: skill | presets | styles | techniques | threejs | environment | lineage（默认 skill）。' } },
    async (args) => {
      const topic = String((args && args.topic) || 'skill').toLowerCase();
      const file = READABLE[topic];
      if (!file) return '未知主题 / Unknown topic "' + topic + '"。可用：' + Object.keys(READABLE).join(', ');
      try { return fs.readFileSync(file, 'utf8'); }
      catch (e) { return 'Could not read ' + file + ': ' + (e && e.message ? e.message : e); }
    }
  ));

  ctx.tools.register(textTool(
    'music_mv_probe',
    '环境自检：Node、无头 Chrome/Edge、ffmpeg、puppeteer-core、three.js 与真实 WebGL 上下文。' +
    '渲染之前先跑它：打印 READY，或明确指出缺什么。' +
    ' / Check whether this machine can render music-code-mv videos.',
    { projectDir: { type: 'string', description: 'Project directory to probe for a local node_modules. Defaults to the working directory.' } },
    async (args) => {
      const dir = args && args.projectDir ? fromWorkspace(args.projectDir) : resolveStudioRoot(ctx, cfg);
      const r = await runScript('probe.mjs', [dir]);
      return formatResult('music-code-mv 环境自检 / environment probe', r, { note: 'READY 表示渲染所需的一切都在。 / READY means everything needed for a render is present.' });
    }
  ));

  ctx.tools.register(textTool(
    'music_mv_init',
    '生成一支 MV 的工程骨架：时间线、种子化 PRNG、内置代码 MV 质感的 Canvas2D 舞台、歌词解析，' +
    '以及一个可以直接跑的 21 秒六镜头 demo。写入 project.json、index.html、storyboard.md、' +
    'lyrics.lrc 与 src/。给 preset 时直接套用预设：配色、后期、时长、分镜与占位歌词一次到位，生成即可渲染。' +
    ' / Scaffold a new music-code-mv project from the bundled template.',
    {
      dir: { type: 'string', required: true, description: 'Project directory to create / 要创建的工程目录。' },
      force: { type: 'boolean', description: 'Overwrite a non-empty directory / 覆盖非空目录。' },
      preset: { type: 'string', description: '预设 preset: claude | deepseek | gpt | gemini | grok | mistral | llama | qwen | kimi | doubao | zhipu | midjourney | neon-rain | ink-paper | phosphor | dusk-lofi（共 16 个，见 music_mv_guide topic=presets）。省缺则用模板默认配色。' }
    },
    async (args) => {
      const dir = String(args.dir);
      const root = resolveStudioRoot(ctx, cfg);          // 相对路径落在用户工作区，不是宿主 cwd
      const argv = [path.resolve(root, dir)];
      if (args.force) argv.push('--force');
      if (args.preset) argv.push('--preset=' + String(args.preset));
      const r = await runScript('init.mjs', argv, { cwd: root });
      return formatResult('生成工程 / scaffold ' + dir, r, { note: '下一步：先改 storyboard.md，再跑 music_mv_render mode=contact。 / Next: edit storyboard.md, then render a contact sheet.' });
    }
  ));

  ctx.tools.register(textOrImageTool(
    'music_mv_render',
    '渲染一支 MV 工程。mode=contact 把等距关键帧拼成一张 PNG 联系表（自检环节——务必用读图工具看它）；' +
    'mode=stills 导出指定时间戳；mode=video 渲染全部帧并用 ffmpeg 编码成 MP4。帧带缓存，' +
    '重跑是续渲而不是从头开始。' +
    ' / Render a music-code-mv project: contact sheet, stills, or a full MP4.',
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
      const projectDir = fromWorkspace(args.projectDir);
      if (!fs.existsSync(path.join(projectDir, 'index.html'))) {
        return { text: '目录里没有 index.html / No index.html in ' + projectDir + '。先用 music_mv_init 生成一个工程。' };
      }
      const mode = String(args.mode || 'contact');
      if (!['contact', 'stills', 'video', 'sheet'].includes(mode)) {
        // an unknown/typo'd mode used to fall through to the default full render —
        // the most expensive possible answer to a typo
        return { text: '未知模式 / Unknown mode "' + mode + '"：请用 contact | stills | video | sheet。' };
      }
      if (args.engine !== undefined && !['chrome', 'node'].includes(String(args.engine))) {
        return { text: '未知引擎 / Unknown engine "' + args.engine + '"：请用 chrome | node。' };
      }
      if (args.format !== undefined && !['jpeg', 'jpg', 'png'].includes(String(args.format).toLowerCase())) {
        return { text: '未知帧格式 / Unknown format "' + args.format + '"：请用 jpeg | png。' };
      }
      if (args.orientation !== undefined && !['landscape', 'portrait'].includes(String(args.orientation).toLowerCase())) {
        return { text: '未知方向 / Unknown orientation "' + args.orientation + '"：请用 landscape | portrait。' };
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
        ? '把联系表 PNG 打开，真的看一眼再往下走。 / Open the contact sheet PNG and actually look at it.'
        : mode === 'video'
          ? 'MP4 已写出。交付前核对时长与流。 / MP4 written — verify duration and streams before delivering.'
          : undefined;
      const text = formatResult('music-code-mv 渲染 / render (' + mode + ')', r, { note });
      // 联系表直接进对话：把 PNG 作为图片块附在文本之前
      let attachment = null;
      if (mode === 'contact' || mode === 'sheet') {
        const outRel = String(args.out || 'out/contact.png');
        const sheet = path.isAbsolute(outRel) ? outRel : path.join(projectDir, outRel);
        attachment = await attachImage(ctx, sheet);
      }
      return { text, attachment };
    }
  ));

  ctx.tools.register(defineTool({
    name: 'music_mv_lyrics',
    description: '把歌词写进工程：生成 <projectDir>/lyrics.lrc、让 project.json 指向它，并报告解析出的 ' +
      '[mm:ss.xx] 条数以及首尾时间。LRC 有错会报出具体行号；一条时间标签都没有则拒绝写入。' +
      '校验不通过时不会动磁盘。' +
      ' / Inject lyrics into a music-code-mv project and report its cues.',
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
        '## music-code-mv 歌词已写入 / lyrics injected',
        '文件 file: ' + v.path,
        '条数 cues: ' + v.cues,
        '跨度 span: ' + v.firstCue + 's → ' + v.lastCue + 's',
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
      const projectDir = fromWorkspace(args.projectDir);
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
    description: '比较一支 MV 工程的两帧（frames/f00000.jpg …）。字节相同直接按 sha1 短路，' +
      '返回 identical=true 且 psnr=null；否则跑 ffmpeg -lavfi psnr 返回平均 dB。' +
      '帧不存在时报出确切的缺失文件名。' +
      ' / Compare two rendered frames of a music-code-mv project.',
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
        '## music-code-mv 帧对比 / frame diff',
        'a: ' + v.frameA,
        'b: ' + v.frameB,
        '是否一致 identical: ' + v.identical,
        'psnr: ' + (v.psnr === null ? 'null' : v.psnr + ' dB'),
        '说明 note: ' + v.note
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
      const projectDir = fromWorkspace(args.projectDir);
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

  ctx.tools.register(textTool(
    'music_mv_studio',
    '「MV 工坊」图形界面：在 DSH 右侧边栏里浏览工程、看联系表与成片、直接触发渲染（也可以直接用浏览器打开）。' +
    '返回工作室地址、挂载状态、工程数量与当前渲染任务。' +
    ' / The MV Studio GUI: browse projects, review contact sheets and films, and start renders.',
    { action: { type: 'string', description: 'status（默认，摘要）| url（只要地址）| job（只看当前任务）' } },
    async (args) => {
      const action = String((args && args.action) || 'status').toLowerCase();
      const instance = studio.current;
      const lines = [];
      if (!instance) {
        lines.push('## MV 工坊 / MV Studio');
        lines.push('当前 profile 没有 webServer：工作室网页不可用，但常驻面板会以**离线模式**工作（按钮把要求直接交给模型），七个工具照常可用。');
        lines.push('No webServer here: the studio page is unavailable, but the dock falls back to offline mode and hands requests to the model. Tools keep working.');
        lines.push('联系表会在渲染完成后作为图片直接回到对话里 / contact sheets come back into the chat as images.');
        return lines.join('\n');
      }
      const snap = instance.snapshot();
      const projects = instance.listProjects();
      if (action === 'url') return snap.url || (STUDIO_PAGE + '（尚未绑定端口 / not bound yet）');
      lines.push('## MV 工坊 / MV Studio');
      lines.push('地址 url: ' + (snap.url || STUDIO_PAGE));
      lines.push('工作区 workspace: ' + snap.root);
      lines.push('工程 projects: ' + projects.length + (projects.length ? '（' + projects.slice(0, 6).map((p) => p.name).join(', ') + (projects.length > 6 ? ' …' : '') + '）' : ''));
      if (action === 'job') {
        lines.push(snap.job
          ? '当前任务 job: ' + snap.job.mode + ' · ' + snap.job.project + ' · ' + snap.job.status + ' · ' + (snap.job.progress && snap.job.progress.pct != null ? snap.job.progress.pct + '%' : '—')
          : '当前没有渲染任务 / no render job');
        return lines.join('\n');
      }
      lines.push(snap.job
        ? '当前任务 job: ' + snap.job.mode + ' · ' + snap.job.project + ' · ' + snap.job.status + ' · ' + (snap.job.progress && snap.job.progress.pct != null ? snap.job.progress.pct + '%' : '—')
        : '当前没有渲染任务 / no render job');
      lines.push('怎么打开 / how to open: DSH 右侧边栏的「+」→「MV 工坊」（首次会自动打开一次），或直接用浏览器访问上面的地址。');
      return lines.join('\n');
    }
  ));
}
