/**
 * 会话：一个进程的一份内存态（docs/design/60-server.md §1 §2 §4）。
 *
 * 不依赖 HTTP：路由只做帧的适配，"有没有拍在结算"、"中止后世界不动"这些语义都在这里。
 * boot 与 scripts/play.ts 同源：有 journal 就 replay + replayCharacters，没有就 seedCharacters。
 */
import { rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  AuthorBeatView,
  AuthorSessionView,
  BeatView,
  ContentStatusView,
  ModelRoleName,
  PromptCallView,
  SessionView,
  UsageView,
} from '@ai-world/shared'
import {
  authorView,
  createCognition,
  createLlmReferee,
  createNarrator,
  healthView,
  openScene,
  openStore,
  playerView,
  replay,
  replayCharacters,
  runBeat,
  seedCharacters,
  type BeatTelemetry,
  type Character,
  type ContentPack,
  type EntId,
  type JournalEntry,
  type Llm,
  type PassageEntry,
  type Scene,
  type World,
} from '@ai-world/core'
import { contentHash } from '@ai-world/content'
import { emptyUsage, withBeatScope, type BeatSink } from './llm.ts'

export interface SessionOptions {
  /** data/<world>/：journal 与 passage 落在这里 */
  dir: string
  pack: ContentPack
  llm: Llm
  title: string
}

export interface BeatOutcome {
  seq: number
  view: SessionView
  beat: BeatView
}

export interface Session {
  view(): SessionView
  authorView(): AuthorSessionView
  /** 单拍详情；seq 不存在返回 undefined */
  authorBeat(seq: number): AuthorBeatView | undefined
  /** 单飞：已有拍在结算时立刻抛 `code: 'E_BEAT_IN_FLIGHT'`，不排队 */
  beat(text: string, signal: AbortSignal, onProgress: (elapsedMs: number) => void): Promise<BeatOutcome>
  reset(): void
  inFlight(): boolean
}

/** prompt 环形缓冲只留最近 3 拍（docs/api/30-api-author.md §2） */
const PROMPT_BEATS = 3
const PLAYER_TEXT_MAX = 500
const ROLES: ModelRoleName[] = ['cognition', 'referee', 'narration']
/** journal.jsonl / passage.jsonl 是 schema 里的存储契约（docs/db/schema.md §3 §4） */
const JOURNAL = 'journal.jsonl'
const PASSAGE = 'passage.jsonl'

interface State {
  world: World
  characters: Map<EntId, Character>
  scene: Scene
  journal: JournalEntry[]
  passages: PassageEntry[]
}

export function createSession(opts: SessionOptions): Session {
  const { pack } = opts
  const player = pack.player
  const participants = [player, ...pack.characters.map((c) => c.id)]
  const activeHash = contentHash(pack)
  // 本次进程累计，不是本局累计：进程重启归零，作者壳须注明
  const usage: Record<ModelRoleName, UsageView> = {
    cognition: emptyUsage(),
    referee: emptyUsage(),
    narration: emptyUsage(),
  }
  // 各角色最近一次实际使用的模型串：本拍没调到的角色沿用它，telemetry 才不缺角色
  const models: Record<ModelRoleName, string> = { cognition: '', referee: '', narration: '' }
  const committed = new Set<string>()
  const notes = new Map<number, string[]>()
  const prompts: { seq: number; calls: PromptCallView[] }[] = []

  let store = openStore(opts.dir)
  let state = boot()
  let busy = false

  function freshCharacters(): Map<EntId, Character> {
    return new Map(seedCharacters(pack).map((c) => [c.id, c]))
  }

  function boot(): State {
    const journal = store.readJournal()
    // 有 journal 就续跑：世界由 replay 复原，人物记忆由 replayCharacters 复原
    const world = journal.length > 0 ? replay(journal, structuredClone(pack.world)) : structuredClone(pack.world)
    const characters = journal.length > 0 ? replayCharacters(journal, freshCharacters()) : freshCharacters()
    const beats = journal.filter((e) => e.type === 'beat').length
    // 场景上下文不落盘：续跑从新场景开始，人物记忆已经由 experience 复原
    const scene = openScene({
      id: `s${beats + 1}`,
      place: world.ledger.at[player] ?? '',
      clock: world.ledger.clock,
      participants,
    })
    return { world, characters, scene, journal, passages: store.readPassage() }
  }

  function view(): SessionView {
    return playerView({
      title: opts.title,
      player,
      // 只有内容包里的人物算“人”：账本里还有灯、门、地窖门这类实体
      people: new Set(pack.characters.map((seed) => seed.id)),
      world: state.world,
      names: pack.names,
      items: pack.items,
      journal: state.journal,
      passages: state.passages,
      inFlight: busy,
    })
  }

  function content(): ContentStatusView {
    // 本卡没有保存端点：diskHash 直接沿用启动时算出的值，changed 恒为 false。W6-4 补读盘。
    return { path: `content/${basename(opts.dir)}.json`, activeHash, diskHash: activeHash, changed: false }
  }

  function sessionAuthorView(): AuthorSessionView {
    const degraded = [...notes.values()].reduce((n, list) => n + list.length, 0)
    return authorView({
      title: opts.title,
      world: state.world,
      characters: state.characters,
      names: pack.names,
      journal: state.journal,
      passages: state.passages,
      content: content(),
      usage,
      health: healthView({ journal: state.journal, committed, degraded }),
      prompts: prompts.slice(-PROMPT_BEATS),
    })
  }

  function authorBeat(seq: number): AuthorBeatView | undefined {
    const entry = state.journal.find((e) => e.seq === seq)
    if (entry === undefined) return undefined
    const passage = state.passages.find((p) => p.beatSeq === seq)
    return {
      entry,
      ...(passage === undefined ? {} : { passage }),
      prompts: prompts.find((p) => p.seq === seq)?.calls ?? [],
      notes: notes.get(seq) ?? [],
    }
  }

  async function beat(
    text: string,
    signal: AbortSignal,
    onProgress: (elapsedMs: number) => void,
  ): Promise<BeatOutcome> {
    if (busy) throw coded('E_BEAT_IN_FLIGHT', '上一拍还在结算')
    busy = true
    const startedAt = performance.now()
    // progress 兼作心跳：每秒一帧，从拿锁起算
    const timer = setInterval(() => onProgress(Math.round(performance.now() - startedAt)), 1000)
    timer.unref()
    const sink: BeatSink = {
      telemetry: {
        models: { ...models },
        usage: { cognition: emptyUsage(), referee: emptyUsage(), narration: emptyUsage() },
      },
      calls: [],
    }
    const scoped = withBeatScope(opts.llm, signal, sink)
    const playerClaim = clip(text)
    try {
      const res = await runBeat({
        world: state.world,
        scene: state.scene,
        characters: state.characters,
        player,
        sceneText: sceneText(pack, state.world),
        canon: pack.canon,
        names: pack.names,
        items: pack.items,
        ...(pack.aliases === undefined ? {} : { aliases: pack.aliases }),
        playerClaim,
        telemetry: sink.telemetry,
        deps: {
          referee: createLlmReferee(scoped),
          cognition: createCognition(scoped),
          narrator: createNarrator(scoped),
          store,
        },
      })
      // journalSeq === 0 = 这一拍没有发生（裁决失败）：世界不动，只有注记
      if (res.journalSeq === 0) throw coded('E_MODEL_CALL', res.notes.join('；') || '模型调用失败')

      state.world = res.world
      state.characters = res.characters
      state.scene = res.scene
      // 折场会额外写一条 journal，整份重读比手工维护账目更省
      state.journal = store.readJournal()
      state.passages = store.readPassage()
      notes.set(res.journalSeq, [...(playerClaim === text ? [] : [`玩家输入超过 ${PLAYER_TEXT_MAX} 字，已截断`]), ...res.notes])
      for (const claimId of res.committedClaims) committed.add(`${res.journalSeq}:${claimId}`)
      prompts.push({ seq: res.journalSeq, calls: sink.calls })
      if (prompts.length > PROMPT_BEATS) prompts.shift()

      const next = view()
      const beatView = next.beats.find((b) => b.seq === res.journalSeq)
      if (beatView === undefined) throw coded('E_INTERNAL', `journal 里找不到本拍 ${res.journalSeq}`)
      return { seq: res.journalSeq, view: next, beat: beatView }
    } finally {
      clearInterval(timer)
      busy = false
      accumulate(sink.telemetry)
    }
  }

  function accumulate(telemetry: BeatTelemetry): void {
    for (const role of ROLES) {
      const from = telemetry.usage[role]
      const to = usage[role]
      to.input += from.input
      to.output += from.output
      to.cacheRead += from.cacheRead
      to.cacheWrite += from.cacheWrite
      to.cost += from.cost
      to.ms += from.ms
      to.retries += from.retries
      to.calls += from.calls
      const model = telemetry.models[role]
      if (model !== '') models[role] = model
    }
  }

  function reset(): void {
    if (busy) throw coded('E_BEAT_IN_FLIGHT', '上一拍还在结算')
    // 只清这两份日志：本局的全部世界状态就是它们，内容与人物来自内容包
    store.close()
    rmSync(join(opts.dir, JOURNAL), { force: true })
    rmSync(join(opts.dir, PASSAGE), { force: true })
    store = openStore(opts.dir)
    state = boot()
    committed.clear()
    notes.clear()
    prompts.length = 0
  }

  return { view, authorView: sessionAuthorView, authorBeat, beat, reset, inFlight: () => busy }
}

/** 场景的静态描述：本拍的地点和在场者，与 play.ts 的 describeScene 同源。 */
function sceneText(pack: ContentPack, world: World): string {
  const here = world.ledger.at[pack.player] ?? ''
  const present = Object.entries(world.ledger.at)
    .filter(([, place]) => place === here)
    .map(([ent]) => pack.names[ent] ?? ent)
  return `${world.places[here] ?? here}：${present.join('、')}在场。`
}

/** 请求体上限 500 字：超长截断（并在 notes 记一条），不返回错误。 */
function clip(text: string): string {
  const points = Array.from(text)
  return points.length <= PLAYER_TEXT_MAX ? text : points.slice(0, PLAYER_TEXT_MAX).join('')
}

function coded(code: string, msg: string): Error & { code: string } {
  return Object.assign(new Error(msg), { code })
}
