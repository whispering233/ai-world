/**
 * 世界数据结构。
 *
 * 三份数据的边界（见 docs/design/10-world-model.md）：
 * - ledger：可被外界观测/验证的状态，只有 referee 能写
 * - facts ：从此不可否认的公共事实，只增不改
 * - passage：叙事文本，不属于本模块
 *
 * 「实体」= 以 `ledger.at` 的键为存在依据。物品（item）与地点（place）只是 id，
 * 不单独存在性登记；v1 不建地点图，"可达"由 referee 判定。
 */

export type EntId = string
export type PlaceId = string
export type ItemId = string
export type FactId = string

export interface Ledger {
  /** 分钟数，单调递增 */
  clock: number
  at: Record<EntId, PlaceId>
  holds: Record<EntId, Record<ItemId, number>>
  /** 开放口袋：门锁、伤势、灯火……键必须能被一句物理描述解释 */
  phys: Record<EntId, Record<string, number | boolean>>
  /** 单向：A→B 与 B→A 各自独立，取值 -3..3 */
  rel: Record<EntId, Record<EntId, number>>
  knows: Record<EntId, FactId[]>
}

export interface Fact {
  id: FactId
  text: string
  /** 产生时的 clock */
  at: number
  supersededBy?: FactId
}

export interface World {
  ledger: Ledger
  facts: Record<FactId, Fact>
}

export type Op =
  | { op: 'move'; who: EntId; to: PlaceId }
  | { op: 'give'; from: EntId; to: EntId; item: ItemId; n: number }
  | { op: 'take'; from: EntId; item: ItemId; n: number }
  | { op: 'phys'; who: EntId; key: string; value: number | boolean }
  | { op: 'rel'; from: EntId; to: EntId; delta: number }
  | { op: 'learn'; who: EntId[]; text: string }

export interface OpResult {
  ok: boolean
  /** 不成立的原因，会写回相关角色的 experience */
  why?: string
}

export const REL_MIN = -3
export const REL_MAX = 3
/**
 * saturate：关系是态度强度，到顶就是到顶，不该因为"没法更恨"而让整条主张失败。
 * 其余 op 的越界（持有数不足、实体不存在）一律拒绝，不写半条状态。
 */
export function clampRel(value: number): number {
  return Math.max(REL_MIN, Math.min(REL_MAX, value))
}
