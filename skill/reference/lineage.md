# 源流 —— 这种形式从哪来 (Lineage — where this form comes from)

“代码渲染视频”（代码渲染视频 / 纯代码渲染 MV）：画面是*源代码*，而代码由智能体来写。2026 年，当编码智能体强到能把整支动画装进脑子里时，它就流行开了。参考生态：

- **awesome-opus5-5-videos** — https://github.com/yihui-dev/awesome-opus5-5-videos
  约 475 支爆火的代码渲染视频及其背后的 prompt，按技术打标签（Canvas / SVG+GSAP / Three.js / GLSL / Web Audio）。偷 prompt 的最佳去处。
- **ClaudeAnimationBase** — https://github.com/JohnHeibel/ClaudeAnimationBase
  p5.js + p5.brush 手绘角色动画套件。重要的是它的工作流：*先分镜，逐镜头搭建，渲染联系表检查自己的活儿*。它的 `render.mjs` 能做联系表、帧条、裁切、静帧和 MP4。
- **lemo-opuscar** — https://github.com/lemomo-ai/lemo-opuscar
  约 40 种电影风格的库，每一种都是一个可复用的风格 prompt 加一部完全用代码做出来的短片——画面、音乐和混音全部由智能体写。这种“挑一种风格，带上你自己的故事”的结构，正是本 skill `styles.md` 所遵循的。
- **3dicon** — https://github.com/samyost1/3dicon
  一句话 → 循环的透明 3D 图标。管线思维：静帧、循环闭合、抠像、WebP。

"Code-rendered video" (代码渲染视频 / 纯代码渲染 MV): the visuals are *source code*, and the agent writes the code. It spread through 2026 as coding agents got good enough to hold a whole animation in their head. The reference ecosystem:

- **awesome-opus5-5-videos** — https://github.com/yihui-dev/awesome-opus5-5-videos
  ~475 viral code-rendered videos with the prompts behind them, tagged by technique (Canvas / SVG+GSAP / Three.js / GLSL / Web Audio). Best place to steal a prompt.
- **ClaudeAnimationBase** — https://github.com/JohnHeibel/ClaudeAnimationBase
  p5.js + p5.brush hand-drawn character animation kit. The workflow lesson is the important part: *storyboard first, build shot by shot, render contact sheets to check its own work*. Its `render.mjs` does contact sheets, frame strips, crops, stills and MP4.
- **lemo-opuscar** — https://github.com/lemomo-ai/lemo-opuscar
  A library of ~40 film styles, each a reusable style prompt plus a short film made entirely in code — picture, music and mix all written by the agent. The "pick a style, bring your own story" structure is what this skill's `styles.md` follows.
- **3dicon** — https://github.com/samyost1/3dicon
  One-line → looping transparent 3D icon. Pipeline thinking: still frame, loop closure, matting, WebP.

## 这个领域的共识 (What the field converges on)

1. **先分镜，后代码。** 做分镜的智能体产出的是连贯的影片；直接开写的智能体产出的是循环片段。
2. **靠渲染做自检。** 联系表、帧条、静帧——智能体必须*亲眼看*。
3. **确定性虚拟时间。** 为了可续跑和质量，`renderAt(t)` 胜过 rAF 循环。
4. **不依赖外部素材。** 一切由图形基元画出来，所以没有东西要去下载、去授权、去弄丢。
5. **联系表是迭代的最小单位。** 便宜到每次改完都能跑一遍。

1. **Storyboard before code.** Agents that storyboard produce coherent films; agents that start coding produce loops.
2. **Self-review by rendering.** Contact sheets, frame strips, stills — the agent must *look*.
3. **Deterministic virtual time.** `renderAt(t)` beats a rAF loop for resumability and quality.
4. **No external assets.** Everything drawn from primitives, so there is nothing to fetch, license or lose.
5. **Contact sheet as the unit of iteration.** Cheap enough to run after every change.

## 诚实的局限 (Honest limits)

软件渲染的 WebGL 很慢；厚重的水彩／笔触模拟可能每帧要花好几秒。音频通常是短板——用 Web Audio 的 `OfflineAudioContext` 做代码生成音乐是可能的，但一首真正有授权的曲子几乎总是更好。而且这种观感是*图形化*的：这条流水线在排版、几何、数据和光上面非常强，但并不适合写实的人。

Software-rendered WebGL is slow; heavy watercolour/brush simulation can take seconds per frame. Audio is the usual weak point — code-generated music is possible with Web Audio's `OfflineAudioContext` but a real licensed track is almost always better. And the look is *graphic*: this pipeline is superb at typography, geometry, data and light; it is a poor fit for photoreal humans.
