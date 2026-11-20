# 数据结构 Schema

## 1. `ledger`（账本）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| clock | 是 | number | ≥ 0 | 分钟数，单调递增 |
| at | 是 | Record<EntId, PlaceId> | | 位置 |
| holds | 是 | Record<EntId, Record<ItemId, number>> | count ≥ 0 | 持有物 |
| phys | 是 | Record<EntId, Record<string, number\|boolean>> | | 键开放，需一句物理描述可解释 |
| rel | 是 | Record<EntId, Record<EntId, number>> | -3 ~ 3 | **单向**：A→B 与 B→A 独立 |
| knows | 是 | Record<EntId, FactId[]> | | 是否知情 |

## 2. `fact`（公共事实）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| id | 是 | string | | |
| text | 是 | string | | 自由文本，单句 |
| at | 是 | number | | 产生时的 clock |
| supersededBy | 否 | FactId | | 被新事实推翻时指向新条目 |

## 3. `journal`（事件日志，append-only）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| seq | 是 | number | | 一拍（或一次折场）一条，连续 |
| type | 是 | enum | `beat` \| `scene/fold` | 折场亦记一条 |
| scene | 是 | string | | 场景 id，场景边界由此推出 |
| clock | 是 | number | | 本拍时刻 |
| claims | 是 | Claim[] | ≤ 4 | 本拍全部对外主张（折场记录为空） |
| order | 是 | EntId[] | | 结算顺序 |
| verdicts | 是 | Verdict[] | | 含 ok/reason/deltas/duration |
| driveHits | 否 | DriveHit[] | | 驱动热度增减 |
| observations | 否 | Record<EntId, string> | | 可见性分发结果 |

## 4. `passage`（呈现文本）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| seq | 是 | number | | 与 journal 对齐 |
| clock | 是 | number | | |
| text | 是 | string | | 只增不改 |
| source | 是 | enum | `narrator` \| `player` \| `npc` | |

## 5. `character`（人物）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| id | 是 | EntId | | |
| core | 否 | string | 200~400 字；玩家为空 | 运行时只读 |
| voice | 是 | string | | 说话节奏与用词 |
| drives | 是 | Drive[] | heat 0~1 | `{ id, text, heat }` |
| beliefs | 是 | Record<EntId, string> | | 可错，可被谎言改写 |
| experience | 是 | Exp[] | | append-only |
| busyUntil | 是 | number | ≥ clock | 当前动作完成时刻 |

## 6. `experience`（人物经验）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| t | 是 | number | | 发生的 clock |
| kind | 是 | enum | `seen` \| `self` | `self` = 身份修订 |
| ref | 否 | number | | 指向 journal.seq，正文不重复存 |
| text | 是 | string | | 私人解读（`seen` 时是"它理解成什么"） |
| w | 是 | number | 1 ~ 3 | 权重，参与检索打分 |

## 7. `world`（世界根）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| ledger | 是 | Ledger | | 见 §1 |
| facts | 是 | Record<FactId, Fact> | | 只增不改 |
| places | 是 | Record<PlaceId, string> | | 地点白名单：id → 人读的名字；`move` 只能去这里 |
