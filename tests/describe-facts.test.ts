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
    // 13 条事实、全部在 10 分钟内、玩家那条更旧：时间权重只会把它挤出名额，只有别名能救它。
    const noise: Fact[] = Array.from({ length: FACT_BUDGET }, (_, i) => ({ id: `n${i}`, text: `街边杂事${i}`, at: 96 }))
    const facts = [...noise, { id: 'mine', text: '玩家把门闩推了回去', at: 95 }]
    const named = describeFacts(world(facts), ['player'], 100, { player: '你' }, { player: ['玩家'] })
    const unnamed = describeFacts(world(facts), ['player'], 100, { player: '你' })
    expect(named).toContain(line('玩家把门闩推了回去'))
    expect(unnamed).not.toContain(line('玩家把门闩推了回去'))
  })

  it('事实用显示名时，在场者仍能匹配到 +2', () => {
    const w = world([
      { id: 'f0', text: '安把银元收进围裙', at: 10 },
      { id: 'f1', text: '街对面有匹马跑了', at: 90 },
    ])
    expect(describeFacts(w, ['ann'], 100, { ann: '安' })).toBe(`${line('安把银元收进围裙')}\n${line('街对面有匹马跑了')}`)
  })

  it('显示名事实在超预算时不被挤出', () => {
    // 全部事实都在 10 分钟内：时间权重打平，只有“提到在场者”的 +2 能分出胜负。
    const facts: Fact[] = Array.from({ length: FACT_BUDGET }, (_, i) => ({ id: `f${i}`, text: `旧事${i}`, at: 96 }))
    facts.push({ id: 'hot', text: '道森医生说要关门', at: 95 })
    const named = describeFacts(world(facts), ['doc'], 100, { doc: '道森医生' }).split('\n')
    const unnamed = describeFacts(world(facts), ['doc'], 100).split('\n')
    expect(named).toHaveLength(FACT_BUDGET)
    expect(named).toContain(line('道森医生说要关门'))
    // 只匹配 id 时 hot 更旧，与旧事打平后退回时间倒序，被名额挤掉
    expect(unnamed).not.toContain(line('道森医生说要关门'))
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
