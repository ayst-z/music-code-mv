#!/usr/bin/env node
/**
 * 旁白合成：走本机 DSH 的 MiMo TTS 代理 / synthesize narration via the local DSH MiMo TTS proxy.
 *
 *   node scripts/tts.mjs --probe                      # 查配音是否可用 / check availability
 *   node scripts/tts.mjs --out=narration/01.wav "文本"  # 合成一段 / synthesize one clip
 *   node scripts/tts.mjs --batch=narration.json        # 批量合成 / batch
 *   node scripts/tts.mjs --brand --out=n/01.wav "文本"   # **品牌配音**：对外发布片统一嗓音
 *   node scripts/tts.mjs --persona=presets/fairy.json --out=x.wav "文本"   # 套用角色音色
 *   node scripts/tts.mjs --voice=茉莉 --out=x.wav "文本"                    # 内置音色
 *   node scripts/tts.mjs --voice-design="清甜灵动的少女音…" --out=x.wav "文本"  # 自定义音色
 *
 * 音色优先级：逐项覆盖 > --voice/--model/--voice-design > --persona=<preset>.persona.voice。
 * 音色模型 mimo-v2.5-tts-voicedesign 走 voiceDesignPrompt；内置音色走 --voice。
 *
 * 批量清单格式 / batch manifest:
 *   [{ "file": "narration/01.wav", "text": "第一段旁白" }, ...]
 *
 * 只连回环地址的 DSH 代理，不访问任何外部服务；音频不落第三方。
 * Loopback-only: this talks to your own DSH, never to an outside service.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE = process.env.MIMO_TTS_BASE || 'http://127.0.0.1:19387';
const SYNTH = '/plugins/xiaomi-mimo-tts/synthesize';
const STATUS = '/plugins/xiaomi-mimo-tts/api-key-status';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : '';
}
function has(flag) { return process.argv.includes('--' + flag); }

const BASE = arg('base') || DEFAULT_BASE;
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(BASE)) {
  console.error('拒绝连接非回环地址 / refusing a non-loopback base: ' + BASE);
  process.exit(2);
}

/** 把服务端的状态码翻成人话，方便一次定位 / turn status codes into a fix. */
function explain(status, body) {
  if (status === 409) return 'TTS 插件已装但没配 API Key：到 设置 → 插件 → dsh-xiaomi-tts 存一个 Xiaomi MiMo API Key。';
  if (status === 404) return '找不到 TTS 代理路由：DSH 里没有装 dsh-xiaomi-tts，或它的版本不提供该接口。';
  if (status === 413) return '文本超出单次上限：拆成多段，或用 --batch。';
  if (status === 400) return '请求格式不对：' + body;
  if (status === 502 || status === 504) return '上游 MiMo 服务没回音频：' + body;
  return 'HTTP ' + status + ': ' + body;
}

async function probe() {
  try {
    const r = await fetch(BASE + STATUS, { headers: { accept: 'application/json' } });
    if (!r.ok) return { ok: false, why: explain(r.status, await r.text()) };
    const d = await r.json();
    if (!d || d.configured !== true) return { ok: false, why: '未配置 API Key（见上面的设置路径）。', status: d };
    if (d.supported !== true) return { ok: false, why: 'Key 格式不被识别：确认是 Xiaomi MiMo 平台的 Key。', status: d };
    return { ok: true, status: d };
  } catch (e) {
    return { ok: false, why: '连不上 ' + BASE + '（DSH 没开？端口不对？）：' + e.message };
  }
}

async function synth(text, outFile, voice) {
  const body = { text, format: 'wav' };
  if (voice && voice.model) body.model = voice.model;
  if (voice && voice.voice) body.voice = voice.voice;
  if (voice && voice.voiceDesignPrompt) body.voiceDesignPrompt = voice.voiceDesignPrompt;
  const res = await fetch(BASE + SYNTH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(explain(res.status, await res.text()));
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 128) throw new Error('返回的音频太小（' + buf.length + ' 字节），多半是空响应');
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return buf.length;
}

/**
 * 音色解析优先级：逐项覆盖 > --voice/--model/--voice-design > --persona=<preset.json> 的 persona.voice。
 * `--brand` 是快捷方式：等价于 --persona=<本脚本同级的 voices/brand.json>（品牌配音）。
 * Resolve the voice from explicit flags, or from a preset's persona.voice block.
 */
function resolveVoice() {
  let personaPath = arg('persona');
  if (!personaPath && has('brand')) {
    // voices/ 与 scripts/ 是兄弟目录 / voices/ is a sibling of scripts/
    const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    personaPath = path.join(skillRoot, 'voices', 'brand.json');
    if (!fs.existsSync(personaPath)) {
      throw new Error('--brand 需要 voices/brand.json / --brand needs voices/brand.json next to scripts/');
    }
  }
  let v = {};
  if (personaPath) {
    const p = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
    const pv = (p && p.persona && p.persona.voice) || null;
    if (!pv) throw new Error('persona 里没有 voice 块 / no persona.voice in ' + personaPath);
    v = { model: pv.model, voice: pv.voice || pv.fallbackVoice, voiceDesignPrompt: pv.voiceDesignPrompt };
  }
  if (arg('model')) v.model = arg('model');
  if (arg('voice')) v.voice = arg('voice');
  if (arg('voice-design')) {
    v.model = 'mimo-v2.5-tts-voicedesign';
    v.voiceDesignPrompt = arg('voice-design');
  }
  return v;
}

function voiceLabel(v) {
  if (!v || (!v.model && !v.voice && !v.voiceDesignPrompt)) return '默认音色 / default voice';
  if (v.voiceDesignPrompt) return 'voicedesign ' + (v.voice ? '≈' + v.voice : '');
  return (v.model || 'mimo-v2.5-tts') + ' · ' + (v.voice || '');
}

const OUT = arg('out');

if (has('probe') || (!OUT && !arg('batch'))) {
  const r = await probe();
  if (r.ok) {
    console.log('READY  MiMo TTS 可用 / available  ' + JSON.stringify(r.status));
    process.exit(0);
  }
  console.log('NOT READY  ' + r.why);
  process.exit(1);
}

if (arg('batch')) {
  const manifest = JSON.parse(fs.readFileSync(arg('batch'), 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length) {
    console.error('清单必须是非空数组 / manifest must be a non-empty array');
    process.exit(1);
  }
  const base = resolveVoice();
  console.log('voice: ' + voiceLabel(base));
  let total = 0;
  for (const item of manifest) {
    if (!item || typeof item.file !== 'string' || typeof item.text !== 'string') {
      console.error('每一项都要有 file 与 text / each item needs file and text');
      process.exit(1);
    }
    // 逐项可覆盖音色（同一支片里换角色说话）/ per-item override lets one clip switch character
    const v = Object.assign({}, base,
      item.model ? { model: item.model } : {},
      item.voice ? { voice: item.voice } : {},
      item.voiceDesignPrompt ? { voiceDesignPrompt: item.voiceDesignPrompt } : {});
    const n = await synth(item.text, item.file, v);
    total += n;
    console.log(item.file + '  ' + n + ' bytes');
  }
  console.log('done: ' + manifest.length + ' clips, ' + total + ' bytes');
  process.exit(0);
}

const text = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
if (!text) { console.error('没有文本可合成 / nothing to synthesize'); process.exit(1); }
const oneVoice = resolveVoice();
console.log('voice: ' + voiceLabel(oneVoice));
const n = await synth(text, OUT, oneVoice);
console.log(OUT + '  ' + n + ' bytes');
