# 实验冲突检测修复（C3）

- 2026-11-26

## 1. 根因

旧 `detectConflicts` 拿**拍前** `world.ledger.holds` 去核对整拍 `transfer`/`consume` 的总量：

```
ann 拍前 0 瓶 → 同一拍先收 3 瓶 → 再付出 1 瓶
总量 1 > 拍前 0 → 报“双花候选”
```

实际 `commit` 按裁判 `order` 逐条结算，先收后付成功；20 拍基线的第 17 拍就是这一类误报（双方都被拒，账本没有双花）。旧实现也没用同一个 `order` 给 `failedOps` 试算，两个指标可能对同一拍给出不同结算顺序。

## 2. 修复

- `scripts/conflicts.ts`：`detectConflicts(world, order, verdicts)` 用 `commit(world, { order, verdicts, ... })` 的真实结算结果。
  - `doubleSpend`：只数 `applied` 中 `transfer`/`consume` 实际失败的 op；details 带 `why`。
  - `move`/`phys`：只检查 `committed === true` 的 verdict；整条回滚的 move/phys 不算。
- `scripts/experiment-multi-round.ts`：`ArmResult.order` 在 baseline（journal）、cross-talk 成功/无 claim/裁判失败四条路径都填；`failedOpsOf` 与 `detectConflicts` 共用同一个 `order`；`metrics.jsonl` 增 `conflictDetails`，报告行不变。
- `tests/conflicts.test.ts`：6 个用例覆盖旧误报、真实不足、order 决定谁失败、失败 op 不在 `deltas[0]`、move/phys 只算落账。

## 3. 验证

- 测试 **363**（30 文件）；`pnpm typecheck`、`pnpm build` 绿。
- 没有重跑 20 拍：本卡只改检测口径，20 拍数字留给下一张卡用新检测器重跑。
- `baseline-20` 的 `硬冲突 / 双花 1 / 1` 保留为**旧口径历史数字**，不能和新检测器直接对比。

## 4. 风险

- `doubleSpend` 仍把“目标实体不存在 / item id 错”的失败 transfer 计入；`conflictDetails` 带 `why`，下一轮可人工区分，暂不拆桶。
- `move`/`phys` 冲突是“裁判输了两个互斥值”的诊断，不是生产语义；只作为实验信号。
- 检测器不改裁判输出；真实双花仍由 `commit` 的事务拒绝兜底。
