# 多 Agent 编排架构调研

> 调研时间：2026-11-21。目的：回答“人物能不能像 agent 一样互相交流、世界状态能不能交给中央 agent 管理”，以及 ai-world 是否应该保留裁判层。
>
> 结论先行：**保留裁判作为唯一提交层；多 agent 的自由放在提交之前（通信、提案、导演），不放在提交之中（账本写入）。** 中央 supervisor 可以作为调度/导演/第三 claim 来源，但不能直接写 ledger。

## 1. 问题与边界

ai-world 当前的核心约束（见 [10-world-model](../design/10-world-model.md)、[20-referee](../design/20-referee.md)、[00-master-design](../design/00-master-design.md)）：

- 只有 referee 能写 `ledger` 与 `facts`；
- 一拍一次批量结算，同一裁决内的改动要么全成、要么全退；
- 文本不是证据，账本与文本冲突时以账本为准；
- 时间只有一个出口 `fmt(clock)`；
- fact 只增不改，推翻旧事实 = 新增 + `supersededBy`；
- 状态必须可回放。

调研的问题是：如果把人物做成 per-character agent，或者把世界状态交给一个中央 agent 管理，会不会更灵活？如果会，代价是什么？

## 2. 参考系统

### 2.1 Claude Code Agent Teams

**是什么**：一个 lead 会话 + 多个 teammate 会话；teammate 有独立上下文，共享任务列表，可以直接互相发消息；每个 teammate 是完整的独立 Claude Code 会话。功能当前是 experimental，默认关闭，已知限制包括 session 恢复、任务协调和关闭行为。

**它怎么处理共享状态**：

- 官方文档明确说：两个 teammate 编辑同一个文件会导致覆盖；要靠“每人拥有不同文件”来避免冲突。
- 它适合独立并行的探索/审查/跨层任务；官方也说顺序任务、同文件编辑、强依赖任务更适合单会话或 subagent。
- 协调有额外成本，token 消耗显著高于单会话。

**对 ai-world 的启示**：

- agent 可以聊天、可以并行，但**共享可变状态仍需要所有权/合并规则**。
- ai-world 的 ledger 是“所有人物都会碰的同一个文件”；referee 就是那个所有权/合并规则。
- Claude Code 的 teammate 冲突靠“不同文件”避免；世界模拟不能避免冲突，因为争同一瓶酒、同一枚银元、同一扇门就是玩法本身。

来源：<https://code.claude.com/docs/en/agent-teams>（2026-11-21 访问）。

### 2.2 Orca 与 Herdr

**是什么**：

- **Orca**：桌面 Agent IDE，把多个 CLI agent 放进隔离的 git worktree，带内置编辑器、任务/自动化面板、git 跟踪和移动端 companion。
- **Herdr**：终端原生的 agent 多路复用器（“a binary, not an app”），保活 agent 的 PTY 会话，支持 SSH/手机重连，跟踪 `blocked / working / done / idle` 语义状态，并提供 agent-shaped API（`read / send / wait / split / attach`）。

**它们怎么处理共享状态**：

- 两者都围绕“多个 agent 并行 + 隔离分支”；真相仍在 git/文件，人（或 lead）负责 review/merge。
- Herdr 的语义状态解决的是“哪个 agent 卡住了/在干活/完成了”的注意力问题，不是“世界真相”。
- 它们管理的是**并行工作和注意力**，不是状态提交。

**对 ai-world 的启示**：

- 编排层 ≠ 提交层。你可以把 agent 管得很漂亮，最后仍要一个 merge/review 门。
- ai-world 的 referee 就是那个门，只是它裁决的不是 diff，而是“这一拍哪些 claim 成立”。
- 可以借“语义状态/注意力面板”做作者调试模式，但不要借“多 agent 各自写共享状态”。

来源：<https://www.onorca.dev/>；独立对比文章 <https://dev.to/kimcomplete/orca-vs-herdr-agent-ide-or-terminal-multiplexer-for-coding-agents-4lfe>（2026-11-21 访问；该文为独立编辑对比，非厂商官方文档）。

### 2.3 DeepSeek Harness Super-agent

**是什么**：DeepSeek Harness 团队 2026-10-31 公开的研究型架构，配套原型 `dsh-superagent-prototype`（MIT，研究代码，非生产）。

**核心结构**：

- **Router / Worker 双层**：Router 是持续运行的全局协调节点，接收群聊、GitHub、邮件等多渠道消息，维护共享上下文并分派任务；Worker 各自维护独立上下文，并行执行问题复现、代码审查、功能开发，必要时可调用 Subagent。
- **事件驱动 + 两级过滤**：AI 在无人 @ 时也能按规则主动发现工作。
- **异步 ReAct Loop、存算分离、外部 Watchdog**：支持长期运行、后台执行和故障恢复。
- **原型实现**：Engine / Store / Policy / Assessor / Executor / Assignments / Tickets / Outbox / Effects。Worker 报告 assignment 的 started / inputs / report，Engine 决定 effect 并落 Store；不是 worker 直接改共享状态。

**它解决的是什么**：人类注意力瓶颈——一个人通常只能同时跟进 3–5 个活跃会话；Super-agent 把会话管理、上下文同步、任务分派从人手上移到系统层，人负责目标设定和结果验收。

**对 ai-world 的启示**：

- 即使最“自主”的架构，也有一个中央 Engine/Store/Outbox 做提交与副作用；“Super”的是任务调度，不是取消状态机。
- Router 可以类比为“导演/调度层”：决定谁做什么、什么时候做；Worker 可以类比为“人物/执行单元”。
- 但 Worker 不能绕过 Engine 直接改 Store；ai-world 的人物也不能绕过 referee 直接改 ledger。
- 原型是研究代码，不适合作为 v1 依赖；可以借结构，不借实现。

来源：<https://github.com/deepseek-ai/dsh-superagent-prototype>；`docs/000-philosophy.md`、`docs/007-architecture.md`；公开报道（2026-10-31）。原型 README 明确说明它是 research code，不是 production-ready software。

### 2.4 pi 生态

| 包 | 形态 | 对 ai-world 的意义 |
| :--- | :--- | :--- |
| `@earendil-works/pi-ai` | 无状态模型调用层；`Context` 每次传入；`sessionId` 是 provider 的缓存/路由提示 | 当前正在用；适合“每次重新装配上下文”的引擎 |
| `@earendil-works/pi-agent-core` | 有状态 agent，工具执行 + 事件流；模型控制多轮循环 | 只有人物需要多步工具调用时才考虑；v1 人物零词表，不需要 |
| `@earendil-works/pi-durable` | experimental；durable conversation / task / document runtime；提交后才展示，崩溃后恢复 | 可作为未来“durable beat task”的候选，不是 per-character 记忆，也不是世界写入口 |

`pi-ai` 的 `sessionId` 不是对话状态。类型注释写的是：支持 session-based caching 的 provider 可以用它做 prompt caching、request routing 或其他 session-aware 特性。`cacheRetention` 默认 `"short"`；Anthropic 的 message threads 需要 `sessionId` + cache retention，并在结束时调用 `cleanupSessionResources(sessionId)`。

`pi-durable` 的核心是“把 conversation / task / document 原子提交，进程挂了能恢复”。它不会自动给你一个世界事务函数；账本如何提交、谁有权写，仍然要自己定义。

来源：本地 `~/projects/ai-world/node_modules/@earendil-works/pi-ai` 的 README 与类型；`@earendil-works/pi-durable` npm README（1.6.0）；`@earendil-works/pi-agent-core` README。

## 3. 对比

| 维度 | Claude Code Agent Teams | Orca / Herdr | DeepSeek Super-agent | ai-world 现状 |
| :--- | :--- | :--- | :--- | :--- |
| 解决的问题 | 多会话并行探索/实现 | 多 agent 并行工作与注意力 | 多任务自主调度、人类注意力 | 可验证的文字世界 |
| 协调者 | lead | 人 / lead | Router | 引擎 + referee |
| 共享状态 | 文件/代码库 | git worktree/文件 | Engine/Store | ledger/facts/journal |
| 冲突处理 | 避免同文件；靠 ownership | 分支隔离 + 人 review/merge | Engine/Policy/Outbox | referee 批量裁决 + 事务提交 |
| 验证器 | 编译器/测试/人 | git diff/人 | 测试/PR/Policy | referee + 纯函数 commit + replay |
| 失败语义 | 局部失败，人介入 | 单 agent 卡住/重试 | Assignment 失败/重试/挂起 | 人物沉默 / 整拍空转 / 整拍回滚 |
| 适合的自由度 | 独立任务并行 | 并行工作 | 任务调度 | 生成层自由，提交层严格 |

## 4. 为什么 ai-world 保留裁判

### 4.1 通信 ≠ 状态变更

人物可以自由交流：说、试探、撒谎、谈判、拒绝。这些是 `outward` claim。但“哪些 claim 变成事实”是另一个问题。referee 是那个决定函数。

### 4.2 冲突是玩法，不是事故

多 agent 编码系统靠隔离避免冲突；世界模拟靠冲突产生戏剧。两个人争同一瓶酒、同一枚银元、同一扇门，必须有仲裁者。没有裁判，你要么让所有 claim 都成立（矛盾），要么让先到者赢（不公平且不可审计），要么引入共识协议（对单机单人世界过重）。

### 4.3 七个具体失败模式

| 失败 | 例子 |
| :--- | :--- |
| 双花 | 安把最后一瓶酒卖给玩家，科迪同时也拿走了同一瓶 |
| 矛盾事实 | A 说门锁了，B 说门开着；两条都进账本 |
| 知识通胀 | 每句话都自动变成事实；世界只剩“说” |
| Retcon | 后一个 agent 推翻前一个已经发生的事 |
| 时间混乱 | 每个 agent 自己推进 clock |
| 半提交 | 钱扣了货没到；一人成功一人失败但只写一半 |
| 不可回放 | 状态散在 N 个 transcript 里，重启无法还原 |

### 4.4 裁判不是“全知的中央大脑”

referee 只看得到 `outward` claims 和可观测账本，看不到人物的 `inner`、`beliefs`、`drives`。这是记忆不对称的一部分。一个“中央世界代理”如果要管理人，就得读人物的私有状态；读得越多，人物越像提线木偶。referee 的“看不见”是特性。

### 4.5 非确定性只允许出现在一个地方

referee 本身是 LLM，输出不确定；但 `commit()` 是纯函数，裁决结果进 journal 后可重放。**非确定性被隔离在“生成 verdict”这一步，提交是确定的。** 如果中央 agent 直接写世界，模型就成了事务管理器；你仍然需要 schema 校验、op 前置条件、原子提交、时钟 clamp、回放——只是更不确定、更难测。

## 5. “中央代理管理人物”应该放在哪

可以存在，但要拆成两个角色：

| 角色 | 做什么 | 不做什么 |
| :--- | :--- | :--- |
| **调度 / 导演（Supervisor）** | 决定这一拍叫谁、节奏、注入事件、提出候选 claim | 不直接写 ledger/facts |
| **裁决（Referee）** | 判定 claim 是否成立、写哪些 op、多久、冲突怎么解 | 不决定故事节奏、不替人物说话 |

把两者合并，等于让导演兼裁判兼记账。可以让 Supervisor 成为 **claim 第三来源**（`backlog.md` 的 storylet/导演层），或者成为 `calledActors` 的增强，但写入口仍然只有一个。

## 6. 可做的实验（按成本从低到高）

| 实验 | 做法 | 度量 | 结论门槛 |
| :--- | :--- | :--- | :--- |
| 一拍内多轮对话 | 人物 A 的 `outward` 先给 B 看，B 可回一句，再一起交给 referee；最多 2 轮 | 矛盾率、双花、成本、延迟、人物声音是否更活 | 质量提升 > 成本增加才保留 |
| self-retry 控制臂 | 同样两轮，但第二轮只看到自己的草稿，不看别人 | 与 cross-talk 的差值 | 用来区分“多一次调用”本身的效果 |
| 导演层作为第三 claim 来源 | Supervisor 只产出候选事件/节奏指令，不写账本 | 重复感、推进感、玩家找不到事做的比例 | 第 3 天仍不重复才保留 |
| 裁判审计员 | referee 之后加一次只读审计，通过/打回，不共同写 | 纠正率、额外成本 | 高价值拍才启用 |
| durable beat task | 用 `pi-durable` 把一拍做成 task，崩溃后续跑；账本仍由 referee 提交 | 恢复成功率、复杂度 | 只在需要崩溃恢复时做 |
| per-character agent | 每个人物保活一个 agent 会话 | 人格稳定性、记忆一致性、双花/矛盾率、成本 | 只有前四项都明确更好才考虑 |

实验都必须在**裁判仍是唯一写入口**的前提下做；否则不是“更灵活”，是换了一个产品。

### 6.1 运行方式

```sh
pnpm experiment:multi-round -- --beats 6 --mode all --tag pilot-1
```

- `--mode baseline|self-retry|cross-talk|both|all`：只跑一臂或组合；默认 `all`（三臂）；
- `self-retry` 是控制臂：同样两次认知，但第二轮只看到自己的草稿，看不到别人；
- `--beats N`：拍数上限；
- `--tag`：数据目录后缀，避免两轮混在一起；
- `--data`：根目录，默认 `data/experiment`；
- `--force`：覆盖同 tag 的已有 journal。

产物：`data/experiment/<tag>/<arm>/{journal.jsonl,passage.jsonl,metrics.jsonl,metrics.json,report.md}`。`report.md` 含汇总表、写操作分布和 3 个样本拍（人工看人物声音）。

首次 pilot 结果见 [multi-round-experiment.md](multi-round-experiment.md)：6 拍三臂，cross-talk 回声 45.8%、`no_rate` 13.3%、成本约 +10%（对 self-retry）；没有硬冲突优势。

## 7. 结论

- **保留裁判**：它是这个项目的提交层，不是可选的中间件。
- **多 agent 的自由放在提交之前**：通信、提案、导演、审计都可以加；账本写入不加。
- **中央 supervisor 可以做调度/导演/第三 claim 来源**，不能做账本写入口。
- **`pi-durable` 的正确位置是 durable beat task**，不是 per-character 记忆，也不是世界 transcript。
- **如果放弃可验证账本/原子拍/可回放**，peer-to-peer 多 agent 世界是成立的——但那是另一个产品，需要重写 `10-world-model.md` 的不变式，不是加一个开关。

## 8. 来源与可信度

| 类型 | 来源 | 可信度/限制 |
| :--- | :--- | :--- |
| 官方文档 | Claude Code Agent Teams（experimental） | 官方行为描述；功能仍 experimental，限制会变 |
| 官方文档/代码 | `dsh-superagent-prototype` 的 README、`docs/000-philosophy.md`、`docs/007-architecture.md` | 研究代码，README 明确说不适合生产；文章中的部分设计未在原型实现 |
| 公开报道 | DeepSeek Super-agent 的 Router/Worker、事件驱动、存算分离、Watchdog | 用于理解设计意图；具体性能数字未在本仓复现 |
| 独立对比 | Orca vs Herdr 的对比文章、厂商页面 | 独立编辑对比，非厂商官方；版本与数据会变 |
| 本地包 | `pi-ai` / `pi-agent-core` / `pi-durable` 的 README 与类型 | 与当前安装版本一致；`pi-durable` 为 experimental |
| 本仓 | `docs/design/*`、`packages/core/src/*` | 当前实现与约束 |

**未验证**：没有在本仓运行多 agent 对照实验，也没有复现 Super-agent 的性能数字；本文的结论是架构分析，不是 benchmark。

## 9. 相关文档

- [00-master-design](../design/00-master-design.md)：决策 #5、#25、#30，§7 “不做第二写入口 / 不做多 agent 自由写世界”
- [10-world-model](../design/10-world-model.md)：三表、五条不变式、记忆不对称
- [20-referee](../design/20-referee.md)：裁判契约、批量结算、三种 verdict
- [50-llm](../design/50-llm.md)：pi-ai 接入、四个模型角色、缓存前缀
- [backlog](../design/backlog.md)：storylet/导演层、per-character agent、作者/调试模式
- [ui/DESIGN](../ui/DESIGN.md)：玩家阅读面布局
