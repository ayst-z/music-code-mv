# 渲染技术 (Rendering techniques)

## 页面契约 (The page contract)

宿主页面必须恰好向渲染器暴露下面这些东西：

The host page must expose exactly this to the renderer:

```js
window.__MV__ = { width, height, fps, duration };
window.renderAt = (t) => { /* draw the frame at virtual time t (seconds) */ };
window.__ready = true;               // set after the first successful draw
window.MV.shotAt = (t) => 'verse-1'; // optional: label frames in contact sheets
```

`renderAt` 必须**同步且幂等**：同一个 `t` → 同样的像素，永远如此，顺序也无所谓。渲染器可能乱序调用它，也可能调用两次。

`renderAt` must be **synchronous and idempotent**: same `t` → same pixels, always, in any order. The renderer may call it out of order or twice.

## 局部时间与全局时间 (Local time vs global time)

场景的 `draw` 拿到的是**它自己的局部时间**（在镜头 `start` 处为 0），所以一个镜头可以被挪位置而不用重写它。任何跨越镜头的东西——歌词、节拍网格、反复出现的动机——都必须读 `env.t`，也就是时间轴在每个场景绘制之前设定的全局时间轴时间。

搞错了也不会报错：场景照常渲染、照常画背景，只是永远找不到对应的歌词行，于是这个镜头看起来就像一张空背景。如果一个文字镜头什么都没渲染出来，先查这里。

A scene's `draw` receives **its own local time** (0 at the shot's `start`), so a shot can be moved without rewriting it. Anything that spans shots — lyrics, beat grid, a recurring motif — must read `env.t`, the global timeline time the timeline sets before each scene draws.

Getting this wrong is silent: the scene renders, draws its background, and simply never finds a lyric line, so the shot looks like an empty background. If a text shot renders nothing, check this first.

## 确定性 (Determinism)

- 时间只来自 `t` 这个参数。
- 随机数只来自带种子的 PRNG（模板里是 `mulberry32`），每个镜头重新播种，这样新增后面的镜头永远不会改动前面的镜头。
- 昂贵的几何在加载时预计算一次，而不是每帧算。
- `renderAt` 内部不要有 `await`。字体／资源要在设置 `__ready` 之前加载完。

正是确定性让帧缓存成立，也让你能把一支 3 分钟的视频分成几次跑完。

- Time comes only from the `t` argument.
- Randomness comes only from a seeded PRNG (`mulberry32` in the template), re-seeded per shot so adding a later shot never changes an earlier one.
- Precompute expensive geometry once at load, not per frame.
- No `await` inside `renderAt`. Load fonts/assets before setting `__ready`.

Determinism is what makes frame caching valid and lets you render a 3-minute video in chunks across several runs.

## 静态服务 (Serving)

ES module 和 `importmap` 在 `file://` 下**不工作**。`render.mjs` 会在一个随机回环端口上起一个一次性静态 HTTP 服务，并把 Chrome 指过去。让这个服务始终服务于*项目*目录，这样 `/node_modules/...` 才解析得到。

ES modules and `importmap` do **not** work from `file://`. `render.mjs` starts a throwaway static HTTP server on a random loopback port and points Chrome at it. Keep that server serving the *project* directory so `/node_modules/...` resolves.

## 无头 Chrome (Headless Chrome)

要紧的 flag：

Flags that matter:

```
--no-sandbox --disable-setuid-sandbox
--enable-unsafe-swiftshader         # required on Chrome 128+ for software WebGL
--use-gl=angle --use-angle=swiftshader
--hide-scrollbars --mute-audio
--disable-background-timer-throttling --disable-renderer-backgrounding
--disable-backgrounding-occluded-windows
--force-device-scale-factor=1
```

用 `puppeteer-core`（不下载自带的 Chromium），通过 `executablePath` 指向系统 Chrome。视口设成精确的 `width×height` 且 `deviceScaleFactor: 1`，并让 `<body>` 零边距，这样整页截图就等于一帧。

Canvas2D 也可以完全跳过 Chrome 用 `node-canvas`，但 Chrome 里的 Canvas2D 已经够快，还给你真正的字体排版和 CSS。优先用 Chrome。

Use `puppeteer-core` (no bundled Chromium download) and point it at the system Chrome via `executablePath`. Set the viewport to exactly `width×height` with `deviceScaleFactor: 1`, and make `<body>` zero-margin so a full-page screenshot equals the frame.

For Canvas2D you can skip Chrome entirely with `node-canvas`, but Canvas2D-in-Chrome is already fast and gives you real font shaping and CSS. Prefer Chrome.

## 截帧 (Capture)

- Canvas2D：`page.screenshot()` 就够了。
- WebGL：构造渲染器时带上 `preserveDrawingBuffer: true`，否则缓冲区可能在截图前被清空，你会拿到黑帧或旧帧。
- 渲染器上 `setPixelRatio(1)`；视口已经决定了输出分辨率，设备像素比大于 1 会把成本悄悄乘以 4。
- 元素级截图（`elementHandle.screenshot`）比整页截图慢。用整页。

- Canvas2D: `page.screenshot()` is enough.
- WebGL: construct the renderer with `preserveDrawingBuffer: true`, otherwise the buffer may be cleared before the screenshot and you get black or stale frames.
- `setPixelRatio(1)` on the renderer; the viewport already defines output resolution, and a device pixel ratio above 1 silently multiplies cost by 4.
- Element screenshots (`elementHandle.screenshot`) are slower than full-page ones. Use full page.

## 编码 (Encoding)

```
ffmpeg -y -framerate <fps> -i frames/f%04d.png \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -vf scale=trunc(iw/2)*2:trunc(ih/2)*2 -movflags +faststart out.mp4
```

- `yuv420p` + 偶数尺寸 = 到处都能播。宽或高为奇数会静默失败。
- 对合成图形来说 `crf 17–18` 视觉上已无损；`+faststart` 让它可以流式播放。
- 封装音频时加 `-c:a aac -b:a 192k -shortest`，音频作为第二个输入，并加 `-c:v copy`。

- `yuv420p` + even dimensions = plays everywhere. Odd width/height silently fails.
- `crf 17–18` is visually lossless for synthetic graphics; `+faststart` makes it stream.
- Add `-c:a aac -b:a 192k -shortest` when muxing audio, with the audio as the second input and `-c:v copy`.

## 字体 (Fonts)

只用系统字体族（`ui-monospace, "Cascadia Mono", Consolas, monospace`）。走网络的 webfont `@font-face` 既破坏确定性又拖慢速度；实在要用，就把字体作为本地文件内嵌，并在 `__ready` 之前 `await document.fonts.ready`。

Use system families only (`ui-monospace, "Cascadia Mono", Consolas, monospace`). Webfont `@font-face` over the network is a determinism and speed hazard; if you must, embed the font as a local file and `await document.fonts.ready` before `__ready`.

## 逐场景 FX (Per-scene FX)

收尾通道（色差、扫描线、bloom、暗角、颗粒）在高分辨率下是整帧最贵的部分。`project.json` 在 `fx` 下设定基线；任何场景都可以通过声明自己的 `fx` 对象来覆盖，它会合并到基线之上：

The finishing pass (chroma, scanlines, bloom, vignette, grain) is the most expensive part of a frame at high resolution. `project.json` sets the baseline under `fx`; any scene can override it by declaring its own `fx` object, which is merged over the baseline:

```js
export default {
  id: 'ui-shot',
  start: 10, end: 20,
  fx: { bloom: false, chroma: false, grain: false },  // flat UI needs none of it
  draw(stage, t, env, p) { /* ... */ }
};
```

把全套特效留给那些讲光与气氛的镜头；UI、图表和排版通常不加 bloom 更好看，而且渲染快好几倍。

Reserve the full stack for shots that are about light and atmosphere; UI, diagrams and typography usually read better without bloom, and render several times faster.

## 提速 (Speed)

按杠杆大小排序：

1. 分辨率——成本与像素数成线性。草稿用 480×270。
2. 渲染器——全屏 `ctx.filter = 'blur(...)'` 或 WebGL 后期链通常是瓶颈；换成便宜的缓存辉光。
3. 逐像素循环——绝不要每帧 `getImageData`/`putImageData`；一次性预计算到离屏 canvas。
4. 绘制调用——把粒子的 `fillRect` 批量起来；避免 `arc` 和逐粒子的 `save/restore`。
5. Bloom——UnrealBloomPass 的 strength 保持在 1.0 附近；软件渲染器过曝很快。

Ordered by leverage:

1. Resolution — cost is linear in pixels. Draft at 480×270.
2. Renderer — a full-screen `ctx.filter = 'blur(...)'` or a WebGL post chain is the usual bottleneck; replace with a cheap cached glow.
3. Per-pixel loops — never `getImageData`/`putImageData` per frame; precompute to an offscreen canvas once.
4. Draw calls — batch particle `fillRect` calls; avoid `arc` and per-particle `save/restore`.
5. Bloom — keep UnrealBloomPass strength near 1.0; software renderers blow out fast.

## 帧缓存与续渲 (Frame cache and resume)

帧写成 `frames/f0000.png`。渲染之前，只要某个帧文件已经存在就跳过，除非加了 `--force`。这让长渲染可以断点续跑，也让半成品渲染可以用 `--contact` 检查。

Frames are written as `frames/f0000.png`. Before rendering, skip any frame whose file already exists unless `--force`. This makes long renders resumable and lets a partial render be inspected with `--contact`.
