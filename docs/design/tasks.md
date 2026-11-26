# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C7 道具/位置入账（湿外套、抹布、钉子、盒盖）

**目标**：把已有叙述里的湿外套、抹布变成可持有/可放置的物品，并给门边钉子与铁盒盖一个可落账的位置；不改 v1 的 `holds` 模型。

**范围**：
- `content/starter-town.json`：
  - `items` 增 `coat: 湿外套`、`rag: 抹布`；
  - `player.holds` 增 `coat:1`，`granny.holds` 增 `rag:1`；
  - `at` 增 `hook: saloon`，`names.hook = 门边钉子`（挂外套的承载点）；
  - `phys.strongbox` 增 `open:false`（盒盖开合；`locked` 仍是锁）。
- `packages/content/src/content.test.ts`：更新陈设/物品断言，确认新增物品与初始持有、钉子不是人物。
- 文档：`10-world-model` §10 说明小物也走 `items`/`holds`、同台面内微调不建模；`backlog` 更新道具结果。

**不做**：同台面内坐标（“挪半掌”）、瓶/杯的毫米级位置、新 op、陈设移动；不把 `hook` 加进人物/认知/claim。

**验收**：`pnpm test`、`pnpm typecheck`；内容校验绿；12 拍 smoke 观察 `coat`/`rag`/`hook` 是否被裁判使用（不强制每拍都动）。

**依赖**：C6 之后；独立 commit。

