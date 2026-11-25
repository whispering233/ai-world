# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### B1 硬聚焦（对谁说）

**目标**：玩家可选“对谁说”；选中时本拍只叫玩家 + 目标，默认“所有人”保持现状。目标用显示名从请求传入，服务端唯一匹配到实体；客户端不持有 id。

**范围**：
- 核心：`Claim.to?: EntId`（只玩家 claim 用）；`BeatInput.playerTo?: EntId`；`calledActors({focus})` 在目标在场时返回 `[player, target]`，不看 heat；`runBeat` 把目标写进玩家 claim，目标人物的切片加“对你说”，其余人不产生 claim。
- 服务端：`POST /api/beat` 读取可选 `to`（显示名）；`Session.beat(..., to?)` 在当前地点的人里唯一匹配，匹配不到/重名则忽略并记 `notes`；`journal.claims[].to` 落实体 id；`view.beatViews` 把它映射成 `BeatView.playerTo` 显示名。
- Web：`Composer` 状态行右侧加“所有人”+ 在场者 chips；选择只改状态，不发送；`postBeat` body 带 `to`；玩家行有目标时显示“你（对安）”；目标不在场自动回到“所有人”；等待中的那一拍也显示目标。
- 测试：`calledActors` 聚焦排除其他热人物；`runBeat` 只叫玩家+目标且 claim.to 正确；`view` 出显示名不出 id；session 解析/重名/不在场；route 接收 `to`；Composer chips 只改目标不发送；`PlayerLine` 目标前缀；默认路径不变。

**不做**：动作词表、per-character agent、自动推断“被直接作用者”（仍走 #48 的显式目标）；不改账本 op。

**验收**：`pnpm test`、`pnpm typecheck`、`pnpm build`；真浏览器选“安”发一拍，正文前显示“你（对安）”，journal 里只有玩家 + 安两条 claim，其他人未被叫到；默认“所有人”仍按原调度。

**依赖**：S1 之后；独立一 commit。

T2–T5、D、A1/A2、M1、S1 已完成并合并：世界切片、开场、claim 语义、旁白编排、去模板化、`settled` 进度、状态行与“等一会儿”、陈设承载物品、动作提示。证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)、[../research/t4t5-smoke.md](../research/t4t5-smoke.md)、[../research/d-detemplate-smoke.md](../research/d-detemplate-smoke.md)、[../research/m1-fixtures-smoke.md](../research/m1-fixtures-smoke.md) 与 [../research/s1-suggest-smoke.md](../research/s1-suggest-smoke.md)；A1/A2/S1 另做过真浏览器验证。

S1 的结果：12/12 拍有 3 条提示，拍均 61.1s，no_rate 6.7%，空结果 71.7%；点选只填不发，已通过浏览器证据。下一批候选在 [backlog.md](backlog.md) §5 与 `00-master-design.md` 决策 #48；切卡前先定优先级。