# Three.js 镜头 (Three.js shots)

## 3D 优先策略 (3D priority ladder)

**默认不用 3D；要用就按梯子一级级往上爬，每级都有明确的升级理由。** 决策看"画面需要什么"，不看"什么技术酷"：

1. **2D 数学（首选 / first）** — SDF / 场 / 隐函数：一个向量表达式出全帧，NumPy 或 Canvas2D 都行。包络、干涉、心形、贝塞尔全部停在这一级。
2. **手写透视投影（默认的"3D" / the everyday 3D）** — 需要深度、透视、绕转：`x' = x·f/z` + 画家算法（T5/T11），Canvas2D 或 NumPy 批量投影。线框、走廊、H 树、晶格、等距世界全够用；**比 Three.js 快一个量级、零依赖、天然确定性**。
3. **Three.js（升级门槛 / escalate only when）** — 只有当镜头必须付出下面至少一项才升级：**光照/材质**（PBR、透明折射）、**实例化**（上万重复体且要深度排序）、**后处理链**（UnrealBloomPass 级辉光/景深）、**模型资产**（glTF）。缺任何一项，退回第 2 级。

**预算与红线：** SwiftShader 下 WebGL 后期链 960×540 ≈ 150–400 ms/帧，Canvas2D 手写 10–40 ms；NumPy 投影与 Canvas2D 同级。预设的 `three` 块（geometry/camera/post/roles）是"升级后怎么用这个配色说话"的说明书，见文末关联表。**一个镜头只用一种深度方案**——不要在 Three.js 场景里再手写第二套投影。

Default: no 3D. Climb the ladder deliberately — (1) 2D maths, (2) manual perspective projection for depth and orbits, (3) Three.js only when lighting/materials, instancing, a post-processing chain, or glTF assets are actually required. One depth solution per shot; the preset's `three` block then tells you how to speak with its palette.

## 宿主页面 (Host page)

`three` 通过 import map 从项目的 `node_modules` 解析：

`three` is resolved from the project's `node_modules` through an import map:

```html
<script type="importmap">
{ "imports": {
  "three": "/node_modules/three/build/three.module.js",
  "three/addons/": "/node_modules/three/examples/jsm/"
} }
</script>
```

`render.mjs` 里的静态服务以项目根目录为根，所以 `/node_modules/` 能解析。由 `init.mjs` 脚手架出来的项目会在项目旁边符号链接（或复制）依赖目录。

The static server in `render.mjs` serves the project root, so `/node_modules/` resolves. Projects scaffolded by `init.mjs` symlink (or copy) the dependency folder next to the project.

## 必需的渲染器设置 (Required renderer settings)

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);          // viewport defines resolution
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
```

`preserveDrawingBuffer` 是强制的，否则截图回来是黑的。

`preserveDrawingBuffer` is mandatory or screenshots come back black.

## 后期处理 (Post-processing)

`EffectComposer` + `RenderPass` + `UnrealBloomPass` 能便宜地拿到那种发光观感。再加一个最终的 `ShaderPass` 做扫描线、色差、暗角和颗粒——正是这一个 pass，让 WebGL 渲染读起来像是*被设计过的*，而不是 three.js 的默认 demo。

bloom 的 `strength` 保持在 1.0 附近、`threshold` 高于 0.1；软件渲染非常容易把高光打爆，而一张 bloom 过头的帧会丢掉全部结构。

```js
window.renderAt = (t) => {
  // everything below is a pure function of t
  knot.rotation.y = t * 0.55;
  camera.position.set(Math.cos(t * 0.38) * 4.3, 0.9 + Math.sin(t * 0.7) * 1.5, Math.sin(t * 0.38) * 4.3);
  camera.lookAt(0, 0, 0);
  glitch.uniforms.uTime.value = t;
  composer.render();
};
```

`EffectComposer` + `RenderPass` + `UnrealBloomPass` gives the glowing look cheaply. Add a final `ShaderPass` for scanlines, chromatic aberration, vignette and grain — that single pass is what makes a WebGL render read as *designed* rather than as a default three.js demo.

Keep bloom `strength` near 1.0 and `threshold` above 0.1; software rendering blows out highlights very easily, and an over-bloomed frame loses all structure.

## 3D 与文字排版混排 (Mixing 3D and typography)

WebGL 和文字在同一个 canvas 里不好合成。两个选择：

- **在 DOM 里分层：** 一个 `<canvas>` 放 WebGL，另一个绝对定位的 `<canvas>`（或 DOM 文字）放排版，两者都在同一个 `renderAt(t)` 里更新。做歌词 MV 通常这才是正确答案，而且文字保持锐利。
- **把文字渲染进纹理** —— 只有当文字必须被 3D 场景扭曲时才这么做。

WebGL and text do not compose well in one canvas. Two options:

- **Layer them in the DOM:** a `<canvas>` for WebGL and an absolutely-positioned `<canvas>` (or DOM text) for type, both updated inside the same `renderAt(t)`. This is usually the right answer for a lyric MV, and it keeps text crisp.
- **Render type into a texture** — only when the type must be distorted by the 3D scene.

## 预设 → Three.js 镜头逻辑 (Preset → Three.js shot logic)

每个预设都带一个 `three` 块；`init.mjs` 会把它原样写进 `project.json`，场景代码从 `env.project.three` 读。它不是限制，是**这个配色的 3D 该长什么样**的设计决定：

Every preset carries a `three` block. `init.mjs` copies it into `project.json` and scenes read it as `env.project.three`. It is not a restriction — it is the design decision "what does this palette's 3D look like":

```json
"three": {
  "geometry": "instanced-lattice",            // 几何家族 / geometry family
  "camera":   { "mode": "orbit", "radius": 4.3, "height": 0.9, "speed": 0.38 },
  "post":     { "bloom": 1.0, "threshold": 0.15, "chroma": false, "scanlines": false },
  "roles":    { "background": "bg", "fog": "bg", "wire": "base",
                "emissive": "accent", "flare": "hot", "label": "text" }
}
```

`roles` 把**六角色调色板接到 three.js 的材质槽**上——场景里永远按角色取色，于是换预设等于换整套 3D 语言，一行材质代码都不用改：

`roles` wires the **six-role palette into three.js material slots** — scenes always colour by role, so swapping presets swaps the whole 3D language without touching a material:

```js
const R = (env.project.three || {}).roles || {};
const col = (slot, fallback) => new THREE.Color(env.palette[R[slot] || fallback]);
scene.background = col('background', 'bg');
scene.fog = new THREE.FogExp2(col('fog', 'bg'), 0.085);
wire.material.color = col('wire', 'base');          // 线框
bloomPass.strength  = three.post?.bloom ?? 1.0;     // 后期跟预设走
// camera 轨道参数同理：mode/radius/height/speed 全部来自 three.camera
```

### 关联表 (The mapping)

| preset | 适配母题 / motif fit | geometry | camera | 后期与气质 / post & mood |
|---|---|---|---|---|
| `neon-rain` | M2 晶格巨构、M15 走廊 | instanced lattice / corridor | dolly-in + 轻微 roll | bloom 1.0，chroma 开；青为线、品红为光 |
| `ink-paper` | M3 Byrne 图版、M14 心形曲线 | line-art wireframe（无灯光） | 近正交慢推 | **无 bloom 无线色差**；扁平上色像版画 |
| `phosphor` | M1 正多面体、M1 PCB 走线 | wireframe solids | 慢速 orbit | 加法混合线条 + 最重扫描线 |
| `dusk-lofi` | M14 Taubin 心面、M4 双星旋近 | 软表面 mesh | 极慢 orbit | 暖色 emissive、柔 bloom、重颗粒 |
| `claude` | M3 定义、M14 九种心形 | 圆角线框 / 纸面格架 | 慢速 push-in | bloom ≤0.6、**关 chroma**；象牙底橙强调，像批注 |
| `deepseek` | M2 三旋臂星系、深空镜头 | 粒子星系 + 晶格 | 宽幅 orbit、深雾 | bloom 1.0，近黑底蓝自发光；理性、深 |
| `gpt` | M5 token/注意力、M11 像素排序 | 单色网格 + 注意力连线 | 线性 track | **零色差、最高对比**；黑白为骨、灰为层 |
| `gemini` | M4 波形、光谱 | 渐变 ribbon 曲面 | 扫过式弧线运镜 | 蓝→紫渐变材质，bloom 0.8 |
| `grok` | M10 报错、M11 崩溃 | 碎裂 slab / 像素排序 shader | 硬切 + 震动 | 单色高对比，glitch 是标点不是纹理 |
| `mistral` | M4 击穿电弧、六叶星芒 | 光束爆裂 / 射线簇 | 快速 orbit | 橙红渐变 emissive，bloom 1.0 |
| `llama` | M6 万物皆点的关系网 | 节点图 + 边 | 穿行 fly-through | 蓝色节点、暗底，边用 `dim` 分层 |
| `qwen` | M8 利萨茹、贝塞尔模态 | 利萨茹 ribbon / 模态面 | 稳定 orbit | 紫青双强调，`hot` 留给单点事件 |
| `kimi` | M15 走廊尽头、光标 | 极简走廊 | 慢速 dolly | 单一冷蓝强调，大留白 |

**用法：** 分镜排到某个母题需要真 3D 时，取**当前段预设**的 `three` 块填进场景；母题是 2D 能画的（M3、M9、M16）就别上 3D——线框与透视网格用手写投影更快，见开头的总原则。

**How to use:** when a beat's motif needs real 3D, take the `three` block of the *current segment's* preset. When a 2D primitive already draws the motif (M3, M9, M16), stay 2D — manual projection beats wireframe-in-Three.js, per the guiding principle at the top.

## 成本 (Cost)

全屏 WebGL 后期链是这条流水线里最贵的东西：在 SwiftShader 下 960×540 大约 150–400 ms/帧，而 Canvas2D 只要 10–40 ms。据此做预算，本质上是 2D 排版的镜头优先用 Canvas2D。

A full-screen WebGL post chain is the most expensive thing in this pipeline: expect ~150–400 ms/frame at 960×540 under SwiftShader, versus 10–40 ms for Canvas2D. Budget accordingly, and prefer Canvas2D for shots that are fundamentally 2D typography.
