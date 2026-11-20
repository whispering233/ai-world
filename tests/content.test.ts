import { describe, expect, it } from 'vitest'
import type { Character } from '../src/core/character.ts'
import { validatePack, type ContentPack } from '../src/core/content.ts'
import { STARTER_TOWN } from '../content/starter-town.ts'

function person(id: string): Character {
  const found = STARTER_TOWN.characters.find((c) => c.id === id)
  if (!found) throw new Error(`STARTER_TOWN 缺少 ${id}`)
  return found
}

function head(text = ''): string {
  return [...text].slice(0, 12).join('')
}

describe('validatePack', () => {
  it('STARTER_TOWN 通过校验', () => {
    expect(validatePack(STARTER_TOWN)).toEqual([])
  })

  it('core 过长、heat 越界、实体不在 at 里：三处各报一条，互不遮蔽', () => {
    const broken: ContentPack = {
      ...STARTER_TOWN,
      characters: [
        { ...person('ann'), core: '安'.repeat(401) },
        { ...person('doc'), drives: [{ id: 'count-morphine', text: '数吗啡', heat: 1.5 }] },
      ],
      world: {
        ...STARTER_TOWN.world,
        ledger: { ...STARTER_TOWN.world.ledger, at: { player: 'saloon', ann: 'saloon', lamp: 'saloon' } },
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
    const ann = person('ann')
    const doc = person('doc')
    expect(head(ann.core)).not.toBe(head(doc.core))
    expect(ann.voice).not.toBe(doc.voice)
  })
})
