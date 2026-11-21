/**
 * 试玩器：逐拍推进并把叙述原样打印，退出时打一张体检表。
 *
 * 逐拍跑 runBeat，把叙述原样打印出来，最后打一张体检表。
 * 用法：
 *   node --experimental-strip-types scripts/play.ts --beats 20
 *   node --experimental-strip-types scripts/play.ts --beats 3 --auto
 */
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { runBeat, type BeatDeps } from '../src/core/beat.ts'
import { createCognition } from '../src/core/cognition.ts'
import type { Character } from '../src/core/character.ts'
import { fmt } from '../src/core/clock.ts'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '../src/core/config.ts'
import { readonlyPiCredentials } from '../src/core/pi-credentials.ts'
import { createLlm } from '../src/core/llm.ts'
import { createNarrator } from '../src/core/narrate.ts'
import { createLlmReferee, noRate } from '../src/core/referee.ts'
import { openScene, type Scene } from '../src/core/scene.ts'
import { openStore } from '../src/core/store.ts'
import { STARTER_TOWN } from '../content/starter-town.ts'
import type { World } from '../src/core/world.ts'

const args = new Set(process.argv.slice(2))
const beatsArg = process.argv.indexOf('--beats')
const BEATS = beatsArg > 0 ? Number(process.argv[beatsArg + 1] ?? 20) : 20
const AUTO = args.has('--auto')
const DIR = 'data/starter-town'

const AUTO_LINES = [
  '我推门进去，找了个靠门的位子坐下。',
  '我问老板娘还有没有酒。',
  '我把那本账本推到柜台中间。',
  '我问医生这镇上最近死了几个人。',
  '我说我想在这儿找份活干。',
]

async function main(): Promise<void> {
  const usage = {
    cognition: { input: 0, output: 0, ms: 0, retries: 0, calls: 0 },
    referee: { input: 0, output: 0, ms: 0, retries: 0, calls: 0 },
    narration: { input: 0, output: 0, ms: 0, retries: 0, calls: 0 },
  }
  // 默认模型跟着 pi 自己的设置走（settings.json / PI_MODEL），配置文件只做覆盖
  const piDefault = readPiDefaultModel(join(homedir(), '.pi', 'agent')) ?? FALLBACK_MODEL
  const cfg = loadModelConfig(process.env.AI_WORLD_CONFIG ?? 'config/models.json', piDefault)
  const llm = createLlm({
    models: cfg.models,
    credentials: readonlyPiCredentials(),
    sessionId: `${cfg.sessionIdPrefix ?? 'play'}-${randomUUID()}`,
    ...(cfg.retry ? { retry: cfg.retry } : {}),
    onUsage: (s) => {
      const u = usage[s.role]
      u.input += s.input
      u.output += s.output
      u.ms += s.ms
      u.retries += s.retries
      u.calls += 1
    },
  })
  const deps: BeatDeps = {
    referee: createLlmReferee(llm),
    cognition: createCognition(llm),
    narrator: createNarrator(llm),
    store: openStore(DIR),
  }

  let world: World = structuredClone(STARTER_TOWN.world)
  let characters = new Map(STARTER_TOWN.characters.map((c) => [c.id, c as Character]))
  const player = STARTER_TOWN.player
  const participants = [player, ...STARTER_TOWN.characters.map((c) => c.id)]
  let scene: Scene = openScene({ id: 's1', place: world.ledger.at[player] ?? 'saloon', clock: 0, participants })

  stdout.write(`世界初始化：${participants.length} 个参与者，${STARTER_TOWN.canon.length} 条 canon\n`)
  stdout.write(`模型：cognition=${cfg.models.cognition} referee=${cfg.models.referee} narration=${cfg.models.narration}\n\n`)
  if (!AUTO) stdout.write('你说一句话或做一件事，一行就是一拍；输入 /quit 结束并出体检表。\n\n')
  const rl = AUTO ? undefined : createInterface({ input: stdin, output: stdout })

  for (let i = 1; i <= BEATS; i += 1) {
    const line = AUTO ? (AUTO_LINES[(i - 1) % AUTO_LINES.length] ?? '') : await rl?.question('你> ')
    // 自己试玩时用 /quit 收尾，否则 Ctrl+C 会跳过体检表
    if (line !== undefined && ['/quit', '/q'].includes(line.trim())) break
    const res = await runBeat({
      world,
      scene,
      characters,
      player,
      sceneText: describeScene(world),
      canon: STARTER_TOWN.canon,
      names: STARTER_TOWN.names,
      items: STARTER_TOWN.items,
      playerClaim: line,
      deps,
    })

    world = res.world
    characters = res.characters
    scene = res.scene

    stdout.write(`\n—— 第 ${i} 拍 · ${fmt(world.ledger.clock)} ——\n${res.passage}\n`)
    if (res.notes.length) stdout.write(`  · ${res.notes.join('\n  · ')}\n`)

    if (res.folded) {
      stdout.write(`\n【折场：${res.folded.reason}】\n`)
      scene = openScene({ id: `s${i + 1}`, place: world.ledger.at[player] ?? 'saloon', clock: world.ledger.clock, participants })
    }
  }
  rl?.close()

  const journal = deps.store.readJournal()
  const verdicts = journal.flatMap((e) => e.verdicts)
  const longActions = verdicts.filter((v) => v.ok && v.deltas.length === 0 && v.duration >= 240)
  const empty = verdicts.filter((v) => v.ok && v.deltas.length === 0)

  stdout.write('\n================ 体检表 ================\n')
  stdout.write(`拍数            ${journal.filter((e) => e.type === 'beat').length}\n`)
  stdout.write(`折场次数        ${journal.filter((e) => e.type === 'scene/fold').length}\n`)
  stdout.write(`裁决总数        ${verdicts.length}\n`)
  stdout.write(`no_rate        ${(noRate(verdicts) * 100).toFixed(1)}%   （期望 15–40%）\n`)
  stdout.write(`空结果占比      ${pct(empty.length, verdicts.length)}   （期望 < 50%）\n`)
  stdout.write(`长动作占比      ${pct(longActions.length, verdicts.length)}   （期望 < 20%）\n`)
  stdout.write(`结束时刻        ${fmt(world.ledger.clock)}\n`)
  for (const role of ['cognition', 'referee', 'narration'] as const) {
    const u = usage[role]
    const avg = u.calls === 0 ? 0 : Math.round(u.ms / u.calls)
    stdout.write(`tokens ${role.padEnd(9)} ${u.input} / ${u.output} | 调用 ${u.calls} 次 均耗时 ${avg}ms 重试 ${u.retries}\n`)
  }
  stdout.write('\n三条判据请自己回答：\n')
  stdout.write('  1) 你还想不想跟这个人说第 21 句话？\n')
  stdout.write('  2) 它做过至少 1 次你没预料、但事后觉得合理的事吗？\n')
  stdout.write('  3) 3 件事里至少 1 件是因为上次的后果才发生的吗？\n')
}

function describeScene(world: World): string {
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

void main()
