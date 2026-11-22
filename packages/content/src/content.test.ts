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
        ledger: { ...pack.world.ledger, at: { player: 'saloon', ann: 'saloon', lamp: 'saloon' } },
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

describe('两人的可区分性', () => {
  it('core 开头 12 字与 voice 都不相同', () => {
    const ann = seed('ann')
    const doc = seed('doc')
    expect(head(ann.core)).not.toBe(head(doc.core))
    expect(ann.voice).not.toBe(doc.voice)
  })
})
