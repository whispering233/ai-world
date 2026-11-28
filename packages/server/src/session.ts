/**
 * 会话：一个进程的一份内存态（docs/design/60-server.md §1 §2 §4）。
 *
 * 不依赖 HTTP：路由只做帧的适配，"有没有拍在结算"、"中止后世界不动"这些语义都在这里。
 * boot 与 scripts/play.ts 同源：有 journal 就 replay + replayCharacters，没有就 seedCharacters。
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type {
  AuthorBeatView,
  AuthorSessionView,
  BeatView,
  ContentStatusView,
  ModelRoleName,
  PromptCallView,
  SessionView,
  UsageView,
  WorldOptionView,
} from '@ai-world/shared'
import {
  authorView,
  createCognition,
  createLlmReferee,
  createNarrator,
  createSuggester,
  healthView,
  JOURNAL_FILE,
  openScene,
  openStore,
  PASSAGE_FILE,
  playerView,
  replay,
  replayCharacters,
  runBeat,
  seedCharacters,
  validatePack,
  zeroUsageByRole,
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
import { inferFocus } from './focus.ts'
import { withBeatScope, type BeatSink } from './llm.ts'

export interface WorldOption {
  id: string
  title: string
  /** data/<world>/：journal 与 passage 落在这里 */
  dir: string
  /** content/<world>.json：本项目唯一可写的文件，保存与开新局都读它 */
  contentPath: string
}

export interface SessionOptions {
  /** 可开的世界：开新局只能在这些里面选 */
  worlds: readonly WorldOption[]
  /** 本局启动用的世界 id，必须在 `worlds` 里 */
  world: string
  pack: ContentPack
  llm: Llm
  /** 一拍从拿锁到出结果的总时限，缺省 180s（见 60-server.md §4）；测试与慢机器的旋钮 */
  timeoutMs?: number
}

export interface BeatOutcome {
  seq: number
  view: SessionView
  beat: BeatView
}

/** 保存结果：只写盘，`activeHash` 仍是本局启动时那一份。 */
export interface SavedContent {
  saved: true
  activeHash: string
  diskHash: string
}

export interface Session {
  view(): SessionView
  authorView(): AuthorSessionView
  /** 单拍详情；seq 不存在返回 undefined */
  authorBeat(seq: number): AuthorBeatView | undefined
  /** 内容状态：每次现读磁盘重算 `diskHash` */
  content(): ContentStatusView
  /** 磁盘上的内容包原文 */
  contentText(): string
  contentPath(): string
  /** 唯一写入：校验通过后写 `content/`，不改 `activeHash`、不改运行时世界 */
  saveContent(text: string): SavedContent
  /** 单飞：已有拍在结算时立刻抛 `code: 'E_BEAT_IN_FLIGHT'`，不排队 */
  beat(
    text: string,
    signal: AbortSignal,
    onProgress: (elapsedMs: number, phase?: 'settled') => void,
    /** 对谁说：在场者的显示名；空串/缺省 = 自动推断（C10）；all=true = 显式所有人（C11） */
    to?: string,
    /** 显式「所有人」：跳过 `to` 解析与正文推断（C11）；与 `to` 互斥，路由层已拦 */
    all?: boolean,
  ): Promise<BeatOutcome>
  /**
   * 开新局：缺省重开当前世界。
   * `world` 不在 `worlds` 里抛 `E_UNKNOWN_WORLD`；目标内容包校验失败抛 `E_INVALID_CONTENT` + `errors`。
   * 两种失败都不动当前世界，也不碰任何一份日志。
   */
  reset(world?: string): void
  inFlight(): boolean
}

/** prompt 环形缓冲只留最近 3 拍（docs/api/30-api-author.md §2） */
const PROMPT_BEATS = 3
const PLAYER_TEXT_MAX = 500
const ROLES: ModelRoleName[] = ['cognition', 'referee', 'narration', 'suggest']
/** 两条日志的文件名由 `@ai-world/core` 的 store 导出（docs/db/schema.md §3 §4）。 */
/** 一拍总时限：只等客户端断开不够，provider 挂死会永远占着锁（60 §4） */
const BEAT_TIMEOUT_MS = 180_000

interface State {
  world: World
  characters: Map<EntId, Character>
  scene: Scene
  journal: JournalEntry[]
  passages: PassageEntry[]
}

export function createSession(opts: SessionOptions): Session {
  // 当前世界是 dir / contentPath 的唯一来源：切世界只改这一个变量，不留影子副本
  const initial = opts.worlds.find((w) => w.id === opts.world)
  if (initial === undefined) throw new Error(`worlds 里没有「${opts.world}」`)
  let active: WorldOption = initial
  let { pack } = opts
  let activeHash = contentHash(pack)
  let participants = roster(pack)
  // 本次进程累计，不是本局累计：进程重启归零，作者壳须注明
  const usage: Record<ModelRoleName, UsageView> = zeroUsageByRole()
  // 各角色最近一次实际使用的模型串：本拍没调到的角色沿用它，telemetry 才不缺角色
  const models: Record<ModelRoleName, string> = { cognition: '', referee: '', narration: '', suggest: '' }
  const notes = new Map<number, string[]>()
  const prompts: { seq: number; calls: PromptCallView[] }[] = []

  let store = openStore(active.dir)
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
      place: world.ledger.at[pack.player] ?? '',
      clock: world.ledger.clock,
      participants,
    })
    return { world, characters, scene, journal, passages: store.readPassage() }
  }

  function view(): SessionView {
    const view = playerView({
      title: pack.title,
      opening: pack.opening,
      player: pack.player,
      // 只有内容包里的人物算“人”：账本里还有灯、门、地窖门这类实体
      people: new Set(pack.characters.map((seed) => seed.id)),
      world: state.world,
      names: pack.names,
      items: pack.items,
      journal: state.journal,
      passages: state.passages,
      inFlight: busy,
    })
    // `playerView` 是纯函数投影，不碰 `content/`：世界列表只能在这里补
    return { ...view, worlds: worldViews() }
  }

  /** 可开的世界：按 id 升序，`active` 恰好一条。 */
  function worldViews(): WorldOptionView[] {
    return [...opts.worlds]
      .sort((a, b) => {
        if (a.id < b.id) return -1
        return a.id > b.id ? 1 : 0
      })
      .map((w) => ({ id: w.id, title: w.title, active: w.id === active.id }))
  }

  /**
   * 聚焦解析（决策 #48）：只按显示名在「玩家当前地点的人物」里唯一匹配。
   * 客户端不持有实体 id，所以对不上就退回所有人并留一条注记——不猜、也不阻挠这一拍。
   */
  function resolveFocus(to: string | undefined): { focus?: EntId; note?: string } {
    const name = (to ?? '').trim()
    if (name === '') return {}
    const failed = (why: string): { note: string } => ({ note: `聚焦失败（本拍按所有人结算）：${why}` })
    if (name === pack.names[pack.player]) return failed('目标是玩家自己')
    const hits = presentPeople(pack, state.world).filter((ent) => pack.names[ent] === name)
    const only = hits[0]
    if (hits.length === 1 && only !== undefined) return { focus: only }
    return hits.length === 0 ? failed(`当前地点没有叫「${name}」的人`) : failed(`「${name}」重名，无法唯一匹配`)
  }

  /**
   * 没发 `to` 时的自动聚焦（C10）：按玩家原话里的唯一人名补目标。
   * 显式 `to` 失效时**不**走到这里——那是玩家点错了人，静默改成别人比“所有人”更糟。
   */
  function inferFocusFromClaim(text: string, note: string | undefined): EntId | undefined {
    if (note !== undefined) return undefined
    return inferFocus({
      text,
      people: presentPeople(pack, state.world),
      names: pack.names,
      ...(pack.aliases === undefined ? {} : { aliases: pack.aliases }),
    })
  }

  /**
   * 一拍的聚焦：`all` = 玩家显式点的「所有人」（C11），既不解析 `to`、也不按正文推断，
   * 否则维持 C10：显式 `to` 优先，失效时不回退自动聚焦，只有没给 `to` 才推断。
   */
  function beatFocus(text: string, to: string | undefined, all: boolean): { focus?: EntId; note?: string } {
    if (all) return {}
    const { focus: explicit, note } = resolveFocus(to)
    if (explicit !== undefined) return { focus: explicit }
    const inferred = inferFocusFromClaim(text, note)
    if (inferred !== undefined) return { focus: inferred }
    return note === undefined ? {} : { note }
  }

  function content(): ContentStatusView {
    const disk = diskHash()
    return { path: active.contentPath, activeHash, diskHash: disk, changed: activeHash !== disk }
  }

  function diskHash(): string {
    try {
      return contentHash(JSON.parse(readFileSync(active.contentPath, 'utf8')) as ContentPack)
    } catch {
      // 读不到或不是 JSON：与生效版本必然不同，作者壳显示“未生效”，不会静默说“没变”
      return ''
    }
  }

  function contentText(): string {
    return readFileSync(active.contentPath, 'utf8')
  }

  function saveContent(text: string): SavedContent {
    if (busy) throw coded('E_BEAT_IN_FLIGHT', '上一拍还在结算')
    let next: ContentPack
    try {
      next = JSON.parse(text) as ContentPack
    } catch {
      throw coded('E_INVALID_BODY', '内容不是合法 JSON')
    }
    let errors: string[]
    try {
      errors = validatePack(next)
    } catch (error) {
      // 校验器自己崩了也算“内容不合法”：这里绝不把 500 抛给作者壳
      errors = [`内容结构无法校验：${(error as Error).message}`]
    }
    // 校验不过就不碰磁盘：写坏的内容会让下一次启动直接失败
    if (errors.length > 0) {
      throw Object.assign(coded('E_INVALID_CONTENT', `内容校验失败：${errors.join('；')}`), { errors })
    }
    const tmp = join(dirname(active.contentPath), `.${basename(active.contentPath)}.tmp`)
    writeFileSync(tmp, text)
    // 先写临时文件再 rename：rename 是原子的，不会留下半份内容包
    renameSync(tmp, active.contentPath)
    return { saved: true, activeHash, diskHash: diskHash() }
  }

  function sessionAuthorView(): AuthorSessionView {
    const degraded = [...notes.values()].reduce((n, list) => n + list.length, 0)
    return authorView({
      title: pack.title,
      world: state.world,
      characters: state.characters,
      names: pack.names,
      journal: state.journal,
      passages: state.passages,
      content: content(),
      usage,
      health: healthView({ journal: state.journal, degraded }),
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
    clientSignal: AbortSignal,
    onProgress: (elapsedMs: number, phase?: 'settled') => void,
    to?: string,
    all?: boolean,
  ): Promise<BeatOutcome> {
    if (busy) throw coded('E_BEAT_IN_FLIGHT', '上一拍还在结算')
    busy = true
    const playerClaim = clip(text)
    // 聚焦先解析：显式 all 不碰；否则显式 to 优先，对不上就退回所有人并留注记，不阻挠本拍（决策 #48）
    const { focus, note: focusNote } = beatFocus(playerClaim, to, all === true)
    const startedAt = performance.now()
    // 客户端断开与总时限合成一个 signal：超时走与模型失败同一条降级路径，世界不动
    const deadline = AbortSignal.timeout(opts.timeoutMs ?? BEAT_TIMEOUT_MS)
    const signal = AbortSignal.any([clientSignal, deadline])
    // progress 兼作心跳：每秒一帧，从拿锁起算
    const timer = setInterval(() => onProgress(Math.round(performance.now() - startedAt)), 1000)
    timer.unref()
    const sink: BeatSink = {
      telemetry: {
        models: { ...models },
        usage: zeroUsageByRole(),
      },
      calls: [],
    }
    const scoped = withBeatScope(opts.llm, signal, sink)
    try {
      const res = await runBeat({
        world: state.world,
        scene: state.scene,
        characters: state.characters,
        player: pack.player,
        // 稀缺窗口用拍号：journal 里已有的拍数 + 1（本拍失败则不落盘，计数自然不前进）
        beatIndex: state.journal.filter((e) => e.type === 'beat').length + 1,
        sceneText: sceneText(pack, state.world),
        canon: pack.canon,
        names: pack.names,
        items: pack.items,
        ...(pack.aliases === undefined ? {} : { aliases: pack.aliases }),
        playerClaim,
        ...(focus === undefined ? {} : { playerTo: focus }),
        telemetry: sink.telemetry,
        // 账本落定 = 可证的中途状态（docs/api/20-api-beat.md §2）：裁判返回后立刻报一次
        onSettled: () => onProgress(Math.round(performance.now() - startedAt), 'settled'),
        deps: {
          referee: createLlmReferee(scoped),
          cognition: createCognition(scoped),
          narrator: createNarrator(scoped),
          suggester: createSuggester(scoped),
          store,
        },
      })
      // journalSeq === 0 = 这一拍没有发生（裁决失败）：世界不动，只有注记
      if (res.journalSeq === 0) {
        const head = deadline.aborted && !clientSignal.aborted ? `本拍超过 ${Math.ceil((opts.timeoutMs ?? BEAT_TIMEOUT_MS) / 1000)} 秒未结算` : ''
        throw coded(
          'E_MODEL_CALL',
          [head, ...(focusNote === undefined ? [] : [focusNote]), ...res.notes].filter((s) => s !== '').join('；') || '模型调用失败',
        )
      }

      state.world = res.world
      state.characters = res.characters
      state.scene = res.scene
      // 折场会额外写一条 journal，整份重读比手工维护账目更省
      state.journal = store.readJournal()
      state.passages = store.readPassage()
      notes.set(res.journalSeq, [
        ...(playerClaim === text ? [] : [`玩家输入超过 ${PLAYER_TEXT_MAX} 字，已截断`]),
        ...(focusNote === undefined ? [] : [focusNote]),
        ...res.notes,
      ])
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

  function reset(world?: string): void {
    if (busy) throw coded('E_BEAT_IN_FLIGHT', '上一拍还在结算')
    const target = world === undefined ? active : opts.worlds.find((w) => w.id === world)
    if (target === undefined) throw coded('E_UNKNOWN_WORLD', `没有内容包「${world ?? ''}」`)
    // 读盘与校验都在切世界之前：内容坏了就什么都不动，既不切目录也不留半局。
    // 新局用磁盘上的那一份：保存只写盘，生效靠重开（docs/design/60-server.md §5）。
    const reloaded = readPack(target.contentPath)
    active = target
    pack = reloaded.pack
    activeHash = reloaded.hash
    participants = roster(pack)
    // 只清这两份日志：本局的全部世界状态就是它们，内容与人物来自内容包
    store.close()
    rmSync(join(active.dir, JOURNAL_FILE), { force: true })
    rmSync(join(active.dir, PASSAGE_FILE), { force: true })
    store = openStore(active.dir)
    state = boot()
    notes.clear()
    prompts.length = 0
  }

  /** 开新局要读的内容包：读不到 / 不是 JSON / 校验失败都是 `E_INVALID_CONTENT` + `errors`。 */
  function readPack(path: string): { pack: ContentPack; hash: string } {
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (error) {
      throw invalidContent([`读不到内容包 ${path}：${(error as Error).message}`])
    }
    let next: ContentPack
    try {
      next = JSON.parse(text) as ContentPack
    } catch (error) {
      throw invalidContent([`内容包 ${path} 不是合法 JSON：${(error as Error).message}`])
    }
    let errors: string[]
    try {
      errors = validatePack(next)
    } catch (error) {
      // 校验器自己崩了也算“内容不合法”：这里绝不把 500 抛给开新局的人
      errors = [`内容结构无法校验：${(error as Error).message}`]
    }
    if (errors.length > 0) throw invalidContent(errors)
    return { pack: next, hash: contentHash(next) }
  }

  function invalidContent(errors: string[]): Error {
    return Object.assign(coded('E_INVALID_CONTENT', `内容校验失败：${errors.join('；')}`), { errors })
  }

  return {
    view,
    authorView: sessionAuthorView,
    authorBeat,
    content,
    contentText,
    contentPath: () => active.contentPath,
    saveContent,
    beat,
    reset,
    inFlight: () => busy,
  }
}

/** 场景参与者：玩家 + 内容包里的人物（账本里的灯、门不算人）。 */
function roster(pack: ContentPack): EntId[] {
  return [pack.player, ...pack.characters.map((c) => c.id)]
}

/** 玩家当前地点的人物（不含玩家自己）：聚焦的候选集。 */
function presentPeople(pack: ContentPack, world: World): EntId[] {
  const place = world.ledger.at[pack.player] ?? ''
  return roster(pack).filter((ent) => ent !== pack.player && (world.ledger.at[ent] ?? '') === place)
}

/**
 * 场景的静态描述：作者写的现场 + 本拍的地点和在场者，与 play.ts 的 describeScene 同源。
 * 在场只列玩家与人物：账本里还有门、灯、柜台这类非人实体（docs/design/10-world-model.md §10），
 * 它们是现场的物件，不是在场者。
 */
function sceneText(pack: ContentPack, world: World): string {
  const here = world.ledger.at[pack.player] ?? ''
  const present = roster(pack)
    .filter((ent) => world.ledger.at[ent] === here)
    .map((ent) => pack.names[ent] ?? ent)
  return [pack.scene?.trim() ?? '', `${world.places[here] ?? here}：${present.join('、')}在场。`]
    .filter((line) => line !== '')
    .join('\n')
}

/** 请求体上限 500 字：超长截断（并在 notes 记一条），不返回错误。 */
function clip(text: string): string {
  const points = Array.from(text)
  return points.length <= PLAYER_TEXT_MAX ? text : points.slice(0, PLAYER_TEXT_MAX).join('')
}

function coded(code: string, msg: string): Error & { code: string } {
  return Object.assign(new Error(msg), { code })
}
