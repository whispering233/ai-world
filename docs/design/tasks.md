# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C4 新检测器 20 拍基线

**目标**：用 C3 的 `detectConflicts` 重跑 20 拍，拿到能和 `baseline-20` 对比的 hard/double 数字，确认第 17 拍旧误报不再出现。

**范围**：
- 跑 `scripts/experiment-multi-round.ts --beats 20 --mode baseline --tag baseline-21 --force`；默认短句，不启用 `--long`/`--unlock`/focus。
- 记录：每拍墙钟、no_rate、空结果、facts/beat、know_rate、ops、hard/double/move/phys、`conflictDetails`、duration、段落数、hints。
- 与 `baseline-20` 并列；明确哪些差异是采样波动，哪些是检测口径变化。
- 产物 `data/experiment/baseline-21/` 不入库；研究记录进 `docs/research/baseline-21.md`，更新 backlog 指标。

**不做**：不改检测器/世界/内容；不把单次 20 拍当统计显著；不跑 focus/long/unlock。

**验收**：20 拍完成；报告含 hard/double 与 `conflictDetails`；文档记录并更新 backlog。无代码改动。

**依赖**：C3 之后；独立 commit。

T2–T5、D、A1/A2、M1、S1、B1、C1、C2、C3、20 拍基线（baseline-20）已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、作者 places/names/items 表单、实验双花检测、20 拍回归基线。：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、作者 places/names 表单、items 表单、20 拍回归基线。：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、作者 places/names 表单、20 拍回归基线。：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、20 拍回归基线。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)、[../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md)、[../research/s1-suggest-smoke.md](../research/s1-suggest-smoke.md) 与 [../research/b1-focus-smoke.md](../research/b1-focus-smoke.md)；A1/A2/S1/B1 另做过真浏览器验证。

成交/解锁探针：baseline-20 第 6 拍已完整成交一杯威士忌；8 拍偷钥匙/开铁盒全部被角色守住（内容 gate，不是 op 缺陷）。空结果分类：77 条里 52 纯说话、17 姿态、1 同拍净变化为零、7 道具/位置；没有系统性漏账。

C1/C2 的结果：作者壳可改 `places`/`names`/`items` 显示值，空地点名/物品名被 `validatePack` 拒绝；真浏览器保存→开新局后玩家状态行显示“雨夜酒馆 / 安妮”，items 保存写盘；363 测试、typecheck、build 绿。baseline-20：空结果 77%、no_rate 5%、`facts/beat` 0.55、`know_rate` 9.5%、17/20 拍 ≤3 段；时间探针 240/480 分钟。下一批候选在 [backlog.md](backlog.md) §5；切卡前先定优先级。