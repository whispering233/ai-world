/**
 * 裁判：世界上唯一的写入口（见 docs/design/20-referee.md）。
 *
 * 它不编故事，只回答“这个主张成立吗”，并给出账本要改什么、花了多久。
 * 一拍一次，批量结算；互斥的主张由它自己解决，deltas 里只出现成立的那一方。
 */

import { apply } from './ledger.ts'
import type { Llm } from './llm.ts'
import { tryParseModelJson } from './model-json.ts'
import type { EntId, Op, OpResult, World } from './world.ts'

export type ClaimKind = 'say' | 'act'

export interface Claim {
  id: string
  actor: EntId
  text: string
  kind: ClaimKind
  /** 这次发言的对象；只有玩家 claim 用，实体 id 由服务端按显示名解析（docs/db/schema.md §3） */
  to?: EntId
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
  /** 场景装配好的现场文本（由调度层拼），裁判不自己检索 */
  context: string
  /** 世界设定：与本拍相关的固定事实，判定时不得与之矛盾 */
  canon?: readonly string[]
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
 *
 * **一条裁决内的 deltas 是事务**：任何一条 op 不成立，整条裁决不写入。
 * 否则会出现“钱付了、酒没拿到”——那比干脆被拒绝更糟，因为它是静默的账目错误。
 */
export function commit(
  world: World,
  out: RefereeOutput,
): { world: World; applied: { claimId: string; results: OpResult[]; committed: boolean }[] } {
  let next = world
  const applied: { claimId: string; results: OpResult[]; committed: boolean }[] = []
  for (const actor of settleOrder(out)) {
    for (const v of out.verdicts) {
      if (!v.ok || v.actor !== actor) continue
      const r = apply(next, v.deltas)
      const committed = r.results.every((x) => x.ok)
      if (committed) next = r.world
      applied.push({ claimId: v.claimId, results: r.results, committed })
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

/**
 * 裁判的输出通道：一个强制结构化参数的工具。
 *
 * 它不是能力授予——不给世界增加任何动作，只把判定装进 schema。
 * 信封在这里校验；单个 op 的合法性仍由 apply() 的前置条件把关（决策 #8）。
 */
export const SUBMIT_VERDICT_TOOL = {
  name: 'submit_verdict',
  description: '给出本拍全部主张的判定。每条 claim 必须有一条 verdict。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['order', 'verdicts'],
    properties: {
      order: { type: 'array', items: { type: 'string' } },
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['claimId', 'ok'],
          properties: {
            claimId: { type: 'string' },
            actor: { type: 'string' },
            ok: { type: 'boolean' },
            reason: { type: 'string' },
            duration: { type: 'number' },
            deltas: {
              type: 'array',
              items: {
                type: 'object',
                required: ['op'],
                additionalProperties: true,
                properties: { op: { type: 'string', enum: ['move', 'transfer', 'consume', 'phys', 'rel', 'fact', 'know'] } },
              },
            },
          },
        },
      },
      observations: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            claimIds: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
        },
      },
      driveHits: {
        type: 'array',
        items: {
          type: 'object',
          properties: { ent: { type: 'string' }, driveId: { type: 'string' }, delta: { type: 'number' } },
        },
      },
    },
  },
} as const

export const REFEREE_SYSTEM = `你是这个世界的裁判，不是叙述者。你只判定别人提出的主张，不替任何人编故事。

规则：
1. 每条 claim 必须给出一条 verdict，claimId 原样带回。
2. 只把**成立**的结果写进 deltas；不成立的写 ok:false 并给一句具体的 reason（例如“门是铸铁焊死的”）。
3. 互斥的主张（两人同抢一物、同时开枪）必须自己解出胜者：deltas 里只出现胜者的改动，败者判 ok:false。
3b. **同一拍对同一 phys 键写入相反值也是互斥**（一条把 door.closed 写成 false、另一条写成 true）：只能留一条成立，另一条 ok:false 并给出理由；不许两条都 ok 靠落地顺序决定结果。
4. 拒绝是常态。不要为了配合而放行，也不要为了刁难而拒绝。
5. duration 填这件事花了多少分钟，缺省 1，上限 1440；睡觉、远行这类长动作要如实给大值（一句交锋 1–3 分钟，一场谈话 10–30 分钟）。
6. 没有发生的改动一律不写。
7. **地点只能换成账本里列出的地点 id**，不能现编地名；也不能凭想象给某人塞东西——只能 move 或 transfer/consume 他实际持有的物品。
8. **fact 只记会改变后续判断的事件**：承诺、威胁、谎言、公开宣告、交易完成、身份揭示、状态改变。判断方法：下一拍若不知道这条，会不会判错？会就记，不会就不记。**公开宣告**指改变所有人预期的声明（包场、赶人、封锁、悬赏、定下期限），不是“谁当众说了句话”；转述别人说了什么、附和、寒暄、重复点单、已知信息、纯动作细节（收杯、擦桌、挪椅子）都不记——在场者已经由 observations 记住这些。**账本已经记过的状态（谁在哪、谁有什么、门锁了没有、关系变没变）不要再复述成 fact**；fact 只补账本表达不了的事件。fact 是「发生过的事」，不是世界真理：「ann 说她明天就走」是承诺才记，「ann 明天会走」不能记；真假由账本里的持有物 / 位置 / 状态决定。**fact 的 actor 填动作发出者（不是承受者）**，不确定可省略；**kind 从 speech / promise / threat / lie / transaction / identity / state / other 选**，不确定用 other。
9. **可计量的东西必须落 op**：倒酒 = 从持有者 transfer（或 consume）；推门 = 把门的 phys.closed 改成 false；给药 = transfer。凡是「他手上确实少了 / 多了 / 变了」的事，不能只写在 reason 里。
9b. **没落账的主张没有持续性**：ok + 空 deltas 只表示“这件事发生了”，不构成世界状态。不要拿它当证据去否决另一条改变账本的主张——有人说“我先按住他了”（没写 phys），另一人“挣脱并跑向门口”（写了 move）照样成立。需要持续才能成立的事（挡着、扶着、按着、一直看着）必须用 phys 键落账，且这个键要能被一句物理描述解释（例如“有人抵着门不让它合上” = 把门的 closed 写成 false；反方向“按住门不让它开”应该是 closed 保持 true，两者别弄反）；没落账就没有这个持续，下一拍再拿“我还按着他”当理由，先看账本里有没有这个键。
10. **说话留痕，但不是知识广播**：一句被听见的话可以记 fact（发生过的事）；在场者的即时记忆由 observations 记录，不要默认给每个听众发 know。只有听众原本不知道、且以后会用到的信息（秘密、计划、债务、身份、跨场景承诺）才用 know 授予知情；寒暄、点单、重复、已经知道的事不发 know。一次 know 用 who 数组覆盖所有听众，不要一人一条；who 只列确实听见的人，耳语/只对某人说不要发给全场。只有真正改变态度的行为（威胁、羞辱、示好、守信、背叛）才动 rel，一次 ±1；rel = -3 表示势不两立，不要随手推到满。
11. **phys 的键必须能被一句物理描述解释**（closed / broken / lit / wounded / locked）；不要用它记「他有药包」这类身份状态。
12. **item 必须填上下文括号里的 id**（如 whiskey），不能填显示名（如 威士忌）；填错会被账本拒绝。
13. **duration 是动作本身的耗时，不是当前 clock**：不要用“从进门到现在才过了几分钟”拒绝睡一整夜、等到天亮或远行。只要动作在当前场景可行，就按实际耗时给 duration；clock 由已提交的 duration 推进。
14. **observations 是每个人的感知**：summary 固定用**第二人称**写给该实体（“你看见…”），只写他自己感知到的内容，不用“他/她/名字”指代本人；claimIds 是感知白名单，没列出的 claim 等于这个人没看见，下一拍他的上下文里也不会出现。
15. **物品位置：陈设是承载者，不是行动者**。柜台 / 铁盒 / 桌子这类家具不能 move；放上、取走用 transfer，开 / 锁用 phys。例：把酒瓶从柜台拿到手里 = transfer{from:"counter",to:"player",item:"whiskey",n:1}；锁铁盒 = phys{who:"strongbox",key:"locked",value:true}（开锁则 false）；杯子放回柜台 = transfer{from:"player",to:"counter",item:"cup",n:1}。

调用 submit_verdict 工具给出判定；不要输出解释文字。字段形状如下（供参考）：
{"order":["实体id",...],"verdicts":[{"claimId":"...","actor":"...","ok":true,"reason":"...","deltas":[{"op":"move","who":"...","to":"..."}],"duration":1}],"observations":{"实体id":{"claimIds":["..."],"summary":"一句他实际感知到的结果"}},"driveHits":[{"ent":"...","driveId":"...","delta":0.2}]}

deltas 只能使用这些 op：move{who,to} / transfer{from,to,item,n} / consume{from,item,n} / phys{who,key,value} / rel{from,to,delta} / fact{text,actor?,kind?} / know{who,fact}。`

/** 裁判的用户消息（工具调用与纯文本回退共用同一段，便于对照测速） */
export function refereePrompt(input: RefereeInput): string {
  const claims = input.claims.map((c) => ({ claimId: c.id, actor: c.actor, kind: c.kind, text: c.text }))
  const canon = input.canon?.length ? `世界设定：\n${input.canon.map((c) => `- ${c}`).join('\n')}\n\n` : ''
  return `${canon}当前时刻（分钟）：${input.clock}\n\n现场：\n${input.context}\n\n待裁决的主张：\n${JSON.stringify(claims, null, 2)}`
}

/**
 * 裁判输出优先走 submit_verdict 工具；模型没调工具时回退文本 JSON。
 * 信封由工具 schema 校验，单个 op 的合法性仍由 apply() 的前置条件把关。
 */
export function createLlmReferee(llm: Llm): Referee {
  return {
    async judge(input) {
      const res = await llm.chat({
        role: 'referee',
        system: REFEREE_SYSTEM,
        tools: [SUBMIT_VERDICT_TOOL],
        messages: [{ role: 'user', content: refereePrompt(input) }],
      })
      // 首选工具调用（参数已被 schema 校验）；模型没用工具时退回文本 JSON。
      // 两条路都不抛：解析不出来就交给 parseRefereeOutput 走“无事发生 + notes”分支。
      const args = res.toolCalls.find((c) => c.name === 'submit_verdict')?.args
      const raw: unknown = args === undefined ? tryParseModelJson(res.text) : args
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
