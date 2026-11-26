/**
 * 内容包加载：读 `content/<world>.json` → 校验 → 内容哈希。
 *
 * 服务端启动、保存作者表单、以及 scripts/ 里的探针都走这里，保证同一个校验函数。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validatePack, type ContentPack } from '@ai-world/core'

/** 世界 id 就是文件名：只允许小写字母、数字与连字符，防止拼进别的路径。 */
const WORLD_ID = /^[a-z0-9-]+$/

/** `content/` 目录的绝对路径：服务端启动时在这里扫出可开的世界。 */
export const CONTENT_DIR = fileURLToPath(new URL('../../../content/', import.meta.url))

/** `content/<world>.json` 的绝对路径；id 不合规直接抛，不做任何路径拼接。 */
export function contentPathFor(world: string): string {
  if (!WORLD_ID.test(world)) throw new Error(`世界 id 不合规：${world}`)
  return fileURLToPath(new URL(`../../../content/${world}.json`, import.meta.url))
}

/** 仓库根的默认世界内容。 */
export const STARTER_TOWN_PATH = contentPathFor('starter-town')

/** 键排序后的 JSON：同一份内容不论键序如何，哈希都相同。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** 内容哈希：规范化 JSON 的 sha256 前 16 位十六进制，用于“已保存但未生效”。 */
export function contentHash(pack: ContentPack): string {
  return createHash('sha256').update(canonical(pack)).digest('hex').slice(0, 16)
}

export function loadContentPack(path: string): { pack: ContentPack; hash: string } {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (cause) {
    throw new Error(`读不到内容包 ${path}`, { cause })
  }
  let pack: ContentPack
  try {
    pack = JSON.parse(text) as ContentPack
  } catch (cause) {
    throw new Error(`内容包 ${path} 不是合法 JSON：${(cause as Error).message}`, { cause })
  }
  const errors = validatePack(pack)
  if (errors.length > 0) throw new Error(`内容包 ${path} 校验失败：\n${errors.join('\n')}`)
  return { pack, hash: contentHash(pack) }
}
