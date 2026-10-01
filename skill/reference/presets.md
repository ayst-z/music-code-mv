# 预设 / Presets

预设分两族：**四套氛围预设**解决「从零配色、从零分镜」的问题；**主流 AI 模型配色预设**直接借用被验证过的品牌色骨架。都是 `--preset=<id>` 一条命令拿到带配色、后期、时长、分镜与占位歌词的工程，立刻就能渲染联系表。

Two families: four mood presets that remove blank-canvas paralysis, and a family of mainstream-AI brand palettes lifted straight from already-validated brand design. Either way, one command yields a project with palette, post-processing, duration, storyboard and placeholder lyrics — renderable immediately.

```bash
node scripts/init.mjs my-mv --preset=neon-rain     # 生成并套用预设
node scripts/init.mjs --list-presets               # 列出全部预设
python scripts/render-np.py --init=my-mv --preset=claude   # NumPy 引擎同一套预设
```

### 氛围预设 (Mood presets)

| id | 名称 / name | 一句话 / in one line |
|---|---|---|
| `neon-rain` | 霓虹雨夜 / Neon Rain | 近黑底 + 青绿主色 + 品红高光，扫描线与色差全开 / near-black, cyan base, magenta accent, all post passes on |
| `ink-paper` | 纸墨 / Ink & Paper | 浅色纸面 + 墨色字，唯一重色是朱砂，关掉色差与 bloom / light paper, ink type, one vermilion accent |
| `phosphor` | 磷光终端 / Phosphor | 纯黑 + 磷绿，扫描线最重，适合排版与终端镜头 / pure black, phosphor green, heaviest scanlines |
| `dusk-lofi` | 落日低保真 / Dusk Lo-Fi | 暖橙与玫红，bloom 柔、颗粒重，适合情绪段落 / warm dusk, soft bloom, heavy grain |

### AI 模型配色预设 (AI-model palettes)

品牌色提取流程（主色→`base`、中性→`bg`/`text`、补色→`accent`、饱和点→`hot`，见 `reference/styles.md` 配色逻辑）的成品。每个预设除六角色调色板外，还带**匹配该模型气质的分镜骨架**与 **`three` 镜头逻辑块**（`reference/threejs.md` 的关联表）：

Built by the brand-extraction recipe in `reference/styles.md`; each carries the six-role palette, a storyboard mood matched to the model's personality, and a `three` shot-logic block (mapping in `reference/threejs.md`).

| id | 名称 / name | 一句话 / in one line |
|---|---|---|
| `claude` | Claude 橙白 / Claude Clay | 赤陶橙 + 象牙白，低 bloom、无色差；批注与线稿的气质 / terracotta + ivory, no chroma, calm annotation mood |
| `deepseek` | DeepSeek 蓝黑 / DeepSeek Ink | 深蓝自发光压在近黑上；理性、深空、推理感 / blue emissive on near-black, deep-space reasoning |
| `gpt` | GPT 黑白 / GPT Mono | 纯黑白高对比，零色差；排版就是一切 / monochrome, max contrast, typography is everything |
| `gemini` | Gemini 蓝紫渐变 | 蓝→紫渐变材质，弧线运镜 / blue→violet gradient material, sweeping arcs |
| `grok` | Grok 灰黑 | 单色高对比，glitch 是标点 / monochrome, glitch as punctuation |
| `mistral` | Mistral 焰橙 | 黄→橙→红渐变，光束与电弧 / yellow→orange→red flare, rays and arcs |
| `llama` | Llama 蓝 | Meta 蓝节点图，暗底穿行 / Meta-blue node graph, fly-through on dark |
| `qwen` | Qwen 紫青 | 官方靛蓝 #615ced + 青色第二强调，振动与模态镜头 / official indigo + cyan second accent |
| `kimi` | Kimi 冷蓝 | 官方平台蓝 #1a88ff + 大留白，走廊与光标 / official platform blue, big whitespace |
| `doubao` | 豆包蓝 | 官方 #0057ff 压深灰 #191919，明快消费级 / official blue on dark grey |
| `zhipu` | 智谱蓝 | 官方蓝 + 官方丁香/薄荷点缀色，数据与论文镜头 / official blue with official lilac + mint accents |
| `midjourney` | 航海蓝 | 官方徽记蓝 #4093d4 + 藏青，近单色画面自己说话 / emblem navy, near-monochrome |

**色值来源：** 模型预设的 `base`/`bg`/`text` 取自各品牌**官网 CSS 与官方 logo SVG**（anthropic.com、claude.com、deepseek 官方 logo、gemini.google.com 渐变 token、mistral.ai、x.ai token、Meta 官方 logo、Qwen logo SVG、doubao.com、智谱官网、Midjourney 徽记）；`dim`/`accent`/`hot` 中未见官方定义者为按配色逻辑推导的**美术决定**，在 summary 里注明。联网复核时以官方 brand guidelines 为准。

**Where the hex values come from:** `base`/`bg`/`text` are scraped from official site CSS and official logo SVGs; anything the brand does not define (`dim`/`accent`/`hot`) is an art-directed derivation following the colour logic, noted in the preset's summary. Re-verify against official brand guidelines when online.

每张图都是该预设生成后直接渲出来的联系表（`node tools/make-docs-images.mjs` 重出）。
Each sheet below is a real render of that preset.

| ![neon-rain](img/preset-neon-rain.png) | ![ink-paper](img/preset-ink-paper.png) |
|---|---|
| ❄ `neon-rain` | 📄 `ink-paper` |
| ![phosphor](img/preset-phosphor.png) | ![dusk-lofi](img/preset-dusk-lofi.png) |
| 💚 `phosphor` | 🌇 `dusk-lofi` |

## 预设里有什么 / what a preset carries

| 字段 / field | 作用 / effect |
|---|---|
| `palette` | 六个颜色（bg / dim / base / accent / hot / text），写进 `project.json`，所有场景直接用 / six colors written into `project.json` |
| `fx` | 后期开关与强度：chroma、scanlines、bloom、vignette、grain / the post-pass switches and strengths |
| `duration` | 工程时长（秒），与 `fps` 相乘就是总帧数 / project duration in seconds |
| `three` | Three.js 镜头逻辑：geometry、camera、post、palette→材质槽的 roles 映射（写进 `project.three`，场景经 `env.project.three` 读取）/ Three.js shot logic copied to `project.three` |
| `storyboard.shots` | 六镜头的分镜表，直接覆盖 `storyboard.md` / six shots that replace `storyboard.md` |
| `lyrics` | 五行占位歌词，直接覆盖 `lyrics.lrc`，把时间点对齐到分镜 / five placeholder cues aligned to the shots |

预设只改这些「外观与骨架」；镜头代码仍然是 `src/scenes/` 里那六个模块，想改哪一镜就改哪一镜。
A preset only sets appearance and skeleton; the six scene modules under `src/scenes/` remain yours to edit.

## 怎么用才不浪费 / how to use them well

1. **先选一个最接近气质的预设**，而不是从默认配色开始调。Pick the preset closest to the mood first.
2. **换掉占位歌词**：把 `lyrics.lrc` 换成真实歌词，并让时间点对齐副歌。Replace the placeholder cues with real lyrics.
3. **再改分镜**：预设给的是六镜头骨架，镜头内要发生什么仍然由你决定。Then rewrite the shot list.
4. **每改一镜就看一次联系表**（秒级），确认文字在预设配色上仍然可读。Check a contact sheet after every shot change.
5. **浅色预设（`ink-paper`、`claude`）特别注意对比度**：文字用 `text`，背景用 `bg`，不要用 `dim` 画正文。Light presets need deliberate contrast.
6. **模型预设配母题**：分镜排到 M1–M17 的某个母题时，看 `threejs.md` 的关联表选对应预设的 3D 语言。Match model presets to motifs via the threejs.md mapping.

## 自定义预设 / a preset of your own

预设就是一个 JSON 文件：把它放进 `presets/`，`--preset=<文件名>` 立刻可用（两个引擎都认）。
A preset is one JSON file: drop it in `presets/` and `--preset=<name>` picks it up (both engines honour it).

**加完必跑配色纪律测试：** `python scripts/audit-presets.py` —— R1 对比度 ≥4.5:1、R2 accent 可辨、R3 hot 可辨、R4 结构完整（含 `three.roles`），exit 1 即违规；`--json` 出机读结果。
**After adding, run the discipline test:** `python scripts/audit-presets.py` (contrast, accent, hot, structure incl. `three.roles`; exit 1 on violation).
