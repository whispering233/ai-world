/**
 * storylet 骨架池与填肉（探针用，不进 src/）。
 *
 * 两条硬约束来自 docs/research/storylet-probe.md：
 *   1. 条件只读账本，前因只认 `facts`（没有前因就不抽）；
 *   2. 骨架只产出一条 claim，写不写账本由裁判说了算。
 */
import type { Claim } from '../src/core/referee.ts'
import type { Llm } from '../src/core/llm.ts'
import { findAbsoluteTime } from '../src/core/narrate.ts'
import type { EntId, Fact, World } from '../src/core/world.ts'

/** 前因要比"刚刚发生"老一点，否则等于把同一拍的话又讲一遍。 */
export const MIN_CAUSE_AGE = 2

export interface Skeleton {
  id: string
  /** 账本里登记过的非人实体 */
  actor: EntId
  /** 账本状态：这件事现在有可能发生 */
  when: (w: World) => boolean
  /** 前因关键词：账本里得有提到这些词、且已过 `MIN_CAUSE_AGE` 拍的 fact */
  causeKeys: readonly string[]
  /** 骨架本身；正文由模型填 */
  template: string
}

export const SKELETONS: readonly Skeleton[] = [
  {
    id: 'lamp-dies',
    actor: 'lamp',
    when: (w) => w.ledger.phys['lamp']?.['lit'] === true,
    causeKeys: ['灯', '火', '灶'],
    template: '灶膛里爆出一粒火星，落在灯芯上，灯焰跳了两下，然后灭了。',
  },
  {
    id: 'door-blown',
    actor: 'door',
    when: (w) => w.ledger.phys['door']?.['closed'] === true,
    causeKeys: ['门', '雨', '风'],
    template: '风从门缝里挤进来，把没插紧的门闩顶开，门自己撞在墙上。',
  },
  {
    id: 'cellar-lifts',
    actor: 'cellar',
    when: (w) => w.ledger.phys['cellar']?.['open'] === false,
    causeKeys: ['地窖', '水', '账本', '柜台'],
    template: '地窖盖板被下面的水汽顶起一条缝，木边卡在半开的位置。',
  },
]

/** 前因：未被推翻、提到关键词、且已经过了至少 `MIN_CAUSE_AGE` 拍的 fact。 */
export function causesFor(world: World, keys: readonly string[]): Fact[] {
  return Object.values(world.facts)
    .filter((f) => f.supersededBy === undefined)
    .filter((f) => world.ledger.clock - f.at >= MIN_CAUSE_AGE)
    .filter((f) => keys.some((k) => f.text.includes(k)))
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
}

export interface Pick {
  skeleton: Skeleton
  causes: Fact[]
}

/** 池里第一个"状态够 + 有前因"的骨架；一个都没有就返回 undefined（本拍无世界事件）。 */
export function pickSkeleton(world: World): Pick | undefined {
  for (const skeleton of SKELETONS) {
    if (!skeleton.when(world)) continue
    const causes = causesFor(world, skeleton.causeKeys)
    if (causes.length === 0) continue
    return { skeleton, causes }
  }
  return undefined
}

export const FILL_SYSTEM = `你是世界事件的成文器。给你一条正在发生的事的骨架、它的前因（账本里已经确认过的事实）、以及现场。你把它写成 1 到 2 句中文。

规则：
1. 只写外部可见的发生：动作、声音、光、温度、东西的位置。
2. 不写任何人的心理、判断、意图、回忆；不替人做决定。
3. 不写具体时刻、日期或第几天，只能用相对说法。
4. 不写实体 id（ann / lamp / door 这类英文串），该指代就用中文。
5. 不引入前因和现场之外的任何前提：不新增没被提到的东西，不解释"为什么会这样"。
6. 只输出这 1 到 2 句，不要标题、不要解释。`

export function fillPrompt(sceneText: string, causes: readonly Fact[], skeleton: Skeleton): string {
  const causeText = causes.length === 0 ? '（无）' : causes.map((f) => `- ${f.text}`).join('\n')
  return `现场：${sceneText}\n\n前因：\n${causeText}\n\n发生的地方/东西：${skeleton.actor}\n骨架：${skeleton.template}`
}

export interface FillResult {
  text: string
  /** 只报告，不改写 */
  absoluteTime: string[]
  /** 正文里出现的实体 id */
  idLeaks: string[]
  chars: number
}

const ID_LEAK = /\b(player|ann|doc|cody|granny|lamp|door|cellar|streetlamp|silver-dollar|ledger-book|whiskey|morphine)\b/g

export function inspect(text: string): Omit<FillResult, 'text'> {
  return {
    absoluteTime: findAbsoluteTime(text),
    idLeaks: [...new Set(text.match(ID_LEAK) ?? [])],
    chars: Array.from(text).length,
  }
}

export async function fillEvent(llm: Llm, sceneText: string, causes: readonly Fact[], skeleton: Skeleton): Promise<FillResult> {
  const res = await llm.chat({
    role: 'narration',
    system: FILL_SYSTEM,
    messages: [{ role: 'user', content: fillPrompt(sceneText, causes, skeleton) }],
  })
  const text = res.text.trim()
  return { text, ...inspect(text) }
}

/** 抽卡计数：只给探针出报告用。 */
export interface DrawStats {
  attempts: number
  /** 有前因、被抽中 */
  picked: number
  pickedIds: string[]
}

let seq = 0

/** 抽卡源：只读账本；产出 claim，不写状态。 */
export function createStoryletSource(llm: Llm, sceneText: () => string, stats: DrawStats) {
  return {
    async draw(input: { world: World; clock: number }): Promise<Claim[]> {
      stats.attempts += 1
      const pick = pickSkeleton(input.world)
      if (!pick) return []
      stats.picked += 1
      stats.pickedIds.push(pick.skeleton.id)
      const filled = await fillEvent(llm, sceneText(), pick.causes, pick.skeleton)
      seq += 1
      return [{ id: `w${input.clock}-${seq}`, actor: pick.skeleton.actor, text: filled.text, kind: 'act' }]
    },
  }
}
