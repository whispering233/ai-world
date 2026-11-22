/**
 * 体检指标：作者投影与 CLI 试玩器共用同一份口径。
 *
 * 只读 journal，不改任何状态。
 */

import type { HealthView } from '@ai-world/shared'
import { noRate, type Verdict } from './referee.ts'
import type { JournalEntry } from './store.ts'

export interface HealthInput {
  journal: readonly JournalEntry[]
  /** 累计降级 notes 条数 */
  degraded?: number
}

/**
 * “哪些 claim 真的落账”由 journal 自己回答：`entry.committed` 是权威。
 * 旧 journal 没有这个字段，退回「ok 且有 deltas」——会把回滚的条目算进去，但不会归零。
 *
 * 不接收外部 `committed` 集合：那个集合只在内存里，进程一重启就是空的，
 * 会把有 deltas 的 journal 报成 0 次写操作（作者壳实测踩过）。
 */
export function healthView(input: HealthInput): HealthView {
  const { journal } = input
  const beats = journal.filter((e) => e.type === 'beat')
  const verdicts: Verdict[] = journal.flatMap((e) => e.verdicts)
  const committedVerdicts = journal.flatMap((e) =>
    e.committed === undefined
      ? e.verdicts.filter((v) => v.ok && v.deltas.length > 0)
      : e.verdicts.filter((v) => e.committed?.includes(v.claimId) === true),
  )
  const ops = committedVerdicts.flatMap((v) => v.deltas)
  // op 名开放：未知 op 也计数，只是不打印。
  const writeOps: Record<string, number> = {}
  for (const op of ops) writeOps[op.op] = (writeOps[op.op] ?? 0) + 1
  const claims = { say: 0, act: 0 }
  for (const c of journal.flatMap((e) => e.claims)) claims[c.kind] += 1
  const durationBuckets: HealthView['durationBuckets'] = { '0-3': 0, '4-30': 0, '31-239': 0, '240+': 0 }
  for (const v of verdicts) {
    if (!v.ok) continue
    if (v.duration <= 3) durationBuckets['0-3'] += 1
    else if (v.duration <= 30) durationBuckets['4-30'] += 1
    else if (v.duration < 240) durationBuckets['31-239'] += 1
    else durationBuckets['240+'] += 1
  }
  return {
    beats: beats.length,
    folds: journal.filter((e) => e.type === 'scene/fold').length,
    claims,
    noRate: noRate(verdicts),
    // fact 收窄后纯对话 claim 天然没有 delta；真正要看的是「整拍账本没动」。
    silentBeats: beats.filter((e) => !e.verdicts.some((v) => v.deltas.length > 0)).length,
    factsPerBeat: (writeOps.fact ?? 0) / Math.max(1, beats.length),
    knowRate: ops.length === 0 ? 0 : (writeOps.know ?? 0) / ops.length,
    writeOps,
    durationBuckets,
    degraded: input.degraded ?? 0,
  }
}
