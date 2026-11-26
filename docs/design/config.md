# 配置说明

## 1. 模型配置（`config/models.json`）

换通道不该改代码——改一行 JSON 就行。

```json
{
  "models": {
    "cognition": "opencode-go/deepseek-v4.1-flash",
    "referee": "opencode-go/deepseek-v4.1-flash",
    "narration": "opencode-go/deepseek-v4.1-flash"
  },
  "sessionIdPrefix": "play"
}
```

键名就是调用点：`cognition` = 人物认知，`referee` = 裁判，`narration` = 渲染。

| 字段 | 必选 | 说明 |
| :--- | :--- | :--- |
| `models.cognition` | 否 | 人物认知角色。缺省跟随 pi 的默认模型（见 §1.1） |
| `models.referee` | 否 | 裁判角色。缺省同上 |
| `models.narration` | 否 | 渲染角色。缺省同上 |
| `sessionIdPrefix` | 否 | opencode 的路由头前缀，缺省 `play`；每次运行追加随机后缀 |
| `retry` | 否 | 临时错误重试：`{ enabled, maxRetries, baseDelayMs }`，缺省 `true / 2 / 800` |

### 1.1 缺省值从 pi 自己的设置推导

```
config/models.json 显式值 > PI_MODEL 环境变量 > ~/.pi/agent/settings.json 的 defaultModel > 兜底常量
provider 一律取 settings.json 的 defaultProvider
```

代码里出现具体模型串即为缺陷：它会让项目停在某一天的默认档上，而 pi 早就换了。启动第一行打印实际使用的四个模型串，调错当场可见。

规则：

- **文件不存在 = 跟随 pi 的默认模型**，不报错。
- **文件存在但写坏了 = 抛错**，不静默降级（把 `cognition` 写成空串会直接报 `models.cognition` 相关错误）。
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
| 试玩存档目录 | `data/starter-town/` | `scripts/play.ts` |
