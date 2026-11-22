/**
 * 10 拍 A/B：加不加世界事件抽卡。
 *
 * base   ：只有玩家与人物（现状）。
 * storylet：同一脚本 + 每拍抽 0 到 1 条世界事件（前因只读 facts，无因不抽）。
 *
 * 两臂都用 STARTER_TOWN 的原始世界、同一串玩家输入，各自独立的 store。
 * 只测"空转拍"与"账本变化"，不测文笔。
 *
 * 用法：
 *   node --experimental-strip-types scripts/experiment-storylet.ts --arm base
 *   node --experimental-strip-types scripts/experiment-storylet.ts --arm storylet
 * 证据：data/exp-storylet/<arm>/journal.jsonl（data/ 不入库）
 */
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { runBeat, type BeatDeps } from '../src/core/beat.ts'
import { createCognition } from '../src/core/cognition.ts'
import { fmt } from '../src/core/clock.ts'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '../src/core/config.ts'
import { createLlm } from '../src/core/llm.ts'
import { createNarrator } from '../src/core/narrate.ts'
import { readonlyPiCredentials } from '../src/core/pi-credentials.ts'
import { createLlmReferee, noRate } from '../src/core/referee.ts'
import { openScene } from '../src/core/scene.ts'
import { openStore } from '../src/core/store.ts'
import { STARTER_TOWN } from '../content/starter-town.ts'
import type { World } from '../src/core/world.ts'
import { createStoryletSource, type DrawStats } from './storylet-pool.ts'

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const ARM = argOf('--arm') === 'storylet' ? 'storylet' : 'base'
const BEATS = Number(argOf('--beats') ?? 10)
const DIR = join('data/exp-storylet', ARM)

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
  const actors = new Set([STARTER_TOWN.player, ...STARTER_TOWN.characters.map((c) => c.id)])
  const here = world.ledger.at[STARTER_TOWN.player] ?? 'saloon'
  const present = Object.entries(world.ledger.at)
    .filter(([ent, place]) => actors.has(ent) && place === here)
    .map(([ent]) => ent)
  const lit = world.ledger.phys['lamp']?.['lit'] === true ? '灯还亮着' : '灯已经灭了'
  return `酒馆里：${present.map((ent) => STARTER_TOWN.names[ent] ?? ent).join('、')}。${lit}。外面的雨没停。`
}

function pct(part: number, total: number): string {
  return total === 0 ? '0.0%' : `${((part / total) * 100).toFixed(1)}%`
}

async function main(): Promise<void> {
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
    sessionId: `storylet-${ARM}-${randomUUID()}`,
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
  const player = STARTER_TOWN.player
  const participants = [player, ...STARTER_TOWN.characters.map((c) => c.id)]
  let world: World = structuredClone(STARTER_TOWN.world)
  let characters = new Map(STARTER_TOWN.characters.map((c) => [c.id, structuredClone(c)]))
  let scene = openScene({ id: 's1', place: world.ledger.at[player] ?? 'saloon', clock: 0, participants })
  const stats: DrawStats = { attempts: 0, picked: 0, pickedIds: [] }
  const claimSource = ARM === 'storylet' ? createStoryletSource(llm, () => sceneText(world), stats) : undefined

  process.stdout.write(`A/B 臂=${ARM}  拍数=${BEATS}  模型 referee=${cfg.models.referee}\n\n`)
  const startedAt = performance.now()
  for (let i = 0; i < BEATS; i += 1) {
    const line = LINES[i % LINES.length] ?? ''
    const res = await runBeat({
      world,
      scene,
      characters,
      player,
      sceneText: sceneText(world),
      canon: STARTER_TOWN.canon,
      names: STARTER_TOWN.names,
      items: STARTER_TOWN.items,
      aliases: STARTER_TOWN.aliases,
      playerClaim: line,
      ...(claimSource ? { claimSource } : {}),
      deps,
    })
    world = res.world
    characters = res.characters
    scene = res.scene
    const touched = res.committedClaims.length
    const deltas = res.passage === '' ? 0 : 1
    process.stdout.write(
      `第 ${i + 1} 拍 · ${fmt(world.ledger.clock)} · claims ${touched} · passage ${deltas === 0 ? '空' : `${res.passage.length} 字`}${res.notes.length ? ` · ${res.notes.join(' / ')}` : ''}\n`,
    )
    if (res.folded) {
      scene = openScene({ id: `s${i + 2}`, place: world.ledger.at[player] ?? 'saloon', clock: world.ledger.clock, participants })
    }
  }
  store.close()

  const journal = openStore(DIR).readJournal()
  const beats = journal.filter((e) => e.type === 'beat')
  const verdicts = beats.flatMap((e) => e.verdicts)
  const claims = beats.flatMap((e) => e.claims)
  const ops = verdicts.flatMap((v) => v.deltas)
  const opCounts: Record<string, number> = {}
  for (const op of ops) opCounts[op.op] = (opCounts[op.op] ?? 0) + 1
  const silentBeats = beats.filter((e) => !e.verdicts.some((v) => v.deltas.length > 0)).length
  const empty = verdicts.filter((v) => v.ok && v.deltas.length === 0)
  const worldClaims = verdicts.filter((v) => v.claimId.startsWith('w'))
  const worldPaid = worldClaims.filter((v) => v.deltas.length > 0)
  const buckets = { '0–3': 0, '4–30': 0, '31–239': 0, '≥240': 0 }
  for (const v of verdicts) {
    if (!v.ok) continue
    if (v.duration <= 3) buckets['0–3'] += 1
    else if (v.duration <= 30) buckets['4–30'] += 1
    else if (v.duration < 240) buckets['31–239'] += 1
    else buckets['≥240'] += 1
  }
  const facts = beats.flatMap((e) => e.verdicts.flatMap((v) => v.deltas.filter((d) => d.op === 'fact')))

  process.stdout.write('\n=============== 体检 ===============\n')
  process.stdout.write(`空转拍          ${silentBeats} / ${beats.length}   （整拍账本没动）\n`)
  process.stdout.write(`claims          ${claims.length}   人均 ${(claims.length / Math.max(1, beats.length)).toFixed(2)}/拍\n`)
  process.stdout.write(`裁决            ${verdicts.length}   no_rate ${(noRate(verdicts) * 100).toFixed(1)}%   空结果 ${pct(empty.length, verdicts.length)}\n`)
  process.stdout.write(`写操作          ${ops.length}   ${Object.entries(opCounts).map(([k, n]) => `${k} ${n}`).join(' / ') || '无'}\n`)
  process.stdout.write(`facts/beat      ${(facts.length / Math.max(1, beats.length)).toFixed(2)}\n`)
  process.stdout.write(`duration 分桶   ${Object.entries(buckets).map(([k, n]) => `${k}: ${n}`).join(' | ')}\n`)
  if (ARM === 'storylet') {
    process.stdout.write(`抽卡            尝试 ${stats.attempts} · 命中 ${stats.picked}（${stats.pickedIds.join(',') || '无'}）\n`)
    process.stdout.write(`世界事件落账    ${worldPaid.length} / ${worldClaims.length}\n`)
  }
  process.stdout.write(`耗时            ${Math.round(performance.now() - startedAt)}ms\n`)
  for (const role of ['cognition', 'referee', 'narration'] as const) {
    const u = usage[role]
    process.stdout.write(`tokens ${role.padEnd(9)} ${u.input} / ${u.output}  调用 ${u.calls} 次 均 ${u.calls === 0 ? 0 : Math.round(u.ms / u.calls)}ms\n`)
  }
}

void main()
