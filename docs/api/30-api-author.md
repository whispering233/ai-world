# 作者投影与内容编辑

三个端点**全部只读世界状态**，唯一的写入口是 §4 的内容包文件；账本与 facts 仍然只有 referee 能写。

## 1. `GET /api/author/session`

`data` 结构：

| 字段 | 是否必选 | 数据类型 | 备注 |
| :--- | :--- | :--- | :--- |
| title | 是 | string | 世界标题 |
| clock / clockText | 是 | number / string | 当前时刻 |
| content | 是 | `{path, activeHash, diskHash, changed}` | `activeHash` = 本局启动时加载的内容哈希；`diskHash` = 磁盘当前；`changed: activeHash !== diskHash` |
| world | 是 | `{ledger, facts, places, ambient?}` | 原始值，不做显示名替换 |
| characters | 是 | `{id,name,core?,voice?,drives,beliefs,busyUntil,experienceCount}[]` | 四层状态；`experience` 只给条数，全文走单拍详情 |
| journal | 是 | `JournalEntry[]` | `journal.jsonl` 原样 |
| usage | 是 | `Record<ModelRole, Usage>` | 本次进程累计，非本局累计（进程重启归零，界面须注明） |
| health | 是 | `HealthView` | 见 §1.1 |
| prompts | 是 | `{seq, calls[]}[]` | 环形缓冲里的最近 3 拍 prompt，见 §2 |

### 1.1 HealthView

| 字段 | 说明 |
| :--- | :--- |
| noRate | `verdict.ok === false` 的比例 |
| silentBeats | 整拍账本无变化的拍数 / 总拍数 |
| factsPerBeat | 已提交 `fact` op 数 / 拍数 |
| knowRate | `know` / 全部已提交写操作 |
| durationBuckets | `0–3` / `4–30` / `31–239` / `≥240` 分钟计数 |
| writeOps | `move/transfer/consume/phys/rel/fact/know` 计数 |
| claims | `{say, act}` 计数 |
| folds | 折场次数 |
| degraded | 累计 `notes` 条数 |

指标口径与 `play.ts` 体检表一致，两者共用 `packages/core/src/health.ts`。

## 2. `GET /api/author/beat/:seq`

| 字段 | 是否必选 | 数据类型 | 备注 |
| :--- | :--- | :--- | :--- |
| entry | 是 | JournalEntry | 该拍 journal 原文 |
| passage | 否 | PassageEntry | 对应 passage；落盘失败时缺省 |
| prompts | 是 | `{role,system,messages,text,ms,retries}[]` | 该拍的模型调用记录；**只保留最近 3 拍**，超出返回空数组 |
| notes | 是 | string[] | 该拍降级/回滚说明（进程内保留，重启后为空） |

prompt 缓冲**不落盘**：进程一停就没了。理由是 prompt 体积大且含人物私有状态，落盘会同时放大日志体积与隐私面。

## 3. `GET /api/author/content`

| 字段 | 是否必选 | 数据类型 | 备注 |
| :--- | :--- | :--- | :--- |
| text / activeHash / diskHash | 是 | string | 内容包磁盘原文与两个哈希，同 §1 的 `content` |

`text` 是**磁盘原文**：作者壳解析后回填表单，保存时把整份对象序列化回去，保存请求的行为见 §4。
磁盘读不到时该端点直接失败（内容包归 git 跟踪，不属于可缺失状态）。

## 4. `POST /api/author/content`

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| text | 是 | string | | 完整内容包 JSON 文本，由作者壳序列化 |

行为：

1. `JSON.parse` → 失败返回 `E_INVALID_BODY`。
2. `validatePack()` → 有错返回 `E_INVALID_CONTENT` + `data.errors: string[]`，**不写盘**。
3. 写 `content/<world>.json`（先写临时文件再 rename，避免半份文件）。
4. 返回 `{saved: true, activeHash, diskHash}`。

| 约束 | 说明 |
| :--- | :--- |
| 只写内容 | 只碰 `content/` 下的文件，**永不**写 `data/` |
| 不热生效 | 保存后本局仍用 `activeHash` 那一份；新内容要 `POST /api/reset` 才生效 |
| 与 `/api/beat` 互斥 | 结算中保存返回 `E_BEAT_IN_FLIGHT` |
| 不自动保存 | 前端用显式「保存」按钮；不做失焦保存（否则每次点走都弹三选一） |

## 5. 玩家壳与作者壳

| | 玩家壳 | 作者壳 |
| :--- | :--- | :--- |
| 布局 | 单栏阅读面 | 三栏：拍列表 / 同一份阅读流 / 单拍详情 |
| 数据 | 只请求 `/api/session` | 切过去时才请求 `/api/author/session` |
| 切换 | TopBar `⋯` 菜单「作者视图」，`Ctrl/Cmd+Shift+D`，记 localStorage | 同 |
| 切换代价 | 不重置任何状态：同一 clock、同一批 passages、同一滚动位置 | 同 |
