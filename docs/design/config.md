# 配置说明

## 1. 模型配置（`config/models.json`）

换通道不该改代码——改一行 JSON 就行。

```json
{
  "models": {
    "fast": "opencode-go/deepseek-v4.1-flash",
    "strong": "opencode-go/deepseek-v4.1-flash",
    "mid": "opencode-go/deepseek-v4.1-flash"
  },
  "sessionIdPrefix": "play"
}
```

| 字段 | 必选 | 说明 |
| :--- | :--- | :--- |
| `models.fast` | 否 | 人物认知档。缺省 `opencode-go/deepseek-v4.1-flash` |
| `models.strong` | 否 | 裁判档。缺省同上 |
| `models.mid` | 否 | 渲染档。缺省同上 |
| `sessionIdPrefix` | 否 | opencode 的路由头前缀，缺省 `play`；每次运行追加随机后缀 |

规则：

- **文件不存在 = 用默认值**，不报错。
- **文件存在但写坏了 = 抛错**，不静默降级（把 `fast` 写成空串会直接报 `models.fast` 相关错误）。
- 三档只是**角色标签与成本分桶**，允许全部指向同一个模型。默认就是同一个。
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

## 4. 其他运行时参数

暂不提供配置文件，目前写在代码里的常量：

| 项 | 值 | 位置 |
| :--- | :--- | :--- |
| 单拍上下文上限 | 16k tokens | `docs/design/30-cognition.md` |
| 折场阈值 | 12 拍 / 16k / 地点变化 / 时间跳跃 240 分钟 | `src/core/scene.ts` |
| 检索半衰期 | 48 分钟 | `src/core/character.ts` |
| 试玩存档目录 | `data/starter-town/` | `scripts/play.ts` |
