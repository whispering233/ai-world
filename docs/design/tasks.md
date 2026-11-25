# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### S1 动作提示（suggest）

**目标**：拍末生成 3 条短动作提示，和旁白并行；只读玩家可见投影 + 本拍感知结果；失败不影响整拍。

**范围**：
- `config/models.json` 加 `suggest`；`config.ts` 的 `suggest` 缺省跟随 `cognition`；核心/共享/服务端的 `ModelRole` 与 `ROLES`、usage/models、启动打印同步。
- 新增 `packages/core/src/suggest.ts`：system + prompt + 解析；输入只含现场、地点、在场者、持有、已知事实、玩家刚说的话、本拍感知摘要；输出 `{"hints":[...]}`，最多 3 条，每条 ≤40 字，去掉 id/引擎词/重复/空串；失败返回空数组并留 note。
- `beat.ts`：`BeatDeps.suggester?`；在旁白开始时并行调用，`Promise` 失败不影响旁白/账本；`BeatResult.hints?`；`PassageEntry.hints` 落 passage.jsonl。
- 投影：`PassageEntry.hints` / `BeatView.hints` / `PassageView.hints`；`view.beatViews` 透传；旧日志无 hints 照常。
- `Composer`：固定选项区在状态行上方，用 x 的 `Prompts`（`Suggestion` 2.x 是下拉，不是固定列表）；点选只填 `draft`，不发送；等待中/无提示不渲染；只取最近一拍。
- 测试：suggest 解析/截断；beat 中 hints 落 passage 且失败不丢拍；server 的 passage hints 与 usage/prompts 有 suggest；store/view 透传；Composer 点击只填不发；config 缺省跟随 cognition。

**不做**：`playerTo`/目标 chips（#48）、自动提交、流式、新的世界状态；不改 `Op`/账本。

**验收**：`pnpm test`、`pnpm typecheck`、`pnpm build`；真浏览器看最近一拍选项、点选只填不发；12 拍 smoke `--tag s1-suggest`，记录 hints 命中率、拍耗时、no_rate、空结果。

**依赖**：A2 之后；独立一 commit。

T2–T5、D、A1/A2、M1 已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md) 与 [../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md)；A1/A2 另做过真浏览器验证。

M1 的结果：5/5 `transfer` 涉及柜台/桌子，空结果 66.7%，硬冲突 0；威士忌成交与铁盒解锁仍只被拒绝路径覆盖。下一批候选在 [backlog.md](backlog.md) §5 与 `00-master-design.md` 决策 #47/#48；切卡前先定优先级。