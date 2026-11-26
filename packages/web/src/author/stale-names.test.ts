/**
 * 旧称呼提示的纯函数：只比显示名、只报正文位置，不改任何文本。
 * 改名到底有没有影响正文，取决于别人怎么写那几句散文——这里盯的是“认得出”和“不误报”。
 */
import { describe, expect, it } from 'vitest'
import { staleDisplayNames } from './stale-names.ts'
import type { NamePack } from './stale-names.ts'

const base = (overrides: NamePack = {}): NamePack => ({
  title: '雨夜酒馆',
  opening: '雨从屋檐上垂下来。',
  scene: '雨夜的酒馆。',
  canon: ['雨一直下。'],
  characters: [
    { id: 'ann', core: '她擦杯子，不抬头。', voice: '短句，不解释。', beliefs: { b1: '柜台是她的地盘。' }, drives: [{ id: 'tend-bar', text: '把杯子收走。' }] },
  ],
  world: { places: { saloon: '酒馆', street: '街道' } },
  names: { player: '你', ann: '安', counter: '柜台' },
  items: { whiskey: '威士忌', cup: '杯子' },
  ...overrides,
})

describe('staleDisplayNames', () => {
  it('旧名还留在 core 里：报出 ann，字段标签是“ann 的 core”', () => {
    const before = base()
    const after = base({
      names: { player: '你', ann: '安妮', counter: '柜台' },
      characters: [
        { id: 'ann', core: '安擦杯子，不抬头。', voice: '短句，不解释。', beliefs: { b1: '柜台是她的地盘。' }, drives: [{ id: 'tend-bar', text: '把杯子收走。' }] },
      ],
    })

    expect(staleDisplayNames(before, after)).toEqual([
      { kind: 'name', id: 'ann', from: '安', to: '安妮', fields: ['ann 的 core'] },
    ])
  })

  it('旧名在 canon 与 opening 里：两个字段都报，canon 带条号', () => {
    const before = base()
    const after = base({
      opening: '安的酒馆还亮着灯。',
      canon: ['雨一直下。', '安不离开柜台。'],
      names: { player: '你', ann: '安妮', counter: '柜台' },
    })

    expect(staleDisplayNames(before, after)).toEqual([
      { kind: 'name', id: 'ann', from: '安', to: '安妮', fields: ['opening', 'canon 第 2 条'] },
    ])
  })

  it('新名包含旧名（安 → 安妮）：正文只有“安妮”时不报', () => {
    const before = base()
    const after = base({
      opening: '安妮擦杯子。',
      canon: ['安妮不离开柜台。'],
      names: { player: '你', ann: '安妮', counter: '柜台' },
      characters: [
        { id: 'ann', core: '安妮擦杯子，不抬头。', voice: '短句，不解释。', beliefs: { b1: '柜台是她的地盘。' }, drives: [{ id: 'tend-bar', text: '把杯子收走。' }] },
      ],
    })

    expect(staleDisplayNames(before, after)).toEqual([])
  })

  it('“安妮和安”这种旧名与新名并存：仍报，并删掉新名后认得出旧名', () => {
    const before = base()
    const after = base({
      scene: '安妮和安都在酒馆。',
      names: { player: '你', ann: '安妮', counter: '柜台' },
    })

    expect(staleDisplayNames(before, after)).toEqual([
      { kind: 'name', id: 'ann', from: '安', to: '安妮', fields: ['scene'] },
    ])
  })

  it('没改名、清空显示名、新加的键都不报', () => {
    const before = base()
    const after = base({
      names: { player: '你', ann: '安', counter: '', newcomer: '新来的' },
      world: { places: { saloon: '酒馆', street: '街道', attic: '阁楼' } },
    })

    expect(staleDisplayNames(before, after)).toEqual([])
  })

  it('三类显示名都认：place 与 item 改名后各报一处', () => {
    const before = base()
    const after = base({
      world: { places: { saloon: '酒馆后巷', street: '街道' } },
      items: { whiskey: '威士忌酒', cup: '杯子' },
      canon: ['酒馆里只有威士忌。'],
    })

    expect(staleDisplayNames(before, after)).toEqual([
      { kind: 'place', id: 'saloon', from: '酒馆', to: '酒馆后巷', fields: ['title', 'scene', 'canon 第 1 条'] },
      { kind: 'item', id: 'whiskey', from: '威士忌', to: '威士忌酒', fields: ['canon 第 1 条'] },
    ])
  })

  it('人物其余正文字段也扫：voice、信念值与 drive 文本', () => {
    const before = base()
    const after = base({
      names: { player: '你', ann: '安妮', counter: '柜台' },
      characters: [
        {
          id: 'ann',
          core: '她擦杯子。',
          voice: '安式短句。',
          beliefs: { b1: '安守着柜台。' },
          drives: [{ id: 'tend-bar', text: '替安把杯子收走。' }],
        },
      ],
    })

    expect(staleDisplayNames(before, after)).toEqual([
      { kind: 'name', id: 'ann', from: '安', to: '安妮', fields: ['ann 的 voice', 'ann 的信念 b1', 'ann 的 tend-bar'] },
    ])
  })
})