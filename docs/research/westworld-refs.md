# 西部世界内容包与机制扩展：可参考项目调研

> 调研时间：2026-11-26。只判断**思路能不能借**，不评估代码质量。活跃度取 GitHub API（stars / 最后 push）。
>
> 结论先行：能借的只有三样——**信任账本**、**记忆的取用与过期口径**、**前史与 lorebook 当内容写**。其余（向量检索、反思树、多模块认知、persona 策略引擎、plan 持久对象）全部撞上“只有 referee 能写账本”与“不做阶段化认知”两条硬约束。

## 1. 对照表

| 项目 | 机制 | 可抄的具体点 | 不该抄的点 |
| :--- | :--- | :--- | :--- |
| **generative_agents**（Stanford，★22.4k，最后提交 2024-08，已冻结） | memory stream：自然语言记录 + poignancy 1–10 + embedding；检索 = 归一后的 recency(0.99^小时) + importance + relevance 等权；重要性累计到 150 触发反思（insight 树）；日程 日→小时→5–15 分钟 三层分解 | “重要性累计到阈值才反思”这一口径可对齐本项目已有的 heat 闸；日程只当**文本**交给作者侧写 | embedding 检索、反思树、把 plan 当持久对象、每 agent 一进程并发 |
| **ai-town**（a16z，★10.9k，最后提交 2026-11，活跃） | 确定性 engine：1s step + 输入队列 + 历史重放；agent 每秒最多唤醒一次；记忆 = 对话总结 + importance + embedding，检索 0.99^小时 只取 3 条；重要性和 >500 才反思；**两周清一次记忆** | ① 记忆过期（本项目改成“检索不再取出”而非删除）；② 拍内上限：对话冷却 / 最长 8 条 / 10 分钟；③ 输入日志重放 ↔ 本项目 journal replay | Convex、向量库、多人实时同世界、agent 常驻 1s 循环 |
| **concordia**（DeepMind，★1.9k，最后提交 2026-11，活跃） | 桌面 RPG 模式：玩家实体用自然语言声明意图，**Game Master 实体**翻译成结果；entity + component；GM prefab 有 generic / scripted / interrupt_driven / situated_in_time_and_place；prefab 有 rational、basic_with_plan、formative_memories_initializer | ① “GM 只翻译意图、不自己持有世界状态”就是本项目 referee 的同构物，可直接引用来支撑现架构；② `formative_memories_initializer` = 开场前一次调用写前史**内容**（放内容包，不进运行时）；③ `scripted` GM 是“园区剧本 / 夜间重置”的写法参考 | entity-component 装配、prefab 继承、embedding 记忆、让 LLM 自己当物理裁判 |
| **Project Sid / PIANO**（Altera，论文 2024-10；altera-al/project-sid ★1.4k 仓库只有论文 PDF，2024-11 后无代码；PIANO 无独立实现，未核实） | PIANO = Parallel Information Aggregation via Neural Orchestration：多个并发认知模块（感知 / 记忆 / 目标 / 社交）以不同节奏跑，聚合成单一连贯输出；10–1000+ agent，Minecraft | 只借一条：“慢模块不必每拍调”的节流——本项目落成**冷却**（drives 仅在 referee 的 driveHits 触发时才热），不引入模块系统 | 多模块并行 + 神经聚合（正是被禁的阶段化认知）、千 agent 并发、自带世界模型 |
| **gen0cide/westworld**（★4，AGPL-3.0，最后提交 2026-06；目前唯一真“西部世界”开源实现） | 拿开源 RuneScape Classic 服务器当“公园”，host 用 2001 原版协议接入；分层认知（确定性反射 → routine DSL → LLM 只在顶层 plan / reflect）；persona **编译成策略**可否决动作；记忆分层 + 只记显著事件的 episodic journal + 按对象累积的 **Beta(α,β) 信任账本** + 带 confidence / provenance 的世界知识；每次决策落盘 | ① 信任账本：`beliefs[某人] = { 说法, 证据次数 }`，不新增存储层；② 知识带 confidence / provenance，正对 `beliefs` 与 fact 的 `supersededBy`；③ “前世”：记忆跨登录存活、下次登录读它（未见显式擦除机制，未核实） | Go 多进程 fleet、gRPC、pebble 分层 KV、routine DSL（等于动作词表，明令禁止）、把 host 当真实游戏客户端 |
| **TheoLvs/westworld**（★61，2023-01 停更） | 同名异物：Python 网格多智能体仿真库（RL / 寻路 / 刚体），与 LLM 叙事无关 | 无 | 全部：网格、刚体、寻路。本项目坐标不建模，换面才 `transfer` |
| **MemoryBank**（★456，最后提交 2023-05，停更） | 中文长对话记忆库：Ebbinghaus 遗忘曲线 + 记忆强度随检索加强 + 用户画像 | 遗忘曲线的具体口径：强度随时间衰减、被取用就加强。本项目 `w×0.5^(dt/48)` 只有衰减那一半 | 向量库、摘要链、画像抽取 |
| **Letta / MemGPT**（★25.6k，最后提交 2026-10，活跃） | core memory blocks 常驻上下文、archival 检索、agent 自己编辑记忆 | “人设块常驻 + 其余检索 + 块有硬 token 上限”——本项目 `core` 200–400 字已是同一取舍，可引用支撑 | agent 自编辑记忆（绕过 referee 的写入权） |
| **SillyTavern**（★36.1k，最后提交 2026-11，活跃） | character card + lorebook（关键词触发的设定注入）+ 历史管理 | lorebook 的“关键词命中才注入”规则与别名处理（本项目 §6 已给 lorebook 20% 预算） | 前端壳、正则脚本引擎、运行时随手改设定 |

## 2. 与本项目的关键差异（逐项）

- **generative_agents**：本项目一拍一次调用、五段 16k 预算、检索 = 时间衰减 + 权重取 12 条，无向量库、无反思生成（[30 §5](../design/30-cognition.md)）。
- **ai-town**：本项目世界层才是一拍，人物不是常驻循环；单进程单玩家；账本取代游戏引擎。
- **concordia**：只有一个提交层（referee），输出是结构化 deltas 而非自由文本；没有组件 / prefab 装配。
- **Project Sid**：PIANO 的模块化与“不做阶段化认知”直接冲突；规模差三个数量级，成本模型不可移植。
- **gen0cide/westworld**：没有真实客户端 / 协议层；无分层 KV，账本是唯一真相；host 是人物，不是玩家替身。
- **TheoLvs/westworld**：无坐标建模，同名不构成参考。
- **MemoryBank**：本项目 `experience` 只追加、检索不回写（可回放优先），所以只能借“过期”，不能借“强化”。
- **Letta**：没有人能自己写状态，写入权只在 referee。
- **SillyTavern**：内容走 `content/` 校验，lorebook 不是运行时用户可改的。

## 3. 结论：对本项目 3 条建议

1. **西部世界包做成内容，不做代码。** host 前史进 `core`（200–400 字）；园区规则进 canon / lorebook；“host loop / 日程”写成作者侧文本，由 `clock` + 一拍推进，不做 plan 对象；“记忆清除”用三条既有机制组合：fact 推翻 = 新增 + `supersededBy`、旧 `experience` 不删只让权重衰减、`phys.<host>.loop` 键写明“谁解除”（登记 [schema §9](../db/schema.md)）。设定抄 gen0cide，技术栈不抄（AGPL 也提示不要拷代码）。
2. **机制扩展只加两条便宜且能验证的**：① 信任账本——`beliefs` 加证据计数，数据从 referee 已有的 fact / `driveHits` 出；② 记忆过期口径——照 ai-town 的两周口径，但实现为“检索不再取出”并写进 journal 保持可回放。其余一律不抄：反思树、embedding 检索、persona 策略引擎、多模块认知，每条都会绕过 referee 或引入阶段化认知。
3. **导演层不扩运行时 agent。** Concordia 的 GM 与 PIANO 的聚合都指向“每次提交只有一个裁决者”，本项目已有；西部世界的“Ford 改剧本 / 夜间重置”应落成作者侧内容 + 一条世界事件 claim 交裁判，而不是常驻导演进程。storylet 已冻结，别为了“自动重置”解冻它。

## 4. 来源

- generative_agents：<https://github.com/joonspk-research/generative_agents>（recency_decay 0.99、importance_trigger_max 150 见 `persona/memory_structures/scratch.py`）；论文 <https://arxiv.org/abs/2304.03442>
- ai-town：<https://github.com/a16z-infra/ai-town>（`convex/constants.ts`：`VACUUM_MAX_AGE` 两周、`MAX_CONVERSATION_MESSAGES` 8；`convex/agent/memory.ts`：0.99^小时 排序、反思阈值 500）
- concordia：<https://github.com/google-deepmind/concordia>；技术报告 <https://arxiv.org/abs/2312.03664>；prefab 清单见 `concordia/prefabs/entity`、`concordia/prefabs/game_master`
- Project Sid / PIANO：<https://arxiv.org/abs/2411.00114>；<https://github.com/altera-al/project-sid>
- gen0cide/westworld：<https://github.com/gen0cide/westworld>（机制细节见 `docs/memory.md`、`docs/cognition-and-autonomy.md`）
- TheoLvs/westworld：<https://github.com/TheoLvs/westworld>
- MemoryBank：<https://github.com/zhongwanjun/MemoryBank-SiliconFriend>
- Letta：<https://github.com/letta-ai/letta>
- SillyTavern：<https://github.com/SillyTavern/SillyTavern>
- 本项目口径：[30-cognition](../design/30-cognition.md)、[20-referee](../design/20-referee.md)、[AGENTS.md](../../AGENTS.md)、[schema.md](../db/schema.md)