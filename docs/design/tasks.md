# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W5 缓存前缀与计量

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W5-1 | cognition system 前缀重排 + cache 计量 | 待办 | 无 | 稳定段在 canon 前；`cacheRead/cacheWrite` 进入 ChatResult/UsageSample/体检表；顺序测试 |
| W5-2 | 6 拍 smoke 与文档 | 待办 | W5-1 | 真实调用能打印缓存量；不宣称未上报的命中；文档/CHANGELOG 更新 |

**串行执行：W5-1 → W5-2。**

明确不做 per-role sessionId：`sessionId` 是 OpenCode 的路由/缓存亲和头，不是消息线程；一次世界运行保持一个。

---

## W5-1：前缀重排 + cache 计量

### 目标

让 `cognition` 的 system 段按稳定度排序，稳定前缀尽量长；同时把 provider 的 `cacheRead` / `cacheWrite` 暴露出来，用数据判断改动是否有效。

### 范围

- `src/core/cognition.ts` `buildSystem` 顺序改为：
  - `core + voice`
  - 输出指令（稳定）
  - `canon`（半稳定）
  - `drives`
  - `beliefs`
  - 记忆检索
- `src/core/llm.ts`：
  - `ChatResult` 增加可选 `cacheRead` / `cacheWrite`；
  - `UsageSample` 增加 `cacheRead` / `cacheWrite`，由 `onUsage` 带出；
  - `createFauxLlm` 不必补字段（可选）。
- `scripts/play.ts`：usage 聚合与体检表输出 `cacheRead / cacheWrite`。
- `tests/cognition.test.ts`：用捕获的 system 断言“稳定段在 canon 前、canon 在 drives/beliefs/memory 前”。
- `docs/design/50-llm.md` §10.2、`docs/design/build.md` §2.1：已更新。
- `CHANGELOG.md` 的 `Unreleased`。

### 不做

- 不拆 per-role sessionId。
- 不改 referee / narration 的 system（它们已是固定单段）。
- 不引入 cache-warming / thinkingBudgets / 压缩策略。
- 不改模型、不改世界语义。

### 验收

- system 顺序测试通过；typecheck 0；测试全绿。
- 体检表能打印三者的 `cacheRead/cacheWrite`；`createFauxLlm` 的现有四字段结果不变。
- provider 不报缓存时只显示 0，不写“命中”。

### 独立验证

subAgent 只读检查 `buildSystem` 顺序、cache 字段链路、测试；最多 5 条。

---

## W5-2：6 拍 smoke 与文档

### 目标

用真实调用确认缓存字段能上报，并记录“上报了/没上报”，不夸大结论。

### 范围

- 跑 `rm -rf data && npm run play -- --beats 6 --auto`。
- 记录：每角色 `input/output/cacheRead/cacheWrite`、拍数、模型串。
- 更新 `docs/research/` 里与缓存有关的说明（只记实测，不写“应该命中”）。
- 若 provider 全 0：明确写“当前 provider 未上报缓存量”，W5 只完成顺序与计量，不宣称收益。

### 不做

- 不跑 20 拍（W5 不是世界行为卡）。
- 不为凑缓存数字改 prompt 或模型。

### 验收

- 6 拍完整跑完；体检表有 cache 两列。
- 文档记录真实值或“未上报”；typecheck 0；测试全绿。

### 独立验证

subAgent 只读核对 6 拍输出与文档记录；最多 4 条。

---

## 2. 后续候选（W5 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| `fact` 结构化（actor / kind） | 事实密度停在 1.1–1.2，主语归属反复出错 |
| W6 服务端 + 阅读面 | 世界层稳定后 |
| 折场时压 experience | 上下文预算吃紧时 |

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
- `facts/beat` 当前 1.10–1.20，已接受为已知缺口；不再用 prompt 硬压。
- 人物的新记忆与 `driveHits` 进 journal；未落 journal 的拍不推进记忆；`replayCharacters` 只用 journal。
- `sessionId` 是 provider 的路由/缓存亲和头，不是消息线程；一次世界运行一个，不按角色拆。
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
