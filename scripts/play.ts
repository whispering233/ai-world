/**
 * 试玩器：逐拍推进并把叙述原样打印，退出时打一张体检表。
 *
 * 逐拍跑 runBeat，把叙述原样打印出来，最后打一张体检表。
 * 用法：
 *   node --experimental-strip-types scripts/play.ts --beats 20
 *   node --experimental-strip-types scripts/play.ts --beats 3 --auto
 */
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { runBeat, type BeatDeps } from '@ai-world/core'
import { createCognition } from '@ai-world/core'
import type { Character } from '@ai-world/core'
import { fmt } from '@ai-world/core'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '@ai-world/core'
import { readonlyPiCredentials } from '@ai-world/core'
import { createLlm } from '@ai-world/core'
import { createNarrator } from '@ai-world/core'
import { createLlmReferee } from '@ai-world/core'
import { healthView } from '@ai-world/core'
import { openScene, type Scene } from '@ai-world/core'
import { openStore, replay, replayCharacters } from '@ai-world/core'
import { seedCharacters } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from '@ai-world/content'
import type { Op, World } from '@ai-world/core'

const { pack } = loadContentPack(STARTER_TOWN_PATH)

const args = new Set(process.argv.slice(2))
const beatsArg = process.argv.indexOf('--beats')
const BEATS = beatsArg > 0 ? Number(process.argv[beatsArg + 1] ?? 20) : 20
const AUTO = args.has('--auto')
const FRESH = args.has('--fresh')
const DIR = 'data/starter-town'

// 探针混合四类：短对话 / 物理动作 / 长动作 / 知识交换；别只喂短对话。
// 每类守卫只出现一次：减量不能把这些事件一起减掉。
// 只在“有重复”的拍位插守卫：11 拍循环里同一句还会再出现一次，不会被守卫吞掉。
const GUARD_LINES: Record<number, string> = {
  3: '我说明天中午之前，一定把那两枚银元还上。',
  16: '我要是再听见你提这笔账，今晚就走。',
  18: '今晚这店我包了，谁也不用再付钱。',
}
const AUTO_LINES = [
  '我推门进去，找了个靠门的位子坐下。',
  '我在靠墙的桌边坐了一会儿，等雨小一点。',
  '我走到柜台前，问老板娘还有没有酒。',
  '我把两枚银元塞进安手里，要一杯威士忌。',
  '我把自己那杯威士忌喝掉。',
  '我凑到医生耳边，用只有他能听见的声音说：安把账本藏在柜台下面。',
  '我把那本账本推到柜台中间。',
  '我帮安把空杯收进木盆，端到柜台后面。',
  '我问医生这镇上最近死了几个人。',
]
// 长动作只跑一次；移动探针放最后一拍，避免出门后污染前面的基线。
const LONG_PROBE = '我趴在靠墙的桌上睡了一整夜，天亮才醒。'
const LONG_BEAT = 5
const FINAL_MOVE_PROBE = '我拉开门闩，推门走到街上。'
// HealthView 的桶键是 ASCII，体检表沿用 en dash 标签。
const DURATIONS = [
  ['0-3', '0–3'],
  ['4-30', '4–30'],
  ['31-239', '31–239'],
  ['240+', '≥240'],
] as const

async function main(): Promise<void> {
  const usage = {
    cognition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0, retries: 0, calls: 0 },
    referee: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0, retries: 0, calls: 0 },
    narration: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0, retries: 0, calls: 0 },
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
      u.cacheRead += s.cacheRead
      u.cacheWrite += s.cacheWrite
      u.ms += s.ms
      u.retries += s.retries
      u.calls += 1
    },
  })
  // --fresh 显式重开一局：只清 world 的两条日志，不碰其它目录。
  if (FRESH) {
    rmSync(join(DIR, 'journal.jsonl'), { force: true })
    rmSync(join(DIR, 'passage.jsonl'), { force: true })
  }
  const deps: BeatDeps = {
    referee: createLlmReferee(llm),
    cognition: createCognition(llm),
    narrator: createNarrator(llm),
    store: openStore(DIR),
  }

  const player = pack.player
  const participants = [player, ...pack.characters.map((c) => c.id)]
  const freshCharacters = (): Map<string, Character> =>
    new Map(seedCharacters(pack).map((c) => [c.id, c]))

  // 有 journal 就续跑：世界由 replay 复原，人物记忆由 replayCharacters 复原。
  const prior = deps.store.readJournal()
  const priorBeats = prior.filter((e) => e.type === 'beat').length
  let world: World = prior.length > 0 ? replay(prior, structuredClone(pack.world)) : structuredClone(pack.world)
  let characters = prior.length > 0 ? replayCharacters(prior, freshCharacters()) : freshCharacters()
  // 场景上下文不落 journal，续跑从新场景开始；人物记忆已经由 experience 复原。
  let scene: Scene = openScene({ id: `s${priorBeats + 1}`, place: world.ledger.at[player] ?? 'saloon', clock: world.ledger.clock, participants })

  if (priorBeats > 0) {
    stdout.write(`续跑：已完成 ${priorBeats} 拍，世界时刻 ${fmt(world.ledger.clock)}，人物 ${characters.size} 位\n`)
  } else {
    stdout.write(`世界初始化：${participants.length} 个参与者，${pack.canon.length} 条 canon\n`)
  }
  stdout.write(`模型：cognition=${cfg.models.cognition} referee=${cfg.models.referee} narration=${cfg.models.narration}\n\n`)
  if (!AUTO) stdout.write('你说一句话或做一件事，一行就是一拍；输入 /quit 结束并出体检表。\n\n')
  const rl = AUTO ? undefined : createInterface({ input: stdin, output: stdout })
  const startedAt = performance.now()
  const committedClaims = new Set<string>()
  const beatNotes: string[] = []
  const initialHolds = structuredClone(world.ledger.holds)

  for (let i = 1; i <= BEATS; i += 1) {
    const guard = GUARD_LINES[i]
    const line = AUTO
      ? i === BEATS && BEATS >= 10
        ? FINAL_MOVE_PROBE
        : i === LONG_BEAT
          ? LONG_PROBE
          : (guard ?? AUTO_LINES[(i - 1) % AUTO_LINES.length] ?? '')
      : await rl?.question('你> ')
    // 自己试玩时用 /quit 收尾，否则 Ctrl+C 会跳过体检表
    if (line !== undefined && ['/quit', '/q'].includes(line.trim())) break
    const res = await runBeat({
      world,
      scene,
      characters,
      player,
      sceneText: describeScene(world),
      canon: pack.canon,
      names: pack.names,
      items: pack.items,
      aliases: pack.aliases,
      playerClaim: line,
      deps,
    })

    world = res.world
    characters = res.characters
    scene = res.scene
    for (const claimId of res.committedClaims) committedClaims.add(`${res.journalSeq}:${claimId}`)
    beatNotes.push(...res.notes)

    stdout.write(`\n—— 第 ${priorBeats + i} 拍 · ${fmt(world.ledger.clock)} ——\n${res.passage}\n`)
    if (res.notes.length) stdout.write(`  · ${res.notes.join('\n  · ')}\n`)

    if (res.folded) {
      stdout.write(`\n【折场：${res.folded.reason}】\n`)
      scene = openScene({ id: `s${priorBeats + i + 1}`, place: world.ledger.at[player] ?? 'saloon', clock: world.ledger.clock, participants })
    }
  }
  rl?.close()

  const journal = deps.store.readJournal()
  const health = healthView({ journal, degraded: beatNotes.length })
  const verdicts = journal.flatMap((e) => e.verdicts)
  const committedVerdicts = journal.flatMap((e) => e.verdicts.filter((v) => committedClaims.has(`${e.seq}:${v.claimId}`)))
  const ops = committedVerdicts.flatMap((v) => v.deltas)
  const knowOps = ops.filter((d): d is Extract<Op, { op: 'know' }> => d.op === 'know')
  const factOps = ops.filter((d): d is Extract<Op, { op: 'fact' }> => d.op === 'fact')
  const actorFacts = factOps.filter((d) => d.actor !== undefined).length
  const kindFacts = factOps.filter((d) => d.kind !== undefined).length
  const knowPerClaim = committedVerdicts.length === 0 ? 0 : knowOps.length / committedVerdicts.length
  const knowListeners = knowOps.reduce((n, d) => n + d.who.length, 0)
  const knowAvgListeners = knowOps.length === 0 ? 0 : knowListeners / knowOps.length
  const factPerClaim = committedVerdicts.length === 0 ? 0 : factOps.length / committedVerdicts.length
  const opNames = ['move', 'transfer', 'consume', 'phys', 'rel', 'fact', 'know']
  const longActions = verdicts.filter((v) => v.ok && v.duration >= 240)
  const longEmpty = longActions.filter((v) => v.deltas.length === 0)
  const empty = verdicts.filter((v) => v.ok && v.deltas.length === 0)
  const nameLeaks = deps.store.readPassage().reduce((n, p) => n + (p.text.match(/\b(player|ann|doc|cody|granny)\b/g)?.length ?? 0), 0)
  const wallMs = Math.round(performance.now() - startedAt)
  const material = committedVerdicts.flatMap((v) =>
    v.deltas.filter((d) => d.op === 'transfer' || d.op === 'consume' || d.op === 'move').map(() => v.actor),
  )
  const playerMaterial = material.filter((actor) => actor === player).length
  const materialNotes = beatNotes.filter((n) => !n.startsWith('叙述里') && !n.startsWith('折场'))
  const itemErrors = materialNotes.filter((n) => n.includes('身上没有这么多')).length
  const netHolds = describeHoldChanges(initialHolds, world.ledger.holds, pack.names, pack.items)

  stdout.write('\n================ 体检表 ================\n')
  stdout.write(`拍数            ${health.beats}\n`)
  stdout.write(`折场次数        ${health.folds}\n`)
  stdout.write(`裁决总数        ${verdicts.length}\n`)
  stdout.write(`主张            act ${health.claims.act} / say ${health.claims.say}\n`)
  stdout.write(`no_rate        ${(health.noRate * 100).toFixed(1)}%   （期望 15–40%）\n`)
  stdout.write(`空结果占比      ${pct(empty.length, verdicts.length)}   （对话正常为空，不再当异常）\n`)
  stdout.write(`无变化拍        ${health.silentBeats} / ${health.beats}   （整拍账本没动）\n`)
  stdout.write(`长动作占比      ${pct(longActions.length, verdicts.length)}   （≥240min，全部 ok）\n`)
  stdout.write(`长且空占比      ${pct(longEmpty.length, verdicts.length)}\n`)
  stdout.write(`提交 claim      ${committedVerdicts.length} / ${verdicts.length}\n`)
  stdout.write(`写操作（已提交） ${ops.length}   ${opNames.map((n) => `${n} ${health.writeOps[n] ?? 0}`).join(' / ')}\n`)
  stdout.write(`物质 op 按 actor  player ${playerMaterial} / NPC ${material.length - playerMaterial}\n`)
  stdout.write(`净持有变化      ${netHolds}\n`)
  stdout.write(`know_rate      ${(health.knowRate * 100).toFixed(1)}%   （know / 已提交写操作）\n`)
  stdout.write(`know/claim     ${knowPerClaim.toFixed(2)}   平均听众 ${knowAvgListeners.toFixed(2)}\n`)
  stdout.write(`fact/claim     ${factPerClaim.toFixed(2)}\n`)
  stdout.write(`facts/beat     ${health.factsPerBeat.toFixed(2)}   （≤1.0 = 12 条覆盖一整场）\n`)
  stdout.write(`fact 结构化    actor ${actorFacts}/${factOps.length} · kind ${kindFacts}/${factOps.length}\n`)
  stdout.write(`duration 分桶   ${DURATIONS.map(([k, label]) => `${label}: ${health.durationBuckets[k]}`).join(' | ')}\n`)
  stdout.write(`名字泄漏        ${nameLeaks}   （期望 0）\n`)
  stdout.write(`item/持有错误   ${itemErrors}   （含“身上没有这么多”）\n`)
  if (materialNotes.length) stdout.write(`回滚/降级 notes  ${materialNotes.slice(0, 8).join(' | ')}\n`)
  stdout.write(`每拍墙钟        ${health.beats === 0 ? 0 : Math.round(wallMs / health.beats)}ms（总 ${wallMs}ms）\n`)
  stdout.write(`结束时刻        ${fmt(world.ledger.clock)}\n`)
  for (const role of ['cognition', 'referee', 'narration'] as const) {
    const u = usage[role]
    const avg = u.calls === 0 ? 0 : Math.round(u.ms / u.calls)
    stdout.write(`tokens ${role.padEnd(9)} ${u.input} / ${u.output} | cache ${u.cacheRead} / ${u.cacheWrite} | 调用 ${u.calls} 次 均耗时 ${avg}ms 重试 ${u.retries}\n`)
  }
  stdout.write('\n三条判据请自己回答：\n')
  stdout.write('  1) 你还想不想跟这个人说第 21 句话？\n')
  stdout.write('  2) 它做过至少 1 次你没预料、但事后觉得合理的事吗？\n')
  stdout.write('  3) 3 件事里至少 1 件是因为上次的后果才发生的吗？\n')
}

function describeScene(world: World): string {
  const actors = new Set([pack.player, ...pack.characters.map((c) => c.id)])
  const here = world.ledger.at[pack.player] ?? 'saloon'
  const present = Object.entries(world.ledger.at)
    .filter(([ent, place]) => actors.has(ent) && place === here)
    .map(([ent]) => ent)
  const lit = world.ledger.phys['lamp']?.['lit'] === true ? '灯还亮着' : '灯已经灭了'
  return `酒馆里：${present.map((ent) => pack.names[ent] ?? ent).join('、')}。${lit}。外面的雨没停。`
}

function describeHoldChanges(
  before: Record<string, Record<string, number>>,
  after: Record<string, Record<string, number>>,
  names: Record<string, string>,
  items: Record<string, string>,
): string {
  const changes: string[] = []
  const ents = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const ent of ents) {
    const itemIds = new Set([...Object.keys(before[ent] ?? {}), ...Object.keys(after[ent] ?? {})])
    for (const item of itemIds) {
      const delta = (after[ent]?.[item] ?? 0) - (before[ent]?.[item] ?? 0)
      if (delta !== 0) changes.push(`${names[ent] ?? ent} ${items[item] ?? item} ${delta > 0 ? '+' : ''}${delta}`)
    }
  }
  return changes.length > 0 ? changes.join('；') : '无'
}

function pct(part: number, total: number): string {
  return total === 0 ? '0.0%' : `${((part / total) * 100).toFixed(1)}%`
}

void main()
