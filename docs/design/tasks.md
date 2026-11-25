# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。
> T2/T3 已合并并做过 10 拍 smoke，证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md)。

## 当前批次

### T4 claim 语义与现场优先（决策 #41/#42）

#### 目标

玩家输入是未裁决主张；人物不把“玩家提出”当成“已发生”；没开口不生成 claim；内心话留在 `thought`；人物行动前先看现场。

#### 范围

- `packages/core/src/beat.ts`
  - 玩家行改为 `玩家这一拍提出（尚未裁决）：…`；`playerClaim` 仍原文进 claim，不改写。
  - `outward.trim() === ''` 时不生成 NPC claim；不要用空串占 claim id。
- `packages/core/src/cognition.ts`
  - 输出指令补两句：玩家的话/动作只是主张，结果以现场与账本为准；行动前先看现场，现场与记忆冲突时以现场为准，不要碰已经不在原处的东西。
  - `inner` 非空时返回一条 `experience`：`kind:'thought'`、`w:1`、`text: inner`；`outward` 仍返回 `seen`。空 `inner` 不返回 `thought`。
- `packages/core/src/referee.ts`
  - `REFEREE_SYSTEM` 补一条：同一拍对同一 `phys` 键的相反值必须挑一个，另一条 `ok:false`；不允许两条都成立。
- 测试：`beat.test.ts`、`cognition.test.ts`、`referee.test.ts`。

#### 不做

旁白编排（T5）、进度帧/UI（P1）、把 `inner` 交给旁白或裁判。

#### 验收

- `pnpm test`、`pnpm typecheck` 全绿。
- 新增测试至少覆盖：
  - 玩家行含“未裁决”，不再含“刚才说/做”；
  - 空 `outward` 不生成 claim，也不让这一拍凭空多一条裁决；
  - `inner` 写进 `thought`，且 `w=1`；空 `inner` 不写；
  - 旧测试里“没有 thought”的断言按新口径调整；
  - 裁判 prompt 含“同一 `phys` 键”规则。
- 不跑真实模型；真实回归在 T5 之后一次做。

#### 依赖 / 并行

依赖 T2/T3（已合并）。与 T5 **串行**（都改 `beat.ts`）。一个 commit。

---

### T5 旁白编排（决策 #44）

#### 目标

一拍最多 1–2 人有独立段落；其余已提交动作并进背景；段落按 `referee.order`；漏写只报告不改写。

#### 范围

- `packages/core/src/beat.ts`
  - `narratorEvents` 按 `out.order` 排序，未列出的 claim 保持原顺序追加。
  - `NarrationEvent` 加可选 `committed: boolean`；`runBeat` 用已提交名单填。
  - 旁白成功后做确定性检查：每个 `committed` claim 的显示名在 passage 里完全没出现时，记 `notes: '旁白漏写：<显示名>'`；不改文本。
- `packages/core/src/narrate.ts`
  - `NARRATOR_SYSTEM` 加三条：最多两段独立人物段落；每个已提交动作至少以一句背景出现；不要逐 claim 复述，按给定顺序写。
  - `NarrationEvent` 的 `committed` 在 prompt 里标成 `[已落账]` / `[未成立]`，让模型知道哪些不能消失。
- 测试：`beat.test.ts`、`narrate.test.ts`。

#### 不做

每人物流/裁决层流；说话人字段；气泡渲染。

#### 验收

- `pnpm test`、`pnpm typecheck` 全绿。
- 新增测试至少覆盖：event 按 `order` 排序；漏写 committed 时 `notes` 有一条且 passage 原样；prompt 含三条新规则。
- 真实回归：与 T4 合并后跑 12 拍，见下。

#### 依赖 / 并行

依赖 T4。一个 commit。

---

## 当前批次合并后的验证

T4 与 T5 合并到 `main` 后跑一次 **12 拍** smoke（12 拍才会碰到折场阈值；仍不是回归证明）：

```bash
node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types \
  scripts/experiment-multi-round.ts --beats 12 --mode baseline --tag t4t5-baseline --force
```

- 跑前：停掉服务端；清掉 `PI_MODEL`；确认模型串打印正确。
- 看：`no` 率（玩家/NPC 分桶）、passage 段落数（目标 ≤3）、重复小动作、折场数、每拍 token/耗时。
- **不要直接采信报告的“硬冲突/双花”**：`detectConflicts` 用拍前持有核对整拍 transfer，会把同一裁决里的转入误报成双花；证据见 [../research/t2t3-smoke.md](../research/t2t3-smoke.md) §4。物质冲突要回 journal 逐条看。
- 结果决定 P1（`settled` 帧、状态行、suggest、focus、wait）的切卡顺序。