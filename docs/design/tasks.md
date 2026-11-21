# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W1 物质流（方案 C）

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W1-1 | op 语义清理：`give/take` → `transfer/consume` | 待办 | 无 | 新 op 只发 `transfer/consume`；旧 journal 别名可 replay；测试/文档同步 |
| W1-2 | 物质流探针与测量 | 待办 | W1-1 | 合法 `transfer/consume` 能提交；按 actor 拆分；净持有变化与回滚原因可见；20 拍基线更新 |

**串行执行：W1-1 → W1-2。** W1-2 的探针、指标和基线依赖新 op 名。

---

## W1-1：op 语义清理

### 目标

让“持有变化”只有一种表达：`transfer`；让“物品离开世界”只有一种表达：`consume`。不再让模型猜 `take` 是拿走还是消耗。

### 范围

- `src/core/world.ts`：`Op` 联合类型改为：
  - `transfer { from, to, item, n }`
  - `consume { from, item, n }`
- `src/core/ledger.ts`：`applyOne` 支持 `transfer` / `consume`；保留旧 `give` / `take` 作为 **replay 别名**（只兼容旧 journal，新输出不再发）。
- `src/core/referee.ts`：
  - tool schema 的 op 枚举改为 `move/transfer/consume/phys/rel/fact/know`；
  - `REFEREE_SYSTEM` rule 7/9 与 deltas 列表改新名；
  - 增加一句：`item` 必须填上下文括号里的 id（如 `whiskey`），不能填显示名（如 `威士忌`）。
- `scripts/play.ts`、`scripts/experiment-multi-round.ts`：op 统计数组与冲突检测改新名。
- `tests/ledger.test.ts`、`tests/referee.test.ts`、`tests/beat.test.ts`：改用新名；新增旧别名 replay 测试。
- `docs/design/10-world-model.md`、`docs/design/build.md`：已更新，按文档实现。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不加第三个转移 op；`transfer` 取代 `give`，不是并存。
- 不做容器/物品位置。
- 不做部分提交；一条 claim 的 op 仍全成或全退。

### 验收

- 新裁判输出只使用 `transfer`/`consume`；tool schema 不再允许旧名。
- `apply` 对 `transfer`/`consume` 行为正确；旧 `give`/`take` 仍可 replay。
- `npm run typecheck` 0；`npm test` 全绿。
- 文档中不再把 `give/take` 当新 op 描述；只保留“旧 journal 别名”一句。

### 独立验证

subAgent 只读检查 op 类型、apply 分支、tool schema、旧别名 replay、测试；最多 6 条。

---

## W1-2：物质流探针与测量

### 目标

回答“合法物质动作能不能落账、由谁发起、账本净变化是什么”，不再只看 op 总数。

### 范围

- `scripts/play.ts`：
  - `--auto` 探针补 `consume`：买到酒后“我把自己那杯威士忌喝掉。”；保留 `transfer` 探针“把银元塞进安手里”；
  - 物质 op 按 actor 拆分：player / NPC；
  - 打印结束时 `holds` 相对初始值的净变化（只列非零项）；
  - 汇总回滚原因，尤其 `item` 写成显示名导致的“身上没有这么多”；
  - `opNames` 改 `move/transfer/consume/phys/rel/fact/know`。
- 跑：
  - 6 拍 smoke：确认 `transfer` / `consume` 能提交；
  - 20 拍基线：`rm -rf data && npm run play -- --beats 20 --auto`；
  - 更新 `docs/research/world-baseline.md` 与 `docs/design/backlog.md` §4。
- `docs/design/build.md` 的体检表说明补齐净持有变化与 actor 拆分。

### 不做

- 不为了“每 N 拍必须有物质动作”改裁判或加动作词表。
- 不扩容器。
- 不因指标难看当场调 prompt；item id 仍有错就单独开 exact-name 归一化卡。

### 验收

- 6 拍 smoke 至少出现 1 次已提交 `transfer`；若探针合法，`consume` 能提交（失败时保留具体拒绝原因）。
- 体检表有 actor 拆分、净持有变化、回滚原因；数字与 `journal.jsonl` 一致。
- 20 拍基线更新；`npm run typecheck` 0；`npm test` 全绿。

### 独立验证

subAgent 只读核对探针、体检表字段、20 拍数字与 journal 一致；最多 6 条。

---

## 2. 后续候选（W1 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| W2 时间 | 只有 1–3 分钟与 480 分钟两端，没有中间时长 |
| W3 知识通胀 | `know` 占已提交写操作 68.6% |
| W4 人物状态持久化 | 人物 `experience/self` 未进 journal |
| W5 缓存前缀 / per-role sessionId | prompt 稳定后再调 |
| W6 服务端 + 阅读面 | 世界层 W1–W3 有结论后 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现“动作枚举”“技能表”“时长表”一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` 定位，再切世界层卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
