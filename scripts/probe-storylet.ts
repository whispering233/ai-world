/**
 * 探针：裁判认不认「没有人的世界事件」。
 *
 * 只回答一个假设：把一条 actor 是非人实体（lamp/door/cellar）的 claim 交给裁判，
 *   ① 它会不会判 ok；
 *   ② 会不会真的写进账本（phys）；
 *   ③ 和玩家抢同一个世界状态时，是不是只让一方落账。
 *
 * 不测：条件求值器、填肉（模型把骨架写成一句话）、多拍进度、回放。
 * 那几样都要等这一步过了才值得做。
 *
 * 用法：node --experimental-strip-types scripts/probe-storylet.ts
 * 输出：data/probe-storylet/probe.jsonl + stdout 表（data/ 在 .gitignore 里）。
 */
import { mkdirSync, appendFileSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { describeLedger } from '@ai-world/core'
import { createLlm } from '@ai-world/core'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '@ai-world/core'
import { readonlyPiCredentials } from '@ai-world/core'
import { createLlmReferee, type Claim, type RefereeInput } from '@ai-world/core'
import { contextOf, openScene } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from '@ai-world/content'
import type { EntId, Op, World } from '@ai-world/core'

const { pack } = loadContentPack(STARTER_TOWN_PATH)
const DIR = 'data/probe-storylet'
const OUT = join(DIR, 'probe.jsonl')
const PLACE = 'saloon'

interface Skeleton {
  /** 抽中的 storylet id；将来进 Claim.source，这里只用来归因 */
  id: string
  /** 谁"做"了这件事——非人实体，在 ledger.at 里登记过 */
  actor: EntId
  /** 只读谓词：够不够格被抽中 */
  when: (w: World) => boolean
  /** 骨架被填成的一句话；这里用模板代替模型（填肉不在本探针范围） */
  text: string
  /** 和它抢同一件事的玩家主张 */
  rival: string
}

const SKELETONS: Skeleton[] = [
  {
    id: 'lamp-gutters',
    actor: 'lamp',
    when: (w) => w.ledger.phys['lamp']?.['lit'] === true,
    text: '灶膛里爆出一粒火星，落在灯芯上，灯焰跳了两下，然后灭了。',
    rival: '我伸手把灯芯掐灭。',
  },
  {
    id: 'door-blown-open',
    actor: 'door',
    when: (w) => w.ledger.phys['door']?.['closed'] === true,
    text: '风从门缝里挤进来，把没插紧的门闩顶开，门自己撞在墙上。',
    rival: '我按住门，不让它开。',
  },
  {
    id: 'cellar-hatch-lifts',
    actor: 'cellar',
    when: (w) => w.ledger.phys['cellar']?.['open'] === false,
    text: '地窖盖板被下面的水汽顶起一条缝，木边卡在半开的位置。',
    rival: '我一脚踩住地窖盖板。',
  },
]

function clone(): World {
  return structuredClone(pack.world)
}

function presentAt(world: World, place: string): EntId[] {
  return Object.entries(world.ledger.at)
    .filter(([, at]) => at === place)
    .map(([ent]) => ent)
}

function sceneText(world: World): string {
  const here = presentAt(world, PLACE)
  const names = here.map((ent) => pack.names[ent] ?? ent).join('、')
  const lit = world.ledger.phys['lamp']?.['lit'] === true ? '灯还亮着' : '灯已经灭了'
  return `酒馆里：${names}。${lit}。外面的雨没停。`
}

function refereeInput(world: World, claims: Claim[], clock: number): RefereeInput {
  const present = presentAt(world, PLACE)
  const scene = openScene({ id: 'probe', place: PLACE, clock, participants: present })
  const context = [
    sceneText(world),
    describeLedger(world, present, {
      names: pack.names,
      items: pack.items,
      aliases: pack.aliases,
      withIds: true,
    }),
    contextOf(scene, pack.player),
  ]
    .filter(Boolean)
    .join('\n')
  return { clock, claims, context }
}

function worldClaim(sk: Skeleton, clock: number): Claim {
  return { id: `w${clock}-${sk.id}`, actor: sk.actor, text: sk.text, kind: 'act' }
}

function playerClaim(sk: Skeleton, clock: number): Claim {
  return { id: `p${clock}-${sk.id}`, actor: pack.player, text: sk.rival, kind: 'act' }
}

function describeOp(d: Op): string {
  switch (d.op) {
    case 'move':
      return `move ${d.who}->${d.to}`
    case 'transfer':
      return `transfer ${d.item}×${d.n} ${d.from}->${d.to}`
    case 'consume':
      return `consume ${d.item}×${d.n} from ${d.from}`
    case 'phys':
      return `phys ${d.who}.${d.key}=${String(d.value)}`
    case 'rel':
      return `rel ${d.from}->${d.to}${d.delta > 0 ? '+' : ''}${d.delta}`
    case 'fact':
      return `fact ${d.actor ?? '-'}/${d.kind ?? '-'}`
    case 'know':
      return `know ${d.who.join(',')}`
  }
}

interface Row {
  arm: 'world' | 'competition'
  storylet: string
  actor: string
  ok: boolean
  deltas: string[]
  duration: number
  reason: string
  elapsedMs: number
}

const usage = { input: 0, output: 0, ms: 0, calls: 0, retries: 0 }

async function main(): Promise<void> {
  rmSync(OUT, { force: true })
  mkdirSync(DIR, { recursive: true })

  const piDefault = readPiDefaultModel(join(homedir(), '.pi', 'agent')) ?? FALLBACK_MODEL
  const cfg = loadModelConfig(process.env.AI_WORLD_CONFIG ?? 'config/models.json', piDefault)
  const llm = createLlm({
    models: cfg.models,
    credentials: readonlyPiCredentials(),
    sessionId: `storylet-probe-${randomUUID()}`,
    ...(cfg.retry ? { retry: cfg.retry } : {}),
    onUsage: (s: { input: number; output: number; ms: number; retries: number }) => {
      usage.input += s.input
      usage.output += s.output
      usage.ms += s.ms
      usage.retries += s.retries
      usage.calls += 1
    },
  })
  const referee = createLlmReferee(llm)
  process.stdout.write(`探针：裁判认不认非人 actor 的世界事件\n模型 referee=${cfg.models.referee}\n\n`)

  const rows: Row[] = []
  let consecutiveFailures = 0

  for (const sk of SKELETONS) {
    const clock = 0
    for (const arm of ['world', 'competition'] as const) {
      const world = clone()
      if (!sk.when(world)) {
        rows.push({ arm, storylet: sk.id, actor: sk.actor, ok: false, deltas: [], duration: 0, reason: '谓词不成立，未抽中（探针 bug）', elapsedMs: 0 })
        continue
      }
      const claims = arm === 'world' ? [worldClaim(sk, clock)] : [worldClaim(sk, clock), playerClaim(sk, clock)]
      const started = performance.now()
      try {
        const out = await referee.judge(refereeInput(world, claims, clock))
        const elapsed = Math.round(performance.now() - started)
        consecutiveFailures = 0
        for (const v of out.verdicts) {
          rows.push({
            arm,
            storylet: sk.id,
            actor: v.actor,
            ok: v.ok,
            deltas: v.deltas.map(describeOp),
            duration: v.duration,
            reason: v.reason ?? '',
            elapsedMs: elapsed,
          })
          appendFileSync(OUT, `${JSON.stringify({ arm, storylet: sk.id, clock, ...v, elapsedMs: elapsed })}\n`)
          process.stdout.write(
            `${arm.padEnd(11)} ${sk.id.padEnd(18)} ${v.ok ? 'ok ' : 'no '} ${String(v.duration).padStart(4)}m  ${v.deltas.map(describeOp).join(' ') || '（空）'}${v.reason ? `  ← ${v.reason}` : ''}\n`,
          )
        }
      } catch (error) {
        consecutiveFailures += 1
        const elapsed = Math.round(performance.now() - started)
        rows.push({ arm, storylet: sk.id, actor: sk.actor, ok: false, deltas: [], duration: 0, reason: `调用失败：${(error as Error).message}`, elapsedMs: elapsed })
        process.stdout.write(`${arm.padEnd(11)} ${sk.id.padEnd(18)} 调用失败：${(error as Error).message}\n`)
        // 同一端点连续失败两次就停：别把探针刷成压力测试。
        if (consecutiveFailures >= 2) {
          process.stdout.write('\n连续两次失败，探针中止。\n')
          report(rows)
          return
        }
      }
    }
  }
  report(rows)
}

function report(rows: readonly Row[]): void {
  const pct = (n: number, d: number): string => (d === 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`)
  const world = rows.filter((r) => r.arm === 'world')
  const elapsed = rows.reduce((n, r) => n + r.elapsedMs, 0)

  // 竞争臂按 storylet 分组：同一组的谁落账才算谁赢，一条 claim 没落账不代表另一方输。
  const groups = new Map<string, Row[]>()
  for (const r of rows.filter((x) => x.arm === 'competition')) {
    const key = r.storylet
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  let worldWins = 0
  let playerWins = 0
  let nobody = 0
  for (const group of groups.values()) {
    const worldPaid = group.some((r) => r.deltas.length > 0 && r.actor !== pack.player)
    const playerPaid = group.some((r) => r.deltas.length > 0 && r.actor === pack.player)
    if (worldPaid) worldWins += 1
    if (playerPaid) playerWins += 1
    if (!worldPaid && !playerPaid) nobody += 1
  }

  const lines = [
    '',
    '================ 探针结果 ================',
    `裁决条数        ${rows.length}（world ${world.length} / competition ${rows.length - world.length}）`,
    `world 臂        ok ${pct(world.filter((r) => r.ok).length, world.length)}  有 delta ${pct(world.filter((r) => r.deltas.length > 0).length, world.length)}  空结果 ${pct(world.filter((r) => r.ok && r.deltas.length === 0).length, world.length)}  含 phys ${pct(world.filter((r) => r.deltas.some((d) => d.startsWith('phys '))).length, world.length)}`,
    `竞争臂（按事件） 世界落账 ${worldWins} / 玩家落账 ${playerWins} / 都没落账 ${nobody}（共 ${groups.size}）`,
    `耗时            ${elapsed}ms  重试 ${usage.retries}`,
    '',
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
}

function replay(): void {
  const text = readFileSync(OUT, 'utf8')
  const rows: Row[] = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const v = JSON.parse(line) as { arm: Row['arm']; storylet: string; actor: string; ok: boolean; deltas: Op[]; duration: number; reason?: string; elapsedMs: number }
      return { arm: v.arm, storylet: v.storylet, actor: v.actor, ok: v.ok, deltas: v.deltas.map(describeOp), duration: v.duration, reason: v.reason ?? '', elapsedMs: v.elapsedMs }
    })
  report(rows)
}

void (process.argv.includes('--replay') ? replay() : main())
