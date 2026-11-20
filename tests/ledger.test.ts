import { describe, expect, it } from 'vitest'
import { apply } from '../src/core/ledger.ts'
import { REL_MAX, REL_MIN, type World } from '../src/core/world.ts'

function world(): World {
  return {
    ledger: {
      clock: 0,
      at: { ann: 'saloon', bob: 'saloon' },
      holds: { ann: { key: 1 }, bob: {} },
      phys: {},
      rel: {},
      knows: {},
    },
    facts: {},
    places: { saloon: '酒馆', street: '街道' },
  }
}

describe('apply：六个字段操作', () => {
  it('move 改位置', () => {
    const { world: w, results } = apply(world(), [{ op: 'move', who: 'ann', to: 'street' }])
    expect(results[0]?.ok).toBe(true)
    expect(w.ledger.at.ann).toBe('street')
  })

  it('give 转移持有物，并从来源扣除', () => {
    const { world: w } = apply(world(), [{ op: 'give', from: 'ann', to: 'bob', item: 'key', n: 1 }])
    expect(w.ledger.holds.bob?.key).toBe(1)
    expect(w.ledger.holds.ann?.key).toBeUndefined()
  })

  it('take 消耗持有物', () => {
    const { world: w } = apply(world(), [{ op: 'take', from: 'ann', item: 'key', n: 1 }])
    expect(w.ledger.holds.ann?.key).toBeUndefined()
  })

  it('phys 写入开放键', () => {
    const { world: w } = apply(world(), [{ op: 'phys', who: 'ann', key: 'wounded', value: true }])
    expect(w.ledger.phys.ann?.wounded).toBe(true)
  })

  it('rel 单向累加', () => {
    const { world: w } = apply(world(), [{ op: 'rel', from: 'ann', to: 'bob', delta: 2 }])
    expect(w.ledger.rel.ann?.bob).toBe(2)
    expect(w.ledger.rel.bob).toBeUndefined()
  })

  it('fact 新增一条事实，不授予任何实体', () => {
    const { world: w } = apply(world(), [{ op: 'fact', text: 'ann 那晚不在场' }])
    expect(w.facts.f0?.text).toBe('ann 那晚不在场')
    expect(w.ledger.knows.bob).toBeUndefined()
  })

  it('know 可把已存在的事实告诉别人（旧的 learn 做不到）', () => {
    const first = apply(world(), [{ op: 'fact', text: '酒馆起火了' }]).world
    const { world: w, results } = apply(first, [{ op: 'know', who: ['bob'], fact: 'f0' }])
    expect(results[0]?.ok).toBe(true)
    expect(w.ledger.knows.bob).toEqual(['f0'])
    expect(Object.keys(w.facts)).toHaveLength(1)
  })
})

describe('apply：前置条件与拒绝', () => {
  it('给出未持有的物品被拒，且不写入任何状态', () => {
    const { world: w, results } = apply(world(), [{ op: 'give', from: 'bob', to: 'ann', item: 'key', n: 1 }])
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.why).toContain('没有这么多')
    expect(w.ledger.holds.ann?.key).toBe(1)
    expect(w.ledger.holds.bob).toBeDefined()
  })

  it('数量非正整数被拒', () => {
    const { results } = apply(world(), [{ op: 'take', from: 'ann', item: 'key', n: 0 }])
    expect(results[0]?.ok).toBe(false)
  })

  it('不存在的实体被拒', () => {
    const { world: w, results } = apply(world(), [{ op: 'move', who: 'ghost', to: 'street' }])
    expect(results[0]?.ok).toBe(false)
    expect(w.ledger.at.ghost).toBeUndefined()
  })

  it('一条失败不影响同批其它 op', () => {
    const { world: w, results } = apply(world(), [
      { op: 'move', who: 'ghost', to: 'street' },
      { op: 'move', who: 'ann', to: 'street' },
    ])
    expect(results.map((r) => r.ok)).toEqual([false, true])
    expect(w.ledger.at.ann).toBe('street')
  })

  it('关系越界饱和到 ±3（不是拒绝）', () => {
    const up = apply(world(), [{ op: 'rel', from: 'ann', to: 'bob', delta: 10 }])
    expect(up.world.ledger.rel.ann?.bob).toBe(REL_MAX)
    const down = apply(world(), [{ op: 'rel', from: 'ann', to: 'bob', delta: -10 }])
    expect(down.world.ledger.rel.ann?.bob).toBe(REL_MIN)
  })

  it('空事实文本被拒', () => {
    const { world: w, results } = apply(world(), [{ op: 'fact', text: '   ' }])
    expect(results[0]?.ok).toBe(false)
    expect(Object.keys(w.facts)).toHaveLength(0)
  })

  it('know 用一段文本时会当场建事实并授予（裁判看不到 fact id）', () => {
    const { world: w, results } = apply(world(), [{ op: 'know', who: ['ann'], fact: '药包在里屋' }])
    expect(results[0]?.ok).toBe(true)
    expect(w.ledger.knows.ann).toEqual(['f0'])
    expect(w.facts.f0?.text).toBe('药包在里屋')
  })
})

describe('apply：纯函数与可回放', () => {
  it('不改入参', () => {
    const original = world()
    const snapshot = structuredClone(original)
    apply(original, [{ op: 'move', who: 'ann', to: 'street' }])
    expect(original).toEqual(snapshot)
  })

  it('同一批 op 重放两次得到相同 world', () => {
    const ops = [{ op: 'fact' as const, text: '门是铸铁焊死的' }]
    const a = apply(world(), ops).world
    const b = apply(world(), ops).world
    expect(a).toEqual(b)
  })
})

describe('apply：畸形 op 不得抛异常', () => {
  it('know 的 who 写成单个字符串时被接受', () => {
    const base = apply(world(), [{ op: 'fact', text: '酒馆起火了' }]).world
    const { world: w, results } = apply(base, [{ op: 'know', who: 'bob' as unknown as string[], fact: 'f0' }])
    expect(results[0]?.ok).toBe(true)
    expect(w.ledger.knows.bob).toEqual(['f0'])
  })

  it('know 的 who 是数字时被拒且不抛', () => {
    const base = apply(world(), [{ op: 'fact', text: '酒馆起火了' }]).world
    const { results } = apply(base, [{ op: 'know', who: 42 as unknown as string[], fact: 'f0' }])
    expect(results[0]?.ok).toBe(false)
  })

  it('缺 to 的 move 被拒且不抛', () => {
    const { world: w, results } = apply(world(), [{ op: 'move', who: 'ann' } as unknown as { op: 'move'; who: string; to: string }])
    expect(results[0]?.ok).toBe(false)
    expect(w.ledger.at.ann).toBe('saloon')
  })

  it('n 是字符串的 give 被拒', () => {
    const { results } = apply(world(), [{ op: 'give', from: 'ann', to: 'bob', item: 'key', n: '1' } as unknown as { op: 'give'; from: string; to: string; item: string; n: number }])
    expect(results[0]?.ok).toBe(false)
  })
})
