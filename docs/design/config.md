# 配置说明

## 1. 模型配置（`config/models.json`）

换通道不该改代码——改一行 JSON 就行。

仓库自带的这份文件是**空模板**：一个模型串都不钉，四个角色全部跟随 pi（§1.1）。要固定某个角色，才在 `models` 里写明。

```json
{
  "models": {},
  "sessionIdPrefix": "play"
}
```

键名就是调用点：`cognition` = 人物认知，`referee` = 裁判，`narration` = 渲染，`suggest` = 动作提示。

| 字段 | 必选 | 说明 |
| :--- | :--- | :--- |
| `models.cognition` | 否 | 人物认知角色。缺省跟随 pi 的默认模型（见 §1.1） |
| `models.referee` | 否 | 裁判角色。缺省同上 |
| `models.narration` | 否 | 渲染角色。缺省同上 |
| `models.suggest` | 否 | 动作提示角色。缺省跟随 `cognition`，不另立一档（`50 §2`） |
| `sessionIdPrefix` | 否 | opencode 的路由头前缀，缺省 `play`；每次运行追加随机后缀 |
| `retry` | 否 | 临时错误重试：`{ enabled, maxRetries, baseDelayMs }`。缺省取 `packages/core/src/llm.ts` 的 `DEFAULT_RETRY`（唯一来源）；不写就等于缺省，不必把默认值抄进文件 |

### 1.1 缺省值从 pi 自己的设置推导

```text
model 侧：config/models.json 显式值 > PI_MODEL > ~/.pi/agent/settings.json 的 defaultModel
provider 侧：PI_PROVIDER > ~/.pi/agent/settings.json 的 defaultProvider
两侧都取到，才能拼出 provider/modelId
```

`PI_MODEL` 只有裸模型名（如 `deepseek-v4.1-flash`），provider 必须另取——所以模型与 provider 是**两条并列的链**，不是一个覆盖另一个。

代码里出现具体模型串即为缺陷：它会让项目停在某一天的默认档上，而 pi 早就换了。仓库自带的 `config/models.json` 因此是空模板，不是示例值。启动第一行打印实际使用的四个模型串，调错当场可见。

规则：

- **仓库自带的配置不钉任何模型**：四角色全部跟随 pi；要钉死才写进文件。
- **文件不存在 = 跟随 pi 的默认模型**，不报错。
- **文件存在但写坏了 = 抛错**，不静默降级（把 `cognition` 写成空串会直接报 `models.cognition` 相关错误）。
- **两条链都取不到 = 启动报错退出**，不回退任何内置常量。静默兜底会让项目停在某一天的默认档上，而启动日志看起来一切正常。
- 四个角色只是**调用点标签与成本分桶**，允许全部指向同一个模型。默认就是同一个。
- 路径可用环境变量 `AI_WORLD_CONFIG` 覆盖，便于并行跑不同通道。

## 2. 模型串格式

`provider/modelId`，provider 必须在 pi-ai 的供应商目录里（`@earendil-works/pi-ai/providers/all`）。常用：

| 串 | 输入 $/M | 输出 $/M |
| :--- | :--- | :--- |
| `opencode-go/deepseek-v4.1-flash` | 0.15 | 0.60 |
| `opencode-go/deepseek-v4-pro` | 0.66 | 1.98 |
| `deepseek/deepseek-flash`（直连） | 0.30 | 1.20 |
| `deepseek/deepseek-v4-pro`（直连） | 1.32 | 3.96 |

## 3. 凭据

- **订阅式供应商**（`opencode-go`）：复用 pi CLI 的 `~/.pi/agent/auth.json`，只读，不另存 key。
- **环境变量**：直连供应商从环境读（如 `DEEPSEEK_API_KEY`）。
- 显式 `apiKey` 优先级最高（本程序暂不使用）。

### 重试为什么由库负责

`pi-ai` 自带 `retryAssistantCall(produce, policy, signal)`：只重试它判定为**可重试**的错误（连接重置、超时、5xx），配额与鉴权错误立刻返回。`llm.chat` 走的正是这条路径，重试次数会计入体检表。

实测边界（别再猜）：`Connection error.: AggregateError (ETIMEDOUT)` 判为可重试；`Unable to connect. Is the computer able to access the url?` 判为不可重试。

注意：安装的 pi CLI 构建里找不到消费 `settings.retry` 的代码，"pi CLI 的默认重试就是这一套"这句话**没有证据**，不要据此推断 CLI 与本项目的重试行为一致。

## 4. 其他运行时参数

暂不提供配置文件，目前写在代码里的常量：

| 项 | 值 | 位置 |
| :--- | :--- | :--- |
| 单拍上下文上限 | 16k tokens | `docs/design/30-cognition.md` |
| 折场阈值 | 12 拍 / 16k / 地点变化 / 时间跳跃 240 分钟 | `packages/core/src/scene.ts` |
| 检索半衰期 | 48 分钟 | `packages/core/src/character.ts` |
| 世界选择 | `AI_WORLD` 环境变量，缺省 `starter-town` | `packages/content/src/load.ts` 的 `DEFAULT_WORLD`（唯一来源） |
| 试玩存档目录 | `data/<world>/` | `packages/core/src/store.ts` 的 `dataDir()`（唯一来源） |
| 模型配置文件路径 | `config/models.json`，`AI_WORLD_CONFIG` 可覆盖 | `packages/core/src/config.ts` 的 `DEFAULT_CONFIG_PATH` |
| pi 状态目录 | `~/.pi/agent` | `packages/core/src/config.ts` 的 `piAgentDir()` |
| 重试策略缺省 | `true / 2 次 / 800ms` | `packages/core/src/llm.ts` 的 `DEFAULT_RETRY` |
