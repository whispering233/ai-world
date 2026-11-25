/**
 * 传输契约：玩家投影、作者投影与 SSE 帧的**线上格式**。
 *
 * 零 import：浏览器与服务端共用，不含任何运行时依赖。
 *
 * 这些类型不是领域模型。`packages/core` 负责把领域对象映射成它们，映射函数就是漂移的检查点：
 * 领域类型一变，映射处编译不过，所以这里不必机械地跟随 `world.ts` / `referee.ts`。
 */

export type ModelRoleName = 'cognition' | 'referee' | 'narration' | 'suggest'

/* ── 玩家投影 ─────────────────────────────────────────── */

export interface HoldsView {
  name: string
  count: number
}

export interface KnownFactView {
  text: string
  clockText: string
  /** 已被推翻的事实仍然列出，只是打标 */
  superseded: boolean
}

export interface PlayerStateView {
  place: string
  here: string[]
  holds: HoldsView[]
  knows: KnownFactView[]
}

export interface BeatView {
  /** journal 的 seq，仅用于稳定列表键；界面不展示 */
  seq: number
  clock: number
  clockText: string
  /** 玩家本拍输入原文；缺省表示本拍没有玩家发言 */
  player?: string
  /** 本拍玩家说话对象的显示名；缺省表示对所有人/无目标 */
  playerTo?: string
  /** 旁白正文；缺省表示 passage 落盘失败 */
  passage?: string
  /** true = 旁白失败，passage 是事实摘要兜底 */
  fallback: boolean
  /** 本拍生成的动作提示（≤3 条）；失败时缺省，不影响正文 */
  hints?: string[]
}

export interface SessionView {
  title: string
  /** 首屏散文：来自 `ContentPack.opening`；缺失时前端回退场景卡 */
  opening?: string
  clock: number
  clockText: string
  state: PlayerStateView
  beats: BeatView[]
  inFlight: boolean
}

/* ── SSE 帧 ───────────────────────────────────────────── */

export const SSE_EVENTS = ['progress', 'passage', 'state', 'done', 'error'] as const
export type SseEventName = (typeof SSE_EVENTS)[number]

export interface ProgressFrame {
  elapsedMs: number
  clockText: string
  /** 只在裁判返回、账本在内存落定后出现一次；其余心跳帧没有这个字段 */
  phase?: 'settled'
}

export interface StateFrame {
  clock: number
  clockText: string
  state: PlayerStateView
}

export interface DoneFrame {
  seq: number
}

export interface ErrorFrame {
  code: string
  msg: string
}

/* ── 作者投影 ─────────────────────────────────────────── */

export interface UsageView {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  ms: number
  retries: number
  calls: number
}

export interface HealthView {
  beats: number
  folds: number
  claims: { say: number; act: number }
  noRate: number
  /** 整拍账本无变化的拍数 */
  silentBeats: number
  factsPerBeat: number
  knowRate: number
  writeOps: Record<string, number>
  durationBuckets: Record<'0-3' | '4-30' | '31-239' | '240+', number>
  /** 累计降级 notes 条数 */
  degraded: number
}

export interface ContentStatusView {
  path: string
  /** 本局启动时加载的内容哈希 */
  activeHash: string
  /** 磁盘当前的内容哈希 */
  diskHash: string
  changed: boolean
}

export interface AuthorCharacterView {
  id: string
  name: string
  core?: string
  voice?: string
  drives: { id: string; text: string; heat: number }[]
  beliefs: Record<string, string>
  busyUntil: number
  /** 只给条数；全文走单拍详情 */
  experienceCount: number
}

export interface ClaimView {
  id: string
  actor: string
  text: string
  kind: 'say' | 'act'
  /** 玩家 claim 的发言对象（实体 id；作者壳可见原始 id） */
  to?: string
}

export type OpView =
  | { op: 'move'; who: string; to: string }
  | { op: 'transfer'; from: string; to: string; item: string; n: number }
  | { op: 'consume'; from: string; item: string; n: number }
  | { op: 'phys'; who: string; key: string; value: number | boolean }
  | { op: 'rel'; from: string; to: string; delta: number }
  | { op: 'fact'; text: string; actor?: string; kind?: string }
  | { op: 'know'; who: string[]; fact: string }

export interface VerdictView {
  claimId: string
  actor: string
  ok: boolean
  reason?: string
  deltas: OpView[]
  duration: number
}

export interface ObservationView {
  claimIds: string[]
  summary: string
}

export interface DriveHitView {
  ent: string
  driveId: string
  delta: number
}

export interface ExperienceView {
  t: number
  kind: 'seen' | 'self' | 'thought'
  text: string
  w: 1 | 2 | 3
  ref?: number
}

export interface JournalEntryView {
  seq: number
  type: 'beat' | 'scene/fold'
  scene: string
  clock: number
  claims: ClaimView[]
  order: string[]
  verdicts: VerdictView[]
  observations: Record<string, ObservationView>
  driveHits: DriveHitView[]
  experience?: Record<string, ExperienceView[]>
  telemetry?: TelemetryView
}

export interface TelemetryView {
  models: Record<ModelRoleName, string>
  usage: Record<ModelRoleName, UsageView>
}

/** 账本快照。名字避开 `core/beat.ts` 的 `LedgerView`（那是 prompt 拼装选项）。 */
export interface LedgerSnapshotView {
  clock: number
  at: Record<string, string>
  holds: Record<string, Record<string, number>>
  phys: Record<string, Record<string, number | boolean>>
  rel: Record<string, Record<string, number>>
  knows: Record<string, string[]>
}

export interface FactView {
  id: string
  text: string
  at: number
  actor?: string
  kind?: string
  supersededBy?: string
}

export interface WorldView {
  ledger: LedgerSnapshotView
  facts: Record<string, FactView>
  places: Record<string, string>
  ambient?: Record<string, string | number | boolean>
}

export interface PromptCallView {
  role: ModelRoleName
  system?: string
  messages: { role: string; content: string }[]
  /** 模型原始输出（未解析） */
  text: string
  ms: number
  retries: number
}

export interface AuthorSessionView {
  title: string
  clock: number
  clockText: string
  content: ContentStatusView
  world: WorldView
  characters: AuthorCharacterView[]
  journal: JournalEntryView[]
  /** 本次进程累计，不是本局累计；界面须注明 */
  usage: Record<ModelRoleName, UsageView>
  health: HealthView
  /** 环形缓冲里的最近 3 拍 prompt */
  prompts: { seq: number; calls: PromptCallView[] }[]
}

export interface PassageView {
  seq: number
  clock: number
  text: string
  source: 'narrator' | 'player' | 'npc' | 'fallback'
  /** 本拍生成的动作提示；旧日志没有这个字段 */
  hints?: string[]
}

export interface AuthorBeatView {
  entry: JournalEntryView
  passage?: PassageView
  /** 该拍的模型调用记录；超出环形缓冲窗口时为空数组 */
  prompts: PromptCallView[]
  /** 该拍降级/回滚说明；进程重启后为空 */
  notes: string[]
}
