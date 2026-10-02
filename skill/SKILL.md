---
name: music-code-mv
description: Direct and render code-driven music videos and animated shorts (纯代码渲染 MV / code-rendered video) where every frame is drawn by code — HTML/Canvas/WebGL/Three.js in headless Chrome, or a NumPy + Pillow frame-by-frame Python engine — and encoded to MP4 with ffmpeg. Use when asked to make an MV, lyric video, motion-graphics short, title sequence, or any animation whose visuals are produced by code rather than a video model or stock footage. Covers storyboard-first direction, deterministic virtual-time rendering, contact-sheet self-review, lyric sync, audio muxing, strict grid & type scale, segmented color scripts, and AI-model brand palettes (Claude / DeepSeek / GPT …). 指导与渲染由代码驱动的音乐视频与动画短片（纯代码渲染 MV / code-rendered video）：每一帧都由代码绘制——无头 Chrome 里的 HTML/Canvas/WebGL/Three.js，或 NumPy + Pillow 逐帧 Python 引擎——再用 ffmpeg 编码为 MP4。当被要求制作 MV、歌词视频、动态图形短片、片头，或任何画面由代码而非视频模型、素材库生成的动画时使用。涵盖分镜先行的导演方法、确定性虚拟时间渲染、联系表自检、歌词对齐与音频封装、严格栅格与字阶、分段色彩脚本、以及主流 AI 模型品牌配色预设。
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
4. check      → node skills/music-code-mv/scripts/render.mjs --project=<dir> --contact
                 then read the sheet PNG and judge it
5. iterate    → fix, re-check (contact sheets are cheap: seconds)
6. render     → node skills/music-code-mv/scripts/render.mjs --project=<dir> --out=out/video.mp4
7. finish     → mux audio, verify duration/streams, present the MP4
```

Eight steps: **interview** → storyboard; scaffold; build one scene module per shot; check with `--contact` and judge the sheet PNG; iterate; render the MP4; finish by muxing audio, verifying duration/streams and presenting the file.

### 备选引擎：NumPy + Pillow (Alternative engine)

画面本质是**数学**（场、SDF、分形、采样理论）、要**逐像素级的严格栅格排版**，或者无头 Chrome 起不来（沙箱 `spawn EPERM`）时，换第二条引擎：`python scripts/render-np.py --init=<dir> [--preset=<id>]` 脚手架，`--contact` 自检，`--out=out/video.mp4` 出片——契约、缓存、联系表与 Chrome 引擎同构（`render_at(t, env)` 纯函数，帧缓存 `frames/f%05d.png`）。四个核心方法——**逐帧渲染、3D 透视投影、严格栅格与字阶、分段色彩脚本**——的完整做法见 `reference/numpy-pillow.md`。

**与 Chrome 引擎的三处真实差异（实测）：** ① `--audio=` 按**进程 CWD** 解析（`--out=` 才是相对工程目录）；② 没有 `--w/--h/--fps/--dur` 覆盖，尺寸只由 `project.json` 决定；③ 本工作区 PATH 上的 `python` 没装 numpy/Pillow，要换 DSH 自带的 Python（见 `reference/authoring.md` 第 3 节）。预设的 `palette`/`fx`/`duration`/分镜/歌词**两个引擎都会套**（实测 `--init --preset=claude` → `"bloom": false`）；NumPy 还会写 `three` 与 `segments`（`segments` 它自己消费），Chrome 的 `init.mjs` 不写 `segments`，模板也不会自动读。

When the frame is fundamentally **math** (fields, SDFs, fractals, sampling), when you need pixel-exact grid typography, or when headless Chrome cannot start (sandbox `spawn EPERM`), switch engines: `render-np.py` scaffolds (`--init`), self-checks (`--contact`) and renders (`--out=out/video.mp4`) with the identical contract, frame cache, contact sheet and preset set. Full recipes for the four core methods — frame-by-frame rendering, 3D perspective projection, strict grid & type scale, segmented color script — live in `reference/numpy-pillow.md`.

**Three measured differences from the Chrome engine:** `--audio=` resolves against the process CWD while `--out=` resolves against the project; there are no `--w/--h/--fps/--dur` overrides (size comes from `project.json`); and the `python` on PATH here has neither numpy nor Pillow, so use the DSH-bundled Python (see `reference/authoring.md`, section 3). Preset `palette`, `fx`, `duration`, storyboard and lyrics are applied by **both** engines (verified: `--init --preset=claude` gives `"bloom": false`); NumPy additionally writes `three` and `segments` (and consumes `segments`), while `init.mjs` writes no `segments` and the template never reads it automatically.

### 配音：MiMo TTS (Narration)

有旁白的片子，**先把每段旁白合成出来、量到真实时长，再排分镜**——否则镜头边界和语音对不上，返工的是整条时间线。走本机 DSH 的 Xiaomi MiMo TTS 代理（只连回环地址，不访问任何外部服务）：

```bash
node skills/music-code-mv/scripts/tts.mjs --probe                   # 先确认配音可用
node skills/music-code-mv/scripts/tts.mjs --out=n/01.wav "第一段旁白"  # 单段
node skills/music-code-mv/scripts/tts.mjs --batch=narration.json      # 批量：[{file,text},…]
node skills/music-code-mv/scripts/tts.mjs --persona=presets/fairy.json --out=x.wav "…"   # 套用角色音色
node_modules/ffmpeg-static/ffmpeg.exe -i n/01.wav                       # 量实测时长，用来定镜头边界（工作区没有 ffprobe；ffmpeg -i 打印 Duration，退出码 1 属正常）
```

**音色跟着角色走**：带 `persona` 的角色智能体（如 `fairy`）在 `persona.voice` 里定义音色（`voiceDesignPrompt` 自定义音色 + 内置音色回退），`--persona=` 一条命令套上；批量清单里逐项写 `voice` / `voiceDesignPrompt` 可以让同一支片里换角色说话。
**The voice follows the character:** agent presets carry `persona.voice` (a `voiceDesignPrompt` plus built-in fallbacks); `--persona=` applies it, and per-item entries in a batch manifest switch characters within one film.

**品牌配音 / brand voice**：对外发布片用统一嗓音，`--brand` 一条命令套上（读 `voices/brand.json`，与角色预设**同一套字段**，回退链 voicedesign → 茉莉 → 冰糖）：

```bash
node skills/music-code-mv/scripts/tts.mjs --brand --out=narration/01.wav "写好分镜，剩下的交给代码。"
# voice: voicedesign ≈茉莉   实测 5.76s / 270KB，与角色旁白同规格，可进同一条混音链
```

For published films use one consistent voice: `--brand` reads `voices/brand.json` (same field shape as a character preset, falling back voicedesign → 茉莉 → 冰糖).

### 写台词 (Writing the narration)

台词的三条硬要求：**生动有吸引力、语言简洁明快、表意准确**——三者冲突时，**准确 > 简洁 > 生动**：一句漂亮的错话是 bug，一句正确但啰嗦的话只是难看。

Three hard requirements: vivid, crisp, accurate. When they collide the order is **accurate > concise > vivid** — a beautifully wrong line is a bug; a wordy right one is merely ugly.

```text
fn write_line(shot, fact):
    assert fact verified (实测值 or 文档值)        # 表意准确是前提，不许近似
    line = one_sentence(one_idea, verb_first)      # 一句只说一件事，动词打头有画面
    line = inject_concrete(line, numbers)          # 数字胜过形容词：具体才有吸引力
    line = strip(line, [其实,非常,可以说是,我们,再次,进行了])  # 简洁：删掉不干活的字
    assert length(line) <= shot.seconds * 5.0      # 读得完（中文实测 ≈4.8–5.2 字/秒）
    assert matches(line, shot.event)               # 台词必须对应画面里**正在发生**的事
    if read_aloud(line) is 扭口: rewrite           # 靠改句子救，不靠标点硬撑
    return line
```

**前后对比 / before vs after**：

| 平（啰嗦 + 抽象）| 生动（简洁 + 具体）|
|---|---|
| 我们的渲染引擎进行了优化，性能得到了显著提升。 | 一帧从 46 毫秒降到 18 毫秒。 |
| 系统支持很多种不同的显示风格，非常丰富。 | 二十七种显示风格，从 CRT 到机械翻牌。 |
| 安装的过程其实是非常简单的，只需要几步就可以完成。 | 两步：克隆仓库，一条 `dsh plugin add`。 |

**几条可执行的规则 / executable rules**：① 每句一个信息点，要串多件事就拆成多句；② 名词带修饰不如带数字（「17.3 GB 帧缓存」胜过「大量缓存」）；③ 结尾落在重音上，短句收尾比长句有力；④ 与镜头事件一一对齐——**镜头里没有的事，台词不许说**；⑤ 有旁白的片子里，台词就是节奏：先量旁白实测时长，再按它排镜头（见上一节）。

One idea per line; concrete numbers over adjectives; end on a stressed beat; never narrate something the shot is not showing; and because narration *is* the rhythm, measure each clip first and lay the shots around it.

拿到各段时长后按下表排时间线，再用 `adelay=<ms>:all=1` 把每段摆到它的镜头起点、`amix=inputs=N:normalize=0` 合成一条 `track.wav`（`apad=whole_dur=<总长>` 补齐），最后 `--audio=narration/track.wav` 交给渲染器封装，`-shortest` 保证音画同长。

`--probe` 会把失败原因说清楚：`NOT READY` 后面跟着「没配 API Key」（去 设置 → 插件 → dsh-xiaomi-tts 存一个 Key）、「DSH 没开/端口不对」或「上游没回音频」。**不要**在没 probe 的情况下假设配音可用，也不要拿 TTS 失败当静音片交差——先问用户。

For any film with narration, **synthesize every line first and lay out the storyboard from the measured durations**; aligning shots to guessed lengths means redoing the whole timeline. The script talks only to the loopback DSH proxy, never to an outside service. Place each clip at its shot start with `adelay`, mix with `amix` (normalize off), pad to the film length, then hand the track to `--audio=`. `--probe` prints the exact reason when it is not ready — never assume narration works, and never silently ship a mute cut instead of asking.

### 0. 询问 —— 先问，再动手 (Interview — ask first)

**没有这一步就不要开始渲染。** 用 `ask_user_question` 一次问 4–6 个问题，每个选项都写清后果；拿到答复再写分镜。**Ask before you build:** one `ask_user_question` call, 4–6 questions, each option carrying its tradeoff; only then write the storyboard.

必问的六项 / always ask:

| # | 问什么 | 选项建议 | 为什么问 |
|---|---|---|---|
| 1 | 用途与画幅 | 16:9 横屏 / 9:16 竖屏 / 1:1 | 决定 `--w --h`（横竖由宽高决定；`render.mjs` 没有 `--orientation`，那是 MV 工坊面板/渲染工具的档位），返工最贵的一项 |
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

四套氛围预设：`neon-rain`（霓虹雨夜）、`ink-paper`（纸墨，浅色）、`phosphor`（磷光终端）、`dusk-lofi`（落日低保真）；另有一族**主流 AI 模型配色预设**：`claude`、`deepseek`、`gpt`、`gemini`、`grok`、`mistral`、`llama`、`qwen`、`kimi`、`doubao`、`zhipu`、`midjourney`、`fairy`……每个都带品牌色提取来的六角色调色板、匹配气质的分镜骨架与 **Three.js 镜头逻辑**。**完整名单以 `--list-presets` 的输出为准**（预设还在增加），改完预设跑 `python scripts/audit-presets.py` 验配色纪律。
细节与「怎么用才不浪费」见 `reference/presets.md`。Preset details live in `reference/presets.md`.

生成的项目自带 Canvas2D 舞台、时间轴、带种子的 PRNG、歌词解析、风格辅助函数和一个可跑的演示场景。**3D 是默认，场面要豪华**：镜头默认从 Three.js 起步（粒子群、发光体、反射地面、连续相机运动），只有纯排版与纯数据镜头留在 2D——那里 3D 只会把字压花。决策梯与「豪华场面清单」（六条起步标准 + 过曝红线）见 `reference/threejs.md`；退级要写出理由。**一个镜头只用一种深度方案。**

It creates a project with a Canvas2D stage, a timeline, a seeded PRNG, lyric parsing, style helpers and a working demo scene. **3D is the default and the scenes should look luxurious:** shots start from Three.js (particle fields, emissive bodies, a reflective floor, continuous camera movement); only pure typography and pure-data shots stay in 2D, where 3D would only smear the type. See `reference/threejs.md` for the decision ladder and the six-item luxury checklist (plus the over-exposure red line) — stepping down requires a written reason. **One depth solution per shot.**

### 3. 逐镜头搭建 (Build shot by shot)

一个场景就是一个普通对象：

A scene is a plain object:

```js
export default {
  id: 'verse-1',
  start: 8, end: 14,
  // 第一个参数是 stage（stage.ctx 才是 2d context）；t = 本镜头的局部时间；
  // env.t = 全局时间（歌词、节拍必须读它）；p = 0..1 镜头内进度
  draw(stage, t, env, p) { /* env = {w,h,fps,duration,palette,project,lyrics,stage,t,local,fx} */ }
};
```

随机来自 `src/rng.js` 的 `mulberry32(seed)` / `hash1` / `hash2`，**每个镜头用自己播一次种**（`env.rnd(seed)` 是 NumPy 引擎的接口，Chrome 模板的 `env` 没有 `rnd` 字段）。

Randomness comes from `mulberry32(seed)` / `hash1` / `hash2` in `src/rng.js`, seeded once per shot (`env.rnd(seed)` belongs to the NumPy engine — the Chrome template's `env` has no `rnd` field).

在 `src/scenes/index.js` 里注册它。场景之间可以重叠做合成；时间轴按数组顺序绘制它们。

Register it in `src/scenes/index.js`. Scenes may overlap for compositing; the timeline draws them in array order.

### 4. 联系表 —— 自检回路 (Contact sheet — the self-check loop)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --contact --w=480 --h=270
```

它会渲染 N 张等距关键帧，拼成一张 PNG，并打印这张图的路径。**用读图工具看这张图，并对它挑毛病**：构图、可读性、对比度、运动弧线、画面里到底有没有事情发生。这是整条流水线里最便宜、也最值钱的一步——所以一律降到 480×270 草稿分辨率，秒级回环。

Renders N evenly spaced keyframes, tiles them into one PNG and prints its path. **Read that image with the image reader and critique it**: composition, legibility, contrast, motion arc, whether anything actually happens. The cheapest and highest-value step in the pipeline, so always run it at draft resolution (480×270) for a seconds-long loop.

### 5. 完整渲染 (Full render)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --out=out/video.mp4 --audio=track.mp3
```

帧是带缓存的：**文件在且渲染签名没变**才复用（签名 = 宽/高/fps/时长/引擎/画质 + 场景 `deps`），所以改尺寸必然整轮重渲；只改 `--out`/`--audio`/`--workers` 不影响复用（实测 `0 rendered, 60 reused`）。想全部重来加 `--force`，编码后清缓存用 `--clean`。

Frames are reused only when the file exists **and** the render signature is unchanged (width / height / fps / duration / engine / quality + scene `deps`), so changing the resolution always re-renders; `--out`/`--audio`/`--workers` do not. `--force` redoes everything, `--clean` purges `frames/` after encoding.

## 伪代码总纲 (Master pseudocode)

整条流水线压成一段**语言无关**的伪代码：换引擎（Chrome / node+skia / NumPy）只换实现，不换结构。注释里的「禁」是红线。

The whole pipeline as language-agnostic pseudocode — switching engines swaps the implementation, never the structure.

```text
# 0) 询问：先问再动手 / interview before you build
ask(purpose_and_ratio, duration, style_preset, lyric_source, audio, delivery)
   # 每项给推荐 + 理由；拿到答复再写分镜。中途改主意同样过这道门。

# 1) 分镜 = 合同 / storyboard is the contract
shots = [{id, start, end, what, style, lyric}, ...]     # 每镜 2–6s，只发生**一件可数的事**
write(storyboard.md, shots)
assert every shot has an event                         # 没有事件的镜头是 bug

# 2) 脚手架：一条命令拿到骨架 / one-command scaffold
project = scaffold(preset, duration, fps, size)        # 配色/后期/分镜/占位歌词一并写入

# 3) 每帧是 t 的纯函数 / every frame is a pure function of t
fn render_at(t):                                       # 禁 rAF、禁墙钟、禁绘制期 Math.random()
    env = {w, h, fps, palette, segments, project, rnd} # rnd(seed) 只在**建场景**时调用
    for s in timeline.active(t):                       # 按数组顺序叠加绘制
        s.draw(stage,
               local   = t - s.start,                  # 跨镜头的事件用 env.t（全局）
               env     = env,
               progress= (t - s.start) / (s.end - s.start))
    apply_fx(stage, project.fx)                        # bloom→chroma→scanlines→vignette→grain
    return frame                                       # 尺寸必须 = project.size，模式 RGB

# 4) 帧缓存：签名没变才复用 / cache keyed by a signature
sig = sha1(project.json + scene_sources + render_pass)
for frame in range(n_frames):
    if exists(frame_path) and sig_unchanged and pass_matches: reuse
    else: write(frame_path, render_at(frame / fps))     # pass = 尺寸/位深/超采样档位

# 5) 并行要有下限 / parallelism needs a floor
eff = min(requested, ceil(n_frames / 16))               # 每 worker 至少 16 帧
                                                   # 否则进程启动比渲一帧还贵（负优化）
map(render_frame, frames, window = eff + 2)             # 有界窗口：内存里最多 eff+2 帧

# 6) 编码：挑**真能用**的硬件编码器 / pick hardware that actually works
enc = first(id in [qsv, nvenc, amf]                     # 注意：ffmpeg 静态构建常常
            where has(id) and test_encode(one_frame))   #   编译了却没有那块卡
     else libx264                                       # 失败就如实降级，不谎报加速
run(ffmpeg, frames, enc, audio, -shortest, +faststart)
verify(duration ≈ expected and streams = [video, audio])# 双流与时长必须核对

# 7) 联系表自检：看图 → 修 → 再看 / the contact-sheet loop
sheet = tile(render_at(t) for t in evenly_spaced(0, duration, keys))
critique(sheet)      # 构图 / 可读性 / 对比度 / 运动弧线 / 到底有没有事件
if problem: fix(scene); goto sheet                      # 秒级成本，别省这一步

# 8) 配音：先合成、量时长、再排分镜 / measure before you schedule
for line in narration:
    wav[line] = tts(line, voice = preset.persona.voice) # 回环代理，不访问外网
start[line] = duration(wav[line])                       # 用实测时长，不猜
track = mix(wav, delays = start_of_shot(line))
mux(video, track, -shortest)                            # 音画同长
```

## 尺寸与时间预算 (Sizing and time budget)

本工作站实测（无头 Chrome，软件渲染）：

| 渲染器 renderer | 分辨率 resolution | 每帧耗时 per frame |
|---|---|---|
| Canvas2D + full FX stack (bloom/chroma/scanlines/grain) | 1280×720 | **~255 ms** |
| Canvas2D + full FX stack | 480×270 | ~35 ms |
| Three.js + UnrealBloom | 960×540 | ~190 ms |
| NumPy + Pillow 引擎（2× 超采样，实测） | 640×360 | **~100 ms**（8 进程：360 帧 3 s） |

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
| NumPy + Pillow engine (2× supersampling, measured) | 640×360 | **~100 ms** (8 workers: 360 frames in 3 s) |

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

需要 Node.js、Google Chrome（或 Edge）和 ffmpeg。在本工作区里，它们已经随托管本 skill 的项目一起备好了；跑 `node skills/music-code-mv/scripts/probe.mjs` 会打印确切路径和就绪判定。安装与降级方案见 `reference/environment.md`。

Requires Node.js, Google Chrome (or Edge) and ffmpeg. In this workspace they are already provisioned inside the project that hosts this skill; run `node skills/music-code-mv/scripts/probe.mjs` to print exact paths and a readiness verdict. See `reference/environment.md` for install and fallback details.

## 参考文档 (Reference)

- `reference/authoring.md` —— **创作对接实操指南**：从空工作区到成片的完整命令序列（逐条实跑）、Chrome vs NumPy 引擎怎么选、预设怎么挑、TTS 配音顺序、联系表怎么读、常见报错与修法
- `reference/presets.md` —— 预设三族：四套氛围预设、AI 模型配色预设家族、带 `persona`/`voice` 的角色智能体预设；配色、后期、时长、分镜、占位歌词
- `reference/styles.md` —— 代码 MV 观感的风格词汇：T1–T27 风格（显示器家族 T13–T24：CRT/矢量屏/VFD/数码管/LED 点阵/LCD/OLED/电子墨水/热敏/全息投影/VHS/机械翻牌；印刷与像素 T25–T27：半调/像素画/数据砸裂）、M1–M17 母题库（从开机到关机的全部视觉元素）、配色逻辑与品牌两色系统
- `reference/numpy-pillow.md` —— NumPy + Pillow 逐帧引擎：3D 透视投影、严格栅格与字阶、分段色彩脚本
- `reference/techniques.md` —— 确定性渲染、Chrome flag、截帧、编码
- `reference/threejs.md` —— 怎么加 Three.js 镜头；预设 → Three.js 镜头逻辑的关联表
- `reference/lineage.md` —— 这种形式从哪来、这个领域在做什么
- `reference/environment.md` —— 工具链安装、降级方案、排障

- `reference/authoring.md` — **the authoring playbook**: the full command sequence from an empty workspace to an MP4 (every command run here), choosing the Chrome vs NumPy engine, picking a preset, narration order, reading a contact sheet, real errors and their fixes
- `reference/styles.md` — style vocabulary: T1–T27 styles (display family T13–T24: CRT/vector/VFD/segments/LED matrix/LCD/OLED/e-ink/thermal/hologram/VHS/split-flap; print & pixel T25–T27: halftone/pixel art/datamosh), the M1–M17 motif library (every visual element of the boot→shutdown program), colour logic and the brand two-colour system
- `reference/numpy-pillow.md` — the NumPy + Pillow frame engine: 3D perspective projection, strict grid & type scale, segmented color script
- `reference/techniques.md` — deterministic rendering, Chrome flags, capture, encoding
- `reference/threejs.md` — adding Three.js shots, plus the preset → Three.js shot mapping
- `reference/lineage.md` — where this form comes from and what the field does
- `reference/environment.md` — toolchain install, fallbacks, troubleshooting

## 常见坑 (Pitfalls)

- **自己推进时间的 rAF 循环** —— `t` 必须归渲染器掌控。
- **在绘制代码里读挂钟** —— 会毁掉帧缓存与确定性。
- **每帧调 `Math.random()`** —— 产生无法复现、无法缓存的闪烁。Chrome 模板改用 `src/rng.js` 的 `mulberry32(seed)`（每镜头播种一次），NumPy 引擎用 `env.rnd(seed)`。
- **杂乱背景上放不可读的字** —— 加一层遮罩，或者把文字背后的背景压暗。
- **Bloom / 曝光过曝** —— 软件渲染器会放大自发光数值；bloom 强度保持在 1 附近。
- **看都不看就交付。** 一定要读联系表。
- **音画漂移** —— 封装时加 `-shortest`，并核对最终时长。

- **rAF loops** that advance time themselves — the renderer must own `t`.
- **Reading the wall clock** anywhere in draw code — breaks frame caching and determinism.
- **`Math.random()` per frame** — flicker that cannot be reproduced or cached. Use `mulberry32(seed)` from `src/rng.js`, seeded once per shot (Chrome template); the NumPy engine exposes `env.rnd(seed)`.
- **Unreadable type** over a busy background: add a scrim, or dim the background behind text.
- **Bloom/exposure blowout** — software renderers amplify emissive values; keep bloom strength near 1.
- **Shipping without looking.** Always read the contact sheet.
- **Audio drift** — mux with `-shortest` and verify the final duration.
