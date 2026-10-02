#!/usr/bin/env python3
"""程序化配乐生成器 / procedural score generator.

    python scripts/music.py --out=audio/score.wav --sec=120 --bpm=104 --seed=7
    python scripts/music.py --out=audio/x.wav --sec=30 --light-each=15   # 亮暗段落交替

自己写曲，不用素材库：pad 和声 + 低频侧链 + 拨弦琶音 + 鼓组 + 段落转场。
**hi-res 输出**：96 kHz / 24-bit 立体声 WAV（可用 --ar/--bits 调整）。

Design choices (so it sounds like music, not noise):
  * 和声：Am–F–C–G 循环（i–VI–III–VII），每段换一次根音高度
  * **亮/暗交替**：亮段 = 泛音更多、八度更高、加 shimmer；暗段 = 只留基频与二次谐波、低八度
  * 侧链：kick 触发时 pad/bass 下压（duck），这是「电子乐会动」的关键
  * 琶音走和弦音（1/8 拍），pluck 用指数衰减 + 轻微失谐叠加
  * 段落边界：riser（噪声上扫）+ impact（低频轰），给剪辑点配重
  * 确定性：全部随机来自 --seed，可复现
"""
import argparse
import math
import sys

import numpy as np

SR_DEFAULT = 96000

# ---------------------------------------------------------------- music theory
# Am(i) – F(VI) – C(III) – G(VII)，用 MIDI 音高号表示三和弦（根音在 A2 附近）
CHORDS = [
    [45, 52, 57, 60, 64],   # Am  A2 E3 A3 C4 E4
    [41, 48, 53, 57, 60],   # F   F2 C3 F3 A3 C4
    [48, 55, 60, 64, 67],   # C   C3 G3 C4 E4 G4
    [43, 50, 55, 59, 62],   # G   G2 D3 G3 B3 D4
]
ROOTS = [33, 29, 36, 31]    # 低音根音（A1 F1 C2 G1）
BARS_PER_CHORD = 2


def midi_hz(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def env_exp(n, rate):
    """指数衰减包络 / exponential decay envelope."""
    return np.exp(-np.arange(n, dtype=np.float64) * rate)


def env_adsr(n, a, d, s, r, sr=SR_DEFAULT):
    """线性 ADSR（秒）—— pad 用 / linear ADSR for pads."""
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    parts = [
        np.linspace(0, 1, a, endpoint=False) if a else np.zeros(0),
        np.linspace(1, s, d, endpoint=False) if d else np.zeros(0),
        np.full(sus, s),
        np.linspace(s, 0, r) if r else np.zeros(0),
    ]
    e = np.concatenate(parts)
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def tone(freq, n, sr, harmonics, detune=0.0):
    """加法合成：按谐波数控制亮度（泛音越多越「亮」）。"""
    t = np.arange(n, dtype=np.float64) / sr
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        # 高次谐波衰减更快 → 类似低通
        out += np.sin(2 * np.pi * freq * k * (1.0 + detune) * t) / (k ** 1.25)
    return out / max(1.0, harmonics * 0.5)


def lowpass_fft(x, cutoff, sr, rolloff=0.35):
    """FFT 砖墙低通（升余弦过渡）——用于**暗段整体压暗**，制造亮暗对比。"""
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1.0 / sr)
    gain = np.ones_like(freqs)
    edge = cutoff * (1.0 + rolloff)
    band = (freqs > cutoff) & (freqs < edge)
    gain[band] = 0.5 * (1 + np.cos(np.pi * (freqs[band] - cutoff) / (edge - cutoff)))
    gain[freqs >= edge] = 0.0
    return np.fft.irfft(spec * gain, n=len(x))


def parse_plan(spec):
    """按分镜给的亮暗区间列表：'7d,26l,45d,20l,9d'（秒 + l/d，l=亮段 d=暗段）。
    允许 '7:D' / '7.5d' / '7 dark' 等写法；用于与视频的分段色彩脚本**精确对齐**。"""
    import re
    out = []
    for tok in str(spec).split(','):
        tok = tok.strip()
        if not tok:
            continue
        m = re.match(r'^([\d.]+)\s*[:\s]?\s*(l|d|light|dark)?$', tok, re.I)
        if not m:
            raise SystemExit('bad --plan token: %r (want e.g. 7d,26l,45d)' % tok)
        sec = float(m.group(1))
        flag = (m.group(2) or 'l').lower()
        out.append((sec, flag[0] == 'l'))
    return out


def build_sections(total_sec, bar, plan, light_every):
    """生成 [(时长, 是否亮段)] 列表，并裁到总长。"""
    if plan:
        secs = list(plan)
    elif light_every and light_every > 0:
        secs, t = [], 0.0
        flip = True
        while t < total_sec:
            d = min(light_every, total_sec - t)
            secs.append((d, flip))
            flip = not flip
            t += d
    else:
        # 默认：每 4 个和弦段（2 个和弦 × 2 小节…）换一次明暗
        unit = bar * BARS_PER_CHORD * 2
        secs, t, i = [], 0.0, 0
        while t < total_sec:
            d = min(unit, total_sec - t)
            secs.append((d, (i % 4) in (0, 1)))
            i += 1
            t += d
    # 裁到总长
    out, acc = [], 0.0
    for d, fl in secs:
        if acc >= total_sec:
            break
        d2 = min(d, total_sec - acc)
        if d2 <= 0.01:
            break
        out.append((d2, fl))
        acc += d2
    if out:
        last_d, last_fl = out[-1]
        out[-1] = (last_d + (total_sec - acc), last_fl)   # 尾差补给最后一段
    return out


def render(total_sec, sr, bpm, seed, light_every, fadeIn, fadeOut, plan=None):
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(total_sec * sr)
    L = np.zeros(n)
    R = np.zeros(n)
    sections = build_sections(total_sec, bar, plan, light_every)

    bar_i = 0
    t0 = 0
    while t0 < n and bar_i < len(sections):
        seg_sec, light = sections[bar_i]
        seg_n = min(int(seg_sec * sr), n - t0)
        if seg_n <= 0:
            break
        chord = CHORDS[bar_i % 4]
        root = ROOTS[bar_i % 4]
        idx = np.arange(seg_n, dtype=np.float64)
        tt = idx / sr
        segL = np.zeros(seg_n)
        segR = np.zeros(seg_n)

        # ---- pad 和声（亮段泛音多、暗段只留基频+二次）
        harm = 9 if light else 3
        for j, note in enumerate(chord):
            oct_up = 12 if (light and j >= 2) else 0
            f = midi_hz(note + oct_up)
            pad = tone(f, seg_n, sr, harm, detune=0.0012 * (j - 2))
            a_env = env_adsr(seg_n, 0.9 if light else 1.4, 0.5, 0.78, 0.9)
            g = 0.16 if light else 0.12
            pan = 0.5 + 0.36 * math.sin(j * 1.9)
            segL += pad * a_env * g * (1.0 - pan)
            segR += pad * a_env * g * pan

        # ---- 低频根音（跟随和弦）
        bass = tone(midi_hz(root), seg_n, sr, 4)
        b_env = env_adsr(seg_n, 0.02, 0.2, 0.7, 0.25)
        segL += bass * b_env * 0.34
        segR += bass * b_env * 0.34

        # ---- 鼓组（每拍）
        kick_at, hat_at, clap_at = [], [], []
        for b in range(int(seg_sec / beat)):
            if b % 4 in (0, 2):
                kick_at.append(b)
            if b % 2 == 1:
                clap_at.append(b)
            hat_at.append(b + 0.5)
            if light and b % 4 == 3:
                hat_at.append(b + 0.75)          # 亮段加密 hi-hat，暗段留空
        kick_at = [a for a in kick_at if a * beat < seg_sec]
        clap_at = [a for a in clap_at if a * beat < seg_sec]
        hat_at = [a for a in hat_at if a * beat < seg_sec]

        duck = np.ones(seg_n)
        for b in kick_at:
            s = int(b * beat * sr)
            if s >= seg_n:
                continue
            k = min(int(0.26 * sr), seg_n - s)
            duck[s:s + k] = np.minimum(duck[s:s + k], np.linspace(0.34, 1.0, k) ** 1.6)
            # kick 本体：音高从 130Hz 扫到 46Hz
            tt_k = np.arange(k) / sr
            f_sweep = 46 + 84 * np.exp(-tt_k * 26)
            phase = 2 * np.pi * np.cumsum(f_sweep) / sr
            body = np.sin(phase) * np.exp(-tt_k * 7.5)
            click = (rng.standard_normal(k) * np.exp(-tt_k * 420)) * 0.30
            seg = (body + click) * 0.62
            e = min(seg_n, s + k)
            segL[s:e] += seg[:e - s]
            segR[s:e] += seg[:e - s]

        for b in clap_at:
            s = int(b * beat * sr)
            if s >= seg_n:
                continue
            k = min(int(0.20 * sr), seg_n - s)
            noise = rng.standard_normal(k)
            noise[1:] -= noise[:-1]                       # 高通感
            envl = np.exp(-np.arange(k) / sr * 26)
            for tap in (0, int(0.010 * sr), int(0.021 * sr)):
                if tap < k:
                    envl[tap:min(k, tap + 300)] += 0.8
            seg = noise * envl * 0.30
            e0 = min(seg_n, s + k)
            segL[s:e0] += seg[:e0 - s]
            segR[s:e0] += seg[:e0 - s] * 0.92

        for b in hat_at:
            s = int(b * beat * sr)
            if s >= seg_n:
                continue
            k = min(int(0.09 * sr), seg_n - s)
            noise = rng.standard_normal(k)
            noise[1:] -= 0.86 * noise[:-1]                # 更强高通 → 嘶
            envh = np.exp(-np.arange(k) / sr * (58 if light else 84))
            seg = noise * envh * (0.14 if light else 0.10)
            e1 = min(seg_n, s + k)
            segL[s:e1] += seg[:e1 - s] * 0.7
            segR[s:e1] += seg[:e1 - s] * 1.0

        # ---- 拨弦琶音：和弦音 1/8 拍，亮段上一个八度并更响
        arp_step = beat / 2
        for j in range(int(seg_sec / arp_step)):
            s = int(j * arp_step * sr)
            if s >= seg_n:
                break
            note = chord[(j % (len(chord) - 1)) + 1] + (12 if light else 0)
            k = min(int(0.42 * sr), seg_n - s)
            f = midi_hz(note)
            tt_p = np.arange(k) / sr
            body = np.sin(2 * np.pi * f * tt_p) + 0.42 * np.sin(2 * np.pi * f * 2 * tt_p)
            envp = np.exp(-tt_p * (7.0 if light else 10.0))
            seg = body * envp * (0.16 if light else 0.10)
            pan = 0.5 + 0.34 * math.sin(j * 1.3 + bar_i)
            e = min(seg_n, s + k)
            segL[s:e] += seg[:e - s] * (1.0 - pan)
            segR[s:e] += seg[:e - s] * pan

        # ---- 段落转场：尾部 riser + 头部 impact（给剪辑点配重）
        r_tail = int(min(1.6 * sr, seg_n))
        if r_tail > 0:
            noise = rng.standard_normal(r_tail)
            ramp = np.linspace(0, 1, r_tail) ** 2.6
            sweep = noise * ramp * 0.11
            segL[seg_n - r_tail:] += sweep
            segR[seg_n - r_tail:] += sweep * 0.9
        imp_k = int(min(0.9 * sr, seg_n))
        if imp_k > 0:
            tt_i = np.arange(imp_k) / sr
            boom = np.sin(2 * np.pi * (58 * np.exp(-tt_i * 5.0)) * tt_i) * np.exp(-tt_i * 4.0)
            segL[:imp_k] += boom * 0.34
            segR[:imp_k] += boom * 0.34

        # 亮段整体更亮：加一层高频 shimmer（正弦和，随时间微颤）
        if light:
            shim = np.sin(2 * np.pi * midi_hz(chord[-1] + 24) * tt) * \
                (0.5 + 0.5 * np.sin(2 * np.pi * 0.7 * tt)) * 0.045
            segL += shim
            segR += shim * 0.8

        # 侧链 duck 只作用于和声与低频（鼓不压自己）——已在上面加法式混合，故这里对整段做轻微处理
        segL *= 0.86 + 0.14 * duck
        segR *= 0.86 + 0.14 * duck

        # ---- 亮/暗段的频谱塑形（实测校准过的两档）
        # 暗段 4kHz 低通：削掉明亮感、保留鼓的骨架。低于 4k 会过头——实测 2kHz 时
        #   暗段 98% 能量挤在 400Hz 以下，笔记本上「听不见音乐只剩嗡」。
        # 亮段 17kHz 低通：96k 采样里 >16k 有 20% 能量是噪声不是空气感，收掉最浪费的一截。
        if light:
            segL = lowpass_fft(segL, 17000.0, sr, rolloff=0.3)
            segR = lowpass_fft(segR, 17000.0, sr, rolloff=0.3)
            segL *= 1.16
            segR *= 1.16
        else:
            segL = lowpass_fft(segL, 4000.0, sr, rolloff=0.5)
            segR = lowpass_fft(segR, 4000.0, sr, rolloff=0.5)
            segL *= 1.12
            segR *= 1.12

        L[t0:t0 + seg_n] += segL
        R[t0:t0 + seg_n] += segR
        t0 += seg_n
        bar_i += 1

    # ---- 母带：中/侧展宽 → 软削波 → 峰值归一 → 淡入淡出
    # 低频（bass/kick 单声道）主导会让 L/R 相关冲到 0.96，side 抬 1.7 倍拉开宽度
    mid = (L + R) * 0.5
    side = (L - R) * 0.5 * 1.7
    L, R = mid + side, mid - side
    peak = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
    L, R = L / peak * 1.18, R / peak * 1.18
    L, R = np.tanh(L), np.tanh(R)
    peak = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
    target = 10 ** (-1.5 / 20)          # -1.5 dBFS
    L, R = L / peak * target, R / peak * target
    fi, fo = int(fadeIn * sr), int(fadeOut * sr)
    if fi > 0:
        L[:fi] *= np.linspace(0, 1, fi)
        R[:fi] *= np.linspace(0, 1, fi)
    if fo > 0:
        L[-fo:] *= np.linspace(1, 0, fo)
        R[-fo:] *= np.linspace(1, 0, fo)
    return L, R


def write_wav(path, L, R, sr, bits):
    """24/16-bit 立体声 WAV：手写格式头 + 打包样本（不依赖额外库）。"""
    import struct
    ch = 2
    bps = bits // 8
    data = np.empty((len(L), 2), dtype=np.float64)
    data[:, 0], data[:, 1] = L, R
    scale = float(2 ** (bits - 1)) - 1.0
    ints = np.clip(np.round(data * scale), -scale - 1, scale).astype(np.int64)
    if bits == 24:
        b0 = ints & 0xFF
        b1 = (ints >> 8) & 0xFF
        b2 = (ints >> 16) & 0xFF
        raw = (b0 | (b1 << 8) | (b2 << 16)).astype('<i4').tobytes()
        packed = bytearray()
        for i in range(0, len(raw), 4):
            packed += raw[i:i + 3]
        payload = bytes(packed)
    elif bits == 16:
        payload = ints.astype('<i2').tobytes()
    else:
        raise SystemExit('only 16 or 24 bits supported')
    byte_rate = sr * ch * bps
    hdr = b'RIFF' + struct.pack('<I', 36 + len(payload)) + b'WAVE'
    hdr += b'fmt ' + struct.pack('<IHHIIHH', 16, 1, ch, sr, byte_rate, ch * bps, bits)
    hdr += b'data' + struct.pack('<I', len(payload))
    with open(path, 'wb') as f:
        f.write(hdr + payload)


def main():
    ap = argparse.ArgumentParser(prog='music.py', description='procedural score generator (hi-res WAV)')
    ap.add_argument('--out', required=True, help='output wav path')
    ap.add_argument('--sec', type=float, default=120, help='duration seconds')
    ap.add_argument('--bpm', type=int, default=104, help='tempo')
    ap.add_argument('--seed', type=int, default=7, help='deterministic seed')
    ap.add_argument('--ar', type=int, default=SR_DEFAULT, help='sample rate (default 96000 = hi-res)')
    ap.add_argument('--bits', type=int, default=24, choices=[16, 24], help='bit depth (default 24 = hi-res)')
    ap.add_argument('--light-each', type=float, default=0,
                    help='秒/段：>0 时按该长度交替亮暗段（如 15 = 亮暗各 15s）；0 = 按和弦段自动')
    ap.add_argument('--plan', default='',
                    help="按分镜的亮暗区间：'7d,26l,45d,20l,9d'（秒+亮暗，l=亮 d=暗），"
                         "与视频的分段色彩脚本精确对齐；优先于 --light-each")
    ap.add_argument('--fade', type=float, default=2.0, help='fade in/out seconds')
    args = ap.parse_args()

    plan = parse_plan(args.plan) if args.plan else None
    L, R = render(args.sec, args.ar, args.bpm, args.seed, args.light_each,
                  args.fade, args.fade, plan=plan)
    import os
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or '.', exist_ok=True)
    write_wav(args.out, L, R, args.ar, args.bits)
    peak = float(max(np.abs(L).max(), np.abs(R).max()))
    print('score: %s  %.1fs  %dHz/%dbit  peak %.2f dBFS  sections=%s' % (
        args.out, args.sec, args.ar, args.bits, 20 * math.log10(peak),
        ('plan: ' + args.plan) if args.plan else
        ('light/dark every %gs' % args.light_each if args.light_each else 'auto')))


if __name__ == '__main__':
    sys.exit(main())
