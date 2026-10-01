# 隐私与安全说明 / Privacy & Security

本文件是 **dsh-music-code-mv 插件本体**（`index.js`、`lib/`、`skill/scripts/`、`skill/template/`）的隐私审核记录，以及「改动渲染内核 / 配色后该怎么复查」的清单。
This is the privacy review record for the plugin itself, plus the checklist to re-run whenever the render kernel or palettes change.

审计 / audited: 2026-10-01 · 版本 version 0.2.x · 方式 method: 静态扫描 + 真起服务的行为断言（`test/privacy.test.mjs` + `test/studio.test.mjs`）

---

## 结论 / verdict

**插件不联网、不埋点、不读工程目录以外的文件。** 唯一对外开口是 DSH 自带 webServer 上的 `/music-mv/*`：只服务回环地址、不做跨域、只读已发现工程目录内的产物。
**No outbound traffic, no telemetry, no reads outside your projects.** The only surface is `/music-mv/*` on DSH's own webServer: loopback-only, no CORS, project-scoped reads.

## 数据流 / data flow

```
浏览器（DSH 界面，或直接用浏览器打开）
   │  同源 fetch + x-music-mv: studio
   ▼
DSH webServer (127.0.0.1)  ── 前缀路由 /music-mv
   │
   ├── 工程扫描：readdir 工作区内最多 3 层，只找 project.json + index.html
   ├── 文件预览：仅限已发现工程目录内、且非隐藏文件
   └── 渲染任务：spawn 本机 node 跑 skill/scripts/render.mjs（子进程，无网络）
        └── 无头 Chrome 打开本机 index.html 截帧 → ffmpeg 编码 → 写回工程 out/```

没有任何一步把数据送出本机；插件也不读取 DSH 会话、提示词、模型凭据。

---

## 发现与处置 / findings

| # | 严重度 | 问题 | 处置 |
|---|---|---|---|
| 1 | 高 | 工作室响应带 `Access-Control-Allow-Origin: *`。用户随手打开的任意网页都能 `fetch` 走工作区文件内容（回环 + 通配 CORS = 可被联动读取）。 | **已修**：不再发任何 ACAO；跨站请求按 `Sec-Fetch-Site` 拒绝；`/api` 需自定义头 `x-music-mv: studio`（跨域预检拿不到许可）；响应加 `Cross-Origin-Resource-Policy: same-origin`。 |
| 2 | 高 | `/api/file`、`/api/text` 原先允许工作区内**任意**文件，凭据、无关源码都在可读范围。 | **已修**：只允许已发现工程目录内的文件；含隐藏段（`.env`、`.git`、`.cache`）一律 403；路径穿越 403。 |
| 3 | 中 | 没有来源地址检查。若 DSH 被绑到 `0.0.0.0`（局域网暴露），工作室会跟着暴露且无鉴权。 | **已修**：仅接受回环来源（`127.0.0.1` / `::1` / `::ffff:127.0.0.1`），非回环一律 403。 |
| 4 | 低 | 客户端用 `postMessage(..., '*')` 推主题，页面也不校验来源。 | **已修**：只发给 `location.origin`；页面只认 `ev.origin === location.origin` 的消息。 |
| 5 | 说明 | `<img>/<video>` 不会带自定义头，严格头部校验会打断预览。 | **显式例外**：仅 `GET /api/file` 允许无自定义头，靠回环 + `Sec-Fetch-Site` + `CORP: same-origin` 兜住；文本与写操作仍必须带头。 |
| 6 | — | 遥测 / 埋点 / 外部 URL / 密钥 / 个人绝对路径 | **确认无**：静态扫描覆盖全部运行时代码与文档；`fetch` 仅 3 处，全部同源或相对路径。 |
| 7 | — | 渲染子进程 | 只 `spawn` 本机 `node`、本机 Chrome、本机 ffmpeg；不传任何网络参数。 |

### 明确**不**防护的部分 / out of scope

- **工程代码就是代码。** `src/scenes/*.js` 会被渲染器在本机执行——这是这套工具的工作方式。只渲染你自己信任的工程；工作室界面从不改写工程源码，但「下载并渲染别人的工程」等于在本机跑别人的代码。
- **本机进程/用户**本来就能读到这些文件，插件不试图对抗本机权限模型。
- **DSH 自身的信任边界**（连接鉴权、trustedHosts）不在本插件范围内；我们只是不额外开口子。

---

## 改动内核或配色后的复查清单 / checklist

1. `node test/privacy.test.mjs` —— 出网 API、外部 URL、遥测字样、个人路径、密钥、场景确定性（`Date.now` / `Math.random` / `requestAnimationFrame`）、工作室契约、四个预设的完整性，一次全过。
2. `node test/studio.test.mjs` —— 真起 HTTP 服务，断言「无通配 CORS / 跨站被拒 / 越界被拒 / 隐藏文件被拒 / 工程外文件被拒」。
3. `node test/client.test.mjs` —— 浏览器半边：页面类型、常驻面板、字典、postMessage 目标不是通配。
4. 新增色彩风格时：色值只进 `presets/*.json` 与页面令牌，不要在运行时代码里硬编码外链（远程字体、图片 CDN 都会被第 1 步拦下）。
5. 新增对外能力（下载、上传、远程素材）前，先在这里加一节说明它把什么数据发到哪里。

## 怎么验证 / verify by hand

```
# 不带自定义头：应当 403
curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:<port>/music-mv/api/state'
# 带头：应当 200
curl -s -H 'x-music-mv: studio' 'http://127.0.0.1:<port>/music-mv/api/state'
# 工程外的文件：应当 403
curl -s -H 'x-music-mv: studio' -o /dev/null -w '%{http_code}' 'http://127.0.0.1:<port>/music-mv/api/text?path=package.json'
# 响应里不应出现 access-control-allow-origin
curl -sI -H 'x-music-mv: studio' 'http://127.0.0.1:<port>/music-mv/api/state'```
