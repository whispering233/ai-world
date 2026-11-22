import { describe, expect, it } from 'vitest'
import { healthView } from './health.ts'
import type { Claim, Verdict } from './referee.ts'
import type { JournalEntry } from './store.ts'

function claim(id: string, kind: Claim['kind']): Claim {
  return { id, actor: 'ann', text: id, kind }
}

function verdict(claimId: string, ok: boolean, duration: number, deltas: Verdict['deltas'] = []): Verdict {
  return { claimId, actor: 'ann', ok, deltas, duration }
}

function entry(
  seq: number,
  type: JournalEntry['type'],
  claims: Claim[],
  verdicts: Verdict[],
  committed?: string[],
): JournalEntry {
  return {
    seq,
    type,
    scene: 's1',
    clock: seq * 10,
    claims,
    order: ['ann'],
    verdicts,
    observations: {},
    driveHits: [],
    ...(committed === undefined ? {} : { committed }),
  }
}

// 4 拍 + 1 次折场：含被拒 verdict、空 deltas verdict、duration ≥ 240、以及一条 ok 但 op 回滚的 verdict。
const journal: JournalEntry[] = [
  entry(
    1,
    'beat',
    [claim('c1', 'say'), claim('c2', 'act')],
    [
      verdict('c1', true, 1),
      verdict('c2', true, 3, [{ op: 'transfer', from: 'ann', to: 'doc', item: 'coin', n: 2 }]),
    ],
    ['c2'],
  ),
  entry(2, 'scene/fold', [], []),
  entry(3, 'beat', [claim('c3', 'say')], [verdict('c3', false, 0)], []),
  entry(
    4,
    'beat',
    [claim('c4', 'act'), claim('c5', 'say'), claim('c6', 'act')],
    [
      verdict('c4', true, 240, [{ op: 'fact', text: '安把账本藏在柜台下面', actor: 'ann', kind: 'other' }]),
      verdict('c5', true, 5),
      verdict('c6', true, 30, [
        { op: 'know', who: ['ann', 'doc'], fact: 'f1' },
        { op: 'move', who: 'ann', to: 'street' },
      ]),
    ],
    ['c4', 'c5', 'c6'],
  ),
  // c8 的 op 整条回滚：ok 为真但不在 committed 里。
  entry(
    5,
    'beat',
    [claim('c7', 'say'), claim('c8', 'act')],
    [
      verdict('c7', true, 31, [{ op: 'know', who: ['ann'], fact: 'f2' }]),
      verdict('c8', true, 2, [{ op: 'transfer', from: 'ann', to: 'doc', item: 'coin', n: 5 }]),
    ],
    ['c7'],
  ),
]

describe('healthView：与 play.ts 体检表逐项同口径', () => {
  it('按 journal 的 committed 字段统计已提交写操作', () => {
    const view = healthView({ journal, degraded: 3 })
    expect(view.beats).toBe(4)
    expect(view.folds).toBe(1)
    expect(view.claims).toEqual({ say: 4, act: 4 })
    expect(view.noRate).toBe(1 / 8)
    expect(view.silentBeats).toBe(1)
    expect(view.factsPerBeat).toBe(0.25)
    expect(view.knowRate).toBe(2 / 5)
    expect(view.writeOps).toEqual({ transfer: 1, fact: 1, know: 2, move: 1 })
    expect(view.durationBuckets).toEqual({ '0-3': 3, '4-30': 2, '31-239': 1, '240+': 1 })
    expect(view.degraded).toBe(3)
  })

  it('旧 journal 没有 committed 时退化为「ok 且有 deltas」', () => {
    const legacy = journal.map((item) => {
      const { committed: _drop, ...rest } = item
      return rest
    })
    const view = healthView({ journal: legacy })
    expect(view.beats).toBe(4)
    expect(view.folds).toBe(1)
    expect(view.claims).toEqual({ say: 4, act: 4 })
    expect(view.noRate).toBe(1 / 8)
    expect(view.silentBeats).toBe(1)
    expect(view.factsPerBeat).toBe(0.25)
    expect(view.knowRate).toBe(2 / 6)
    expect(view.writeOps).toEqual({ transfer: 2, fact: 1, know: 2, move: 1 })
    expect(view.durationBuckets).toEqual({ '0-3': 3, '4-30': 2, '31-239': 1, '240+': 1 })
    expect(view.degraded).toBe(0)
  })
})
