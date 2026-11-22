/**
 * 一拍：把九块零件串成一个闭环（见 docs/design/40-time-and-loop.md §3）。
 *
 * 收集 claim → 裁判 → 提交账本 → 分发观测 → 渲染 → 场景追加 → 折场检查 → 落 journal。
 * 这一层是唯一知道"顺序"的地方，下面每一块都保持纯函数或单一职责。
 */
import { calledActors, fmt } from './clock.ts'
import { applyDriveHit, remember, type Character, type Experience } from './character.ts'
import type { Cognition } from './cognition.ts'
import { fallbackPassage, type Narrator } from './narrate.ts'
import { commit, type Claim, type Referee, type Verdict } from './referee.ts'
import { appendBeat, contextOf, fold, foldReason, type FoldMaterial, type Scene } from './scene.ts'
import type { BeatTelemetry, Store } from './store.ts'
import type { EntId, World } from './world.ts'

export interface BeatDeps {
  referee: Referee
  narrator: Narrator
  cognition: Cognition
  store: Store
}

export interface ClaimDrawInput {
  /** 只读：抽卡层拿不到写入口 */
  world: World
  clock: number
  present: readonly EntId[]
  /** 本拍已收集的主张（玩家 + 人物） */
  claims: readonly Claim[]
}

/** 第三来源：世界事件。无因返回空数组；产出的仍是 claim，仍由裁判裁决。 */
export interface ClaimSource {
  draw(input: ClaimDrawInput): Claim[] | Promise<Claim[]>
}

export interface BeatInput {
  world: World
  scene: Scene
  characters: Map<EntId, Character>
  player: EntId
  /** 场景的静态描述（装配时拼好的那一段） */
  sceneText: string
  canon: readonly string[]
  /** 人物显示名：id → 名字；缺省时正文/prompt 回退 id */
  names?: Record<EntId, string>
  /** 物品显示名：id → 名字；缺省时正文/prompt 回退 id */
  items?: Record<string, string>
  /** 额外检索词：id → 别名；只用于事实切片的“提到谁”匹配 */
  aliases?: Record<EntId, string[]>
  /** 玩家自由输入原文；为空表示玩家这拍不发言 */
  playerClaim?: string
  /** 世界事件来源（storylet 抽卡）：可选，缺省时一拍只有玩家与人物 */
  claimSource?: ClaimSource
  /**
   * 运行观测：调用方传入一个**会被持续填充的可变对象**。
   * runBeat 只在 appendBeat 时读它，不深拷贝；本拍没落 journal 就不会被写出去。
   */
  telemetry?: BeatTelemetry
  deps: BeatDeps
}

export interface BeatResult {
  world: World
  scene: Scene
  characters: Map<EntId, Character>
  passage: string
  journalSeq: number
  /** 本拍所有 op 都通过、真正落账的 claim id */
  committedClaims: string[]
  folded?: FoldMaterial
  notes: string[]
}

/** shortcut: token 按字符数估算——供应商报回的 input 数不稳定（同一 prompt 实测 25~1433） */
export function estimateTokens(text: string): number {
  return Math.ceil(Array.from(text).length * 0.9)
}

export async function runBeat(input: BeatInput): Promise<BeatResult> {
  const { deps } = input
  const clock = input.world.ledger.clock
  const characters = new Map(input.characters)

  const present = Object.entries(input.world.ledger.at)
    .filter(([, place]) => place === input.scene.place)
    .map(([ent]) => ent)
  // 新走进来的人从下一场开始参与，本场只认原班人马
  const inScene = input.scene.participants.filter((ent) => present.includes(ent))
  const heat: Record<EntId, number[]> = {}
  for (const ent of inScene) heat[ent] = (characters.get(ent)?.drives ?? []).map((d) => d.heat)

  const called = calledActors({ present: inScene, heat, touched: [], player: input.player })

  const claims: Claim[] = []
  if (input.playerClaim) {
    claims.push({ id: `p${clock}`, actor: input.player, text: input.playerClaim, kind: 'act' })
  }
  // 人物本拍要能看见玩家刚说的话/做的事；只给公开输入，不给玩家的私有状态。
  const playerLine = input.playerClaim ? `玩家刚才说/做：${input.playerClaim}` : ''
  const sceneFor = (ent: EntId): string =>
    [input.sceneText, playerLine, describeLedger(input.world, inScene, { names: input.names, items: input.items, aliases: input.aliases }), contextOf(input.scene, ent)]
      .filter(Boolean)
      .join('\n')
  // 同一拍内多个 actor 的认知互不依赖：并发跑，但按人位顺序落 claims（结算顺序仍由裁判给）。
  const thinkers: { ent: EntId; ch: Character }[] = []
  for (const ent of called) {
    if (ent === input.player) continue
    const ch = characters.get(ent)
    if (ch) thinkers.push({ ent, ch })
  }
  const thoughts = await Promise.all(
    thinkers.map(async ({ ent, ch }) => {
      try {
        const res = await deps.cognition.think({
          character: ch,
          sceneText: sceneFor(ent),
          canon: [...input.canon],
          now: clock,
          ...(input.names ? { names: input.names } : {}),
        })
        return { ok: true as const, ent, ch, res }
      } catch (error) {
        // 一个人物调用失败不该毁掉整拍：它这一拍就是没开口，其余人照常结算。
        return { ok: false as const, ent, reason: (error as Error).message }
      }
    }),
  )
  const degraded: string[] = []
  for (const t of thoughts) {
    if (!t.ok) {
      degraded.push(`认知失败（本拍沉默）：${t.ent}：${t.reason}`)
      continue
    }
    claims.push({ id: `${t.ent}${clock}`, actor: t.ent, text: t.res.output.outward, kind: 'act' })
    let next = t.ch
    for (const e of t.res.experience) next = remember(next, e)
    if (t.res.output.selfChange) next = remember(next, { t: clock, kind: 'thought', text: t.res.output.selfChange, w: 2 })
    characters.set(t.ent, next)
  }

  if (input.claimSource) {
    try {
      const drawn = await input.claimSource.draw({ world: input.world, clock, present: inScene, claims })
      claims.push(...drawn)
    } catch (error) {
      // 抄不到世界事件不该毁掉整拍：本拍就是没有世界事件。
      degraded.push(`抽卡失败（本拍无世界事件）：${(error as Error).message}`)
    }
  }

  if (claims.length === 0) {
    // 未落 journal 的拍不推进记忆：否则重启后记忆会比 journal 多一条。
    return { world: input.world, scene: input.scene, characters: input.characters, passage: '', journalSeq: 0, committedClaims: [], notes: [...degraded, '没有主张，本拍未发生'] }
  }

  let out
  try {
    out = await deps.referee.judge({
      clock,
      claims,
      context: [input.sceneText, describeLedger(input.world, present, { names: input.names, items: input.items, aliases: input.aliases, withIds: true }), contextOf(input.scene, input.player)]
        .filter(Boolean)
        .join('\n'),
    })
  } catch (error) {
    // 裁判挂了 = 这一拍没有任何事被确认发生。宁可整拍空转，也不编一个没结算过的世界。
    return {
      world: input.world,
      scene: input.scene,
      characters: input.characters,
      passage: '',
      journalSeq: 0,
      committedClaims: [],
      notes: [...degraded, `裁决失败（本拍无进展）：${(error as Error).message}`],
    }
  }
  // 先 dry run 找出真正会提交的 claim：被拒绝或整条回滚的 claim 不推进 clock。
  // 再用 clockAfter 做真实 commit，保证本拍新建 fact 的 at 落在结束时刻，replay 仍相等。
  const dry = commit(input.world, out)
  const committedIds = new Set(dry.applied.filter((a) => a.committed).map((a) => a.claimId))
  const clockAfter = clock + maxDuration(out.verdicts.filter((v) => committedIds.has(v.claimId)))
  const at = { ...input.world, ledger: { ...input.world.ledger, clock: clockAfter } }
  const { world, applied } = commit(at, out)
  const notes = applied.flatMap((a) => a.results.filter((r) => !r.ok).map((r) => `${a.claimId}: ${r.why ?? 'op 失败'}`))

  // 整条裁决被回滚时，当事人记住的是"没成"，不是"我成功了"
  const rolledBack = new Map(applied.filter((a) => !a.committed).map((a) => [a.claimId, a.results]))
  const seen = distribute(out.observations, out.verdicts, characters, clock, rolledBack)
  for (const [ent, ch] of seen) characters.set(ent, ch)
  applyDriveHits(characters, out.driveHits)

  const narratorEvents = claims.map((c) => {
    const v = out.verdicts.find((x) => x.claimId === c.id)
    return { actor: c.actor, name: input.names?.[c.actor] ?? c.actor, text: c.text, outcome: describe(v) }
  })

  let passage = ''
  let narrationFailed = false
  const narrationNotes: string[] = []
  try {
    const narration = await deps.narrator.narrate({ clockBefore: clock, clockAfter, sceneText: input.sceneText, events: narratorEvents })
    passage = narration.text
    // 空文本和抛错同样是“没有旁白”：不能把空 passage 当成正常结果落盘。
    if (passage.trim() === '') throw new Error('旁白为空')
    narrationNotes.push(...narration.absoluteTime.map((t) => `叙述里出现绝对时间：${t}`))
  } catch (error) {
    narrationFailed = true
    passage = fallbackPassage(narratorEvents)
    narrationNotes.push(`旁白失败（事实摘要兜底）：${(error as Error).message}`)
  }

  const texts: Record<EntId, string> = {}
  for (const e of narratorEvents) texts[e.actor] = `${e.actor}：${e.text} → ${e.outcome}`
  // appendBeat 会把 lastBeatAt 推到本拍结束；判断“本拍是否时间跳跃”必须用上一拍结束时刻。
  const previousLastBeatAt = input.scene.lastBeatAt
  const scene = appendBeat(input.scene, {
    clock: clockAfter,
    tokens: estimateTokens([input.sceneText, passage].join('\n')),
    texts,
    signed: out.verdicts.some(isSigned),
  })
  // 本拍新增的记忆条目：人物状态不进账本，但必须进 journal，否则进程一停记忆就没了。
  const newExperience: Record<EntId, Experience[]> = {}
  for (const [ent, ch] of characters) {
    const before = input.characters.get(ent)?.experience.length ?? 0
    const fresh = ch.experience.slice(before)
    if (fresh.length > 0) newExperience[ent] = fresh
  }
  // journal 是账本的凭据；先落 journal，再落派生的 passage。
  const entry = deps.store.appendBeat({
    type: 'beat',
    scene: scene.id,
    clock: clockAfter,
    claims,
    order: out.order,
    verdicts: out.verdicts,
    observations: out.observations,
    driveHits: out.driveHits,
    // 落账名单：verdicts 是裁判原话，可能含 ok 但整条回滚的条目
    committed: [...committedIds],
    ...(Object.keys(newExperience).length > 0 ? { experience: newExperience } : {}),
    ...(input.telemetry && Object.keys(input.telemetry.usage).length > 0 ? { telemetry: input.telemetry } : {}),
  })
  try {
    deps.store.appendPassage({
      clock: clockAfter,
      text: passage,
      source: narrationFailed ? 'fallback' : 'narrator',
      beatSeq: entry.seq,
    })
  } catch (error) {
    // passage 是派生文本；写失败不能反过来抹掉已经落盘的 journal。
    narrationNotes.push(`passage 写入失败（journal 已落）：${(error as Error).message}`)
  }

  const result: BeatResult = {
    world,
    scene,
    characters,
    passage,
    journalSeq: entry.seq,
    committedClaims: applied.filter((a) => a.committed).map((a) => a.claimId),
    notes: [...degraded, ...notes, ...narrationNotes],
  }

  const reason = foldReason({ ...scene, lastBeatAt: previousLastBeatAt }, { place: result.world.ledger.at[input.player] ?? scene.place, clock: clockAfter, tokens: scene.tokens })
  if (reason) {
    deps.store.appendBeat({ type: 'scene/fold', scene: scene.id, clock: clockAfter, claims: [], order: [], verdicts: [], observations: {}, driveHits: [] })
    result.folded = fold(scene, reason)
    result.notes.push(`折场：${reason}`)
  }
  return result
}

export interface LedgerView {
  names?: Record<EntId, string>
  items?: Record<string, string>
  aliases?: Record<EntId, string[]>
  /** 裁判视角：实体与物品名后面补 `(id)`，方便它写 op 参数 */
  withIds?: boolean
}

/** shortcut: 只给“在场者的持有物 + 地点表”，不做相关实体剪枝；实体多了再按场景切片 */
export function describeLedger(world: World, present: readonly EntId[], view: LedgerView = {}): string {
  const label = (id: string): string => (view.withIds ? `${view.names?.[id] ?? id}(${id})` : (view.names?.[id] ?? id))
  const itemLabel = (id: string): string => (view.withIds ? `${view.items?.[id] ?? id}(${id})` : (view.items?.[id] ?? id))
  const places = Object.entries(world.places).map(([id, name]) => `${name}(${id})`).join('、')
  const rows = present.map((ent) => {
    const place = world.ledger.at[ent] ?? '未知'
    const bag = Object.entries(world.ledger.holds[ent] ?? {}).map(([item, n]) => `${itemLabel(item)}×${n}`).join('、') || '空手'
    const phys = Object.entries(world.ledger.phys[ent] ?? {}).map(([k, v]) => `${k}=${String(v)}`).join('、')
    return `- ${label(ent)}：在 ${world.places[place] ?? place}；持有 ${bag}${phys === '' ? '' : `；${phys}`}`
  })
  const events = describeFacts(world, present, world.ledger.clock, view.names, view.aliases)
  return `已知地点：${places}\n账本现状：\n${rows.join('\n')}${events === '' ? '' : `\n最近发生过的事：\n${events}`}`
}

/** 事件流给裁判的条数上限：太多会挤掉现场，太少会让早期后果静默消失。 */
export const FACT_BUDGET = 12

/**
 * 挑出要喂给裁判的事件：被推翻的不喂；提到在场者的、刚发生的优先；
 * 名额之外按时间倒序补齐，最后按时间正序排出——读起来像一条时间线。
 */
export function describeFacts(
  world: World,
  present: readonly EntId[],
  clock: number,
  names?: Record<EntId, string>,
  aliases?: Record<EntId, string[]>,
): string {
  // 事实文本是裁判用显示名写的（“安说…”），不是 id（ann）；只匹配 id 会让 +2 永远不命中。
  const mentionTokens = present.flatMap((ent) => [ent, names?.[ent] ?? ent, ...(aliases?.[ent] ?? [])])
  const weight = (fact: { text: string; at: number; actor?: EntId }): number => {
    const actorPresent = fact.actor !== undefined && present.includes(fact.actor)
    const textMatch = mentionTokens.some((token) => token !== '' && fact.text.includes(token))
    return (actorPresent || textMatch ? 2 : 0) + (clock - fact.at <= 10 ? 1 : 0)
  }
  return Object.values(world.facts)
    .filter((f) => f.supersededBy === undefined)
    .map((f) => ({ f, w: weight(f) }))
    .sort((a, b) => b.w - a.w || b.f.at - a.f.at)
    .slice(0, FACT_BUDGET)
    .sort((a, b) => a.f.at - b.f.at)
    .map(({ f }) => `- ${f.text}`)
    .join('\n')
}

/** 一拍的时长 = 本拍最长的那个动作；没有动作就不推进时间。 */
function maxDuration(verdicts: readonly Verdict[]): number {
  return verdicts.reduce((max, v) => Math.max(max, v.duration), 0)
}

/**
 * 世界签名（docs/design/40-time-and-loop.md §7）：
 * 账本变了、被拒绝了、或者时间流了一大截——三者之一才算这一拍真的发生过什么。
 */
function isSigned(v: Verdict): boolean {
  if (!v.ok) return true
  if (v.deltas.length > 0) return true
  return v.duration >= 240
}

/** 谁的观测写谁的记忆：他不在场就看不到这一句（docs/design/20-referee.md §2）。 */
function distribute(
  observations: Record<EntId, { claimIds: string[]; summary: string }>,
  verdicts: readonly Verdict[],
  characters: Map<EntId, Character>,
  clock: number,
  rolledBack: Map<string, { ok: boolean; why?: string }[]>,
): Map<EntId, Character> {
  const next = new Map<EntId, Character>()
  for (const [ent, obs] of Object.entries(observations)) {
    const ch = characters.get(ent)
    if (!ch || obs.summary === '') continue
    next.set(ent, remember(ch, { t: clock, kind: 'seen', text: obs.summary, w: 2 }))
  }
  // 失败的理由要回到当事人身上，这是"约束由后果施加"的落点
  for (const v of verdicts) {
    if (v.ok && rolledBack.has(v.claimId)) {
      const why = (rolledBack.get(v.claimId) ?? []).find((r) => !r.ok)?.why ?? '没成'
      const ch = next.get(v.actor) ?? characters.get(v.actor)
      if (ch) next.set(v.actor, remember(ch, { t: clock, kind: 'seen', text: `我的举动没成：${why}`, w: 2 }))
      continue
    }
    if (v.ok || !v.reason) continue
    const ch = next.get(v.actor) ?? characters.get(v.actor)
    if (!ch) continue
    next.set(v.actor, remember(ch, { t: clock, kind: 'seen', text: `我的举动失败了：${v.reason}`, w: 2 }))
  }
  return next
}

function applyDriveHits(
  characters: Map<EntId, Character>,
  hits: readonly { ent: EntId; driveId: string; delta: number }[],
): void {
  for (const hit of hits) {
    const ch = characters.get(hit.ent)
    if (ch) characters.set(hit.ent, applyDriveHit(ch, hit))
  }
}

function describe(v: Verdict | undefined): string {
  if (!v) return '未被裁决'
  if (!v.ok) return `被拒绝了：${v.reason ?? '没有给出理由'}`
  if (v.deltas.length === 0) return '说了，但没有改变什么'
  return `成立（${v.deltas.map((d) => d.op).join('/')}），耗时 ${v.duration} 分钟`
}

export { fmt }
