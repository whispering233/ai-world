# API 接口索引

公共约定见 [api-public.md](api-public.md)，错误码见 [error-code.md](error-code.md)。

## 1. 端点一览

| 方法 | 路径 | 说明 | 文档 |
| :--- | :--- | :--- | :--- |
| GET | `/api/session` | 玩家投影：世界标题、时间、玩家可见状态、全部已发生的拍 | [10-api-session.md](10-api-session.md) |
| POST | `/api/beat` | 推进一拍，SSE 流式返回进度与结果 | [20-api-beat.md](20-api-beat.md) |
| POST | `/api/reset` | 清空本局日志，从内容包重新开局 | [20-api-beat.md](20-api-beat.md) §4 |
| GET | `/api/author/session` | 作者投影：内容状态、journal、账本原始、人物、usage、体检表 | [30-api-author.md](30-api-author.md) |
| GET | `/api/author/beat/:seq` | 作者投影：单拍详情（含最近拍 prompt 缓冲） | [30-api-author.md](30-api-author.md) |
| POST | `/api/author/content` | 保存内容包（只写 `content/<world>.json`） | [30-api-author.md](30-api-author.md) |
| GET | `/*` | 静态资源与 SPA fallback（非 `/api` 路径） | [10-api-session.md](10-api-session.md) §3 |

## 2. 两种投影

同一个进程、同一份内存态，两次只读投影：

| 投影 | 端点 | 允许出现 | 禁止出现 |
| :--- | :--- | :--- | :--- |
| 玩家 | `/api/session` | 世界标题、`clock`/`clockText`、地点名、在场者显示名、持有物显示名与数量、玩家已知事实 | `claim` `verdict` `delta` `heat` `rel` `drives` `beliefs` `core` `token` `cost` `no_rate` `notes` 任何 id |
| 作者 | `/api/author/*` | 以上全部 + journal 全量、账本原始值、人物四层状态、usage、体检指标、prompt 缓冲 | — |

玩家投影的键集合由 `packages/core/src/view.test.ts` 断言；玩家壳源码中不得出现上表右列的词，由 `packages/web/src/discipline.test.ts` 断言。
