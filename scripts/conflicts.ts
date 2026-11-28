/**
 * 实验指标里的冲突检测（纯函数，不属于生产路径）。
 *
 * 一律走 `commit` 的真实结算顺序，只看真正失败的 op 与真正落账的 verdict；
 * 为什么不能用拍前持有核对总量，见 docs/research/conflict-detector.md §1。
 *
 * 指标口径：
 * - doubleSpend：`applied` 中 op 为 transfer/consume 且 `!result.ok` 的条数。
 * - move：同一个 who 在已提交的 verdict 里出现多个 move 目标。
 * - phys：同一个 who|key 在已提交的 verdict 里写入多个值。
 *
 * 失败的 verdict 整条不落账，里面的 move/phys 也就不算冲突——那是被拒绝的主张，不是世界的矛盾。
 */
import { commit } from '@ai-world/core'
import type { EntId, Op, Verdict, World } from '@ai-world/core'

export interface ConflictReport {
  hard: number
  doubleSpend: number
  move: number
  phys: number
  details: string[]
}

export function detectConflicts(
  world: World,
  order: readonly EntId[],
  verdicts: readonly Verdict[],
): ConflictReport {
  const settled = commit(world, { order: [...order], verdicts: [...verdicts], observations: {}, driveHits: [] })
  const byClaim = new Map(verdicts.map((v) => [v.claimId, v]))
  const moves = new Map<EntId, Set<string>>()
  const phys = new Map<string, Set<string>>()
  const details: string[] = []
  let doubleSpend = 0

  for (const applied of settled.applied) {
    const verdict = byClaim.get(applied.claimId)
    for (const [i, result] of applied.results.entries()) {
      if (result.ok) continue
      const op = verdict?.deltas[i]
      if (op?.op !== 'transfer' && op?.op !== 'consume') continue
      doubleSpend += 1
      const from = field(op, 'from')
      const item = field(op, 'item')
      details.push(`双花：${applied.claimId} 第 ${i + 1} 条 op 失败（${from} 的 ${item}）：${result.why ?? 'unknown'}`)
    }
    if (!applied.committed || !verdict) continue
    for (const op of verdict.deltas) collect(op, moves, phys)
  }

  let move = 0
  for (const [who, to] of moves) {
    if (to.size < 2) continue
    move += 1
    details.push(`移动冲突：${who} → ${[...to].join(' / ')}`)
  }

  let physConflicts = 0
  for (const [key, values] of phys) {
    if (values.size < 2) continue
    physConflicts += 1
    details.push(`物质冲突：${key} = ${[...values].join(' / ')}`)
  }

  return { hard: doubleSpend + move + physConflicts, doubleSpend, move, phys: physConflicts, details }
}

function collect(op: Op, moves: Map<EntId, Set<string>>, phys: Map<string, Set<string>>): void {
  // SAFETY: deltas 来自模型 JSON，字段形状只有编译器相信；这里按 op 名分别取值。
  const raw = op as unknown as Record<string, unknown>
  if (raw['op'] === 'move') {
    const who = raw['who']
    const to = raw['to']
    if (typeof who !== 'string' || typeof to !== 'string') return
    const set = moves.get(who) ?? new Set<string>()
    set.add(to)
    moves.set(who, set)
  } else if (raw['op'] === 'phys') {
    const who = raw['who']
    const key = raw['key']
    if (typeof who !== 'string' || typeof key !== 'string') return
    const id = `${who}|${key}`
    const set = phys.get(id) ?? new Set<string>()
    set.add(String(raw['value']))
    phys.set(id, set)
  }
}

function field(op: Op, name: string): string {
  const value = (op as unknown as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : '?'
}