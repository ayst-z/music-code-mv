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


# ---------------------------------------------------------------- frame render

def _out_path(project: Path, spec: str) -> Path:
    """--out relative paths resolve against the PROJECT, not the cwd."""
    p = Path(spec)
    return p if p.is_absolute() else (project / p)


def frame_path(project: Path, frame: int) -> Path:
    return project / "frames" / ("f%05d.png" % frame)


def render_frame(project: Path, frame: int, force: bool = False) -> str:
    """Render one frame into the cache. Returns 'cache' or 'rendered'."""
    out = frame_path(project, frame)
    if out.exists() and not force:
        return "cache"
    cfg = load_project(project)
    mod = load_render_module(project)
    env = build_env(cfg, frame)
    try:
        img = mod.render_at(env["t"], env)
    except Exception as e:
        die("render_at(%g) raised: %r" % (env["t"], e))
    if not isinstance(img, Image.Image):
        die("render_at(%g) returned %r, expected a PIL.Image" % (env["t"], type(img)))
    if img.size != (cfg["width"], cfg["height"]):
        die("render_at(%g) returned %dx%d, expected %dx%d"
            % (env["t"], img.size[0], img.size[1], cfg["width"], cfg["height"]))
    if img.mode != "RGB":
        die("render_at(%g) returned mode %s, expected RGB (call .convert('RGB'))"
            % (env["t"], img.mode))
    fx = cfg.get("fx") or {}
    if fx:
        arr = apply_fx(np.asarray(img).astype(np.float32), fx, frame)
        img = Image.fromarray(arr.astype(np.uint8), "RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    img.save(tmp, "PNG")
    os.replace(tmp, out)
    return "rendered"


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

def _box_blur3(a, passes: int = 2):
    for _ in range(passes):
        p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
        a = ((p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] +
              p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:] +
              p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 9.0)
    return a


def apply_fx(arr, fx: dict, seed: int):
    """与 Chrome 引擎同构的收尾通道，全 NumPy：bloom → chroma → scanlines → vignette → grain。
    Flags come from project.json `fx`; every scene gets them for free."""
    if not fx:
        return np.clip(arr, 0, 255)
    h, w = arr.shape[:2]
    a = arr.astype(np.float32, copy=True)

    if fx.get("bloom"):
        lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        thr = float(fx.get("bloomThreshold", 150.0))
        k = np.clip((lum - thr) / max(1e-3, 255.0 - thr), 0, 1)[..., None]
        glow = _box_blur3(a * k, 2)
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
        m = np.ones(h, dtype=np.float32)
        m[np.arange(h) % gap == (gap // 2)] = 1.0 - al
        a *= m[:, None, None]

    if fx.get("vignette"):
        Y, X = np.mgrid[0:h, 0:w]
        nx = (X + 0.5) / w * 2 - 1
        ny = (Y + 0.5) / h * 2 - 1
        r = np.sqrt(nx * nx + ny * ny) / math.sqrt(2.0)
        fall = 1.0 - 0.35 * np.clip((r - 0.55) / 0.45, 0, 1) ** 2
        a *= fall[..., None]

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


def encode_video(project: Path, cfg: dict, out: Path, audio: str | None) -> None:
    ff = find_ffmpeg(project)
    n = n_frames(cfg)
    pattern = str(frame_path(project, 0)).replace("f%05d.png" % 0, "f%05d.png")
    args = [ff, "-y", "-loglevel", "error",
            "-framerate", str(cfg["fps"]), "-start_number", "0", "-i", pattern]
    if audio:
        args += ["-i", audio, "-map", "0:v:0", "-map", "1:a:0"]
    args += ["-c:v", "libx264", "-preset", "medium", "-crf", "17",
             "-pix_fmt", "yuv420p",
             "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"]
    if audio:
        args += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
    args += ["-frames:v", str(n), "-movflags", "+faststart", str(out)]
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or "").strip().splitlines()[-8:])
        die("ffmpeg failed:\n" + tail)
    log("encoded: %s" % out)
    # verify: duration + streams, same as the Chrome engine's finish step
    chk = subprocess.run([ff, "-hide_banner", "-i", str(out)], capture_output=True, text=True)
    for line in (chk.stderr or "").splitlines():
        if "Duration" in line or "Stream #" in line:
            log("  " + line.strip())


def render_video(project: Path, out: Path, audio: str | None,
                 workers: int, force: bool) -> None:
    cfg = load_project(project)
    n = n_frames(cfg)
    t0 = time.time()
    rendered = cached = 0
    if workers > 1:
        from concurrent.futures import ProcessPoolExecutor
        pstr = str(project)
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_worker, pstr, fi, force) for fi in range(n)]
            done = 0
            for fut in futures:
                status = fut.result()
                done += 1
                if status == "rendered":
                    rendered += 1
                else:
                    cached += 1
                if done % 60 == 0 or done == n:
                    log("  %d/%d frames" % (done, n))
    else:
        last = 0.0
        for fi in range(n):
            status = render_frame(project, fi, force)
            if status == "rendered":
                rendered += 1
            else:
                cached += 1
            done = fi + 1
            pct = done / n
            if time.time() - last > 1.0 or done == n:
                last = time.time()
                log("  %d/%d frames (%.0f%%)" % (done, n, pct * 100))
    dt = time.time() - t0
    log("frames: %d rendered, %d from cache, %.1fs (%.0f ms/frame)"
        % (rendered, cached, dt, (dt * 1000 / max(1, rendered)) if rendered else 0))
    encode_video(project, cfg, out, audio)


def _worker(project_str: str, frame: int, force: bool) -> str:
    return render_frame(Path(project_str), frame, force)


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
    ensure_signature(project)

    if args.contact:
        out = _out_path(project, args.out) if args.out else None
        contact_sheet(project, args.keys, out, args.force)
        return
    if args.stills:
        export_stills(project, [float(x) for x in args.stills.split(",") if x.strip()],
                      args.force)
        return
    out = _out_path(project, args.out) if args.out else (project / "out" / "video.mp4")
    render_video(project, out, args.audio, max(1, args.workers), args.force)


if __name__ == "__main__":
    main()
