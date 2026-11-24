/**
 * 场景：上下文的生命周期单位（见 docs/design/40-time-and-loop.md §2）。
 *
 * 进入时装配一次，之后只追加（前缀稳定 → 缓存命中）；退出时折场，把窗口压成经验。
 * 折场是唯一的压缩入口，同时是成长入口。
 */
import type { EntId, PlaceId } from './world.ts'

export const FOLD_AFTER_BEATS = 12
export const FOLD_AFTER_TOKENS = 16_000
export const FOLD_AFTER_MINUTES = 240

export type FoldReason = 'place' | 'time' | 'beats' | 'tokens' | 'empty'

export interface Scene {
  id: string
  place: PlaceId
  openedAt: number
  lastBeatAt: number
  beats: number
  /** 当前**最长参与者上下文**的估算值（40 §2）；折场后由重开归零 */
  tokens: number
  participants: EntId[]
  /** 每人一条追加式上下文；只增不改，所以缓存前缀永远稳定 */
  context: Record<EntId, string[]>
  /** 本场景内是否发生过世界签名（决定折场时能否写 self 条目） */
  signed: boolean
}

export interface OpenSceneInput {
  id: string
  place: PlaceId
  clock: number
  participants: readonly EntId[]
}

export function openScene(input: OpenSceneInput): Scene {
  const participants = [...new Set(input.participants)]
  const context: Record<EntId, string[]> = {}
  for (const ent of participants) context[ent] = []
  return {
    id: input.id,
    place: input.place,
    openedAt: input.clock,
    lastBeatAt: input.clock,
    beats: 0,
    tokens: 0,
    participants,
    context,
    signed: false,
  }
}

export interface BeatAdd {
  clock: number
  /** 本拍结束时最长参与者上下文的估算值（调用方测量） */
  tokens: number
  /** 每个参与者这一拍看到的末尾文本；缺省的人不追加 */
  texts: Record<EntId, string>
  /** 本拍是否构成世界签名 */
  signed: boolean
}

/** 只追加：已有条目一个字都不改，否则缓存前缀失效，16k 预算下代价很高。 */
export function appendBeat(scene: Scene, beat: BeatAdd): Scene {
  const context: Record<EntId, string[]> = { ...scene.context }
  for (const [ent, text] of Object.entries(beat.texts)) {
    if (!(ent in context)) continue
    context[ent] = [...(context[ent] ?? []), text]
  }
  return {
    ...scene,
    lastBeatAt: beat.clock,
    beats: scene.beats + 1,
    tokens: beat.tokens,
    context,
    signed: scene.signed || beat.signed,
  }
}

export interface NowInput {
  /** 主视角实体此刻所在的地点 */
  place: PlaceId
  clock: number
  tokens: number
}

/**
 * 四条折场触发（顺序即优先级）：地点变化 → 时间跳跃 → 拍数 → 预算。
 * 先到即折；返回 undefined 表示继续这场。
 */
export function foldReason(scene: Scene, now: NowInput): FoldReason | undefined {
  if (scene.participants.length === 0) return 'empty'
  if (now.place !== scene.place) return 'place'
  if (now.clock - scene.lastBeatAt >= FOLD_AFTER_MINUTES) return 'time'
  if (scene.beats >= FOLD_AFTER_BEATS) return 'beats'
  if (now.tokens >= FOLD_AFTER_TOKENS) return 'tokens'
  return undefined
}

export interface FoldMaterial {
  sceneId: string
  reason: FoldReason
  /** 每个参与者本场的末尾若干条上下文，交给调用方压成 1–2 条 experience */
  perEnt: Record<EntId, string[]>
  /** 本场是否有世界签名（有才允许写 self 条目） */
  signed: boolean
}

export function fold(scene: Scene, reason: FoldReason, keepLast = 2): FoldMaterial {
  const perEnt: Record<EntId, string[]> = {}
  for (const ent of scene.participants) {
    perEnt[ent] = (scene.context[ent] ?? []).slice(-keepLast)
  }
  return { sceneId: scene.id, reason, perEnt, signed: scene.signed }
}

/** 拼成一段可进 prompt 的现场文本；只读，不改场景。 */
export function contextOf(scene: Scene, ent: EntId): string {
  return (scene.context[ent] ?? []).join('\n')
}
