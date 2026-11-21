# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次

当前没有卡片。下一张先讨论 fact 密度，不要直接开工。

## 2. 下一批候选（待讨论）

| 候选 | 为什么现在做 | 先看什么 |
| :--- | :--- | :--- |
| W3b `fact` 密度 | `fact/claim` 0.99，`know+fact` 仍占 91.8% 的写操作；`FACT_BUDGET = 12` 会被近期闲聊挤满 | 哪些言语事件值得成为公共事实（承诺/威胁/谎言/公开宣告），哪些只属于在场者 observations |
| W4 人物状态持久化 | 人物 `experience/self` 未进 journal，重开一局会丢 | journal 记录 cognition/experience 的 schema |
| W5 缓存前缀 / per-role sessionId | 三角色共用 sessionId；canon 在易变段后 | prompt 顺序与缓存命中 |
| W6 服务端 + 阅读面 | 世界层 W3b–W4 有结论后再做 | UI 设计已定稿，不重复讨论 |
| `knows` 接入认知/裁判（方案 B） | 秘密/谎言真正进入玩法时才做 | 当前 `knows` 只写不读 |

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
