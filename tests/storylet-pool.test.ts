import { describe, expect, it } from 'vitest'
import { pickSkeleton } from '../scripts/storylet-pool.ts'
import type { Fact, World } from '../src/core/world.ts'

/** 只装池子要读的字段：门关着、灯亮着、门外无风也无 history。 */
function world(patch: { ambient?: World['ambient']; facts?: Record<string, Fact>; phys?: Record<string, Record<string, number | boolean>> } = {}): World {
  return {
    ledger: {
      clock: 100,
      at: { door: 'saloon', lamp: 'saloon' },
      holds: {},
      phys: patch.phys ?? { door: { closed: true, broken: false }, lamp: { lit: true } },
      rel: {},
      knows: {},
    },
    facts: patch.facts ?? {},
    places: { saloon: '酒馆' },
    ...(patch.ambient ? { ambient: patch.ambient } : {}),
  }
}

const noDraw = new Map<string, number>()

describe('pickSkeleton：两级前因不许互借', () => {
  it('ambient 缺键时不抽，而不是默认通过', () => {
    expect(pickSkeleton(world(), noDraw)).toBeUndefined()
    expect(pickSkeleton(world({ ambient: { night: true } }), noDraw)).toBeUndefined()
  })

  it('ambient 命中就抽环境骨架，不需要任何 fact', () => {
    const pick = pickSkeleton(world({ ambient: { weather: 'storm', night: true } }), noDraw)
    expect(pick?.skeleton.id).toBe('door-blown')
    expect(pick?.causes).toEqual([])
  })

  it('ambient 命中不能让 consequence 骨架通过：facts 为空就不抽', () => {
    const w = world({
      ambient: { weather: 'storm' },
      phys: { door: { closed: false, broken: false }, lamp: { lit: false } },
    })
    expect(pickSkeleton(w, noDraw)).toBeUndefined()
  })

  it('有前因 fact 时抽后果骨架，ambient 不参与', () => {
    const w = world({
      phys: { door: { closed: false, broken: false }, lamp: { lit: false } },
      facts: { f0: { id: 'f0', text: '有人撞了一下门', at: 10 } },
    })
    const pick = pickSkeleton(w, noDraw)
    expect(pick?.skeleton.id).toBe('door-splinter')
    expect(pick?.causes.map((f) => f.id)).toEqual(['f0'])
  })

  it('冷却期内不重抽同一张；门未开时下游的灯也抽不到', () => {
    const closed = world({ ambient: { weather: 'storm' } })
    expect(pickSkeleton(closed, new Map([['door-blown', 99]]))).toBeUndefined()

    const open = world({
      ambient: { weather: 'storm' },
      phys: { door: { closed: false, broken: false }, lamp: { lit: true } },
    })
    expect(pickSkeleton(open, new Map([['door-blown', 99]]))?.skeleton.id).toBe('lamp-dies')
    expect(pickSkeleton(open, new Map([['door-blown', 99], ['lamp-dies', 99]]))).toBeUndefined()
  })
})

describe('pickSkeleton：避让', () => {
  it('本拍有人提到目标对象就让路，不顶掉玩家动作', () => {
    const w = world({ ambient: { weather: 'storm' } })
    expect(pickSkeleton(w, noDraw, [{ text: '我推门进去' }])).toBeUndefined()
    expect(pickSkeleton(w, noDraw, [{ text: '我在靠墙的桌边坐下' }])?.skeleton.id).toBe('door-blown')
  })
})
