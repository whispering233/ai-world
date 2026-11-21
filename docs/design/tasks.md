# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次

当前没有卡片。下一张先讨论 W6（服务端 + 阅读面）或折场压缩，不要直接开工。

## 2. 下一批候选（待讨论）

| 候选 | 现在做它的理由 | 先看什么 |
| :--- | :--- | :--- |
| W6 服务端 + 阅读面 | 世界层已能回放、续跑；`fact` 已有 actor/kind，阅读面可以按人/类别组织 | `/beat` SSE、`/state`、UI 设计稿 |
| 折场时压 experience | 上下文预算吃紧时 | `recall` 的检索权重 |
| 缓存 A/B | 有 before/after 需求时 | 同条件换前缀顺序各跑 6 拍 |
| fact 语义校验 | 覆盖率只证字段存在，不证 actor 正确 | 抽检 actor 与 text 的主语是否一致 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` / `facts/beat` / `cacheRead` 定位，再切卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。
- `clock` 只按已提交 claim 的最大 duration 推进；时间跳跃折场用上一拍结束时刻判断。
- `know` 只记听众原本不知道且以后会用的信息；在场记忆交给 `observations`；耳语只发给听见的人。
- 事实切片的“提到在场者”先看 `fact.actor`，再回退 id / 显示名 / 别名文本匹配；别名只用于匹配，不改显示名。
- `fact` 只记会改变后续判断的事件；`journal`/`passage` 才是全量记录。
- `fact` 可选 `actor`/`kind`；旧 fact 没有字段也必须能 replay；kind 未知会被拒，不确定用 `other`。
- `know` 用文本新建 fact 时 `kind:'speech'`，不假装知道说话人。
- `facts/beat` 的 20 拍基线是 1.10–1.20；加 `actor/kind` 后只有 6 拍 smoke 1.67，尚未重跑 20 拍；不再用 prompt 硬压。
- 人物的新记忆与 `driveHits` 进 journal；未落 journal 的拍不推进记忆；`replayCharacters` 只用 journal。
- `sessionId` 是 provider 的路由/缓存亲和头，不是消息线程；一次世界运行一个，不按角色拆。
- `cognition` 的 system 顺序：core/voice → 输出指令 → canon → drives/beliefs/记忆。
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
