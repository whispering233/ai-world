import { describe, expect, it } from 'vitest'
import { fmt } from '../src/core/clock.ts'
import {
  FOLD_AFTER_BEATS,
  FOLD_AFTER_MINUTES,
  FOLD_AFTER_TOKENS,
  appendBeat,
  contextOf,
  fold,
  foldReason,
  openScene,
} from '../src/core/scene.ts'

function scene() {
  return openScene({ id: 's1', place: 'saloon', clock: 100, participants: ['ann', 'bob', 'ann'] })
}

describe('openScene', () => {
  it('参与者去重，每人一条空上下文', () => {
    const s = scene()
    expect(s.participants).toEqual(['ann', 'bob'])
    expect(s.context).toEqual({ ann: [], bob: [] })
    expect(s.beats).toBe(0)
  })
})

describe('appendBeat：只追加', () => {
  it('追加到参与者上下文，且不改原对象', () => {
    const s = scene()
    const next = appendBeat(s, { clock: 101, tokens: 500, texts: { ann: '门开了', bob: '他推门进来' }, signed: false })
    expect(next.context.ann).toEqual(['门开了'])
    expect(next.beats).toBe(1)
    expect(s.context.ann).toEqual([])
    expect(s.beats).toBe(0)
  })

  it('不在场的实体被忽略', () => {
    const next = appendBeat(scene(), { clock: 101, tokens: 0, texts: { ghost: '我不在场' }, signed: false })
    expect(next.context.ghost).toBeUndefined()
    expect(contextOf(next, 'ghost')).toBe('')
  })

  it('signed 一旦为真就不再回落', () => {
    const a = appendBeat(scene(), { clock: 101, tokens: 0, texts: {}, signed: true })
    const b = appendBeat(a, { clock: 102, tokens: 0, texts: {}, signed: false })
    expect(b.signed).toBe(true)
  })
})

describe('foldReason：四条触发', () => {
  it('地点变化最优先', () => {
    const s = appendBeat(scene(), { clock: 101, tokens: 20_000, texts: {}, signed: false })
    expect(foldReason(s, { place: 'street', clock: 102, tokens: 20_000 })).toBe('place')
  })

  it('时间跳跃 ≥ 240 分钟', () => {
    const s = scene()
    expect(foldReason(s, { place: 'saloon', clock: 100 + FOLD_AFTER_MINUTES, tokens: 0 })).toBe('time')
    expect(foldReason(s, { place: 'saloon', clock: 100 + FOLD_AFTER_MINUTES - 1, tokens: 0 })).toBeUndefined()
  })

  it('拍数与预算', () => {
    let s = scene()
    for (let i = 0; i < FOLD_AFTER_BEATS; i += 1) {
      s = appendBeat(s, { clock: 100, tokens: 0, texts: {}, signed: false })
    }
    expect(foldReason(s, { place: 'saloon', clock: 100, tokens: 0 })).toBe('beats')
    expect(foldReason(scene(), { place: 'saloon', clock: 100, tokens: FOLD_AFTER_TOKENS })).toBe('tokens')
  })

  it('没人参与时判为空场', () => {
    const empty = openScene({ id: 's2', place: 'saloon', clock: 0, participants: [] })
    expect(foldReason(empty, { place: 'saloon', clock: 0, tokens: 0 })).toBe('empty')
  })
})

describe('fold：交出压缩材料', () => {
  it('每人只取末尾 keepLast 条，并带上签名', () => {
    let s = appendBeat(scene(), { clock: 101, tokens: 0, texts: { ann: '一' }, signed: true })
    s = appendBeat(s, { clock: 102, tokens: 0, texts: { ann: '二' }, signed: false })
    s = appendBeat(s, { clock: 103, tokens: 0, texts: { ann: '三' }, signed: false })
    const material = fold(s, 'beats', 2)
    expect(material.perEnt.ann).toEqual(['二', '三'])
    expect(material.perEnt.bob).toEqual([])
    expect(material.signed).toBe(true)
    expect(material.reason).toBe('beats')
  })
})

describe('fmt：时间的唯一出口', () => {
  it('按天与时段输出', () => {
    expect(fmt(0)).toBe('第 1 天 · 子夜')
    expect(fmt(8 * 60)).toBe('第 1 天 · 早晨')
    expect(fmt(18 * 60)).toBe('第 1 天 · 傍晚')
    expect(fmt(1440 + 13 * 60)).toBe('第 2 天 · 下午')
  })
})
