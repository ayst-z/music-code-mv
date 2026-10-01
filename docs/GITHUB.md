# GitHub 功能手册 / GitHub Features Manual

> 本文档覆盖本项目**全部 GitHub 侧功能**：仓库、分支与提交、认证、skill 快照同步、发布管线、Release、分发渠道、话题收录、隐私红线、命令速查与故障排查。与 `README.md`（插件功能）、`docs/PUBLISH.md`（发布细节）、`docs/PRIVACY.md`（隐私审计）互为补充。
> This manual covers **every GitHub-facing feature of this project**: repository, branches & commits, authentication, skill-snapshot sync, the publish pipeline, Releases, distribution channels, topics & listing, privacy red lines, a command cheat sheet and troubleshooting. It complements `README.md` (plugin features), `docs/PUBLISH.md` (publish detail) and `docs/PRIVACY.md` (privacy audit).

---

## 0. 速览 / At a glance

| 项 / Item | 值 / Value |
|---|---|
| 仓库 / repository | <https://github.com/ayst-z/music-code-mv> |
| 远端 / remote | `origin = https://github.com/ayst-z/music-code-mv.git` |
| 默认分支 / default branch | `master`（单分支流 / single-branch flow） |
| 作者身份 / committer | `music-code-mv <music-code-mv@users.noreply.github.com>`（仓库 local 配置，GitHub noreply，零 PII / repo-local, noreply, no PII） |
| 认证 / auth | `gh` 已登录账号 `ayst-z`（keyring；scopes `gist, read:org, repo`）+ Git Credential Manager / logged in via keyring |
| 许可 / license | MIT（`LICENSE`） |
| 版本 / version | `package.json` → `0.2.0` |
| CI / GitHub Actions | **无**（`.github/` 不存在；测试作为本地发布门禁运行 / none — tests run as a local publish gate） |
| Releases | 暂无；大文件（音频母版、4K/HDR 成片）设计上走 Release 资产而非 git / none yet; big binaries go to Release assets |
| 话题 / topics | `dsh-plugin` `deepseek-harness` `deepseek` `dsh` `music-video` `canvas` `threejs` `ffmpeg` |

---

## 1. 仓库总览 / Repository overview

**这个仓库是什么**：DSH 插件 `dsh-music-code-mv` 的完整发布体——插件源码 + `skill/` 快照（渲染引擎与创作指南）+ 文档 + 测试。工作区里的 `skills/music-code-mv/` 是唯一事实来源，仓库里的 `skill/` 是它的受控快照（见 §4）。
**What this repo is:** the complete release body of the DSH plugin — plugin source, the `skill/` snapshot (render engines + authoring guides), docs and tests. The workspace's `skills/music-code-mv/` is the single source of truth; `skill/` here is its controlled snapshot (§4).

```
dsh-music-code-mv/
├── index.js              插件入口，注册七个工具 / plugin entry, registers the seven tools
├── cordis.patch.yml      本组合包贡献的配置层 / the config layer this bundle contributes
├── package.json          v0.2.0；files 白名单决定打包内容 / files whitelist decides what ships
├── README.md             插件功能全览（中英双语）/ full feature overview, bilingual
├── LICENSE               MIT
├── .gitignore            渲染产物与缓存的防线 / the artefact & cache firewall
├── sync-skill.mjs        skill 快照同步器（带排除表）/ skill snapshot sync with exclusions
├── lib/                  插件运行时：runner、studio 宿主半边、client 浏览器半边
├── locale/               zh.json / en.json 插件清单本地化
├── docs/                 PRIVACY.md、GITHUB.md（本文）、awesome 收录条目
├── tools/                文档配图生成等维护脚本 / doc-image generators
├── test/                 四套测试：privacy · studio · plugin · client
└── skill/                ← skills/music-code-mv 的快照（sync 生成，勿手改 / generated, do not hand-edit）
    ├── SKILL.md
    ├── presets/          16 个配色预设 / 16 palette presets
    ├── reference/        styles · techniques · threejs · numpy-pillow · presets …
    ├── scripts/          render.mjs · render-np.py · init.mjs · probe.mjs · audit-presets.py
    └── template/         工程骨架 / project skeleton
```

**文件规模纪律**：仓库只收源码与文档。`frames/`（帧缓存，实测可达 17.9 GB）、`out/`（成片）、`node_modules/`、`__pycache__/`、音频母版一律不进 git——它们可重建、体积大、且受 GitHub 单文件 100 MB 上限约束（§9）。
**Size discipline:** the repo takes source and docs only. Frame caches (measured up to 17.9 GB), outputs, dependencies and audio masters never enter git — they are rebuildable and collide with GitHub's 100 MB file limit (§9).

---

## 2. 分支与提交历史 / Branches & history

**单分支流**：所有工作直接在 `master` 上进行，`origin/master` 是唯一远端分支。发布就是 `git push`；回滚用 `git revert`（保留历史）。
**Single-branch flow:** everything lands on `master`; `origin/master` is the only remote branch. Releasing is `git push`; rolling back is `git revert` (history preserved).

**提交信息惯例 / Commit convention** —— 首行是 `type: 中文摘要 English summary`，类型取 `feat` / `fix` / `test` / `docs`，双语并列（与本仓库其余文案同风格）。真实示例 / real examples:

```
feat: 无服务也能用 —— 联系表进对话 + 面板离线降级 feat: works without the HTTP service — sheets in chat + offline dock
fix: 工作区根要在注册表里挑「真的有 MV 工程」的那个 fix: resolve the workspace root to a registry entry that actually holds MV projects
test: 修复 studio 测试被吞掉的换行 test: fix the escaped newline that broke studio.test.mjs
```

首行尽量 ≤ 100 字符；正文（未强制）可写动机与验证方式。/ Keep the subject under ~100 chars; the body (not enforced) carries motivation and how it was verified.

**读历史 / Reading history**：

```bash
git log --oneline --decorate -20     # 摘要 / subjects with refs
git show <sha> --stat                # 单次提交改了什么 / one commit's footprint
git diff origin/master..master       # 将要推送的差异 / what the push will carry
```

---

## 3. 身份与认证 / Identity & authentication

三层配置，各司其职 / three layers, each with one job:

| 层 / Layer | 现状 / State | 作用 / Role |
|---|---|---|
| 仓库提交身份 / repo committer | `music-code-mv <music-code-mv@users.noreply.github.com>`（`git config --local`） | 提交作者字段；noreply 邮箱避免暴露真实邮箱 / commit author, noreply keeps the real email private |
| git 全局身份 / global identity | **未配置**（`~/.gitconfig` 不存在） | 无；仓库外提交会被 git 提示补配 / none |
| 推送认证 / push auth | `gh` keyring 登录 `ayst-z`，scopes `gist, read:org, repo`；HTTPS push 走 Git Credential Manager 或 `gh auth git-credential` | 允许 `git push origin master` 免交互 / interactive-free push |

**核验 / Verify**：

```bash
gh auth status          # → github.com ✓ Logged in to github.com account ayst-z (keyring)
git config --local user.name user.email
git remote -v           # 必须指向上表的 origin / must match the table above
```

**凭据安全 / Credential safety**：
- keyring 里的 `gho_****` token 不落盘进仓库；**任何**文件里出现硬编码 token 都是发布阻塞项（历史审计发现过回环服务会话 token，已列为红线，见 §9）。
- The keyring token never enters the repo; a hardcoded token anywhere is a publish blocker (a past audit found one loopback session token — now a red line, §9).
- 怀疑泄露时轮换 / rotate if in doubt: `gh auth refresh` 或网页端 revoke 后重新 `gh auth login`。
- 提交历史里的作者永远只有 noreply 一条 / the history contains exactly one author: the noreply identity.

---

## 4. skill 快照同步 / Skill snapshot sync

**模型**：`skills/music-code-mv/`（工作区源）是唯一事实来源；仓库 `skill/` 是发布快照。**不要手改 `skill/`**——改源，然后同步。
**Model:** `skills/music-code-mv/` (workspace source) is the single source of truth; `skill/` is the release snapshot. **Never hand-edit `skill/`** — edit the source, then sync.

```bash
cd plugins/dsh-music-code-mv
node sync-skill.mjs --check   # 只检查：一致 → "bundle is in sync (N files)"，exit 0；不一致 → 列出差异文件，exit 1
node sync-skill.mjs           # 执行同步：先清空 skill/ 再整棵重写（原子式重建）
```

**排除表 / Exclusion list**（`sync-skill.mjs` 内的 `SKIP_DIRS` / `SKIP_FILES`，与 `.gitignore` 同步维护）：

| 排除 / Skipped | 理由 / Why |
|---|---|
| `frames/` | 逐帧缓存，可达 GB 级，纯可重建 / frame cache, GB-scale, rebuildable |
| `out/` | 成片与联系表 / films and sheets |
| `.cache/` | 渲染签名缓存 / render signature cache |
| `node_modules/` | 依赖 / dependencies |
| `__pycache__/`、`*.pyc` | 解释器缓存 / interpreter cache |
| `np-demo/` | skill 源里的演示工程（含 360 帧与 mp4）/ scratch demo project |
| `*.log`、`.DS_Store`、`*.tgz` | 噪音与打包产物 / noise and pack output |

**何时跑 / When:** 任何触及 `skills/music-code-mv/` 的改动之后、提交之前——`--check` 的退出码就是门禁（发布管线的第 2 道，见 §5）。`docs/`、`README.md`、`lib/` 等插件侧文件不经过它。
**When:** after any change under `skills/music-code-mv/`, before committing — `--check`'s exit code is the gate (publish pipeline gate 2, §5). Plugin-side files (`docs/`, `README.md`, `lib/` …) don't go through it.

**历史教训 / History lesson:** 排除表是补齐的——此前 `walk()` 无排除，一次同步会把上百 MB 帧图和 `pyc` 带进仓库。`--check` 当时的 393 项差异里绝大多数是这类垃圾。排除表 + `.gitignore` 双保险。/ The exclusion list was added after a bare `walk()` once pulled hundreds of MB of frames and `.pyc` files toward the repo; `--gitignore` and the skip list now double-lock the door.

---

## 5. 发布管线（七道门）/ Publish pipeline (seven gates)

**每次把更新推上 GitHub，按序过完七道门。** 每道门都给出可复制的命令与预期输出。
**Run all seven gates in order before pushing an update.** Every gate ships copy-paste commands with expected output.

### 门 1 · 隐私审计 / Privacy audit
```bash
# 工作区根（只读扫描）/ from the workspace root, read-only:
# - 密钥类：api_key、token 赋值、GitHub 与云厂商密钥前缀、PEM 私钥头
#   （精确正则见 docs/PUBLISH.md §7 / exact regexes live in docs/PUBLISH.md §7）
# - PII 类：指向用户目录的绝对路径、邮箱、手机号、机器名
# - 体积：frames/、out/、node_modules/ 必须全部落在 .gitignore 内
```
预期 / expect: 插件仓库零命中；任何命中先修复或隔离再继续。红线清单见 §9。/ zero hits in the plugin repo; fix or isolate any hit before continuing. Red lines: §9.

### 门 2 · 同步门 / Sync gate
```bash
cd plugins/dsh-music-code-mv
node sync-skill.mjs --check    # exit 0 = 一致；exit 1 = 先跑 node sync-skill.mjs 再复查
```

### 门 3 · 测试门 / Test gate
```bash
node test/privacy.test.mjs     # 出网/密钥/确定性/工作室契约/预设完整性（预期 37 passed）
node test/studio.test.mjs      # 真起 HTTP 服务跑一遍（预期 36 passed）
node test/plugin.test.mjs      # 七工具契约 + 真实渲染（预期 45 passed）
node test/client.test.mjs      # 浏览器半边（预期 28 passed）
python skill/scripts/audit-presets.py   # 16 预设配色纪律 R1–R4，exit 0 = 全过
```
预期 / expect: 全部 `0 failed`、audit `16 presets, 0 issues`。改过渲染内核再补一张联系表实测 / after touching the render kernel, also render one contact sheet for real.

### 门 4 · 差异审阅 / Diff review
```bash
git status --short             # 未跟踪文件逐个确认"该不该进仓库"
git diff --stat                # 改动面
git grep -nE "C:\\\\Users|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{16,}" || echo clean
```

### 门 5 · 提交 / Commit
```bash
git add -A
git commit -m "feat: 中文摘要 English summary"
```

### 门 6 · 推送 / Push
```bash
git push origin master
```
Windows 下会出现 `LF will be replaced by CRLF` 警告——无害（行尾归一化，内容不变）。/ The `LF → CRLF` warnings are harmless line-ending normalisation.

### 门 7 · 复核与回滚 / Verify & rollback
```bash
git status                    # 应为 clean
git log --oneline -3          # 新提交在顶
gh repo view ayst-z/music-code-mv   # 远端可见（网络）
# 回滚一次错误推送 / undo a bad push:
git revert <sha> && git push origin master     # 公开历史用 revert，不用 reset --force
```

> 完整的发布检查表（含 PowerShell 等价写法与关键词扫描）在 `docs/PUBLISH.md` §7。/ The full checklist (with PowerShell equivalents and keyword scans) lives in `docs/PUBLISH.md` §7.

---

## 6. Releases：大文件通道 / Releases: the big-binary channel

**策略**：git 只管源码；音频母版（`.flac/.wav/.m4a`）、4K/HDR 成片（`.mp4`）体积大、可重建性弱，走 **GitHub Release 资产**。
**Policy:** git holds source; audio masters and 4K/HDR films are large and not rebuildable — they ship as **GitHub Release assets**.

```bash
# 创建发布 / create
gh release create v0.2.0 \
  --title "v0.2.0 — 16 presets + NumPy engine / 16 预设与第二引擎" \
  --notes-file docs/VIDEO.md

# 挂资产 / attach assets（母版、成片、封面）
gh release upload v0.2.0 audio/out/track.flac showcase/out/film-4k60.mp4

# 下载（使用者）/ consumers
gh release download v0.2.0
```

当前状态 / status: 尚无 release；上述为约定通道。单文件 >100 MB 会被 GitHub 拒收——真有超大母版，先压分卷或用 LFS（本仓库未启用 LFS）。/ No releases yet; this is the agreed channel. GitHub rejects files >100 MB — split or use LFS (not enabled here).

---

## 7. 分发渠道 / Distribution channels

| 渠道 / Channel | 命令 / Command | 适用 / When |
|---|---|---|
| ① 源码克隆 / clone | `git clone https://github.com/ayst-z/music-code-mv && cd music-code-mv && dsh plugin add .` | 本地开发与试用 / local dev |
| ② git 直装锁版本 / pinned install | `dsh plugin add github:ayst-z/music-code-mv#<sha>` | 生产环境锁 commit / pin in production |
| ③ tarball / 打包安装 | `pnpm pack && dsh plugin add ./dsh-music-code-mv-0.2.0.tgz` | 离线分发 / offline hand-off |
| ④ 话题页发现 / discovery | <https://github.com/topics/dsh-plugin> 等 §8 话题 | 被发现 / discovery |

安装自检 / verify an install:

```bash
dsh --dump-config | findstr /C:"dsh-music-code-mv"   # 应出现 "# == dsh-music-code-mv" 层
```

安装细节与依赖陷阱（`ffmpeg-static` 生命周期脚本被 npm 拦截）见 `README.md` Install 节。/ Install detail and the `ffmpeg-static` lifecycle-script pitfall: `README.md` §Install.

---

## 8. 话题、徽章与收录 / Topics, badges & listing

- **仓库话题 / repo topics**：`dsh-plugin` `deepseek-harness` `deepseek` `dsh` `music-video` `canvas` `threejs` `ffmpeg` → 出现在对应的话题聚合页。<https://github.com/topics/dsh-plugin>
- **徽章 / badges**（README 顶部）：topic 徽章、DeepSeek Harness 链接、MIT 许可徽章。
- **收录 / listing**：[awesome-deepseek-agent](https://github.com/deepseek-ai/awesome-deepseek-agent) 的投稿条目草稿在 `docs/awesome-deepseek-agent-entry.md`（表格行 + 指南草案），投稿前跑一遍 §5 七道门。
- **`package.json` keywords** 与仓库话题略有分工：keywords 服务于打包元数据（`dsh-plugin, deepseek-harness, music-code-mv, music-video, canvas, three.js, ffmpeg, animation, gui`），仓库话题服务于站内发现。
- Topics serve in-repo discovery; keywords serve package metadata. Keep them roughly aligned when renaming.

---

## 9. 隐私红线 / Privacy red lines

**双口径 / two scopes：**

**A. 插件仓库（发布口径 / what ships）** —— 下列内容出现任意一处即阻塞发布 / any occurrence blocks the publish:

| 红线 / Red line | 例 / Example | 处理 / Handling |
|---|---|---|
| 密钥与 token | GitHub 与云厂商密钥前缀、硬编码会话 token | 改读环境变量；已落盘的凭据轮换 / move to env, rotate |
| 个人绝对路径 | 任何指向用户目录的绝对路径（`C:\<用户目录>\…` 形态） | 相对路径或 `process.env` 化 / de-absolute |
| 未发表个人作品 | 工作区根的个人记录文件（文件名见内部 `docs/PRIVACY.md`） | **永不入库**，根 `.gitignore` 双保险 / never, double-locked |
| 渲染产物 | `frames/`、`out/`、`*.mp4`、`__pycache__/` | `.gitignore` + sync 排除表双保险 / both firewalls |
| 未复核截图 | 真实界面截图可能残留路径与会话标题 | 发布前人工过目 / human review before shipping |
| 根工作区建仓 | **工作区根目录永不 `git init`** | 根有 19 GB 产物与个人文件；发布只从 `plugins/dsh-music-code-mv/` 出去 / never init the root |

**B. 根工作区（永不发布 / never ships）**：根目录不是也永远不应成为 git 仓库；若确需对根做版本管理，必须先有完整根 `.gitignore`（排除个人作品、全部产物、本机脚本、嵌套仓库）并再走一遍门 1。当前仓库仅存在于插件目录。/ The workspace root is not — and must not become — a git repo; a root `.gitignore` covering personal works, all artefacts, local scripts and the nested repo would be a precondition for any such change. Today exactly one `.git exists: the plugin's.

自动化复核见 `test/privacy.test.mjs`（出网、密钥、个人路径、确定性、工作室契约——37 项断言）。/ Automated review: `test/privacy.test.mjs` (37 assertions over outbound calls, secrets, paths, determinism, studio contract).

---

## 10. 命令速查 / Command cheat sheet

**状态与历史 / status & history**

```bash
git status --short            git diff --stat              git log --oneline --decorate -20
git show <sha> --stat         git diff origin/master..master
```

**同步与测试 / sync & tests**

```bash
cd plugins/dsh-music-code-mv
node sync-skill.mjs --check && node sync-skill.mjs
node test/privacy.test.mjs && node test/studio.test.mjs && node test/plugin.test.mjs && node test/client.test.mjs
python skill/scripts/audit-presets.py
```

**提交与推送 / commit & push**

```bash
git add -A && git commit -m "feat: …" && git push origin master
git revert <sha>              # 撤销一次提交 / undo a commit
git commit --amend            # 未推送前修最后一次提交 / fix the last commit before pushing
```

**gh 与 Release / gh CLI**

```bash
gh auth status                gh repo view ayst-z/music-code-mv
gh release create <tag> --title "…" --notes-file docs/VIDEO.md
gh release upload <tag> <file…>       gh release list -R ayst-z/music-code-mv
```

**打包 / pack**

```bash
pnpm pack                     # → dsh-music-code-mv-0.2.0.tgz（files 白名单生效）
```

---

## 11. 故障排查 / Troubleshooting

| 症状 / Symptom | 原因 / Cause | 处理 / Fix |
|---|---|---|
| `sync-skill.mjs --check` exit 1，列出文件 | 源改了没同步（或反之） | 跑 `node sync-skill.mjs` 再查 / run the sync and re-check |
| 同步把大文件带进 `git status` | 排除表被绕过（如手工复制） | 删除误入文件，核对 `SKIP_DIRS` 与 `.gitignore` 一致 / delete, realign lists |
| `LF will be replaced by CRLF` 警告 | Windows 行尾归一化 | 无害，可忽略 / harmless |
| `push` 要求输入凭据 / 报 401 | `gh` 登出或 GCM 没缓存 | `gh auth login` 后重推；或 `git remote set-url origin` 确认 URL / re-login, verify remote |
| `push` 被拒（non-fast-forward） | 远端有新提交 | `git pull --rebase origin master` 后重推 / rebase then push |
| 推错了仓库/分支 | `origin` 指错 | `git remote -v` 核对；未共享历史时才允许 `--force`（先审阅 `git diff`）/ verify remote |
| 提交要求补 identity | 在插件仓库外提交 | 回到仓库目录，或补 `git config --local` / stay inside the repo |
| Release 上传被拒 >100 MB | GitHub 单文件上限 | 分卷、压缩或走 LFS / split, compress, or LFS |
| `git status` 出现 `embedded git repository` | 试图把根工作区或嵌套仓库收编 | 根永不建仓；插件仓库由它自己管 / never init the root |
| `gh` token 疑似泄露 | 本地文件被同步进仓库 | 立即网页端 revoke + `gh auth refresh`，并按门 1 重扫 / revoke, refresh, re-audit |

---

## 12. 文档地图 / Documentation map

| 文档 / Document | 管什么 / Owns |
|---|---|
| `README.md` | 插件全部功能：工具、CLI、GUI、性能、架构 / every plugin feature |
| `docs/GITHUB.md`（本文 / this file） | GitHub 侧全部功能：仓库、同步、发布、认证、Release、红线 / all GitHub-side features |
| `docs/PUBLISH.md` | 发布管线的操作细节与关键词扫描脚本 / publish pipeline detail + keyword scans |
| `docs/PRIVACY.md` | 隐私审计结论与复查清单 / privacy audit verdict + checklist |
| `docs/awesome-deepseek-agent-entry.md` | 收录投稿条目 / listing submission draft |
| `skill/reference/*.md` | 创作侧：风格、技法、Three.js、双引擎、配色 / authoring side |

---

**最后一条规则 / the one rule:** 仓库里只有"可公开、可重建、无身份"的内容——源码与文档公开，产物可重建，身份只有 noreply。三者有一个不满足，就先过 §5 的门。/ The repo carries only what is public, rebuildable and identity-free — source and docs public, artefacts rebuildable, identity noreply-only. If any of the three fails, run the gates in §5 first.
