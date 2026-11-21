import { describe, expect, it } from 'vitest'
import { FACT_BUDGET, describeFacts } from '../src/core/beat.ts'
import type { Fact, World } from '../src/core/world.ts'

function world(facts: Fact[]): World {
  return {
    ledger: { clock: 100, at: {}, holds: {}, phys: {}, rel: {}, knows: {} },
    facts: Object.fromEntries(facts.map((f) => [f.id, f])),
    places: {},
  }
}

const line = (text: string): string => `- ${text}`

describe('describeFacts：喂给裁判的事件流', () => {
  it('被推翻的事实不喂', () => {
    const w = world([
      { id: 'f0', text: '门是开着的', at: 10, supersededBy: 'f1' },
      { id: 'f1', text: '门关上了', at: 20 },
    ])
    expect(describeFacts(w, [], 100)).toBe(line('门关上了'))
  })

  it('提到在场者的事实优先于更晚但与在场者无关的事实', () => {
    const w = world([
      { id: 'f0', text: 'ann 把银元收进围裙', at: 10 },
      { id: 'f1', text: '街对面有匹马跑了', at: 90 },
    ])
    expect(describeFacts(w, ['ann'], 100)).toBe(`${line('ann 把银元收进围裙')}\n${line('街对面有匹马跑了')}`)
  })

  it('别名也能匹配：裁判把玩家写成“玩家”，显示名是“你”', () => {
    const w = world([
      { id: 'f0', text: '玩家把两枚银元递给安', at: 10 },
      { id: 'f1', text: '街对面有匹马跑了', at: 90 },
    ])
    const out = describeFacts(w, ['player', 'ann'], 100, { player: '你' }, { player: ['玩家'] })
    expect(out.split('\n')).toHaveLength(2)
    // 玩家事实靠别名拿到权重，而不是靠时间
    expect(out).toContain(line('玩家把两枚银元递给安'))
  })

  it('事实用显示名时，在场者仍能匹配到 +2', () => {
    const w = world([
      { id: 'f0', text: '安把银元收进围裙', at: 10 },
      { id: 'f1', text: '街对面有匹马跑了', at: 90 },
    ])
    expect(describeFacts(w, ['ann'], 100, { ann: '安' })).toBe(`${line('安把银元收进围裙')}\n${line('街对面有匹马跑了')}`)
  })

  it('显示名事实在超预算时不被挤出', () => {
    const facts: Fact[] = Array.from({ length: FACT_BUDGET }, (_, i) => ({ id: `f${i}`, text: `旧事${i}`, at: i }))
    facts.push({ id: 'hot', text: '道森医生说要关门', at: 200 })
    const out = describeFacts(world(facts), ['doc'], 100, { doc: '道森医生' }).split('\n')
    expect(out).toHaveLength(FACT_BUDGET)
    expect(out[out.length - 1]).toBe(line('道森医生说要关门'))
    expect(out).not.toContain(line('旧事0'))
  })

  it('超出预算时只留权重高的，且按时间正序排列', () => {
    const facts: Fact[] = Array.from({ length: FACT_BUDGET }, (_, i) => ({ id: `f${i}`, text: `旧事${i}`, at: i }))
    facts.push({ id: 'hot', text: 'doc 说要关门', at: 200 })
    const out = describeFacts(world(facts), ['doc'], 100).split('\n')
    expect(out).toHaveLength(FACT_BUDGET)
    expect(out[out.length - 1]).toBe(line('doc 说要关门'))
    expect(out).not.toContain(line('旧事0'))
  })
})
