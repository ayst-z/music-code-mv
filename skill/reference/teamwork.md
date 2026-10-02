# 团队协作 (Working with agent teams)

智能体在这条流水线上天然可并行：分镜与脚本、渲染、文档、界面是四条互不依赖的活。
本文是**实战规则**——每一条都对应一次真实踩坑。/ Four independent workstreams (storyboard, render, docs, UI) parallelise naturally; every rule below maps to a real incident.

## 1. 什么时候组队 (When to team up)

```text
可并行判据：两条任务的**写入文件集合不相交**，且互不依赖对方的产出 → 并行
         否则 → 串行，或由 lead 自己做
例：  分镜/旁白（新工程目录） ∥ 渲染（帧与编码） ∥ 文档（*.md） ∥ 界面（lib/、locale/、test/）  ✓ 并行
     「改渲染内核」+「改用同一份内核的文档」✗ 串行（同一文件集）
```

只有一件任务、且能在几分钟内做完时**不要组队**——沟通成本高于收益。

## 2. 写入范围 (Write scopes) —— 最重要的一条

开工消息里必须写清「只能改哪些文件」，并**列出明确的禁区**：

```text
【写入范围，只能改这些】<精确到文件或目录>
【绝对禁止】不要改 <同伴的范围>；不要 git add/commit/push；不要访问 127.0.0.1 之外的地址
```

- **git 由 lead 统一执行。** 队友永不 `commit`/`push`——多个写者同时操作暂存区必然打架；lead 在门禁全绿后一次性提交。
- 范围冲突是**规划失误**，不是运气差：分配前先想清楚每个文件归谁。
- 队友**报告**越界需求（"我需要改 `studio.js` 才能继续"），由 lead 决定是否移交范围。

## 3. 消息模板 (Self-contained tasks)

队友看不到你的上下文，一条消息必须自带全部信息：

```text
【任务】一句话说清要什么
【背景】它需要知道的事实（文件路径、已有实现、契约）——假设你没说过任何前情
【约束】写入范围 / 禁止事项 / 网络只允许 127.0.0.1 / 不要 git 操作
【验收】可执行的判定：跑哪条命令、期望看到什么数字
【回报格式】做了什么（文件:行号）· 实测命令与输出 · 遗留点与需要 lead 拍板的事
```

## 4. 门禁时序 (Never commit mid-flight)

**队友写文件的中间态会挂测试**——这是常态而不是异常（重构到一半必然断言不齐）。

```text
if 队友正在写(文件 mtime 很新 or list_agents=running):
    不提交它范围内的文件
    提交自己范围的文件（git add <精确路径>，不要 -A）
    等它回报「已停手 + 测试全绿」再合
违反的后果（实测）：把 64 条绿测提交成 142/4 的红测
```

- 提交前用**精确路径** `git add`，避免把别人的半成品扫进来。
- 门禁四套测试（privacy / studio / plugin / client）+ 配色审计必须**同一次运行**里全绿，再 push。

## 5. 派单与接管 (Delivery and takeovers)

- `send_message` 返回 `accepted` **只代表消息入队，不代表它在跑**。用 `list_agents` / `wait_agent` 确认状态；`inactive` 时再发一次可以唤醒，但**连续多次无效就是死通道**——改为自己做，不要空等。
- 队友卡住时给**二选一通牒**：`A) 按要求做完并回报终态 / B) 回复「卡住+卡点」，我回滚你的改动自己接手`。两条路都给出可验收的测试门槛。
- 长任务按**阶段回报**（旁白合成完 / 每镜 contact 核验 / 中检 / 母版），而不是最后一次性报。

## 6. 没有读图能力时怎么验收 (Verifying what you cannot see)

模型读不了图片时，**别用「应该没问题」代替证据**。可执行的替代口径：

| 想验证 | 用什么量化 |
|---|---|
| 联系表/成片有没有内容 | 像素统计：`mean/std`、黑帧占比 `max<12`、过曝占比 `min>245`、量化色数 |
| 某个视觉元素是否进帧 | 特征色计数（如蓝线框：`b−r>80 && b>140`），前后对照 |
| UI 是否渲染出来 | **DOM 事实**：控件数量、`textContent` 长度、`data-*` 属性、`aria-*` |
| 视频是否完好 | `ffmpeg -v error -i f -f null -` 的退出码 + `Duration`/`Stream #` 行 + 帧数 |
| 音频是否像音乐 | presence 比（1.5–16k/<400Hz）、拍点/拍间能量、L/R 相关、能量 CV |
| 图片是否泄露隐私 | 截图**前**改 DOM 脱敏 + 机审断言（残留用户路径直接抛错拒出图） |

⚠ 读图通道可能返回**陈旧图**（看到的是上一帧）——此时一律切到像素统计，并在回报里注明口径变更。

## 7. 资源竞争 (Contention invalidates benchmarks)

同一台机器上并行渲染会污染计时：实测出现过「单进程比 8 进程快」的假象（其实帧缓存命中）、以及全阶段同时变慢 1.6×（其实队友在跑 1080p）。

```text
量之前：Get-Process（有没有别的 render/ffmpeg 在跑）
量的时候：用**分相计时**（render_at / apply_fx / save 各自单独测）+ 基线标尺（固定算力量一次做参照）
下结论：只信同一次运行内的相对比较，别信跨运行的绝对值
```

## 8. 什么要交给用户 (Escalate, don't decide)

| 类型 | 例子 | 做法 |
|---|---|---|
| 花钱/花时间的大动作 | 重渲 4K120 母版（18GB 帧、小时级）、上传 953MB | 先出小样 → `ask_user_question` 拿到 go 再开 |
| 发布面变更 | 新增 Release 资产、改 README 结论性表述 | 门禁绿 + 内容审核过 → 再发 |
| 需要用户才能拿到的东西 | GUI 登录态、外部网络、图片肉眼复核 | 如实说做不了，给出替代口径 |
| 产品面取舍 | 删掉某个入口、改配色语义 | 用户直接指令优先；lead 同步文档与断言 |

## 9. 协作主循环 (The loop)

```text
lead: 拆任务 → 为每个任务定**不相交的写入范围**与验收命令
lead: send_message(自包含任务)  # 模板见 §3
lead: 同时做自己那份（长渲染尽早启动，它是关键路径）
队友: 干活 → 自测 → 回报(文件:行号 + 实测输出 + 遗留点) → **声明停手**
lead: list_agents 确认停手 → sync --check → 四套测试 + 审计同跑
      → 全绿? 精确路径 git add → commit(双语) → push → 服务端 API 复核
      : 否 → 发二选一通牒(§5) 或回滚接手
lead: 汇总给用户（做了什么 / 实测数字 / 等谁的决策）
```

Working with agent teams is mostly about boundaries and evidence: give each worker a disjoint write scope and an executable acceptance command, never commit while someone is mid-edit, escalate anything that costs hours or changes what ships, and replace "I would have looked at the picture" with numbers when you cannot see the image.
