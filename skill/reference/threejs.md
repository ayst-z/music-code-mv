# Three.js 镜头 (Three.js shots)

## 3D 优先策略 (3D priority ladder)

**默认往 3D 画，场面要豪华。** 判断标准已经翻转：不再是「这一镜有没有理由升级到 3D」，而是「**这一镜有什么理由不用 3D**」。纯排版、纯数据、色卡巡游这类镜头才留在 2D——因为那里 3D 只会把字压花；其余一律上 3D。

从高往低退，每退一级都要说出理由（写下它，写不出就别退）：

1. **Three.js 场面（默认首选 / default first）** —— 要「豪华」就从这里起步：粒子群、发光体、反射地面、体积雾、景深、连续相机运动。光照/材质/实例化/后处理链是它的主场，`InstancedMesh` 让上万个重复体照样跑得动。
2. **手写透视投影（轻量 3D / lighter 3D）** —— 单机位、元素少、要绝对确定性，或要和 Canvas2D 分层混排时用：`x' = x·f/z` + 画家算法（T5/T11），线框、走廊、晶格、等距世界在这一级完成。零依赖、天然确定性、比 Three.js 快一个量级。
3. **2D 数学（按需例外 / by exception）** —— 只有纯排版与纯数据镜头留在这一级：字卡、色卡巡游、分栏对比、终端特写。SDF / 场 / 隐函数在这里是排版工具，不是偷懒。

**一个镜头只用一种深度方案**——不要在 Three.js 场景里再手写第二套投影，那会露出两个灭点。

### 豪华场面清单 (The luxury checklist)

一个 3D 镜头做到「豪华」，至少命中下面六条（按性价比排序）：

| # | 手段 | 为什么它显贵 |
|---|---|---|
| 1 | **至少三层深度**：前景遮挡体 → 中景主体 → 背景星尘/雾 | 空气透视立刻给画面厚度；只有一层就永远像贴图 |
| 2 | **数量感**：`InstancedMesh` 或 `Points` 上千上万的重复体，种子 PRNG 分布 | 密度是「贵」的最直接信号；几百个点看着像 demo |
| 3 | **发光与辉光**：emissive 材质 + `UnrealBloomPass`（threshold ≈ 0.6–0.85，strength ≈ 0.8–1.2） | 让光有体积；**红线：strength > 1.5 必过曝，白成一片反而廉价** |
| 4 | **能反光的地面或一束扫过的光带** | 一次高光扫过 = 一整块画面被点亮，性价比最高的一招 |
| 5 | **连续相机运动**：dolly + orbit 或 crane 组合，至少一条贯穿镜头的路径 | 静止机位是 3D 最大的破功；运动让深度被感知 |
| 6 | **收束事件**：每镜一个可数的事件（点亮 / 翻转 / 坍缩 / 扫过 / 熄灭） | 没有事件的镜头是 bug（规矩 4），豪华不等于糊一团 |

再往上是加分项：玻璃/金属二选一的高光材质、`fog` 做的体积感、post 链的 chroma 轻微错位、暗角与颗粒收边。

### 预算怎么花 (Paying for it)

3D 变默认之后，成本问题从「要不要」变成「**怎么排期**」：

- **草稿分辨率迭代**：`--contact --w=480 --h=270`，每张联系表几秒钟；别用 4K 调构图。
- **交付只跑一遍**：4K/120fps 放到最后一次性渲染，用 `--workers=8~12`。实测参考：9120 帧 4K120（全 FX）10 workers 367s ≈ 26 fps 吞吐。
- **分段开关 fx**：`project.json` 里 `fx` 是基线，场景可以用自己的 `fx` 字段覆盖——排版镜头关掉 bloom/色差，3D 镜头再全开。
- **后处理链按段给**：全链只给主镜头；过渡段与字卡段降级。
- **复用几何与材质**：同一份 `BufferGeometry` 喂多个 mesh，别每帧 new。
- 真跑不动时，**先降到第 2 级手写投影，再考虑砍构图**——别一上来就删掉深度层。

`gl=auto` 检出空帧会自动回退软渲；`--gl=soft` 强制 SwiftShader。硬件 GL 与编码器的真实能力见 `probe.mjs` 的三行报告（能力门 / 实际显卡 / 编码器实测）。

Default now is **3D, and luxurious**: the question flipped from "does this shot justify 3D" to "what reason does this shot have to *avoid* 3D" — only pure typography and pure-data shots stay in 2D, because 3D would smear the type. Start from Three.js, step down to manual projection only with a written reason, and keep 2D as the exception. Hit at least six items from the luxury checklist — three depth layers, thousands of instanced elements, controlled bloom (strength above ~1.5 blows out and looks cheap), a reflective floor or a sweeping light band, continuous camera movement, and one countable event per shot. Cost is now a scheduling problem: iterate at draft resolution, run 4K once with `--workers=8~12`, and toggle the `fx` chain per shot instead of globally. One depth solution per shot.

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

3D 是默认之后，成本不再是「做不做」的理由，而是**排期问题**：SwiftShader 下 WebGL 后期链 960×540 约 150–400 ms/帧，Canvas2D 手写 10–40 ms——所以草稿阶段一律 `--contact --w=480 --h=270`，交付 4K 只跑一遍并用 `--workers=8~12`（实测 9120 帧 4K120 全 FX：10 workers 367s，约 26 fps）。纯排版镜头用各自的 `fx` 关掉 bloom/色差，把预算留给主 3D 镜头。

Now that 3D is the default, cost is a scheduling question rather than a blocker: expect ~150–400 ms/frame for a full WebGL post chain at 960×540 under SwiftShader versus 10–40 ms for Canvas2D. Iterate at draft resolution, run the 4K delivery pass once with `--workers=8~12`, and turn bloom/chroma off on typography shots so the budget goes to the hero 3D shots.
