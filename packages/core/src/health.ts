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
  /** 已提交的 claim 键，形如 `${journalSeq}:${claimId}`；缺省时按 verdict.ok 判定 */
  committed?: ReadonlySet<string>
  /** 累计降级 notes 条数 */
  degraded?: number
}

/**
 * 缺省 `committed` 时退化为「所有 ok 为真的 verdict」：这会把被判为 ok 但未真正
 * 提交（如降级、回滚）的条目算进写操作。有 committed 集合时以它为准。
 */
export function healthView(input: HealthInput): HealthView {
  const { journal, committed } = input
  const beats = journal.filter((e) => e.type === 'beat')
  const verdicts: Verdict[] = journal.flatMap((e) => e.verdicts)
  // claim id 只含拍前 clock；duration=0 时可能跨拍重名，所以键里带上 journal seq。
  const committedVerdicts =
    committed === undefined
      ? verdicts.filter((v) => v.ok)
      : journal.flatMap((e) => e.verdicts.filter((v) => committed.has(`${e.seq}:${v.claimId}`)))
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
