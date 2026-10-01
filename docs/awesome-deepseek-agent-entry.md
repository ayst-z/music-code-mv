# 投稿 awesome-deepseek-agent / listing entry

状态 / status：**已准备好，尚未提交 PR**（提交会以你的 GitHub 账号公开发起，所以留给你确认）。仓库已打上 `dsh-plugin` 话题，已出现在 <https://github.com/topics/dsh-plugin>。

目标仓库 / target: <https://github.com/deepseek-ai/awesome-deepseek-agent>

该列表收录的是 **agent / harness 整体**（一行表格 + 一份 `docs/<tool>.md` 指南），不是插件条目。所以本插件以 **DeepSeek Harness 生态的一员**身份投稿：主条目写 DeepSeek Harness，指南里把它列为官方插件示例。

---

## 1. 主 README 里加一行（按字母序，放在 Deep Code 与 DeepSeek-TUI 之间）

```markdown
| **DeepSeek Harness** | Open-source agent harness from DeepSeek with skills, plugins, MCP, subagents, and a Web/Desktop/CLI surface; plugins like `dsh-music-code-mv` render code-driven music videos end to end. | [Guide](./docs/deepseek_harness.md) |
```

中文版 README（`README.zh-CN.md`）同步一行：

```markdown
| **DeepSeek Harness** | DeepSeek 开源 agent harness：skills、插件、MCP、子代理，Web/桌面/CLI 三种界面；插件如 `dsh-music-code-mv` 可以端到端渲染纯代码 MV。 | [指南](./docs/deepseek_harness.md) |
```

---

## 2. 新增 docs/deepseek_harness.md

```markdown
# DeepSeek Harness

DeepSeek Harness (DSH) is DeepSeek's open-source agent harness: a Cordis-based plugin tree that
mounts skills, tools, subagents, MCP servers and model routes, and drives them from a Web GUI,
a desktop app, or the terminal.

## Highlights

- **Plugin-first composition.** Every capability is a plugin row in a profile; plugins can add
  model-facing tools, prompt sections, HTTP routes, and browser UI.
- **Skills.** Reusable task instructions loaded on demand, with reference docs and scripts.
- **Subagents.** In-process fork/spawn delegation, plus Agent Teams for parallel work.
- **Surfaces.** One core, three front ends: Web GUI, desktop app, headless CLI/ACP.

## Getting started

```bash
dsh                                  # start with the default profile
dsh --profile web                    # Web GUI
dsh plugin --profile demo add <pkg>  # add a plugin to a profile
```

## Plugin ecosystem

Plugins are plain npm packages that declare a `dsh.bundle.patch` (host rows) and optionally a
`dsh.client` declaration (browser UI). Browse the [`dsh-plugin` topic](https://github.com/topics/dsh-plugin).

A worked example: [`dsh-music-code-mv`](https://github.com/ayst-z/music-code-mv) scaffolds a
storyboard-first MV project, renders deterministic Canvas2D/Three.js frames in headless Chrome,
encodes them with ffmpeg, and ships a Chinese MV Studio panel inside the DSH right sidebar.

## Learn more

- GitHub topic: https://github.com/topics/dsh-plugin
- Music-video plugin example: https://github.com/ayst-z/music-code-mv
```

---

## 3. 提交 PR（确认后端到端执行）

```bash
# fork + 克隆
gh repo fork deepseek-ai/awesome-deepseek-agent --clone --remote
cd awesome-deepseek-agent
# 应用上面两处改动（README.md 一行 + docs/deepseek_harness.md 新文件）后：
git checkout -b add-deepseek-harness
git add README.md README.zh-CN.md docs/deepseek_harness.md
git commit -m "Add DeepSeek Harness"
git push -u origin add-deepseek-harness
gh pr create --repo deepseek-ai/awesome-deepseek-agent --title 'Add DeepSeek Harness' --body-file ../plugins/dsh-music-code-mv/docs/PR-BODY.md
```

> 需要我先写一份 `docs/PR-BODY.md`、或者直接替你跑上面的命令，说一声即可。

