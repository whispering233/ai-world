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
| actor | 否 | EntId | | 动作发出者（不是承受者）；不确定可省略 |
| kind | 否 | enum | `speech` \| `promise` \| `threat` \| `lie` \| `transaction` \| `identity` \| `state` \| `other` | 事件类别；旧 fact 可缺失 |
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
| experience | 否 | Record<EntId, Experience[]> | | 本拍每人新增的记忆条目（不是快照）；旧 journal 缺失时重放停在初始人物 |
| telemetry | 否 | BeatTelemetry | | 本拍运行观测（模型串与用量），由服务端注入，`src/core` 只透传；旧 journal 缺失时作者视图显示“未记录” |

`BeatTelemetry`：

| 字段 | 是否必选 | 数据类型 | 备注 |
| :--- | :--- | :--- | :--- |
| models | 是 | `Record<ModelRole,string>` | 本拍三个角色实际使用的模型串 |
| usage | 是 | `Record<ModelRole,{input,output,cacheRead,cacheWrite,cost,ms,retries,calls}>` | 本拍各角色的累计用量；`cost` 缺失时按 0 显示，不推断 |

telemetry 是**运行观测**，不是世界状态：`replay` 不读它，缺它不影响账本。

## 4. `passage`（呈现文本）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| seq | 是 | number | | 与 journal 对齐 |
| clock | 是 | number | | |
| text | 是 | string | | 只增不改 |
| source | 是 | enum | `narrator` \| `player` \| `npc` \| `fallback` | `fallback` = 旁白失败后用事实摘要兜底 |
| beatSeq | 否 | number | ≥1 | 对应 journal 的 seq，连接玩家原话与旁白的稳定键；旧日志缺失时按 `clock` 顺序回退匹配 |

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
| kind | 是 | enum | `seen` \| `self` \| `thought` | `self` = 身份修订；`thought` = 没说出口的话，不进裁判 |
| ref | 否 | number | | 指向 journal.seq，正文不重复存 |
| text | 是 | string | | 私人解读（`seen` 时是"它理解成什么"） |
| w | 是 | number | 1 ~ 3 | 权重，参与检索打分 |

## 7. `world`（世界根）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| ledger | 是 | Ledger | | 见 §1 |
| facts | 是 | Record<FactId, Fact> | | 只增不改 |
| places | 是 | Record<PlaceId, string> | | 地点白名单：id → 人读的名字；`move` 只能去这里 |
| ambient | 否 | Record<string, string\|number\|boolean> | | 世界常态声明（只读根常量，与 `places` 同性质，不属于事实流）；改它等于改世界设定 |

显示名不在 `world` 里：它们是作者层 `ContentPack` 的静态映射，不参与 replay，也不进账本。
`ambient` 只给环境类前因读：键缺失 = 不满足，不默认通过；它不由裁判写，也不进 journal。

## 8. `ContentPack`（作者层，不是运行时状态）

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| title | 是 | string | 非空 | 世界标题；玩家壳顶栏用它 |
| characters | 是 | CharacterSeed[] | 每人 core 200–400 字、voice 非空、drive heat 0..1 | 只存作者字段 `id`/`core`/`voice`/`drives`/`beliefs`；运行时字段 `experience`、`busyUntil` 由 `seedCharacters()` 补空，不写进文件 |
| names | 是 | Record<EntId, string> | | 人物/实体显示名：id → 人读的名字；覆盖 `ledger.at` 的全部实体 |
| items | 是 | Record<ItemId, string> | | 物品显示名：id → 人读的名字；覆盖 `ledger.holds` 里出现的物品 |
| aliases | 否 | Record<EntId, string[]> | | 额外检索词：只用于事实切片匹配“这句话提到谁”，不改显示名 |

## 9. `phys` 键表（登记，不冻结）

`phys` 保持**开放**：`apply` 只检查实体存在与值类型（有限数字或布尔），**不检查键名**（`src/core/ledger.ts` 的 `phys` 分支）。本表是登记簿，不是白名单——没列出的键照样能写入。

登记的作用是审计：让“这个世界记住过什么”可枚举，并逼每个键回答一个问题——**谁解除它**。

### 9.1 命名原则

- 键只描述**状态**，不描述谁、在哪、因为什么（那些是实体、`at`、`facts` 的事）。`granny.blocking_counter` 是反面例子：她把挡的位置写进了键名，换个地方挡就要换键。
- 每个键必须能被一句物理描述解释，否则删。
- 只允许“有解除动作”的键。写不出解除方式的键会在世界里永久粘住。

### 9.2 登记表

| 键 | 语义 | 值域 | 典型挂载 | 解除方式 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lit` | 点着 / 亮着 | boolean | 灯、街灯 | 熄灯（风吹灭、掐灭） | 初值键 |
| `closed` | 合着（门、盖） | boolean | 门 | 打开（推开、被风吹开） | 初值键；**与“闩上”混用过，见 9.3** |
| `broken` | 损坏 | boolean | 门轴、器皿 | 修理（目前世界里没有修的动作） | 初值键 |
| `open` | 敞开 | boolean | 地窖盖板 | 合上 | 初值键 |
| `bolted` | 闩死 | boolean | 门 | 拔闩 | **运行中出现，从未解除过（见 9.3）** |
| `blocking_counter` / `blocking_cellar` | 挡在某处 | boolean | 人 | 走开 | 运行中出现；**命名反面例子** |
| `wounded` | 伤势 | 0–3 | 人 | 痊愈 | 仅规则示例，尚未出现 |

### 9.3 已知的两个症状（不是 bug，是开放键的代价）

1. **语义混用**：`closed` 同时被用来表示“关着”和“闩上”。r3 的判词“闩是从里头闩紧的”，落的是 `closed=true`。这会让条件无法区分“虚掩”和“闩死”——storylet 的 `when` 就死在这里。
2. **键粘住**：`door.bolted` 在一局里被写成 `true`，整局没有任何 `false`。重放能还原值，但世界里那扇门永久闩死。

新增键时，把上面两栏一起补上；发现某个键长期只有单向值，就在本表标注解除者缺失。
