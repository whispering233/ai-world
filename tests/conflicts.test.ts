import { describe, expect, it } from 'vitest'
import { detectConflicts } from '../scripts/conflicts.ts'
import type { EntId, Op, Verdict, World } from '@ai-world/core'

/** 最小世界：只装结算要读的字段。陈设（counter / door）也靠 ledger.at 的键登记存在。 */
function world(holds: Record<string, Record<string, number>> = {}): World {
  return {
    ledger: {
      clock: 100,
      at: { ann: 'saloon', doc: 'saloon', player: 'saloon', cody: 'saloon', granny: 'saloon', counter: 'saloon', door: 'saloon' },
      holds,
      phys: {},
      rel: {},
      knows: {},
    },
    facts: {},
    places: { saloon: '酒馆', backroom: '后屋', alley: '后巷' },
  }
}

function verdict(claimId: string, actor: EntId, deltas: Op[]): Verdict {
  return { claimId, actor, ok: true, deltas, duration: 1 }
}

describe('detectConflicts：同一拍先收后付不是双花', () => {
  it('拍前持有 0，先转入 3 再转出 1，只按结算结果看', () => {
    const w = world({ counter: { whiskey: 3 } })
    const verdicts: Verdict[] = [
      verdict('c1', 'ann', [{ op: 'transfer', from: 'counter', to: 'ann', item: 'whiskey', n: 3 }]),
      verdict('c2', 'ann', [{ op: 'transfer', from: 'ann', to: 'player', item: 'whiskey', n: 1 }]),
    ]

    const report = detectConflicts(w, ['ann'], verdicts)

    expect(report.doubleSpend).toBe(0)
    expect(report.hard).toBe(0)
    expect(report.details).toEqual([])
    // 探针只是在世界副本上试算，不能改动实验正在用的账本
    expect(w.ledger.holds['ann']).toBeUndefined()
  })
})

describe('detectConflicts：真的不够才算双花', () => {
  it('1 份 whiskey 卖两次，只报第二笔失败', () => {
    const w = world({ ann: { whiskey: 1 } })
    const verdicts: Verdict[] = [
      verdict('c1', 'player', [{ op: 'transfer', from: 'ann', to: 'player', item: 'whiskey', n: 1 }]),
      verdict('c2', 'doc', [{ op: 'transfer', from: 'ann', to: 'doc', item: 'whiskey', n: 1 }]),
    ]

    const report = detectConflicts(w, ['player', 'doc'], verdicts)

    expect(report.doubleSpend).toBe(1)
    expect(report.hard).toBe(1)
    expect(report.details).toHaveLength(1)
    expect(report.details[0]).toContain('ann')
    expect(report.details[0]).toContain('whiskey')
  })

  it('先由 ann 收下，再由 ann 付出：顺序决定谁失败', () => {
    const w = world({ counter: { whiskey: 1 } })
    const verdicts: Verdict[] = [
      verdict('c1', 'counter', [{ op: 'transfer', from: 'counter', to: 'ann', item: 'whiskey', n: 1 }]),
      verdict('c2', 'ann', [{ op: 'transfer', from: 'ann', to: 'player', item: 'whiskey', n: 1 }]),
    ]

    // counter 先落地：ann 有货，付出成功
    expect(detectConflicts(w, ['counter', 'ann'], verdicts).doubleSpend).toBe(0)
    // ann 先落地：她还没有货，付出失败，且失败归到 ann 那条 claim
    const early = detectConflicts(w, ['ann', 'counter'], verdicts)
    expect(early.doubleSpend).toBe(1)
    expect(early.details[0]).toContain('c2')
    expect(early.details[0]).toContain('ann')
  })

  it('失败的 transfer 不在 deltas[0] 时也按索引对上', () => {
    const w = world({ ann: { whiskey: 0 } })
    const verdicts: Verdict[] = [
      verdict('c1', 'ann', [
        { op: 'fact', text: '杯子已经空了' },
        { op: 'transfer', from: 'ann', to: 'doc', item: 'whiskey', n: 1 },
      ]),
    ]

    const report = detectConflicts(w, ['ann'], verdicts)

    expect(report.doubleSpend).toBe(1)
    expect(report.details[0]).toContain('whiskey')
  })
})

describe('detectConflicts：move / phys 只算落账的 verdict', () => {
  it('同一个人两个 move 目标算 1 条；回滚 verdict 里的 move 不算', () => {
    const w = world()
    const verdicts: Verdict[] = [
      verdict('c1', 'cody', [
        { op: 'move', who: 'cody', to: 'backroom' },
        { op: 'move', who: 'cody', to: 'alley' },
      ]),
      // 地点不存在 → 整条 verdict 不落账，里面的 move 也就不参与冲突
      verdict('c2', 'granny', [
        { op: 'move', who: 'granny', to: 'nowhere' },
        { op: 'move', who: 'granny', to: 'alley' },
      ]),
    ]

    const report = detectConflicts(w, ['cody', 'granny'], verdicts)

    expect(report.move).toBe(1)
    expect(report.doubleSpend).toBe(0)
    expect(report.details.filter((d) => d.includes('granny'))).toEqual([])
  })

  it('同一个 who|key 写入两个值算 1 条；回滚 verdict 里的 phys 不算', () => {
    const w = world()
    const verdicts: Verdict[] = [
      verdict('c1', 'cody', [{ op: 'phys', who: 'door', key: 'closed', value: true }]),
      verdict('c2', 'granny', [{ op: 'phys', who: 'door', key: 'closed', value: false }]),
      // 实体不存在 → op 失败，整条 verdict 不落账
      verdict('c3', 'granny', [
        { op: 'phys', who: 'nobody', key: 'closed', value: false },
        { op: 'phys', who: 'door', key: 'closed', value: 2 },
      ]),
    ]

    const report = detectConflicts(w, ['cody', 'granny'], verdicts)

    expect(report.phys).toBe(1)
    expect(report.doubleSpend).toBe(0)
    expect(report.details).toHaveLength(1)
    expect(report.details[0]).toBe('物质冲突：door|closed = true / false')
  })
})