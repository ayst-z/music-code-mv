# Three.js 镜头 (Three.js shots)

只有当一个镜头真的需要 3D——光照、材质、深度、实例化——才用 Three.js。线框或透视网格用手写 Canvas2D 投影更快，而且零依赖。

Use Three.js only when a shot needs real 3D — lighting, materials, depth, instancing. For a wireframe or a perspective grid, manual Canvas2D projection is faster and has no dependency.

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

## 成本 (Cost)

全屏 WebGL 后期链是这条流水线里最贵的东西：在 SwiftShader 下 960×540 大约 150–400 ms/帧，而 Canvas2D 只要 10–40 ms。据此做预算，本质上是 2D 排版的镜头优先用 Canvas2D。

A full-screen WebGL post chain is the most expensive thing in this pipeline: expect ~150–400 ms/frame at 960×540 under SwiftShader, versus 10–40 ms for Canvas2D. Budget accordingly, and prefer Canvas2D for shots that are fundamentally 2D typography.
