/**
 * 一拍：把九块零件串成一个闭环（见 docs/design/40-time-and-loop.md §3）。
 *
 * 收集 claim → 裁判 → 提交账本 → 分发观测 → 渲染 → 场景追加 → 折场检查 → 落 journal。
 * 这一层是唯一知道"顺序"的地方，下面每一块都保持纯函数或单一职责。
 */
import { calledActors, fmt } from './clock.ts'
import { remember, type Character } from './character.ts'
import type { Cognition } from './cognition.ts'
import type { Narrator } from './narrate.ts'
import { commit, type Claim, type Referee, type Verdict } from './referee.ts'
import { appendBeat, contextOf, fold, foldReason, type FoldMaterial, type Scene } from './scene.ts'
import type { Store } from './store.ts'
import type { EntId, World } from './world.ts'

export interface BeatDeps {
  referee: Referee
  narrator: Narrator
  cognition: Cognition
  store: Store
}

export interface BeatInput {
  world: World
  scene: Scene
  characters: Map<EntId, Character>
  player: EntId
  /** 场景的静态描述（装配时拼好的那一段） */
  sceneText: string
  canon: readonly string[]
  /** 玩家自由输入原文；为空表示玩家这拍不发言 */
  playerClaim?: string
  deps: BeatDeps
}

export interface BeatResult {
  world: World
  scene: Scene
  characters: Map<EntId, Character>
  passage: string
  journalSeq: number
  folded?: FoldMaterial
  notes: string[]
}

/** shortcut: 上下文 token 用字符数估算，等 W14 拿到真实 usage 再换成实测值 */
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
  for (const ent of called) {
    if (ent === input.player) continue
    const ch = characters.get(ent)
    if (!ch) continue
    const sceneText = [input.sceneText, contextOf(input.scene, ent)].filter(Boolean).join('\n')
    const res = await deps.cognition.think({ character: ch, sceneText, canon: [...input.canon], now: clock })
    claims.push({ id: `${ent}${clock}`, actor: ent, text: res.output.outward, kind: 'act' })
    let next = ch
    for (const e of res.experience) next = remember(next, e)
    if (res.output.selfChange) next = remember(next, { t: clock, kind: 'thought', text: res.output.selfChange, w: 2 })
    characters.set(ent, next)
  }

  if (claims.length === 0) {
    return { world: input.world, scene: input.scene, characters, passage: '', journalSeq: 0, notes: ['没有主张，本拍未发生'] }
  }

  const out = await deps.referee.judge({ clock, claims, context: [input.sceneText, contextOf(input.scene, input.player)].filter(Boolean).join('\n') })
  // 先把时钟推到本拍结束，再提交：否则 learn 建出的 fact.at 会落后于重放时的值，回放就不相等了
  const clockAfter = clock + maxDuration(out.verdicts)
  const at = { ...input.world, ledger: { ...input.world.ledger, clock: clockAfter } }
  const { world, applied } = commit(at, out)
  const notes = applied.flatMap((a) => a.results.filter((r) => !r.ok).map((r) => `${a.claimId}: ${r.why ?? 'op 失败'}`))

  const seen = distribute(out.observations, out.verdicts, characters, clock)
  for (const [ent, ch] of seen) characters.set(ent, ch)
  applyDriveHits(characters, out.driveHits)

  const narratorEvents = claims.map((c) => {
    const v = out.verdicts.find((x) => x.claimId === c.id)
    return { actor: c.actor, text: c.text, outcome: describe(v) }
  })
  const narration = await deps.narrator.narrate({ clockBefore: clock, clockAfter, sceneText: input.sceneText, events: narratorEvents })
  deps.store.appendPassage({ clock: clockAfter, text: narration.text, source: 'narrator' })

  const texts: Record<EntId, string> = {}
  for (const e of narratorEvents) texts[e.actor] = `${e.actor}：${e.text} → ${e.outcome}`
  const scene = appendBeat(input.scene, {
    clock: clockAfter,
    tokens: estimateTokens([input.sceneText, narration.text].join('\n')),
    texts,
    signed: out.verdicts.some(isSigned),
  })
  const entry = deps.store.appendBeat({
    type: 'beat',
    scene: scene.id,
    clock: clockAfter,
    claims,
    order: out.order,
    verdicts: out.verdicts,
    observations: out.observations,
    driveHits: out.driveHits,
  })

  const result: BeatResult = {
    world,
    scene,
    characters,
    passage: narration.text,
    journalSeq: entry.seq,
    notes: [...notes, ...narration.absoluteTime.map((t) => `叙述里出现绝对时间：${t}`)],
  }

  const reason = foldReason(scene, { place: result.world.ledger.at[input.player] ?? scene.place, clock: clockAfter, tokens: scene.tokens })
  if (reason) {
    deps.store.appendBeat({ type: 'scene/fold', scene: scene.id, clock: clockAfter, claims: [], order: [], verdicts: [], observations: {}, driveHits: [] })
    result.folded = fold(scene, reason)
    result.notes.push(`折场：${reason}`)
  }
  return result
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
): Map<EntId, Character> {
  const next = new Map<EntId, Character>()
  for (const [ent, obs] of Object.entries(observations)) {
    const ch = characters.get(ent)
    if (!ch || obs.summary === '') continue
    next.set(ent, remember(ch, { t: clock, kind: 'seen', text: obs.summary, w: 2 }))
  }
  // 失败的理由要回到当事人身上，这是"约束由后果施加"的落点
  for (const v of verdicts) {
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
    if (!ch) continue
    const drives = ch.drives.map((d) => (d.id === hit.driveId ? { ...d, heat: clamp01(d.heat + hit.delta) } : d))
    characters.set(hit.ent, { ...ch, drives })
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function describe(v: Verdict | undefined): string {
  if (!v) return '未被裁决'
  if (!v.ok) return `被拒绝了：${v.reason ?? '没有给出理由'}`
  if (v.deltas.length === 0) return '说了，但没有改变什么'
  return `成立（${v.deltas.map((d) => d.op).join('/')}），耗时 ${v.duration} 分钟`
}

export { fmt }
