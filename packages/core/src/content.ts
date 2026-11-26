/**
 * 内容包：一次开局的全部作者层数据（人物 core、账本初值、canon）。
 *
 * 只做静态校验，不写账本、不调模型。玩家是半 actor（见 30-cognition §7），
 * 因此不要求出现在 characters 里，只要求有一个位置。
 */
import type { Character } from './character.ts'
import type { EntId, ItemId, World } from './world.ts'

/**
 * 作者层人物：只含人写的字段。`experience` 与 `busyUntil` 是运行时状态，
 * 由 seedCharacters() 补空，不写进内容包。
 */
export type CharacterSeed = Omit<Character, 'experience' | 'busyUntil'>

export interface ContentPack {
  /** 世界标题：玩家壳顶栏用它 */
  title: string
  /** 首屏散文：只给玩家读，不进任何上下文；空串与缺失同义 */
  opening?: string
  /** 一两句现场描述：拼在 sceneText 之前，进人物/裁判/旁白上下文；空串与缺失同义 */
  scene?: string
  world: World
  characters: CharacterSeed[]
  canon: string[]
  player: EntId
  /** 人物/实体显示名：id → 人读的名字；作者层静态内容，不进账本 */
  names: Record<EntId, string>
  /** 物品显示名：id → 人读的名字；作者层静态内容，不进账本 */
  items: Record<ItemId, string>
  /**
   * 额外检索词：id → 别名。只用于事实切片里“这句话提到谁”的匹配，不是显示名。
   * 典型：裁判把玩家写成“玩家”，而显示名是“你”（第二人称留给旁白）。
   */
  aliases?: Record<EntId, string[]>
}

/** 内容包 → 开局人物：运行时字段补空。 */
export function seedCharacters(pack: ContentPack): Character[] {
  return pack.characters.map((seed) => ({ ...seed, experience: [], busyUntil: 0 }))
}

const CORE_MIN = 200
const CORE_MAX = 400
const CANON_MAX = 60
const OPENING_MAX = 600
const SCENE_MAX = 160

function width(text: string): number {
  return [...text].length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 返回错误列表，空数组 = 通过；各条检查互不短路，一次报全。 */
export function validatePack(pack: ContentPack): string[] {
  const errors: string[] = []
  // 作者壳回传的是 JSON 原文：先确认最外层形状，否则后面每一行都是 TypeError
  const ledger = pack?.world?.ledger
  if (!isRecord(ledger) || !isRecord(ledger.at)) return ['world.ledger.at 缺失']
  const at = ledger.at
  if (!isRecord(ledger.holds)) errors.push('ledger.holds 必须是对象')
  if (!isRecord(ledger.phys)) errors.push('ledger.phys 必须是对象')
  if (!isRecord(ledger.rel)) errors.push('ledger.rel 必须是对象')
  if (!isRecord(ledger.knows)) errors.push('ledger.knows 必须是对象')

  if (typeof pack.title !== 'string' || pack.title.trim() === '') errors.push('title 为空')
  if (!Array.isArray(pack.characters)) {
    errors.push('characters 必须是数组')
    return errors
  }

  // at 是 Record，键天然唯一；实体 id 重复只可能出现在 characters 列表里。
  const ids = new Set<EntId>()
  for (const ch of pack.characters) {
    if (ids.has(ch.id)) errors.push(`characters 里的实体 id 重复：${ch.id}`)
    ids.add(ch.id)
    if (!(ch.id in at)) errors.push(`人物 ${ch.id} 不在 ledger.at 里`)
  }
  if (!(pack.player in at)) errors.push(`玩家 ${pack.player} 不在 ledger.at 里`)
  for (const [ent, place] of Object.entries(at)) {
    if (!(place in pack.world.places)) errors.push(`实体 ${ent} 所在地点 ${place} 不在 places 里`)
    if ((pack.names[ent] ?? '').trim() === '') errors.push(`实体 ${ent} 缺少显示名`)
  }
  for (const bag of Object.values(pack.world.ledger.holds)) {
    for (const item of Object.keys(bag)) {
      if ((pack.items[item] ?? '').trim() === '') errors.push(`物品 ${item} 缺少显示名`)
    }
  }

  for (const ch of pack.characters) {
    const coreWidth = width(ch.core ?? '')
    if (coreWidth < CORE_MIN || coreWidth > CORE_MAX) {
      errors.push(`${ch.id} 的 core 是 ${coreWidth} 字，要求 ${CORE_MIN}–${CORE_MAX}`)
    }
    if ((ch.voice ?? '').trim() === '') errors.push(`${ch.id} 的 voice 为空`)

    const driveIds = new Set<string>()
    for (const drive of ch.drives) {
      if (driveIds.has(drive.id)) errors.push(`${ch.id} 的 drive id 重复：${drive.id}`)
      driveIds.add(drive.id)
      // 写成取非，NaN 也会被拒绝
      if (!(drive.heat >= 0 && drive.heat <= 1)) {
        errors.push(`${ch.id} 的 drive ${drive.id} 的 heat 是 ${drive.heat}，要求 0..1`)
      }
    }
  }

  // 账本子对象也是作者可编辑输入：坏的那一份要在保存时就拒，不能等到第一次 op 把整拍打死
  if (!Number.isFinite(ledger.clock) || ledger.clock < 0) errors.push(`ledger.clock 不合法：${String(ledger.clock)}`)
  if (!isRecord(pack.world.places) || Object.keys(pack.world.places).length === 0) {
    errors.push('places 为空')
  } else {
    for (const [place, name] of Object.entries(pack.world.places)) {
      if (typeof name !== 'string' || name.trim() === '') errors.push(`地点 ${place} 缺少显示名`)
    }
  }
  for (const [ent, bag] of Object.entries(ledger.holds)) {
    if (!(ent in at)) errors.push(`holds 里的实体 ${ent} 不在 ledger.at 里`)
    for (const [item, n] of Object.entries(bag)) {
      // schema 的取値域是 count ≥ 0；运行时不产生 0 值，但作者写了也不该直接拒
      if (!Number.isInteger(n) || n < 0) errors.push(`${ent} 持有的 ${item} 数量是 ${String(n)}，要求非负整数`)
    }
  }
  for (const [ent, row] of Object.entries(ledger.phys)) {
    if (!(ent in at)) errors.push(`phys 里的实体 ${ent} 不在 ledger.at 里`)
    for (const [key, value] of Object.entries(row)) {
      const bad = typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'boolean'
      if (bad) errors.push(`${ent} 的 phys.${key} 只能是有限数字或布尔`)
    }
  }
  for (const [from, row] of Object.entries(ledger.rel)) {
    if (!(from in at)) errors.push(`rel 里的实体 ${from} 不在 ledger.at 里`)
    for (const [to, delta] of Object.entries(row)) {
      if (!(to in at)) errors.push(`关系 ${from} → ${to}：对方不在 ledger.at 里`)
      if (!Number.isFinite(delta)) errors.push(`关系 ${from} → ${to} 的值不是有限数`)
    }
  }
  for (const [ent, ids] of Object.entries(ledger.knows)) {
    if (!(ent in at)) errors.push(`knows 里的实体 ${ent} 不在 ledger.at 里`)
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) errors.push(`${ent} 的 knows 必须是字符串数组`)
  }

  // 空串视为缺失：旧内容包没有这两个字段，作者把 textarea 清空也不该被拒
  for (const [field, max] of [
    ['opening', OPENING_MAX],
    ['scene', SCENE_MAX],
  ] as const) {
    const value: unknown = pack[field]
    if (value === undefined) continue
    if (typeof value !== 'string') {
      errors.push(`${field} 必须是字符串`)
      continue
    }
    const proseWidth = width(value.trim())
    if (proseWidth > max) errors.push(`${field} 是 ${proseWidth} 字，要求 ≤ ${max}`)
  }

  if (pack.canon.length === 0) errors.push('canon 为空')
  pack.canon.forEach((line, i) => {
    const canonWidth = width(line.trim())
    if (canonWidth === 0) errors.push(`canon 第 ${i + 1} 条为空`)
    else if (canonWidth > CANON_MAX) errors.push(`canon 第 ${i + 1} 条是 ${canonWidth} 字，要求 ≤ ${CANON_MAX}`)
  })

  return errors
}
