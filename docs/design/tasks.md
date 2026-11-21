# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W4 人物状态持久化

| # | 卡片 | 状态 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- | :--- |
| W4-1 | journal 记录人物的本拍产出，重放可复原 | 待办 | 无 | 只用 journal 就能重建 characters（experience/drives），不调模型 |
| W4-2 | 试玩器改为从 journal 续跑 | 待办 | W4-1 | 重启后人物记忆不丢；“继续”不再骗人 |

---

## W4-1：journal 记录人物产出

### 目标

现在 `journal` 只存账本的凭据（claims / verdicts / observations / driveHits），人物状态（`experience`、`self` 条目）只在内存里。进程一停，人物记忆全丢——`data/` 里那条世界历史还在，但没人记得。

修法：把**本拍每人新增的 experience** 一起写进 `journal`，`replay` 时按顺序应用，重建 characters。

### 范围

- `src/core/store.ts`：`JournalEntry` 增加 `experience: Record<EntId, Experience[]>`（只存**本拍新增**的条目，不是快照）。
- `src/core/beat.ts`：`runBeat` 结束时把本拍新增的 experience 随 journal 落盘。
- `src/core/character.ts` / `beat.ts`：新增 `applyExperience(chars, entries)` 之类的纯函数，供 replay 使用（与 `remember` 共用同一套逻辑，不新造第二份）。
- `src/core/store.ts`：`replay` 之外增加 `replayCharacters(journal, initial)`；不把人物塞进 `World`（世界仍只有 ledger/facts/places）。
- `docs/db/schema.md` §3：`journal` 增加 `experience` 字段。
- `tests/beat.test.ts` / `tests/store.test.ts`：两拍之后只用 journal 重建的人物，与内存结果相等。

### 不做

- 不存人物快照（`core`/`voice` 是作者层，从 content 来）。
- 不改 `World` 结构，不把 characters 塞进账本。
- 不做“人物状态进账本事务”——experience 是派生记忆，失败也不该回滚账本。
- 不改 cognition / referee 的 prompt。

### 验收

- 两拍后 `replayCharacters(journal)` 与 `runBeat` 返回的 characters 深相等。
- 旧 journal（没有 `experience` 字段）仍能 replay 世界，人物为空而不是崩。
- `npm run typecheck` 0；`npm test` 全绿。

### 独立验证

subAgent 只读检查 schema、落盘位置、重放相等测试、旧 journal 兼容；最多 5 条。

---

## W4-2：试玩器从 journal 续跑

### 目标

`npm run play` 现在每次从 `content` 重新开一局，`data/` 里的 journal 只 append、不被读回。结果：进程重启后人物记忆清零，但世界账本还在——“继续”看起来像真的，其实人已经忘了。

### 范围

- `scripts/play.ts`：
  - 启动时若 `journal.jsonl` 存在，读回 world + characters + clock + scene，从已发生的最后一拍继续；
  - 打印明确的续跑提示（拍数、clock、人物条数）；
  - `--fresh` 开关强制从零开始（替代现在“手动 rm -rf data”）。
- `docs/design/build.md`：更新游玩说明与 `--fresh`。
- `tests`：无新增（脚本层），靠 typecheck + 手工 6 拍续跑验证。

### 不做

- 不做多存档、不做分支时间线。
- 不读 `passage.jsonl` 重建任何状态（它只是文本）。
- 不改折场/场景重建规则；续跑时按 journal 的 scene 字段复原。

### 验收

- 跑 3 拍 → 退出 → 再跑 2 拍：第二段拍到 journal 的 seq 从 4 开始，人物 `experience` 累加而不是清零；体检表分母覆盖 5 拍。
- `--fresh` 能从零开始。
- typecheck 0；测试全绿。

### 独立验证

subAgent 只读检查续跑读取逻辑、`--fresh`、seq 连续性；最多 5 条。

---

## 2. 后续候选（W4 完成后再讨论）

| 候选 | 触发 |
| :--- | :--- |
| `fact` 结构化（actor / kind） | 事实密度停在 1.1–1.2，且“主语写错/把动作写成事件”反复出现 |
| W5 缓存前缀 / per-role sessionId | prompt 稳定后再调 |
| W6 服务端 + 阅读面 | 世界层稳定后 |
| 折场时压 experience | 上下文预算吃紧时 |

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
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。

## 4. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
