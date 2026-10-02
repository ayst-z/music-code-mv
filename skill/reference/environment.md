# 运行环境 (Environment)

## 需要什么 (What is needed)

| 工具 tool | 用途 why | 备注 notes |
|---|---|---|
| Node.js ≥ 18 | 跑渲染器 | ESM (`"type": "module"`) |
| Google Chrome or Edge | 画帧 | 无头即可；软件 WebGL 够用 |
| ffmpeg | 帧 → MP4、封装音频 | 任意较新的构建；**只带 `ffmpeg.exe`，没有 `ffprobe`**——量时长用 `ffmpeg -i <file>`（会打印 `Duration`，退出码 1 属正常） |
| `three` | 可选，3D 镜头 | npm |
| `puppeteer-core` | 驱动 Chrome | npm；不下载 Chromium |

| tool | why | notes |
|---|---|---|
| Node.js ≥ 18 | runs the renderer | ESM (`"type": "module"`) |
| Google Chrome or Edge | draws the frames | headless; software WebGL is fine |
| ffmpeg | frames → MP4, audio mux | any recent build; **ships `ffmpeg.exe` only — no `ffprobe`**, so measure durations with `ffmpeg -i <file>` (exit code 1 is expected) |
| `three` | optional, 3D shots | npm |
| `puppeteer-core` | drives Chrome | npm; no Chromium download |

## 安装 (Install)

```bash
npm install three puppeteer-core ffmpeg-static
```

### `allow-scripts` 陷阱 (The `allow-scripts` trap)

较新的 npm 版本默认会拦截生命周期脚本，并打印：

Recent npm versions block lifecycle scripts by default and print:

```
npm warn allow-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn allow-scripts   ffmpeg-static@5.3.0 (install: node install.js)
```

`ffmpeg-static` 正是在那个 postinstall 里下载它的二进制。如果被拦掉了，`node_modules/ffmpeg-static/ffmpeg.exe` 就不存在。用下面任一办法修：

`ffmpeg-static` downloads its binary in that postinstall. If it was blocked, `node_modules/ffmpeg-static/ffmpeg.exe` is missing. Fix with any of:

```bash
npm approve-scripts ffmpeg-static      # allow, then reinstall
npm install @ffmpeg-installer/ffmpeg   # ships the binary as a package, no script
```

`@ffmpeg-installer/ffmpeg` 是更可靠的兜底：它根本没有安装脚本，所以沙箱策略弄不坏它。`probe.mjs` 两个都检查，并报告该用哪一个。

`@ffmpeg-installer/ffmpeg` is the reliable fallback: it has no install script at all, so the sandbox policy cannot break it. `probe.mjs` checks both and reports which one to use.

## 定位可执行文件 (Locating binaries)

`probe.mjs` 的真实查找顺序（读自脚本）：

- Chrome / Edge：先看 `CHROME_PATH`、`CHROME_BIN` 两个环境变量，再看 `%ProgramFiles%`、`%ProgramFiles(x86)%`、`%LOCALAPPDATA%` 下的 Chrome，然后是 Edge，最后是 Linux/macOS 的常见路径
- ffmpeg：先看 `FFMPEG_PATH`，再逐层向上找 `node_modules/ffmpeg-static/ffmpeg.exe`、`node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`——**`probe.mjs` 到这里就结束了，不回退 `PATH`**；`render.mjs` 才会再试 `--ffmpeg=` 与 `PATH`
- `node_modules`：从项目目录（或 cwd）向上最多找 10 层

**`probe.mjs` 不接受 `--chrome=` / `--ffmpeg=`**（它只吃一个位置参数：项目目录）；要覆盖请设上面三个环境变量，或者在 `render.mjs` 上传 `--chrome=<path>` / `--ffmpeg=<path>`（`render.mjs` 从工程目录、cwd、脚本自身目录三处向上找 `node_modules`，找不到才回退 `PATH`）。

The real search order: `CHROME_PATH`/`CHROME_BIN` first, then Program Files / LocalAppData Chrome, Edge and the usual Linux/macOS paths; `FFMPEG_PATH` first, then the `node_modules` candidates — and `probe.mjs` stops there with **no `PATH` fallback**, while `render.mjs` additionally honours `--ffmpeg=` and finally `PATH`. `probe.mjs` takes no `--chrome=`/`--ffmpeg=` flags — set the environment variables, or pass those flags to `render.mjs`.

## 平台注意事项 (Platform notes)

- **Windows：** 如果 `pnpm`/ffmpeg 不在 `PATH` 上，绝不要用裸名调用；用绝对路径。一条 PowerShell 命令只要 stderr 非空，即使底层命令成功了也会报非零退出——真正的结果要看 stdout。
- **Linux / CI：** Chrome 的沙箱通常不可用；`--no-sandbox` 已经替你加了。完全没有 GPU 时，保留 `--enable-unsafe-swiftshader`。
- **GPU：** 真 GPU 能让 WebGL 快约 10×。只有当 GPU 路径返回黑帧时才强制走软件渲染。

- **Windows:** never call `pnpm`/ffmpeg by bare name if they are not on `PATH`; use absolute paths. A PowerShell command whose stderr is non-empty reports a non-zero exit even when the underlying command succeeded — check stdout for the real result.
- **Linux / CI:** Chrome's sandbox is often unavailable; `--no-sandbox` is already passed. With no GPU at all, keep `--enable-unsafe-swiftshader`.
- **GPU:** a real GPU makes WebGL ~10× faster. Only force software when the GPU path returns a black frame.

## 验证 (Verifying)

```bash
node skills/music-code-mv/scripts/probe.mjs        # 从工作区根目录跑
node scripts/probe.mjs                             # 从 skill 目录跑
```

会打印 Node/Chrome/ffmpeg 路径与版本、软件 WebGL 是否可用，以及 `READY` 或具体缺了哪一项。

Prints Node/Chrome/ffmpeg paths, versions, whether software WebGL works, and `READY` or the specific missing piece.
