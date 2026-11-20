/**
 * 调度：谁的手空了、谁被叫到。纯函数，无 LLM。
 *
 * 时间模型见 docs/design/40-time-and-loop.md：clock 是分钟数，
 * 每个实体有「手上这件事完成」的时刻；没有等距 tick。
 */

import type { EntId } from './world.ts'

export interface Activity {
  ent: EntId
  until: number
}

/** 空数组返回 undefined：没有在忙的人，就没有下一次唤醒。 */
export function nextWake(acts: readonly Activity[]): number | undefined {
  let min: number | undefined
  for (const a of acts) {
    if (min === undefined || a.until < min) min = a.until
  }
  return min
}

/**
 * 同一实体取最早完成时刻：一个人只要手上最早那件事做完就算空出来了。
 * Map 保留首次出现顺序，sort 稳定，所以同刻者仍是原数组顺序。
 */
export function dueActors(acts: readonly Activity[], t: number): EntId[] {
  const earliest = new Map<EntId, number>()
  for (const a of acts) {
    const before = earliest.get(a.ent)
    if (before === undefined || a.until < before) earliest.set(a.ent, a.until)
  }
  const due: [EntId, number][] = []
  for (const entry of earliest) if (entry[1] <= t) due.push(entry)
  return due.sort((x, y) => x[1] - y[1]).map(([ent]) => ent)
}

export interface CalledInput {
  present: readonly EntId[]
  heat: Record<EntId, number[]>
  touched: readonly EntId[]
  player: EntId
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
 */
export function calledActors(input: CalledInput): EntId[] {
  const { present, heat, touched, player } = input
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
