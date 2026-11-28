/**
 * 名字自动聚焦的纯函数（决策 #48，见 docs/research/auto-focus.md）。
 *
 * 这里只钉“算不算命中”：唯一命中才返回，其余交给“所有人”。
 * 路由/会话侧的接法见 `routes/beat.test.ts` 与 `session.test.ts`。
 */
import { describe, expect, it } from 'vitest'
import { inferFocus } from './focus.ts'

const names = { player: '你', ann: '安', doc: '道森医生' }

describe('inferFocus', () => {
  it('正文里只有一个名字：返回那个人', () => {
    expect(inferFocus({ text: '我走到安面前，把银元放下。', people: ['ann', 'doc'], names })).toBe('ann')
  })

  it('正文里有两个名字：不猜，返回 undefined', () => {
    expect(inferFocus({ text: '我对安和道森医生说话。', people: ['ann', 'doc'], names })).toBeUndefined()
  })

  it('别名也算名字', () => {
    const aliased = { ann: '安' }
    const aliases = { ann: ['老板娘'] }
    expect(inferFocus({ text: '我冲老板娘点点头。', people: ['ann'], names: aliased, aliases })).toBe('ann')
    // 同一实体的显示名与别名同时出现也只是一个人
    expect(inferFocus({ text: '我冲老板娘安点点头。', people: ['ann'], names: aliased, aliases })).toBe('ann')
  })

  it('没提人：返回 undefined', () => {
    expect(inferFocus({ text: '我推门进去。', people: ['ann', 'doc'], names })).toBeUndefined()
  })

  it('只提玩家自己：玩家不在 candidates 里，返回 undefined', () => {
    expect(inferFocus({ text: '你别劝我。', people: ['ann', 'doc'], names })).toBeUndefined()
  })

  it('两个实体同名：返回 undefined', () => {
    const twin = { ann: '安', doc: '安' }
    expect(inferFocus({ text: '我走到安面前。', people: ['ann', 'doc'], names: twin })).toBeUndefined()
  })

  it('只有空白标签：不算命中', () => {
    expect(inferFocus({ text: '我坐下。', people: ['ann'], names: { ann: '   ' } })).toBeUndefined()
  })

  it('单字显示名会误命中同字词：这是本轮接受的启发式', () => {
    expect(inferFocus({ text: '我稍微安心了。', people: ['ann', 'doc'], names })).toBe('ann')
  })

  it('只看传入的 people：不在场的人名字出现也不聚焦', () => {
    expect(inferFocus({ text: '我念叨着道森医生。', people: ['ann'], names })).toBeUndefined()
  })
})