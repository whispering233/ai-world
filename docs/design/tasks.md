# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C1 `places` / `names` 作者表单

**目标**：作者壳可直接编辑地点与实体显示名，不再手改 JSON；只改显示值，不改 id，保存仍走整份内容包校验。

**范围**：
- `ContentEditor`：`EditablePack.world` 收窄到含 `places` 的最小形状；新增“地点与显示名”区块，按现有 key 渲染可编辑 Input（`places` 与 `names`），不提供增删 id。
- 保存：仍 `JSON.stringify(pack)`，未知字段（`ambient`/`aliases`/world 其他键）必须原样带回；空显示名由现有 `validatePack` 拒绝。
- 只读 JSON 块保留，作为完整内容预览；`places`/`names` 不再只能通过它看。
- 文档：`docs/design/60-server.md` 的“作者壳暂无 places/names 表单”改为已支持；`docs/ui/DESIGN.md` 内容面板列表同步；`docs/api/30-api-author.md` §4 补一句表单字段。
- 测试：`content-editor.test.ts`（mock API）改 places/names 后保存 body 正确、未知字段保留；浏览器实测改显示名→保存→开新局→玩家视图显示新名字。

**不做**：新增/删除 place/entity id（那要同时改 ledger/at/holds）；编辑 `items`/`world` 原始结构；热生效。

**验收**：`pnpm test`、`pnpm typecheck`、`pnpm build`；真浏览器保存后开新局，玩家“在此刻/状态行/正文”看到新显示名，不出现 id；测试后恢复内容与数据。

**依赖**：无；独立一 commit。

T2–T5、D、A1/A2、M1、S1、B1、20 拍基线（baseline-20）已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示、硬聚焦、20 拍回归基线。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)、[../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md)、[../research/s1-suggest-smoke.md](../research/s1-suggest-smoke.md) 与 [../research/b1-focus-smoke.md](../research/b1-focus-smoke.md)；A1/A2/S1/B1 另做过真浏览器验证。

成交/解锁探针：baseline-20 第 6 拍已完整成交一杯威士忌；8 拍偷钥匙/开铁盒全部被角色守住（内容 gate，不是 op 缺陷）。空结果分类：77 条里 52 纯说话、17 姿态、1 同拍净变化为零、7 道具/位置；没有系统性漏账。

B1 的结果：默认 12 拍无回归；浏览器选中“安”后本拍只有玩家 + 安两条 claim，`playerTo` 显示为“安”，351 测试通过。baseline-20：空结果 77%、no_rate 5%、`facts/beat` 0.55、`know_rate` 9.5%、17/20 拍 ≤3 段；时间探针 240/480 分钟。下一批候选在 [backlog.md](backlog.md) §5；切卡前先定优先级。