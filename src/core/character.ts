/**
 * 人物状态与检索（见 docs/design/30-cognition.md）。
 *
 * 四层状态的可变性边界：core 运行时只读；drives 增删归角色、heat 归 referee；
 * beliefs 自由可变；experience 只追加。这里只有纯函数，不调模型、不写账本。
 */
import type { EntId } from './world.ts'

export interface Drive {
  id: string
  text: string
  heat: number
}

export interface Experience {
  /** 发生时的时间出口值（分钟） */
  t: number
  /** seen = 看到的，self = 自己做的判断（成长载体），thought = 没出口的话（不进裁判） */
  kind: 'seen' | 'self' | 'thought'
  text: string
  /** 检索权重 1..3 */
  w: 1 | 2 | 3
  /** 指向 fact 或条目序号，可选 */
  ref?: number
}

export interface Character {
  id: EntId
  /** 作者层，运行时只读 */
  readonly core?: string
  readonly voice?: string
  drives: Drive[]
  beliefs: Record<EntId, string>
  experience: Experience[]
  busyUntil: number
}

const HALF_LIFE = 48
const SELF_BONUS = 0.3

export function score(e: Experience, now: number): number {
  return e.w * 0.5 ** ((now - e.t) / HALF_LIFE) + (e.kind === 'self' ? SELF_BONUS : 0)
}

/** 取前 limit 条：分数降序，同分时较新的在前（sort 稳定，其余保持插入序）。 */
export function recall(ch: Character, now: number, limit = 12): Experience[] {
  return [...ch.experience]
    .sort((a, b) => score(b, now) - score(a, now) || b.t - a.t)
    .slice(0, limit)
}

/** 只追加；返回新对象，入参与 core/voice 不变。 */
export function remember(ch: Character, e: Experience): Character {
  return { ...ch, experience: [...ch.experience, e] }
}

export interface SelfGateInput {
  /** 本拍 referee 判了 ok 或 no，或时间流逝够长 */
  signed: boolean
  /** 最近 10 拍里的 self 条数 */
  selfInLast10Beats: number
}

export function canWriteSelf(input: SelfGateInput): boolean {
  return input.signed && input.selfInLast10Beats < 1
}
