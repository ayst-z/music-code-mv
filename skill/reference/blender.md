# Blender 引擎 (Blender rendering)

## 定位：第 0 级重炮 (Level 0 — the heavy artillery)

3D 优先策略的第一级不再是 Three.js，而是 **Blender**：当镜头需要**真材质、真光线、真体积雾/景深**，或 headless 环境里 WebGL 根本起不来时，直接上 Blender。从高往低退的层级变成四级——**Blender(0) → Three.js(1) → 手写透视(2) → 2D(3)**，每退一级照旧要写下理由。排版镜头、纯数据镜头**不要**用 Blender：进程启动一次约 3–5s，杀鸡用牛刀。

Blender is level 0 of the depth ladder: real materials, real light transport, real volumetrics — or any headless box where WebGL cannot start. Typography-only shots stay far away from it (each Blender launch costs 3–5 s of startup).

## 安装与探测 (Install & probe)

```bash
blender --version                 # PATH 里有就直接用
# 没有就装（任选其一）：
winget install BlenderFoundation.Blender
# 或 https://www.blender.org/download/ 官方安装包
```

探测顺序（`render-blender.mjs` 内置）：`--blender=` → 环境变量 `BLENDER_PATH` → PATH → 已知安装位（Windows `C:\Program Files\Blender Foundation\Blender 5.0|4.0\blender.exe`、macOS `/Applications/Blender.app/...`、Linux `/usr/bin/blender`）。**本工作区实测**：Blender 4.0.0 与 5.0.1 双装，工具自动选中 5.0.1。找不到时工具直接报错并给安装口径——不假装支持。

## 两条渲染路线 (Two routes)

### 路线 A · `--python` 程序化建景（推荐 / preferred）

场景由脚本生成，**帧号反推 t**（`t = frame / fps`），同一帧号永远同一像素；脚本可 diff、可进签名哈希：

```bash
node skills/music-code-mv/scripts/render-blender.mjs --project=<dir> --start=0 --end=11
# 参数与 render.mjs 同构：--project --out --start --end --fps，另加
#   --script=blender/scene.py   （默认找工程下的 blender/scene.py）
#   --blender=<path>  --encoder=  --crf=  --preset=  --audio=  --depth=  --force
```

工具内部：缺失帧并成连续段 → 每段一次 `blender -b --python scene.py -- --out … --start … --end … --width … --height … --fps …` → 解析 stdout 的 `Fra:<n>` 刷进度条 → 复用 `lib/encode.mjs` 编码（`runFfmpeg(args, {totalFrames, label})` 自带进度条）。

### 路线 B · `.blend` 直渲 (headless .blend)

已有手工场景时走原生管线（分辨率以 .blend 内设置为准）：

```bash
blender -b scene.blend -o //frames/f##### -F PNG -s 0 -e 11 -a
```

工具用 `--blend=blender/scene.blend`（或工程里的 `blender/scene.blend`）自动走这条。

## 确定性约束 (Determinism — the skill 的铁律)

1. **帧是 t 的纯函数**：python 路线里只允许 `t = frame / fps` 驱动一切（位置、旋转、相机、材质动画）；禁止墙钟、禁止未播种随机、禁止"上一帧的状态"。
2. **干净场景起步**：脚本开头 `bpy.ops.wm.read_factory_settings(use_empty=True)`，保证任何人重跑得到同一场景。
3. **一次调用渲整段**：Blender 启动贵，连续段合并成一次进程；处理器用 `frame_change_post` 挂钩（`def tick(*args)` 兼容 4.x/5.x 签名差异）。
4. **版本一致性**：同一 Blender 大版本 + 同一场景文件 → 同一像素；跨大版本（4.0→5.0）色彩管理/渲染器输出可能变化，**升级后用 `--force` 重渲一次**再比较。
5. **渲染器取舍**：`CYCLES` CPU 最稳（无 GPU 依赖，冒烟实测见下）；`BLENDER_EEVEE` 快但依赖 GPU 上下文，4.2+ 的 id 是 `BLENDER_EEVEE_NEXT`，跨版本脚本要兼容。

## 缓存与签名 (Incremental)

帧存 `<project>/frames/f#####.png`，签名存 `.cache/signatures-blender.json`（与 render.mjs 的 `signatures.json` 分开，互不干扰）。签名 = 工程基线（尺寸/fps/project.json/src 树，来自 `lib/signature.mjs` 的 `createSignature().forGlobal()`）**+ `blender/` 场景目录整树哈希**（`.blend`、`.py` 及任何依赖文件改动都会整段失效）+ script/blend 单文件哈希。实测：全命中时输出 `12/12 frames cached` 并跳过 Blender；改一行 `scene.py` → `0/12 frames cached` 全量重渲。

## 可复制的场景骨架 (Copy-paste skeleton)

`<project>/blender/scene.py`：

```python
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def get(k, d):
    i = argv.index('--' + k)
    return argv[i + 1] if i >= 0 and i + 1 < len(argv) else d

OUT, START, END = get('out', 'frames'), int(get('start', 0)), int(get('end', 11))
W, H, FPS = int(get('width', 1280)), int(get('height', 720)), float(get('fps', 24))

bpy.ops.wm.read_factory_settings(use_empty=True)      # 干净场景
scene = bpy.context.scene
scene.frame_start, scene.frame_end = START, END
scene.render.fps, scene.render.resolution_x, scene.render.resolution_y = int(FPS), W, H
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, 'f#####')   # # → 5 位帧号
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.cycles.use_denoising = False

# ……建景：几何 / 材质（Principled BSDF 节点）/ 灯 / 相机……

cam = scene.camera
def tick(*args):                                      # 帧号反推 t，纯函数
    t = args[0].frame_current / FPS
    # cam.location = ...  cam.rotation_euler = ...     只用 t
bpy.app.handlers.frame_change_post.append(tick)

bpy.ops.render.render(animation=True)
```

## 实测口径 (Measured)

本工作区冒烟（`blender-smoke/` 工程，Blender 5.0.1，CYCLES 8spp，320×180，12 帧）：

```
[blender] blender: Blender 5.0.1  (C:\Program Files\Blender Foundation\Blender 5.0\blender.exe)
[blender] 0/12 frames cached, rendering 12
[blender] [████████████████████████] 100.0%  12/12  4.7 fps  ETA 0:00
[encode]  [████████████████████████] 100.0%  12/12  13.0 fps  ETA 0:00  encode
[blender] OK  0.05 MB  …/blender-smoke/out/video.mp4
Duration: 00:00:00.50   Stream #0:0: Video: av1, 320x180, 24 fps
```

≈4.8 fps（含 Blender 启动摊销）——上 4K 前先按目标分辨率估一遍：Cycles 8spp 4K 每帧秒级起步，帧缓存是唯一的安全网，草稿阶段把 `--w/--h` 压低再逐级放大（与 render.mjs 同哲学）。
