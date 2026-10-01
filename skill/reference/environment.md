# 运行环境 (Environment)

## 需要什么 (What is needed)

| 工具 tool | 用途 why | 备注 notes |
|---|---|---|
| Node.js ≥ 18 | 跑渲染器 | ESM (`"type": "module"`) |
| Google Chrome or Edge | 画帧 | 无头即可；软件 WebGL 够用 |
| ffmpeg | 帧 → MP4、封装音频 | 任意较新的构建 |
| `three` | 可选，3D 镜头 | npm |
| `puppeteer-core` | 驱动 Chrome | npm；不下载 Chromium |

| tool | why | notes |
|---|---|---|
| Node.js ≥ 18 | runs the renderer | ESM (`"type": "module"`) |
| Google Chrome or Edge | draws the frames | headless; software WebGL is fine |
| ffmpeg | frames → MP4, audio mux | any recent build |
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

`probe.mjs` 按顺序搜索：

- `%ProgramFiles%`、`%ProgramFiles(x86)%`、`%LOCALAPPDATA%` 下的 Chrome / Edge
- `CHROME_PATH` 环境变量
- ffmpeg：`node_modules/ffmpeg-static/ffmpeg.exe`、`node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`，最后是 `PATH`

用 `--chrome=<path>` 或 `--ffmpeg=<path>` 覆盖。

`probe.mjs` searches, in order:

- Chrome / Edge in `%ProgramFiles%`, `%ProgramFiles(x86)%`, `%LOCALAPPDATA%`
- `CHROME_PATH` environment variable
- ffmpeg at `node_modules/ffmpeg-static/ffmpeg.exe`, `node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`, then `PATH`

Override with `--chrome=<path>` or `--ffmpeg=<path>`.

## 平台注意事项 (Platform notes)

- **Windows：** 如果 `pnpm`/ffmpeg 不在 `PATH` 上，绝不要用裸名调用；用绝对路径。一条 PowerShell 命令只要 stderr 非空，即使底层命令成功了也会报非零退出——真正的结果要看 stdout。
- **Linux / CI：** Chrome 的沙箱通常不可用；`--no-sandbox` 已经替你加了。完全没有 GPU 时，保留 `--enable-unsafe-swiftshader`。
- **GPU：** 真 GPU 能让 WebGL 快约 10×。只有当 GPU 路径返回黑帧时才强制走软件渲染。

- **Windows:** never call `pnpm`/ffmpeg by bare name if they are not on `PATH`; use absolute paths. A PowerShell command whose stderr is non-empty reports a non-zero exit even when the underlying command succeeded — check stdout for the real result.
- **Linux / CI:** Chrome's sandbox is often unavailable; `--no-sandbox` is already passed. With no GPU at all, keep `--enable-unsafe-swiftshader`.
- **GPU:** a real GPU makes WebGL ~10× faster. Only force software when the GPU path returns a black frame.

## 验证 (Verifying)

```bash
node scripts/probe.mjs
```

会打印 Node/Chrome/ffmpeg 路径与版本、软件 WebGL 是否可用，以及 `READY` 或具体缺了哪一项。

Prints Node/Chrome/ffmpeg paths, versions, whether software WebGL works, and `READY` or the specific missing piece.
