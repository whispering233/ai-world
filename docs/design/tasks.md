# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次：服务端重复代码与配置治理

边界：P0（静默缺陷）+ P1（B 档收敛）+ P3（无依赖注释项）。P2 死代码整体留下轮。
执行：单 lane 串行，每卡独立 commit，可单独回滚。
验证：`env -u PI_MODEL pnpm typecheck && env -u PI_MODEL pnpm test`。

---

### 卡 1 — 模型配置单一出口

**目标**：模型缺省值的两条链只有一处实现，代码里不再出现具体模型串。

- `packages/core/src/config.ts`
  - 删 `FALLBACK_MODEL`（`:22`）与其两处默认参数（`defaultConfig(base = …)`、`loadModelConfig(path, base = …)`）
  - `readPiDefaultModel`：provider 取 `process.env['PI_PROVIDER'] ?? settings.defaultProvider`
  - 新增 `DEFAULT_RETRY`（现散在 `:97-99` 与 `llm.ts:156`）、`DEFAULT_CONFIG_PATH = 'config/models.json'`、`piAgentDir()`
  - `ModelConfig.retry` 改必填 → `defaultConfig`（`:47-50`）与 `loadModelConfig`（`:80-84`）两处构造点必须同步补 `retry`
  - 新增 `resolveModelConfig()`：自己读 `AI_WORLD_CONFIG`（不做成第三参数），内部用 `DEFAULT_CONFIG_PATH` 与 `piAgentDir()`；两条链都取不到模型则抛错
  - `:18` 注释「缺省 2 次、800ms」改为「由 `DEFAULT_RETRY` 归一化后填写」
- `packages/core/src/llm.ts`：`:156` 改 `config.retry ?? DEFAULT_RETRY`；`:126-127` 删掉已被 `docs/design/config.md:71` 证伪的「（pi CLI 同款策略）」
- `packages/core/src/pi-credentials.ts:10` 改用 `piAgentDir()`
- `config/models.json` → `{ "models": {}, "sessionIdPrefix": "play" }`
- 全部 7 个调用点改调 `resolveModelConfig()`：`server/index.ts:46-53`、`scripts/play.ts:126-133`、`experiment-storylet.ts:189-201`、`experiment-multi-round.ts:740-744` 与 `:903`、`probe-storylet.ts:150-155`、`probe-storylet-fill.ts:32-38`、`probe-latency.ts:13,35`；`retry: cfg.retry` 收掉 6 处 `...(cfg.retry ? … : {})`
- `packages/core/src/config.test.ts`：**删** `:32-34`「不给基准模型时退回常量」；补 PI_PROVIDER 用例、空模板用例、两条链都缺时报错用例
- docs 随卡：`config.md` §1/§1.1 与其 §4 表尾「模型配置文件路径 / pi agent 目录 / 重试策略缺省」三行；`build.md:101-108`、`50-llm.md:194` 的优先级链

**风险**：7 个入口都可能因「无模型」起不来；真实启动验证要单独做一次。

---

### 卡 2 — 存储路径单一来源

- `packages/core/src/store.ts`：`JOURNAL`/`PASSAGE` → 导出 `JOURNAL_FILE`/`PASSAGE_FILE`；`openStore` 内部（`:66-67`）一并改引用；新增 `dataDir(worldId)`
- `packages/server/src/session.ts:118-119`（定义）、`:431-432`（rmSync）
- `packages/server/src/index.ts:96`
- `scripts/play.ts:41`、`:146-147`
- docs 随卡：`config.md` §4「试玩存档目录」行；`60-server.md` §2 补单一来源说明；`db/schema.md` §3/§4 标题下补文件名归属

**注**：`data/` 根还有三个实验脚本目录（`data/exp-storylet`、`data/experiment`、`data/probe-storylet`），本轮不动；文档措辞只承诺「世界目录」单一来源。

---

### 卡 3 — 路由 HTTP 辅助函数

- 新建 `packages/server/src/routes/http.ts`：
  - `codeOf(error)` / `errorsOf(error)` / `readJsonObject(c)` —— 三处逐字重复的提取
  - `fail(c, code, status, msg, data?)` / `success(c, data)` —— 信封，**status 由调用点显式传入**
  - **不放 STATUS 基准表**：author（3 键）与 reset（4 键）成员集不同，那是策略不是重复；也不引入顶层 `onError`
- `routes/beat.ts`：`E_INVALID_BODY`×5、`E_EMPTY_INPUT`、`E_BEAT_IN_FLIGHT` 改 `fail`；删本地 `readBody`/`codeOf`
- `routes/author.ts`：保留本地 STATUS 映射，删 `codeOf`/`errorsOf`/`readText` 重复部分，3 处成功信封改 `success`
- `routes/reset.ts`：保留本地 STATUS 映射，删 `codeOf`/`errorsOf`/`readBody`；删 `:29` 与 `session.reset()` 重复的 in-flight 检查（已核实 `reset.test.ts` 用真 `createSession`，删除不会假绿）
- `routes/session.ts`：1 处成功信封改 `success`
- 测试：`routes/beat.test.ts`、`routes/reset.test.ts` 两个（author 无测试）
- docs 随卡：`error-code.md` 只写语义（「当前没有任何路径产出 `E_INTERNAL`，客户端不要依赖它出现」），不点名内部函数

---

### 卡 4 — 模型输出解析单一入口

- `packages/core/src/model-json.ts`：新增 `tryParseModelJson(text): Record<string, unknown> | undefined`
- 三处按**正确行区间**替换（原计划区间全错位）：`cognition.ts:62-66`、`suggest.ts:69-73`、`referee.ts:300-304`
- 三处兜底语义**原样保留**：cognition → 整段原文截 120 码点当 outward；suggest → `[]`；referee → `parseRefereeOutput` 的 emptyOutput + note
- `model-json.test.ts` 补用例

---

### 卡 5 — usage 零值单一来源

- 新建 `packages/core/src/usage.ts`：`zeroUsage(): UsageView`（**不放 shared**：shared 定位是 DTO 类型 + SSE 事件常量，且 web 无此需求）
- `packages/core/src/index.ts` 按字母序插入 `export * from './usage.ts'`（`suggest.ts` 与 `view.ts` 之间）
- 删 `packages/server/src/llm.ts:16-18` 的 `emptyUsage`，改 import
- `packages/server/src/session.ts:141-144`、`:336`、`scripts/play.ts:118-123`
- **不做** `addSample`/`addUsage`：改完各只剩 1 个调用点，踩「两个调用点之前不抽象」；`play.ts:133-142` 与 `session.ts:401-416` 的 `accumulate` 保持内联

---

### 卡 6 — 世界 id 与默认世界单一来源

- `packages/content/src/load.ts`：导出 `isWorldId()`（现 `:12` 的私有正则）与 `DEFAULT_WORLD`
- `packages/server/src/index.ts:29-31`
- `scripts/play.ts:25,33`（`:97` 的 `AUTO_SCRIPTS` 键保持字面量，那是世界名不是默认值）
- docs 随卡：`config.md` §4「世界选择」行

---

### 卡 7 — 删 `describeLedger` 复制体

- `scripts/experiment-multi-round.ts:213-226` 删除（函数体与 `core/beat.ts:467-478` 逐字相同），改 import `describeLedger`
- 清理 `:43` 因删除而未被使用的 `describeFacts` / `LedgerView` 导入（无 `noUnusedLocals`，不清也不会报错）

---

### 卡 8 — `sceneText` 单一来源

**背景**：`session.ts:498-506` 与 `play.ts:293-303` 喂的是**同一个消费点** `BeatInput.sceneText`，差别只是服务端用 `roster(pack)`（含玩家）、试玩器用 `pack.characters`（不含）。这是漂移，而 `play.ts` 是产出 `docs/research/*` 全部基线的唯一工具。

- 在 `packages/core/src/content.ts` 新增 `sceneText(pack, world)`，采用**服务端现状**（含玩家），并更新该文件「只做静态校验」的说明
- `packages/server/src/session.ts:498-506` 改为调用它
- `scripts/play.ts:293-303` 改为调用它，删掉「同序、同形」的自述注释
- **生产行为零变化**；试玩器现场文本从此与服务端同源

---

### 卡 9 — 注释与文档对齐

源码：
- `server/focus.ts:2`（指向已清空的 `tasks.md` C10 → 改指 `00-master-design.md` 决策 #48）
- `core/suggest.ts:2`（同上 S1 → 改指 `docs/research/`）
- `core/beat.ts:22`（「旧调用点不传」→ 实际是现行 CLI 试玩器与 experiment-storylet）
- `core/view.ts:152`（「预留给单拍详情」→ 实际无人读；**只改注释，字段删除留 P2**）
- `core/llm.ts:49-50`（「不报时缺省」→ `createLlm` 无条件写 `cacheRead`；**注意 `server/llm.ts:39-40` 的 `?? 0` 不是死分支**，服务端单测的 stub 不返回缓存字段）
- `core/referee.ts:275-278`（悬空 JSDoc → 移到 `createLlmReferee` 上方）
- `core/cognition.ts:2`（补 `crossTalk` 说明，必须写明**实验专属、冻结中**，生产路径仍是一次调用进出）
- `scripts/conflicts.ts:4-6`（历史实现决策 → 迁移进 `docs/research/conflict-detector.md`）
- **C14**：5 处在场口径各加注释说明为何不同：`view.ts:65-70`、`beat.ts:394-397`、`session.ts:487-491`、`session.ts`（`sceneText` 已随卡 8 移走）

文档：
- `10-world-model.md:78`（`knows` 不只被玩家抽屉消费，`beat.ts:407` 已喂动作提示器）
- `docs-map.md` research 表补 `conflict-detector.md`

---

### 卡 10 — 【等 P2 决议】

以下三项与 P2 的 `nextWake`/`dueActors`/`busyUntil` 处置是同一件事，**在 P2 决定「接线」还是「连文档一起撤」之前不得修改**：

- `db/schema.md:72` `busyUntil` 的「≥ clock」约束（实际恒为 0、从不更新）
- `40-time-and-loop.md:52` 伪代码 `if claims 为空: clock = min(busyUntil)`
- `30-cognition.md:52` 「触发需 `max(heat) ≥ 0.8` 或 `≤ 0.1`」（同节 `:62` 已自认未实现）

另：P2 待做清单 —— `nextWake`/`dueActors`/`Activity`（生产零调用）、`AuthorViewInput.passages`、`Session.contentPath()`、`export { fmt }`、`smoke.test.ts`、`FoldMaterial.perEnt`（有 `backlog.md` §5 台账）、storylet 四脚本的处置。
