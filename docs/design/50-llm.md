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
| A3 | 裁判的结构化输出走 tool calling 还是文本 JSON | 见下 |

若走 tool calling：这里的"工具"是**输出通道**（`submit_verdict`），不是能力授予——它不给世界增加任何动作，只把输出装进 schema。人物侧永远不出现工具，因此不违反"人物零词表"。

## 8. 依赖风险

- 安装体积约 35MB（内含 openai / anthropic / google / bedrock SDK），可用 tree-shaking 只注册实际使用的 provider。
- 版本需锁定；该包随 pi 快速迭代，升级前先跑 fixture 冒烟。
