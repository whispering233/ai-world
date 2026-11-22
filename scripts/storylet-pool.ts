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
  /** ambient = 环境（前因读世界常态）；consequence = 后果（前因读 facts） */
  tier: 'ambient' | 'consequence'
  /** 账本状态：这件事现在有可能发生 */
  when: (w: World) => boolean
  /** ambient 层：世界常态必须逐键相等；缺键就不抽，不静默当成满足 */
  needs?: Record<string, string | number | boolean>
  /** consequence 层：前因关键词，必须在 `facts` 里且已过 `MIN_CAUSE_AGE` 拍 */
  causeKeys?: readonly string[]
  /** 本拍已有人提到这些词时避让：不去顶掉玩家/人物的动作 */
  avoidKeys?: readonly string[]
  /** 骨架本身；正文由模型填 */
  template: string
}

export const SKELETONS: readonly Skeleton[] = [
  {
    id: 'door-blown',
    actor: 'door',
    tier: 'ambient',
    when: (w) => w.ledger.phys['door']?.['closed'] === true,
    needs: { weather: 'storm' },
    avoidKeys: ['门'],
    template: '风从门缝里挤进来，把没插紧的门闩顶开，门自己撞在墙上。',
  },
  {
    id: 'lamp-dies',
    actor: 'lamp',
    // 门开了才有穿堂风；这一条把“风”写成账本能验证的链
    tier: 'ambient',
    when: (w) => w.ledger.phys['door']?.['closed'] === false && w.ledger.phys['lamp']?.['lit'] === true,
    needs: { weather: 'storm' },
    avoidKeys: ['灯'],
    template: '穿堂风把灯焰压得只剩一线，晃了两下，灭了。',
  },
  {
    id: 'door-splinter',
    actor: 'door',
    tier: 'consequence',
    when: (w) => w.ledger.phys['door']?.['broken'] === false,
    causeKeys: ['门', '撞', '推'],
    avoidKeys: ['门'],
    template: '门轴的木销吃不住，门板歪了半寸，闩孔对不上了。',
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

/** 同一张牌打过了就得凉一会儿，否则条件一直成立，每拍都重抽同一张。 */
export const COOLDOWN_BEATS = 6

/** ambient 层的前因：世界常态逐键相等。缺键 = 不满足，不是“默认通过”。 */
function ambientOk(world: World, needs: Record<string, string | number | boolean> | undefined): boolean {
  if (!needs || Object.keys(needs).length === 0) return true
  const ambient = world.ambient
  if (!ambient) return false
  return Object.entries(needs).every(([key, want]) => ambient[key] === want)
}

/** 本拍已经有主张提到目标对象时，这张牌让路；不跟玩家抢动作。 */
function avoided(skeleton: Skeleton, claims: readonly { text: string }[]): boolean {
  const keys = skeleton.avoidKeys
  if (!keys || keys.length === 0) return false
  return keys.some((key) => claims.some((claim) => claim.text.includes(key)))
}

/** 池里第一个“状态够 + 前因成立 + 不在冷却 + 没人碰”的骨架；一个都没有就返回 undefined。 */
export function pickSkeleton(
  world: World,
  drawnAt: ReadonlyMap<string, number>,
  claims: readonly { text: string }[] = [],
): Pick | undefined {
  for (const skeleton of SKELETONS) {
    if (!skeleton.when(world)) continue
    const last = drawnAt.get(skeleton.id)
    if (last !== undefined && world.ledger.clock - last < COOLDOWN_BEATS) continue
    if (avoided(skeleton, claims)) continue
    if (skeleton.tier === 'ambient') {
      if (!ambientOk(world, skeleton.needs)) continue
      return { skeleton, causes: [] }
    }
    const causes = causesFor(world, skeleton.causeKeys ?? [])
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

/** 抽卡源：只读账本，产出一条 claim，不写状态、不调模型（模板文本）。 */
export function createStoryletSource(stats: DrawStats) {
  const drawnAt = new Map<string, number>()
  return {
    draw(input: { world: World; clock: number; claims: readonly { text: string }[] }): Claim[] {
      stats.attempts += 1
      const pick = pickSkeleton(input.world, drawnAt, input.claims)
      if (!pick) return []
      drawnAt.set(pick.skeleton.id, input.clock)
      stats.picked += 1
      stats.pickedIds.push(pick.skeleton.id)
      return [{ id: `w${input.clock}-${pick.skeleton.id}`, actor: pick.skeleton.actor, text: pick.skeleton.template, kind: 'act' }]
    },
  }
}
