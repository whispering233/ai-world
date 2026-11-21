# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次

当前没有卡片。下一张先讨论 W5（缓存前缀 / per-role sessionId）或 `fact` 结构化，不要直接开工。

## 2. 下一批候选（待讨论）

| 候选 | 现在做它的理由 | 先看什么 |
| :--- | :--- | :--- |
| W5 缓存前缀 / per-role sessionId | 三角色共用一个 sessionId；canon 排在易变段之后，前缀缓存命中差 | prompt 拼接顺序与真实缓存计费 |
| `fact` 结构化（actor / kind） | `facts/beat` 停在 1.1–1.2；主语归属错、动作当事件都是自由文本造成的 | `fact` 的写入点与 `describeFacts` 的排序 |
| W6 服务端 + 阅读面 | 世界层已能回放、续跑；UI 设计已定稿 | `/beat` SSE、`/state` |
| 折场时压 experience | 上下文预算吃紧时 | `recall` 的检索权重 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` / `facts/beat` 定位，再切世界层卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。
- `clock` 只按已提交 claim 的最大 duration 推进；时间跳跃折场用上一拍结束时刻判断。
- `know` 只记听众原本不知道且以后会用的信息；在场记忆交给 `observations`；耳语只发给听见的人。
- 事实切片的“提到在场者”按 id / 显示名 / 别名匹配；别名只用于匹配，不改显示名。
- `fact` 只记会改变后续判断的事件；`journal`/`passage` 才是全量记录。
- `facts/beat` 当前 1.10–1.20，已接受为已知缺口；不再用 prompt 硬压。
- 人物的新记忆与 `driveHits` 进 journal；未落 journal 的拍不推进记忆；`replayCharacters` 只用 journal。
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
