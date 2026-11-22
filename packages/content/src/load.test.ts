import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { ContentPack } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from './load.ts'

const dir = mkdtempSync(join(tmpdir(), 'ai-world-content-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0
/** 写一份被改坏的包，返回路径。 */
function write(pack: ContentPack): string {
  seq += 1
  const path = join(dir, `${seq}.json`)
  writeFileSync(path, JSON.stringify(pack))
  return path
}

function base(): ContentPack {
  return loadContentPack(STARTER_TOWN_PATH).pack
}

describe('loadContentPack', () => {
  it('合法包加载成功，同一文件两次哈希相同', () => {
    const a = loadContentPack(STARTER_TOWN_PATH)
    const b = loadContentPack(STARTER_TOWN_PATH)
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('core 超长时抛出，错误里带字段名', () => {
    const pack = base()
    pack.characters[0] = { ...pack.characters[0]!, core: '安'.repeat(401) }
    expect(() => loadContentPack(write(pack))).toThrow(/core/)
  })

  it('canon 超长时抛出，错误里带字段名', () => {
    const pack = base()
    pack.canon[0] = '安'.repeat(61)
    expect(() => loadContentPack(write(pack))).toThrow(/canon/)
  })

  it('title 为空时抛出，错误里带字段名', () => {
    const pack = { ...base(), title: '' }
    expect(() => loadContentPack(write(pack))).toThrow(/title/)
  })

  it('缺显示名时抛出，错误里带字段名', () => {
    const pack = base()
    pack.names = { ...pack.names, ann: '' }
    expect(() => loadContentPack(write(pack))).toThrow(/显示名/)
  })

  it('at 指向未知地点时抛出，错误里带字段名', () => {
    const pack = base()
    pack.world = { ...pack.world, ledger: { ...pack.world.ledger, at: { ...pack.world.ledger.at, ann: 'nowhere' } } }
    expect(() => loadContentPack(write(pack))).toThrow(/places/)
  })
})
