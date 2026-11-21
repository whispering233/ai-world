# 设计文档地图

## design/

| 文件 | 内容 |
| :--- | :--- |
| [00-master-design.md](design/00-master-design.md) | 总体设计、已定决策、待定项 |
| [10-world-model.md](design/10-world-model.md) | 三表、账本 5 字段 / 7 op、五条不变式、记忆不对称 |
| [20-referee.md](design/20-referee.md) | 裁判契约、批量结算、三种 verdict、体检指标 |
| [30-cognition.md](design/30-cognition.md) | 人物四层、单次调用、成长三道闸、检索与预算 |
| [40-time-and-loop.md](design/40-time-and-loop.md) | clock / busyUntil / 一拍、时长归属、时间唯一出口 |
| [50-llm.md](design/50-llm.md) | pi-ai 接入、三个模型角色、Context 入档、测试策略 |
| [backlog.md](design/backlog.md) | 延后项与触发条件、监控指标、已知失败模式 |
| [build.md](design/build.md) | 环境、游玩、模型配置、产物位置、故障处理 |
| [config.md](design/config.md) | 模型配置、模型串格式、凭据来源 |
| [tasks.md](design/tasks.md) | 【临时】任务卡片与并行分层 |

## db/

| 文件 | 内容 |
| :--- | :--- |
| [schema.md](db/schema.md) | ledger / fact / journal / passage / character / experience |

## 其他

| 文件 | 内容 |
| :--- | :--- |
| [../CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 |
| [../AGENTS.md](../AGENTS.md) | 项目规则（做错会返工的约束） |

## 尚未创建

- `design/test.md`：测试环境与流程说明，暂由 `build.md` 第 1 节承担
- `api/`：暂不适用（首切片无对外接口，W11 落地后再建）
