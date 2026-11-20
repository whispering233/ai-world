# 50 LLM 层

## 1. 结论：不自研供应商适配

用 **`@earendil-works/pi-ai`**（MIT，`1.5.2`，npm 公开）。它提供：统一的多供应商模型集合、自动鉴权解析、token 与成本统计、流式事件、工具调用（含 partial JSON 流式解析）、`fauxProvider()` 脚本化测试桩。

**不写的东西**：provider 适配器、重试、流式协议解析、token 计数、成本计算、key 管理。

## 2. 三个调用点，三档模型

| 调用点 | 频次 | 档位 | 需要结构化输出 |
| :--- | :--- | :--- | :--- |
| 人物认知 | 每拍 × 被叫到的人数 | 便宜/快 | 否（自由文本，含 `inner` / `outward`） |
| 裁判 referee | 每拍 1 次 | **最强** | 是（`order` / `verdicts` / `deltas` / `duration`） |
| 渲染 narrate | 每拍 1 次 | 中 | 否（流式散文） |

三档用配置里的 `provider/model` 表达，**不硬编码**。差档成本差约一个数量级，这是唯一有效的降本手段。

## 3. 真实 API 形状（源自 pi-ai 1.5.2 README，勿凭记忆改写）

```text
builtinModels() / createModels()        建立模型集合
models.getModel(provider, id)           同步取模型
models.stream(model, context)           异步事件流
models.complete(model, context)         一次性返回
Context = { systemPrompt, messages, tools }   可序列化
```

流式事件类型：`start` / `text_start` / `text_delta` / `text_end` / `thinking_start` / `thinking_delta` / `thinking_end` / `toolcall_start` / `toolcall_*`。

鉴权解析顺序：显式 `{ apiKey }` 优先，其次凭据存储（若注入），最后由 provider 从环境变量解析。

**实测确认（1.5.2）**：`complete()` / `stream()` **从不 reject**——未知 provider、未配置鉴权、请求失败都会返回一条 `stopReason: "error"` 的 `AssistantMessage`。因此封装必须在读完消息后显式转成异常，否则失败会被当成「模型说了空话」。

## 4. Context 可序列化 → 入档

`Context` 是可序列化对象，因此**每次调用的输入可以原样存进 llm 日志**（与 `journal.seq` 对齐）。得到四件事：

| 得到 | 用途 |
| :--- | :--- |
| 可回放 | 不重跑模型即可复查"当时它看到了什么" |
| 可对比 | 同一现场换模型/换提示重放，直接对比输出 |
| 可审计 | 判定异常时能定位是现场缺料还是模型跑偏 |
| 可压缩 | 只存必要字段；超限时按五段预算裁剪后的结果存 |

## 5. 测试策略

| 对象 | 策略 |
| :--- | :--- |
| 裁判 | fixture：固定 verdict 序列注入；`core` 不依赖真实模型 |
| 人物 | 只测契约（`inner`/`outward` 存在、长度上限、不越界），不测文风 |
| 渲染 | 只测不越界（不写绝对时间、不写回账本） |
| 整体 | `fauxProvider()` 跑 20 拍冒烟，验证循环不崩 |

**`core` 四个服务都必须能替换为确定性桩**——这是 `50` 与 `00` 里那条纪律的唯一目的。

## 6. 明确不做

- 前端直连模型（key 不进浏览器；引擎在本地服务端）
- 把工具调用能力交给人物（人物零词表）
- 自写 tool-calling 编排框架
- 多供应商自动切换/降级（v1 单档失败就报错，别做套娃）

## 7. 待定

| 编号 | 问题 | 说明 |
| :--- | :--- | :--- |
| A3 | 裁判的结构化输出 | **已定：tool calling**（`submit_verdict`），参数由 pi-ai 按 JSON Schema 校验；模型没调工具时回退文本 JSON |

裁判**不拆成两步**（判合法 / 记账分开）：拆开会把裁判调用翻倍，而 `no_rate` 偏低可以用 schema 强制字段来治。


若走 tool calling：这里的"工具"是**输出通道**（`submit_verdict`），不是能力授予——它不给世界增加任何动作，只把输出装进 schema。人物侧永远不出现工具，因此不违反"人物零词表"。

## 8. pi 生态引入清单

pi 仓库共 10 个包（均已发布为 npm 公开包，MIT）。**只引入 `pi-ai` 一个**；`pi-schema` 是它的既有依赖，可直接使用，不需要额外决定。

| 包 | 版本 | 作用 | 结论 |
| :--- | :--- | :--- | :--- |
| `pi-ai` | 1.5.2 | 统一 LLM API、鉴权、成本统计、流式、工具调用 | **引入** |
| `pi-schema` | 1.5.2 | JSON Schema 构建与校验（无 eval，8.5KB，零依赖） | **白得**（pi-ai 已依赖） |
| `pi-agent-core` | 1.5.2 | 有状态 agent + 工具执行 + 事件流 | 不用（本项目的循环是世界循环，不是 agent 循环） |
| `pi-telemetry` | 1.5.2 | 遥测契约 | 不用（单指标不值） |
| `pi-server` | 1.1.0（自述 experimental） | 本地服务与进程监管 | 不用（不稳定，且不是静态流服务） |
| `pi-storage-sqlite-node` | 0.83.0（落后主版本） | sqlite 会话存储，绑 agent-core | 不用（journal 是自研 append-only） |
| `pi-tui` | 1.5.2 | 终端 UI | 不用（本项目为 Web） |
| `pi-mcp` | 1.5.2 | MCP 客户端 | 不用 |
| `pi-codemode` | 1.5.2 | 沙箱 JS 执行 | 不用 |
| `pi-coding-agent` | 1.5.2 | CLI 编码 agent | 不用 |

### 直接可用的两个能力（无需自写）

| 能力 | 来源 | 用途 |
| :--- | :--- | :--- |
| `validateToolArguments(tool, toolCall)` | `pi-ai` | 任意 JSON Schema 校验；会先把模型发来的 `"42"` 强制为 `42`；错误为 JSON Pointer → 点路径 |
| `repairJson` / `parseJsonWithRepair` / `parseStreamingJson` | `pi-ai` | 文本 JSON 路线的截断修复与增量解析 |

两条路线（tool calling / 文本 JSON）的骨架都已是现成的，因此 A3 的边际成本几乎为零。

## 9. 版本纪律

- 全部锁 `1.5.2`；升级前跑 fixture 冒烟。
- `pi-server`(1.1.0) 与 `pi-storage-sqlite-node`(0.83.0) 与主版本不同步，说明生态内成熟度差异大：**只用与主版本同步的包**。

## 10. 会话缓存、溢出与折叠

### 10.1 结论：不引 `pi-agent-core` 没有丢能力

`pi-agent-core` 只提供 `sessionId`、`thinkingBudgets` 和一个 `transformContext` 钩子（README 注释：“for pruning, compaction”）。**压缩策略本来就是留给应用的**。而缓存与溢出能力都在 `pi-ai` 里：

| 能力 | 位置 | 说明 |
| :--- | :--- | :--- |
| 缓存保温 | `pi-ai` `cache-warming` | TTL、最小期望节省（5%）、idle 续算决策 |
| 溢出检测 | `pi-ai` `utils/overflow` | `isContextOverflow` / `isRecoverableLength`，覆盖约 20 家 provider 的报错模式（含“静默截断”与“静默接受”这两类坑） |
| JSON 修复 | `pi-ai` `utils/json-parse` | `repairJson` / `parseJsonWithRepair` / `parseStreamingJson` |

### 10.2 缓存命中的决定因素：前缀稳定性，而不是库

提示缓存按**前缀**匹配。所以五段顺序是硬约束，不是排版偏好：

| 位置 | 内容 | 稳定性 |
| :--- | :--- | :--- |
| 1（最前） | `core` + `voice` + 全局指令 | 跨拍**完全不变** |
| 2 | `canon`（检索结果） | 半稳定 |
| 3 | 账本切片（相关实体） | 易变 |
| 4 | 记忆检索（≤ 12 条） | 易变 |
| 5（最后） | 最近文本 | 最易变 |

硬规则：

- `fmt(clock)`、玩家输入、随机 id、插件/配置清单**一律不得进 system 段**，只能进尾部。
- 三类调用（人物/裁判/渲染）各自一份稳定前缀，分别命中。
- 缓存断点（若 provider 需要显式标注）：放在第 1 段之后，其次第 2 段之后。

### 10.3 压缩：折场，不是截断

chat 应用必须压缩，因为 transcript 线性增长。本项目的上下文是**场景内追加**的（见 40 §2）：

```text
场景装配（检索一次 + canon + 账本切片） → 拍内追加 → 折场
```

所以：

| 层 | 有界手段 |
| :--- | :--- |
| 场景内 | 只追加，前缀不变 → 缓存命中；12 拍或 16k 上限 |
| 场景间 | **折场**：窗口压成 1–2 条 `experience`，`passage` 留档不再注入 |
| 历史 | 不存“对话历史”，只存账本 / experience / passage 三处 |

剩下两件必须自己做的事：

| # | 事项 | 体量 |
| :--- | :--- | :--- |
| 1 | 前缀稳定性规则（§10.2） | 规则，零代码 |
| 2 | 超限降级顺序：最近文本削减 → 记忆 12→6 → canon 8→3 → 报错 | ~20 行 |

折场才是真正的“压缩”，但它发生在**记忆层**，并且**同时是成长机制**（30 §4）。

### 10.4 什么情况下才真的需要 `pi-agent-core`

- 人物需要多步工具调用/串行工具循环时（v1 不需要：人物零词表）
- 需要 agent 级别的 steering / follow-up 会话控制时

## 11. 依赖风险

- 安装体积约 35MB（内含 openai / anthropic / google / bedrock SDK），可用 tree-shaking 只注册实际使用的 provider。
- 版本需锁定；该包随 pi 快速迭代，升级前先跑 fixture 冒烟。

## 12. 供应商与订阅

默认走 **`opencode-go` 订阅**（与 pi CLI 同一档），不直连 DeepSeek：

| 档位 | 模型 | 输入 $/M | 输出 $/M |
| :--- | :--- | :--- | :--- |
| fast / mid / strong | `opencode-go/deepseek-v4.1-flash` | 0.15 | 0.60 |

**测试与运行一律用这一个模型。** 三档（fast / strong / mid）只是角色标签与成本分桶，不预设换模型；等真的需要为裁判单独升级时再改一行配置。

直连 `deepseek` 同样两个模型是 0.30/1.20 与 1.32/3.96——**订阅价大约是直连的一半**。
凭据复用 pi CLI 的 `~/.pi/agent/auth.json`（只读），不另存 key；`sessionId` 每次运行一个，opencode 用它做路由与缓存亲和。

## 13. 实测结论（20 拍回归之后）

### 13.1 默认模型跟 pi 走，不写死

优先级：`config/models.json` 显式值 > `PI_MODEL` > `~/.pi/agent/settings.json` 的 `defaultModel` > 兜底常量；provider 取 `defaultProvider`。代码里出现具体模型串即为缺陷——它会让项目停留在某一天的默认档上。

启动必须打印实际模型串。三档默认指向同一模型，分档只表达"这个调用点值得多贵的模型"，不表达"要用不同模型"。

### 13.2 延迟的真实构成

| 调用点 | 单次耗时 | 输出 token | 吞吐 |
| :--- | :--- | :--- | :--- |
| 人物认知 | 9–13s | 300–500 | ~35 tok/s |
| 裁判 | 27–36s | 1.2–1.8k | ~100 tok/s |
| 渲染 | 12–20s | 400–800 | ~40 tok/s |

结论：**慢在输出量，不在工具调用、不在首字**。同模型同输入的对照实验里，"带工具"与"纯文本"差距在 1 秒以内；首字实测 1.3 秒。要提速只有三条：减少输出、减少调用数（已做并发）、流式改善体感。

### 13.3 `usage.input` 不可信

同一段 prompt，供应商报回的输入 token 在 25 / 114 / 242 / 1433 之间跳。含义：输入预算与成本核算都不能直接采信这个数。估算一律按字符数走，真实值只用于相对比较。

### 13.4 重试边界的判定是可靠的

`isRetryableAssistantError` 对 `Connection error.: AggregateError (ETIMEDOUT)` 判 true（会重试），对 `Unable to connect. Is the computer able to access the url?` 判 false（不重试，属 fetch 层硬错）。重试次数上涨说明供应商在抖，不是逻辑错。

### 13.5 生态里没有第二个包值得引入

`pi-ai` 已覆盖模型目录、凭据、会话标识、工具参数校验、JSON 修复、溢出检测。`pi-agent-core` 是 agent 循环（prompt→工具→继续），与本项目的世界循环不同构；`pi-coding-agent` 是编码 agent 产品，会带入 TUI / MCP / codemode 与一套我们不用的会话压缩模型。
