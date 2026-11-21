# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W3 知识通胀（方案 A）

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W3-1 | 收窄 `know`：停止逐句广播 | 待办 | 无 | `know` 只用于新信息/秘密/跨场景；在场观察仍写 experience；指标下降 |
| W3-2 | 秘密探针 + 20 拍重测 | 待办 | W3-1 | 普通对话不再 know；秘密仍可 know；基线更新 |

**串行执行：W3-1 → W3-2。**

---

## W3-1：收窄 `know`

### 目标

把 `know` 从“每句被听见的话都广播给所有听众”收窄为“听众原本不知道、且以后会用到的信息”。在场者的即时记忆继续由 `observations` / `experience` 承担。

### 范围

- `src/core/referee.ts`：
  - rule 10 改为“说话留痕，但不是知识广播”；
  - 明确 `know` 只用于秘密、计划、债务、身份、跨场景承诺等新信息；
  - 一次 `know` 用 `who` 数组覆盖所有听众，不要一人一条；
  - 寒暄、点单、重复、已经知道的事不发 `know`。
- `docs/design/10-world-model.md`：已更新，按文档实现。
- `scripts/play.ts`：增加 `know/已提交 claim` 与 `know 平均听众` 指标。
- `tests`：现有 `know` apply 测试保留；prompt 语义不写单测。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不把 `knows` 接进 cognition/referee（那是方案 B）。
- 不新建秘密系统。
- 不改 `know` op 的 schema；不删 `know`。
- 不动物质/时间。

### 验收

- 普通寒暄/点单/已知事实不再产生 `know`；秘密探针仍能产生 `know`。
- `know/claim` 与 `know_rate` 相比 W2 基线下降；`fact` 不再被 `know` 额外放大。
- 在场观察仍写入 `experience`；没有丢掉“人物记得刚才听到的话”。
- `npm run typecheck` 0；`npm test` 全绿。

### 独立验证

subAgent 只读检查 rule 10、指标、6 拍样本；最多 5 条。

---

## W3-2：秘密探针 + 20 拍重测

### 目标

验证收窄后的 `know`：普通对话不广播，秘密仍能被记录；并量化 `know` 是否真的下降。

### 范围

- `scripts/play.ts`：
  - 把普通“我告诉医生，安早就还清了债”换成秘密探针“我压低声音告诉医生，安把账本藏在柜台下面。”；
  - 保留短对话、等待、物理、长动作、末拍 move。
- 跑：
  - 6 拍 smoke：普通对话不产生 know；秘密探针产生 1 条 know（给医生），且 `observations` 仍写 experience；
  - 20 拍基线：`rm -rf data && npm run play -- --beats 20 --auto`；
  - 更新 `docs/research/world-baseline.md` 与 `docs/design/backlog.md` §4。
- `docs/design/build.md`：探针说明补“秘密探针”。

### 不做

- 不为了压低 `know_rate` 删除 `know` op。
- 不把 `knows` 接进 prompt。
- 不因指标下降就认为知识系统完成；保持“只写不读”的现状并记录。

### 验收

- 6 拍 smoke：普通对话的 `know` 为 0；秘密探针有 `know`；`experience` 有对应观察。
- 20 拍 `know` 条数/占比低于 W2（W2：164 条、67.8%；以实际数据为准，不硬编码目标）。
- 基线数字与 journal 一致；typecheck 0；测试全绿。

### 独立验证

subAgent 只读核对 rule 10、探针、`know` 条数/听众、基线数字；最多 6 条。

---

## 2. 后续候选（W3 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| W4 人物状态持久化 | 人物 `experience/self` 未进 journal |
| W5 缓存前缀 / per-role sessionId | prompt 稳定后再调 |
| W6 服务端 + 阅读面 | 世界层 W3–W4 有结论后 |
| `knows` 接入认知/裁判（方案 B） | 秘密/谎言真正进入玩法，且 W3 已把噪声降下来 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` 定位，再切世界层卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。
- `clock` 只按已提交 claim 的最大 duration 推进；时间跳跃折场用上一拍结束时刻判断。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
