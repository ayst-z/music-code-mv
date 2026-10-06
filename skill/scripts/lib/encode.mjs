import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createProgress } from './progress.mjs';

const execFileAsync = promisify(execFile);

/**
 * Encoder selection and HDR10 packaging.
 *
 * Hardware encoders are dramatically faster at 4K. We probe what the local
 * ffmpeg actually offers instead of assuming.
 */
const HW_PREFERENCE = [
  { id: 'av1_qsv',  label: 'Intel QSV AV1',      family: 'qsv' },
  { id: 'hevc_qsv', label: 'Intel QSV HEVC',     family: 'qsv' },
  { id: 'h264_qsv', label: 'Intel QSV H.264',    family: 'qsv' },
  { id: 'hevc_nvenc', label: 'NVIDIA NVENC HEVC', family: 'nvenc' },
  { id: 'h264_nvenc', label: 'NVIDIA NVENC H.264', family: 'nvenc' },
  { id: 'hevc_amf', label: 'AMD AMF HEVC',       family: 'amf' },
  { id: 'h264_amf', label: 'AMD AMF H.264',      family: 'amf' }
];

export async function listEncoders(ffmpeg) {
  try {
    const { stdout } = await execFileAsync(ffmpeg, ['-hide_banner', '-encoders'], { maxBuffer: 1 << 24 });
    return stdout;
  } catch (e) {
    return ((e && e.stdout) || '') + '';
  }
}

/**
 * 硬编码器在**这台机器上**真的能不能用 —— 编译进去 ≠ 硬件在场。
 * ffmpeg 静态构建常常同时编进 qsv/nvenc/amf，但机器上只有其中一块卡；
 * 只查 `-encoders` 会选中一个根本没有设备的编码器，然后在最后一步整体失败。
 * 所以这里**真的编一帧**（64x64 单帧，几十毫秒），失败就当它不存在。
 * Compiled-in does not mean present: encode one real frame before trusting a hardware encoder.
 */
const probeCache = new Map();

export async function verifyEncoder(ffmpeg, id) {
  const key = ffmpeg + '\u0000' + id;
  if (probeCache.has(key)) return probeCache.get(key);
  let ok = false;
  let why = '';
  try {
    // 256x144 不是随手选的：QSV 的 AV1/HEVC 在部分 Intel 核显上有最小分辨率，
    // 64x64 会报 "Current resolution is unsupported" —— 那是探针太小，不是编码器坏。
    await execFileAsync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:size=256x144:rate=30',
      '-frames:v', '1', '-c:v', id, '-f', 'null', '-'
    ], { maxBuffer: 1 << 20, timeout: 20000 });
    ok = true;
  } catch (e) {
    const raw = ((e && e.stderr) || (e && e.message) || '').toString();
    const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    // 末行通常是 "Nothing was written..." 这种废话；真正的原因在前面
    // （Cannot load nvcuda.dll / amfrt64.dll failed to open / Encoder not found）。
    const signal = lines.find((l) =>
      /Cannot load|\.dll|No device|not available|unsupported|Encoder not found|Invalid|denied|failed to open/i.test(l));
    why = signal || lines[lines.length - 1] || 'encode failed';
    if (/ENOENT/.test(raw)) why = 'ffmpeg not found';
  }
  const result = { ok, why };
  probeCache.set(key, result);
  return result;
}

/**
 * 选一个编码器：`auto` 时按偏好走硬件，**并且逐个真的试编一次**，第一个通过的上场，
 * 全部失败就退回软件 x264（绝不谎报「已用硬件加速」）。
 * Pick an encoder: in auto mode walk the hardware preference and actually test-encode
 * with each candidate; fall back to software x264 rather than claim acceleration that is not there.
 * @returns {Promise<{id:string,family:string,label:string,verified:boolean,note?:string}>}
 */
export async function pickEncoder(ffmpeg, requested = 'auto') {
  const list = await listEncoders(ffmpeg);
  const has = (id) => new RegExp('\\b' + id + '\\b').test(list);
  if (requested && requested !== 'auto') {
    if (!has(requested)) throw new Error('encoder "' + requested + '" is not available in this ffmpeg build');
    const cand = HW_PREFERENCE.find(h => h.id === requested);
    const fam = cand ? cand.family : 'sw';
    const v = await verifyEncoder(ffmpeg, requested);
    return { id: requested, family: fam, label: requested, verified: v.ok, note: v.ok ? undefined : v.why };
  }
  const failed = [];
  for (const c of HW_PREFERENCE) {
    if (!has(c.id)) continue;
    const v = await verifyEncoder(ffmpeg, c.id);
    if (v.ok) return { ...c, verified: true };
    failed.push(c.id + ' (' + (v.why || 'no device') + ')');
  }
  return {
    id: 'libx264', family: 'sw', label: 'software x264', verified: true,
    note: failed.length ? 'hardware encoders present in this build but unusable here: ' + failed.join(', ') : undefined
  };
}

/**
 * P1-R2: `--hdr10` 只有 libx265 能写出合规母版 —— qsv/nvenc/amf 嵌不了
 * HDR10 mastering SEI，会产出「标了 HDR 但没有元数据」的坏片（原先是 WARNING，
 * 按 docs/CODE-REVIEW.md P1-R2 改为硬失败，提示一律带 --encoder=libx265）。
 *
 * buildEncodeArgs 入口兜底调用（编码阶段必炸，坏母版绝不落盘）；
 * 要在**渲染开始前**失败的调用方（render.mjs 等入口）在 pickEncoder 之后
 * 直接调本函数即可 —— 校验是纯函数，零副作用。
 * qsv 的失败预告与本函数同口径：会失败，不是"降级建议"。
 */
export function validateEncodeOptions(opts = {}) {
  const { hdr10 = false, encoder } = opts;
  if (hdr10 && encoder && encoder.id !== 'libx265') {
    const why = encoder.family === 'qsv'
      ? ' (QSV cannot embed HDR10 mastering metadata: this run would fail / produce a broken master)'
      : '';
    throw new Error('--hdr10 requires libx265, got "' + encoder.id +
      '". Re-run with --encoder=libx265' + why);
  }
}

/**
 * Build the ffmpeg argument list.
 * hdr10 => 10-bit HEVC, Rec.2020 primaries, PQ transfer, HDR10 mastering metadata.
 *
 * **单一编码路径 = stdin 管道（image2pipe）**：帧由调用方按写入计数截断（推多少编多少），
 * 旧的按文件路径输入已删 —— `-start_number`/`-frames:v` 的文件语义不复存在，
 * 也就没有"上一次跑得更长 → 陈旧帧被顺带读进来"的问题（截断天然发生在写入侧）。
 */
export function buildEncodeArgs(opts) {
  const {
    fps, out, audio,
    encoder, crf = 17, preset = 'medium', hdr10 = false, hdrMaster = null,
    // output color depth: 8 (default) | 10 | 12 — 10/12 select a high-bit-depth
    // pixel format (yuv420p10le / yuv420p12le); x265 auto-picks main/main10/main12
    depth = 8
  } = opts;
  // P1-R2 兜底：走到这里必须是 libx265 + hdr10；入口侧提前调 validateEncodeOptions 可在渲染前失败
  validateEncodeOptions(opts);

  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe',
    '-framerate', String(fps), '-i', '-'];

  const hasAudio = !!audio;
  if (hasAudio) args.push('-i', audio);

  if (hasAudio) args.push('-map', '0:v:0', '-map', '1:a:0');

  const fam = encoder.family;
  args.push('-c:v', encoder.id);

  if (fam === 'qsv') {
    // QSV uses global_quality for constant-quality mode
    args.push('-global_quality', String(crf), '-look_ahead', '1');
    if (encoder.id === 'hevc_qsv') args.push('-tag:v', 'hvc1');
  } else if (fam === 'nvenc') {
    args.push('-rc', 'vbr', '-cq', String(crf), '-b:v', '0');
  } else if (fam === 'amf') {
    args.push('-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf));
  } else {
    args.push('-preset', preset, '-crf', String(crf));
  }

  if (hdr10) {
    // Convert scene-referred SDR into PQ rather than merely tagging it.
    // Two constraints discovered by testing on real frames: the JPEG/PNG frames
    // carry unknown primaries/transfer so the input colorimetry must be declared,
    // and the conversion must run as ONE zscale stage — emitting linear light
    // while still in YUV (the classic two-stage recipe) fails with
    // "no path between colorspaces" on this build.
    const pfHdr = 'yuv420p' + Math.max(10, depth) + 'le';
    const hdrChain = 'zscale=matrixin=bt470bg:primariesin=bt709:transferin=bt709:rangein=full:' +
      'p=bt2020:t=smpte2084:m=bt2020nc:r=tv:npl=100,format=' + pfHdr;
    args.push('-vf', hdrChain + ',scale=trunc(iw/2)*2:trunc(ih/2)*2');
    args.push('-pix_fmt', pfHdr);
    args.push('-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc');
    // light is the raw "<maxCLL>,<maxFALL>" value: the x265 branch below writes
    // ":max-cll=" itself, so embedding the option name here made x265 reject it
    // ("Invalid value for max-cll") and silently drop the content-light-level SEI
    const md = hdrMaster || { display: 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)', light: '1000,400' };
    if (fam === 'qsv') {
      // QSV takes mastering metadata through its own options where supported
      args.push('-color_range', 'tv');
    } else if (encoder.id === 'libx265') {
      args.push('-x265-params', 'hdr-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=' + md.display + ':max-cll=' + md.light);
    } else if (fam === 'nvenc') {
      args.push('-master_display', md.display, '-max_cll', md.light);
    }
  } else if (depth >= 10) {
    args.push('-pix_fmt', 'yuv420p' + depth + 'le');
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
    if (encoder.id === 'libx265') args.push('-profile:v', depth === 12 ? 'main12' : 'main10');
  } else {
    args.push('-pix_fmt', 'yuv420p');
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }

  if (hasAudio) args.push('-c:a', opts.audioCodec || 'aac', '-b:a', opts.audioBitrate || '192k', '-shortest');
  args.push('-movflags', '+faststart', out);
  return args;
}

/**
 * 跑 ffmpeg。三种形态：
 *  1. `frames`（Buffer[] 或 async iterable）→ **stdin 管道喂帧**（视频编码的唯一喂法）：
 *     帧边渲边进管、真流式零等待；推多少编多少 = 天然的 `-frames:v` 截断。
 *  2. `totalFrames` 且无 frames → 有进度条的常规调用（-progress pipe:1 解析 frame=）。
 *  3. 都不传 → 静默 execFile（联系表拼图这类秒级任务，行为与从前逐字节一致）。
 * HDR 写入就发生在这一步，所以进度条天然覆盖 HDR 输出。
 */
export function runFfmpeg(ffmpeg, args, opts = {}) {
  const total = Number(opts.totalFrames || 0);
  const label = opts.label || 'encode';
  const frames = opts.frames;
  if (!(total > 0) && !frames) {
    return (async () => {
      try {
        return await execFileAsync(ffmpeg, args, { maxBuffer: 1 << 26 });
      } catch (e) {
        const msg = ((e && e.stderr) || (e && e.message) || '').toString();
        if (/ENOENT/.test(msg)) throw notFound();
        throw new Error('ffmpeg failed: ' + msg.split('\n').slice(-8).join('\n'));
      }
    })();
  }

  return new Promise((resolve, reject) => {
    const argv = args.concat(['-progress', 'pipe:1', '-nostats']);
    const child = spawn(ffmpeg, argv, { stdio: [frames ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const bar = total > 0 ? createProgress({ total, label }) : null;
    // ffmpeg 先死时写侧会 EPIPE：吞掉它，让 close 分支用 stderr 尾巴报真因
    // （与 np 引擎 BrokenPipeError → rc+stderr 的处理同构）
    child.stdin.on('error', () => { /* handled via close */ });
    let outBuf = '';
    let errTail = [];
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      outBuf += chunk;
      const lines = outBuf.split('\n');
      outBuf = lines.pop();
      for (const ln of lines) {
        const m = /^frame=(\d+)/.exec(ln.trim());
        if (m && bar) {
          const n = Math.min(total, Number(m[1]));
          bar.update(n, { note: label });
        } else if (ln.indexOf('progress=end') >= 0 && bar) {
          bar.update(total, { note: label });
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { errTail.push(d); if (errTail.length > 60) errTail.shift(); });
    child.on('error', (e) => {
      if (bar) bar.done();
      if (/ENOENT/.test(String(e && e.message))) reject(notFound());
      else reject(new Error('ffmpeg failed: ' + (e && e.message)));
    });
    child.on('close', (code) => {
      if (code === 0) { if (bar) bar.done(); resolve({ code: 0 }); }
      else {
        if (bar) bar.done();
        const tail = errTail.join('').split('\n').slice(-8).join('\n');
        reject(new Error('ffmpeg failed (exit ' + code + '):\n' + tail));
      }
    });

    if (frames) {
      // 泵：逐帧写 stdin，带背压（write 返回 false 等 drain）；ffmpeg 中途退出时
      // 用 close 竞速避免 pump 卡死 —— close 分支才是结果裁决者。
      (async () => {
        try {
          for await (const buf of frames) {
            if (child.stdin.destroyed || child.stdin.writableEnded) break;
            if (!child.stdin.write(buf)) {
              // 等 drain；close 先到也能醒 —— 谁赢都把**双方**监听摘掉
              // （race + once 的败者会悬挂，帧一多就是 MaxListeners 泄漏警告）
              await new Promise((r) => {
                const done = () => { child.stdin.off('drain', done); child.off('close', done); r(); };
                child.stdin.once('drain', done);
                child.once('close', done);
              });
            }
          }
          if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
        } catch {
          try { child.stdin.destroy(); } catch { /* ignore */ }
        }
      })();
    }
  });
}

function notFound() {
  return new Error('ffmpeg not found (tried --ffmpeg, FFMPEG_PATH, node_modules/ffmpeg-static, ' +
    'node_modules/@ffmpeg-installer, then PATH). Install with: npm install ffmpeg-static');
}
