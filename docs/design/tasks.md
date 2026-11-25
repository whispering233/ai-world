# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### D 去模板化与段落检查

#### 目标

压掉每拍重复的习惯动作/口头禅；把“段落数 > 3”变成可测量的 notes，而不是继续加提示词空转。

#### 范围

- `packages/core/src/cognition.ts`：稳定输出指令块加一条“不要每拍重复同一个习惯动作、口头禅或句式；只有它在这一拍有分量时才写”。
- `packages/core/src/beat.ts`：旁白成功（非 fallback）后，按 `split(/\n{2,}/)` 计非空段落；超过 3 段时 `notes.push('旁白段落数 N > 3')`。只报告，不改写、不重试。
- 测试：`cognition.test.ts` 断言 prompt 含新规则；`beat.test.ts` 断言 4 段记一条 notes、3 段不记、passage 原样。

#### 不做

改旁白提示词（T5 已做）、重试或后处理改写、UI 展示 notes、世界层改动。

#### 验收

- `pnpm test`、`pnpm typecheck` 全绿。
- 合并后跑 12 拍 smoke：`--beats 12 --mode baseline --tag d-detemplate --force`。
- 看 `清了清 / 按了按 / 刮了两下` 的出现率与段落数，不只看 `no_rate`。

#### 依赖 / 并行

依赖 T4/T5（已合并）。只改 `cognition.ts` 与 `beat.ts`；一个 commit。