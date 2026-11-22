/**
 * 10 拍 A/B：加不加世界事件抽卡。按"同条件重复 N 次"出分布，不看单点。
 *
 * base    ：只有玩家与人物（现状）。
 * storylet：同一脚本 + 每拍抽 0 到 1 条世界事件（环境前因读 ambient，后果前因读 facts）。
 *
 * 用法：
 *   node --experimental-strip-types scripts/experiment-storylet.ts --arm base --run 1
 *   node --experimental-strip-types scripts/experiment-storylet.ts --report
 * 证据：data/exp-storylet/<arm>/r<run>/journal.jsonl（data/ 不入库）
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { runBeat, type BeatDeps } from '@ai-world/core'
import { fmt } from '@ai-world/core'
import { createCognition } from '@ai-world/core'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '@ai-world/core'
import { createLlm } from '@ai-world/core'
import { createNarrator } from '@ai-world/core'
import { readonlyPiCredentials } from '@ai-world/core'
import { createLlmReferee, noRate } from '@ai-world/core'
import { openScene } from '@ai-world/core'
import { openStore, type JournalEntry } from '@ai-world/core'
import { seedCharacters } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from '@ai-world/content'
import type { World } from '@ai-world/core'
import { createStoryletSource, type DrawStats } from './storylet-pool.ts'

const { pack } = loadContentPack(STARTER_TOWN_PATH)

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const ARMS = ['base', 'storylet'] as const
type Arm = (typeof ARMS)[number]
const ARM: Arm = argOf('--arm') === 'storylet' ? 'storylet' : 'base'
const BEATS = Number(argOf('--beats') ?? 10)
const RUN = Number(argOf('--run') ?? 1)
const ROOT = 'data/exp-storylet'
const DIR = join(ROOT, ARM, `r${RUN}`)

// 与 play.ts 同一串探针输入：不为了 A/B 特意挑句子。
const LINES = [
  '我推门进去，找了个靠门的位子坐下。',
  '我在靠墙的桌边坐了一会儿，等雨小一点。',
  '我走到柜台前，问老板娘还有没有酒。',
  '我把两枚银元塞进安手里，要一杯威士忌。',
  '我把自己那杯威士忌喝掉。',
  '我凑到医生耳边，用只有他能听见的声音说：安把账本藏在柜台下面。',
  '我把那本账本推到柜台中间。',
  '我帮安把空杯收进木盆，端到柜台后面。',
  '我问医生这镇上最近死了几个人。',
  '我趴在靠墙的桌上睡了一整夜，天亮才醒。',
]

function sceneText(world: World): string {
  const actors = new Set([pack.player, ...pack.characters.map((c) => c.id)])
  const here = world.ledger.at[pack.player] ?? 'saloon'
  const present = Object.entries(world.ledger.at)
    .filter(([ent, place]) => actors.has(ent) && place === here)
    .map(([ent]) => ent)
  const lit = world.ledger.phys['lamp']?.['lit'] === true ? '灯还亮着' : '灯已经灭了'
  return `酒馆里：${present.map((ent) => pack.names[ent] ?? ent).join('、')}。${lit}。外面的雨没停。`
}

interface RunMetrics {
  run: number
  beats: number
  deadBeats: number
  claims: number
  verdicts: number
  noRate: number
  emptyRate: number
  opTotal: number
  ops: string
  factsPerBeat: number
  worldClaims: number
  worldPaid: number
  playerNo: number
  contested: number
}

function readJournal(dir: string): JournalEntry[] {
  const path = join(dir, 'journal.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
}

function summarize(dir: string, run: number): RunMetrics {
  const beats = readJournal(dir).filter((e) => e.type === 'beat')
  const verdicts = beats.flatMap((e) => e.verdicts)
  const claims = beats.flatMap((e) => e.claims)
  const ops = verdicts.flatMap((v) => v.deltas)
  const opCounts: Record<string, number> = {}
  for (const op of ops) opCounts[op.op] = (opCounts[op.op] ?? 0) + 1
  const empty = verdicts.filter((v) => v.ok && v.deltas.length === 0)
  const worldClaims = verdicts.filter((v) => v.claimId.startsWith('w'))
  const playerNo = verdicts.filter((v) => v.actor === pack.player && !v.ok)
  return {
    run,
    beats: beats.length,
    deadBeats: beats.filter((e) => !e.verdicts.some((v) => v.deltas.length > 0)).length,
    claims: claims.length,
    verdicts: verdicts.length,
    noRate: noRate(verdicts),
    emptyRate: verdicts.length === 0 ? 0 : empty.length / verdicts.length,
    opTotal: ops.length,
    ops: Object.entries(opCounts).map(([k, n]) => `${k} ${n}`).join(' / ') || '无',
    factsPerBeat: ops.filter((d) => d.op === 'fact').length / Math.max(1, beats.length),
    worldClaims: worldClaims.length,
    worldPaid: worldClaims.filter((v) => v.deltas.length > 0).length,
    playerNo: playerNo.length,
    contested: playerNo.filter((v) => (v.reason ?? '').includes('互斥')).length,
  }
}

function printRun(m: RunMetrics): void {
  process.stdout.write('\n=============== 本次体检 ===============\n')
  process.stdout.write(`臂 / run        ${ARM} / r${m.run}\n`)
  process.stdout.write(`空转拍          ${m.deadBeats} / ${m.beats}   （整拍账本没动）\n`)
  process.stdout.write(`claims          ${m.claims}   人均 ${(m.claims / Math.max(1, m.beats)).toFixed(2)}/拍\n`)
  process.stdout.write(`裁决            ${m.verdicts}   no_rate ${(m.noRate * 100).toFixed(1)}%   空结果 ${(m.emptyRate * 100).toFixed(1)}%\n`)
  process.stdout.write(`写操作          ${m.opTotal}   ${m.ops}\n`)
  process.stdout.write(`facts/beat      ${m.factsPerBeat.toFixed(2)}\n`)
  process.stdout.write(`玩家判 no       ${m.playerNo}（其中“互斥” ${m.contested}）\n`)
  if (ARM === 'storylet') {
    process.stdout.write(`世界事件落账    ${m.worldPaid} / ${m.worldClaims}\n`)
  }
}

/** 一列数字 → “1/2/1 中位 1（1–2）”，小数位可调。 */
function series(values: number[], digits = 0): string {
  if (values.length === 0) return '（无数据）'
  const shown = values.map((v) => v.toFixed(digits))
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length % 2 === 1 ? (sorted[Math.floor(sorted.length / 2)] ?? 0) : ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2
  const lo = sorted[0] ?? 0
  const hi = sorted[sorted.length - 1] ?? 0
  return `${shown.join('/')}  中位 ${mid.toFixed(digits)}（${lo.toFixed(digits)}–${hi.toFixed(digits)}）`
}

function report(): void {
  const byArm = new Map<Arm, RunMetrics[]>()
  for (const arm of ARMS) {
    const dir = join(ROOT, arm)
    const runs = existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => /^r\d+$/.test(name))
          .map((name) => summarize(join(dir, name), Number(name.slice(1))))
          .sort((a, b) => a.run - b.run)
      : []
    byArm.set(arm, runs)
  }
  const base = byArm.get('base') ?? []
  const storylet = byArm.get('storylet') ?? []
  if (base.length === 0 && storylet.length === 0) {
    process.stdout.write(`没有可汇总的 run：先跑 --arm base|storylet --run 1..N\n`)
    return
  }
  process.stdout.write(`A/B 汇总（每格：各 run 值 + 中位 + 范围）\n\n`)
  process.stdout.write(`指标                 base                          storylet\n`)
  const cols: { label: string; pick: (m: RunMetrics) => number; digits?: number }[] = [
    { label: '空转拍', pick: (m) => m.deadBeats },
    { label: 'claims', pick: (m) => m.claims },
    { label: 'no_rate %', pick: (m) => m.noRate * 100, digits: 1 },
    { label: '空结果 %', pick: (m) => m.emptyRate * 100, digits: 1 },
    { label: '写操作', pick: (m) => m.opTotal },
    { label: 'facts/beat', pick: (m) => m.factsPerBeat, digits: 2 },
    { label: '玩家判 no', pick: (m) => m.playerNo },
    { label: '其中互斥', pick: (m) => m.contested },
    { label: '世界事件落账', pick: (m) => m.worldPaid },
  ]
  for (const col of cols) {
    const left = series(base.map(col.pick), col.digits ?? 0)
    const right = series(storylet.map(col.pick), col.digits ?? 0)
    process.stdout.write(`${col.label.padEnd(20)} ${left.padEnd(30)} ${right}\n`)
  }
  process.stdout.write(`\n每臂 run 数：base ${base.length} / storylet ${storylet.length}（不足 3 次不要下结论）\n`)
}

async function runOne(): Promise<void> {
  rmSync(DIR, { recursive: true, force: true })
  const piDefault = readPiDefaultModel(join(homedir(), '.pi', 'agent')) ?? FALLBACK_MODEL
  const cfg = loadModelConfig(process.env.AI_WORLD_CONFIG ?? 'config/models.json', piDefault)
  const usage: Record<'cognition' | 'referee' | 'narration', { input: number; output: number; ms: number; calls: number }> = {
    cognition: { input: 0, output: 0, ms: 0, calls: 0 },
    referee: { input: 0, output: 0, ms: 0, calls: 0 },
    narration: { input: 0, output: 0, ms: 0, calls: 0 },
  }
  const llm = createLlm({
    models: cfg.models,
    credentials: readonlyPiCredentials(),
    sessionId: `storylet-${ARM}-r${RUN}-${randomUUID()}`,
    ...(cfg.retry ? { retry: cfg.retry } : {}),
    onUsage: (s) => {
      const u = usage[s.role]
      u.input += s.input
      u.output += s.output
      u.ms += s.ms
      u.calls += 1
    },
  })

  const store = openStore(DIR)
  const deps: BeatDeps = {
    referee: createLlmReferee(llm),
    cognition: createCognition(llm),
    narrator: createNarrator(llm),
    store,
  }
  const player = pack.player
  const participants = [player, ...pack.characters.map((c) => c.id)]
  let world: World = structuredClone(pack.world)
  const characters = new Map(seedCharacters(pack).map((c) => [c.id, c]))
  let scene = openScene({ id: 's1', place: world.ledger.at[player] ?? 'saloon', clock: 0, participants })
  const stats: DrawStats = { attempts: 0, picked: 0, pickedIds: [] }
  const claimSource = ARM === 'storylet' ? createStoryletSource(stats) : undefined

  process.stdout.write(`A/B 臂=${ARM} run=${RUN} 拍数=${BEATS} 模型 referee=${cfg.models.referee}\n\n`)
  const startedAt = performance.now()
  for (let i = 0; i < BEATS; i += 1) {
    const line = LINES[i % LINES.length] ?? ''
    const res = await runBeat({
      world,
      scene,
      characters,
      player,
      sceneText: sceneText(world),
      canon: pack.canon,
      names: pack.names,
      items: pack.items,
      aliases: pack.aliases,
      playerClaim: line,
      ...(claimSource ? { claimSource } : {}),
      deps,
    })
    world = res.world
    scene = res.scene
    const shaped = res.passage === '' ? '空' : `${res.passage.length} 字`
    process.stdout.write(
      `第 ${i + 1} 拍 · ${fmt(world.ledger.clock)} · 提交 ${res.committedClaims.length} · passage ${shaped}${res.notes.length ? ` · ${res.notes.join(' / ')}` : ''}\n`,
    )
    if (res.folded) {
      scene = openScene({ id: `s${i + 2}`, place: world.ledger.at[player] ?? 'saloon', clock: world.ledger.clock, participants })
    }
  }
  store.close()

  if (ARM === 'storylet') {
    process.stdout.write(`\n抽卡            尝试 ${stats.attempts} · 命中 ${stats.picked}（${stats.pickedIds.join(',') || '无'}）\n`)
  }
  process.stdout.write(`耗时            ${Math.round(performance.now() - startedAt)}ms\n`)
  for (const role of ['cognition', 'referee', 'narration'] as const) {
    const u = usage[role]
    process.stdout.write(`tokens ${role.padEnd(9)} ${u.input} / ${u.output}  调用 ${u.calls} 次 均 ${u.calls === 0 ? 0 : Math.round(u.ms / u.calls)}ms\n`)
  }
  printRun(summarize(DIR, RUN))
  process.stdout.write(`\n下一格：--arm ${ARM === 'base' ? 'storylet' : 'base'} --run ${ARM === 'base' ? RUN : RUN + 1}\n`)
}

void (process.argv.includes('--report') ? report() : runOne())
