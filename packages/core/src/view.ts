/**
 * 两个只读投影：内存态 → 玩家视图 / 作者视图（docs/design/60-server.md §6）。
 *
 * 「玩家看不到引擎语义」的唯一实现点在这里：玩家投影只出显示名与可验证状态，
 * 作者投影原值全量。两个函数都不读文件、不调模型、不写任何状态。
 */

import type {
  AuthorCharacterView,
  AuthorSessionView,
  BeatView,
  ContentStatusView,
  HealthView,
  ModelRoleName,
  PlayerStateView,
  PromptCallView,
  SessionView,
  UsageView,
} from '@ai-world/shared'
import type { Character } from './character.ts'
import { fmt } from './clock.ts'
import type { JournalEntry, PassageEntry } from './store.ts'
import type { EntId, Fact, World } from './world.ts'

/* ── 玩家投影 ─────────────────────────────────────────── */

export interface PlayerViewInput {
  title: string
  /** 首屏散文：空串与缺失同义，都不透出 */
  opening?: string
  /** 玩家是谁：place / here / holds / knows 与 beat 里的玩家原话都按它取 */
  player: EntId
  /**
   * 人物白名单：`here` 只列这些人。
   * `ledger.at` 里还有灯、门、地窖门这类实体（它们的 `phys` 键要用），它们不是“在场的人”。
   */
  people: ReadonlySet<EntId>
  world: World
  names: Record<EntId, string>
  items: Record<string, string>
  journal: readonly JournalEntry[]
  passages: readonly PassageEntry[]
  inFlight: boolean
}

export function playerView(input: PlayerViewInput): SessionView {
  const clock = input.world.ledger.clock
  const opening = input.opening === undefined || input.opening.trim() === '' ? undefined : input.opening
  return {
    title: input.title,
    ...(opening === undefined ? {} : { opening }),
    clock,
    clockText: fmt(clock),
    state: playerState(input),
    beats: beatViews({ journal: input.journal, passages: input.passages, player: input.player, names: input.names }),
    inFlight: input.inFlight,
  }
}

function playerState(input: PlayerViewInput): PlayerStateView {
  const { world, names, items, player, people } = input
  const atPlace = world.ledger.at[player]
  // 玩家不在任何地点是数据错，但投影崩掉比显示空更糟
  const place = atPlace === undefined ? '' : (world.places[atPlace] ?? atPlace)
  // 在场者口径：内容包里的人物 ∩ 玩家当前地点，且排除玩家自己。
  // 动作提示器 / 聚焦候选集 / 场景描述各用别的口径，为什么不同见 docs/design/60-server.md §6。
  const here =
    atPlace === undefined
      ? []
      : Object.entries(world.ledger.at)
          .filter(([ent, p]) => p === atPlace && ent !== player && people.has(ent))
          .map(([ent]) => names[ent] ?? ent)
  const holds = Object.entries(world.ledger.holds[player] ?? {})
    .filter(([, n]) => n > 0)
    .map(([item, n]) => ({ name: items[item] ?? item, count: n }))
  // 找不到的 fact id 直接跳过：旧 journal 引用已删事实时不该让整页崩
  const knows = (world.ledger.knows[player] ?? [])
    .map((id) => world.facts[id])
    .filter((fact): fact is Fact => fact !== undefined)
    .sort((a, b) => a.at - b.at)
    .map((fact) => ({
      text: fact.text,
      clockText: fmt(fact.at),
      superseded: fact.supersededBy !== undefined,
    }))
  return { place, here, holds, knows }
}

/* ── Beat 连接 ────────────────────────────────────────── */

export interface BeatJoinInput {
  journal: readonly JournalEntry[]
  passages: readonly PassageEntry[]
  player: EntId
  /**
   * 人物显示名：id → 名字；`playerTo` 只出显示名，缺这一份就整个省略。
   * 绝不回退成实体 id：客户端不持有 id。
   */
  names?: Record<EntId, string>
}

export function beatViews(input: BeatJoinInput): BeatView[] {
  const { passages, player } = input
  const beats = input.journal.filter((e) => e.type === 'beat').sort((a, b) => a.seq - b.seq)

  // 旧 passage 没有 beatSeq：指针只按 clock 前进，同 clock 的多拍按落盘顺序各取一条
  let cursor = 0
  const byClock = (clock: number): PassageEntry | undefined => {
    let found = passages[cursor]
    while (found !== undefined && found.clock < clock) {
      cursor++
      found = passages[cursor]
    }
    if (found === undefined || found.clock !== clock) return undefined
    cursor++
    return found
  }

  const views: BeatView[] = []
  for (const entry of beats) {
    const passage = passages.find((p) => beatSeq(p) === entry.seq) ?? byClock(entry.clock)
    const line = entry.claims.find((c) => c.actor === player)
    const view: BeatView = {
      seq: entry.seq,
      clock: entry.clock,
      clockText: fmt(entry.clock),
      fallback: passage?.source === 'fallback',
    }
    if (line !== undefined) {
      view.player = line.text
      const to = line.to === undefined ? undefined : input.names?.[line.to]
      if (to !== undefined) view.playerTo = to
    }
    if (passage !== undefined) view.passage = passage.text
    if (passage?.hints !== undefined) view.hints = passage.hints
    views.push(view)
  }
  return views
}

/** `PassageEntry.beatSeq` 是稳定连接键；旧日志没有这个字段，只能按 clock 回退。 */
function beatSeq(passage: PassageEntry): number | undefined {
  return (passage as PassageEntry & { beatSeq?: number }).beatSeq
}

/* ── 作者投影 ─────────────────────────────────────────── */

export interface AuthorViewInput {
  title: string
  world: World
  characters: ReadonlyMap<EntId, Character>
  names: Record<EntId, string>
  journal: readonly JournalEntry[]
  content: ContentStatusView
  usage: Record<ModelRoleName, UsageView>
  health: HealthView
  prompts: readonly { seq: number; calls: PromptCallView[] }[]
}

export function authorView(input: AuthorViewInput): AuthorSessionView {
  const clock = input.world.ledger.clock
  return {
    title: input.title,
    clock,
    clockText: fmt(clock),
    content: input.content,
    world: { ...input.world },
    characters: [...input.characters.values()].map((ch) => characterView(ch, input.names)),
    journal: input.journal.map((entry) => ({ ...entry })),
    usage: input.usage,
    health: input.health,
    prompts: [...input.prompts],
  }
}

function characterView(ch: Character, names: Record<EntId, string>): AuthorCharacterView {
  return {
    id: ch.id,
    name: names[ch.id] ?? ch.id,
    core: ch.core,
    voice: ch.voice,
    drives: ch.drives,
    beliefs: ch.beliefs,
    experienceCount: ch.experience.length,
  }
}
