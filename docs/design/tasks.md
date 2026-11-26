# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C6 20 拍定向 focus 探针

**目标**：给实验脚本加 `--focus`，每拍轮流选一个在场人物作为 `playerTo`，跑 20 拍，量“只叫玩家+目标”是否把场景变哑。

**范围**：
- `scripts/experiment-multi-round.ts`：新增 `--focus`（只允许 baseline；与 `--long`/`--unlock` 互斥）。
- 每拍从玩家所在地点的在场 `characters` 里按顺序轮换目标（排除玩家/陈设）；无目标时退回所有人。
- `runBeat` 传 `playerTo`；`BeatMetrics` 记录 `focusTarget`；不改 `runBeat`/`calledActors` 语义。
- 跑 `--beats 20 --mode baseline --tag focus-20 --focus --force`；记录 claims/拍、认知调用、空结果、no_rate、段落、hints、hard/double、目标分布。
- 研究记录 `docs/research/focus-20.md`；backlog 更新。

**不做**：不改裁判/调度/旁白；不把 focus 当默认；不跑 cross-talk focus。

**验收**：20 拍完成；每拍只有玩家+目标的 claim（除退回所有人）；报告含目标分布与空结果。

**依赖**：C5 之后；独立 commit。

