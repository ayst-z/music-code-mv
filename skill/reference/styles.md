# 代码风格词汇表 (Style vocabulary)

每一条包含三件事：观感、代码原语、以及什么时候该用它。

Each entry: the look, the code primitive, and when to reach for it.

## T1 — 日志流 (Terminal)

**外观：** 等宽文字成列下雨或滚动，一个光标、时间戳、日志级别，错误不断堆积。
**原语：** `ctx.font = '14px ui-monospace, monospace'`、列缓冲数组、逐行 alpha、可选的逐字符显现、建立在 `Math.floor(t*2)%2` 上的闪烁块状光标。
**适用：** 机器的内部视角、“一个正在思考的系统”、把歌词行当成日志条目。这是一支关于“一个停不下来的日志系统”的 MV 的招牌观感。

**Look:** monospace text raining or scrolling in columns, a cursor, timestamps, log levels, errors accumulating.
**Primitives:** `ctx.font = '14px ui-monospace, monospace'`, column buffer array, per-line alpha, optional character-by-character reveal, a blinking block cursor on `Math.floor(t*2)%2`.
**Use for:** machine interiority, "a system thinking", lyric lines as log entries. This is the signature look for a MV about a system that cannot stop logging.

## T2 — 动态排版 (Kinetic typography)

**外观：** 一个歌词词或字填满画面，跟着节拍缩放、滑动、遮罩。
**原语：** 用 `ctx.measureText` 量宽；动画 `scale`/`letterSpacing`（需要逐字运动时就逐字符绘制）；用 `ctx.save(); ctx.beginPath(); ctx.rect(...); ctx.clip()` 做裁剪。
**规则：** 一行只讲一个想法，强拍上硬切，可读状态保持 ≥ 0.5 s。永远不要让文字和背景以同样的强度一起动。

**Look:** a lyric word or character filling the frame, scaling/sliding/masking on the beat.
**Primitives:** measure with `ctx.measureText`, animate `scale`/`letterSpacing` (draw per character when you need per-glyph motion), clip with `ctx.save(); ctx.beginPath(); ctx.rect(...); ctx.clip()`.
**Rules:** one idea per line, hard cuts on strong beats, hold the readable state for ≥ 0.5 s. Never animate text and background at the same intensity.

## T3 — 故障 (Glitch)

**外观：** 横向切片位移、RGB 通道分离、块状损坏。
**原语：** 先把画面画到一张离屏 canvas 上，再把 8–30 条横向条带以随机 x 偏移贴回去；通道分离就是用 `globalCompositeOperation` 加红/青着色把同一条带画三次。
**规则：** 故障是标点，不是纹理。一次只出现 2–6 帧，在节拍或报错处触发。

**Look:** horizontal slice displacement, RGB channel split, block corruption.
**Primitives:** draw the frame to an offscreen canvas, then blit 8–30 horizontal strips with random x-offsets; channel-split by drawing the same strip three times with `globalCompositeOperation` and red/cyan tints.
**Rule:** glitch is punctuation, not texture. 2–6 frames at a time, triggered on beats/errors.

## T4 — 扫描线 / CRT (Scanline / CRT)

**外观：** 荧光辉线、暗角、近似桶形的曲率、淡淡辉光。
**原语：** 一张缓存好的 1×4 图案铺满全屏（`createPattern`）、`createRadialGradient` 暗角、一层低 alpha 的 `ctx.filter = 'blur(2px)'` 拷贝做发光。
**又便宜又永远好看。** 叠在任何其他风格之上都成立。

**Look:** phosphor lines, vignette, barrel-ish curvature, faint bloom.
**Primitives:** a cached 1×4 pattern filled over the frame (`createPattern`), `createRadialGradient` vignette, low-alpha `ctx.filter = 'blur(2px)'` copy for glow.
**Cheap and always good.** Layer it over any other style.

## T5 — 线框 / 网格 3D (Wireframe / grid 3D)

**外观：** 透视地面网格、矢量线框实体、蓝图感。
**原语：** Canvas2D 手写投影（`x' = x*f/z`）通常就够用，而且比 Three.js 快得多；只有真需要光照／材质／实例化时才去找 Three.js。

**Look:** perspective floor grid, vector wireframe solids, blueprint.
**Primitives:** Canvas2D manual projection (`x' = x*f/z`) is often enough and much faster than Three.js; reach for Three.js only for real lighting/materials/instancing.

## T6 — 粒子场 (Particle field)

**外观：** 漂移的点、群落、拖尾。
**原语：** 用带种子的 PRNG 预生成位置，按 `t` 的函数移动，用 `fillRect` 绘制（比 `arc` 快得多），拖尾用一层低 alpha 的全帧填充来淡出，而不是清屏。

**Look:** drifting points, swarms, trails.
**Primitives:** pre-generate positions with the seeded PRNG, move by a function of `t`, draw with `fillRect` (far faster than `arc`), fade trails with a low-alpha full-frame fill instead of clearing.

## T7 — ASCII / 抖动 (ASCII / dither)

**外观：** 用字符或 1-bit 点阵重建画面。
**原语：** 采样一张粗网格，把亮度映射到字形梯度 `" .:-=+*#%@"`，用等宽字体绘制。

**Look:** the image rebuilt from characters or 1-bit dots.
**Primitives:** sample a coarse grid, map luminance to a glyph ramp `" .:-=+*#%@"`, draw monospace.

## T8 — 数据 / 波形 (Data / waveform)

**外观：** 示波器、频谱条、对数曲线、遥测数据。
**原语：** 一切都由 `t` 的一两个正弦／FBM 函数推导出来；离线拿不到真实分析仪数据，所以要用确定性的方式“演”出来。

**Look:** oscilloscope, spectrum bars, log graphs, telemetry.
**Primitives:** derive everything from one or two sine/FBM functions of `t`; real analyser data is unavailable offline, so fake it deterministically.

## T9 — 剪切拼贴 (Cut-up collage)

**外观：** 每个镜头一套不同处理，硬切，混用比例。
**原语：** 把每个镜头的风格放进各自的场景模块；剪切本身就是转场。这是让一支长 MV 看起来“有导演”的最便宜的办法。

**Look:** different treatments per shot, hard cuts, mixed scales.
**Primitives:** keep each shot's style in its own scene module; the cut is the transition. Cheapest way to make a long MV feel directed.

## T10 — 轨道粒子 (Orbital particle field)

**外观：** 一团带种子的粒子群绕着一个明亮核心打转，每个点都拖着一截低 alpha 的尾巴；轨道投影成扁椭圆，于是整个场在没有 WebGL 的情况下也读得出体积感。
**原语：** 半径／速度／轨道倾角／相位全部来自 `hash1(i * stride)`（绝不用 `Math.random`），每个粒子的角度是 `phase + speed * t`，每个采样点用 `fillRect`，拖尾 = 在 `t - g * STEP` 上采样的 TRAIL 个重影且 `alpha ∝ (1 - g/TRAIL)^1.7`，核心用 `shadowColor/shadowBlur`，每个节拍一个扩张的 `ellipse` 环。
**适用：** 前奏、副歌、“一个正在思考的系统”——一种以低 alpha 压在文字底下、但独自也能撑满画面的运动。
**规则：** 拖尾是画出来的，不是累积出来的。场景代码每帧拿到的都是一张全新的 canvas 状态，永远不要指望上一帧还活着（场景内部不要做全帧淡出缓冲）。

**Look:** a seeded swarm circling one bright core, every point dragging a short low-alpha tail; orbits projected as shallow ellipses so the field reads as volume without WebGL.
**Primitives:** radius / speed / orbit tilt / phase all from `hash1(i * stride)` (never `Math.random`), angle `phase + speed * t` per particle, `fillRect` for every sample, trail = TRAIL ghosts sampled at `t - g * STEP` with `alpha ∝ (1 - g/TRAIL)^1.7`, `shadowColor/shadowBlur` for the core, one expanding `ellipse` ring per beat.
**Use for:** intros, choruses, "a system thinking" — motion that sits under type at low alpha and still fills the frame on its own.
**Rule:** the trail is drawn, not accumulated. Scene code gets a fresh canvas state every frame, so never rely on the previous frame surviving (no full-frame fade buffer inside a scene).

## T11 — 等距 3D（纯 2D）(Isometric 3D (pure 2D))

**外观：** 2:1 等距网格上堆叠的方块、三档平面面色、柱子沿对角波呼吸——一行 three.js 都不写，就能得到机房或城市的观感。
**原语：** 每个角点投影成 `((gx-gy)*TW/2, (gx+gy)*TH/2 - z*TZ)`，在角点 `0..GRID` 上拟合 `TW = min(w*0.9/GRID, h*0.78/(GRID/2 + MAXL*0.31))`（一个格子跨 gx..gx+1），每根柱子三个四边形（顶／左／右）分别填 `palette.base` / `palette.accent` @0.5 / `palette.dim`，描边用 `palette.bg` 让相邻块分开，顶面受光的边用 `palette.accent`。
**适用：** 世界、地图、堆叠镜头、“从外面看机器”——凡是 T5 线框显得太空、而真 3D 又太贵的地方。
**规则：** 每帧按 `gx + gy` 升序排一次序（远角先画），然后按这个顺序画。画家算法就是全部的深度故事：没有 z-buffer，也就没有 z-fighting。

**Look:** stacked blocks on a 2:1 iso grid, three flat face tones, columns breathing on a diagonal wave — the look of a machine room or a city without a single line of three.js.
**Primitives:** project each corner `((gx-gy)*TW/2, (gx+gy)*TH/2 - z*TZ)`, fit `TW = min(w*0.9/GRID, h*0.78/(GRID/2 + MAXL*0.31))` over corners `0..GRID` (a cell spans gx..gx+1), three quads per column (top / left / right) filled with `palette.base` / `palette.accent` @0.5 / `palette.dim`, outline in `palette.bg` so neighbours separate, top-face lit edge in `palette.accent`.
**Use for:** worlds, maps, stack shots, "the machine from the outside" — anywhere T5 wireframe reads too empty and real 3D would cost too much.
**Rule:** sort once per frame by `gx + gy` ascending (far corner first) and paint in that order. Painter's algorithm is the whole depth story: no z-buffer, no fighting.

## T12 — 数据可视化 (Data dashboard)

**外观：** 示波曲线、柱条带、热力格、跳动的数字——一个“解释这支视频”而不是“表演这支视频”的镜头。
**原语：** 每个数字都是时间的纯函数：曲线用叠加的正弦加上 `hash2(cell, floor(t*7))` 抖动，柱条用 `0.5 + 0.5*sin(t*hz + k*i)` 包络，热力格用 `sin` 加量化 hash；描边用 `lineTo` + `shadowBlur`，柱子从基线用 `fillRect` 画，热力格用 `globalAlpha` 叠在 `palette.base` 上，最热那一格单独用 `palette.hot`；读数用 `stage.text(env.t.toFixed(2))`。
**适用：** 遥测、breakdown、桥段、说明性的节拍——凡是歌词已经停下、必须由数据来把意思讲完的地方。
**规则：** 只推导，不存储。不要关键帧数组，不要时钟，不要分析仪。读数要与前面的镜头连续时用 `env.t`，只属于这个镜头时用该镜头的局部 `t`。

**Look:** oscilloscope trace, bar strip, heat grid, ticking numbers — a shot that explains the video instead of performing it.
**Primitives:** every number is a pure function of time: layered sines plus `hash2(cell, floor(t*7))` jitter for the trace, `0.5 + 0.5*sin(t*hz + k*i)` envelopes for bars, `sin` + quantised hash for heat cells; stroke runs with `lineTo` + `shadowBlur`, bars with `fillRect` from a baseline, heat cells with `globalAlpha` over `palette.base`, hottest cell alone in `palette.hot`; readouts via `stage.text(env.t.toFixed(2))`.
**Use for:** telemetry, breakdowns, bridges, exposition beats — anywhere the lyric has stopped and the data has to carry the point.
**Rule:** derived, never stored. No keyframe arrays, no clocks, no analyser. Use `env.t` when a readout should feel continuous with earlier shots and the shot's local `t` when it belongs to this shot alone.

## 调色板纪律 (Palette discipline)

选 **3 个颜色 + 近黑背景**：一个基色、一个强调色，再留一个热点颜色给全片最重要的那一个事件。暗色电子／工业类作品用近黑 + 青 + 品红、偶尔一点琥珀色，读起来很好。在 `project.json` 里放一个 `palette` 对象，绝不在场景里硬编码十六进制色值。

Pick **3 colors + near-black background**: a base, an accent, and one hot colour reserved for the single most important event in the video. Dark electronic / industrial work reads well as near-black + cyan + magenta with a rare amber. Keep a `palette` object in `project.json` and never hardcode hex values in scenes.

## 组合搭配 (Combining)

这一类型的一个强力默认堆栈：主歌用 **T1 + T4**，副歌重拍用 **T2**，转场处用 **T3**，再让 **T6** 以低 alpha 垫在一切下面。

A strong default stack for this genre: **T1 + T4** for verses, **T2** for chorus downbeats, **T3** on transitions, **T6** underneath everything at low alpha.
