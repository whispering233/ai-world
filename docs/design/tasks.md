# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

没有可开工的卡片。

---

### 卡 10 — 【等 P2 决议，不得先动】

以下三项与 P2 的 `nextWake`/`dueActors`/`busyUntil` 处置是同一件事——文档说"空主张时
`clock = min(busyUntil)`"、`advanceTo(t)` 存在、heat 极值触发成长，代码全没做。
P2 若选"接线"，这三处文档现状就是对的、一个字都不该改；P2 若选"连代码一起撤"，
文档就该整段删。现在改是拿猜测当地基。

- `docs/db/schema.md` §5 `busyUntil` 的「≥ clock」约束（实际恒为 0、从不更新）
- `docs/design/40-time-and-loop.md:52` 伪代码 `if claims 为空: clock = min(busyUntil)`
- `docs/design/30-cognition.md:52`「触发需 `max(heat) ≥ 0.8` 或 `≤ 0.1`」
  （同节 `:62` 已自认未实现）

**P2 待做清单**（死代码 / 无消费者的抽象）：

- `clock.ts` 的 `nextWake` / `dueActors` / `Activity`：生产调用点 0，唯一引用是
  `clock.test.ts`；而 `clock.test.ts` 那条"空 claim 时推进时钟"用例里
  `if (acts.length > 0)` 恒真，测的是用例自己的 `if`
- `view.ts` 的 `AuthorViewInput.passages`（`authorView` 不读）
- `server/session.ts` 的 `contentPath()`（只有测试用）
- `beat.ts:573` 的 `export { fmt }`（`clock.ts` 已导出同一 binding）+ `beat.ts:7` 的死 import
- `core/src/smoke.test.ts`（全文 `expect(1 + 1).toBe(2)`）
- `scene.ts` 的 `FoldMaterial.perEnt`（有 `backlog.md` §5 台账，删前先把台账一起处理）
- storylet 四脚本（`experiment-storylet` / `probe-storylet` / `probe-storylet-fill` /
  `storylet-pool`）：功能冻结、无 npm 入口，删还是补入口属产品决策

**不做（规则保护）**：`BeatInput.claimSource` 是 AGENTS.md 指定的唯一世界事件注入点，
与 `BeatDeps` 四件套同性质，即使生产零调用也不删。
