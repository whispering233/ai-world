/**
 * 调度：谁被叫到。纯函数，无 LLM。
 *
 * 时间模型见 docs/design/40-time-and-loop.md：clock 是分钟数，没有等距 tick。
 */

import type { EntId } from './world.ts'

export interface CalledInput {
  present: readonly EntId[]
  heat: Record<EntId, number[]>
  touched: readonly EntId[]
  player: EntId
  /** 玩家选定的说话对象；在场时本拍只叫玩家 + 目标，不看 heat（40 §4 的聚焦例外） */
  focus?: EntId
}

const HEAT_THRESHOLD = 0.5

const SEGMENTS: { until: number; name: string }[] = [
  { until: 4, name: '子夜' },
  { until: 6, name: '拂晓' },
  { until: 9, name: '早晨' },
  { until: 11, name: '上午' },
  { until: 13, name: '正午' },
  { until: 17, name: '下午' },
  { until: 19, name: '傍晚' },
  { until: 21, name: '夜' },
  { until: 24, name: '深夜' },
]

/**
 * 时间的**唯一**展示出口（docs/design/40-time-and-loop.md §6）。
 * 文本不得自己写绝对时间，只能从这里取。
 */
export function fmt(clock: number): string {
  const day = Math.floor(clock / 1440) + 1
  const hour = Math.floor((clock % 1440) / 60)
  const segment = SEGMENTS.find((s) => hour < s.until)?.name ?? '深夜'
  return `第 ${day} 天 · ${segment}`
}

/**
 * 一拍参与者 = 玩家 + 在场且有张力者 + 在场且本拍被直接作用者。
 * 人不在场就不叫到：位置不是唤醒条件，但不在场的脸不会被摆到这一拍里。
 *
 * 聚焦是唯一的例外：目标在场时只叫玩家 + 目标，其余人这一拍不产生 claim（决策 #48）。
 */
export function calledActors(input: CalledInput): EntId[] {
  const { present, heat, touched, player, focus } = input
  if (focus !== undefined && present.includes(focus)) return focus === player ? [player] : [player, focus]
  const touchedSet = new Set(touched)
  const called: EntId[] = [player]
  const seen = new Set<EntId>([player])
  for (const ent of present) {
    if (seen.has(ent)) continue
    const hot = (heat[ent] ?? []).some((h) => h >= HEAT_THRESHOLD)
    if (!hot && !touchedSet.has(ent)) continue
    seen.add(ent)
    called.push(ent)
  }
  return called
}
