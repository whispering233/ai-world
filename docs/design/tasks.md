# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### M1 物品位置（家具实体）

**目标**：让“放柜台 / 锁铁盒 / 杯子放回桌上”能落成 `transfer`/`phys`，而不是只写 `fact`；不改 `Op`/schema。

**范围**：
- `content/starter-town.json`：新增非人实体 `counter`（柜台）、`strongbox`（铁盒）、`table`（桌子），都在 `saloon`；`counter` 持 `whiskey×3`、`cup×2`；`strongbox` 持 `ledger-book×1`、`phys.locked=true`；`table` 持 `cup×1`；`ann` 持 `cup×1`；`items` 加 `cup`。
- `packages/server/src/session.ts`：`sceneText()` 只列 `player + characters`，不把门/灯/柜台列进“在场”。
- `packages/core/src/referee.ts`：`REFEREE_SYSTEM` 增一条“物品位置”规则 + 三个 op 例子（放柜台、锁铁盒、杯子放回柜台）；不写动作词表。
- 测试：内容加载/校验、`sceneText` 不含陈设、裁判提示含规则、`transfer`/`phys` 对陈设可落账（`ledger.test.ts` 或 `beat.test.ts` 各一条）。

**不做**：`Op`/schema 新字段、`kind`、`placeItems`、运行时创建、家具 `move` 的 `apply` 层拦截（v1 靠裁判规则 + smoke 检查）。

**验收**：`pnpm test`、`pnpm typecheck`；12 拍 smoke `--tag m1-fixtures`，对比 material op 数、transfer 涉及陈设的次数、“瓶子没动”类拒绝理由、空结果占比；journal 里陈设不得被 `move`。

**依赖**：T2–T5/D/A1/A2 之后；独立一 commit。

T2–T5、D、A1/A2 已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md) 与 [../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)；A1/A2 另做过真浏览器验证（首屏、状态行、等待→settled→passage）。

下一批候选在 [backlog.md](backlog.md) §5 与 `00-master-design.md` 决策 #47/#48；切卡前先定优先级。