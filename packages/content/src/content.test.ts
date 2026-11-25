import { describe, expect, it } from 'vitest'
import { validatePack, type CharacterSeed, type ContentPack } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from './load.ts'

const { pack } = loadContentPack(STARTER_TOWN_PATH)

function seed(id: string): CharacterSeed {
  const found = pack.characters.find((c) => c.id === id)
  if (!found) throw new Error(`内容包缺少 ${id}`)
  return found
}

function head(text = ''): string {
  return [...text].slice(0, 12).join('')
}

describe('validatePack', () => {
  it('STARTER_TOWN 通过校验', () => {
    expect(validatePack(pack)).toEqual([])
  })

  it('缺人物名或物品名时各报一条', () => {
    const broken: ContentPack = {
      ...pack,
      names: { ...pack.names, ann: '' },
      items: { ...pack.items, whiskey: '' },
    }
    const errors = validatePack(broken)
    expect(errors).toContain('实体 ann 缺少显示名')
    expect(errors).toContain('物品 whiskey 缺少显示名')
  })

  it('core 过长、heat 越界、实体不在 at 里：三处各报一条，互不遮蔽', () => {
    const broken: ContentPack = {
      ...pack,
      characters: [
        { ...seed('ann'), core: '安'.repeat(401) },
        { ...seed('doc'), drives: [{ id: 'count-morphine', text: '数吗啡', heat: 1.5 }] },
      ],
      world: {
        ...pack.world,
        ledger: {
          ...pack.world.ledger,
          // 子对象一起清空：这条例子只验证“三处各报一条”，不要被引用完整性挡住
          at: { player: 'saloon', ann: 'saloon', lamp: 'saloon' },
          holds: {},
          phys: {},
          rel: {},
          knows: {},
        },
      },
    }

    const errors = validatePack(broken)
    expect(errors).toHaveLength(3)
    const text = errors.join('\n')
    expect(text).toContain('ann 的 core')
    expect(text).toContain('doc 的 drive count-morphine 的 heat')
    expect(text).toContain('doc 不在 ledger.at 里')
  })
})

describe('validatePack：账本子对象', () => {
  it('最外层形状就不对时返回错误而不是抛异常', () => {
    expect(validatePack({} as ContentPack)).toEqual(['world.ledger.at 缺失'])
    expect(validatePack({ world: { ledger: { at: [] } } } as unknown as ContentPack)).toEqual(['world.ledger.at 缺失'])
  })

  it('坏掉的 clock / holds / phys / rel / knows 各报一条', () => {
    const broken: ContentPack = {
      ...pack,
      world: {
        ...pack.world,
        ledger: {
          ...pack.world.ledger,
          clock: Number.NaN,
          holds: { ...pack.world.ledger.holds, ann: { whiskey: -1 } },
          phys: { ...pack.world.ledger.phys, door: { closed: 'yes' as unknown as boolean } },
          rel: { ...pack.world.ledger.rel, ann: { doc: Number.NaN } },
          knows: { ...pack.world.ledger.knows, ann: 'f0' as unknown as string[] },
        },
      },
    }

    const text = validatePack(broken).join('\n')
    expect(text).toContain('ledger.clock')
    expect(text).toContain('要求非负整数')
    expect(text).toContain('phys.closed')
    expect(text).toContain('关系 ann → doc 的值不是有限数')
    expect(text).toContain('knows 必须是字符串数组')
  })
})

describe('validatePack：opening 与 scene', () => {
  it('STARTER_TOWN 两者都有，且都在字数上限内', () => {
    expect([...(pack.opening ?? '')].length).toBeGreaterThan(0)
    expect([...(pack.scene ?? '')].length).toBeGreaterThan(0)
    expect(validatePack(pack)).toEqual([])
  })

  it('旧内容包没有这两个字段照样通过', () => {
    const old: ContentPack = { ...pack }
    delete old.opening
    delete old.scene
    expect(validatePack(old)).toEqual([])
  })

  it('空串视为缺失，不报错', () => {
    expect(validatePack({ ...pack, opening: '', scene: '   ' })).toEqual([])
  })

  it('类型不对或超长时各报一条', () => {
    const text = validatePack({
      ...pack,
      opening: 42 as unknown as string,
      scene: '雨'.repeat(161),
    }).join('\n')
    expect(text).toContain('opening 必须是字符串')
    expect(text).toContain('scene 是 161 字，要求 ≤ 160')
  })

  it('opening 超过 600 字时报出实际字数', () => {
    expect(validatePack({ ...pack, opening: '雨'.repeat(601) })).toEqual(['opening 是 601 字，要求 ≤ 600'])
  })
})

describe('两人的可区分性', () => {
  it('core 开头 12 字与 voice 都不相同', () => {
    const ann = seed('ann')
    const doc = seed('doc')
    expect(head(ann.core)).not.toBe(head(doc.core))
    expect(ann.voice).not.toBe(doc.voice)
  })
})
