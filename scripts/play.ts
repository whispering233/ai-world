/**
 * 20 回合试玩器（任务卡 W14 的验收工具）。
 *
 * 逐拍跑 runBeat，把叙述原样打印出来，最后打一张体检表。
 * 用法：
 *   node --experimental-strip-types scripts/play.ts --beats 20
 *   node --experimental-strip-types scripts/play.ts --beats 3 --auto
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { runBeat, type BeatDeps } from '../src/core/beat.ts'
import { createCognition } from '../src/core/cognition.ts'
import type { Character } from '../src/core/character.ts'
import { fmt } from '../src/core/clock.ts'
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
  const usage = { input: 0, output: 0 }
  const llm = createLlm({
    models: { fast: 'deepseek/deepseek-flash', strong: 'deepseek/deepseek-v4-pro', mid: 'deepseek/deepseek-flash' },
    onUsage: (s) => {
      usage.input += s.input
      usage.output += s.output
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

  stdout.write(`世界初始化：${participants.length} 个参与者，${STARTER_TOWN.canon.length} 条 canon\n\n`)
  const rl = AUTO ? undefined : createInterface({ input: stdin, output: stdout })

  for (let i = 1; i <= BEATS; i += 1) {
    const line = AUTO ? (AUTO_LINES[(i - 1) % AUTO_LINES.length] ?? '') : await rl?.question('你> ')
    const res = await runBeat({
      world,
      scene,
      characters,
      player,
      sceneText: describeScene(world),
      canon: STARTER_TOWN.canon,
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
  stdout.write(`tokens 输入/输出  ${usage.input} / ${usage.output}\n`)
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
  return `酒馆里：${present.join('、')}。${lit}。外面的雨没停。`
}

function pct(part: number, total: number): string {
  return total === 0 ? '0.0%' : `${((part / total) * 100).toFixed(1)}%`
}

void main()
