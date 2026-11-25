import { describe, expect, it } from 'vitest'
import { effectiveTarget } from './target.ts'

describe('effectiveTarget', () => {
  it('没有目标时是所有人', () => {
    expect(effectiveTarget(null, ['安'])).toBeNull()
  })

  it('目标仍在场时保留', () => {
    expect(effectiveTarget('安', ['安', '科迪'])).toBe('安')
  })

  it('目标离场时回到所有人', () => {
    expect(effectiveTarget('安', ['科迪'])).toBeNull()
  })
})
