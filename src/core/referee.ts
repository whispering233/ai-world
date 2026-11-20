/**
 * 裁判：世界上唯一的写入口（见 docs/design/20-referee.md）。
 *
 * 它不编故事，只回答“这个主张成立吗”，并给出账本要改什么、花了多久。
 * 一拍一次，批量结算；互斥的主张由它自己解决，deltas 里只出现成立的那一方。
 */

import { apply } from './ledger.ts'
import type { Llm } from './llm.ts'
import { parseModelJson } from './model-json.ts'
import type { EntId, Op, OpResult, World } from './world.ts'

export type ClaimKind = 'say' | 'act'

export interface Claim {
  id: string
  actor: EntId
  text: string
  kind: ClaimKind
}

export interface Verdict {
  claimId: string
  actor: EntId
  ok: boolean
  /** 不成立的原因，会写回该角色的 experience */
  reason?: string
  /** 只有 ok 为真时才写入账本 */
  deltas: Op[]
  /** 分钟，[0, 1440] */
  duration: number
}

export interface Observation {
  claimIds: string[]
  summary: string
}

export interface DriveHit {
  ent: EntId
  driveId: string
  delta: number
}

export interface RefereeOutput {
  /** 结算顺序，表达“谁的手快”；只影响叙述与 deltas 的应用顺序，不代表额外状态 */
  order: EntId[]
  verdicts: Verdict[]
  observations: Record<EntId, Observation>
  driveHits: DriveHit[]
}

export interface RefereeInput {
  clock: number
  claims: readonly Claim[]
  /** 场景装配好的现场文本（W08 负责拼），裁判不自己检索 */
  context: string
}

export interface Referee {
  judge(input: RefereeInput): Promise<RefereeOutput>
}

export const DEFAULT_DURATION = 1
export const MAX_DURATION = 1440

/** 一拍里裁判输出的解析结果；notes 记录被丢弃或补齐的条目，供日志与体检用。 */
export interface ParsedOutput {
  output: RefereeOutput
  notes: string[]
}

/**
 * 只校验信封：claimId 是否存在、ok 是否布尔、duration 是否在范围、observations 形状。
 * 单个 op 的合法性不在这里判——那是 `apply()` 的前置条件（决策 #8：不做独立审核层）。
 */
export function parseRefereeOutput(raw: unknown, claims: readonly Claim[]): ParsedOutput {
  const notes: string[] = []
  const byClaimIndex = new Map(claims.map((c) => [c.id, c]))
  const root = asRecord(raw)
  if (!root) return { output: emptyOutput(claims), notes: ['裁判输出不是对象'] }

  const order = asStringArray(root['order']).filter((id) =>
    claims.some((c) => c.actor === id),
  )

  const verdicts: Verdict[] = []
  const seen = new Set<string>()
  for (const item of asArray(root['verdicts'])) {
    const rec = asRecord(item)
    const claimId = typeof rec?.['claimId'] === 'string' ? rec['claimId'] : undefined
    if (!claimId) {
      notes.push('丢弃一条没有 claimId 的裁决')
      continue
    }
    const claim = byClaimIndex.get(claimId)
    if (!claim) {
      notes.push(`丢弃未知 claimId：${claimId}`)
      continue
    }
    if (seen.has(claimId)) {
      notes.push(`丢弃重复裁决：${claimId}`)
      continue
    }
    seen.add(claimId)
    const ok = rec?.['ok'] === true
    verdicts.push({
      claimId,
      actor: claim.actor,
      ok,
      ...(typeof rec?.['reason'] === 'string' ? { reason: rec['reason'] } : {}),
      deltas: ok ? asArray(rec?.['deltas']).map(asOp) : [],
      duration: clampDuration(rec?.['duration']),
    })
  }

  // 裁判漏掉的 claim 按“话说了、世界没变”补齐：不编结果，也不让主张凭空生效
  for (const claim of claims) {
    if (seen.has(claim.id)) continue
    notes.push(`裁判漏掉 claim，按无事发生处理：${claim.id}`)
    verdicts.push({
      claimId: claim.id,
      actor: claim.actor,
      ok: true,
      deltas: [],
      duration: DEFAULT_DURATION,
    })
  }

  return {
    output: {
      order: dedupe(order),
      verdicts,
      observations: asObservations(root['observations']),
      driveHits: asDriveHits(root['driveHits']),
    },
    notes,
  }
}

/**
 * 把裁决写进账本。按 order 结算：先手先落地，因此“谁抢到”由裁判的 deltas 与顺序共同决定，
 * 而不是由调用方的数组顺序决定。
 */
export function commit(
  world: World,
  out: RefereeOutput,
): { world: World; applied: { claimId: string; results: OpResult[] }[] } {
  let next = world
  const applied: { claimId: string; results: OpResult[] }[] = []
  for (const actor of settleOrder(out)) {
    for (const v of out.verdicts) {
      if (!v.ok || v.actor !== actor) continue
      const r = apply(next, v.deltas)
      next = r.world
      applied.push({ claimId: v.claimId, results: r.results })
    }
  }
  return { world: next, applied }
}

/** 体检指标：拒绝率。长期接近 0 说明裁判在放水（docs/design/20-referee.md §7）。 */
export function noRate(verdicts: readonly Verdict[]): number {
  if (verdicts.length === 0) return 0
  return verdicts.filter((v) => !v.ok).length / verdicts.length
}

/** 确定性桩：按顺序返回脚本，用完复用最后一条。 */
export function createStubReferee(script: readonly RefereeOutput[]): Referee {
  let i = 0
  return {
    async judge(input) {
      if (script.length === 0) return emptyOutput(input.claims)
      const item = script[Math.min(i, script.length - 1)]
      i += 1
      return structuredClone(item) ?? emptyOutput(input.claims)
    },
  }
}

const REFEREE_SYSTEM = `你是这个世界的裁判，不是叙述者。你只判定别人提出的主张，不替任何人编故事。

规则：
1. 每条 claim 必须给出一条 verdict，claimId 原样带回。
2. 只把**成立**的结果写进 deltas；不成立的写 ok:false 并给一句具体的 reason（例如“门是铸铁焊死的”）。
3. 互斥的主张（两人同抢一物、同时开枪）必须自己解出胜者：deltas 里只出现胜者的改动，败者判 ok:false。
4. 拒绝是常态。不要为了配合而放行，也不要为了刁难而拒绝。
5. duration 填这件事花了多少分钟，缺省 1，上限 1440；睡觉、远行这类长动作要如实给大值（一句交锋 1–3 分钟，一场谈话 10–30 分钟）。
6. 没有发生的改动一律不写。
7. **地点只能换成账本里列出的地点 id**，不能现编地名；也不能凭想象给某人塞东西——只能移动 / 交出他实际持有的物品。
8. **fact 是「发生过的事」**，不是世界真理：「ann 说她明天就走」可以记，「ann 明天会走」不能记；真假由账本里的持有物 / 位置 / 状态决定。
9. **可计量的东西必须落 op**：倒酒 = 从持有者 take/give；推门 = 把门的 phys.closed 改成 false；给药 = give。凡是「他手上确实少了 / 多了 / 变了」的事，不能只写在 reason 里。
10. **说话于是留痕**：一句被听见的话就是一条事件——用 know 把这条事件告诉听众（fact 字段直接写那句话里的事实或引语，不需要 id）。只有真正改变态度的行为（威胁、羞辱、示好、守信、背叛）才动 rel，一次 ±1；rel = -3 表示势不两立，不要随手推到满。
11. **phys 的键必须能被一句物理描述解释**（closed / broken / lit / wounded）；不要用它记「他有药包」这类身份状态。

只输出一个 JSON 对象，不要任何解释文字：
{"order":["实体id",...],"verdicts":[{"claimId":"...","actor":"...","ok":true,"reason":"...","deltas":[{"op":"move","who":"...","to":"..."}],"duration":1}],"observations":{"实体id":{"claimIds":["..."],"summary":"一句他实际感知到的结果"}},"driveHits":[{"ent":"...","driveId":"...","delta":0.2}]}

deltas 只能使用这些 op：move{who,to} / give{from,to,item,n} / take{from,item,n} / phys{who,key,value} / rel{from,to,delta} / fact{text} / know{who,fact}。`

/**
 * 用文本 JSON 而非工具调用：裁判的输出是“一份判定书”，不是能力调用。
 * 校验强度由 parseRefereeOutput + apply() 的前置条件保证，两者缺一不可。
 */
export function createLlmReferee(llm: Llm): Referee {
  return {
    async judge(input) {
      const claims = input.claims.map((c) => ({ claimId: c.id, actor: c.actor, kind: c.kind, text: c.text }))
      const res = await llm.chat({
        tier: 'strong',
        system: REFEREE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `当前时刻（分钟）：${input.clock}\n\n现场：\n${input.context}\n\n待裁决的主张：\n${JSON.stringify(claims, null, 2)}`,
          },
        ],
      })
      // 解析失败时不抛：交给 parseRefereeOutput 走“无事发生 + notes”分支，一拍不会因为模型写了废话而崩
      let raw: unknown
      try {
        raw = parseModelJson(res.text)
      } catch {
        raw = undefined
      }
      return parseRefereeOutput(raw, input.claims).output
    },
  }
}

function settleOrder(out: RefereeOutput): EntId[] {
  const all = dedupe([...out.order, ...out.verdicts.map((v) => v.actor)])
  return all
}

function emptyOutput(claims: readonly Claim[]): RefereeOutput {
  return {
    order: [],
    verdicts: claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: DEFAULT_DURATION })),
    observations: {},
    driveHits: [],
  }
}

function clampDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DURATION
  return Math.max(0, Math.min(MAX_DURATION, value))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === 'string')
}

function asOp(value: unknown): Op {
  return (asRecord(value) ?? { op: 'unknown' }) as Op
}

function asObservations(value: unknown): Record<EntId, Observation> {
  const out: Record<EntId, Observation> = {}
  for (const [ent, raw] of Object.entries(asRecord(value) ?? {})) {
    const rec = asRecord(raw)
    out[ent] = {
      claimIds: asStringArray(rec?.['claimIds']),
      summary: typeof rec?.['summary'] === 'string' ? rec['summary'] : '',
    }
  }
  return out
}

function asDriveHits(value: unknown): DriveHit[] {
  const hits: DriveHit[] = []
  for (const item of asArray(value)) {
    const rec = asRecord(item)
    const ent = rec?.['ent']
    const driveId = rec?.['driveId']
    const delta = rec?.['delta']
    if (typeof ent !== 'string' || typeof driveId !== 'string' || typeof delta !== 'number') continue
    if (!Number.isFinite(delta)) continue
    hits.push({ ent, driveId, delta })
  }
  return hits
}

function dedupe(ids: readonly EntId[]): EntId[] {
  return [...new Set(ids)]
}
