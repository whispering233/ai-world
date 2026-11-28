# 60 服务端与阅读面

## 1. 进程形态

单进程、单用户；同一时刻只有一个世界在内存里（换包 = 开新局）。只绑 `127.0.0.1`。一个 Node 进程同时承担：HTTP API、SSE、静态资源托管、世界内存态。

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
启动日志一行：监听地址、世界标题、拍数、四个角色的模型串
```

场景上下文**不落盘**，续跑从新场景开始；人物记忆由 `journal.experience` 复原。`play.ts` 按同样顺序 boot（`loadContentPack` → `replay` / `replayCharacters` → `openScene`），但 boot 与 CLI 循环各自持有，不共用 `session.ts`。

现场描述文字（`sceneText`）**同源**：由 `packages/core/src/content.ts` 提供，服务端与试玩器都调它。`play.ts` 是产出 `docs/research/` 全部基线的工具，这一维一旦分叉，它的体检表数字就不能代表服务端行为。

`data/<world>/`、`journal.jsonl`、`passage.jsonl` 三个名字由 `packages/core/src/store.ts` 导出（`dataDir()` / `JOURNAL_FILE` / `PASSAGE_FILE`），服务端与 `play.ts` 只引用不重写：`reset()` 与 `--fresh` 都靠它们删旧局，改名只改一处。

**启动必须打印实际模型串**：调错模型要当场可见，不能等到第一拍失败。

## 3. 一拍的生命周期

```text
POST /api/beat
  ├── 拿锁（已有拍 → 409 E_BEAT_IN_FLIGHT）
  ├── 起 SSE：每 1s 发 progress
  ├── 聚焦解析（all:true = 显式所有人，跳过；显式 to 优先；没有 to 时按正文唯一人名/别名推断；推断失败 = 所有人）
  ├── runBeat(...)
  │     ├── 认知并发（焦点模式只叫玩家 + 目标；人物失败 → 本拍沉默，记 notes）
  │     ├── 裁判（失败 → 整拍无进展，发 error，世界不动）
  │     ├── commit 账本 → 发 progress{phase:'settled'}
  │     ├── 旁白 / 动作提示并行（旁白失败 → 事实摘要兜底；提示失败 → 无提示）
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

**取消必须在写 journal 之前生效**：旁白阶段被中止时，不能用事实摘要兜底把一拍“补”成已提交。写 journal 之后断开才适用“服务端仍写完 passage”。

**总时限**：一拍把客户端 signal 与一个总时限合成同一个 signal（缺省 180s）。只等客户端断开是不够的——标签页挂在后台、连接还在、provider 挂死时，`busy` 会永远为真，之后所有 `/api/beat` 全 409，只能重启进程。超时走与模型失败同一条降级路径（`E_MODEL_CALL`，世界不动）。

**停止 = 停止等待，不撤销已提交的那一拍**。界面上的 `停止` 只断连接；已经提交的拍仍然落 journal（下一行规则）。因此前端在停止之后必须重取 `GET /api/session`，把服务端已经落下、界面还没显示的那一拍补回来——否则用户重打一遍，就把同一个动作落了两次账。

单拍互斥在**开流之前**判（HTTP 409）：流一旦开了就只能发 `error` 帧，用不了状态码。

## 5. 内容生命周期

| 项 | 约定 |
| :--- | :--- |
| 位置 | `content/<world>.json`，**git 跟踪**（放 `data/` 会被忽略，内容属于源码） |
| 格式 | JSON。作者壳用表单编辑，用户从不直接面对 JSON 转义 |
| 结构 | 只存作者字段：`title` / `world` / `characters`（`core`/`voice`/`drives`/`beliefs`）/ `canon` / `player` / `names` / `items` / `aliases` / `opening?` / `scene?`。`opening` 是首屏散文（只给玩家），`scene` 是一两句现场描述（进人物/裁判/旁白）；运行时字段 `experience` 由 `seedCharacters()` 补空 |
| 校验 | `validatePack()`，与运行时同一份；服务端在加载与保存两处都调用。覆盖到 `ledger` 的子对象（`holds` 数量、`phys` 值类型、`rel` 指向、`knows` 形态）与 `clock` 是否有限 |
| 生效 | **只在新局生效**。保存 = 写盘；本局继续用启动时加载的那一份 |
| 闭合世界 | 运行时不创建 item/entity/place（决策 #50）；`ContentPack` 是唯一来源，`Op` 只有 move/transfer/consume/phys/rel/fact/know |
| 陈设 | 柜台/铁盒/桌子是 `world.ledger` 里的非人实体（`at`/`holds`/`phys`），不进 `characters`；作者直接编辑 JSON；作者壳可编辑 `places`/`names`/`items` 的显示值 |
| 哈希 | 保存与启动各算一次；`activeHash ≠ diskHash` 时作者壳顶栏常驻横幅「内容已变更，未生效」 |
| 不热生效 | 热切换会静默清掉本局的 `drives[].heat` 与 `beliefs`（两者既是作者字段又是运行时状态），等于"保存成功"在偷偷改世界 |
| 多世界 | `content/` 下每个 `*.json` 就是一个可选世界，id 取文件名，必须匹配 `^[a-z0-9-]+$`；启动时扫描一次，新增包需重启进程 |
| 玩家选包 | 在「新的一局」里选（`POST /api/reset {world}`）；缺省 = 当前世界。包列表随 `GET /api/session` 下发 |
| 存档隔离 | 每个世界一个 `data/<world>/`。切包 = 换目录：旧世界的 journal 不会被新包读到（否则实体 op 全失败、`fact` 却会作为孤儿事实渗进来） |
| 切包闸门 | 先 `loadContentPack(content/<world>.json)` 校验，再清日志、再重建；校验失败整局不动 |
| 进程默认 | `AI_WORLD` 决定进程首次启动读哪个包（缺省 `starter-town`）；指向不存在的包直接启动失败 |

保存后的三选一：**开新局（推荐）/ 只保存，本局不变 / 取消**。后两项都是"本局不变"。

开新局与切包是同一件事：世界是**一局**，换包就是换局。因此不存在"切了包但保留这一局的账本"这种状态——那会让两套 `world` 初值、两套人物与一份旧账本同时活着。

切包后的残留：作者壳的内容抽屉按 `content.path` 重挂载（否则旧包的 JSON 会被保存进新世界）；用量累计是**进程级**（`session.ts` 的 `usage`），不随切包归零，体检表口径同此。

作者壳保存的是**整份** `JSON.stringify(pack)`，不是只拼可编辑字段：它不认识的字段（`ambient`、`aliases`）必须原样带回，否则一次保存会静默删掉半个内容包。

prompt 只在内存环形缓冲保留最近 3 拍，不落盘（体积 + 隐私面）；进程一停就没了，作者壳要如实显示"已超出窗口"而不是空白。

## 6. 两种壳与投影

同一个进程、同一份内存态，两次**只读投影**：

| 投影 | 位置 | 约束 |
| :--- | :--- | :--- |
| 玩家 | `packages/core/src/view.ts` 的 `playerView()` | 只含显示名与可验证状态；不得出现任何 id 与引擎词 |
| 作者 | 同文件的 `authorView()` | 原始值全量 |

**“谁在场”有四处口径，各自服务不同的问题，不要合并**：

| 用途 | 位置 | 白名单 | 含玩家 | 回答的问题 |
| :--- | :--- | :--- | :--- | :--- |
| 玩家抽屉 | `view.ts` 的 `playerState` | 内容包里的人物 | 否 | 玩家身边还有谁 |
| 动作提示器 | `beat.ts` 的 `suggestInput` | 本拍场景参与者 | 否 | 你现在能跟谁说话 |
| 聚焦候选集 | `server/session.ts` 的 `presentPeople` | 内容包里的人物 | 否 | 没点名时目标能是谁 |
| 场景描述 | `content.ts` 的 `sceneText` | 内容包里的人物 | **是** | 这屋子里有谁 |

四者也承担不同的容错：`ledger.at[player]` 缺失时，`playerState` 与 `presentPeople` 退成空地点，`suggestInput` 退成本拍场景地点；`sceneText` 直接拼地点 id。
这些都是投影层的容错，不是语义差异。
唯一**不可**分叉的是 `sceneText`：服务端与 `scripts/play.ts` 喂同一个消费点（`BeatInput.sceneText`），所以它只有一份实现。

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
packages/shared   ← 零依赖：DTO 类型 + SSE 事件名常量（浏览器安全）
packages/core     ← shared：账本/调度/场景/裁判契约/LLM/认知/渲染/投影/体检
packages/content  ← core：内容加载、校验、seedCharacters、内容哈希
packages/server   ← core + content + shared：Hono、会话、路由
packages/web      ← shared：React SPA（拿不到 core，边界由 pnpm 严格 node_modules 强制）
```

- `exports` 指向 `.ts` 源码（Just-in-Time Package），**无构建步骤**：Node 22 类型剥离直跑，Vite 与 tsc 原生认这种入口。
- 发布时才逐包加 `build` 并把该包的 `exports` 切到 `dist`，不影响其他包。
- `scripts/` 与 `config/` 留在仓库根，不进包。

## 8. 前端组件方案

**chrome 全部用 `antd` 6 + `@ant-design/x` 2**；不自绘基础件，不引状态库、不引路由库。

| 层 | 内容 |
| :--- | :--- |
| 主题 | `theme/AntdProvider.tsx`：`ConfigProvider` + `<StyleProvider layer>`，浅 `defaultAlgorithm` / 深 `darkAlgorithm`，antd 默认色板（不写自定义 seed）；`cssVar.key` = `<html class="ai-world-theme">` |
| 层叠 | `tokens.css` 先写 `@layer theme, base, antd, antdx, components, utilities` 再 `@import "tailwindcss"`；漏写 `antdx` 时 x 组件的工具类会被静默压掉 |
| tokens | `tokens.css` 只做两件事：把 `--ant-*` 映射成既有 class 名（`paper`/`paper-2`/`ink`/`ink-soft`/`rule`/`accent`），以及放排版 token（正文 17px / 1.85 / 段距 24px / 列宽 40rem） |
| 组件 | `Alert` `Button` `Modal` `Drawer` `Collapse` `Table` `Descriptions` `Dropdown` `Divider` `Empty` `Segmented` `Timeline` `Skeleton` + x 的 `Sender` `Conversations` `Prompts`；图标走 `@ant-design/icons` |
| `ui/` 自有件 | 只剩 `ModeSwitch`（`Segmented` 薄壳，两壳共用）；就地的小排版包装留在调用文件里，不进 `ui/` |
| 玩家壳 | `TopBar` `ReadingStream` `PlayerLine` `BeatDivider` `Composer` `StateDrawer` `EmptyState` `ErrorNotice` |
| 作者壳 | `AuthorApp` `BeatList` `BeatDetail` `LedgerView` `HealthPanel` `ContentEditor` `SaveDialog`；两壳共用同一个 `Composer` 节点，作者壳也能发拍 |
| 懒加载 | `AuthorApp` 走 `lazy` + `Suspense`（玩家壳首屏从 1.12 MB / gzip 354 kB 降到 1.03 MB / gzip 326 kB）；隔离守卫 `discipline.test.ts` 同时认静态与动态 `import()` |
| 状态 | 一个 `useReducer`；`mode` 与滚动位置进 localStorage |

层叠与 cssVar 的两个陷阱（都会静默失效、测试全绿）：`@ant-design/cssinjs` 必须与 antd 内部读同一实例；`zeroRuntime` 路线不可用（x 不发 CSS）。详见 [ui/DESIGN.md](../ui/DESIGN.md) §0。

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

- 流式旁白、每人物流、裁决层流（旁白在写 journal **之前**调用，token 没有“已发生”身份；裁判输出是 JSON；每人物流需要先有“每个人物一段文本”）
- 服务端 `--author` 开关、独立作者入口、构建期移除
- 内容热生效、内容版本回滚、内容编辑的 git 提交
- 多世界存档槽（同一世界多份存档）、离线推进
- 前端直连模型（key 不进浏览器）
- 数据库、队列、多进程、ECS、向量库、storylet 运行时
