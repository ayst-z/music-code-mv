#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
music-code-mv · NumPy + Pillow frame engine
第二条渲染引擎：每一帧是 t 的纯函数，NumPy 向量化算出，Pillow 落字，ffmpeg 编码。

  usage:
    python render-np.py --init=<dir> [--force] [--preset=<id>]   # scaffold
    python render-np.py --list-presets                           # list presets
    python render-np.py --project=<dir> --contact [--keys=12]    # contact sheet (self-check)
    python render-np.py --project=<dir> --stills=0,3.5,8         # export stills
    python render-np.py --project=<dir> --out=out/video.mp4 [--audio=track.mp3] [--workers=8]

contract (project dir):
    project.json   width height fps duration palette segments supersample
    src/render.py  render_at(t, env) -> PIL.Image RGB exactly w×h
                   shot_at(t[, env]) -> str                 (optional label)
frames are cached in frames/f%05d.png and resumed on re-run.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError as _e:  # friendly verdict, not a traceback
    sys.exit("render-np.py needs numpy and Pillow: %s\n"
             "install with: pip install numpy pillow" % _e)

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
PRESETS_DIR = SKILL / "presets"

# 输出编码：管道/日志一律 UTF-8（DSH 与 CI 按 UTF-8 抓输出；Windows 默认 cp936
# 会把方块进度条 ░ 直接炸成 UnicodeEncodeError）。TTY 保留控制台原编码，
# 由 _Bar 的 ASCII 回落兜底。
if not sys.stdout.isatty() and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_PALETTE = {
    "bg": "#05070d", "dim": "#1d4b73", "base": "#5eead4",
    "accent": "#22d3ee", "hot": "#ff2fa0", "text": "#e8f7ff",
}

LABEL_FONT_CANDIDATES = [
    "consola.ttf", "C:/Windows/Fonts/consola.ttf",
    "C:/Windows/Fonts/consola.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]


def log(msg: str) -> None:
    print(msg, flush=True)


def die(msg: str) -> "None":
    print("error: " + msg, file=sys.stderr, flush=True)
    sys.exit(1)


class _Bar:
    """单行进度条：样式对齐 lib/progress.mjs 的 createProgress。
    TTY 每 0.15s 原地重绘一行；非 TTY（日志/CI）每 4s 打一行
    `[label] [███░] 42.0%  840/2000  91.2 fps  ETA 0:31`。完成那拍绕过节流，
    保证短任务也留下一条 100% 的日志行。"""

    BAR = 24

    def __init__(self, label: str, total: int) -> None:
        self.label = label
        self.total = max(1, int(total))
        self.tty = sys.stdout.isatty()
        self.last_draw = 0.0
        self.last_done = 0
        self.last_at = time.time()
        self.ema = 0.0
        self.max_len = 0
        self.finished = False
        self.final_drawn = False

    @staticmethod
    def _fmt(sec: float) -> str:
        if not math.isfinite(sec) or sec < 0:
            return "--:--"
        s = int(round(sec))
        h, m, s = s // 3600, (s % 3600) // 60, s % 60
        return ("%d:%02d:%02d" % (h, m, s)) if h else ("%d:%02d" % (m, s))

    def update(self, done: int, note: str = "") -> None:
        now = time.time()
        dt = now - self.last_at
        if dt >= 0.25 and done > self.last_done:
            inst = (done - self.last_done) / dt
            self.ema = (self.ema * 0.75 + inst * 0.25) if self.ema else inst
            self.last_done = done
            self.last_at = now
        final = done >= self.total
        if final:
            if self.final_drawn:
                return        # 完成只画一次（ffmpeg 的 frame= 与 progress=end 会各触发一次）
            self.final_drawn = True
        if not final:
            if self.tty and now - self.last_draw < 0.15:
                return
            if not self.tty and now - self.last_draw < 4.0:
                return
        self.last_draw = now
        pct = min(1.0, done / self.total)
        filled = int(round(pct * self.BAR))
        bar = "\u2588" * filled + "\u2591" * (self.BAR - filled)
        line = ("  [%s] %5.1f%%  %*d/%d"
                % (bar, pct * 100, len(str(self.total)), done, self.total))
        if self.ema > 0:
            line += "  %.1f fps" % self.ema
            line += "  ETA " + self._fmt((self.total - done) / self.ema)
        else:
            line += "  ETA --:--"
        if note:
            line += "  " + note
        # 控制台编码画不出方块条（Windows TTY 常见）→ 降级成 ASCII 条，进度不丢
        out = line
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        try:
            out.encode(enc)
        except (UnicodeEncodeError, LookupError):
            out = out.replace("\u2588", "#").replace("\u2591", "-")
        if self.tty:
            pad = " " * max(0, self.max_len - len(out))
            sys.stdout.write("\r" + out + pad)
            sys.stdout.flush()
            self.max_len = max(self.max_len, len(out))
        else:
            print("[%s] %s" % (self.label, out.strip()), flush=True)

    def finish(self) -> None:
        """清掉 TTY 上的驻留行；非 TTY 什么都不做（最后一条 100% 已经落日志）。"""
        if self.finished:
            return
        self.finished = True
        if self.tty:
            sys.stdout.write("\r" + " " * (self.max_len + 2) + "\r")
            sys.stdout.flush()


# ---- 子帧平均（temporal supersampling）：质感优先，成本**只记录不决策** ----
# 二分序列的档位边界（2^n 阶）：auto 收敛只在这些点比较前后两档均值。
_STAGE_K = (3, 5, 9, 17, 33, 65, 129, 257)
# 统计必须在**主进程**聚合：多进程 worker 里的 _MF 改动不会跨进程回来，
# 所以渲染函数只把 k 写进 _LAST_K 随结果返回，由调用方 _mf_add 统一累加。
_MF = {"calls": 0, "frames": 0, "rframes": 0, "ksum": 0, "kmin": None, "kmax": 0}
_LAST_K = 0


def _reset_blur_stats() -> None:
    global _LAST_K
    _MF.update({"calls": 0, "frames": 0, "rframes": 0, "ksum": 0, "kmin": None, "kmax": 0})
    _LAST_K = 0


def _mf_add(k) -> None:
    """调用方聚合：k=0 表示该帧来自缓存（没有子帧渲染）。"""
    k = int(k or 0)
    if k > 0:
        _MF["calls"] += k
        _MF["ksum"] += k
        _MF["kmin"] = k if _MF["kmin"] is None else min(_MF["kmin"], k)
        _MF["kmax"] = max(_MF["kmax"], k)
        _MF["rframes"] += 1
    _MF["frames"] += 1


def _log_blur(shutter: float, samples, tol: int, n: int, wall: float) -> None:
    """成本日志只作信息（排期要用），绝不参与采样决策（用户：不要为性能砍效果）。"""
    rfr = max(1, _MF["rframes"])
    avg = int(round(_MF["calls"] / rfr)) if _MF["rframes"] else 0
    auto = isinstance(samples, str)
    if not _MF["rframes"]:
        tag = "auto (all %d frames reused from cache)" % _MF["frames"]
    elif auto:
        tag = "auto converged %d..%d, tol %d" % (_MF["kmin"], _MF["kmax"], tol)
    else:
        tag = "fixed %d" % int(samples)
    reused = (", %d frames reused" % (_MF["frames"] - _MF["rframes"])
              if _MF["frames"] > _MF["rframes"] else "")
    log("shutter: %g samples=%d (%s) — %d frames x %d sub-frames = %d render_at calls, "
        "%d ms/frame%s%s"
        % (shutter, avg, tag, n, avg, _MF["calls"],
           int(round(wall * 1000.0 / max(1, n))), reused,
           "  |  pdoom tiers: 12 static / 36 normal / 108-324 whip" if auto else ""))


class _AutoOffsets:
    """auto 采样的子帧位置序列：端点先行 [-h, +h]，其后反复二分最粗间隙 ——
    **任意前缀都均匀铺满 [-h, +h]**，所以「渲一个、在档位边界比一次两档均值」能边渲边收敛，
    而序列只由 shutter 决定 → 任何进程重算结果一致（确定性）。
    上限 324 = pdoom 甩镜/急推档；收敛判据只看画面（tol），无时间/次数预算。
    固定 --samples=N 走 linspace（含两端点），严格按规格均匀铺满快门窗口。"""

    def __init__(self, shutter: float) -> None:
        h = shutter / 2.0
        self.vals = [-h, h]
        self.gaps = [(-h, h)]

    def get(self, i: int) -> float:
        while i >= len(self.vals):
            self.gaps.sort(key=lambda g: (-(g[1] - g[0]), g[0]))
            lo, hi = self.gaps.pop(0)
            mid = (lo + hi) * 0.5
            self.vals.append(mid)
            self.gaps.append((lo, mid))
            self.gaps.append((mid, hi))
        return self.vals[i]


# ---------------------------------------------------------------- project load

_cache: dict = {}


def load_project(project: Path) -> dict:
    key = str(project)
    if key in _cache:
        return _cache[key]
    pj = project / "project.json"
    if not pj.exists():
        die("no project.json in %s" % project)
    try:
        cfg = json.loads(pj.read_text("utf-8"))
    except Exception as e:
        die("project.json is not valid JSON: %s" % e)
    cfg.setdefault("width", 640)
    cfg.setdefault("height", 360)
    cfg.setdefault("fps", 30)
    cfg.setdefault("duration", 12)
    cfg.setdefault("palette", DEFAULT_PALETTE)
    cfg.setdefault("segments", [])
    cfg["segments"] = sorted(cfg["segments"], key=lambda s: s.get("t", 0))
    _cache[key] = cfg
    return cfg


_mod_cache: dict = {}


def load_render_module(project: Path):
    key = str(project)
    if key in _mod_cache:
        return _mod_cache[key]
    path = project / "src" / "render.py"
    if not path.exists():
        die("no src/render.py in %s (the engine contract needs render_at(t, env))" % project)
    name = "mv_render_" + abs(hash(key)).to_bytes(8, "big").hex()
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        die("cannot import %s" % path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as e:
        die("src/render.py raised on import: %r" % e)
    if not hasattr(mod, "render_at"):
        die("src/render.py must define render_at(t, env)")
    _mod_cache[key] = mod
    return mod


def build_env(cfg: dict, frame: int) -> dict:
    fps = cfg["fps"]
    return {
        "w": cfg["width"], "h": cfg["height"], "fps": fps,
        "duration": cfg["duration"],
        "t": frame / fps, "frame": frame,
        "palette": cfg["palette"], "segments": cfg["segments"],
        "project": cfg,
        # the only sanctioned source of randomness
        "rnd": lambda seed: np.random.default_rng(seed),
    }


def shot_label(mod, t: float, env: dict) -> str:
    fn = getattr(mod, "shot_at", None)
    if fn is None:
        return ""
    for call in (lambda: fn(t, env), lambda: fn(t)):
        try:
            return str(call())
        except TypeError:
            continue
        except Exception:
            return ""
    return ""


def _render_at_img(project: Path, cfg: dict, frame: int, t: float | None,
                   strict_rgb: bool):
    """渲一个子帧 → PIL 图（校验 + fx 都在这里，缓存/流式/子帧三路共用）。
    t=None 用 frame/fps；给浮点时刻即渲快门窗口内的子帧。strict_rgb 保留
    render_frame 的原契约（非 RGB 直接 die），字节路径保持宽松 convert。"""
    mod = load_render_module(project)
    env = build_env(cfg, frame)
    if t is not None:
        env["t"] = float(t)
    try:
        img = mod.render_at(env["t"], env)
    except Exception as e:
        die("render_at(%g) raised: %r" % (env["t"], e))
    if not isinstance(img, Image.Image):
        die("render_at(%g) returned %r, expected a PIL.Image" % (env["t"], type(img)))
    if img.size != (cfg["width"], cfg["height"]):
        die("render_at(%g) returned %dx%d, expected %dx%d"
            % (env["t"], img.size[0], img.size[1], cfg["width"], cfg["height"]))
    if strict_rgb and img.mode != "RGB":
        die("render_at(%g) returned mode %s, expected RGB (call .convert('RGB'))"
            % (env["t"], img.mode))
    fx = cfg.get("fx") or {}
    if fx:
        arr = apply_fx(np.asarray(img.convert("RGB")).astype(np.float32), fx, frame)
        img = Image.fromarray(arr.astype(np.uint8), "RGB")
    return img


def _average_u8(project: Path, cfg: dict, frame: int, strict_rgb: bool):
    """子帧平均（temporal supersampling）：float32 累加 K 个子帧再除 K → uint8 图。

    samples=auto：**只看画面**收敛 —— 在二分档位边界（2^n 阶：3,5,9,…,257）比较前后两档
    均值的最大通道差 < tol（0..255 计）即停；首个检查点 k=5（≥下限4 的第一个边界），
    上限 324（pdoom 甩镜档），无时间/次数预算。静止≈5、缓动≈17–65、甩镜打满 324，
    正对 pdoom 的 12/36/108–324 阶梯（判据演进见 _STAGE_K 旁注与 _average_u8 docstring）。
    samples=N：N 个子帧含端点均匀铺满 [t-h·dt, t+h·dt]。
    返回 (PIL RGB 图, k_used)；调用统计进 _MF。"""
    shutter = float(cfg["_shutter"])
    samples = cfg.get("_samples", "auto")
    tol = float(cfg.get("_tol", 3))
    fps = cfg["fps"]
    dt = 1.0 / fps
    t_center = frame / fps
    auto = isinstance(samples, str)
    offs = None
    fixed = None
    if auto:
        offs = _AutoOffsets(shutter)
        cap = 324
    else:
        kn = int(samples)
        h = shutter / 2.0
        fixed = [0.0] if kn <= 1 else [-h + shutter * (i / (kn - 1)) for i in range(kn)]
        cap = kn
    acc = None
    mean = None
    k = 0
    prev_stage = None
    while k < cap:
        off = offs.get(k) if auto else fixed[k]
        img = _render_at_img(project, cfg, frame, t_center + off * dt, strict_rgb)
        f = np.asarray(img.convert("RGB"), dtype=np.float32)
        acc = f if acc is None else acc + f
        k += 1
        mean = acc / k
        if auto and k in _STAGE_K:
            # 收敛判据（阶段1b 定稿）：**只在二分档位边界比前后两档的均值**。
            # 另外两条路都在数学上走不通，实测各撞一次墙：
            #   · 相邻均值差：≤255/k → tol=3 时 k 永远 ≤85，108–324 甩镜档不可达；
            #   · 新子帧 vs 均值：运动帧永不收敛 → dusk-lofi 实测 avg320（561s，荒谬）。
            # 档位边界（2^n 阶，端点先行二分序列天然形成）每过一档均值改动约减半：
            # 静止≈5 档即停、缓动≈17–65、甩镜一路打到 324 —— 正是 pdoom 12/36/108–324 的阶梯。
            # 判据仍然**只看画面**（< tol/255），无时间/次数预算。
            if prev_stage is not None and k >= 4 and float(np.abs(mean - prev_stage).max()) < tol:
                break
            prev_stage = mean.copy()
    out = np.rint(np.clip(mean, 0, 255)).astype(np.uint8)
    return Image.fromarray(out, "RGB"), k


def _frame_img(project: Path, cfg: dict, frame: int, strict_rgb: bool):
    """成帧总入口：shutter=0 → 单帧（零额外渲染开销）；>0 → 子帧平均。
    顺手把本帧子帧数写进 _LAST_K —— 多进程 worker 通过返回值把它带回主进程聚合。"""
    global _LAST_K
    shutter = float(cfg.get("_shutter", 0) or 0)
    if shutter <= 0:
        img = _render_at_img(project, cfg, frame, None, strict_rgb)
        _LAST_K = 0
        return img
    img, k = _average_u8(project, cfg, frame, strict_rgb)
    _LAST_K = k
    return img


# ---------------------------------------------------------------- frame render

def _out_path(project: Path, spec: str) -> Path:
    """--out relative paths resolve against the PROJECT, not the cwd."""
    p = Path(spec)
    return p if p.is_absolute() else (project / p)


def frame_path(project: Path, frame: int) -> Path:
    ext = "jpg" if str(load_project(project).get("frameFormat", "png")).lower() in ("jpeg", "jpg") else "png"
    return project / "frames" / (("f%05d." % frame) + ext)


def render_frame(project: Path, frame: int, force: bool = False, cfg: dict | None = None) -> str:
    """Render one frame into the cache. Returns 'cache' or 'rendered'.

    cfg 显式下传：--w/--h/--fps/--duration 是**进程内**对 load_project 缓存的就地覆盖，
    子进程 worker 拿不到 —— 不传就会退回 project.json 的原尺寸（实测 1920×1080 覆盖
    在 worker 里渲成 640×360，管道与 -s 错位，成片只剩 20 帧）。"""
    global _LAST_K
    out = frame_path(project, frame)
    if out.exists() and not force:
        _LAST_K = 0                # 缓存帧没有子帧渲染，聚合时按 0 计
        return "cache"
    cfg = cfg if cfg is not None else load_project(project)
    # 单帧或子帧平均（shutter 由 cfg["_shutter"] 决定）；落盘仍是一帧
    img = _frame_img(project, cfg, frame, strict_rgb=True)
    _store_frame(img, project, frame, cfg)
    return "rendered"


def _store_frame(img, project: Path, frame: int, cfg: dict) -> None:
    """写帧缓存。PNG 恒无损（compress_level 不影响画质，只影响写盘速度）；
    hi-res 用 jpeg（quality 92、4:4:4）比 PNG 快约 3 倍 —— 与 Chrome 引擎同名同义。
    缓存的价值是 resume/增量；**编码器不再读它**——它只作为 stdin 管道的备用来源。"""
    out = frame_path(project, frame)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    if str(cfg.get("frameFormat", "png")).lower() in ("jpeg", "jpg"):
        img.save(tmp, "JPEG", quality=int(cfg.get("jpegQuality", 92)), subsampling=0)
    else:
        img.save(tmp, "PNG", compress_level=int(cfg.get("pngLevel", 1)))
    os.replace(tmp, out)


def _rgb_bytes(img, depth: int) -> bytes:
    """**唯一**的字节口径：刚渲的帧与缓存读出的帧都走这里 ——
    depth<10 → rgb24；depth>=10 → v*257 线性扩到 16 位的 rgb48le（与旧流式逐位一致）。"""
    arr = np.asarray(img.convert("RGB"))
    if depth >= 10:
        u16 = arr.astype(np.uint16)
        u16 = (u16 << 8) | u16          # v * 257：0..255 → 0..65535 线性，无带状误差
        return np.ascontiguousarray(u16).astype("<u2").tobytes()
    return np.ascontiguousarray(arr).tobytes()


def _pipe_frame(project: Path, cfg: dict, frame: int, depth: int, stats: bool, force: bool):
    """编码器的**唯一帧来源**（编码器只认 stdin，文件只是缓存）：
    - 缓存命中且非 --force：PIL 打开 → _rgb_bytes（与刚渲的帧同一条字节口径，格式完全一致）
    - 否则渲染（含子帧平均）→ _store_frame 写缓存 → _rgb_bytes
    返回 (bytes, st|None, k子帧数, from_cache)。断点续渲靠第一条分支。"""
    fp = frame_path(project, frame)
    if fp.exists() and not force:
        img = Image.open(fp).convert("RGB")
        st = _stats_of(np.asarray(img).astype(np.uint16)) if stats else None
        return _rgb_bytes(img, depth), st, 0, True
    img = _frame_img(project, cfg, frame, strict_rgb=True)
    st = _stats_of(np.asarray(img.convert("RGB")).astype(np.uint16)) if stats else None
    _store_frame(img, project, frame, cfg)
    return _rgb_bytes(img, depth), st, _LAST_K, False


def _pipe_worker(project_str: str, frame: int, depth: int, stats: bool,
                 cfg: dict, force: bool):
    return _pipe_frame(Path(project_str), cfg, frame, depth, stats, force)


def n_frames(cfg: dict) -> int:
    return max(1, int(round(cfg["duration"] * cfg["fps"])))


# ---------------------------------------------------------------- cache signature

def ensure_signature(project: Path) -> str:
    """Project signature invalidates the frame cache automatically.

    Chrome engine 有 signature.mjs；这里同构：project.json 或 src/render.py 一变，
    旧帧全部作废——不再需要 --force 手动清缓存。"""
    fp = project / "frames"
    h = hashlib.sha1()
    for rel in ("project.json", "src/render.py"):
        p = project / rel
        h.update(p.read_bytes() if p.exists() else b"<missing>")
    sig = h.hexdigest()[:16]
    sig_file = fp / ".signature"
    old = sig_file.read_text().strip() if sig_file.exists() else None
    if old == sig:
        return "cache-ok"
    cleared = 0
    if fp.exists():
        for f in fp.glob("f*.png"):
            f.unlink()
            cleared += 1
    fp.mkdir(parents=True, exist_ok=True)
    sig_file.write_text(sig, "utf-8")
    if cleared:
        log("signature changed: cleared %d cached frames (project.json / src/render.py edited)"
            % cleared)
    return "cleared"


# ---------------------------------------------------------------- fx stack

def _box1d(a, axis: int, r: int = 1):
    """radius-r 盒式模糊的一维 pass，用积分图（cumsum）实现 —— 每像素代价与半径无关。"""
    n = a.shape[axis]
    padcfg = [(0, 0)] * a.ndim
    padcfg[axis] = (r, r)
    p = np.pad(a, padcfg, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float32)
    zshape = list(c.shape)
    zshape[axis] = 1
    c = np.concatenate([np.zeros(zshape, dtype=np.float32), c], axis=axis)
    win = 2 * r + 1
    hi = [slice(None)] * c.ndim
    lo = [slice(None)] * c.ndim
    hi[axis] = slice(win, win + n)
    lo[axis] = slice(0, n)
    return (c[tuple(hi)] - c[tuple(lo)]) / np.float32(win)


def _box_blur3(a, passes: int = 2):
    """3×3 盒式模糊的**可分离**实现：每 pass 一次竖向 + 一次横向（积分图），
    与原来的 9 抽头二维卷积等价，但每像素从 ~18 次加法降到 ~4 次。"""
    for _ in range(passes):
        a = _box1d(a, axis=0)
        a = _box1d(a, axis=1)
    return a


# 每帧重建这两样是纯浪费：暗角的 mgrid 与扫描线掩膜只取决于尺寸与参数。
_vig_cache: dict = {}
_scan_cache: dict = {}


def _vignette_fall(h: int, w: int):
    v = _vig_cache.get((h, w))
    if v is None:
        Y, X = np.mgrid[0:h, 0:w]
        nx = (X + 0.5) / w * 2 - 1
        ny = (Y + 0.5) / h * 2 - 1
        r = np.sqrt(nx * nx + ny * ny) / math.sqrt(2.0)
        v = (1.0 - 0.35 * np.clip((r - 0.55) / 0.45, 0, 1) ** 2).astype(np.float32)
        _vig_cache[(h, w)] = v
    return v


def _scan_mask(h: int, gap: int, al: float):
    key = (h, gap, al)
    m = _scan_cache.get(key)
    if m is None:
        m = np.ones(h, dtype=np.float32)
        m[np.arange(h) % gap == (gap // 2)] = 1.0 - al
        _scan_cache[key] = m
    return m


def apply_fx(arr, fx: dict, seed: int):
    """与 Chrome 引擎同构的收尾通道，全 NumPy：bloom → chroma → scanlines → vignette → grain。
    Flags come from project.json `fx`; every scene gets them for free."""
    if not fx:
        return np.clip(arr, 0, 255)
    h, w = arr.shape[:2]
    a = arr.astype(np.float32, copy=True)

    if fx.get("bloom"):
        # 与 Chrome 引擎同一条思路：辉光是低频信息，**在 1/4 分辨率上做模糊**，
        # 再放回全图 —— 全分辨率模糊实测 ~48ms/帧，1/4 上做约 5ms/帧（≈10×）。
        # bloomDiv 可在 project.json 的 fx 里调（2=更锐、8=更省）。
        lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        thr = float(fx.get("bloomThreshold", 150.0))
        k = np.clip((lum - thr) / max(1e-3, 255.0 - thr), 0, 1)[..., None]
        src = a * k
        ds = max(1, int(fx.get("bloomDiv", 4)))
        small = src[::ds, ::ds] if ds > 1 else src          # 跨步抽样，零成本
        glow_s = _box_blur3(small, 2)
        if ds > 1:
            glow = np.repeat(np.repeat(glow_s, ds, 0), ds, 1)[:h, :w]
        else:
            glow = glow_s
        a += glow * float(fx.get("bloomAlpha", 0.45))

    if fx.get("chroma"):
        amt = int(fx.get("chromaAmount", 2))
        al = float(fx.get("chromaAlpha", 0.15))
        shifted = np.stack([np.roll(a[..., 0], amt, axis=1),
                            a[..., 1],
                            np.roll(a[..., 2], -amt, axis=1)], -1)
        a = a * (1.0 - al) + shifted * al

    if fx.get("scanlines"):
        gap = max(2, int(fx.get("scanGap", 3)))
        al = float(fx.get("scanAlpha", 0.12))
        a *= _scan_mask(h, gap, al)[:, None, None]

    if fx.get("vignette"):
        a *= _vignette_fall(h, w)[..., None]

    if fx.get("grain"):
        al = float(fx.get("grainAlpha", 0.4))
        rng = np.random.default_rng(seed)
        a += rng.standard_normal((h, w), dtype=np.float32)[..., None] * (al * 9.0)

    return np.clip(a, 0, 255)


# ---------------------------------------------------------------- contact sheet

def _label_font(size: int = 13):
    for name in LABEL_FONT_CANDIDATES:
        for base in (Path(name), Path("C:/Windows/Fonts") / name):
            try:
                if base.exists():
                    return ImageFont.truetype(str(base), size)
            except Exception:
                pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contact_sheet(project: Path, keys: int, out_path: Path | None,
                  force: bool = False) -> Path:
    cfg = load_project(project)
    mod = load_render_module(project)
    n = n_frames(cfg)
    keys = max(2, min(keys, n))
    idxs = sorted({int(round(i * (n - 1) / (keys - 1))) for i in range(keys)})

    tiles = []
    t0 = time.time()
    rendered = cached = 0
    for fi in idxs:
        status = render_frame(project, fi, force)
        if status == "rendered":
            rendered += 1
        else:
            cached += 1
        env = build_env(cfg, fi)
        tiles.append((fi, env["t"], shot_label(mod, env["t"], env),
                      Image.open(frame_path(project, fi)).convert("RGB")))

    tw, th = tiles[0][3].size
    cols = 4 if len(tiles) >= 5 else len(tiles)
    rows = math.ceil(len(tiles) / cols)
    gap, lh, pad = 6, 22, 6
    W = cols * tw + (cols + 1) * gap
    H = rows * (th + lh) + (rows + 1) * gap
    sheet = Image.new("RGB", (W, H), (14, 14, 16))
    d = ImageDraw.Draw(sheet)
    font = _label_font(max(11, th // 16))

    for i, (fi, t, label, im) in enumerate(tiles):
        cx = i % cols
        cy = i // cols
        x = gap + cx * (tw + gap)
        y = gap + cy * (th + lh + gap)
        sheet.paste(im, (x, y))
        caption = "t=%6.2fs  f%-5d %s" % (t, fi, label)
        d.text((x + 2, y + th + 3), caption, font=font, fill=(168, 168, 176))

    out = out_path or (project / "out" / "contact.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, "PNG")
    log("contact sheet: %s  (%d keys, %d rendered, %d from cache, %.1fs)"
        % (out, len(tiles), rendered, cached, time.time() - t0))
    return out


def export_stills(project: Path, stamps: list[float], force: bool = False) -> None:
    cfg = load_project(project)
    outdir = project / "out"
    outdir.mkdir(parents=True, exist_ok=True)
    for ts in stamps:
        frame = int(round(ts * cfg["fps"]))
        render_frame(project, frame, force)
        dst = outdir / ("still-%0.2fs.png" % ts)
        shutil.copyfile(frame_path(project, frame), dst)
        log("still: %s" % dst)


# ---------------------------------------------------------------- video

def find_ffmpeg(project: Path) -> str:
    env = os.environ.get("FFMPEG_PATH")
    if env and Path(env).exists():
        return env
    # raw = abspath without dereferencing symlinks/junctions, so a project
    # anywhere on disk can still reach the workspace's node_modules through
    # the skills/ junction even when cwd lives outside the workspace.
    raw = Path(os.path.abspath(__file__)).parent
    resolved = Path(__file__).resolve().parent
    bases = [project, *project.parents, Path.cwd(), *Path.cwd().parents,
             raw, *raw.parents, resolved, *resolved.parents]
    for base in bases:
        for rel in ("ffmpeg-static/ffmpeg.exe", "ffmpeg-static/ffmpeg",
                    "@ffmpeg-installer/win32/ffmpeg.exe"):
            cand = base / "node_modules" / rel
            if cand.exists():
                return str(cand)
    which = shutil.which("ffmpeg")
    if which:
        return which
    die("ffmpeg not found (set FFMPEG_PATH, or: npm install ffmpeg-static)")


def _stats_of(arr_u16) -> dict:
    """一帧的 HDR Vivid 动态元数据采样：maxRGB / 均值 / 分位 / 过曝比例。
    都是 v*257 线性扩到 0..65535 之后的值，落地时按 16 位归一化写进 JSON。"""
    mx = arr_u16.max(axis=(0, 1)).astype(np.int32)          # [r,g,b] max
    mean = arr_u16.mean(axis=(0, 1)).astype(np.float32)
    lum = (arr_u16[..., 0].astype(np.float32) * 0.2126 +
           arr_u16[..., 1].astype(np.float32) * 0.7152 +
           arr_u16[..., 2].astype(np.float32) * 0.0722)
    return {
        "maxSCL": [int(v) for v in mx],
        "maxRGB": int(mx.max()),
        "avg": [round(float(v), 2) for v in mean],
        "avgLum": round(float(lum.mean()), 2),
        "p99Lum": round(float(np.percentile(lum, 99)), 2),
        "brightFrac": round(float((lum > 40000).mean()), 5),   # 高光占比
    }


def render_video(project: Path, out: Path, audio: str | None, workers: int,
                 depth: int, hdr10: bool, force: bool,
                 vivid: bool = False, vivid_every: int = 6) -> None:
    """**唯一的视频编码路径**：帧（缓存读出的或刚渲的）→ stdin 管道 → ffmpeg。

    编码器只见 pipe（rawvideo/rgb 直喂，HDR 10/12-bit 同一条路，按文件路径喂 ffmpeg 的
    旧入口已删）；文件只是缓存：命中就 PIL 读出、走同一条 _rgb_bytes 口径喂管道，
    没命中就渲完顺手写缓存 —— 断点续渲（resume）的价值保留；代价是读→转发比文件
    直读多一次拷贝（A/B 数字见回报）。--force = 全部重渲并刷新缓存，否则优先复用。

    vivid=True：边管道边算 **HDR Vivid 动态元数据**，写出 <out>.hdrvivid.json。
    基底层仍是合规的 HDR10 信号（bt2020 + PQ），因为本机 ffmpeg 没有 CUVA/Vivid
    编码器——动态元数据以 sidecar 形式交付，下游用支持 Vivid 的编码器合入 SEI。
    """
    if vivid:
        depth = max(depth, 10)
        hdr10 = True
    cfg = load_project(project)
    n = n_frames(cfg)
    w, h, fps = cfg["width"], cfg["height"], cfg["fps"]
    ff = find_ffmpeg(project)
    pix_in = "rgb48le" if depth >= 10 else "rgb24"

    args = [ff, "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", pix_in,
            "-s", "%dx%d" % (w, h), "-r", str(fps), "-i", "-"]
    if audio:
        args += ["-i", audio, "-map", "0:v:0", "-map", "1:a:0"]
    if depth >= 10:
        # 10/12-bit：BT.709 SDR 源 → BT.2020 + PQ（HDR10 的传输特性）
        if hdr10:
            args += ["-vf",
                     "zscale=matrixin=bt470bg:primariesin=bt709:transferin=bt709:rangein=full:"
                     "p=bt2020:t=smpte2084:m=bt2020nc:r=tv:npl=100,format=yuv420p%dle" % min(depth, 12)]
            args += ["-color_primaries", "bt2020", "-color_trc", "smpte2084",
                     "-colorspace", "bt2020nc"]
        else:
            args += ["-pix_fmt", "yuv420p%dle" % min(depth, 12)]
        # 10 位走 libx265（QSV/AV1 位深上限受本机构建与设备约束，软件 x265 保位深）
        args += ["-c:v", "libx265", "-crf", "18", "-preset", "medium", "-tag:v", "hvc1"]
    else:
        args += ["-c:v", "libx264", "-preset", "medium", "-crf", "17",
                 "-pix_fmt", "yuv420p",
                 "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"]
    if audio:
        args += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
    args += ["-frames:v", str(n), "-movflags", "+faststart", str(out)]
    out.parent.mkdir(parents=True, exist_ok=True)

    eff = max(1, min(workers, math.ceil(n / 16) if n else 1))
    log("encode path: stdin pipe only — %d frames %dx%d@%d -> %s (depth=%d%s%s, cache resume=%s)"
        % (n, w, h, fps, out.name, depth, ", HDR10" if hdr10 else "",
           ", vivid-meta" if vivid else "",
           "off (--force)" if force else "on (reused frames feed the same pipe)"))
    if eff != workers:
        log("workers: %d -> %d (only %d frames)" % (workers, eff, n))

    segs: list = []          # Vivid 逐段采样
    changes: list = []       # 场景切换帧号
    prev_avg = None
    sample_every = max(1, int(vivid_every))

    def note(i: int, st):
        nonlocal prev_avg
        if not st:
            return
        a = st["avgLum"]
        if prev_avg is not None and abs(a - prev_avg) > 0.12 * 65535:
            changes.append(i)
        prev_avg = a
        if i % sample_every == 0:
            segs.append({
                "frame": i,
                "timeMs": round(i / fps * 1000, 3),
                "maxSCL": st["maxSCL"],
                "maxRGB": st["maxRGB"],
                "avg": st["avg"],
                "avgLum": st["avgLum"],
                "p99Lum": st["p99Lum"],
                "brightFrac": st["brightFrac"],
            })

    t0 = time.time()
    bar = _Bar("stream", n)      # 进度 = 已写入 ffmpeg stdin 的帧数 / 总帧数
    expect = w * h * (6 if depth >= 10 else 3)   # 每帧裸字节数，用于核对送入量
    sent = 0
    sent_frames = 0
    rendered = cached = 0
    proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    try:
        if eff == 1:
            for i in range(n):
                data, st, k, from_cache = _pipe_frame(project, cfg, i, depth, vivid, force)
                _mf_add(k)
                if from_cache:
                    cached += 1
                else:
                    rendered += 1
                if vivid:
                    note(i, st)
                proc.stdin.write(data)
                sent += len(data)
                sent_frames += 1
                if sent_frames == 1 and len(data) != expect:
                    log("stream: frame0 = %d bytes, expected %d — input framing mismatch!"
                        % (len(data), expect))
                bar.update(i + 1)
        else:
            from concurrent.futures import ProcessPoolExecutor
            from collections import deque
            pstr = str(project)
            window = eff + 2          # 有界窗口：内存里最多 eff+2 帧（4K rgb48 约 50MB/帧）
            with ProcessPoolExecutor(max_workers=eff) as pool:
                pending = deque()
                nxt = 0
                for done in range(n):
                    while nxt < n and len(pending) < window:
                        pending.append(pool.submit(_pipe_worker, pstr, nxt, depth, vivid,
                                                   cfg, force))
                        nxt += 1
                    data, st, k, from_cache = pending.popleft().result()
                    _mf_add(k)
                    if from_cache:
                        cached += 1
                    else:
                        rendered += 1
                    if vivid:
                        note(done, st)
                    proc.stdin.write(data)
                    sent += len(data)
                    sent_frames += 1
                    if sent_frames == 1 and len(data) != expect:
                        log("stream: frame0 = %d bytes, expected %d — input framing mismatch!"
                            % (len(data), expect))
                    bar.update(done + 1)
    except BrokenPipeError:
        # ffmpeg 先死了：吞掉管道错，走下面 rc != 0 分支把它的 stderr 原文报出来
        pass
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        err = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
        rc = proc.wait()
    bar.finish()
    if rc != 0:
        die("ffmpeg failed:\n" + "\n".join(err.strip().splitlines()[-8:]))
    # 送入量核对：进度条计的是循环次数，这里计的是真进管道的字节
    log("stream: piped %d/%d frames, %.1f MB (expect %.1f MB)"
        % (sent_frames, n, sent / 1e6, n * expect / 1e6))
    dt = time.time() - t0
    log("frames: %d rendered, %d from cache (both feed the same stdin pipe, %.1fs)"
        % (rendered, cached, dt))
    log("streamed+encoded in %.1fs (%.0f ms/frame, stdin pipe only)"
        % (dt, dt * 1000 / max(1, n)))
    _verify_out(ff, out)

    if vivid:
        meta = {
            "standard": "HDR Vivid (T/UWA 005)",
            "video": out.name,
            "width": w, "height": h, "fps": fps, "frames": n,
            "color": {"primaries": "bt2020", "transfer": "smpte2084", "matrix": "bt2020nc"},
            "encodingNote": ("base layer is a compliant HDR10 signal; this sidecar carries the "
                             "dynamic metadata. ffmpeg-static has no CUVA/HDR-Vivid SEI encoder, "
                             "so pair it with a Vivid-capable encoder downstream."),
            "sampleEveryFrames": sample_every,
            "targetPeakNits": 1000,
            "sceneChanges": changes,
            "segments": segs,
        }
        meta_path = Path(str(out) + ".hdrvivid.json")
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
        log("hdr vivid meta: %s (%d segments, %d scene changes)"
            % (meta_path.name, len(segs), len(changes)))


def _verify_out(ff: str, out: Path) -> None:
    chk = subprocess.run([ff, "-hide_banner", "-i", str(out)], capture_output=True, text=True)
    for line in (chk.stderr or "").splitlines():
        if "Duration" in line or "Stream #" in line:
            log("  " + line.strip())


# ---------------------------------------------------------------- scaffold

INIT_RENDER = r'''# music-code-mv · NumPy + Pillow scene
# 契约 / contract: render_at(t, env) -> PIL.Image RGB (width x height)
# 每一帧是 t 的纯函数；随机只来自 env.rnd(seed)；网格/字体在导入时算好。
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 字阶 type scale
SCALE = 1.25
SIZES = [12, 15, 19, 24, 30, 37, 46, 58, 72]     # body = 19, ratio 1.25
COLS, GUT = 12, 24                                # strict grid: 12 columns

FONTS = ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/consola.ttf",
         "consola.ttf", "arial.ttf"]
_font_cache = {}


def font(size):
    key = int(size)
    if key not in _font_cache:
        f = None
        for name in FONTS:
            try:
                f = ImageFont.truetype(name, key)
                break
            except Exception:
                continue
        _font_cache[key] = f or ImageFont.load_default()
    return _font_cache[key]


def rgb(h, k=1.0):
    h = h.lstrip("#")
    return tuple(int(int(h[i:i + 2], 16) * k) for i in (0, 2, 4))


def mix(a, b, u):
    return tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(3))


# ---------------------------------------------------------------- 3D 透视投影
EYE = np.array([0.0, 0.75, 4.4])                  # orbit-free camera for the demo


def project(P, W, H, focal=1.7):
    """P: (...,3) world -> (...,2) pixels, returns (uv, depth)."""
    f = P - EYE
    z = np.clip(-f[..., 2], 0.15, None)
    s = focal / z
    return np.stack([W / 2 + f[..., 0] * s * W / 2,
                     H / 2 - f[..., 1] * s * H / 2], -1), z


CUBE = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)],
                dtype=np.float64) * 0.78
EDGES = [(0, 1), (0, 2), (0, 4), (3, 1), (3, 2), (3, 7),
         (5, 1), (5, 2), (5, 7), (6, 4), (6, 2), (6, 7)]


def rot(t):
    a = t * 0.72
    b = 0.42 + np.sin(t * 0.5) * 0.14
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    return Ry @ Rx


# ---------------------------------------------------------------- 分段色彩脚本
def variant(pal, k):
    """Derive a color chapter from ONE palette: roles stay, clothes change."""
    if k == 0:
        return dict(pal)
    p = dict(pal)
    if k % 2:                                        # chapter 2: accent steps forward
        p["base"], p["accent"] = p["accent"], p["base"]
        p["bg"] = "#%02x%02x%02x" % mix(rgb(pal["bg"]), rgb(pal["accent"]), 0.07)
    else:                                             # chapter 3: hot bleeds into bg
        p["bg"] = "#%02x%02x%02x" % mix(rgb(pal["bg"]), rgb(pal["hot"]), 0.09)
        p["dim"] = "#%02x%02x%02x" % mix(rgb(pal["dim"]), rgb(pal["hot"]), 0.25)
    return p


def chapters(env):
    segs = env.get("segments") or []
    if segs:
        out = []
        for s in segs:
            p = dict(env["palette"])
            p.update(s.get("palette") or {})
            out.append({"id": s.get("id", "seg"), "t": s.get("t", 0), "palette": p})
        return out
    dur = env["duration"]
    return [{"id": "ch1", "t": 0.0, "palette": variant(env["palette"], 0)},
            {"id": "ch2", "t": dur / 3, "palette": variant(env["palette"], 1)},
            {"id": "ch3", "t": 2 * dur / 3, "palette": variant(env["palette"], 2)}]


def chapter_at(t, env):
    ch = chapters(env)
    cur = ch[0]
    for c in ch:
        if t >= c["t"]:
            cur = c
    return cur


def shot_at(t, env):
    return chapter_at(t, env)["id"]


# ---------------------------------------------------------------- draw
def render_at(t, env):
    w, h, fps = env["w"], env["h"], env["fps"]
    ss = int(env["project"].get("supersample", 2))     # Pillow shapes are not AA
    W, H = w * ss, h * ss
    ch = chapter_at(t, env)
    pal = ch["palette"]
    bg, base, accent = rgb(pal["bg"]), rgb(pal["base"]), rgb(pal["accent"])
    hot, text, dim = rgb(pal["hot"]), rgb(pal["text"]), rgb(pal["dim"])

    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img, "RGBA")
    margin = round(W * 0.055)
    colw = (W - 2 * margin - (COLS - 1) * GUT * ss) / COLS

    # --- strict grid: 12 columns, held across all three chapters
    for c in range(COLS + 1):
        x = margin + c * (colw + GUT * ss) - (GUT * ss) / 2
        x = int(round(min(max(x, 0), W - 1)))
        d.line([(x, 0), (x, H)], fill=dim + (46,), width=1)

    # --- perspective floor grid (3D projection, painter order by depth)
    wave = 0.5 + 0.5 * np.sin(t * 1.7)
    step = 0.75
    floor_y = -1.15
    coords = np.arange(-5.25, 5.3, step)
    segs = []
    for x in coords:                                  # lines running away in z
        segs.append(np.stack([np.full(15, x), np.full(15, floor_y),
                              np.linspace(-5.0, 4.0, 15)], -1))
    for z in np.linspace(-5.0, 4.0, 15):              # lines running sideways
        segs.append(np.stack([coords, np.full_like(coords, floor_y),
                              np.full_like(coords, z)], -1))
    for P in segs:
        uv, depth = project(P, W, H)
        a = int(np.clip(30 + 90 * wave * np.exp(-depth.mean() * 0.30), 18, 220))
        for i in range(len(uv) - 1):
            if depth[i] > 0.2 and depth[i + 1] > 0.2:
                d.line([tuple(uv[i]), tuple(uv[i + 1])],
                       fill=accent + (a,), width=max(1, ss))

    # --- rotating cube wireframe, edges shaded by depth
    scale = min(1.0, max(0.0, (t - 0.25) / 1.2))       # chapter 1 event: it assembles
    if scale > 0:
        V = (CUBE @ rot(t).T) * scale + np.array([0.0, 0.35, -0.25])
        uv, depth = project(V, W, H)
        for i, j in EDGES:
            zm = (depth[i] + depth[j]) / 2
            a = int(np.clip(250 * np.exp(-zm * 0.35), 40, 250))
            d.line([(uv[i, 0], uv[i, 1]), (uv[j, 0], uv[j, 1])],
                   fill=base + (a,), width=max(1, 2 * ss))
        # the one hot event of the whole video: a single vertex flares per beat
        beat = (t % 2.0) / 2.0
        k = int(np.argmin(depth))
        r = (2 + 7 * (1 - beat)) * ss
        px, py = uv[k]
        d.ellipse([px - r, py - r, px + r, py + r], fill=hot + (int(200 * (1 - beat) + 55),))

    # --- type: title takes the top of the scale, HUD the bottom (rule 5)
    k = (W / 1280.0)
    title_sz = max(10, int(SIZES[6] * k))              # 46 @1280
    hud_sz = max(9, int(SIZES[1] * k))                 # 15 @1280
    name = str(env["project"].get("name", "MUSIC CODE MV"))
    d.text((margin, margin), name, font=font(title_sz), fill=text + (255,), anchor="lt")
    d.text((margin, margin + title_sz * 1.35),
           "numpy+pillow · grid %d · scale %.2f" % (COLS, SCALE),
           font=font(hud_sz), fill=dim + (255,), anchor="lt")
    d.text((margin, H - margin), "%s  t=%.2f" % (ch["id"], t),
           font=font(hud_sz), fill=accent + (255,), anchor="ls")
    d.text((W - margin, H - margin), "f%d/%d" % (env["frame"], round(env["duration"] * fps)),
           font=font(hud_sz), fill=dim + (255,), anchor="rs")
    if scale >= 1.0 and t < env["duration"] / 3:
        d.text((W - margin, margin), "V-E+F=2", font=font(hud_sz),
               fill=hot + (255,), anchor="rt")

    if ss != 1:
        img = img.resize((w, h), Image.LANCZOS)        # cheap low-pass + AA
    # 收尾通道（bloom/scanlines/vignette/grain）由引擎按 project.json fx 统一施加
    return img.convert("RGB")
'''

INIT_STORYBOARD = """# {name} — storyboard（NumPy+Pillow 引擎{preset}）

{summary}

| # | shot id | start–end | 发生了什么 / what happens | 风格 | lyric cue |
|---|---|---|---|---|---|
{rows}

## Palette

```json
{palette}
```

## Rules
- 每一帧是 t 的纯函数：src/render.py 不许读挂钟、不许用全局 np.random。
- 随机只来自 env.rnd(seed)，seed 绑 frame。
- 每改一镜：`python scripts/render-np.py --project=. --contact` 然后**读图**。
"""


def scaffold(dest: Path, force: bool, preset_id: str | None) -> None:
    if dest.exists() and any(dest.iterdir()) and not force:
        die("directory not empty: %s  (use --force)" % dest)
    dest.mkdir(parents=True, exist_ok=True)

    preset = None
    if preset_id:
        pf = PRESETS_DIR / (preset_id + ".json")
        if not pf.exists():
            ids = sorted(p.stem for p in PRESETS_DIR.glob("*.json"))
            die('unknown preset "%s" (available: %s)' % (preset_id, ", ".join(ids)))
        preset = json.loads(pf.read_text("utf-8"))

    cfg = {
        "name": dest.name,
        "width": 640, "height": 360, "fps": 30, "duration": 12,
        "supersample": 2,
        "palette": dict(DEFAULT_PALETTE),
        "segments": [],
        "fx": {  # 引擎级收尾通道，与 Chrome 引擎的 project.json fx 同构
            "bloom": True, "bloomAlpha": 0.45, "bloomThreshold": 150,
            "chroma": False, "chromaAmount": 2, "chromaAlpha": 0.15,
            "scanlines": False, "scanAlpha": 0.12, "scanGap": 3,
            "vignette": True,
            "grain": True, "grainAlpha": 0.4,
        },
    }
    if preset:
        if preset.get("palette"):
            cfg["palette"].update(preset["palette"])
        if preset.get("duration"):
            cfg["duration"] = preset["duration"]
        # 预设的后期与 3D 镜头逻辑必须一起套上 —— 只套 palette 会让浅色预设
        # （claude / ink-paper）落在脚手架默认的 bloom:true 上，整屏过曝。
        if isinstance(preset.get("fx"), dict):
            cfg["fx"].update(preset["fx"])
        if isinstance(preset.get("three"), dict):
            cfg["three"] = preset["three"]
        if isinstance(preset.get("segments"), list):
            cfg["segments"] = preset["segments"]
    (dest / "src").mkdir(exist_ok=True)
    (dest / "project.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", "utf-8")
    (dest / "src" / "render.py").write_text(INIT_RENDER, "utf-8")

    if preset and isinstance((preset.get("storyboard") or {}).get("shots"), list):
        rows = "\n".join(
            "| %d | %s | %s–%s | %s | %s | %s |" % (
                i + 1, s.get("id", ""), s.get("start", ""), s.get("end", ""),
                s.get("what", ""), s.get("style", ""), s.get("lyric", "—"))
            for i, s in enumerate(preset["storyboard"]["shots"]))
        (dest / "storyboard.md").write_text(INIT_STORYBOARD.format(
            name=dest.name, preset="（preset: %s）" % preset_id,
            summary=preset["storyboard"].get("summary", ""), rows=rows,
            palette=json.dumps(preset.get("palette", {}), ensure_ascii=False, indent=2),
        ) + "\n", "utf-8")
        if preset.get("lyrics"):
            (dest / "lyrics.lrc").write_text("\n".join(preset["lyrics"]) + "\n", "utf-8")

    rel = os.path.relpath(HERE / "render-np.py", Path.cwd()) or "render-np.py"
    log("scaffolded %s%s" % (dest, ("  (preset: %s)" % preset_id) if preset_id else ""))
    log("")
    log("next:")
    log("  1. python %s --project=%s --contact    # 联系表，然后读图" % (rel, dest))
    log("  2. 改 src/render.py 与 project.json（segments 分段色彩脚本）")
    log("  3. python %s --project=%s --out=out/video.mp4" % (rel, dest))


def list_presets() -> None:
    for p in sorted(PRESETS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text("utf-8"))
            log("%-12s %-26s %s" % (data.get("id", p.stem),
                                    data.get("title", ""), data.get("summary", "")))
        except Exception as e:
            log("%-12s (broken: %s)" % (p.stem, e))


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(prog="render-np.py",
                                 description="music-code-mv NumPy+Pillow frame engine")
    ap.add_argument("--project", help="project directory (contains project.json)")
    ap.add_argument("--init", dest="init", help="scaffold a new project directory")
    ap.add_argument("--force", action="store_true", help="overwrite / re-render everything")
    ap.add_argument("--preset", help="preset id from presets/*.json")
    ap.add_argument("--contact", action="store_true", help="render a contact sheet")
    ap.add_argument("--keys", type=int, default=12, help="contact sheet keyframes (default 12)")
    ap.add_argument("--stills", help="comma-separated timestamps, e.g. 0,3.5,8")
    ap.add_argument("--out", help="output mp4 (or contact sheet path with --contact)")
    ap.add_argument("--audio", help="audio file to mux with -shortest")
    ap.add_argument("--workers", type=int, default=1, help="parallel render processes")
    ap.add_argument("--ss", type=int,
                    help="超采样倍数 override：默认 project.json 的 supersample（2）；"
                         "终渲用 3 或 4 换更干净的边缘（换档会强制重渲，不复用旧档缓存）")
    ap.add_argument("--stream", action="store_true",
                    help="no-op 兼容位：管道编码现在是唯一路径（implied always-on）——"
                         "缓存照写（resume/增量的价值），但编码器只见 stdin")
    ap.add_argument("--shutter", type=float, default=0.2,
                    help="运动模糊：每输出帧对快门窗口 shutter×帧时 内的子帧取平均"
                         "（temporal supersampling）。默认 0.2 = 质感起点不是上限（要更顺滑就"
                         "加大）；0 = 关。子帧时刻只由 t 决定，确定性不受影响")
    ap.add_argument("--samples", default="auto",
                    help="每输出帧子帧数：auto（**只看画面**的自适应收敛：在二分档位边界比前后"
                         "两档均值，通道差 < tol 即停；静止≈5、缓动≈17–65、甩镜打满324，无时间/"
                         "次数预算）| 整数 N（固定，均匀铺满快门窗口）；仅 --shutter>0 时生效")
    ap.add_argument("--tol", type=int, default=3,
                    help="auto 收敛判据：档位边界处前后两档均值的最大通道差 < tol（按 0..255 计，"
                         "即 tol/255）就停（默认 3）")
    ap.add_argument("--depth", type=int, default=8, help="输出位深 8|10|12（10/12 自动走流式）")
    ap.add_argument("--hdr10", action="store_true", help="10/12-bit 时按 HDR10 打标（BT.2020 + PQ）")
    ap.add_argument("--hdr-vivid", action="store_true",
                    help="HDR Vivid (T/UWA 005)：自动升到 10-bit + HDR10 基底，"
                         "边渲边算动态元数据并写出 <out>.hdrvivid.json（本机 ffmpeg 无 CUVA "
                         "编码器，SEI 由下游支持 Vivid 的编码器合入）")
    ap.add_argument("--w", type=int, help="宽度 override（hi-res 支持）")
    ap.add_argument("--h", type=int, dest="height", help="高度 override（hi-res 支持）")
    ap.add_argument("--fps", type=int, help="帧率 override（4K120 用 120）")
    ap.add_argument("--duration", type=float, help="时长秒数 override")
    ap.add_argument("--format", choices=["png", "jpeg", "jpg"], default=None,
                    help="帧容器：png（无损）| jpeg（hi-res 下比 PNG 快约 3 倍）")
    ap.add_argument("--list-presets", action="store_true")
    args = ap.parse_args()

    if args.list_presets:
        list_presets()
        return
    if args.init:
        scaffold(Path(args.init).resolve(), args.force, args.preset)
        return
    if not args.project:
        ap.error("--project=<dir> (or --init=<dir>, --list-presets)")
    project = Path(args.project).resolve()
    cfg = load_project(project)
    force = args.force
    if args.w: cfg["width"] = int(args.w)
    if args.height: cfg["height"] = int(args.height)
    if args.fps: cfg["fps"] = int(args.fps)
    if args.duration: cfg["duration"] = float(args.duration)
    if args.format: cfg["frameFormat"] = "jpeg" if args.format == "jpg" else args.format
    ss_now = int(cfg.get("supersample", 2))
    if args.ss:
        want = max(1, int(args.ss))
        if ss_now != want:
            log("supersample %s -> %d (requested)" % (ss_now, want))
        ss_now = want
        cfg["supersample"] = ss_now
    # ---- 子帧平均运动模糊：参数挂进 cfg（与 --w/--h 覆盖同一机制，worker 通过
    #      显式下传的 cfg 拿到；env["project"] 也带 `_` 前缀键，场景可自检）----
    shutter = max(0.0, float(args.shutter or 0.0))
    samples = ("auto" if str(args.samples).strip().lower() == "auto"
               else max(1, int(args.samples)))
    tol = max(0, int(args.tol))
    cfg["_shutter"], cfg["_samples"], cfg["_tol"] = shutter, samples, tol
    # 渲染档位指纹：尺寸/帧率/时长/超采样/帧容器一旦变，帧缓存就不能复用
    # （这些是 CLI 覆盖，不在 project.json 的签名里，必须自己记一笔）。
    stamp = "w%d-h%d-f%d-d%g-ss%d-%s" % (
        cfg["width"], cfg["height"], cfg["fps"], cfg["duration"], ss_now,
        str(cfg.get("frameFormat", "png")))
    if shutter > 0:
        # 运动模糊改变像素 → 必须进档位指纹（快门/采样/容差任一变都整轮重渲）。
        # shutter=0 沿用旧 stamp —— 显式关模糊时存量缓存不失效，A/B 基准也不会互相污染。
        stamp += "-sh%g-sa%s-tol%d" % (shutter, str(samples), tol)
    marker = project / "frames" / ".renderpass"
    try:
        prev = marker.read_text().strip() if marker.exists() else None
    except Exception:
        prev = None
    if prev is not None and prev != stamp:
        log("render pass %s -> %s: cache belongs to another pass, forcing re-render"
            % (prev, stamp))
        force = True
    ensure_signature(project)
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(stamp, "utf-8")
    except Exception:
        pass
    depth = max(8, int(args.depth))
    if args.hdr_vivid:
        depth = max(depth, 10)
    if args.hdr10:
        # P1-R2（np 侧实读确认的连带问题）：--hdr10 以前既不抬位深、也不进流式分发 ——
        # depth=8 时被静默丢弃，出的片根本不是 HDR。现在抬到 10-bit：
        # 必然走流式（np 唯一的 10-bit 路径就是 libx265），hdr10 永不落空，
        # 也不可能撞上非 libx265 编码器。
        depth = max(depth, 10)
        log("hdr10: depth -> %d (10-bit libx265 stream path)" % depth)

    if args.contact:
        out = _out_path(project, args.out) if args.out else None
        contact_sheet(project, args.keys, out, force)
        return
    if args.stills:
        export_stills(project, [float(x) for x in args.stills.split(",") if x.strip()],
                      force)
        return
    out = _out_path(project, args.out) if args.out else (project / "out" / "video.mp4")

    # ---- 编码只留管道（np-A 定稿）：没有判定、没有第二条路 ----
    # 帧来源（缓存读出 / 现场渲）由 render_video 内部经 _pipe_frame 决定，编码器只见
    # stdin；resume 靠缓存读分支保住，--force 才整轮重渲。HDR 10/12-bit 同一条管道。
    _reset_blur_stats()
    t_disp = time.time()
    log("stream: always on (streaming is the only encoder path)")
    render_video(project, out, args.audio, max(1, args.workers), depth,
                 args.hdr10, force, vivid=args.hdr_vivid)
    if shutter > 0:
        # 成本只作记录（排期用），不参与任何采样决策
        _log_blur(shutter, samples, tol, n_frames(cfg), time.time() - t_disp)
    else:
        log("shutter: 0 (motion blur off — default is 0.2, enable with --shutter=0.2)")


if __name__ == "__main__":
    main()
