/**
 * 定向 focus 的目标轮换（C6 探针的纯函数，不属于生产路径）。
 *
 * 候选只在“本场地点 + 内容包里的人物”里挑：玩家自己与陈设（counter / door / lamp…）
 * 从不进 `pack.characters`，所以按 `pack.characters` 的 id 过滤就已经排掉了它们。
 * 一个候选都不在场时返回 undefined，调用方据此退回“所有人”——不是静默换一套调度。
 */
import type { EntId, World } from '@ai-world/core'

export interface FocusTargetInput {
  world: World
  /** 第几拍（1 起）：`(beat - 1) % 在场人数` 决定轮到谁 */
  beat: number
  /** 候选人物 id（内容包的 `characters`）；数组顺序就是轮换顺序 */
  candidates: readonly EntId[]
  player: EntId
  /** 本场实际地点（scene.place）：与 runBeat 的 inScene 同源，不用玩家可能刚离开的地点 */
  place: string
}

export function focusTargetOf(input: FocusTargetInput): EntId | undefined {
  if (input.beat < 1) return undefined
  const present = input.candidates.filter((ent) => ent !== input.player && input.world.ledger.at[ent] === input.place)
  if (present.length === 0) return undefined
  return present[(input.beat - 1) % present.length]
}