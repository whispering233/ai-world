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
| [60-server.md](design/60-server.md) | 服务端进程、一拍生命周期、中止语义、内容生命周期、两种壳、包结构与组件方案 |
| [backlog.md](design/backlog.md) | 延后项与触发条件、监控指标、已知失败模式、下一步候选、UI 待办（说话人分层、思考过程反馈） |
| [build.md](design/build.md) | 环境、游玩、模型配置、产物位置、故障处理 |
| [config.md](design/config.md) | 模型配置、模型串格式、凭据来源 |
| [tasks.md](design/tasks.md) | 【临时】未完成的任务卡片（约定进设计文档，候选进 backlog §5） |

## db/

| 文件 | 内容 |
| :--- | :--- |
| [schema.md](db/schema.md) | ledger / fact / journal / passage / character / experience |

## ui/

| 文件 | 内容 |
| :--- | :--- |
| [DESIGN.md](ui/DESIGN.md) | 玩家阅读面布局、视觉方向与交互契约 |

## research/

| 文件 | 内容 |
| :--- | :--- |
| [multi-agent-architectures.md](research/multi-agent-architectures.md) | 多 Agent 编排架构对比、Super-agent / Claude Code Teams / Orca·Herdr，及 ai-world 保留裁判的理由 |
| [multi-round-experiment.md](research/multi-round-experiment.md) | 一拍内多轮对话 pilot：baseline / self-retry / cross-talk 三臂、成本、回声率、硬冲突与结论 |
| [world-baseline.md](research/world-baseline.md) | 20 拍世界基线：物质流、时间钉死、知识通胀、名字泄漏与探针说明 |
| [cache-prefix.md](research/cache-prefix.md) | cognition 前缀顺序与 6 拍缓存计量（cacheRead/cacheWrite），以及不能宣称的结论 |
| [t2t3-smoke.md](research/t2t3-smoke.md) | T2/T3 合并后的 10 拍 smoke：拍速、no_rate、空结果、两个冲突的口径，以及对 T4/T5 的输入 |
| [t4t5-smoke.md](research/t4t5-smoke.md) | T4/T5 合并后的 12 拍 smoke：NPC 拒绝归零、段落 2–5、折场一次、85% 空结果与 token 口径 |
| [fact-structure.md](research/fact-structure.md) | fact 的 actor/kind 6 拍 smoke：10/10 覆盖、kind 分布与样本，不是密度回归 |
| [storylet-probe.md](research/storylet-probe.md) | 裁判对非人 actor 世界事件的 6 次裁决；填肉 3 条；10 拍 A/B v1/v2/v3（v1 净收益为负，v2 落账 2/2 但空转拍未降，v3 顶掉玩家动作）；3 次重复与 R1 后重测（§16–§19）的结论：抽卡无收益，瓶颈在骨架与账本状态不相容 |

## 其他

| 文件 | 内容 |
| :--- | :--- |
| [../CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 |
| [../LICENSE](../LICENSE) | MIT 许可证 |
| [../AGENTS.md](../AGENTS.md) | 项目规则（做错会返工的约束） |

## api/

| 文件 | 内容 |
| :--- | :--- |
| [00-api-index.md](api/00-api-index.md) | 端点索引、两种投影的允许/禁止字段 |
| [api-public.md](api/api-public.md) | 基址、响应体结构、SSE 帧格式、时间与并发约定 |
| [error-code.md](api/error-code.md) | 错误码表与 HTTP 状态码映射 |
| [10-api-session.md](api/10-api-session.md) | `GET /api/session`、静态托管与 SPA fallback |
| [20-api-beat.md](api/20-api-beat.md) | `POST /api/beat`（SSE）、`POST /api/reset` |
| [30-api-author.md](api/30-api-author.md) | 作者投影三个端点、内容保存、prompt 缓冲 |

## 尚未创建

- `design/test.md`：测试环境与流程说明，暂由 `build.md` 承担
