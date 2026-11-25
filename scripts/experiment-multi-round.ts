/**
 * 多 agent 交叉对话实验（一次性驱动脚本，不属于生产路径）。
 *
 * 三臂：
 *   baseline   = 当前一拍：每个被叫到的人物一次认知调用，然后裁判结算。
 *   self-retry = 控制臂：同样两次调用，但第二轮只看自己的草稿，看不到别人。
 *   cross-talk = 第一轮各自出草稿，第二轮看见其他人的公开草稿后再出最终一句；仍是每人一条 claim。
 *
 * 只把 `outward` 放进第二轮，`inner` 永远不跨人。裁判仍是唯一写入口。
 *
 * 用法：
 *   node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types \
 *     scripts/experiment-multi-round.ts --beats 6 --mode both --tag pilot-1
 *
 * 产物：data/experiment/<tag>/<arm>/{journal.jsonl,passage.jsonl,metrics.jsonl,report.md}
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { estimateTokens, runBeat } from '@ai-world/core'
import { applyDriveHit, remember, type Character, type Experience } from '@ai-world/core'
import { calledActors, fmt } from '@ai-world/core'
import { createCognition, type Cognition, type CognitionOutput } from '@ai-world/core'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '@ai-world/core'
import { createLlm, type ModelRole, type UsageSample } from '@ai-world/core'
import { createNarrator, type NarrationEvent, type Narrator } from '@ai-world/core'
import { readonlyPiCredentials } from '@ai-world/core'
import {
  commit,
  createLlmReferee,
  type Claim,
  type Referee,
  type RefereeOutput,
  type Verdict,
} from '@ai-world/core'
import { appendBeat, contextOf, fold, foldReason, openScene, type FoldMaterial, type Scene } from '@ai-world/core'
import { openStore, type Store } from '@ai-world/core'
import { describeFacts, type LedgerView } from '@ai-world/core'
import { seedCharacters } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from '@ai-world/content'
import type { EntId, World } from '@ai-world/core'

const { pack } = loadContentPack(STARTER_TOWN_PATH)

type Arm = 'baseline' | 'self-retry' | 'cross-talk'

interface UsageTotals {
  calls: number
  input: number
  output: number
  ms: number
  retries: number
}

interface BeatMetrics {
  arm: Arm
  beat: number
  clockBefore: number
  clockAfter: number
  wallMs: number
  usage: Record<ModelRole, UsageTotals>
  claims: number
  npcClaims: number
  verdicts: number
  no: number
  ok: number
  empty: number
  long: number
  ops: Record<string, number>
  failedOps: number
  hardConflicts: number
  doubleSpend: number
  moveConflicts: number
  physConflicts: number
  crossTalkCalls: number
  crossTalkChanged: number
  crossTalkRefs: number
  crossTalkEcho: number
  passageChars: number
  newFacts: string[]
}

interface ArmResult {
  world: World
  scene: Scene
  characters: Map<EntId, Character>
  passage: string
  journalSeq: number
  folded?: FoldMaterial
  notes: string[]
  claims: Claim[]
  verdicts: Verdict[]
  crossTalkCalls: number
  crossTalkChanged: number
  crossTalkRefs: number
  crossTalkEcho: number
}

interface BeatSample {
  beat: number
  clock: number
  passage: string
  npc: { actor: EntId; text: string }[]
}

type Thought = { ok: true; ent: EntId; ch: Character; res: { output: CognitionOutput; experience: Experience[] } }

const AUTO_LINES = [
  '我推门进去，找了个靠门的位子坐下。',
  '我问老板娘还有没有酒。',
  '我把那本账本推到柜台中间。',
  '我问医生这镇上最近死了几个人。',
  '我说我想在这儿找份活干。',
  '我把两枚银元放在柜台上，说要一瓶威士忌。',
  '我问格蕾妮地窖里有什么。',
  '我走到门口，把门闩拉开一半。',
  '我对科迪说，欠账的事我可以替他谈。',
  '我压低声音问医生，吗啡还剩几支。',
]

const ALIASES: Record<string, string[]> = {
  ann: ['安', '老板娘'],
  doc: ['医生', '道森'],
  cody: ['科迪'],
  granny: ['格蕾妮'],
  player: ['你'],
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  return value && !value.startsWith('--') ? value : fallback
}

const BEATS = Math.max(1, Math.min(40, Number(arg('--beats', '20')) || 20))
const MODE = arg('--mode', 'all')
const TAG = arg('--tag', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const DATA_ROOT = arg('--data', 'data/experiment')
const FORCE = process.argv.includes('--force')

function zeroUsage(): Record<ModelRole, UsageTotals> {
  return {
    cognition: { calls: 0, input: 0, output: 0, ms: 0, retries: 0 },
    referee: { calls: 0, input: 0, output: 0, ms: 0, retries: 0 },
    narration: { calls: 0, input: 0, output: 0, ms: 0, retries: 0 },
    suggest: { calls: 0, input: 0, output: 0, ms: 0, retries: 0 },
  }
}

function addUsage(target: Record<ModelRole, UsageTotals>, sample: UsageSample): void {
  const u = target[sample.role]
  u.calls += 1
  u.input += sample.input
  u.output += sample.output
  u.ms += sample.ms
  u.retries += sample.retries
}

function usageOf(samples: readonly UsageSample[]): Record<ModelRole, UsageTotals> {
  const out = zeroUsage()
  for (const sample of samples) addUsage(out, sample)
  return out
}

function describeScene(world: World): string {
  const actors = new Set([pack.player, ...pack.characters.map((c) => c.id)])
  const here = world.ledger.at[pack.player] ?? 'saloon'
  const present = Object.entries(world.ledger.at)
    .filter(([ent, place]) => actors.has(ent) && place === here)
    .map(([ent]) => ent)
  const lit = world.ledger.phys['lamp']?.['lit'] === true ? '灯还亮着' : '灯已经灭了'
  const line = `酒馆里：${present.map((ent) => pack.names[ent] ?? ent).join('、')}。${lit}。外面的雨没停。`
  // 与 packages/server/src/session.ts 的 sceneText 同序：先现场，再地点与在场
  return [pack.scene?.trim() ?? '', line].filter((text) => text !== '').join('\n')
}

/** 与 packages/core/src/beat.ts 的 describeLedger 保持同形状（选项对象）；实验脚本不把它抽成公共层。 */
function describeLedger(world: World, present: readonly EntId[], view: LedgerView = {}): string {
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

function maxDuration(verdicts: readonly Verdict[]): number {
  return verdicts.reduce((max, v) => Math.max(max, v.duration), 0)
}

function isSigned(v: Verdict): boolean {
  if (!v.ok) return true
  if (v.deltas.length > 0) return true
  return v.duration >= 240
}

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

function refsOthers(actor: EntId, text: string): boolean {
  for (const [other, aliases] of Object.entries(ALIASES)) {
    if (other === actor) continue
    if (aliases.some((alias) => text.includes(alias))) return true
  }
  return false
}

/** 4-gram 重叠：判断第二轮是否真的捡了别人的话，而不是只提到名字。 */
function ngrams(text: string, n = 4): Set<string> {
  const chars = Array.from(text.replace(/\s+/g, ''))
  const out = new Set<string>()
  for (let i = 0; i + n <= chars.length; i += 1) out.add(chars.slice(i, i + n).join(''))
  return out
}

function hasEcho(text: string, others: readonly string[]): boolean {
  const self = ngrams(text)
  for (const other of others) {
    for (const gram of ngrams(other)) if (self.has(gram)) return true
  }
  return false
}

function opCounts(verdicts: readonly Verdict[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of verdicts) {
    if (!v.ok) continue
    for (const d of v.deltas) out[d.op] = (out[d.op] ?? 0) + 1
  }
  return out
}

function detectConflicts(world: World, verdicts: readonly Verdict[]): {
  hard: number
  doubleSpend: number
  move: number
  phys: number
  details: string[]
} {
  const ops = verdicts.filter((v) => v.ok).flatMap((v) => v.deltas)
  const spent = new Map<string, number>()
  const moves = new Map<string, Set<string>>()
  const phys = new Map<string, Set<string>>()
  const details: string[] = []

  for (const op of ops) {
    if (op.op === 'transfer' || op.op === 'consume') {
      const key = `${op.from}|${op.item}`
      spent.set(key, (spent.get(key) ?? 0) + op.n)
    } else if (op.op === 'move') {
      const set = moves.get(op.who) ?? new Set<string>()
      set.add(op.to)
      moves.set(op.who, set)
    } else if (op.op === 'phys') {
      const key = `${op.who}|${op.key}`
      const set = phys.get(key) ?? new Set<string>()
      set.add(String(op.value))
      phys.set(key, set)
    }
  }

  let doubleSpend = 0
  for (const [key, total] of spent) {
    const [holder = '', item = ''] = key.split('|')
    const held = world.ledger.holds[holder]?.[item] ?? 0
    if (total > held) {
      doubleSpend += 1
      details.push(`双花候选：${holder}.${item} 需要 ${total}，只有 ${held}`)
    }
  }

  let move = 0
  for (const [who, set] of moves) {
    if (set.size > 1) {
      move += 1
      details.push(`移动冲突：${who} → ${[...set].join(' / ')}`)
    }
  }

  let physConflicts = 0
  for (const [key, set] of phys) {
    if (set.size > 1) {
      physConflicts += 1
      details.push(`物质冲突：${key} = ${[...set].join(' / ')}`)
    }
  }

  return { hard: doubleSpend + move + physConflicts, doubleSpend, move, phys: physConflicts, details }
}

function failedOpsOf(world: World, verdicts: readonly Verdict[]): number {
  const probe = commit(world, { order: [], verdicts: [...verdicts], observations: {}, driveHits: [] })
  return probe.applied.flatMap((a) => a.results).filter((r) => !r.ok).length
}

async function runCrossTalkBeat(input: {
  world: World
  scene: Scene
  characters: Map<EntId, Character>
  player: EntId
  sceneText: string
  canon: readonly string[]
  names?: Record<EntId, string>
  items?: Record<string, string>
  aliases?: Record<EntId, string[]>
  playerClaim: string
  /** true = 第二轮看到其他人的公开草稿；false = 只看自己的草稿（控制臂） */
  seeOthers: boolean
  deps: { referee: Referee; narrator: Narrator; cognition: Cognition; store: Store }
}): Promise<ArmResult> {
  const { deps } = input
  const clock = input.world.ledger.clock
  const characters = new Map(input.characters)
  const present = Object.entries(input.world.ledger.at)
    .filter(([, place]) => place === input.scene.place)
    .map(([ent]) => ent)
  const inScene = input.scene.participants.filter((ent) => present.includes(ent))
  const heat: Record<EntId, number[]> = {}
  for (const ent of inScene) heat[ent] = (characters.get(ent)?.drives ?? []).map((d) => d.heat)
  const called = calledActors({ present: inScene, heat, touched: [], player: input.player })

  const playerClaims: Claim[] = []
  if (input.playerClaim) {
    playerClaims.push({ id: `p${clock}`, actor: input.player, text: input.playerClaim, kind: 'act' })
  }
  const playerLine = input.playerClaim ? `玩家刚才说/做：${input.playerClaim}` : ''
  const sceneFor = (ent: EntId): string =>
    [input.sceneText, playerLine, describeLedger(input.world, inScene, { names: input.names, items: input.items, aliases: input.aliases }), contextOf(input.scene, ent)]
      .filter(Boolean)
      .join('\n')

  const thinkers: { ent: EntId; ch: Character }[] = []
  for (const ent of called) {
    if (ent === input.player) continue
    const ch = characters.get(ent)
    if (ch) thinkers.push({ ent, ch })
  }

  const round1 = await Promise.all(
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
        return { ok: false as const, ent, reason: (error as Error).message }
      }
    }),
  )
  const degraded: string[] = []
  for (const r of round1) {
    if (!r.ok) degraded.push(`认知失败（本拍沉默）：${r.ent}：${r.reason}`)
  }

  let crossTalkCalls = 0
  let crossTalkChanged = 0
  let crossTalkRefs = 0
  let crossTalkEcho = 0
  const final = await Promise.all(
    round1
      .filter((r): r is Thought => r.ok)
      .map(async (r) => {
        const others = input.seeOthers
          ? round1
              .filter((x): x is Thought => x.ok && x.ent !== r.ent)
              .map((x) => ({ actor: x.ent, text: x.res.output.outward }))
          : []
        try {
          const res = await deps.cognition.think({
            character: r.ch,
            sceneText: sceneFor(r.ent),
            canon: [...input.canon],
            now: clock,
            ...(input.names ? { names: input.names } : {}),
            crossTalk: { self: r.res.output.outward, others },
          })
          crossTalkCalls += 1
          if (res.output.outward !== r.res.output.outward) crossTalkChanged += 1
          if (refsOthers(r.ent, res.output.outward)) crossTalkRefs += 1
          if (input.seeOthers && hasEcho(res.output.outward, others.map((o) => o.text))) crossTalkEcho += 1
          return { ok: true as const, ent: r.ent, ch: r.ch, res }
        } catch (error) {
          // 第二轮失败就退回第一轮草稿：不丢这一拍。
          degraded.push(`交叉对话失败（退回草稿）：${r.ent}：${(error as Error).message}`)
          return { ok: true as const, ent: r.ent, ch: r.ch, res: r.res }
        }
      }),
  )

  const claims: Claim[] = [...playerClaims]
  for (const t of final) {
    claims.push({ id: `${t.ent}${clock}`, actor: t.ent, text: t.res.output.outward, kind: 'act' })
    let next = t.ch
    for (const e of t.res.experience) next = remember(next, e)
    if (t.res.output.selfChange) next = remember(next, { t: clock, kind: 'thought', text: t.res.output.selfChange, w: 2 })
    characters.set(t.ent, next)
  }

  if (claims.length === 0) {
    return {
      world: input.world,
      scene: input.scene,
      characters,
      passage: '',
      journalSeq: 0,
      notes: [...degraded, '没有主张，本拍未发生'],
      claims,
      verdicts: [],
      crossTalkCalls,
      crossTalkChanged,
      crossTalkRefs,
      crossTalkEcho,
    }
  }

  let out: RefereeOutput
  try {
    out = await deps.referee.judge({
      clock,
      claims,
      context: [input.sceneText, describeLedger(input.world, present, { names: input.names, items: input.items, aliases: input.aliases, withIds: true }), contextOf(input.scene, input.player)]
        .filter(Boolean)
        .join('\n'),
    })
  } catch (error) {
    return {
      world: input.world,
      scene: input.scene,
      characters,
      passage: '',
      journalSeq: 0,
      notes: [...degraded, `裁决失败（本拍无进展）：${(error as Error).message}`],
      claims,
      verdicts: [],
      crossTalkCalls,
      crossTalkChanged,
      crossTalkRefs,
      crossTalkEcho,
    }
  }

  const clockAfter = clock + maxDuration(out.verdicts)
  const at = { ...input.world, ledger: { ...input.world.ledger, clock: clockAfter } }
  const { world, applied } = commit(at, out)
  const notes = applied.flatMap((a) => a.results.filter((r) => !r.ok).map((r) => `${a.claimId}: ${r.why ?? 'op 失败'}`))

  const rolledBack = new Map(applied.filter((a) => !a.committed).map((a) => [a.claimId, a.results]))
  const seen = distribute(out.observations, out.verdicts, characters, clock, rolledBack)
  for (const [ent, ch] of seen) characters.set(ent, ch)
  applyDriveHits(characters, out.driveHits)

  const narratorEvents: NarrationEvent[] = claims.map((c) => {
    const v = out.verdicts.find((x) => x.claimId === c.id)
    return { actor: c.actor, text: c.text, outcome: describe(v) }
  })

  let passage = ''
  try {
    const narration = await deps.narrator.narrate({
      clockBefore: clock,
      clockAfter,
      sceneText: input.sceneText,
      events: narratorEvents,
    })
    passage = narration.text
    deps.store.appendPassage({ clock: clockAfter, text: passage, source: 'narrator' })
    notes.push(...narration.absoluteTime.map((t) => `叙述里出现绝对时间：${t}`))
  } catch (error) {
    notes.push(`旁白失败（本拍保留账本）：${(error as Error).message}`)
  }

  const texts: Record<EntId, string> = {}
  for (const e of narratorEvents) texts[e.actor] = `${e.actor}：${e.text} → ${e.outcome}`
  const scene = appendBeat(input.scene, {
    clock: clockAfter,
    tokens: estimateTokens([input.sceneText, passage].join('\n')),
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

  const result: ArmResult = {
    world,
    scene,
    characters,
    passage,
    journalSeq: entry.seq,
    notes: [...degraded, ...notes],
    claims,
    verdicts: out.verdicts,
    crossTalkCalls,
    crossTalkChanged,
    crossTalkRefs,
    crossTalkEcho,
  }

  const reason = foldReason(scene, {
    place: result.world.ledger.at[input.player] ?? scene.place,
    clock: clockAfter,
    tokens: scene.tokens,
  })
  if (reason) {
    deps.store.appendBeat({ type: 'scene/fold', scene: scene.id, clock: clockAfter, claims: [], order: [], verdicts: [], observations: {}, driveHits: [] })
    result.folded = fold(scene, reason)
    result.notes.push(`折场：${reason}`)
  }
  return result
}

function summaryOf(metrics: readonly BeatMetrics[]): {
  beats: number
  clockAdvance: number
  wallMs: number
  usage: Record<ModelRole, UsageTotals>
  verdicts: number
  no: number
  noRate: number
  emptyRate: number
  longRate: number
  ops: Record<string, number>
  failedOps: number
  hardConflicts: number
  doubleSpend: number
  moveConflicts: number
  physConflicts: number
  crossTalkCalls: number
  crossTalkChanged: number
  crossTalkRefs: number
  crossTalkEcho: number
} {
  const usage = zeroUsage()
  const ops: Record<string, number> = {}
  let verdicts = 0
  let no = 0
  let empty = 0
  let long = 0
  let failedOps = 0
  let hardConflicts = 0
  let doubleSpend = 0
  let moveConflicts = 0
  let physConflicts = 0
  let crossTalkCalls = 0
  let crossTalkChanged = 0
  let crossTalkRefs = 0
  let crossTalkEcho = 0
  let wallMs = 0
  for (const m of metrics) {
    for (const role of ['cognition', 'referee', 'narration'] as const) {
      const u = usage[role]
      const v = m.usage[role]
      u.calls += v.calls
      u.input += v.input
      u.output += v.output
      u.ms += v.ms
      u.retries += v.retries
    }
    for (const [op, n] of Object.entries(m.ops)) ops[op] = (ops[op] ?? 0) + n
    verdicts += m.verdicts
    no += m.no
    empty += m.empty
    long += m.long
    failedOps += m.failedOps
    hardConflicts += m.hardConflicts
    doubleSpend += m.doubleSpend
    moveConflicts += m.moveConflicts
    physConflicts += m.physConflicts
    crossTalkCalls += m.crossTalkCalls
    crossTalkChanged += m.crossTalkChanged
    crossTalkRefs += m.crossTalkRefs
    crossTalkEcho += m.crossTalkEcho
    wallMs += m.wallMs
  }
  const first = metrics[0]
  const last = metrics.at(-1)
  return {
    beats: metrics.length,
    clockAdvance: first && last ? last.clockAfter - first.clockBefore : 0,
    wallMs,
    usage,
    verdicts,
    no,
    noRate: verdicts === 0 ? 0 : no / verdicts,
    emptyRate: verdicts === 0 ? 0 : empty / verdicts,
    longRate: verdicts === 0 ? 0 : long / verdicts,
    ops,
    failedOps,
    hardConflicts,
    doubleSpend,
    moveConflicts,
    physConflicts,
    crossTalkCalls,
    crossTalkChanged,
    crossTalkRefs,
    crossTalkEcho,
  }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function report(
  tag: string,
  beats: number,
  arms: { arm: Arm; summary: ReturnType<typeof summaryOf>; samples: BeatSample[] }[],
): string {
  const lines: string[] = []
  lines.push(`# 多 Agent 交叉对话实验：${tag}`)
  lines.push('')
  lines.push(`- 拍数上限：${beats}`)
  lines.push(`- 模型：${CFG.models.cognition} / ${CFG.models.referee} / ${CFG.models.narration}`)
  lines.push('- 说明：各臂不是同一轨迹的对照；LLM 非确定，比较的是每拍分布与总量。self-retry 是控制臂：同样两次认知，但第二轮看不到别人。')
  lines.push('')
  lines.push('## 汇总')
  lines.push('')
  const headers = arms.map((a) => a.arm)
  lines.push(`| 指标 | ${headers.join(' | ')} |`)
  lines.push(`| :--- | ${headers.map(() => '---:').join(' | ')} |`)
  const row = (label: string, fn: (s: ReturnType<typeof summaryOf>) => string | number) => {
    lines.push(`| ${label} | ${arms.map((a) => String(fn(a.summary))).join(' | ')} |`)
  }
  row('拍数', (s) => s.beats)
  row('时钟推进（分钟）', (s) => s.clockAdvance)
  row('墙钟总耗时', (s) => `${(s.wallMs / 1000).toFixed(1)}s`)
  row('每拍均耗时', (s) => `${(s.wallMs / Math.max(1, s.beats) / 1000).toFixed(1)}s`)
  row('认知调用', (s) => s.usage.cognition.calls)
  row('裁判调用', (s) => s.usage.referee.calls)
  row('渲染调用', (s) => s.usage.narration.calls)
  row('输入 tokens', (s) => s.usage.cognition.input + s.usage.referee.input + s.usage.narration.input)
  row('输出 tokens', (s) => s.usage.cognition.output + s.usage.referee.output + s.usage.narration.output)
  row('裁决数', (s) => s.verdicts)
  row('no_rate', (s) => pct(s.noRate))
  row('空结果占比', (s) => pct(s.emptyRate))
  row('长动作占比', (s) => pct(s.longRate))
  row('硬冲突', (s) => s.hardConflicts)
  row('  双花候选', (s) => s.doubleSpend)
  row('  移动冲突', (s) => s.moveConflicts)
  row('  物质冲突', (s) => s.physConflicts)
  row('op 失败条数', (s) => s.failedOps)
  row('交叉对话调用', (s) => s.crossTalkCalls)
  row('交叉对话改口', (s) => s.crossTalkChanged)
  row('交叉对话提及他人', (s) => s.crossTalkRefs)
  row('提及率', (s) => (s.crossTalkCalls === 0 ? '-' : pct(s.crossTalkRefs / s.crossTalkCalls)))
  row('交叉对话回声（4-gram）', (s) => s.crossTalkEcho)
  row('回声率', (s) => (s.crossTalkCalls === 0 ? '-' : pct(s.crossTalkEcho / s.crossTalkCalls)))
  lines.push('')
  lines.push('写操作分布：')
  lines.push('')
  lines.push('| 臂 | ' + ['move', 'transfer', 'consume', 'phys', 'rel', 'fact', 'know'].join(' | ') + ' |')
  lines.push('| :--- | ' + ['---:', '---:', '---:', '---:', '---:', '---:', '---:'].join(' | ') + ' |')
  for (const { arm, summary } of arms) {
    lines.push(`| ${arm} | ${['move', 'transfer', 'consume', 'phys', 'rel', 'fact', 'know'].map((op) => summary.ops[op] ?? 0).join(' | ')} |`)
  }
  lines.push('')
  lines.push('## 样本（人工看人物声音）')
  for (const { arm, samples } of arms) {
    lines.push('')
    lines.push(`### ${arm}`)
    for (const sample of samples) {
      lines.push('')
      lines.push(`#### 第 ${sample.beat} 拍 · ${fmt(sample.clock)}`)
      lines.push('')
      lines.push(sample.passage || '（无旁白）')
      if (sample.npc.length > 0) {
        lines.push('')
        lines.push('人物原话：')
        for (const n of sample.npc) lines.push(`- ${n.actor}：${n.text}`)
      }
    }
  }
  lines.push('')
  return lines.join('\n')
}

async function runArm(arm: Arm): Promise<{ arm: Arm; summary: ReturnType<typeof summaryOf>; samples: BeatSample[]; dir: string }> {
  const dir = join(DATA_ROOT, TAG, arm)
  if (FORCE) rmSync(dir, { recursive: true, force: true })
  else if (existsSync(join(dir, 'journal.jsonl'))) {
    throw new Error(`目录已有 journal：${dir}（换 --tag，或加 --force）`)
  }
  mkdirSync(dir, { recursive: true })

  const samples: UsageSample[] = []
  const llm = createLlm({
    models: CFG.models,
    credentials: readonlyPiCredentials(),
    sessionId: `exp-${TAG}-${arm}-${randomUUID()}`,
    ...(CFG.retry ? { retry: CFG.retry } : {}),
    onUsage: (sample) => {
      samples.push(sample)
    },
  })
  const store = openStore(dir)
  const deps = {
    referee: createLlmReferee(llm),
    cognition: createCognition(llm),
    narrator: createNarrator(llm),
    store,
  }

  let world: World = structuredClone(pack.world)
  let characters = new Map(seedCharacters(pack).map((c) => [c.id, c]))
  const player = pack.player
  const participants = [player, ...pack.characters.map((c) => c.id)]
  let scene: Scene = openScene({ id: 's1', place: world.ledger.at[player] ?? 'saloon', clock: 0, participants })

  const metrics: BeatMetrics[] = []
  const beatSamples: BeatSample[] = []

  for (let beat = 1; beat <= BEATS; beat += 1) {
    const playerClaim = AUTO_LINES[(beat - 1) % AUTO_LINES.length] ?? ''
    const clockBefore = world.ledger.clock
    const usageStart = samples.length
    const t0 = performance.now()
    let res: ArmResult

    if (arm === 'baseline') {
      const r = await runBeat({
        world,
        scene,
        characters,
        player,
        beatIndex: beat,
        sceneText: describeScene(world),
        canon: pack.canon,
        names: pack.names,
        items: pack.items,
        aliases: pack.aliases,
        playerClaim,
        deps,
      })
      const entry = r.journalSeq > 0 ? store.readJournal().find((e) => e.seq === r.journalSeq) : undefined
      res = {
        world: r.world,
        scene: r.scene,
        characters: r.characters,
        passage: r.passage,
        journalSeq: r.journalSeq,
        ...(r.folded ? { folded: r.folded } : {}),
        notes: r.notes,
        claims: entry?.claims ?? [],
        verdicts: entry?.verdicts ?? [],
        crossTalkCalls: 0,
        crossTalkChanged: 0,
        crossTalkRefs: 0,
        crossTalkEcho: 0,
      }
    } else {
      res = await runCrossTalkBeat({
        world,
        scene,
        characters,
        player,
        sceneText: describeScene(world),
        canon: pack.canon,
        names: pack.names,
        items: pack.items,
        aliases: pack.aliases,
        playerClaim,
        seeOthers: arm === 'cross-talk',
        deps,
      })
    }

    const wallMs = Math.round(performance.now() - t0)
    const beatUsage = usageOf(samples.slice(usageStart))
    const conflicts = detectConflicts(world, res.verdicts)
    const failedOps = failedOpsOf(world, res.verdicts)
    const m: BeatMetrics = {
      arm,
      beat,
      clockBefore,
      clockAfter: res.world.ledger.clock,
      wallMs,
      usage: beatUsage,
      claims: res.claims.length,
      npcClaims: res.claims.filter((c) => c.actor !== player).length,
      verdicts: res.verdicts.length,
      no: res.verdicts.filter((v) => !v.ok).length,
      ok: res.verdicts.filter((v) => v.ok).length,
      empty: res.verdicts.filter((v) => v.ok && v.deltas.length === 0).length,
      long: res.verdicts.filter((v) => v.ok && v.deltas.length === 0 && v.duration >= 240).length,
      ops: opCounts(res.verdicts),
      failedOps,
      hardConflicts: conflicts.hard,
      doubleSpend: conflicts.doubleSpend,
      moveConflicts: conflicts.move,
      physConflicts: conflicts.phys,
      crossTalkCalls: res.crossTalkCalls,
      crossTalkChanged: res.crossTalkChanged,
      crossTalkRefs: res.crossTalkRefs,
      crossTalkEcho: res.crossTalkEcho,
      passageChars: res.passage.length,
      newFacts: res.verdicts.filter((v) => v.ok).flatMap((v) => v.deltas.filter((d) => d.op === 'fact').map((d) => (d.op === 'fact' ? d.text : ''))),
    }
    metrics.push(m)
    appendFileSync(join(dir, 'metrics.jsonl'), `${JSON.stringify(m)}\n`)

    const npc = res.claims.filter((c) => c.actor !== player).map((c) => ({ actor: c.actor, text: c.text }))
    if ([1, Math.ceil(BEATS / 2), BEATS].includes(beat)) {
      beatSamples.push({ beat, clock: res.world.ledger.clock, passage: res.passage, npc })
    }

    world = res.world
    characters = res.characters
    scene = res.scene
    if (res.folded) {
      scene = openScene({
        id: `s${beat + 1}`,
        place: world.ledger.at[player] ?? 'saloon',
        clock: world.ledger.clock,
        participants,
      })
    }

    const calls = beatUsage.cognition.calls + beatUsage.referee.calls + beatUsage.narration.calls
    console.log(
      `[${arm}] ${beat}/${BEATS} ${fmt(world.ledger.clock)} ${(wallMs / 1000).toFixed(1)}s calls=${calls}` +
        ` claims=${m.claims} no=${m.no} hard=${m.hardConflicts} xrefs=${m.crossTalkRefs}` +
        (res.notes.length ? ` notes=${res.notes.length}` : ''),
    )
  }

  store.close()
  const summary = summaryOf(metrics)
  writeFileSync(join(dir, 'metrics.json'), JSON.stringify({ arm, tag: TAG, beats: BEATS, summary, metrics }, null, 2))
  return { arm, summary, samples: beatSamples, dir }
}

const piDefault = readPiDefaultModel(join(homedir(), '.pi', 'agent')) ?? FALLBACK_MODEL
const CFG = loadModelConfig(process.env.AI_WORLD_CONFIG ?? 'config/models.json', piDefault)

async function main(): Promise<void> {
  const valid: Arm[] = ['baseline', 'self-retry', 'cross-talk']
  const wanted: Arm[] =
    MODE === 'all'
      ? valid
      : MODE === 'both'
        ? ['baseline', 'cross-talk']
        : valid.includes(MODE as Arm)
          ? [MODE as Arm]
          : []
  if (wanted.length === 0) throw new Error(`--mode 只能是 baseline / self-retry / cross-talk / both / all（当前 ${MODE}）`)
  console.log(`实验 ${TAG}：${BEATS} 拍，${wanted.join(' + ')}`)
  console.log(`模型：cognition=${CFG.models.cognition} referee=${CFG.models.referee} narration=${CFG.models.narration}`)
  const arms = []
  for (const arm of wanted) {
    const result = await runArm(arm)
    arms.push(result)
    console.log(`[${arm}] done → ${result.dir}`)
  }
  const outDir = join(DATA_ROOT, TAG)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'report.md'), report(TAG, BEATS, arms))
  console.log(`\n报告：${join(outDir, 'report.md')}`)
  for (const arm of arms) {
    const s = arm.summary
    console.log(
      `${arm.arm.padEnd(10)} 拍 ${s.beats} 时钟 ${s.clockAdvance}min 硬冲突 ${s.hardConflicts} ` +
        `双花 ${s.doubleSpend} 失败op ${s.failedOps} no_rate ${pct(s.noRate)} ` +
        `xrefs ${s.crossTalkRefs}/${s.crossTalkCalls}` +
        ` echo ${s.crossTalkEcho}/${s.crossTalkCalls}`,
    )
  }
}

void main()
