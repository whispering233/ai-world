# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

没有卡片。

T2–T5、D、A1/A2、M1、S1、B1、C1、C2、C3、C4、20 拍基线（baseline-21）已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、作者 places/names/items 表单、实验双花检测、新检测器 20 拍基线。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)、[../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md)、[../research/s1-suggest-smoke.md](../research/s1-suggest-smoke.md)、[../research/b1-focus-smoke.md](../research/b1-focus-smoke.md)、[../research/conflict-detector.md](../research/conflict-detector.md) 与 [../research/baseline-21.md](../research/baseline-21.md)；A1/A2/S1/B1/C1/C2 另做过真浏览器验证。

成交/解锁探针：baseline-20 第 6 拍已完整成交一杯威士忌；8 拍偷钥匙/开铁盒全部被角色守住（内容 gate，不是 op 缺陷）。空结果分类：77 条里 52 纯说话、17 姿态、1 同拍净变化为零、7 道具/位置；没有系统性漏账。

C1/C2 的结果：作者壳可改 `places`/`names`/`items` 显示值，空地点名/物品名被 `validatePack` 拒绝；真浏览器保存→开新局后玩家状态行显示“雨夜酒馆 / 安妮”，items 保存写盘；363 测试、typecheck、build 绿。baseline-21：空结果 60.6%、no_rate 7.1%、`facts/beat` 1.25、`know_rate` 0%、hard/double 0/0、12/20 拍 ≤3 段；时间探针 240/480 分钟。下一批候选在 [backlog.md](backlog.md) §5；切卡前先定优先级。
