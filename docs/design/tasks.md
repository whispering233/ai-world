# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W3b-B 事实密度

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W3b-B1 | rule 8 收窄 + 5 类守卫探针 | 待办 | 无 | 承诺/威胁/谎言/公开宣告/交易仍落 fact；寒暄类不再落 fact（6 拍 smoke 看） |
| W3b-B2 | 20 拍重测 + 基线 | 待办 | W3b-B1 | `facts/beat ≤ 1.0`；守卫 5 类事件都在；`no_rate` 10–40%；基线文档更新 |

**串行执行：W3b-B1 → W3b-B2。**

判据只看 `facts/beat`（≤1.0 = 12 条覆盖一整场 12 拍）+ 守卫 5 类事件 + `no_rate`，不看“读起来是否更干净”。

---

## W3b-B1：rule 8 收窄 + 守卫探针

### 目标

把 `fact` 从“每句台词都留痕”收窄为“只有会改变后续判断的事件”。`facts` 的唯一消费者是裁判的 12 条切片，记成流水账等于把裁判视野压到两三拍。

### 范围

- `src/core/referee.ts` rule 8 重写：
  - 只有承诺、威胁、谎言、公开宣告、交易完成、身份揭示、状态改变才落 `fact`；
  - 判断句：“下一拍若不知道这条，会不会判错？会就记，不会就不记。”
  - 明确不记：寒暄、重复点单、已知信息、纯动作细节（收杯、擦桌、挪椅子）；
  - 在场者的即时记忆由 `observations` 承担；
  - 删掉“ann 说她明天就走可以记”这个鼓励记录台词的例子。
- `scripts/play.ts`：加 5 类守卫探针（交易 / 承诺 / 威胁 / 谎言 / 公开宣告），各出现一次；现有短对话、等待、长动作、末拍 move 保留。
- `scripts/play.ts` 体检表：加 `facts/beat`。
- `docs/design/10-world-model.md` §3、`docs/design/build.md` §2.1/§2.2、`docs/design/backlog.md` §2：已更新，按文档实现。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不加每拍 fact 硬上限（那是截断，不是判断）。
- 不做 fact 分层（major/minor）、近似去重、`supersededBy`。
- 不改 `FACT_BUDGET`；不改 `know`、时间、物质语义。
- 不动 `journal` / `passage` 的全量记录。

### 验收

- 6 拍 smoke：5 类守卫探针在相应拍里各落 1 条 `fact`；寒暄/点单类不再产生 fact。
- `facts/beat` 有数值输出。
- `npm run typecheck` 0；`npm test` 全绿（本卡不应改测试）。

### 独立验证

subAgent 只读检查 rule 8 文本、5 条探针、`facts/beat` 输出、6 拍样本；最多 5 条。

---

## W3b-B2：20 拍重测 + 基线

### 目标

用 20 拍回答“减量是否真的落地、有没有减掉信号”。

### 范围

- 跑 `rm -rf data && npm run play -- --beats 20 --auto`。
- 记录：`facts/beat`、`fact/claim`、守卫 5 类事件是否都在、`no_rate`、`transfer/consume`、`know`。
- 更新 `docs/research/world-baseline.md` 与 `docs/design/backlog.md` §4。
- 若 `facts/beat` 仍 >1.5，在文档里明确写“rule 8 收窄无效”，不要粉饰，也不要在本卡追加硬上限。

### 不做

- 不因指标难看当场再改 prompt；记录后另开卡。
- 不改 `FACT_BUDGET`。

### 验收

- `facts/beat ≤ 1.0`（20 拍 ≤20 条事实）；5 类守卫事件都在 facts 中。
- `no_rate` 落在 10%–40%。
- 基线数字与 `journal.jsonl` 一致；typecheck 0；测试全绿。

### 独立验证

subAgent 只读核对 `facts/beat`、守卫事件、`no_rate`、基线与 journal 一致；最多 5 条。

---

## 2. 后续候选（W3b-B 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| W4 人物状态持久化 | 人物 `experience/self` 未进 journal |
| W5 缓存前缀 / per-role sessionId | prompt 稳定后再调 |
| W6 服务端 + 阅读面 | 世界层 W3b–W4 有结论后 |
| `facts` 分层 | 只有在 `facts/beat ≤1` 仍丢信号时才考虑 |

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
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
