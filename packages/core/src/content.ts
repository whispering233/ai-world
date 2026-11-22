/**
 * 内容包：一次开局的全部作者层数据（人物 core、账本初值、canon）。
 *
 * 只做静态校验，不写账本、不调模型。玩家是半 actor（见 30-cognition §7），
 * 因此不要求出现在 characters 里，只要求有一个位置。
 */
import type { Character } from './character.ts'
import type { EntId, ItemId, World } from './world.ts'

export interface ContentPack {
  world: World
  characters: Character[]
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

const CORE_MIN = 200
const CORE_MAX = 400
const CANON_MAX = 60

function width(text: string): number {
  return [...text].length
}

/** 返回错误列表，空数组 = 通过；各条检查互不短路，一次报全。 */
export function validatePack(pack: ContentPack): string[] {
  const errors: string[] = []
  const at = pack.world.ledger.at

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

  if (pack.canon.length === 0) errors.push('canon 为空')
  pack.canon.forEach((line, i) => {
    const canonWidth = width(line.trim())
    if (canonWidth === 0) errors.push(`canon 第 ${i + 1} 条为空`)
    else if (canonWidth > CANON_MAX) errors.push(`canon 第 ${i + 1} 条是 ${canonWidth} 字，要求 ≤ ${CANON_MAX}`)
  })

  return errors
}
