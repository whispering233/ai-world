# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W3b-A 事件流排序

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W3b-A | `describeFacts` 按 id 或显示名匹配在场者 | 待办 | 无 | 显示名事实能拿到 +2；超预算时在场者事实不被挤出；测试锁住 |

本卡只修排序 bug，不改“什么事件值得成为 fact”。fact 密度、fact 词表、`FACT_BUDGET` 都不动。

---

## W3b-A：`describeFacts` 相关性匹配

### 目标

让喂给裁判的事件流真正按“提到在场者优先”排序。C2 之后事实文本用显示名（安 / 道森医生 / 科迪 / 格蕾妮），但排序只匹配实体 id（`ann` / `doc`…），`+2` 这一档永远不命中，切片退化成纯时间倒序。

### 范围

- `src/core/beat.ts`：
  - `describeFacts(world, present, clock, names?)` 按 `[id, 显示名]` 匹配；
  - `describeLedger` 把已有的 `names` 传下去。
- `scripts/experiment-multi-round.ts`：同名私有实现同步（脚本不抽公共层）。
- `tests/describe-facts.test.ts`：
  - 事实用显示名、在场者给 names 时，仍优先于更晚的无关事实；
  - 超预算时，显示名事实不被挤出；
  - 现有 id 匹配用例保持不变。
- `docs/design/10-world-model.md` §7：已更新（含“玩家写成‘玩家’、names 是‘你’”的已知限制）。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不改 `FACT_BUDGET`（仍是 12）。
- 不改“什么事件值得成为 fact”，不动 rule 8。
- 不把玩家显示名改成“玩家”（那会伤旁白的第二人称）；不在本卡做称呼统一。
- 不动 `know`、时间、物质流。

### 验收

- 显示名事实能拿到 +2；超预算时仍在切片里。
- `npm run typecheck` 0；`npm test` 全绿。
- 4 拍 smoke 的 `fact` 文本与排序行为可肉眼核对；不要求重跑 20 拍基线（数字不动，改的是排序）。

### 独立验证

subAgent 只读检查匹配逻辑、两处实现一致、三个测试用例；最多 4 条。

---

## 2. 后续候选（W3b-A 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| W3b-B fact 密度 | 修完排序再测；若早期后果仍被闲聊挤掉，再定“什么事件值得成为 fact” |
| W4 人物状态持久化 | 人物 `experience/self` 未进 journal |
| W5 缓存前缀 / per-role sessionId | prompt 稳定后再调 |
| W6 服务端 + 阅读面 | 世界层 W3b–W4 有结论后 |
| 称呼统一 | 裁判写“玩家”、names 写“你”，两套称呼并存 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` 定位，再切世界层卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。
- `clock` 只按已提交 claim 的最大 duration 推进；时间跳跃折场用上一拍结束时刻判断。
- `know` 只记听众原本不知道且以后会用的信息；在场记忆交给 `observations`；耳语只发给听见的人。
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
