import { describe, expect, it } from 'vitest'
import { calledActors, dueActors, nextWake, type Activity } from './clock.ts'

describe('nextWake / dueActors：顺序与边界', () => {
  it('nextWake 取最小 until，空数组为 undefined', () => {
    expect(nextWake([])).toBeUndefined()
    expect(
      nextWake([
        { ent: 'ann', until: 90 },
        { ent: 'bob', until: 30 },
        { ent: 'cid', until: 60 },
      ]),
    ).toBe(30)
  })

  it('dueActors：空数组与全未到期都为空', () => {
    expect(dueActors([], 100)).toEqual([])
    expect(
      dueActors(
        [
          { ent: 'ann', until: 120 },
          { ent: 'bob', until: 100 },
        ],
        99,
      ),
    ).toEqual([])
  })

  it('dueActors：until 恰等于 t 的人算到期', () => {
    expect(dueActors([{ ent: 'bob', until: 100 }], 100)).toEqual(['bob'])
  })

  it('dueActors 按 until 升序，同刻保持原数组顺序', () => {
    expect(
      dueActors(
        [
          { ent: 'ann', until: 90 },
          { ent: 'bob', until: 30 },
          { ent: 'cid', until: 30 },
          { ent: 'dan', until: 60 },
          { ent: 'eve', until: 999 },
        ],
        100,
      ),
    ).toEqual(['bob', 'cid', 'dan', 'ann'])
  })

  it('dueActors：同一实体只出现一次，取最早完成时刻', () => {
    expect(
      dueActors(
        [
          { ent: 'ann', until: 120 },
          { ent: 'bob', until: 10 },
          { ent: 'ann', until: 20 },
        ],
        100,
      ),
    ).toEqual(['bob', 'ann'])
  })

  it('dueActors 不改入参', () => {
    const acts: Activity[] = [
      { ent: 'ann', until: 90 },
      { ent: 'bob', until: 30 },
    ]
    const snapshot = structuredClone(acts)
    dueActors(acts, 100)
    expect(acts).toEqual(snapshot)
  })

  it('空 claim 时用 nextWake 推进时钟', () => {
    const acts = [
      { ent: 'ann', until: 300 },
      { ent: 'bob', until: 120 },
    ]
    let clock = 60
    if (acts.length > 0) clock = nextWake(acts) ?? clock
    expect(clock).toBe(120)
  })
})

describe('calledActors：玩家总在、heat、touched', () => {
  it('无人有张力时只有玩家', () => {
    expect(
      calledActors({
        present: ['ann', 'bob'],
        heat: { ann: [0.1], bob: [] },
        touched: [],
        player: 'ann',
      }),
    ).toEqual(['ann'])
  })

  it('heat 门槛：≥0.5 叫到，<0.5 不叫到；player 第一，其余按 present 顺序', () => {
    expect(
      calledActors({
        present: ['bob', 'cid', 'dan'],
        heat: { bob: [0.1], cid: [0.2, 0.7], dan: [0.49] },
        touched: [],
        player: 'bob',
      }),
    ).toEqual(['bob', 'cid'])
  })

  it('被直接作用者被叫到，即使不热', () => {
    expect(
      calledActors({
        present: ['bob', 'cid'],
        heat: {},
        touched: ['cid'],
        player: 'ann',
      }),
    ).toEqual(['ann', 'cid'])
  })

  it('不在 present 的人即使 heat 很高也不叫到', () => {
    expect(
      calledActors({
        present: ['bob'],
        heat: { cid: [1], bob: [0.2] },
        touched: ['dan'],
        player: 'ann',
      }),
    ).toEqual(['ann'])
  })

  it('玩家总在，不在 present 也不重复出现', () => {
    expect(
      calledActors({
        present: ['ann', 'bob'],
        heat: { bob: [0.5] },
        touched: [],
        player: 'ann',
      }),
    ).toEqual(['ann', 'bob'])
  })
})

describe('calledActors：heat 边界', () => {
  it('heat 正好 0.5 被叫到', () => {
    expect(
      calledActors({
        present: ['bob'],
        heat: { bob: [0.5] },
        touched: [],
        player: 'ann',
      }),
    ).toEqual(['ann', 'bob'])
  })

  it('任一 drive 达到 0.5 即算热', () => {
    expect(
      calledActors({
        present: ['bob'],
        heat: { bob: [0, 0, 0.5] },
        touched: [],
        player: 'ann',
      }),
    ).toEqual(['ann', 'bob'])
  })

  it('只差一点点也不叫到', () => {
    expect(
      calledActors({
        present: ['bob'],
        heat: { bob: [0.4999] },
        touched: [],
        player: 'ann',
      }),
    ).toEqual(['ann'])
  })
})

describe('calledActors：聚焦（对谁说）', () => {
  it('目标在场时只叫玩家 + 目标，其他热人物和 touched 都不参与', () => {
    expect(
      calledActors({
        present: ['ann', 'bob', 'cid'],
        heat: { ann: [0.1], bob: [0.9], cid: [0.9] },
        touched: ['cid'],
        player: 'ann',
        focus: 'bob',
      }),
    ).toEqual(['ann', 'bob'])
  })

  it('聚焦不看 heat：目标冷到 0 也被叫到', () => {
    expect(
      calledActors({
        present: ['bob', 'cid'],
        heat: { bob: [], cid: [1] },
        touched: [],
        player: 'ann',
        focus: 'bob',
      }),
    ).toEqual(['ann', 'bob'])
  })

  it('focus 是玩家自己时只有玩家', () => {
    expect(
      calledActors({
        present: ['ann', 'bob'],
        heat: { bob: [1] },
        touched: [],
        player: 'ann',
        focus: 'ann',
      }),
    ).toEqual(['ann'])
  })

  it('目标不在场时退回 heat / touched 逻辑', () => {
    expect(
      calledActors({
        present: ['bob', 'cid'],
        heat: { bob: [0.9], cid: [0.1] },
        touched: [],
        player: 'ann',
        focus: 'dan',
      }),
    ).toEqual(['ann', 'bob'])
  })

  it('不传 focus 时与原来一致', () => {
    const withoutFocus = calledActors({
      present: ['ann', 'bob', 'cid'],
      heat: { ann: [0.2], bob: [0.9], cid: [0.6] },
      touched: ['cid'],
      player: 'ann',
    })
    expect(withoutFocus).toEqual(['ann', 'bob', 'cid'])
  })
})
