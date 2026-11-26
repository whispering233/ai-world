# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

没有卡片。

T2–T5、D、A1/A2、M1、S1、B1、C1、C2、C3、C4、C5、C6、C7、C8、C9、C10、20 拍基线（baseline-23）、定向 focus（focus-20）、道具 smoke（props-12）、作者旧称呼提示与名字自动聚焦已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、作者 places/names/items 表单、实验双花检测、三次同条件 20 拍基线、20 拍定向 focus、道具入账与带道具 20 拍基线。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)、[../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md)、[../research/s1-suggest-smoke.md](../research/s1-suggest-smoke.md)、[../research/b1-focus-smoke.md](../research/b1-focus-smoke.md)、[../research/conflict-detector.md](../research/conflict-detector.md)、[../research/baseline-22.md](../research/baseline-22.md)、[../research/focus-20.md](../research/focus-20.md)、[../research/props-12.md](../research/props-12.md)、[../research/baseline-23.md](../research/baseline-23.md)、[../research/stale-names-browser.md](../research/stale-names-browser.md) 与 [../research/auto-focus.md](../research/auto-focus.md)；A1/A2/S1/B1/C1/C2/C9 另做过真浏览器验证。

成交/解锁探针：baseline-20 第 6 拍已完整成交一杯威士忌；8 拍偷钥匙/开铁盒全部被角色守住（内容 gate，不是 op 缺陷）。空结果分类：77 条里 52 纯说话、17 姿态、1 同拍净变化为零、7 道具/位置；C7 后外套/抹布已可入账，台面内坐标仍不建模。

C1/C2 的结果：作者壳可改 `places`/`names`/`items` 显示值，空地点名/物品名被 `validatePack` 拒绝；真浏览器保存→开新局后玩家状态行显示“雨夜酒馆 / 安妮”，items 保存写盘；C9 改名后旧称呼提示非阻断；C10 无 `to` 时按唯一人名自动聚焦。391 测试、typecheck、build 绿。三次 baseline 的段落 ≤3 为 17/12/16（中位数 16），空结果 77%/60.6%/71%，`facts/beat` 0.55/1.25/0.80，后两次 hard/double 0/0；focus-20 空结果 47.5%、段落 20/20、hard/double 0/0；baseline-23（带道具）空结果 69%、transfer 13、hard/double 0/0；时间探针 240/480 分钟。下一批候选在 [backlog.md](backlog.md) §5；切卡前先定优先级。
