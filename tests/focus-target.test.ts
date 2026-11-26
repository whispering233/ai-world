import { describe, expect, it } from 'vitest'
import { focusTargetOf } from '../scripts/focus-target.ts'
import type { EntId, World } from '@ai-world/core'

/** 最小世界：只装选目标要读的 `ledger.at`。 */
function world(at: Record<EntId, string>): World {
  return {
    ledger: { clock: 100, at, holds: {}, phys: {}, rel: {}, knows: {} },
    facts: {},
    places: { saloon: '酒馆', backroom: '后屋' },
  }
}

const CANDIDATES = ['ann', 'doc', 'cody', 'granny']

describe('focusTargetOf：轮换只在玩家所在地点的在场人物里', () => {
  it('按候选顺序轮换，(beat - 1) % 在场人数', () => {
    const w = world({ player: 'saloon', ann: 'saloon', doc: 'saloon', cody: 'saloon', granny: 'saloon' })
    const picked = [1, 2, 3, 4, 5].map((beat) => focusTargetOf({ world: w, beat, candidates: CANDIDATES, player: 'player', place: 'saloon' }))
    expect(picked).toEqual(['ann', 'doc', 'cody', 'granny', 'ann'])
  })

  it('不在场的人被跳过，也不占轮换位', () => {
    const w = world({ player: 'saloon', ann: 'saloon', doc: 'backroom', cody: 'saloon', granny: 'saloon' })
    const picked = [1, 2, 3, 4].map((beat) => focusTargetOf({ world: w, beat, candidates: CANDIDATES, player: 'player', place: 'saloon' }))
    expect(picked).toEqual(['ann', 'cody', 'granny', 'ann'])
  })

  it('候选表里混进玩家也不用：玩家不是聚焦目标', () => {
    const w = world({ player: 'saloon', ann: 'saloon', counter: 'saloon' })
    expect(focusTargetOf({ world: w, beat: 1, candidates: ['player', 'ann'], player: 'player', place: 'saloon' })).toBe('ann')
    expect(focusTargetOf({ world: w, beat: 1, candidates: ['player'], player: 'player', place: 'saloon' })).toBeUndefined()
  })

  it('一个候选都不在场时返回 undefined（调用方退回所有人）', () => {
    const w = world({ player: 'backroom', ann: 'saloon', doc: 'saloon', cody: 'saloon', granny: 'saloon' })
    expect(focusTargetOf({ world: w, beat: 3, candidates: CANDIDATES, player: 'player', place: 'backroom' })).toBeUndefined()
  })

  it('本场地点没有候选时返回 undefined', () => {
    const w = world({ ann: 'saloon' })
    expect(focusTargetOf({ world: w, beat: 1, candidates: CANDIDATES, player: 'player', place: 'backroom' })).toBeUndefined()
  })
})