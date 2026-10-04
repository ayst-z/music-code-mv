# 创作对接指南 (Authoring — from an empty folder to an MP4)

这份指南把「从零创作一支 MV」的整条链路写成可以照抄的命令序列。**每一条命令都在本工作区实跑过**（2026-10-02，Windows / PowerShell，Node v24.19.0，Python 3.14.7，ffmpeg-static），文中的输出就是真实输出。命令默认从工作区根目录 `<workspace>` 执行，脚本相对路径是 `skills\music-code-mv\scripts\`。

This guide is the full path from an empty folder to a delivered MP4, written as copy-pasteable commands. **Every command here was actually run in this workspace** (2026-10-02, Windows / PowerShell, Node v24.19.0, Python 3.14.7, ffmpeg-static) and the outputs quoted are the real ones. Everything runs from the workspace root; the scripts live in `skills\music-code-mv\scripts\`.

规矩不变：先问清楚 → 先分镜 → 每一帧是 `t` 的纯函数 → 每改一镜就看联系表 → 没看过的帧不交付。本页只讲**怎么把链路跑通、卡在哪怎么修**。

The defaults stay the same: interview first, storyboard before code, every frame a pure function of `t`, read a contact sheet after every change; an unseen frame is treated as unshipped. This page is about **making the pipeline run and unblocking it when it jams**.

---

## 0. 五分钟速览 (The five-minute path)

```bash
# 1. 环境自检：期望 READY / environment check: expect READY
node skills/music-code-mv/scripts/probe.mjs

# 2. 脚手架 + 预设 / scaffold with a preset
node skills/music-code-mv/scripts/init.mjs my-mv --preset=neon-rain

# 3. 联系表草稿（480×270，秒级）/ draft contact sheet, seconds, not minutes
node skills/music-code-mv/scripts/render.mjs --project=my-mv --contact --w=480 --h=270
#    → 然后用读图工具打开 my-mv\out\contact.png，挑毛病 / then READ the PNG and critique it

# 4. 正式渲染（交付分辨率）/ delivery render
node skills/music-code-mv/scripts/render.mjs --project=my-mv --out=out/video.mp4 --workers=4

# 5. 核对成片时长与两条流 / verify duration and streams
node_modules/ffmpeg-static/ffmpeg.exe -i my-mv/out/video.mp4
```

有旁白的片子，在第 2 步**之前**先走第 5 节（TTS 先合成、量时长，再排分镜）。

With narration, run section 5 **before** step 2 — synthesize first, measure, then lay out the storyboard.

---

## 1. 前置自检 (Step 0 — probe)

```bash
node skills/music-code-mv/scripts/probe.mjs
```

本工作区实跑输出（七项全绿才开工）：

Real output on this workspace (start only when all seven are green):

```
  OK   node                 v24.19.0
  OK   chrome               C:/Program Files/Google/Chrome/Application/chrome.exe
  OK   ffmpeg               <workspace>\node_modules\ffmpeg-static\ffmpeg.exe
  OK   node_modules         <workspace>\node_modules
  OK   puppeteer-core       ...\node_modules\puppeteer-core\lib\puppeteer\puppeteer-core.js
  OK   three (optional)     ...\node_modules\three\build\three.module.js
  OK   webgl (live test)    ANGLE (Google, ... SwiftShader driver)
  OK   gpu (hardware GL)    ANGLE (Intel, Intel(R) Arc(TM) Graphics ... Direct3D11 ...)
  OK   encoder (live test)  HARDWARE  Intel QSV AV1  (test frame encoded)

READY — music-code-mv can render.
```

三行硬件报告要分开读：`webgl (live test)` 是**故意走 SwiftShader 的能力门**，只回答「有没有 WebGL」；`gpu (hardware GL)` 才是渲染器真正会用的显卡；`encoder (live test)` 是**真的编了一帧**之后的结论（`HARDWARE` / `software`）。哪一行是 `MISS`，`NOT READY — n item(s) missing: …` 会直接点名。

Read the three hardware lines separately: `webgl (live test)` is a deliberate SwiftShader capability gate; `gpu (hardware GL)` is the card the renderer will actually use; `encoder (live test)` is the verdict after really encoding one frame.

`probe.mjs` 只接受一个位置参数（项目目录），**不认 `--chrome=` / `--ffmpeg=`**——要覆盖浏览器或 ffmpeg 路径，用环境变量 `CHROME_PATH` / `CHROME_BIN` / `FFMPEG_PATH`，或在 `render.mjs` 上传 `--chrome=` / `--ffmpeg=`。

`probe.mjs` takes one positional argument (a project dir) and **ignores `--chrome=` / `--ffmpeg=`** — override via `CHROME_PATH` / `CHROME_BIN` / `FFMPEG_PATH`, or pass `--chrome=` / `--ffmpeg=` to `render.mjs`.

---

## 2. Chrome 引擎：从空目录到 MP4 (Chrome engine end to end)

### 2.1 脚手架 (Scaffold)

```bash
node skills/music-code-mv/scripts/init.mjs my-mv                      # 模板默认配色
node skills/music-code-mv/scripts/init.mjs my-mv --preset=neon-rain   # 套预设
node skills/music-code-mv/scripts/init.mjs --list-presets             # 列全部预设
node skills/music-code-mv/scripts/init.mjs my-mv --force              # 覆盖非空目录
```

实跑输出：

```
scaffolded <workspace>\test-workdir\authoring-check  (preset: neon-rain)
```

生成物：`project.json`（宽高/帧率/时长/调色板/`fx`/`three`）、`index.html`、`src/`（舞台、时间轴、PRNG、歌词解析、六个演示场景）、`storyboard.md`、`lyrics.lrc`。

踩过的坑：目录非空又没加 `--force` → `directory not empty: <dir>  (use --force to overwrite)`（exit 2）；预设名打错 → `unknown preset "nope" (available: claude, deepseek, …)`（exit 2），**可用预设名单以这条报错或 `--list-presets` 的输出为准**，比背文档里的清单可靠。

Gotcha: a non-empty directory without `--force` exits 2 with `directory not empty`; a bad preset id exits 2 and prints the available ids — that list, not the docs, is the source of truth.

### 2.2 分镜与场景 (Storyboard and scenes)

`storyboard.md` 是合同，`project.json` 决定尺寸与时长，一个镜头一个 `src/scenes/*.js`，在 `src/scenes/index.js` 里注册。场景签名是**这个**形状（第一个参数是 `stage`，不是 `ctx`）：

```js
export default {
  id: 'verse-1',
  start: 8, end: 14,
  // t = 本镜头的局部时间；env.t = 全局时间（歌词/节拍读它）；p = 0..1 进度
  // stage.ctx 才是 2d context
  // env = {w,h,fps,duration,palette,project,lyrics,images,lyricAt,stage,t,local,fx}
  draw(stage, t, env, p) { /* ... */ }
};
```

**随机数在这个引擎里不叫 `env.rnd`**：Chrome 模板的 `env` 没有 `rnd` 字段，随机来自 `src/rng.js` 导出的 `mulberry32(seed)` / `hash1` / `hash2`——**每个镜头用自己的 seed 播一次种**，这样新增后面的镜头永远不会改动前面的镜头。`env.rnd(seed)` 是 **NumPy 引擎**的接口（返回 `np.random.default_rng(seed)`）。

Randomness on the Chrome engine comes from `mulberry32(seed)` / `hash1` / `hash2` in `src/rng.js`, re-seeded per shot; `env.rnd(seed)` is the **NumPy** engine's API, not the template's.

### 2.3 联系表草稿 (Draft contact sheet)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --contact --w=480 --h=270
```

实跑输出（21 s / 1280×720 的工程降到 480×270 渲 12 张关键帧）：

```
[render] GL: hardware (canvas2d)
[render] contact sheet: <workspace>\test-workdir\authoring-check\out\contact.png  (12 keys)
<workspace>\test-workdir\authoring-check\out\contact.png
```

最后一行就是 PNG 路径，**直接把它喂给读图工具**。可调项：`--keys=`（关键帧数，默认 12）、`--cols=`（列数，默认 4）、`--keyw=`（每格宽，默认 320）、`--out=`（改输出路径）。联系表写进 `.cache/contact/`，**不占帧缓存**，也**不吃 `--workers`**（实跑 `--workers=4` 也没有并排行）。

The last line is the PNG path — feed it straight to your image reader. Keys/cols/keyw/out are adjustable. Contact frames land in `.cache/contact/`, outside the frame cache, and they ignore `--workers`.

### 2.4 静帧 (Stills)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --stills=0.5,1.5 --w=480 --h=270
```

```
<workspace>\test-workdir\authoring-check\.cache\stills\s000_t0.50.jpg
<workspace>\test-workdir\authoring-check\.cache\stills\s001_t1.50.jpg
```

静帧落在 `.cache\stills\s000_t<秒>.<ext>`（Chrome 引擎）；NumPy 引擎的 `--stills` 落在 `out\still-<秒>s.png`。

Stills go to `.cache\stills\s000_t<t>.<ext>` on the Chrome engine and `out\still-<t>s.png` on the NumPy engine.

### 2.5 正式渲染 (Full render)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --out=out/video.mp4 --w=480 --h=270 --dur=2
```

```
[render] frames: 60 rendered, 0 reused
[render] encoder: Intel QSV AV1  [hardware verified — test frame encoded]
[render] OK  0.42 MB  <workspace>\test-workdir\authoring-check\out\draft.mp4
Duration: 00:00:02.00, start: 0.000000, bitrate: 1756 kb/s
  Stream #0:0[0x1](und): Video: av1 (Main) ... 480x270 ... 30 fps
[render] frame cache kept: 0.00 GB in frames/
```

常用开关（全部实跑过）：

| 开关 | 作用 | 实测 |
|---|---|---|
| `--w= --h= --fps= --dur=` | 覆盖 `project.json`，草稿阶段全靠它 | `--dur=2` → 60 帧 |
| `--workers=<n>` | 并行渲染（会先打 `parallel render: n workers …`） | 4 workers、60 帧、800×450 → 3.2 s |
| `--engine=node` | 无浏览器 skia 快路径（需 `@napi-rs/canvas`） | `engine: node (skia, browserless)`，联系表正常 |
| `--encoder=` / `--preset=` / `--crf=` | 编码器与**软件**编码调参（默认 `auto` / `medium` / `17`） | ⚠ `render.mjs` 的 `--preset=` 是 **x264 预设**，不是风格预设 |
| `--audio=<file>` | 封装音轨，路径**相对工程目录** | `--audio=out/line1.wav` 成功 |
| `--sheet` | 用已渲出的帧重建联系表 | `--sheet --keys=6 --out=out/sheet.png` |
| `--force` | 忽略签名全部重渲 | `60 rendered, 0 reused` |
| `--clean` | 编码后清掉 `frames/` | 日志 `frame cache purged` |
| `--format=png --quality=` | 帧容器（默认 jpeg 95） | — |

### 2.6 续渲语义 (Resume semantics)

帧**不是**「文件在就复用」，而是「文件在**且签名没变**才复用」。签名 = 宽 / 高 / fps / 时长 / 引擎 / 画质 + 每个镜头声明的 `deps`。实测：

Frames are reused only when the file exists **and** the render signature is unchanged — signature = width / height / fps / duration / engine / quality plus each scene's `deps`.

```bash
# 同参数重跑 → 100% 复用
... --w=480 --h=270 --dur=2
[render] frames: 0 rendered, 60 reused  (incremental — 100% skipped)

# 改分辨率 → 签名变了，全部重渲
... --w=640 --h=360 --dur=2
[render] frames: 60 rendered, 0 reused

# 只改 --out / --audio / --workers → 签名不变，照旧复用（实测 60 reused）
```

所以：**草稿分辨率调构图，最后换交付分辨率时一定会整轮重渲**——这是预期行为，不是缓存坏了。加 `--force` 是「同一份工程也全部重来」。

Draft at draft resolution; switching to delivery resolution re-renders everything by design.

### 2.7 核对成片 (Verify the file)

```bash
node_modules/ffmpeg-static/ffmpeg.exe -i my-mv/out/video.mp4
```

```
Duration: 00:00:08.00, ...
  Stream #0:0 ... Video: av1 ... 480x270 ... 30 fps
  Stream #0:1 ... Audio: aac (LC) ... 24000 Hz, mono
```

**本工作区没有 `ffprobe`**（`ffmpeg-static` 只带 `ffmpeg.exe`）。量时长用 `ffmpeg -i <file>`——它会打印 `Duration` 与所有流，退出码是 1，这是正常的（没有指定输出文件）；照抄 `ffprobe -i ...` 会得到 `CommandNotFound`。

There is **no `ffprobe`** in this workspace — use `ffmpeg -i <file>`, which prints Duration and every stream (exit code 1 is expected).

---

## 3. 什么时候用哪个引擎 (Which engine)

| 场景 | 选它 | 入口 |
|---|---|---|
| 默认：排版、歌词、DOM/CSS、Three.js 3D 场面 | **Chrome 引擎** | `render.mjs` |
| 沙箱里 Chrome 起不来（`spawn EPERM`）或想要更快的纯 CPU 路径 | **node/skia 引擎** | `render.mjs --engine=node` |
| 画面本质是数学（场、SDF、分形、逐像素运算）、严格栅格排版 | **NumPy + Pillow 引擎** | `render-np.py` |

node/skia 引擎与 Chrome 引擎**共用同一套 `render.mjs` 参数**（`--contact` / `--stills` / `--sheet` / `--out` 全部一样），只是不走浏览器；它需要 `@napi-rs/canvas`（本工作区已装，实跑 `--engine=node --contact` 正常出图）。

### 3.1 NumPy 引擎 (NumPy engine)

**先解决解释器**：PATH 上的 `python`（3.14.7）**没有 numpy/Pillow**，直接跑会得到

```
render-np.py needs numpy and Pillow: No module named 'numpy'
install with: pip install numpy pillow
```

用 DSH 自带的 Python（numpy 2.3.5 + Pillow 12.3.0）：

```bash
$py = "<python>"
$env:PYTHONIOENCODING = "utf-8"    # 不设的话中文路径/日志在控制台是乱码（实测）
```

```bash
# 脚手架（同一批预设）
& $py skills/music-code-mv/scripts/render-np.py --init=my-mv-np --preset=claude

# 联系表自检
& $py skills/music-code-mv/scripts/render-np.py --project=my-mv-np --contact

# 静帧 → out\still-0.50s.png
& $py skills/music-code-mv/scripts/render-np.py --project=my-mv-np --stills=0,3.5,8

# 出片（多进程补帧）
& $py skills/music-code-mv/scripts/render-np.py --project=my-mv-np --out=out/video.mp4 --workers=8
```

实测（640×360、600 帧、8 进程）：

```
  600/600 frames
frames: 588 rendered, 12 from cache, 10.8s (18 ms/frame)
encoded: <workspace>\test-workdir\authoring-np\out\draft.mp4
  Duration: 00:00:20.00, ...  Stream #0:0 ... h264 (High) ... 640x360 ... 30 fps
```

**三个实测过的坑：**

1. **浅色底 + `bloom` = 整屏过曝（可复现）。** 脚手架现在会把预设的 `fx` / `three` / `segments` 一起写进 `project.json`（实测 `--init --preset=claude` → `"bloom": false`），新工程直接出图就是干净的；但只要 `fx.bloom` 仍是 `true`，象牙白底（`claude`、`ink-paper`）就会被辉光刷成白纸——12 格联系表几乎全白，只剩一点朱砂线。改 `project.json` 后引擎会打印 `signature changed: cleared N cached frames` 自动清缓存，重出一张联系表即可对照。
2. **`--audio=` 按进程 CWD 解析**（`--out=` 才是相对工程目录）。从工作区根目录跑就要写全路径：`--audio=test-workdir/my-mv-np/track.wav`。写成 `--audio=track.wav` 会得到 `Error opening input file track.wav`。
3. **`--contact` / `--stills` 没有 `--w --h --fps --dur` 覆盖**（Chrome 引擎有），尺寸只由 `project.json` 决定。

1. **Light background + `bloom` = a blown-out frame (reproducible).** The scaffold now writes the preset's `fx`, `three` and `segments` into `project.json` (verified: `--init --preset=claude` gives `"bloom": false`), so a fresh project renders clean; but while `fx.bloom` is `true` on an ivory background the glow washes the whole sheet to white. Editing `project.json` makes the engine print `signature changed: cleared N cached frames`, so re-render the sheet to compare.
2. **`--audio=` resolves against the process CWD**, while `--out=` resolves against the project — give a full relative path from where you launch the command.
3. **No `--w --h --fps --dur` overrides** on the NumPy engine; size comes from `project.json`.

---

## 4. 预设怎么挑 (Picking a preset)

```bash
node skills/music-code-mv/scripts/init.mjs --list-presets
python skills/music-code-mv/scripts/audit-presets.py      # 配色纪律测试，exit 1 = 违规
```

实跑：`17 presets, 0 issues`（**数量以输出为准**，预设还在加）。

- **四套氛围预设** `neon-rain` / `ink-paper` / `phosphor` / `dusk-lofi`：解决「从零配色」。
- **AI 模型品牌配色** `claude` / `deepseek` / `gpt` / `gemini` / `grok` / `mistral` / `llama` / `qwen` / `kimi` / `doubao` / `zhipu` / `midjourney` / `fairy`：六角色调色板 + 分镜骨架 + `three` 镜头逻辑。
- **选法**：先挑气质最接近的一个（通常比从默认配色开始调更快）；换成真实歌词；再重写分镜；每改一镜看一次联系表。
- **浅色预设（`ink-paper`、`claude`）**：正文用 `text`、底用 `bg`，`dim` 通常不用于正文；走 NumPy 引擎时先把 `bloom` 关掉更稳（见 3.1）。
- **自定义预设**：往 `presets/` 放一个 JSON 即可被 `--preset=<名>` 读到，改完跑一次 `audit-presets.py` 能省一轮返工。

Preset ids are whatever `--list-presets` prints. Pick the closest mood, swap in real lyrics, rewrite the shot list, re-check a contact sheet after every shot. Light presets need deliberate contrast; on the NumPy engine turn bloom off first.

---

## 5. TTS 配音的正确顺序 (Narration — synth first, storyboard second)

**顺序错了整条时间线都要返工**：先合成 → 量实测时长 → 才排分镜 → 再写场景。

### 5.1 四步 (Four steps)

```bash
# 1) 先确认配音可用（只连回环地址的 DSH 代理）
node skills/music-code-mv/scripts/tts.mjs --probe
#    READY  MiMo TTS 可用 / available  {"configured":true,"supported":true}

# 2) 批量合成（清单：[{file,text},…]；单段用 --out=xx.wav "文本"）
node skills/music-code-mv/scripts/tts.mjs --batch=narration.json
#    test-workdir/authoring-check/out/n01.wav  145964 bytes
#    test-workdir/authoring-check/out/n02.wav  238124 bytes
#    done: 2 clips, 384088 bytes

# 3) 量实测时长（本工作区没有 ffprobe，用 ffmpeg -i）
node_modules/ffmpeg-static/ffmpeg.exe -i narration/out/n01.wav   # Duration: 00:00:03.04
node_modules/ffmpeg-static/ffmpeg.exe -i narration/out/n02.wav   # Duration: 00:00:04.96

# 4) 按实测时长排镜头边界，再写场景代码
```

`--probe` 失败时会直说原因：`NOT READY 连不上 …（DSH 没开？端口不对？）`、`TTS 插件已装但没配 API Key：到 设置 → 插件 → dsh-xiaomi-tts 存一个 Key`、`找不到 TTS 代理路由`、`上游 MiMo 服务没回音频`。跳过 probe 的常见代价是：渲染完才发现整条音轨是静音的；TTS 失败时先问用户，比直接交一部静音片更省事。

### 5.2 摆位与混音 (Place and mix)

每段摆到它的镜头起点（毫秒），关掉归一化混成一条，再补齐到全片长度：

```powershell
node_modules\ffmpeg-static\ffmpeg.exe -y -loglevel error -i narration\out\n01.wav -i narration\out\n02.wav -filter_complex "[0:a]adelay=500:all=1[a0];[1:a]adelay=4000:all=1[a1];[a0][a1]amix=inputs=2:normalize=0:duration=longest[m];[m]apad=whole_dur=8[t]" -map "[t]" narration\track.wav
```

（整条是**一行**；PowerShell 里 `\` 续行不生效。/ It is a single line; PowerShell does not take `\` continuations.）

实测注意：`apad=whole_dur=8` **只补不裁**——如果某段被摆到 4.0 s 而它本身 4.96 s，`track.wav` 会是 8.96 s。最终成片由渲染器的 `-shortest` 收口（实测：8.96 s 音轨 × 8 s 画面 → 成片 `Duration: 00:00:08.00`，音轨被裁齐）。**要精确对齐就在滤镜末尾加 `atrim=0:<总长>` 或 `-t <总长>`。**

`apad` pads without trimming — an overrunning clip leaves the track longer than the film; `-shortest` then clamps the MP4 (verified: 8.96 s audio × 8 s video → 00:00:08.00). Add `atrim` or `-t` when you need an exact length.

### 5.3 交给渲染器 (Hand it over)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --out=out/video.mp4 --audio=narration/track.wav
```

`--audio=` 相对**工程目录**解析（实测 `--audio=out/line1.wav` 成功）；渲染结束会打印 `Duration` 与 `Stream #0:1 … Audio: aac`，两条流都在才算交付。

---

## 6. 联系表怎么读 (Reading the contact sheet)

```bash
node skills/music-code-mv/scripts/render.mjs --project=my-mv --contact --w=480 --h=270
```

一张 4 列 × N 行的拼图，12 个等距关键帧（`t = 0 … duration`）。**按顺序看这几件事**，看到就改，改完再出一张（秒级）：

1. **有没有空镜**：某几格几乎只有背景 → 那个镜头没发生事情（规矩 4）。
2. **字读不读得清**：歌词格子是最响的元素吗？背景太花就加遮罩或压暗（规矩 5）。浅色预设要看 `text` vs `bg` 的对比。
3. **运动弧线**：从第 1 格走到第 12 格，画面有没有演进？12 格长得一样 = 时间没起作用。
4. **过曝**：整格发白、结构糊成一片 → `bloom` 太强（阈值 150、`bloomAlpha` 0.45 是上限），浅色底直接关掉。
5. **对比度与暗角**：四角死黑说明 `vignette` 过头；主体淹没说明 `dim` 用错了角色。
6. **镜头切换**：相邻格子风格突变是否落在分镜的镜头边界上。

本页两张实拍对照：

- `neon-rain`（Chrome 引擎，480×270）：12 格都有事件（开机日志、歌词、粒子、等距堆叠、数据图），暗底亮字，可读——这就是「合格」的样子。
- `claude`（NumPy 引擎，把 `fx.bloom` 手动改回 `true` 后重出）：12 格接近全白，只剩一点朱砂线——浅色底开辉光的典型症状，见 3.1。脚手架本身已经会套预设的 `fx`，这样复现得自己把 `bloom` 打开。

Six things to check, in order: empty shots, type legibility, motion arc across the twelve keys, blow-out, contrast/vignette, and whether style changes land on the storyboard's shot boundaries. Look, fix, re-render — the sheet costs seconds.

---

## 7. 常见报错与修法 (Errors and fixes)

全部为实跑或从脚本读到的真实报错：

| 报错 / 现象 | 原因 | 修法 |
|---|---|---|
| `directory not empty: <dir> (use --force to overwrite)` (exit 2) | 脚手架目标已存在 | 换目录，或加 `--force` |
| `unknown preset "nope" (available: …)` (exit 2) | 预设 id 不存在 | 用报错里列出的 id；`--list-presets` |
| `project dir not found: <dir>` (exit 2) | `--project=` 指错 | 检查路径（相对当前工作目录） |
| `render-np.py: error: --project=<dir> (or --init=<dir>, …)` | NumPy 引擎没给项目 | `--project=` 或 `--init=` 二选一 |
| `render-np.py needs numpy and Pillow: No module named 'numpy'` | PATH 上的 python 没装依赖 | 换 DSH 自带 python（见 3.1） |
| 控制台里中文路径/日志全是乱码 | Python stdout 用错代码页 | `$env:PYTHONIOENCODING="utf-8"` |
| `project.json is not valid JSON: Unexpected UTF-8 BOM` | PowerShell `Set-Content -Encoding UTF8` 写了 BOM | `[System.IO.File]::WriteAllText($p,$json,(New-Object System.Text.UTF8Encoding($false)))` |
| `Error opening input file track.wav`（NumPy 引擎） | `--audio=` 按 CWD 解析 | 给从当前目录算起的完整相对路径 |
| 成片比预期短 | `-shortest` 按最短流收口，音轨/画面谁短裁谁 | 音轨先 `apad`/`atrim` 到全片长度（见 5.2） |
| 想量时长，`ffprobe` 报 CommandNotFound | 工作区没装 ffprobe | `node_modules/ffmpeg-static/ffmpeg.exe -i <file>` |
| `frame t=… stuck for 120s`（`renderAt()` 未返回） | 场景里有死循环或异步等待 | 查该镜头的 `draw`：`await` 或无界循环会让它永远回不来 |
| `[page error] …` / `scene "x" failed at t=…` | 场景抛异常，帧照渲但内容错 | 看 stderr 里点名的场景 id 与 t |
| `signature changed: cleared N cached frames`（NumPy） | 正常：`project.json`/`src/render.py` 变了 | 不是错误，缓存在自我失效 |
| `frames: N rendered, 0 reused` 但你什么都没改 | 改了宽高/fps/时长/引擎/画质 | 预期行为（见 2.6）；草稿期固定用 480×270 |
| 硬件编码器 `Cannot load nvcuda.dll` / `amfrt64.dll failed to open` | 机器上没有那块卡 | 自动降级并打印原因；也可 `--encoder=libx264` |
| 传了 `--preset=neon-rain` 却没套上配色 | `render.mjs` 的 `--preset=` 是 **x264 `-preset`**，风格预设只属于 `init.mjs` / `render-np.py --init`；硬件编码器路径下还会被**静默忽略**（实跑 QSV 下无报错） | 风格预设在脚手架阶段用；渲染阶段的 `--preset` 只留 `medium/slow/fast…` |
| 输出日志有 `[UNVERIFIED: …]` | 硬件编码器试编失败 | 看括号里的原因，或强制软件编码 |
| 沙箱里 `spawn EPERM` 起不了 Chrome | 无头 Chrome 被策略拦住 | 换 `--engine=node` 或 NumPy 引擎 |

A row-by-row table of real messages: every one above was seen while running these commands or read directly out of the scripts. When an error is not listed, read the exact wording — `init.mjs` and `render-np.py` both print the available alternatives when they refuse.

---

## 8. 交付前检查 (Before you deliver)

1. `probe.mjs` 是 `READY`（硬件三行分开看）。
2. 联系表**用读图工具看过**，六项检查（第 6 节）都过。
3. 交付分辨率跑过**最后一遍**（草稿分辨率只是草稿）。
4. `ffmpeg -i out/video.mp4`：时长 = 分镜总长，`Video` 与 `Audio` 两条流都在。
5. 有旁白的片子：每段落点在镜头边界上，没有被 `-shortest` 意外裁短。
6. 抽查首帧与末帧（`--stills=0,<dur-0.1>`）没有黑帧、空帧。

Checklist: probe READY · contact sheet actually read · one pass at delivery resolution · duration and both streams verified · narration aligned and not clipped · first and last frames spot-checked.

---

## 9. 本页实测数字 (Measured on this workspace)

| 项目 | 实测 |
|---|---|
| Chrome 引擎 480×270 + 全 FX | ~32 ms/帧（240 帧约 8 s，进度条报 31.3 fps） |
| Chrome 引擎 `--workers=4`，800×450，60 帧 | 3.2 s |
| Chrome 联系表（12 键，480×270） | 秒级，出 `out\contact.png` |
| NumPy 引擎 640×360、`--workers=8` | 588 帧 + 12 缓存 = 10.8 s（18 ms/帧墙钟） |
| 编码器 | `Intel QSV AV1 [hardware verified — test frame encoded]` |
| TTS 单段 | 145 964 bytes → 3.04 s；批量 2 段 384 088 bytes |
| `audit-presets.py` | `17 presets, 0 issues` |

数字会随机器与工程复杂度浮动，**量级**才是重点：草稿 480×270 秒级回环，交付 720p 每帧几十毫秒，60 s @30 fps ≈ 1800 帧。

Numbers drift with the machine and the scene; the order of magnitude is the point: draft-resolution loops are seconds, 720p delivery is tens of milliseconds per frame.
