# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：P0（先测量，再改世界）

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| C1 | 旁白失败兜底 | 待办 | 无 | 旁白抛错/空文本不丢拍；journal 先落；passage 用 `fallback`；notes 留痕 |
| C2 | 显示名 / 玩家可读投影 | 待办 | C1 | 人物/物品有显示名；prompt、旁白、体检表不再泄漏 id |
| C3 | 体检表 + 探针 + 20 拍重测 | 待办 | C1、C2 | 新体检表含 op 分布/duration 分桶/know_rate/名字泄漏；20 拍基线写入文档 |

**串行执行：C1 → C2 → C3。** C1 与 C2 都改 `beat.ts` / `narrate.ts`，并行会冲突；C3 要在名字干净、旁白不丢拍的基线上跑。

---

## C1 旁白失败兜底

### 目标

裁判已经 commit 之后，渲染调用抛错或返回空文本时，不丢拍、不重跑裁判、不编新事实。

### 范围

- `src/core/narrate.ts`：新增确定性 fallback 格式化（只读 `NarrationEvent` + verdict）。
- `src/core/beat.ts`：包住 `narrator.narrate()`；`text.trim() === ''` 视为失败；**先写 journal，再写 passage**。
- `src/core/store.ts`：`PassageEntry.source` 增加 `fallback`。
- `docs/design/20-referee.md` §6.1、`docs/db/schema.md` §4：已更新，按文档实现。
- `tests/beat.test.ts`、`tests/narrate.test.ts`：失败路径 + 正常路径。

### 不做

- 不重跑裁判；不把旁白纳入账本事务。
- 不因 `findAbsoluteTime` 命中而改写已发文本。
- 不新增旁白重试套娃（`llm.chat` 已有传输层重试）。

### 验收

- narrator 抛错：`runBeat` resolve；world 已提交；journal 1 条；passage `source: 'fallback'`；notes 含“旁白失败”；fallback 只含 claim/outcome，不含新事实。
- narrator 返回空串：同上。
- narrator 正常：行为与现在一致，`source: 'narrator'`。
- `npm run typecheck` 0；`npm test` 全绿（现有 107 + 新增）。

### 独立验证

subAgent 只读检查失败路径、journal/passage 顺序、是否有账本改写；最多 6 条。

---

## C2 显示名 / 玩家可读投影

### 目标

正文、prompt、体检表和未来的 UI 抽屉都不再出现 `player`、`ann`、`doc`、`cody`、`granny`、`silver-dollar` 这类 id。

### 设计

- `ContentPack` 增加静态映射：`names: Record<EntId, string>`、`items: Record<ItemId, string>`（作者层内容，不进 World、不进账本、不被裁判改）。
- `content/starter-town.ts` 提供全部人物、玩家、物品的显示名。
- `validatePack` 要求：`ledger.at` 的每个实体有名字；`holds` 里出现的每个物品有名字；名字非空。
- `describeLedger()`、`play.ts` 的 `describeScene()`、旁白的 `NarrationEvent` 使用显示名；缺失时回退 id（防御性）。
- `NarrationEvent` 增加 `name` 字段（`actor` 仍保留 id，供 journal/工具对齐）。
- 裁判 claim 的 `actor` 仍用 id（schema 需要）；裁判现场文本用“名字(id)”保留映射，认知/旁白侧只用名字。

### 不做

- 不做 UI；不做头像/立绘。
- 不改 `beliefs` 的键（仍用 id，作为已知边界）。
- 不做名字的运行时生成；名字是作者层静态内容。

### 验收

- `content/starter-town.ts` 的 4 个人物 + 玩家 + 6 个物品都有显示名。
- `validatePack` 缺名字时返回错误；测试覆盖缺人物名/缺物品名。
- 6 拍 `play.ts --auto` 的 passage 中 `player/ann/doc/cody/granny` 出现次数为 0（或只有明确的调试输出，不在正文）。
- `npm run typecheck` 0；`npm test` 全绿。

### 独立验证

subAgent 只读检查 content 映射、prompt 中的名字、6 拍样本的名字泄漏；最多 6 条。

---

## C3 体检表 + 探针 + 20 拍重测

### 目标

用可信的测量回答“物质流 / 时间 / 知识通胀”到底还剩多少，而不是继续引用旧基线。

### 范围

- `scripts/play.ts`：
  - op 分布：`move/give/take/phys/rel/fact/know`（只统计已提交 claim 的 deltas，回滚的不算）；
  - `know_rate` = `know` 写操作 / 全部已提交写操作；
  - duration 分桶：0–3 / 4–30 / 31–239 / ≥240 分钟（统计全部 `ok` verdict，不再要求空 deltas）；
  - 名字泄漏计数：正文匹配 `player|ann|doc|cody|granny`；
  - `no_rate`、空结果、每拍墙钟耗时；
  - `--auto` 探针混入四类：短对话、物理动作、长动作、知识交换（见 `docs/design/build.md` §2.2）；移动探针放**最后一拍**，避免出门被门闩锁住后污染整轮。
- `docs/design/build.md` §2.1/§2.2：已更新，按文档实现。
- 运行并记录：
  - 6 拍 smoke：确认 `give/move` 能出现；长动作探针若被裁判拒绝，按“时间钉死”证据记录，不在本卡改裁判；
  - 20 拍基线：`rm -rf data && npm run play -- --beats 20 --auto`；
  - 结果写入 `docs/research/world-baseline.md`，并更新 `docs/design/backlog.md` §4 的旧 20 拍表。

### 不做

- 不改 referee/cognition 的语义提示；这是测量卡。
- 不因为指标难看就当场调 prompt；先记录，再切下一张卡。

### 验收

- 体检表包含上述全部指标；`--beats 20 --auto` 完整跑完、无崩溃。
- `docs/research/world-baseline.md` 有：日期、模型、探针构成、写操作分布、`know_rate`、duration 分桶、`no_rate`、名字泄漏、与旧基线的差异说明。
- `docs/design/backlog.md` §4 更新为新基线（旧表删除，不留历史）。
- `npm run typecheck` 0；`npm test` 全绿（本卡不应改测试，若改了需说明）。

### 独立验证

subAgent 只读核对体检表字段、20 拍产物、文档数字与 `metrics`/journal 一致；最多 6 条。

---

## 2. 等 C3 数据后再切（现在不建卡）

| 候选 | 为什么等 |
| :--- | :--- |
| W1 物质流 | 先看新探针下 `give/take/move` 是否仍为 0；再看 claim 是否只有 talk |
| W2 时间 | 先看 duration 分桶；旧“长动作 0%”指标有偏差 |
| W3 知识通胀 | 根因可能是 `REFEREE_SYSTEM` rule 10 要求每句话都 `know`；用 `know_rate` 定量后再改 |
| W4 人物状态持久化 | 需要先定 journal 记录 cognition/experience 的 schema |
| W5 缓存前缀顺序 / per-role sessionId | 等 prompt 稳定后再调 |
| W6 服务端 `/beat` SSE + `/state` + 阅读面 | 等 W1–W4 与 20 拍判据；UI 设计已定稿，不重复讨论 |

## 3. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现"动作枚举""技能表""时长表"一律打回。
- 测量先于改世界：P0 先修测量与可读性，再用新基线切世界层卡。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
