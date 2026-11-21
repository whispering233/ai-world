# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W3b-C fact 结构化

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W3b-C1 | `Fact.actor` / `Fact.kind` 与 op 校验 | 待办 | 无 | 新 fact 可带结构化字段；旧 fact 兼容；非法 actor/kind 被拒 |
| W3b-C2 | 排序按 actor 优先 + 覆盖率指标 | 待办 | W3b-C1 | actor 命中优先于文本；6 拍 smoke 输出覆盖率 |

**串行执行：W3b-C1 → W3b-C2。**

---

## W3b-C1：Fact 结构化

### 目标

给 `fact` 加两个可选结构字段，解决“主语归属靠文本”和“事实类别不可检索”：

- `actor?: EntId`：动作发出者（不是承受者）；
- `kind?: FactKind`：`speech / promise / threat / lie / transaction / identity / state / other`。

### 范围

- `src/core/world.ts`：`FactKind`、`FACT_KINDS`、`Fact.actor/kind`、`fact` op 可选字段。
- `src/core/ledger.ts`：`addFact(w, text, meta?)`；`fact` op 校验 actor 存在、kind 在枚举内；`know` 用文本新建 fact 时 `kind: 'speech'`。
- `src/core/referee.ts`：rule 8 增加 actor/kind 填法；op 列表更新。
- `docs/db/schema.md`、`docs/design/10-world-model.md`：已更新。
- `tests/ledger.test.ts`：结构化落库、非法 actor/kind、旧 fact 兼容、know 建 speech fact。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不做 `subjects` / 多主体。
- 不做 `supersededBy`。
- 不改 `FACT_BUDGET`、`know` 广播语义、时间/物质语义。

### 验收

- `fact` 带 `actor:'ann' / kind:'promise'` 能落库并 replay。
- 不存在的 actor、非法 kind 被拒，且不写入半条状态。
- 旧 fact（无 actor/kind）仍可 apply/replay；文本匹配不受影响。
- typecheck 0；测试全绿。

### 独立验证

subAgent 只读检查类型/校验/旧兼容/测试；最多 5 条。

---

## W3b-C2：排序与覆盖率

### 目标

让结构化 actor 真正参与事件流排序，并用覆盖率判断裁判是否在填。

### 范围

- `src/core/beat.ts` `describeFacts`：
  - 先看 `fact.actor` 是否在 `present`，命中 +2；
  - 否则回退现有 id/显示名/别名文本匹配。
- `scripts/play.ts`：
  - 统计已提交 `fact` op 的 actor/kind 覆盖率，打印 `fact 结构化 actor x/y · kind x/y`。
- `tests/describe-facts.test.ts`：actor 命中且文本不含名字时仍优先；旧 fact 文本匹配仍工作。
- 6 拍 smoke：确认覆盖率输出；不跑 20 拍追 `facts/beat`。

### 不做

- 不为了让覆盖率好看改裁判语义。
- 不跑 20 拍密度回归；1.20 已接受。
- 不做 UI。

### 验收

- actor 结构化命中优先于文本；旧 fact 无字段仍按文本排序。
- 6 拍 smoke 打印 actor/kind 覆盖率；若覆盖率为 0，文档记录“裁判未填”。
- typecheck 0；测试全绿。

### 独立验证

subAgent 只读核对排序、覆盖率、旧 fact 兼容；最多 4 条。

---

## 2. 后续候选（W3b-C 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| W6 服务端 + 阅读面 | 世界层稳定后 |
| 折场时压 experience | 上下文预算吃紧时 |
| 缓存 A/B | 有 before/after 需求时 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` / `facts/beat` / `cacheRead` 定位，再切卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。
- `clock` 只按已提交 claim 的最大 duration 推进；时间跳跃折场用上一拍结束时刻判断。
- `know` 只记听众原本不知道且以后会用的信息；在场记忆交给 `observations`；耳语只发给听见的人。
- 事实切片的“提到在场者”按 id / 显示名 / 别名匹配；别名只用于匹配，不改显示名。
- `fact` 只记会改变后续判断的事件；`journal`/`passage` 才是全量记录。
- `fact` 可选 `actor`/`kind`；旧 fact 没有字段也必须能 replay。
- `facts/beat` 当前 1.10–1.20，已接受为已知缺口；不再用 prompt 硬压。
- 人物的新记忆与 `driveHits` 进 journal；未落 journal 的拍不推进记忆；`replayCharacters` 只用 journal。
- `sessionId` 是 provider 的路由/缓存亲和头，不是消息线程；一次世界运行一个，不按角色拆。
- `cognition` 的 system 顺序：core/voice → 输出指令 → canon → drives/beliefs/记忆。
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
