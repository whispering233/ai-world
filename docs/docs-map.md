# 设计文档地图

## design/

| 文件 | 内容 |
| :--- | :--- |
| [00-master-design.md](design/00-master-design.md) | 总体设计、已定决策、待定项 |
| [10-world-model.md](design/10-world-model.md) | 三表、账本 5 字段 / 6 op、五条不变式、记忆不对称 |
| [20-referee.md](design/20-referee.md) | 裁判契约、批量结算、三种 verdict、体检指标 |
| [30-cognition.md](design/30-cognition.md) | 人物四层、单次调用、成长三道闸、检索与预算 |
| [40-time-and-loop.md](design/40-time-and-loop.md) | clock / busyUntil / 一拍、时长归属、时间唯一出口 |
| [50-llm.md](design/50-llm.md) | pi-ai 接入、三档模型、Context 入档、测试策略 |
| [backlog.md](design/backlog.md) | 延后项与触发条件、监控指标、已知失败模式 |
| [tasks.md](design/tasks.md) | 【临时】任务卡片与并行分层 |

## db/

| 文件 | 内容 |
| :--- | :--- |
| [schema.md](db/schema.md) | ledger / fact / journal / passage / character / experience |

## 尚未创建

- `design/architecture.md`：技术栈与分包（待 A2 定）
- `design/build.md` / `config.md` / `test.md`：待代码落地
- `design/tasks.md`：任务卡片（临时）
- `api/`：暂不适用（无对外接口）
