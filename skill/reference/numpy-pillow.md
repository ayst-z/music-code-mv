# NumPy + Pillow 逐帧引擎 (NumPy + Pillow frame engine)

第二条渲染引擎：**每一帧是一个 `float32` 数组，用 NumPy 向量化算出来，用 Pillow 落字与收尾，用 ffmpeg 编码。** 没有浏览器、没有 DOM、没有 WebGL。全程序化生成的四个方法——**逐帧渲染、3D 透视投影、严格栅格与字阶、分段色彩脚本**——都在这里。

A second render engine: **every frame is a `float32` array computed vectorised in NumPy, typeset with Pillow, encoded with ffmpeg.** No browser, no DOM, no WebGL. The four methods of fully-procedural generation — frame-by-frame rendering, 3D perspective projection, strict grid & type scale, segmented color script — live here.

## 什么时候用它 (When to use it)

| 选 Chrome 引擎 when… | 选 NumPy 引擎 when… |
|---|---|
| 需要真字体排版、CSS、DOM 分层 | 画面本质是**数学**：场、SDF、分形、采样理论 |
| 需要 Three.js 光照/材质/实例化 | 每帧要做**重像素运算**（卷积、FFT 类、IEEE-754 演算） |
| 已有 Canvas2D 场景代码 | 想要**严格栅格 + 精确坐标**的排版，像素说了算 |
| — | 无头 Chrome 起不来（沙箱 `spawn EPERM`）时的**兜底引擎** |

两个引擎共用同一套默认做法：**每一帧是 `t` 的纯函数**、带种子的随机、先分镜后代码、联系表自检。

Both engines share the same defaults: **each frame is a pure function of `t`**, seeded randomness, storyboard before code, contact-sheet self-review.

## 工程契约 (The project contract)

```
my-mv/
  project.json     # width, height, fps, duration, palette, segments
  src/render.py    # render_at(t, env) -> PIL.Image；shot_at(t) -> str（可选）
  frames/          # f00000.png …（帧缓存）
  out/             # contact.png / video.mp4
```

`src/render.py` 导出两个函数（少一个，`loadRenderModule` 就点名报错退出） / it exports two functions:

```python
def render_at(t, env):   # t = 全局虚拟秒 / global virtual seconds
    """返回恰好 width×height 的 RGB 图像。同 t → 同像素，永远。"""
    ...

def shot_at(t, env):     # 可选：给联系表标注镜头名（也接受 shot_at(t)）
    return "boot" if t < 4 else "grid"
```

`env` 的字段 / the `env` fields:

| key | 值 / value |
|---|---|
| `w`, `h`, `fps`, `duration` | 来自 `project.json` |
| `t`, `frame` | 本帧虚拟时间与序号（`frame = round(t*fps)`） |
| `palette` | 六角色调色板 `bg/dim/base/accent/hot/text` |
| `segments` | 分段色彩脚本（见下），没有则为 `[]` |
| `project` | 整个 `project.json` |
| `rnd(seed)` | 返回 `np.random.default_rng(seed)`——**唯一允许的随机来源** |

## 命令 (Commands)

```bash
# 任何带 numpy + Pillow 的 Python 3.10+；本工作区 PATH 上的裸 python 没有它们，
# 要用 DSH 自带的 <python>（numpy + Pillow 已备），并先设 PYTHONIOENCODING=utf-8 避免中文乱码
python scripts/render-np.py --init=my-mv-np [--preset=claude]   # 脚手架
python scripts/render-np.py --project=my-mv-np --contact        # 联系表（自检）
python scripts/render-np.py --project=my-mv-np --stills=0,3,8   # 指定时刻单帧 → out/still-0.00s.png
python scripts/render-np.py --project=my-mv-np --out=out/video.mp4 --audio=track.mp3
python scripts/render-np.py --project=my-mv-np --out=out/video.mp4 --workers=8  # 多进程补帧
```

`--preset=` 接 `presets/*.json`（与 Chrome 引擎同一批预设：`claude`、`deepseek`、`gpt`、`neon-rain`…）。`--out=` 成功后自动打印核验行：`Duration` 与视频流（编码/像素格式/分辨率/帧率）。改完预设跑配色纪律测试：`python scripts/audit-presets.py`（R1–R4 四条规则加 `three.roles` 结构检查，exit 1 即有违规）。

**路径解析的不对称（实测）：** `--out=` 相对**工程目录**，`--audio=` 相对**进程当前目录**；从别处启动就要给 `--audio=` 全路径，否则 ffmpeg 报 `Error opening input file`。本引擎也**没有** `--w/--h/--fps/--dur` 覆盖，尺寸只由 `project.json` 决定。本引擎没有 `--gl/--encoder/--depth` 这些 Chrome 引擎的开关，编码固定 `libx264 -preset medium -crf 17`。预设的 `palette`/`fx`/`duration`/分镜/歌词**本引擎同样会套**（实测 `--init --preset=claude` 写出 `"bloom": false`），另外还会写 `three` 与 `segments`，`segments` 由引擎自己消费。

**Path resolution is asymmetric (measured):** `--out=` resolves against the **project**, `--audio=` against the **process CWD** — give a full path for `--audio=` or ffmpeg reports `Error opening input file`. There are no `--w/--h/--fps/--dur` overrides (size comes from `project.json`), none of the Chrome engine's `--gl/--encoder/--depth` flags, and encoding is fixed at `libx264 -preset medium -crf 17`. A preset's `palette`, `fx`, `duration`, storyboard and lyrics **are applied by this engine too** (verified: `--init --preset=claude` writes `"bloom": false`); it additionally writes `three` and `segments` and consumes `segments` itself.

## 确定性 (Determinism)

- 时间**只**来自 `t`；`time.time()` 或帧间可变的全局状态会让同一 `t` 两次渲出不同像素，帧缓存与并行就失去意义。
- 随机**只**来自 `env.rnd(seed)`，seed 用 `frame` 或镜头 id 派生——同一帧永远同一个生成器。
- 昂贵的基底（meshgrid、投影矩阵、字体对象）在**模块导入时**算一次，不要每帧重建。
- `render_at` 的约定：同步、幂等、可乱序调用——联系表会跳着取帧，多进程会并行取帧；不幂等的代价是同 `t` 不同像素，跳帧处直接花屏。

- Time comes only from `t`; randomness only from `env.rnd(seed)`; precompute grids/matrices/fonts at import time; `render_at` is expected to be synchronous, idempotent and safe to call out of order — the contact sheet samples frames out of order and workers render in parallel, so anything else shows up as smeared frames.

## 逐帧渲染 (Frame-by-frame rendering)

帧写成 `frames/f00000.png`（五位序号；Chrome 引擎序号一致，但默认帧容器是 jpeg，即 `f00000.jpg`）；已存在的帧直接跳过，所以长渲染天然可断点续跑，`--force` 全部重来。编码：

Frames go to `frames/f%05d.png` (five-digit; the Chrome engine uses the same numbering but defaults to `f%05d.jpg`); existing frames are skipped, so long renders resume for free (`--force` to redo). Encoding:

```
ffmpeg -framerate <fps> -start_number 0 -i frames/f%05d.png \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p \
  -vf scale=trunc(iw/2)*2:trunc(ih/2)*2 -movflags +faststart out.mp4
```

封装音频：音频作第二输入，`-c:a aac -b:a 192k -shortest`，并 `-map 0:v:0 -map 1:a:0`。

## 帧缓存签名 (Cache signature)

引擎启动时把 `project.json` + `src/render.py` 的 sha1 存进 `frames/.signature`；不匹配就**自动清空帧缓存重渲**（日志 `signature changed: cleared N cached frames`）——改工程不再需要 `--force` 手动清（与 Chrome 引擎的 `signature.mjs` 同构）。`--force` 仍保留用于强制重渲同一份工程。注意这条链路里 `ensure_signature` 是**每次运行都会跑**的，所以「文件在就复用」只在签名一致时成立。

At startup the engine hashes `project.json` + `src/render.py` into `frames/.signature`; a mismatch clears the cache automatically — no manual `--force` after edits.

## 收尾通道 (FX stack)

project.json 的 `fx` 块（与 Chrome 引擎同构）由引擎在 `render_at` 返回之后**统一施加**，全部 NumPy 向量化：`bloom`（亮度阈值提亮 + 两次 3×3 盒式模糊，加法混合）→ `chroma`（R/B 通道反向平移后按 `chromaAlpha` 混合）→ `scanlines`（每 `scanGap` 行乘性压暗 `scanAlpha`）→ `vignette`（径向渐晕，边缘最深 35%）→ `grain`（按 frame 播种的高斯颗粒，`grainAlpha` 控制幅度）。顺序固定；场景代码**不再自己做后期**；`fx` 缺省/为空对象则整条通道跳过。脚手架默认开 `bloom + vignette + grain`，与模板舞台配套。

The `fx` block is applied after `render_at` in a fixed chain — bloom, chroma, scanlines, vignette, seeded grain — all vectorised NumPy. Scenes leave post to the chain; an empty `fx` skips it. The scaffold enables bloom + vignette + grain by default.

## 流式输出 · hi-res · HDR (Streaming, hi-res and HDR)

**流式输出 / streaming —— 默认就走它。** 帧渲出来后**直接管道给 ffmpeg**，`frames/` 一个字节都不写（4K120 一次渲的帧缓存实测 17–18 GB → 0）。现在的默认策略是**自动二选一**：

```bash
python scripts/render-np.py --project=demo --out=out/v.mp4 --workers=8   # 默认：自动判定
python scripts/render-np.py ... --no-stream                              # 强制走帧缓存（可续跑 + 可增量）
python scripts/render-np.py ... --stream                                 # 强制流式
```

| 决策日志（每次跑都打一行） | 含义 |
|---|---|
| `stream: auto-on (no resumable frame cache …)` | 首渲/直出 → 流式，零写盘 |
| `stream: auto-off (resumable frame cache found …)` | 这一档有可续缓存 → 增量 + 断点续跑 |
| `stream: off (--no-stream …)` | 你显式打开缓存开关 |
| `stream: forced for depth=10/hdr output` | hi-res/HDR 只有流式路径（缓存路只编 8-bit），`--no-stream` 被如实覆盖 |

**墙钟实测**（同工程 1920×1080@30、180 帧、8 workers、`--force` 消缓存假象、前后确认无争抢 ffmpeg）：**流式 52.4s / 0 字节写盘** vs **缓存 65.9s / 678 MB** → **快 13.5s（−20.5%）**；不带参数复跑缓存路径只要 26.8s（`0 rendered, 180 from cache`，只剩编码）——这正是 auto-off 要保护的场景。诚实代价不变：**流式没有帧缓存 = 不能断点续渲**（昨天就有一次编码中途被杀，救场的是缓存）；迭代期靠 auto-off 自动落在缓存路。

**输出步骤全程有进度条**（同一套 pct/ETA/fps 口径）：`[render]`（渲染两分支共用）、`[encode]`（解析 ffmpeg `-progress pipe:1`）、`[stream]`（按 stdin 写入帧数）、`[tts]`（逐条文件名）、`[music]`（按 section）。非 TTY（管道/工作室 job log）每 4s 落一行，完成拍必落 100%。

**尺寸覆盖可靠**：`--w/--h` 等 CLI 覆盖会贯通到 worker（曾有过只覆盖主进程、worker 读回原尺寸导致成片只剩 20 帧的 P0）；两条常驻诊断 `frame0 = N bytes, expected M` 与 `piped X/Y frames, A MB (expect B MB)` 秒定位这类尺寸不匹配。

**hi-res 支持**：`--w --h --fps --duration --format=png|jpeg` 全部可覆盖 `project.json`（4K120 就是 `--w=3840 --h=2160 --fps=120`）。**换档会自动强制重渲**：引擎在 `frames/.renderpass` 记一份「渲染档位指纹」（尺寸/帧率/时长/超采样/帧容器），与当前不符就拒绝复用旧帧——否则 CLI 覆盖会拿到上一档的缓存。hi-res 下帧容器用 `--format=jpeg`（quality 92、4:4:4）比 PNG 快约 3 倍；PNG 的 `pngLevel` 只影响写盘速度、不影响画质（PNG 恒无损）。

**HDR10**：`--depth=10|12 --hdr10`。8 位 PNG 装不下 10 位，所以 **HDR 走流式**（缓存路径只能编 8-bit，引擎会自动开流式并打日志）：`render_at` 出 uint8 → `v*257` 线性扩到 16 位 → `rgb48le` 管道 → ffmpeg 落 `yuv420p10le` + BT.2020/PQ 打标 + libx265（`-tag:v hvc1`）。实测输出：`hevc (Main 10) · yuv420p10le (bt2020nc/bt2020/smpte2084)`。

**HDR Vivid (T/UWA 005)**：`--hdr-vivid` 自动升到 10-bit + HDR10 基底，并在流式过程中**逐帧算动态元数据**（每 `sampleEvery=6` 帧采一段：`maxSCL`/`maxRGB`/`avg`/`avgLum`/`p99Lum`/`brightFrac`，附场景切换检测），写出 `<out>.hdrvivid.json`。**如实说明**：本机 ffmpeg（gyan essentials 6.1.1）**没有 CUVA/HDR-Vivid SEI 编码器**，所以交付形态是「合规 HDR10 基底 + Vivid 动态元数据 sidecar」，SEI 由下游支持 Vivid 的编码器合入。

**性能预算 / performance budget**（640×360，本机实测，含机器争抢时的基线校准）：

| 阶段 | 优化前 | 优化后 |
|---|---|---|
| `apply_fx` 全套 | 76.1 ms | **16.0 ms（−79%）** |
| bloom 通路 | 61.9 ms | **9.2 ms（−85%）** —— 辉光是低频信息，在 **1/4 分辨率**上模糊再放回（`fx.bloomDiv` 可调） |
| vignette | 28.7 ms（每帧重建 `mgrid`） | **0.00 ms**（按尺寸缓存） |
| scanline | 每帧重建掩膜 | **0.00 ms**（按尺寸缓存） |
| 端到端 60 帧 | 46 ms/帧 | **18 ms/帧（2.6×）** |
| 4K120 HDR10 流式（240 帧实测） | — | **51 ms/帧，落盘 0 字节** |

**并行的坑**：小片子开大并行是**负优化**（进程启动比渲一帧还贵）。引擎按「每个 worker 至少 16 帧」自动封顶并打印 `workers: 8 -> 4 (only 60 frames)`。

Streaming is the default for mp4 output: frames pipe straight to ffmpeg and `frames/` stays at zero bytes (17–18 GB saved on a 4K120 pass). The engine picks between streaming and a resumable frame cache automatically and prints which (auto-on / auto-off / `--no-stream` / forced for 10-bit+HDR); measured head-to-head, streaming took **52.4 s with zero disk writes vs 65.9 s and 678 MB cached (−20.5 %)**, while an incremental cache re-run took 26.8 s (`0 rendered, 180 from cache`) — which is exactly what auto-off protects. The honest tradeoff stays: streaming cannot resume mid-run. Every output stage prints the same progress-bar style (`[render]`, `[encode]`, `[stream]`, `[tts]`, `[music]`), falling back to one log line every 4 s when stdout is not a TTY. `--w --h --fps --duration --format` override the project and now reach the workers too (a P0 where overrides stayed in the parent used to cut masters down to 20 frames); `frame0 = N bytes, expected M` and `piped X/Y frames` diagnose framing mismatches immediately. HDR (`--depth=10|12 --hdr10`) streams by necessity: uint8 → `v*257` → `rgb48le` → `yuv420p10le` with BT.2020/PQ tagging; `--hdr-vivid` samples dynamic metadata per frame and writes a `.hdrvivid.json` sidecar — this build of ffmpeg has no CUVA SEI encoder, so the honest deliverable is an HDR10 base layer plus the Vivid sidecar. Measured: `apply_fx` 76→16 ms (bloom at quarter resolution), vignette/scanline cached to zero, end-to-end 46→18 ms/frame, 4K120 HDR10 streaming at 51 ms/frame with zero disk.

## NumPy 逐像素技法 (Per-pixel techniques)

**一切都先在 `float32` 里算，最后一次转 `uint8`。** 数组按 `[0,1]` 或 `[0,255]` 全程一个约定，`np.clip` 之后才 `astype(np.uint8)`——`uint8` 直接相加会静默回绕（`250+20=14`），这是最常见的花屏原因。

**Everything is computed in `float32`, converted to `uint8` once at the end** with an explicit clip. `uint8` arithmetic wraps silently (`250+20=14`) — the classic source of garbage frames.

核心原语 / the core primitives:

```python
Y, X = np.mgrid[0:h, 0:w]                       # 像素坐标网格
fx, fy = (X + 0.5) / w * 2 - 1, (Y + 0.5) / h * 2 - 1   # 归一化 [-1,1]

# SDF：圆 / 线段 / 矩形——比 Pillow 的逐形状绘制快，而且天然可插值
d = np.sqrt((fx - cx)**2 + (fy - cy)**2) - r
mask = np.clip(0.5 - d / aa, 0, 1)               # 抗锯齿边缘（aa ≈ 1.5/w）

img += mask[..., None] * color                   # 合成用加法/lerp，别用 uint8
img = 1 - (1 - img) * (1 - glow)                 # screen 混合，做发光不越界

blur = (np.roll(img, 1, 0) + np.roll(img, -1, 0) +
        np.roll(img, 1, 1) + np.roll(img, -1, 1)) * 0.25   # 3×3 盒式模糊 ×N 次 ≈ bloom
```

- 场类画面（正弦、干涉、格点、摩尔纹）用 `np.sin(a*X + b*Y + c*t)` 一把出全帧，永远不要 Python 循环逐像素。
- 高频图案（密栅格、像素排序、1→4096 的进程树）会**混叠**：降频、或先把帧缩小再 `Image.resize(LANCZOS)` 放大回去（廉价的低通）。
- 需要 Pillow 的便利（`ImageDraw`、字体）时，把数组转 `Image` 画完再 `np.asarray` 转回来；这条边界只在每帧 1–2 次。

- Fields (sine, interference, grids, moiré) are one vectorised expression over the whole frame; per-pixel Python loops are the slow path. Downscale-then-LANCZOS-upscale is a cheap low-pass against aliasing.

## Pillow 落字与收尾 (Type and finishing with Pillow)

```python
font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 64)   # 系统字体，不联网
d.text((x, y), line, font=font, fill=text_rgb, anchor="ls")       # l/s = 左下基线
box = d.textbbox((0, 0), line, font=font)                         # 量宽：(x0,y0,x1,y1)
```

- **Pillow 的 `line/ellipse/polygon` 不抗锯齿**：要么走 NumPy SDF（推荐），要么整帧 2× 超采样画完再 `resize((w,h), LANCZOS)`。文字本身是抗锯齿的，不需要超采样。
- 图层用 `RGBA` + `Image.alpha_composite`，最后 `convert("RGB")`——**返回值 = RGB、恰好 `width×height`**（不是的话引擎当场 `die`：尺寸不符成片零产出）。
- 字体按 `ImageFont.truetype` 的候选表逐个试，全部失败才 `ImageFont.load_default()`（默认字体很小，只够调试）。

- Pillow's `line/ellipse/polygon` are **not** antialiased: use NumPy SDFs, or draw at 2× and downscale with LANCZOS. Text *is* antialiased. Return RGB at exactly `width×height` (anything else exits with a size/mode error).

## 3D 透视投影 (3D perspective projection)

不需要 WebGL：一个焦距、一个相机、画家算法。

No WebGL needed: one focal length, one camera, painter's algorithm.

```python
def orbit(t, radius=4.0, height=0.9, speed=0.38):
    return np.array([np.cos(t*speed)*radius, height, np.sin(t*speed)*radius])

def project(P, eye, w, h, focal=1.6):
    """P: (...,3) 世界坐标 -> (...,2) 像素坐标 + 深度。批量、向量化。"""
    f = P - eye                                  # 相机空间
    z = np.clip(-f[..., 2], 1e-3, None)          # 相机看向 -z
    s = focal / z
    return np.stack([w/2 + f[..., 0]*s*w/2, h/2 - f[..., 1]*s*h/2], -1), z
```

- **先排深度，再画**：`order = np.argsort(-z_mean)`，按从远到近画线框/多边形。没有 z-buffer，就没有 z-fighting——这正是 T5/T11 的老规矩。
- 缩小到 `z` 很近的点会被 clip 掉（`np.clip` 防爆炸）；走廊、H 树、晶格巨构都是同一个投影换不同的几何。
- 需要雾：`color = lerp(color, bg, 1 - exp(-z*fog))`，深度自动读得出体积。

- Sort far-to-near once per frame and paint; clip near-z to avoid infinities. Fog = depth cue.

## 严格栅格与字阶 (Strict grid and type scale)

排版不是"大概放在中间"，是**坐标系**：

Typography is a coordinate system, not "roughly centred":

```python
COLS, GUT, MARGIN = 12, 24, 64                  # 12 栏、栏距、页边距
colw = (w - 2*MARGIN - (COLS-1)*GUT) / COLS
def gx(c): return MARGIN + c*(colw + GUT)        # 第 c 栏的 x（0-based）
BASE, LEAD = 24, 36                              # 基线节奏 / 行距 = 1.5×body

SCALE = 1.25                                     # 音阶：小三度，1.25 倍
sizes = [12, 15, 19, 24, 30, 37, 46, 58, 72]     # body=19 上下各推两级
```

- 每个元素落在**栏线与基线**上；镜头之间栅格不变，只有内容变——画面才像一个"世界"而不是一堆贴图。
- **字阶只有一个"最响"**：上屏的歌词取字阶顶端，标题降两档，注释/遥测取底档。规则 5 的量化版。
- 颜色只从六角色里取：正文 `text`，注释 `dim`，唯一重点 `hot`。

- Elements land on column and baseline lines; the grid holds across shots so the video reads as one world. The lyric takes the top of the type scale — quantified rule 5.

## 分段色彩脚本 (Segmented color script)

`project.json` 里把全片按段落切成色彩章节，段内调色板稳定，段间**硬切**（或 0.3–0.5s 交叉溶解）——这是"色彩有叙事"的确切含义：

Cut the film into color chapters in `project.json`. A palette holds *inside* a segment; segments change by hard cut (or a 0.3–0.5 s crossfade):

```json
"segments": [
  { "id": "boot",   "t": 0,   "palette": { "bg": "#05070d", "base": "#7cffb2", "accent": "#35ff9b", "hot": "#ffd166", "text": "#e8ffe9", "dim": "#0d3b24" } },
  { "id": "charge", "t": 26,  "palette": { "bg": "#0a0614", "base": "#22d3ee", "accent": "#818cf8", "hot": "#ff2fa0", "text": "#eef2ff", "dim": "#312e81" } },
  { "id": "exit",   "t": 165, "palette": { "bg": "#f4f1e8", "base": "#141413", "accent": "#d97757", "hot": "#b91c1c", "text": "#141413", "dim": "#a8a29e" } }
]
```

- **角色跨段守恒**：`base` 永远是主色、`hot` 永远只给全片最重要的那一个事件。段与段换的是"穿哪套衣服"，不是"谁是谁"——所以切段读起来像结构，而不是混乱。
- 段边界**贴着段落标记**（intro/verse/chorusexit），不贴任意秒数。
- 环境光跟着段走：雾色、bloom 色、暗角色全部从当前段的 `palette` 取。

- Roles are conserved across segments (`base` stays the主色, `hot` stays reserved), so a cut reads as structure. Segment boundaries sit on section markers, not arbitrary seconds. Fog/bloom/vignette colors follow the current segment.

## 坑 (Pitfalls)

- **`uint8` 回绕** —— 全程 `float32`，最后 clip 一次。
- **Pillow 形状不抗锯齿** —— SDF 或 2× 超采样。
- **每帧重建 meshgrid/字体** —— 导入时算一次，否则渲染慢一个量级。
- **`np.random` 全局状态** —— 用 `np.random.default_rng(seed)`，不要 `np.random.seed`。
- **返回 RGBA 或尺寸不对** —— 引擎会直接报错；`convert("RGB")` + 精确尺寸。
- **高频纹理闪烁** —— 逐帧的像素级噪点要看联系表；随机种子绑 `frame` 才能复现。
- **看都不看就交付** —— 联系表照旧，规矩不变。

- `uint8` wraparound, non-antialiased shapes, rebuilding grids/fonts per frame, global `np.random` state, wrong return mode/size, high-frequency shimmer — all caught by the contact sheet. The rules hold across projects.
