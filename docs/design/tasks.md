# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W2 时间

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W2-1 | clock 只按已提交 claim 推进 | 待办 | 无 | 拒绝/回滚的 480 分钟 claim 不推进 clock；合法 480 推进；测试锁住 |
| W2-2 | 时长探针 + 20 拍重测 | 待办 | W2-1 | 只跑一次长动作；补 10–30 分钟谈话探针；duration 分桶出现中间值；基线更新 |

**串行执行：W2-1 → W2-2。**

---

## W2-1：clock 只按已提交 claim 推进

### 目标

让 `clock` 和“已提交的世界变化”对齐：被拒绝的 claim、op 非法整条回滚的 claim，都不推进世界时间。

### 范围

- `src/core/beat.ts`：
  - 先用 `commit` 做一次 dry run，拿到真正 `committed` 的 claim id；
  - `clockAfter = clock + max(已提交 claim 的 duration)`；
  - 再用 `clockAfter` 做真实 commit，保证 fact.at 落在本拍结束时刻。
- `tests/beat.test.ts`：
  - 拒绝的 480 分钟 claim → clock 不变；
  - ok 但 op 非法回滚的 480 分钟 claim → clock 不变；
  - 合法 480 分钟 claim → clock +480；
  - 拒绝的 480 + 合法的 5 → clock +5，不是 +480。
- `docs/design/40-time-and-loop.md`：已更新，按文档实现。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不改 `duration` 的上下限、裁判 prompt、`fmt(clock)`。
- 不引入昼夜系统、时间词表、`busyUntil` 重写。
- 不部分提交；一条 claim 仍全成或全退。

### 验收

- 四个时钟测试通过；`npm run typecheck` 0；`npm test` 全绿。
- 合法长动作的 fact.at 与本拍结束 clock 一致；replay 仍相等。
- 没有未提交 claim 推进 clock 的路径。

### 独立验证

subAgent 只读检查 dry run/真实 commit、四个测试、replay；最多 5 条。

---

## W2-2：时长探针 + 20 拍重测

### 目标

确认时间不是只有“1–3 分钟”和“整夜”两端；同时避免自动探针重复“睡一整夜”制造假长动作。

### 范围

- `scripts/play.ts`：
  - 长动作探针只跑一次（固定拍或条件触发），不再随循环重复；
  - 补一条 10–30 分钟谈话探针（如“我和安聊了一会儿镇上的事。”）；
  - 保留 1–3 分钟短交锋与最后一拍 move 探针。
- 跑：
  - 6 拍 smoke：合法长动作只出现一次；中间时长探针能触发；
  - 20 拍基线：`rm -rf data && npm run play -- --beats 20 --auto`；
  - 更新 `docs/research/world-baseline.md` 与 `docs/design/backlog.md` §4。
- `docs/design/build.md`：探针说明补“长动作只跑一次”。

### 不做

- 不加强制时长/动作表；只允许加一条 `duration` 与当前 `clock` 的语义澄清（长动作可以推进时间，不因当前 clock 尚早被拒）。
- 不加动作时长表。
- 不改知识通胀提示。

### 验收

- 6 拍 smoke：长动作只出现一次；至少一条 4–30 分钟裁决（若裁判仍拒绝，记录原因）。
- 20 拍 duration 分桶不再只有 0–3 和 ≥240；若仍是两端，文档明确写“探针失败”而不是掩盖。
- 基线数字与 journal 一致；typecheck 0；测试全绿。

### 独立验证

subAgent 只读核对探针次数、duration 分桶、基线数字与 journal 一致；最多 6 条。

---

## 2. 后续候选（W2 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| W3 知识通胀 | `know` 占已提交写操作 67.2% |
| W4 人物状态持久化 | 人物 `experience/self` 未进 journal |
| W5 缓存前缀 / per-role sessionId | prompt 稳定后再调 |
| W6 服务端 + 阅读面 | 世界层 W2–W3 有结论后 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` 定位，再切世界层卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
