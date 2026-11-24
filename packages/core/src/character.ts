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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
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

/** 驱动热度增减；referee 的 driveHits 与 journal 重放共用这一份逻辑。 */
export function applyDriveHit(ch: Character, hit: { driveId: string; delta: number }): Character {
  const drives = ch.drives.map((d) => (d.id === hit.driveId ? { ...d, heat: clamp01(d.heat + hit.delta) } : d))
  return { ...ch, drives }
}

export interface SelfGateInput {
  /** 本拍 referee 判了 ok 且真的落了账，或判了 no，或时间流逝够长 */
  signed: boolean
  /** 最近窗口内已有的 self 条数（用 `selfInWindow` 算，窗口 = `SELF_WINDOW_BEATS` 拍） */
  recentSelf: number
}

/** 稀缺窗口：最近多少拍内至多 1 条 self（30 §4）。 */
export const SELF_WINDOW_BEATS = 10

/**
 * 窗口按**拍号**算，不按场景：场景长度不受控（一次长睡折场只剩 1 拍），按场景算会让稀缺闸松掉一个数量级。
 * `self` 条目用已有的 `ref` 存拍号；旧 journal 的 self 没有 `ref`，视为很久以前，不占窗口。
 */
export function selfInWindow(ch: Character, beatIndex: number): number {
  return ch.experience.filter(
    (e) => e.kind === 'self' && (e.ref ?? Number.NEGATIVE_INFINITY) > beatIndex - SELF_WINDOW_BEATS,
  ).length
}

/** 成长闸（见 docs/design/30-cognition.md §4）：只追加 + 要签名 + 稀缺。 */
export function canWriteSelf(input: SelfGateInput): boolean {
  return input.signed && input.recentSelf < 1
}
