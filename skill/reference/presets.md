# 预设 / Presets

四个开箱即用的预设，解决「从零配色、从零分镜」的问题：一条命令拿到带配色、后期、时长、分镜与占位歌词的工程，立刻就能渲染联系表。
Four presets that remove blank-canvas paralysis: one command yields a project with palette, post-processing, duration, storyboard and placeholder lyrics — renderable immediately.

\`\`\`bash
node scripts/init.mjs my-mv --preset=neon-rain     # 生成并套用预设
node scripts/init.mjs --list-presets               # 列出全部预设
\`\`\`

| id | 名称 / name | 一句话 / in one line |
|---|---|---|
| \`neon-rain\` | 霓虹雨夜 / Neon Rain | 近黑底 + 青绿主色 + 品红高光，扫描线与色差全开 / near-black, cyan base, magenta accent, all post passes on |
| \`ink-paper\` | 纸墨 / Ink & Paper | 浅色纸面 + 墨色字，唯一重色是朱砂，关掉色差与 bloom / light paper, ink type, one vermilion accent |
| \`phosphor\` | 磷光终端 / Phosphor | 纯黑 + 磷绿，扫描线最重，适合排版与终端镜头 / pure black, phosphor green, heaviest scanlines |
| \`dusk-lofi\` | 落日低保真 / Dusk Lo-Fi | 暖橙与玫红，bloom 柔、颗粒重，适合情绪段落 / warm dusk, soft bloom, heavy grain |

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
| \`palette\` | 六个颜色（bg / dim / base / accent / hot / text），写进 \`project.json\`，所有场景直接用 / six colors written into \`project.json\` |
| \`fx\` | 后期开关与强度：chroma、scanlines、bloom、vignette、grain / the post-pass switches and strengths |
| \`duration\` | 工程时长（秒），与 \`fps\` 相乘就是总帧数 / project duration in seconds |
| \`storyboard.shots\` | 六镜头的分镜表，直接覆盖 \`storyboard.md\` / six shots that replace \`storyboard.md\` |
| \`lyrics\` | 五行占位歌词，直接覆盖 \`lyrics.lrc\`，把时间点对齐到分镜 / five placeholder cues aligned to the shots |

预设只改这些「外观与骨架」；镜头代码仍然是 \`src/scenes/\` 里那六个模块，想改哪一镜就改哪一镜。
A preset only sets appearance and skeleton; the six scene modules under \`src/scenes/\` remain yours to edit.

## 怎么用才不浪费 / how to use them well

1. **先选一个最接近气质的预设**，而不是从默认配色开始调。Pick the preset closest to the mood first.
2. **换掉占位歌词**：把 \`lyrics.lrc\` 换成真实歌词，并让时间点对齐副歌。Replace the placeholder cues with real lyrics.
3. **再改分镜**：预设给的是六镜头骨架，镜头内要发生什么仍然由你决定。Then rewrite the shot list.
4. **每改一镜就看一次联系表**（秒级），确认文字在预设配色上仍然可读。Check a contact sheet after every shot change.
5. **浅色预设（\`ink-paper\`）特别注意对比度**：文字用 \`text\`，背景用 \`bg\`，不要用 \`dim\` 画正文。Light presets need deliberate contrast.

## 自定义预设 / a preset of your own

预设就是一个 JSON 文件：把它放进 \`presets/\`，\`--preset=<文件名>\` 立刻可用。
A preset is one JSON file: drop it in \`presets/\` and \`--preset=<name>\` picks it up.
