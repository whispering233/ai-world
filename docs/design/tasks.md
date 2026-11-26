# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C8 带道具的 20 拍新基线

**目标**：C7 改了起始世界（coat/rag/hook/strongbox.open），旧 baseline 不再直接可比；跑一次默认 20 拍作为新尺子，观察道具入账是否影响空结果/物质流/no_rate。

**范围**：
- `scripts/experiment-multi-round.ts --beats 20 --mode baseline --tag baseline-23 --force`；默认短句，无 `--long`/`--unlock`/`--focus`。
- 记录：每拍/总墙钟、clock、no_rate、空结果、facts/beat、know_rate、ops、coat/rag/hook/strongbox 的实际使用、hard/double、hints、段落 ≤3。
- 与 baseline-22 并排，但明确内容不同（C7 前/后），只做“新基线”不做严格 A/B。
- 产物 `data/experiment/baseline-23/` 不入库；研究记录 `docs/research/baseline-23.md`，更新 backlog §4。

**不做**：不改内容/检测器/调度；不因单次结果改结构；不跑 focus/long/unlock。

**验收**：20 拍完成；报告含 coat/rag/hook/strongbox 使用与 hard/double；文档记录。无代码改动。

**依赖**：C7 之后；独立 commit。

