# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C5 第三次同条件 20 拍（段落复测）

**目标**：baseline-20 的段落 ≤3 是 17/20，baseline-21 是 12/20；按 backlog 的“三次”口径再跑一次同条件 20 拍，判断段落回退是采样波动还是稳定趋势。

**范围**：
- `scripts/experiment-multi-round.ts --beats 20 --mode baseline --tag baseline-22 --force`；默认短句，不加 `--long`/`--unlock`/focus。
- 记录：段落 ≤3 的拍数、8 拍以上的分布、no_rate、空结果、facts/beat、know_rate、ops、hard/double、hints、墙钟。
- 与 baseline-20/21 并列；明确三次不是同轨迹，只用分布。
- 产物 `data/experiment/baseline-22/` 不入库；研究记录进 `docs/research/baseline-22.md`，更新 backlog。

**不做**：不改旁白/调度/检测器；不因单次结果改结构；不跑 focus/long/unlock。

**验收**：20 拍完成；记录段落三次对比；结论只到“是否进入结构化段落上限卡”。无代码改动。

**依赖**：C4 之后；独立 commit。

：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、作者 places/names/items 表单、实验双花检测、新检测器 20 拍基线。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)、[../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md)、[../research/s1-suggest-smoke.md](../research/s1-suggest-smoke.md)、[../research/b1-focus-smoke.md](../research/b1-focus-smoke.md)、[../research/conflict-detector.md](../research/conflict-detector.md) 与 [../research/baseline-21.md](../research/baseline-21.md)；A1/A2/S1/B1/C1/C2 另做过真浏览器验证。

成交/解锁探针：baseline-20 第 6 拍已完整成交一杯威士忌；8 拍偷钥匙/开铁盒全部被角色守住（内容 gate，不是 op 缺陷）。空结果分类：77 条里 52 纯说话、17 姿态、1 同拍净变化为零、7 道具/位置；没有系统性漏账。

C1/C2 的结果：作者壳可改 `places`/`names`/`items` 显示值，空地点名/物品名被 `validatePack` 拒绝；真浏览器保存→开新局后玩家状态行显示“雨夜酒馆 / 安妮”，items 保存写盘；363 测试、typecheck、build 绿。baseline-21：空结果 60.6%、no_rate 7.1%、`facts/beat` 1.25、`know_rate` 0%、hard/double 0/0、12/20 拍 ≤3 段；时间探针 240/480 分钟。下一批候选在 [backlog.md](backlog.md) §5；切卡前先定优先级。
