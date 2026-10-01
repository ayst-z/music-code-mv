---
name: music-code-mv
description: Direct and render code-driven music videos and animated shorts (纯代码渲染 MV / code-rendered video) where every frame is drawn by HTML/Canvas/WebGL/Three.js code and encoded to MP4 with ffmpeg. Use when asked to make an MV, lyric video, motion-graphics short, title sequence, or any animation whose visuals are produced by code rather than a video model or stock footage. Covers storyboard-first direction, deterministic virtual-time rendering, headless Chrome capture, contact-sheet self-review, lyric sync, and audio muxing. 指导与渲染由代码驱动的音乐视频与动画短片（纯代码渲染 MV / code-rendered video）：每一帧都由 HTML/Canvas/WebGL/Three.js 代码绘制，再用 ffmpeg 编码为 MP4。当被要求制作 MV、歌词视频、动态图形短片、片头，或任何画面由代码而非视频模型、素材库生成的动画时使用。涵盖分镜先行的导演方法、确定性虚拟时间渲染、无头 Chrome 截帧、联系表自检、歌词对齐与音频封装。
---

# 代码风格 MV (Code-rendered MV)

每一帧都**由代码写成并确定性地渲染**，最后用 ffmpeg 编码。没有视频生成模型，没有素材库。这条生产线正是 "Claude Opus 5.5 code video" 浪潮背后的那一条（见 `reference/lineage.md`）。

智能体在这里身兼**导演 + 渲染器**：先写分镜，逐个镜头搭建，用联系表检查自己的作品，然后才正式渲染。

Every frame is **written as code and rendered deterministically**, then encoded with ffmpeg. No video-gen model, no stock assets. This is the production line behind the "Claude Opus 5.5 code video" wave (see `reference/lineage.md`).

The agent acts as **director + renderer**: storyboard first, build shot by shot, check your own work with contact sheets, then render.

## 不可妥协的规矩 (Non-negotiable rules)

0. **先问清楚，再动手。** 写任何场景代码、跑任何渲染之前，先向用户逐步确认：**用途与画幅**、**时长**、**风格**（用哪个预设或哪套配色）、**歌词来源**、**音频**、**交付分辨率**。每一项都给出推荐和理由，再用两三句话说明你打算怎么做，等用户确认后再进入下一步。没确认就渲染 = 返工。
0. **Interview before you build.** Before any scene code or render, confirm with the user, step by step: purpose and aspect ratio, duration, style (which preset or palette), lyric source, audio, delivery resolution. Recommend and justify each one, state your plan in two or three sentences, then wait for a yes.

1. **先分镜，后代码。** 先写 `storyboard.md`（镜头、秒数、风格、调色板、歌词提示），把它定下来之后再写场景代码。永远不要从一块空白画布起手。
2. **每一帧都是虚拟时间 `t` 的纯函数。** 页面对外暴露 `window.renderAt(t)`。禁止 `requestAnimationFrame`，禁止 `Date.now()`、`performance.now()`，禁止在绘制时调用 `Math.random()`（改用带种子的 PRNG）。正是这一条让渲染是确定性的、可续跑的、可并行的。
3. **亲眼查看自己的输出。** 每做完一个场景，渲染一张联系表，然后*用读图工具看这张图*。看到什么问题就修什么。没看过的帧不要交付。
4. **一个镜头只发生一件事。** 一个什么事件都没有的镜头，就是一个 bug。
5. **文字必须可读。** 只要有一句歌词上了屏，它就是画面里最响的那个元素。

1. **Storyboard before code.** Write `storyboard.md` (shots, seconds, style, palette, lyric cue) and get it settled before writing scene code. Never start from a blank canvas.
2. **Every frame is a pure function of virtual time `t`.** The page exposes `window.renderAt(t)`. No `requestAnimationFrame`, no `Date.now()`, no `performance.now()`, no `Math.random()` at draw time (use a seeded PRNG). This is what makes rendering deterministic, resumable and parallel.
3. **Look at your own output.** After each scene, render a contact sheet and *read the image*. Fix what you see. Do not ship frames you have not looked at.
4. **One thing happens per shot.** A shot with no event is a bug.
5. **Text must be readable.** If a lyric is on screen, it is the loudest element in the frame.

## 工作流 (Workflow)

八步工作流：**先问清楚** → 分镜；搭脚手架；逐镜头搭建；用联系表自检并读图判断；改了再查（联系表很便宜，秒级）；正式渲染；最后封装音频、核对时长与流、交付 MP4。

```
0. interview  → ask the user: ratio, duration, style/preset, lyrics, audio, delivery size
                (recommend + explain, then WAIT for confirmation)
1. brief      → storyboard.md (shots + seconds + lyric cues + palette)
2. scaffold   → node skills/music-code-mv/scripts/init.mjs <project-dir> [--preset=<id>]
3. build      → one scene module per shot in src/scenes/
4. check      → node scripts/render.mjs --project=<dir> --contact
                 then read the sheet PNG and judge it
5. iterate    → fix, re-check (contact sheets are cheap: seconds)
6. render     → node scripts/render.mjs --project=<dir> --out=out/video.mp4
7. finish     → mux audio, verify duration/streams, present the MP4
```

Eight steps: **interview** → storyboard; scaffold; build one scene module per shot; check with `--contact` and judge the sheet PNG; iterate; render the MP4; finish by muxing audio, verifying duration/streams and presenting the file.

### 0. 询问 —— 先问，再动手 (Interview — ask first)

**没有这一步就不要开始渲染。** 用 `ask_user_question` 一次问 4–6 个问题，每个选项都写清后果；拿到答复再写分镜。**Ask before you build:** one `ask_user_question` call, 4–6 questions, each option carrying its tradeoff; only then write the storyboard.

必问的六项 / always ask:

| # | 问什么 | 选项建议 | 为什么问 |
|---|---|---|---|
| 1 | 用途与画幅 | 16:9 横屏 / 9:16 竖屏 / 1:1 | 决定 `--w --h --orientation`，返工最贵的一项 |
| 2 | 时长 | 15s / 30s / 60s / 自定义 | 决定镜头数与总帧数（60s@30fps = 1800 帧） |
| 3 | 风格 | `neon-rain` / `ink-paper` / `phosphor` / `dusk-lofi` / 自定配色 | 直接决定调色板与后期强度 |
| 4 | 歌词来源 | 用户提供 LRC / 我写占位 / 无歌词纯器乐 | 决定分镜是否锚到歌词行 |
| 5 | 音频 | 用户给文件 / 先用 TTS 旁白 / 先出无声画面 | 决定封装与时长对齐 |
| 6 | 交付分辨率 | 480×270 草稿 / 1280×720 / 1920×1080 / 4K | 决定是迭代还是直接出片 |

问完后**先用两三句话复述计划**（几镜、每镜做什么、什么配色、预计渲染多久），再写 `storyboard.md`。
After the answers, restate the plan in two or three sentences (how many shots, what each does, which palette, expected render cost) **before** writing the storyboard.

面板里也有对应预设：MV 工坊面板的「渲染档位」与「风格预设」可以在点渲染之前先把这些设置选好。
The MV Studio panel mirrors this: its render-tier and style presets set these choices before you hit render.

中途改变主意（换风格、改时长、换画幅）同样要先问再动——预设有的是，重做的代价是整支片子。
Changing your mind mid-way goes through the same gate.

### 1. 分镜 (Storyboard)

`storyboard.md` 是合同。每个镜头至少要有：`id · start–end · 发生了什么 · 风格 · 歌词行`。镜头时长控制在 2–6s。写歌的 MV 要把镜头锚定到歌词行与段落标记上（intro / verse / chorus / bridge）。

`storyboard.md` is the contract. Minimum per shot: `id · start–end · what happens · style · lyric line`. Keep shots 2–6s. For a song, anchor shots to lyric lines and section markers (intro / verse / chorus / bridge).

### 2. 脚手架 (Scaffold)

一条命令生成项目；带上 `--preset` 还能一次拿到配色、后期、时长、分镜与占位歌词，生成即可渲染：

Run this once to scaffold a project; add `--preset` to also get palette, post-processing, duration, storyboard and placeholder lyrics in the same step:

```bash
node skills/music-code-mv/scripts/init.mjs my-mv                      # 模板默认配色 / template defaults
node skills/music-code-mv/scripts/init.mjs my-mv --preset=neon-rain  # 套用预设 / apply a preset
node skills/music-code-mv/scripts/init.mjs --list-presets            # 列出预设 / list presets
```

四个预设 / four presets: `neon-rain`（霓虹雨夜）、`ink-paper`（纸墨，浅色）、`phosphor`（磷光终端）、`dusk-lofi`（落日低保真）。
细节与「怎么用才不浪费」见 `reference/presets.md`。Preset details live in `reference/presets.md`.

生成的项目自带 Canvas2D 舞台、时间轴、带种子的 PRNG、歌词解析、风格辅助函数和一个可跑的演示场景。只有当某个镜头真的需要 3D 时才引入 Three.js（见 `reference/threejs.md`）。

It creates a project with a Canvas2D stage, a timeline, a seeded PRNG, lyric parsing, style helpers and a working demo scene. Add Three.js only when a shot genuinely needs 3D (see `reference/threejs.md`).

### 3. 逐镜头搭建 (Build shot by shot)

一个场景就是一个普通对象：

A scene is a plain object:

```js
export default {
  id: 'verse-1',
  start: 8, end: 14,
  draw(ctx, t, env) { /* t = local seconds, env = {w,h,fps,rnd,lyric,...} */ }
};
```

在 `src/scenes/index.js` 里注册它。场景之间可以重叠做合成；时间轴按数组顺序绘制它们。

Register it in `src/scenes/index.js`. Scenes may overlap for compositing; the timeline draws them in array order.

### 4. 联系表 —— 自检回路 (Contact sheet — the self-check loop)

```bash
node scripts/render.mjs --project=my-mv --contact
```

它会渲染 N 张等距关键帧，拼成一张 PNG，并打印这张图的路径。**用读图工具看这张图，并对它挑毛病**：构图、可读性、对比度、运动弧线、画面里到底有没有事情发生。这是整条流水线里最便宜、也最值钱的一步。

Renders N evenly spaced keyframes, tiles them into one PNG and prints its path. **Read that image with the image reader and critique it**: composition, legibility, contrast, motion arc, whether anything actually happens. This is the cheapest and highest-value step in the whole pipeline.

### 5. 完整渲染 (Full render)

```bash
node scripts/render.mjs --project=my-mv --out=out/video.mp4 --audio=track.mp3
```

帧是带缓存的：重跑会从断点续起，只渲染还缺的那部分。想全部重来就加 `--force`。

Frames are cached: re-running resumes and only renders what is missing. Use `--force` to redo everything.

## 尺寸与时间预算 (Sizing and time budget)

本工作站实测（无头 Chrome，软件渲染）：

| 渲染器 renderer | 分辨率 resolution | 每帧耗时 per frame |
|---|---|---|
| Canvas2D + full FX stack (bloom/chroma/scanlines/grain) | 1280×720 | **~255 ms** |
| Canvas2D + full FX stack | 480×270 | ~35 ms |
| Three.js + UnrealBloom | 960×540 | ~190 ms |

占大头的不是场景绘制，而是全帧后期通道：chroma、bloom、scanlines、grain 每一道都要处理全部 921k 个像素。打草稿时要么降到 480×270，要么在 `project.json` 里把对应的 `fx` 开关置为 `false`。一个 12 s / 360 帧的 720p 演示大约 90 s 渲完，可以线性外推（60 s 的 MV 在 30 fps 下 = 1800 帧 ≈ 8 min）。

| 目标 target | 分辨率 resolution | 备注 note |
|---|---|---|
| draft / contact | 480×270 | fast iteration |
| standard | 1280×720 | default delivery |
| high | 1920×1080 | expect ~4× the 720p time |

从草稿分辨率开始，在草稿分辨率上迭代，最后用交付分辨率跑一遍。

Measured on this workstation (headless Chrome, software rendering):

| renderer | resolution | per frame |
|---|---|---|
| Canvas2D + full FX stack (bloom/chroma/scanlines/grain) | 1280×720 | **~255 ms** |
| Canvas2D + full FX stack | 480×270 | ~35 ms |
| Three.js + UnrealBloom | 960×540 | ~190 ms |

The full-frame post passes dominate, not the scene drawing: each of chroma, bloom, scanlines and grain touches all 921k pixels. For drafts, either drop to 480×270 or set the corresponding `fx` flags to `false` in `project.json`. A 12 s / 360-frame 720p demo renders in about 90 s; scale linearly (a 60 s MV at 30 fps = 1800 frames ≈ 8 min).

| target | resolution | note |
|---|---|---|
| draft / contact | 480×270 | fast iteration |
| standard | 1280×720 | default delivery |
| high | 1920×1080 | expect ~4× the 720p time |

Start at draft resolution, iterate there, then do one final pass at delivery resolution.

## 已验证 (Verified)

本 skill 已在这块工作区做过端到端测试：probe 报 READY，自带的演示项目能搭脚手架、能渲染联系表、能渲染一支完整 21 s 1280×720 30 fps 的 MP4、能封装音轨（视频与 AAC 两条流都在，时长精确），并且能从帧缓存复跑（`0 rendered, 630 from cache`）。

This skill was tested end to end on this workspace: probe reports READY, the bundled demo project scaffolds, renders a contact sheet, renders a full 21 s 1280×720 30 fps MP4, muxes an audio track (video + AAC streams both present, duration exact), and re-runs from the frame cache (`0 rendered, 630 from cache`).

## 运行环境 (Environment)

需要 Node.js、Google Chrome（或 Edge）和 ffmpeg。在本工作区里，它们已经随托管本 skill 的项目一起备好了；跑 `node scripts/probe.mjs` 会打印确切路径和就绪判定。安装与降级方案见 `reference/environment.md`。

Requires Node.js, Google Chrome (or Edge) and ffmpeg. In this workspace they are already provisioned inside the project that hosts this skill; run `node scripts/probe.mjs` to print exact paths and a readiness verdict. See `reference/environment.md` for install and fallback details.

## 参考文档 (Reference)

- `reference/presets.md` —— 四个开箱即用的预设：配色、后期、时长、分镜、占位歌词
- `reference/styles.md` —— 代码 MV 观感的风格词汇与配方
- `reference/techniques.md` —— 确定性渲染、Chrome flag、截帧、编码
- `reference/threejs.md` —— 怎么加 Three.js 镜头
- `reference/lineage.md` —— 这种形式从哪来、这个领域在做什么
- `reference/environment.md` —— 工具链安装、降级方案、排障

- `reference/styles.md` — style vocabulary and recipes for the code-MV look
- `reference/techniques.md` — deterministic rendering, Chrome flags, capture, encoding
- `reference/threejs.md` — adding Three.js shots
- `reference/lineage.md` — where this form comes from and what the field does
- `reference/environment.md` — toolchain install, fallbacks, troubleshooting

## 常见坑 (Pitfalls)

- **自己推进时间的 rAF 循环** —— `t` 必须归渲染器掌控。
- **在绘制代码里读挂钟** —— 会毁掉帧缓存与确定性。
- **每帧调 `Math.random()`** —— 产生无法复现、无法缓存的闪烁。改用 `env.rnd(seed)`。
- **杂乱背景上放不可读的字** —— 加一层遮罩，或者把文字背后的背景压暗。
- **Bloom / 曝光过曝** —— 软件渲染器会放大自发光数值；bloom 强度保持在 1 附近。
- **看都不看就交付。** 一定要读联系表。
- **音画漂移** —— 封装时加 `-shortest`，并核对最终时长。

- **rAF loops** that advance time themselves — the renderer must own `t`.
- **Reading the wall clock** anywhere in draw code — breaks frame caching and determinism.
- **`Math.random()` per frame** — flicker that cannot be reproduced or cached. Use `env.rnd(seed)`.
- **Unreadable type** over a busy background: add a scrim, or dim the background behind text.
- **Bloom/exposure blowout** — software renderers amplify emissive values; keep bloom strength near 1.
- **Shipping without looking.** Always read the contact sheet.
- **Audio drift** — mux with `-shortest` and verify the final duration.
