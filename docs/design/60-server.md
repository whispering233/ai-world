# 60 服务端与阅读面

## 1. 进程形态

单进程、单世界、单用户、只绑 `127.0.0.1`。一个 Node 进程同时承担：HTTP API、SSE、静态资源托管、世界内存态。

```text
packages/server   Hono + @hono/node-server
  ├── 持有内存态：world / characters / scene / store / 本拍互斥锁 / usage 累计 / prompt 环形缓冲
  ├── 调用 packages/core 的 runBeat
  └── 托管 packages/web/dist（生产态）
```

不引入数据库、队列、后台任务、多进程。理由：一拍 50 秒、单用户、状态总量在几十 KB 级；引入这些只会在"账本可验证"之外再造一套需要对齐的状态。

静态托管的 content-type 看**实际发出的文件**，不看请求路径：SPA fallback 的路径（`/`、`/author`）通常没有扩展名，按请求路径取会得到 `application/octet-stream`，浏览器直接下载而不是渲染。

## 2. 启动与续跑

```text
读 content/<world>.json → validatePack → seedCharacters
读 data/<world>/journal.jsonl + passage.jsonl
  ├── 有 journal → replay(journal, world) + replayCharacters(journal, characters)
  └── 无 journal → 用内容包的初始 world 与人物
openScene（新场景，participants = 内容包全部人物 + 玩家）
启动日志一行：监听地址、世界标题、拍数、三个角色的模型串
```

场景上下文**不落盘**，续跑从新场景开始；人物记忆由 `journal.experience` 复原。这条与 `play.ts` 一致，两者共用 `packages/server/src/session.ts` 的 boot 逻辑（`play.ts` 保留自己的 CLI 循环，但 boot 走同一函数）。

**启动必须打印实际模型串**：调错模型要当场可见，不能等到第一拍失败。

## 3. 一拍的生命周期

```text
POST /api/beat
  ├── 拿锁（已有拍 → 409 E_BEAT_IN_FLIGHT）
  ├── 起 SSE：每 1s 发 progress
  ├── runBeat(...)
  │     ├── 认知并发（人物失败 → 本拍沉默，记 notes）
  │     ├── 裁判（失败 → 整拍无进展，发 error，世界不动）
  │     ├── commit 账本
  │     ├── 旁白（失败 → 事实摘要兜底，source=fallback）
  │     └── appendBeat → appendPassage
  ├── 发 passage(BeatView) → state(PlayerState) → done
  └── 放锁
```

时间归属：`duration` 由 referee 给，`clock` 只按已提交 claim 的最大 duration 推进。服务端不改这个语义，只负责把它投影出去。

## 4. 中止语义

| 时点 | 行为 |
| :--- | :--- |
| 提交前断开 | 中止在途模型调用；不落 journal、不落 passage；世界不变 |
| 提交后断开 | 服务端仍写完 passage 落盘；重连靠 `GET /api/session` 全量重建 |
| 客户端主动取消 | 不发取消请求，断开连接即取消 |

实现：每拍一个 `AbortController`；`Llm` 用一个薄包装把 `signal` 注入每次 `chat()`，并把底层调用与 `signal` 做 `Promise.race`（不指望 provider 老实看 signal）。断连检测三路都接：`stream.onAbort`、`c.req.raw.signal`、`close`。

单拍互斥在**开流之前**判（HTTP 409）：流一旦开了就只能发 `error` 帧，用不了状态码。

## 5. 内容生命周期

| 项 | 约定 |
| :--- | :--- |
| 位置 | `content/<world>.json`，**git 跟踪**（放 `data/` 会被忽略，内容属于源码） |
| 格式 | JSON。作者壳用表单编辑，用户从不直接面对 JSON 转义 |
| 结构 | 只存作者字段：`title` / `world` / `characters`（`core`/`voice`/`drives`/`beliefs`）/ `canon` / `player` / `names` / `items` / `aliases`。运行时字段（`experience`、`busyUntil`）由 `seedCharacters()` 补空 |
| 校验 | `validatePack()`，与运行时同一份；服务端在加载与保存两处都调用 |
| 生效 | **只在新局生效**。保存 = 写盘；本局继续用启动时加载的那一份 |
| 哈希 | 保存与启动各算一次；`activeHash ≠ diskHash` 时作者壳顶栏常驻横幅「内容已变更，未生效」 |
| 不热生效 | 热切换会静默清掉本局的 `drives[].heat` 与 `beliefs`（两者既是作者字段又是运行时状态），等于"保存成功"在偷偷改世界 |

保存后的三选一：**开新局（推荐）/ 只保存，本局不变 / 取消**。后两项都是"本局不变"。

作者壳保存的是**整份** `JSON.stringify(pack)`，不是只拼可编辑字段：它不认识的字段（`ambient`、`aliases`）必须原样带回，否则一次保存会静默删掉半个内容包。

prompt 只在内存环形缓冲保留最近 3 拍，不落盘（体积 + 隐私面）；进程一停就没了，作者壳要如实显示"已超出窗口"而不是空白。

## 6. 两种壳与投影

同一个进程、同一份内存态，两次**只读投影**：

| 投影 | 位置 | 约束 |
| :--- | :--- | :--- |
| 玩家 | `packages/core/src/view.ts` 的 `playerView()` | 只含显示名与可验证状态；不得出现任何 id 与引擎词 |
| 作者 | 同文件的 `authorView()` | 原始值全量 |

隔离靠三层，不靠开关：

1. **投影纯函数**：玩家投影的键集合由 `view.test.ts` 断言。
2. **源码扫描**：`packages/web/src/discipline.test.ts` 断言玩家壳不出现 `claim/verdict/heat/rel/token/cost/no_rate`，且不 import 作者壳模块。
3. **数据懒取**：作者数据只在切到作者壳时请求。

不做服务端开关、不做独立 HTML entry、不做构建期移除。理由：本机单用户，真正的风险不是"别人看到调试数据"，是"玩家视图混进调试语义"——这只能由 1、2 挡住。

投影的几条输入约束：

- `playerView` 的 `player` 必须显式传入，不从内容包推；`at[player]` 缺失时退化成空 `place`/空 `here`，**不抛错**（投影崩掉比显示空更糟）。
- `here` 必须用**人物白名单**：`ledger.at` 里还有灯、门、地窖门这类实体（它们的 `phys` 键要用），它们不是"在场的人"。
- 玩家投影的"无 id"由 `view.test.ts` 两条断言守住：递归键集合无引擎词、序列化后不出现任何实体/物品 id。

## 7. 包结构与依赖方向

```text
packages/shared   ← 零依赖：DTO 类型 + 端口/事件名常量（浏览器安全）
packages/core     ← shared：账本/调度/场景/裁判契约/LLM/认知/渲染/投影/体检
packages/content  ← core：内容加载、校验、seedCharacters、内容哈希
packages/server   ← core + content + shared：Hono、会话、路由
packages/web      ← shared：React SPA（拿不到 core，边界由 pnpm 严格 node_modules 强制）
```

- `exports` 指向 `.ts` 源码（Just-in-Time Package），**无构建步骤**：Node 22 类型剥离直跑，Vite 与 tsc 原生认这种入口。
- 发布时才逐包加 `build` 并把该包的 `exports` 切到 `dist`，不影响其他包。
- `scripts/` 与 `config/` 留在仓库根，不进包。

## 8. 前端组件方案

不引入组件库、图标库、状态库、路由库。

| 层 | 内容 |
| :--- | :--- |
| tokens | `packages/web/src/tokens.css` 单一文件，Tailwind 4 `@theme`；暗色靠 `<html data-theme>` 覆盖同名变量 |
| 基础件 | `ui/` 下 11 个手写：`Button` `Field` `TextField` `NumberField` `Collapsible` `Dialog` `Banner` `KeyValueList` `EditableList` `DataTable` `ModeSwitch` |
| 原生等价物 | 折叠 `<details>`、模态 `<dialog showModal>`（外部 inert + top layer 嵌套）、表格 `<table>`、键值 `<dl>`、滑杆 `<input type=range>` |
| 玩家壳 | `TopBar` `ReadingStream` `PlayerLine` `BeatDivider` `Composer` `StateDrawer` `EmptyState` `ErrorNotice` |
| 作者壳 | `AuthorApp` `BeatList` `BeatDetail` `LedgerView` `HealthPanel` `ContentEditor` `SaveDialog` |
| 状态 | 一个 `useReducer`；`mode` 与滚动位置进 localStorage |
| 图标 | 文本字符（`×` `▸` `▾` `↻` `⋯`），零依赖 |

抽屉的滚动锁定用 `body:has(dialog[open]) { overflow: hidden }`。真出现焦点问题再单独引 `@radix-ui/react-dialog` 一个包，不引整套组件库。

## 9. 失败与降级

| 失败 | 行为 |
| :--- | :--- |
| 单个人物认知失败 | 该人物本拍沉默，其余照常结算；记 `notes` |
| 裁判失败 | 整拍无进展；账本不动、journal 不落；SSE 发 `error`；前端提示"这一拍没有发生" |
| 旁白失败 | 用事实摘要兜底，`source: 'fallback'`；**世界已结算**，前端显示兜底文本并标注 |
| passage 落盘失败 | journal 已落，不回滚；`BeatView.passage` 缺省，前端显示"这一叙述没有保存" |
| 内容加载失败 | 启动即失败并打印 `validatePack` 的逐条错误；不进入"半可用"状态 |
| 内容保存校验失败 | 不写盘，返回 `E_INVALID_CONTENT` + `errors[]` |

## 10. 明确不做

- 流式旁白（一拍 50s 里旁白只占约 10s；`runBeat` 在调旁白前已落 journal，所谓"草稿"没有可回滚的内容）
- 服务端 `--author` 开关、独立作者入口、构建期移除
- 内容热生效、内容版本回滚、内容编辑的 git 提交
- 多世界切换、存档槽、离线推进
- 前端直连模型（key 不进浏览器）
- 数据库、队列、多进程、ECS、向量库、storylet 运行时
