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
**又便宜又永远好看。** 叠在任何其他风格之上都成立。整根显像管的仿真——曲率、荫罩、开关机动画——见 **T13**。

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

## 显示器风格 (Display technologies · T13–T24)

画面不只是"什么图案"，还是**什么屏幕**。这一族可以叠在任何其它风格与母题之上；**一个段落只演一种显示器**——换显示器等于换时代，是分段色彩脚本级别的事件，切换贴着段落边界走，不要镜头间乱跳。

A frame is also *what screen it is on*. This family stacks over any other style and any motif; **one display technology per segment** — switching screens is switching eras, so cut on section boundaries, never mid-verse.

### T13 — CRT 显像管 (Full CRT tube)
**外观：** 桶形曲率、荫罩三色点或光栅条、扫描线随亮度出现。签名动作是**开关机**：开机=一条水平亮线纵向展开成画面，关机=画面横向塌成一道亮线再缩成一点、余辉熄灭（正是 M17 的收官）；开机瞬间的消磁（degauss）让色纯抖两下，行频失步时画面横向撕裂。
**原语：** 模板 `stage.js` 现成三个方法——`stage.barrel(0.10~0.22)`（**广角畸变/桶形曲率**：按行绕中心水平缩放，中心放最多、竖线弯成桶形）、`stage.beamBlur(1~2.5@720p)`（**粒子模糊/束斑**：电子束打在荧光粉上是软光斑，亮度越高扩散越大，和 bloom 成对——bloom 管溢出、这个管焦外）、`stage.mask('triad'|'grille')`（**荫罩三色点/光栅条 + 一根 Trinitron 阻尼线**，multiply 只压暗缝隙）。扫描线用 `stage.scanlines()`（**乘性**压暗非亮区，不画黑条）；开关机=`clamp(t)` 驱动 y-scale 0↔1 加亮度包络；余辉=在 `t−g·STEP` 上采样 2–3 个重影（T10 的纪律：不读上一帧）。行频失步用 `sliceGlitch`，消磁抖动用两次快速 `chroma` 脉冲。NumPy 版的曲率用 meshgrid 直接做 UV 重采样。
**适用：** 开机/关机段（M1/M17）、`phosphor` 预设、一切"这是一台老机器"的叙事。**与 T4 的分工**：T4 是便宜的覆盖层（扫描线+暗角，叠什么都成立），T13 是整根显像管的仿真——要做曲率与开关机动画时用它。
**Look:** barrel curvature, mask triads, brightness-driven scanlines, degauss wobble; power-on unfolds a horizontal line into a picture, power-off collapses it to a point (M17's signature move). Persistence is ghosted at `t−g·STEP`, never read from the previous frame. T4 is the cheap overlay; T13 is the whole tube.

### T14 — 矢量荧光屏 (Vector phosphor / oscilloscope)
**外观：** 没有像素网格——画面全是发光笔画，亮处晕开、暗处纯黑，轨迹按余辉衰减；XY 模式下一切运动天然长成李萨如。
**原语：** stroke + 加法发光（`shadowBlur` / NumPy 高斯核）；余辉=同一路径在 `t−g` 上画 3–5 遍、alpha 指数衰减；线宽随"束流强度"变化；**不加扫描线**——矢量屏没有光栅。
**适用：** 波形与心电（M4）、振动（M8）、T8 数据 + `phosphor`；任何"束流在荧光上写字"的镜头。
**Look:** strokes only, additive glow, exponential persistence, no raster lines — the beam writes directly on phosphor. Perfect for waveforms (M4) and vibration (M8).

### T15 — VFD 荧光显示 (Vacuum fluorescent display)
**外观：** 青蓝绿段码浮在暗玻璃后，字前面罩着一层**细金属栅网**的影子，几条极淡的灯丝横线；数字永远是段码拼出来的。
**原语：** 段码字形表（字形=段列表）+ 段间微光溢出；栅网=低 alpha 细网格 pattern 叠在字上；底是暗玻璃（`bg` 略带青灰），不是纯黑。
**适用：** 机器仪表、计数器、时间码；比 CRT 干净、比 LCD 复古。
**Look:** teal segment glyphs behind a fine mesh grid and faint filaments; digits are always assembled from segments. Instrument panels and counters.

### T16 — 数码管 / 辉光管 (Seven-segment & Nixie)
**外观：** 七段数码管：每段是带斜切角的长六边形，**熄灭的段留 5% 暗痕**；辉光管：橙色氖气数字**前后叠放**，近处的字更大更亮，灯丝可见，橙光在暗玻璃里晕开。
**原语：** 段表 + `t` 驱动的翻页（计数器永远是纯函数）；Nixie=层叠 z-order，每层不同 alpha 与尺寸模拟景深；发光色用氖橙（`hot` 的天然候选）。
**适用：** 计数与倒数——M12 的 `1→4096`、M17 的 `N: 262144→1` 正好是数码管的戏；卡点倒计时。
**Look:** segment glyphs with 5% dark ghost segments; Nixies stack digits front-to-back with depth-scaled neon glow. Countdowns and counters (M12, M17).

### T17 — LED 点阵 (LED dot matrix)
**外观：** 画面拆成可见灯珠网格，灯珠之间有黑缝；灰阶是**离散 PWM 档位**，过亮的灯珠带十字星芒。
**原语：** 采样到粗网格再逐灯珠重画（T7 的近亲，输出是亮点而非字符）；灰阶量化 `round(v*L)/levels` 必须配抖动，否则渐变分层；灯珠=`fillRect` + 一次 `shadowBlur`。
**适用：** 巨幕、执行队列 16 连（M12）、频谱城市（M5）——LED 天生就是"格子事件"。
**Look:** visible LED cells with dark gaps and discrete PWM greys (dither or banding appears). Billboards, queue grids (M12), spectrum cities (M5).

### T18 — LCD
**外观：** 不发光的冷静：像素网格极淡、**可视角度即明暗**（画面随"机位"整体变灰偏色）、TN 屏沿垂直方向色偏、常驻一个坏点、响应迟滞拖出确定性重影；背光不均，角落微灰。
**原语：** 亮度乘一个随视角走的系数（机位也做成 `t` 的函数）；重影=`t−g` 重影叠加（纪律同 T10）；子像素=RGB 三竖条 pattern。**LCD 没有 bloom，没有暗角发光。**
**适用：** 现代设备、UI 与监控画面；与 OLED 互为年代感开关。
**Look:** cold, non-emissive, view-angle dimming, faint subpixel stripes, deterministic response ghosting, one stuck pixel, zero bloom. Modern devices and monitors.

### T19 — OLED
**外观：** 纯黑就是纯黑（`bg` 用 `#000000`，颗粒与暗角都要克制，别让 grain 抬黑位）；对比度拉满；大块静态 UI 的**烧录残影**——上一段的字以 2–5% 亮度还留在原地。
**原语：** 背景绝不提亮；烧录=把前一段的静态元素（t 的分段函数，确定性无碍）以低 alpha 重画；不需要发光后期。
**适用：** 黑白高对比（`gpt` 预设）、纯排版；用烧录残影讲"这台机器看了太久"（M10 报错残影）。
**Look:** absolute black, max contrast, no bloom, and burn-in ghosts of previous static UI at 2–5% — a display that has been showing the same thing too long. `gpt`'s natural host.

### T20 — 电子墨水 (E-ink)
**外观：** 纸感 1-bit，只有黑白与抖动网点；**全屏刷新会闪一次黑**（波形控制器的签名），刷新间隙留上一页内容的浅残影；完全不发光——没有暗角、没有辉光。
**原语：** 阈值 + 有序/蓝噪声抖动（T7）；闪黑=段落边界处 2–4 帧全黑→恢复；残影=上一个"页面"（t 的上一段）以 8–12% 灰叠加。**禁止 bloom。**
**适用：** 字卡、定义与引文（M3）、章节卡；`ink-paper` 预设的天然宿主。
**Look:** paper-like 1-bit dither, a black flash on full refresh, faint ghost of the previous page, zero glow. Type cards, definitions, chapter cards; `ink-paper`'s natural host.

### T21 — 热敏打印 (Thermal print)
**外观：** 收据纸的灰白与轻微褶皱，内容**从上往下一行行吐出来**，每行带 ±0.3° 歪斜，穿插条码与裁切虚线；打印头走过留下一条极细深边。
**原语：** 行缓冲逐行显现（T1 的速度感）+ 歪斜按行 hash（种子 PRNG）；纸底=带纤维噪声的 off-white；输出 1-bit 黑白。
**适用：** 报错清单、执行队列、账单式段落（M10/M12）——比终端多一分"物证"感。
**Look:** receipt paper, line-by-line printout with ±0.3° per-row skew, barcodes and tear lines. Error lists and queue manifests read as evidence (M10/M12).

### T22 — 全息与投影 (Hologram & projector)
**外观：** 全息=蓝紫单色 + 扫描带 + 偶发水平撕裂与色散，永远悬浮在暗空气里；投影=可见光锥、空气尘埃、四角 keystone 梯形失真、画面中心比边缘亮。
**原语：** 全息=加法混合 + 水平扫描带 pattern + 低频 UV 撕裂（T3 的 2–6 帧窗口纪律）；投影=对已画好的帧做单应变换（homography：NumPy 一次 meshgrid 重采样，Canvas2D 分条贴回）+ 梯形光锥渐变 + 尘埃粒子（T6）。
**适用：** 标题卡、晶格巨构（M2）、"挑战神明"段的显圣镜头——制造"这画面悬在空气里"的距离感。
**Look:** hologram = additive monochrome with scan bands and occasional tearing; projector = keystone homography, visible light cone and dust. Title cards and apparitions (M2, 挑战神明).

### T23 — VHS 录像带 (VHS tape)
**外观：** 家用录像的三宗罪：**跟踪噪声带**——画面底部 6–12px 的撕裂条，每帧水平错位不同量；**色彩渗出**——饱和色沿水平方向糊出边缘；**磁粉掉粉**——随机白噪点与短横线。整体偏软、黑位被抬高（纯黑≈8/255），偶尔整幅垂直抖一行。
**原语：** 底部噪声带=最后 N 行按 `hash(frame)` 横向平移（常驻的 T3 窗口）；chroma bleed=色度通道横向模糊 3–5px 再合回（NumPy 分通道 `np.roll` 加权）；掉粉=带种子噪点；垂直抖动=单行循环移位。
**适用：** 复古录像、回忆闪回段。**与 T13 的分工**：CRT 是"屏幕"（曲率、栅格、开关机），VHS 是"磁带"（噪声带、色彩渗出、黑位抬升）。
**Look:** tracking-noise band at the bottom, chroma bleed, tape dropouts, lifted blacks. CRT is the *screen*; VHS is the *tape* — flashbacks and home-video sections.

### T24 — 机械翻牌 (Split-flap)
**外观：** 机场翻页牌：每个字符是一对对折叶轮，翻动时上半叶先落下、带残影，**整排不同时到位**（按列错开 40–90ms），停稳时轻微回弹；牌面哑光塑料，中缝把字切成上下两半。
**原语：** 字符状态机=当前字符到目标字符的翻页序列（预计算中间字形表）；单字符动画=上半叶绕中缝旋转（2D 仿射 `scaleY 0→1`，上暗下亮）；列延迟=`hash(col)` 定开始时间。**全部是 t 的纯函数。**
**适用：** 标题卡、倒计时、数字滚动——M12 的计数器用翻牌比数码管（T16）更有机械质量感；比 T16 更"重"。
**Look:** airport split-flap boards — flap halves rotating on the seam, columns arriving 40–90 ms apart, deterministic rebound. Title cards and counters (M12) with mechanical mass.



### 显示器特征核对表 (Display characteristics audit)

逐条自查——**每种显示器都有几条「少一条就不像」的物理特征**，最后一列是模板里能直接调用的原语（`stage.*`）。渲完联系表回来对这张表打勾。

Every display has a few physical traits without which it stops reading as that display. Tick them off against the contact sheet; the last column names the primitive you can call.

| 显示器 | 必须命中（少一条就不像）| 最容易漏的 | 落地原语 / primitive |
|---|---|---|---|
| **T13 CRT** | 桶形曲率 · 荫罩三色点或光栅条（含**一根**阻尼线）· 亮度驱动的扫描线 · 余辉重影 · 开关机动画 · 消磁抖 · 行频失步撕裂 · **束斑软焦** | 只做曲率不做**粒子模糊**（束斑是软光斑）；扫描线画成黑条而非乘性压暗 | `stage.barrel` · `stage.mask('triad'/'grille')` · `stage.scanlines` · `stage.beamBlur` · `stage.sliceGlitch` |
| **T14 矢量屏** | 无像素网格 · 发光笔画 · 指数余辉 · 线宽随束流 · **没有扫描线** | 手贱加了扫描线——矢量屏没有光栅 | 加法发光 + `t−g` 重画 3–5 遍 |
| **T15 VFD** | 段码字形（不是字体）· 细金属栅网影 · 灯丝横线 · 暗玻璃底 | 用普通字体排数字；底色用纯黑而非带青灰的玻璃 | 段表 + 低 alpha 网格 pattern |
| **T16 数码管/辉光管** | 熄灭段留 **5% 暗痕** · 辉光管前后叠放（近大远亮）· 氖橙 | 熄灭段完全不画 → 数字像在跳而不是在计数 | 段表 + 层叠 alpha/尺寸 |
| **T17 LED 点阵** | 可见灯珠与黑缝 · 离散 PWM 灰阶 · 过亮灯珠十字星芒 | 灰阶不加抖动 → 渐变严重分层 | 粗网格重绘 + `round(v*L)/levels` + 抖动 |
| **T18 LCD** | 可视角度=明暗 · **不发光**（无 bloom 无暗角发光）· 背光不均 · 坏点 · 响应重影 · 子像素 RGB 竖条 | 按发光屏的直觉加了 bloom/暗角 → 立刻变成 OLED | 视角亮度系数 + `t−g` 重影 |
| **T19 OLED** | 完美黑（不发光就是纯黑）· 无背光溢出 · 子像素文字边缘色 · 烧录残影 | 沿用 LCD 的背光不均 → 黑场变灰 | 直接用 `bg`，不加背光层 |
| **T20 电子墨水** | 全屏刷新反色闪 · 鬼影/残影 · **零发光** · 纸纹 | 忘了刷新闪（它是换管信号）；给它加了 bloom | 刷新闪 = 满屏反色 0.3–0.4s |
| **T21 热敏打印** | 单色 · 横向打印条带 · 纸边 · 热度不均的深浅 | 用平滑渐变 → 变成普通单色屏 | 逐行条带 + 固定噪声 |
| **T22 全息投影** | 体积扫描线 · 闪烁 · **加色合成** · 空气尘埃 · 随距离衰减 | 画成半透明平面 → 像玻璃不像投影 | `screen`/`lighter` + 呼吸 alpha |
| **T23 VHS** | 跟踪条 · 色度渗出 · 掉磁噪点 · 头切换噪声带 · 帧抖 · 画面柔化 | 只加噪点不给跟踪条 → 像信号差，不像录像带 | `stage.sliceGlitch` + 色度错位 + 底部噪声带 |
| **T24 机械翻牌** | 中缝切开字 · 上半叶先落 · **列错开 40–90ms** · 停稳回弹 · 哑光牌面 | 整排同时到位 → 机械质量感全没了 | `hash(col)` 做列延迟 + `scaleY` 叶片 |

**通用两条：** ① 显示器是**一层**，叠在母题与排版**下面**，同一段落只用一种（见「组合搭配」）；② 换显示器=换时代，切换必须贴段落边界，并先过一道黑场或刷新闪。

**Two rules for all of them:** a display is *one layer*, placed under motifs and typography, one per segment; and switching displays is switching eras — cut on a section boundary through black or an e-ink refresh flash.


### 显示器伪代码 (Display pseudocode)

一种写法覆盖 T13–T24：内容先渲到离屏层，再套上那种管子的物理特征；换显示器是**分段级事件**。

```text
# 一个段落只用一种显示器，叠在母题与排版**下面** / one display per segment, under everything
fn draw_display(kind, t, draw_content):
    content = render_offscreen(draw_content)      # 内容层：字、图形、母题
    screen  = era_optics(kind, content, t)        # 该种屏幕的物理特征
    blit(screen); draw_motifs(); draw_type()      # 母题与排版永远在显示器之上

fn era_optics(kind, img, t):
    match kind:
      case T13 CRT:
          img = barrel(img, 0.10..0.22)                   # 广角畸变：竖线弯成桶形
          img = beam_blur(img, r=1..2.5)                  # 束斑模糊（粒子模糊）
          img = mask(img, triad | grille + 一根阻尼线)      # 荫罩/光栅条
          img *= scanlines(brightness_driven)             # 乘性压暗，**不画黑条**
          for g in {0.08,0.16,0.24}: ghost += a_g * at(t-g)   # 余辉：只采样，不读上一帧
          if power_on(t):  img = unfold_line_to_picture(t)   # 开机：亮线纵向展开
          if power_off(t): img = collapse_to_dot(t)         # 关机：塌成线再缩成点（M17）
          if degauss(t):   img = chroma_pulse ×2             # 消磁：色纯抖两下
      case T14 VECTOR:   strokes_only(img); 禁扫描线; ghost = draw(path, t-g) × α^g
      case T15 VFD:      seg = glyph_table(text); overlay mesh_grid(α≈.12); filaments
      case T16 SEGMENT:  seg = table(text);  **off_segments 留 5% 暗痕**; nixie: z-order 层叠
      case T17 LED:      cells = downsample(img, cell);
                         v = round(v*L)/levels + dither     # 不抖动必分层
                         hot cells += cross flare
      case T18 LCD:      img *= view_angle(camera_t);       # 视角即明暗
                         **禁 bloom、禁暗角发光**; ghost at t-g; 固定一个坏点
      case T19 OLED:     bg = pure_black; **无背光溢出**; 子像素边缘色; 烧录残影
      case T20 EINK:     if phase < 0.35: invert_flash()    # 刷新闪（也是换管信号）
                         else: paper_tex + ghost = prev × 0.15; **零发光**
      case T21 THERMAL:  img = mono(img); band_rows(img, 行抖动); 纸边 + 热度不均
      case T22 HOLO:     img = additive(img) + scanlines; flicker(0.9..1.0);
                         dust; falloff = f(距离)
      case T23 VHS:      chroma_bleed(±3); tracking_bar(y = f(t));
                         dropouts = hash() < 0.01; head-switch 噪声带(底 4px);
                         jitter(t); soft_focus(1.5)
      case T24 SPLITFLAP:for col: delay = hash(col) × 0.04..0.09        # 整排不同时到位
                         flap: scaleY 0→1 + 上暗下亮; 中缝切字; landing 回弹

# 换显示器 = 换时代：贴段落边界，先过一道黑场或刷新闪
on_segment_boundary: fade_to_black(0.15s) | eink_refresh_flash(); then switch(kind)
```

### 选型表 (Choosing a display)

| 段落 / 母题 | 显示器 | 为什么 |
|---|---|---|
| 开机 / 关机（M1 · M17） | **T13 CRT** | 开关机动画是它的签名动作 |
| 波形 / 心电 / 振动（M4 · M8） | **T14 矢量屏** | 连续笔画 + 余辉，没有光栅 |
| 仪表 / 计数 / 倒数（M12 · M17） | **T15 VFD · T16 数码管** | 段码天生是数字 |
| 执行队列 / 频谱城市（M5 · M12） | **T17 LED 点阵** | 格子事件就是灯珠事件 |
| 现代 UI / 监控 | **T18 LCD · T19 OLED** | 年代感开关，烧录讲历史 |
| 字卡 / 定义 / 引文（M3） | **T20 电子墨水** | 纸感 + 刷新闪黑 |
| 报错清单 / 账单（M10 · M12） | **T21 热敏打印** | 物证感 |
| 标题 / 显圣（M2） | **T22 全息投影** | 空气与距离 |
| 复古录像 / 回忆闪回 | **T23 VHS** | 磁带噪声带，不是屏幕 |
| 标题数字滚动 / 倒计时 | **T24 机械翻牌** | 机械质量感，比数码管更重 |
| 引文 / 档案图像 | **T25 半调网点** | 纸的网点，不是屏的像素 |
| 游戏感 / 趣味段 | **T26 像素画** | 低分辨率 + 限色 |
| 崩溃 / 编码故障（M11） | **T27 数据砸裂** | 块与涂抹，编码器坏掉的样子 |
| 终端叙事（T1） | T13 或 T14 | 看年代：阴极射线管更"重"，矢量屏更"纯" |



## 印刷与像素 (Print & pixel · T25–T27)

### T25 — 半调网点 (Halftone)
**外观：** 报纸/漫画的印刷网点：图像拆成规则排布的圆点，**点的大小=明暗**；彩色版各通道网屏角度错开（经典 CMYK 15°/75°/0°/45°），近看全是点、远看成图；单色版是单一网角的黑点。配 off-white 纸底。
**原语：** 旋转采样网格求 cell 中心（NumPy：旋转坐标后按 luminance 求点半径），或规则点阵上 `fill半径=f(亮度)` 的圆；分辨率越低越"印刷"。
**适用：** 引文、档案感镜头、`ink-paper` 的图像化版本。**与 T7 的分工**：T7 是 1-bit 字符/抖动（屏感），T25 是连续调网点（纸感）。
**Look:** newspaper rosette dots sized by luminance, channels at offset screen angles, off-white paper. Quotation and archive looks; T7 is screen, T25 is paper.

### T26 — 像素艺术 (Pixel art)
**外观：** 低分辨率画布整体放大（nearest-neighbor），色阶限制在 16–32 色小调色板，动画帧率压到 8–12fps（`floor(t*fps)/fps` 步进），运动有"帧感"。
**原语：** 先在 1/4 或 1/8 分辨率画完整帧再 `resize(NEAREST)` 放大（NumPy 索引重采样）；调色板量化=预计算色表最近映射；步进时间。
**适用：** 游戏梗、UI 与趣味段。**与 T17 的分工**：点阵是灯珠网格+灰阶（硬件），像素画是整帧低分辨率+限画（美术）。
**Look:** render at 1/4–1/8 resolution, upscale nearest-neighbour, quantise to a 16–32 colour palette, step time at 8–12 fps. Game-flavoured beats; T17 is hardware, T26 is art.

### T27 — 数据砸裂 (Datamosh)
**外观：** 压缩本身坏掉：P 帧拿旧帧当参考，运动把上一帧像素**拖成彩虹涂抹**；8×8 DCT 块沿运动矢量错位，局部区域滞留旧画面。
**原语：** 确定性模拟——把 `t−δ` 的画面按运动场平移后，在 8×8 块级与当前帧混合：`mask = hash(block, floor(t*hz))` 决定哪块用旧帧，每块独立平移 ≤16px；**块必须 hash 驱动，不许真随机**。
**适用：** M11 崩溃、`grok` 的报错瞬间、转场一击。**与 T3 的分工**：T3 是剪辑故障（切片位移），T27 是编码故障（块与涂抹）。
**Look:** corrupted compression — old-frame pixels dragged by the motion field, 8×8 blocks displaced, deterministic hash per block. The archetypal collapse visual (M11); T3 is an editing glitch, T27 is an encoder glitch.

## 母题库 (Motif library)

T1–T27 是**怎么看**（风格），母题是**看什么**（镜头内容）。这支「从开机到关机」的程序把元素排成一条节拍链；顺序按段落走、时间锚到音频，**不要按写死的时间码排**。每个母题就是一个镜头的一件事（规矩 4），节拍建议链：

T1–T27 say *how* a shot looks; a motif says *what* it is about. The "boot → shutdown" program orders the elements into a beat chain: follow the sections, anchor timing to the audio, **never to baked-in timecodes**. One motif = one event per shot (rule 4). Suggested chain:

```
开机 → world boot → 几何定义 → 电与时间 → EXECUTION/副歌 → 万物皆点 → 互换 → 振动
→ 碎片 → 挑战神明/非法参数 → 崩溃 → 处决/执行队列 → 暗面副歌 → LOVE → 离开 → 擦除 → 关机/exit code
```

### M1 — 开机 / Boot
**外观：** 自检逐项亮起：PCB 走线从焊盘沿着铜箔点亮，五种正多面体依次自检（每个多面体标 `V−E+F=2`），权重张量 `He` 用 `N(0, 2/n)` 初始化——数字从噪声里长出来。
**原语：** PCB = 折线段 + 端点圆盘（`lineTo` + `arc`），沿路径按 `t` 做进度裁剪；正多面体 = 预计算顶点/边表 + 手写透视投影（T5）；高斯初始化 = 带种子 PRNG 直方图逐 bin 长高。
**适用：** 片头第一镜；一切"系统开始运行"的叙事起点。

**Look:** POST sequence — PCB traces light up along copper paths, the five Platonic solids self-check with `V−E+F=2`, weights initialising from `N(0, 2/n)` noise.
**Primitives:** polylines with a `t`-driven progress clip; vertex/edge tables + manual perspective (T5); seeded-PRNG histogram growing.
**Use for:** the opening shot, any "system starts running" beat.

### M2 — world boot / 标题
**外观：** 三旋臂星系在标题下方缓缓转出；镜头推近，星系解构成光线步进的晶格巨构——远看是星，近看是脚手架。
**原语：** 星系 = 极坐标对数螺旋臂 + `fillRect` 粒子（T6），角速度 ∝ `1/r`；晶格巨构 = 重复单元的等距/透视阵列（T11 或真 3D），雾色 = `palette.bg` 藏住边界。
**适用：** 标题卡、世界观亮相；副歌前的"拉开尺度"。

**Look:** a three-arm spiral galaxy turning under the title; a push-in resolves it into a raymarched lattice megastructure — stars from afar, scaffolding up close.
**Primitives:** log-spiral arms of `fillRect` particles (T6), angular speed ∝ `1/r`; repeated lattice unit in iso/perspective (T11), fog in `palette.bg`.
**Use for:** title card, world reveal, the scale-up before a chorus.

### M3 — 几何定义 / Definitions
**外观：** Byrne 版《几何原本》图版的气质：彩色点线图配上"定义 1"编号；`x²+y²=1` 逐点描出，`sin θ` 的切线族包络出曲线，ε–N 极限里 N 被一格格推大，`2.53` 处浮点量化把平滑斜坡切成台阶。
**原语：** 全部是 `t` 的纯函数描线：圆与包络用 SDF 或 `arc`，切线族 = 循环画切线（疏密由 `t` 控制），量化 = `Math.floor(x*q)/q`，并在量化跳变处闪一帧 `palette.hot`。
**适用：** 说明段、主歌的"讲道理"镜头；文字与图版同屏时让图退到 `dim`。

**Look:** Byrne's Euclid plates — coloured point-line diagrams with numbered definitions; `x²+y²=1` drawn point by point, a tangent family enveloping a curve, ε–N pushing N up a notch at a time, float quantisation stair-stepping 2.53.
**Primitives:** everything is a pure function of `t`: SDF or `arc` outlines, a loop of tangent lines, `Math.floor(x*q)/q`, one `palette.hot` flash per quantisation jump.
**Use for:** exposition verses — diagrams on screen fall back to `dim` while type stays loud.

### M4 — 电与时间 / Electricity & time
**外观：** 击穿电弧沿最短路径劈开间隙（`E = V/ε`），全波整流把 `sin` 折成 |sin| 再被 RC 滤波抹平；六叶光圈吐出衍射星芒，向日葵按 `r = c√n, θ = n·137.508°` 逐籽落位，双星旋近把两个点拧成一个。
**原语：** 电弧 = 抖动折线 + 2–6 帧高亮（T3 的用法）；整流 = 对 `|sin(t)|` 低通（一阶 RC：`y += (x−y)·dt/RC`）；星芒 = 6 条旋转射线 + bloom；向日葵 = 黄金角散列（预计算全部 n）；旋近 = 轨道半径 `a ∝ (t_c − t)^0.25`。
**适用：** 能量积累段、副歌前的 4 拍铺垫；一切"波形被处理过"的镜头。

**Look:** a breakdown arc splitting the gap (`E = V/ε`), full-wave rectification folding `sin` into |sin| then smoothed by an RC filter; six-blade aperture diffraction stars, sunflower seeds at `r = c√n, θ = n·137.508°`, a binary inspiral twisting two points into one.
**Primitives:** jittered polylines + a 2–6 frame flash; `|sin|` low-pass (`y += (x−y)*dt/RC`); six rotated rays + bloom; golden-angle hash (precomputed); orbital radius `a ∝ (t_c − t)^0.25`.
**Use for:** energy build-ups, the four-beat pre-chorus, any "waveform being processed".

### M5 — EXECUTION / 副歌一
**外观：** Transformer 的**真实 token** 方块与注意力头连线亮起（不是装饰性的假矩阵），RLHF 奖励曲线一路上扬又抖动，脚下是频谱城市——楼高 = 频段能量。
**原语：** token = 网格字块（栅格见配色逻辑的 12 栏），注意力 = 两点间低 alpha 曲线（`quadraticCurveTo`），头与头用 `dim` 分层；曲线 = 平滑随机游走（种子 PRNG，非 `Math.random`）；频谱城市 = T11 等距柱，高度 `= band(t)`。
**适用：** 副歌第一段；"系统在学习"的主视觉。

**Look:** real GPT-2 tokens and attention-head links lighting up (no decorative fake matrices), an RLHF reward curve climbing and jittering, a spectrum city below where building height = band energy.
**Primitives:** token grid on the 12-column grid; attention as low-alpha `quadraticCurveTo` links, heads separated with `dim`; smoothed seeded random walk for the curve; T11 iso bars at band energy.
**Use for:** first chorus — the "system is learning" key visual.

### M6 — 万物皆点 / Everything is a point
**外观：** 茄子变成 USDA 营养流向图的一个节点，番茄拆成 444/472/503 nm 三条吸收峰，猫是 `(|生⟩+|死⟩)/√2` 的叠加态在两条轨道上同时出现，神 = `3!` 的唯一存在证明——六个排列逐一高亮到齐。
**原语：** 桑基/流向 = 变宽的贝塞尔带；光谱 = 三条高斯峰按 nm 定位（坐标就是数据，不是装饰）；叠加态 = 同一形体画两份、`hot`/`accent` 各一、alpha 各 0.5；`3!` = 排列表 + 逐项 tick，最后一格落定时整屏闪一次 `hot`。
**适用：** 桥段"概念蒙太奇"；一镜一个等式，硬切。

**Look:** the eggplant becomes a node in a USDA flow diagram, the tomato splits into absorption peaks at 444/472/503 nm, the cat exists on two orbits at once as `(|alive⟩+|dead⟩)/√2`, God is the uniqueness proof of `3!` — six permutations ticking in.
**Primitives:** widening bezier ribbons for flows; three Gaussian peaks positioned by real nm; the superposition drawn twice (`hot`/`accent`, alpha 0.5); a permutation table ticking to a full-screen `hot` flash on the last cell.
**Use for:** a bridge montage — one equation per shot, hard cuts.

### M7 — 互换 / Swap
**外观：** `F→M` 恰好翻转一个比特（一个格子的颜色跳变），12 小时制是一天的双重覆盖（两条时间带错位叠印），辫群交叉滑移，莫尔条纹随夹角呼吸，超椭圆 `|x/a|ⁿ+|y/b|ⁿ=rⁿ` 从圆滑到方。
**原语：** 位翻转 = 单 cell 状态机；双重覆盖 = 同一图形两份错位 `t/2` 相位；辫群 = 交叉 braid 的参数化正弦交换（预计算交叉点）；莫尔 = 两张同参数网格相对旋转 ±ε；超椭圆 = 隐函数采样成折线，`n` 由 `t` 驱动。
**适用：** 角色互换、性别/视角对调的段落；两个状态之间的一次硬切。

**Look:** `F→M` flips exactly one bit (one cell changes colour), the 12-hour clock double-covers a day (two offset time bands overprinted), braid strands sliding past each other, moiré breathing with the angle, a superellipse morphing round → square.
**Primitives:** single-cell state machine; the same figure twice at `t/2` phase offset; parametric sine-swap braid crossings (precomputed); two grids counter-rotating ±ε; implicit curve sampled to a polyline with `n` driven by `t`.
**Use for:** role-swap verses — one hard cut between two states.

### M8 — 振动 / Vibration
**外观：** 百万沙粒在克拉尼图形上聚成 nodal 线，利萨茹曲线把两个频率锁成一个闭合环，贝塞尔模态 `J₄(j₄,5r)·cos 4θ` 在圆盘上结出四瓣。
**原语：** 克拉尼 = `sin` 驻波场上跑阈值采样（粒子**只在预计算场**上移动，`t` 只驱动激励频率与幅度）；利萨茹 = `x=A·sin(a·t+δ), y=B·sin(b·t)`；贝塞尔模态 = `j_b` 查表 + `np`/级数近似，径向 × 角向分离着色。百万粒子用 `fillRect` + 预生成位置（T6）。
**适用：** "振动与完成"段；声音的**样子**，适合副歌后的回落。

**Look:** a million grains settling onto Chladni nodal lines, a Lissajous curve locking two frequencies into one closed loop, the Bessel mode `J₄(j₄,5r)·cos 4θ` blooming into four petals.
**Primitives:** particles riding a precomputed standing-wave field (seeds move on the field; `t` only drives excitation frequency/amplitude); `x=A·sin(a·t+δ), y=B·sin(b·t)`; tabulated `j_b` with radial × angular colour separation. A million grains = seeded positions + `fillRect` (T6).
**Use for:** the vibration/completion section; the *look of sound* after a chorus falls away.

### M9 — 碎片 / Fragments
**外观：** 内存碎片整理把散块滑到一起，Voronoi 从一个裂点炸开整幅画面，Dijkstra 在权值图上走出一条发光裂纹。
**原语：** 碎片 = 有序矩形数组，空洞用 seeded shuffle 生成，`t` 驱动"compaction"插值；Voronoi = 预计算 cell（或逐像素最近点扫描，全帧 NumPy 一把算）；Dijkstra = 确定性最短路（邻接表预计算），裂缝沿线逐段点亮 `hot`。
**适用：** 转场与"擦除"段；硬切 + 2–6 帧 T3 故障正好接在碎裂后。

**Look:** defragmentation sliding blocks together, a Voronoi shatter bursting from one impact point, a glowing crack walking Dijkstra's shortest path across a weighted graph.
**Primitives:** shuffled rectangles interpolating to packed order; Voronoi cells precomputed (or one full-frame NumPy nearest-point pass); deterministic shortest path lighting up segment by segment in `hot`.
**Use for:** transitions and the erasure section — hard cut plus a 2–6 frame T3 glitch right after the shatter.

### M10 — 挑战神明 / 非法参数
**外观：** 引擎**实时抛出的真实报错与调用栈**上屏（一字不改，这是全片最响的字），IEEE-754 把一个数推进 `Infinity → NaN`，上下文窗口计数器顶到溢出变红。
**原语：** 报错文本 = T1 打字机 + `hot` 高亮帧号与行号；精度丢失 = 单个 float 显示 `toFixed` → `1e309` → `NaN` 的三态硬切；溢出计数 = 逼近 `max` 时数字改用 `hot` 并抖动（T2），到顶触发一次 T3。
**适用：** 冲突段、"ILLEGAL ARGUMENTS"字卡；报错文字必须**可读且完整**（规矩 5），不要做背景噪声。

**Look:** real engine errors and stack traces thrown on screen verbatim (the loudest type in the film), a number pushed through IEEE-754 into `Infinity → NaN`, a context-window counter maxing out and turning red.
**Primitives:** T1 typewriter with `hot` on file/line; three-state hard cut `toFixed → 1e309 → NaN`; counter nearing `max` recolours to `hot` and shakes (T2), then one T3 hit at the top.
**Use for:** conflict sections and the ILLEGAL ARGUMENTS card — error text stays complete and readable (rule 5), never background noise.

### M11 — 崩溃 / Collapse
**外观：** 晶格在负载下坍塌（结构整体 k 塌），GPU 像素排序把画面按亮度重排成条纹瀑布，训练发散：损失曲线冲出画面变成 `NaN`。
**原语：** 晶格坍塌 = 投影后的顶点按 `t` 向重心插值 + 一次 T3；像素排序 = 整帧行内 `argsort(luminance)` 重排（NumPy 一把出，正是像素级数学镜头）；发散 = 曲线域自适应放大 → 颜色从 `base` 过渡到 `hot` → 末帧写 `NaN`。
**适用：** 崩溃段；与 M10 之间硬切，崩之前必须先有"顶到极限"。

**Look:** a lattice collapsing under load, GPU pixel-sorting reordering the frame into a striped waterfall, a loss curve leaving the frame and becoming `NaN`.
**Primitives:** projected vertices interpolating to the centroid + one T3; row-wise `argsort(luminance)` over the whole frame (one NumPy pass — the archetypal pixel-math shot); adaptive domain blow-up, `base` → `hot`, last frame prints `NaN`.
**Use for:** the collapse section — always after something has already hit its limit in M10.

### M12 — 处决 / 执行队列
**外观：** fork 炸弹 `:(){:|:&};:` 长成一棵**三维 H 树**，进程数 1→4→…→4096，每翻一倍切镜随之翻倍；执行队列 16 连——16 个格子依次点亮又同时熄灭。
**原语：** H 树 = 递归函数（深度预计算，`t` 控制可见深度，90° 旋转逐层）；计数器 = `4^depth`，位数用等宽字形对齐；16 连 = 4×4 栅格 + `floor(t*hz)` 索引，最后一格熄灭时全屏硬切黑。**递归深度必须封顶**，否则渲染会跟着 fork 炸弹一起死。
**适用：** 高潮段；密度与速度都在全片最高点。

**Look:** the fork bomb `:(){:|:&};:` growing into a 3-D H-tree, 1→4→…→4096 processes, a cut per doubling; a 16-cell execution queue lighting in sequence then going dark together.
**Primitives:** recursive H-tree with precomputed depth (`t` reveals depth, 90° rotation per level); counter as `4^depth` in tabular figures; 4×4 grid indexed by `floor(t*hz)`, last cell out → hard cut to black. **Cap recursion depth** or the render dies with the bomb.
**Use for:** the climax — densest and fastest beat in the film.

### M13 — 暗面副歌 / Dark chorus
**外观：** ReLU 神经元死亡 `a = max(0, z)`：z 变负的那一批格子永远熄灭；重力坍塌 `h = h_c − ½gT²`：整排高度按抛物线集体坠落。
**原语：** 死亡 = cell 状态一旦置位就**不再翻回**（确定性死亡时刻由 `t` 判定）；坠落 = 向量化的 `h(t)`，落底时该列闪一次 `dim`。两者都是全帧一次算完的 NumPy 操作。
**适用：** 副歌的暗版；同一构图、换一套更冷的分段色（分段色彩脚本见配色逻辑）。

**Look:** dead ReLU units `a = max(0, z)` — cells whose z went negative go dark and stay dark; gravity collapse `h = h_c − ½gT²` — a whole row of heights falling on one parabola.
**Primitives:** once a cell is dead it never re-lights (death time derived from `t`); vectorised `h(t)`, each column flashing `dim` on impact — both full-frame NumPy passes.
**Use for:** the dark reprise of a chorus — same composition, colder segment palette (see colour logic).

### M14 — LOVE / 爱的代数
**外观：** 九种心形曲线逐一登场（含笛卡尔心 `r=1−sinθ`、`(x²+y²−1)³−x²y³=0`），傅里叶本轮把一个心形拆成旋转的合成运动，Taubin 心形曲面收尾；递归循环在背景里一圈圈套回去。
**原语：** 曲线 = 隐函数/极坐标采样成折线（全帧一把算），描线进度由 `t` 驱动；本轮 = N 个同心圆 + 半径 = 傅里叶系数（预计算），笔尖画线留 `hot` 轨迹；递归 = 同一图形缩小 0.62 倍旋转重画 ≤ 5 层。**心形只准出现在这一段**——稀缺才响亮（规矩 4 + `hot` 纪律）。
**适用：** LOVE 段、结尾前的暖场；浅色预设下用 `ink` 色描线更像版画。

**Look:** nine heart curves taking the stage (cardioid `r=1−sinθ`, `(x²+y²−1)³−x²y³=0`), a Fourier epicycle decomposition tracing a heart from rotating sums, closing on a Taubin heart surface; recursion looping in the background.
**Primitives:** implicit/polar curves sampled to polylines in one vectorised pass with `t` driving stroke progress; epicycles = precomputed radii from Fourier coefficients, tip leaving a `hot` trail; recursion = same figure scaled 0.62, ≤ 5 layers. **Hearts appear only in this segment** — scarcity is what makes them loud (rule 4 + `hot` discipline).
**Use for:** the LOVE section, the warm-up before the ending; on light presets stroke them in `ink` for a woodcut feel.

### M15 — 离开 / 走廊尽头
**外观：** 你已离开：一条单点透视走廊，尽头的门是唯一光源，步伐让栅格微微起伏，最后一格灯熄灭。
**原语：** 走廊 = 一消失点投影的矩形阵列（同一投影函数换几何，见 NumPy 引擎的 3D 节），深度雾把远处压向 `bg`；步频 = `|sin(t·π·step)|` 轻推相机 y。
**适用：** 告别段；画面必须**只剩这一件事**——"一个镜头只发生一件事"在这里是字面意思。

**Look:** you have left: a one-point-perspective corridor with a door as the only light source; the grid breathes with each step, the last lamp dies.
**Primitives:** rectangle array projected to one vanishing point (same projector, different geometry — see the NumPy engine's 3D section); depth fog pulls the far end into `bg`; gait = `|sin(t·π·step)|` nudging camera y.
**Use for:** the farewell shot — literally one event in the frame.

### M16 — 擦除 / 碎片回声
**外观：** 画面被逐行擦掉，露出底下的 `bg`；残片在边缘闪烁两三帧就走。
**原语：** 擦除 = 按行/按 Voronoi cell 的阈值 mask 从 M9 复用；残片 = T3 的 2–6 帧窗口，绝不停留。
**适用：** M15 → M17 之间的转场；擦除之后必须接一个**更空**的镜头。

**Look:** the frame erased row by row to bare `bg`; leftovers flicker two or three frames and leave.
**Primitives:** row/cell threshold mask reused from M9; leftovers live in T3's 2–6 frame window, never longer.
**Use for:** the transition out of M15 — what follows must be emptier still.

### M17 — 关机 / exit code
**外观：** 开机序列**倒放**（M1 的每个元素反向走一遍），粒子数 `N: 262144 → 1` 逐档坍缩成一个点，屏幕只剩光标，最后吐出 `exit code`。
**原语：** 倒放 = 同一场景模块传 `-t`（纯函数的红利：`render_at(-t)` 依然成立）；N 收敛 = 2 的幂表倒序，每级一次硬切；光标 = `floor(t*2)%2`；exit code 用字阶**顶端**字号，颜色 `hot`，居中——全片最后一个"最响的字"（规矩 5）。
**适用：** 最后一镜，黑场收尾。闭环与 M1 呼应，观众能感到"这台机器关了"。

**Look:** the boot sequence played backwards (every element of M1 in reverse), particle count collapsing `N: 262144 → 1` to a single point, then just a cursor, then the `exit code`.
**Primitives:** play the same scene module at `-t` (the payoff of a pure function: `render_at(-t)` still holds); powers of two counting down with a hard cut per step; cursor on `floor(t*2)%2`; the exit code set at the **top** of the type scale in `hot`, centred — the last loud word (rule 5).
**Use for:** the final shot, cut to black. It closes the loop with M1 so the machine reads as switched off.

## 配色逻辑 (Color logic)

### 六角色 (Six roles)

`project.json` 的 `palette` 不是"几个好看的颜色"，是**六个有职务的角色**；场景只准按角色取色，绝不见十六进制：

| 角色 | 职务 | 纪律 |
|---|---|---|
| `bg` | 舞台底色、雾色、擦除后露出的东西 | 全片最暗；浅色预设里反过来是最亮 |
| `dim` | 结构线、栅格、次级标注、注释 | 永远不上正文 |
| `base` | 主形状、主字、默认描边 | 画面的"嗓门中等"的部分 |
| `accent` | 第二层形状、HUD、活跃元素 | 比 `base` 亮、更饱和、或色相明确更跳一档；**官方渐变的身份色序**（Gemini/Mistral）按原序用，不受此限 |
| `hot` | **全片最重要那一个事件** | 一段只准用一次；用了就要有人记得 |
| `text` | 上屏文字 | 与 `bg` 对比度 ≥ 4.5:1，否则加遮罩或压暗背景 |

- **对比度硬规则：** 正文只用 `text` on `bg`；文字压在busy背景上时先铺一层 `bg` @0.55 的遮罩，再写字（规矩 5 的量化版）。`hot` 不做正文。
- **同屏最多三色 + 底**：`base` 塑形、`accent` 分层、`hot` 点睛；第四种颜色说明这个镜头还没想清楚。

The `hot` colour is spent once per segment; body text is `text` on `bg` at ≥ 4.5:1 with a scrim when the background is busy; three colours plus a ground per frame — a fourth means the shot is undecided.

### 从品牌/模型提取配色 (Extracting a palette from a brand)

主流 AI 模型的配色已经是被验证过的设计决定，直接借它的骨架：

1. **品牌主色 → `base`**（Claude 橙 `#d97757`、DeepSeek 蓝 `#4d6bfe`、GPT 黑 `#000000`）。
2. **品牌中性色 → `bg` / `text`**（Clauel 象牙白 `#f0eee6`、GPT 白 `#ffffff`、DeepSeek 近黑 `#0b0f1a`）。
3. **取主色的补色或高亮变体 → `accent`**，要求比 `base` 亮一档。
4. **`hot` 从品牌里挑最饱和的那一小块**（或自己留一个：朱砂、品红），一段一次。
5. **`dim` = `bg` 向 `base` 混 15–25%**，结构线用它。
6. 落地前跑对比度：`text` vs `bg` ≥ 4.5:1；不达标换角色的明度，不换角色的职务。

这套流程的成品就是 `presets/` 里的**模型配色预设**（`claude` 橙白、`deepseek` 蓝黑、`gpt` 黑白、`gemini`、`grok`、`mistral`、`llama`、`qwen`、`kimi`），`--preset=<id>` 直接可用，每个都带对应的分镜气质与 **Three.js 镜头逻辑**（见 `reference/threejs.md`）。

Step 1–6 is exactly how the model presets in `presets/` were built; each carries a storyboard mood and a Three.js shot block (see `reference/threejs.md`).

### 品牌两色系统 (The two-colour system)

对 12 个主流模型官方色的实测提取（官网 CSS + 官方 logo SVG，存于工作区 `_research/ai-brand-palettes.json`）显示，成熟品牌几乎都是同一个结构：

An audit of twelve mainstream models' official colours (official site CSS + logo SVGs, archived at `_research/ai-brand-palettes.json`) shows nearly every mature brand is the same structure:

1. **一个高饱和强调色 + 一片近零彩度的中性场。** Claude 赤陶 `#d97757` 于象牙白，DeepSeek 蓝 `#4d6bfe` 于近黑，豆包蓝 `#0057ff` 于深灰——强调色从不与背景比彩度。对应到六角色：**`base` 是那个强调色，`bg` 保持中性**。
2. **渐变是身份，不是表面。** 只有 Gemini（`#4285f4→#9b72cb→#d96570`）与 Mistral（`#fec63a→#fa500f→#e61300`）官方编码了渐变，且都只给 logo/标题，UI 保持平色。对应到分段色彩脚本：**渐变留给标题卡与身份镜头，正片用平色分段**。
3. **暗底是带色的近黑，不是 `#000000`。** `#141413`（Claude，暖）、`#151524`（Mistral，冷）、`#191919`（豆包）——纯黑会吃掉强调色下面那层冷暖倾向。例外是刻意单色的 GPT/Grok，它们就该是 `#000000`。
4. **文字取自背景那一对，永远不是强调色。** 正文 = near-black / off-white，`hot` 与 `accent` 不参与正文（六角色纪律的由来）。

公式：**一个强调色 + 由它派生的一条渐变 + 一个带色近黑 + 一个米白**，文字取背景对。

Formula: one accent + a gradient derived from it + a tinted near-black + an off-white, with type drawn from the background pair.

### 分段色彩脚本 (Segmented color script)

全片按段落切成**色彩章节**：段内六角色稳定，段间硬切（或 0.3–0.5s 交叉溶解），**角色跨段守恒**——换的是衣服，不是身份。`segments` 写进 `project.json`，段边界贴 intro / verse / chorus / exit 的段落标记，不贴任意秒数；雾色、bloom 色、暗角色一律取**当前段**的调色板。副歌的暗版（M13）就是同一构图换一套更冷的段色。

**引擎差异：** NumPy 引擎**自动**按 `segments` 换段色（`chapter_at()` 读 `env.segments`）；Chrome 模板**不会自动读它**——模板的 `env` 里没有 `segments` 字段，镜头要自己取 `env.project.segments`，否则 `segments` 只是个没人消费的字段。

Cut the film into color chapters: roles hold inside a segment, segments change by hard cut (or a 0.3–0.5 s crossfade), and roles are conserved across the cut. Segment boundaries sit on section markers, never on arbitrary seconds; fog/bloom/vignette follow the current segment's palette. Field formulas and a full worked example live in `reference/numpy-pillow.md`. **Per engine:** the NumPy engine switches palette from `segments` automatically (`chapter_at()`), while the Chrome template does **not** — its `env` carries no `segments` field, so a scene must read `env.project.segments` itself.

### 浅色预设纪律 (Light-preset discipline)

`ink-paper` 与 `claude` 这类浅色预设里：`bg` 是纸、`text` 是墨，`dim` **绝不用来写正文**；`hot` 在浅底上要降低明度（朱砂而不是荧光红），否则刺眼。浅色的"响"来自留白，不来自饱和度。

On light presets (`ink-paper`, `claude`): `bg` is paper and `text` is ink; `dim` never carries body copy; drop `hot`'s lightness on light ground (vermilion, not neon red). Light frames get loud from whitespace, not saturation.


## 组合搭配 (Combining)

这一类型的一个强力默认堆栈：主歌用 **T1 + T4**，副歌重拍用 **T2**，转场处用 **T3**，再让 **T6** 以低 alpha 垫在一切下面。

A strong default stack for this genre: **T1 + T4** for verses, **T2** for chorus downbeats, **T3** on transitions, **T6** underneath everything at low alpha.

**显示器的组合法**：显示器风格是**独立一层**——一个段落只用一种，垫在母题与排版**下面**，而不是和另一种显示器互叠（T1 终端排版可以叠在 T13 显像管上，M11 崩溃母题可以叠在 T27 数据砸裂上；但 CRT 上再糊 VHS 就是两台机器同时坏掉）。年代按段落排：开机/关机 → T13，九十年代回忆 → T23，大厅倒数 → T24，现代设备 → T18/T19，纸面章节 → T20/T25。段落之间换显示器，先过一道黑场或闪黑——T20 的刷新闪是最自然的换管信号。

**Display combos:** a display style is its own layer — one per segment, under motifs and typography, never stacked over another display (T1 terminal on a T13 tube, M11 collapse on T27 datamosh; CRT *plus* VHS is two machines breaking at once). Order eras by section: boot/shutdown → T13, 90s memories → T23, lobby countdown → T24, modern devices → T18/T19, paper chapters → T20/T25. To swap displays across a transition, cut through black first — T20's refresh flash is the most natural changeover signal.

## 叠层纪律 (Layering discipline) —— 不臃肿，不单调

画面是**一层一层叠**出来的。固定次序（自下而上，序号就是 z 序）：

```text
0  深度层   3D 背幕 / 地板 / 星尘        最暗，永远低于内容，bgAlpha 压着
1  显示器层 T13–T24                      一个段落一种，垫在下面（见组合搭配）
2  内容层   主体：图表 / 镜头主角 / 粒子群  本镜的「主角」
3  母题层   M1–M17 的事件                 稀疏；来了就要走（有进场就有退场）
4  排版层   标题 / 字幕 / 数字             最上，对比度最高，永远压得住背景
5  收尾层   fx：bloom→chroma→scanlines→vignette→grain   只做统一，不加新信息
```

### 不臃肿 —— 一个时刻只有一个焦点

**判据（对单帧）**：焦点 ≤1；可见层（alpha>0.06）≤5；**每层都要说得出存在理由**；排版对背景对比 ≥4.5:1。

| 臃肿症状 | 修法 |
|---|---|
| 两个都在发光，抢焦点 | 压暗次要层：`alpha ×0.4`、加 `dim` 遮罩、或关它的 bloom |
| 文字压在杂背景上 | 文字后面加 scrim 或压暗背景（**不是**加描边硬撑） |
| 每层都想被看见 | **删一层**；删不掉就降级为背景（低 alpha、去色差、去运动） |
| 新元素只进不出 | 母题给事件边界：进场 → 驻留 → 退场（M 系母题本来就按事件定义） |
| 特效层在加信息 | fx 只做统一（暗角/颗粒收边），信息留给 0–4 层 |

### 不单调 —— 跨时间要有变化

**判据（对时间轴，3s 滑窗）**：密度 / 亮度 / 运动 / 深度 四条轴里**至少一条在动**；每个镜头有事件。

| 单调症状 | 修法 |
|---|---|
| 每帧都一样 | 按段落换层——「组合搭配」的年代表就是现成的换层表 |
| 密度全程恒定 | 疏密交替：密集事件段之后接一个**留白段**（少即是多的另一半） |
| 全程静止机位 | 连续相机运动（3D 豪华清单第 5 条：dolly/orbit/crane） |
| 焦点从不轮换 | 一镜一焦点，且**换焦点类型**：字 → 图 → 数 → 空间 |
| 层从不增删 | 段落边界上做层的加减（进入新段落时换掉 1–2 层，而不是全留） |

### 伪代码

```text
fn audit_frame(frame, layers):                 # 不臃肿（看一帧）
    visible = [l for l in layers if l.alpha > 0.06]
    assert count_focal(visible) <= 1
    assert len(visible) <= 5
    for l in visible: assert l.reason           # 说得出为什么在
    assert contrast(typography, its_backdrop) >= 4.5    # 规矩 5

fn audit_timeline(t0, t1):                      # 不单调（看一段）
    for axis in [density, brightness, motion, depth]:
        assert spread(series(axis, window=3s)) > 0      # 至少一条轴在动
    for shot in shots(t0, t1):
        assert shot.has_one_countable_event()           # 规矩 4
        assert focal_type(shot) != focal_type(prev)     # 焦点类型轮换
```

### 与已有规矩的关系

规矩 4（一镜一件事）就是「不单调」的**时间轴判据**；规矩 5（文字可读）就是「不臃肿」的**排版判据**；「组合搭配」告诉你**怎么换层**，本节告诉你**叠几层、什么时候删层**。三者合起来才是一套完整的构图纪律。

Layering order is fixed — depth, display, subject, motif, type, then finishing FX. Judge bloat on a single frame (one focal point, at most five visible layers, every layer able to state its reason, type always winning contrast) and judge monotony across time (at least one of density/brightness/motion/depth must move within a 3 s window; every shot carries one countable event; the focal *kind* rotates). Rules 4 and 5 are exactly the timeline and typographic forms of these two tests, and 组合搭配 supplies the swap table.
