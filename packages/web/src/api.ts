/**
 * 玩家侧的 HTTP/SSE 客户端。纯函数在前，DOM 只在最外层出现一次（`fetch`）。
 *
 * 一行一拍：帧顺序见 docs/api/20-api-beat.md §2，未知帧名与坏 JSON 一律忽略，不抛。
 */
import { SSE_EVENTS } from '@ai-world/shared'
import type {
  AuthorBeatView,
  AuthorSessionView,
  BeatView,
  DoneFrame,
  ErrorFrame,
  ProgressFrame,
  SessionView,
  SseEventName,
  StateFrame,
} from '@ai-world/shared'

/** 线上原样的一帧：事件名未收窄，未知名字交给 `toBeatFrame` 丢掉。 */
export interface SseFrame {
  event: string
  data: string
}

export interface BeatFrameData {
  progress: ProgressFrame
  passage: BeatView
  state: StateFrame
  done: DoneFrame
  error: ErrorFrame
}

export type BeatFrame = { [K in SseEventName]: { event: K; data: BeatFrameData[K] } }[SseEventName]

/**
 * 切出完整帧，尾部半帧原样带回（`\n\n` 与 `\r\n\r\n` 都认）。
 */
export function parseSseFrames(chunk: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = []
  const separator = /\r?\n\r?\n/g
  let start = 0
  let match: RegExpExecArray | null
  while ((match = separator.exec(chunk)) !== null) {
    frames.push(...parseBlock(chunk.slice(start, match.index)))
    start = match.index + match[0].length
  }
  return { frames, rest: chunk.slice(start) }
}

function parseBlock(block: string): SseFrame[] {
  let event = ''
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
    else if (line.startsWith('data:')) data.push(line.slice('data:'.length).trimStart())
    // id: / retry: / 注释行对本界面没有意义
  }
  return event === '' ? [] : [{ event, data: data.join('\n') }]
}

/** 事件名不在 `SSE_EVENTS` 里、或 data 不是合法 JSON 时返回 `null`。 */
export function toBeatFrame(frame: SseFrame): BeatFrame | null {
  if (!(SSE_EVENTS as readonly string[]).includes(frame.event)) return null
  try {
    return { event: frame.event, data: JSON.parse(frame.data) } as BeatFrame
  } catch {
    return null
  }
}

/** 逐帧读流。不依赖 DOM 之外的东西，node 里可以喂自造的 ReadableStream。 */
export async function readSseFrames(
  stream: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let rest = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (value !== undefined) {
      const parsed = parseSseFrames(rest + decoder.decode(value, { stream: true }))
      rest = parsed.rest
      for (const frame of parsed.frames) onFrame(frame)
    }
    if (done) break
  }
  // 流提前结束：把解码器缓冲的尾巴冲出来，再补一个空行让半帧也能成帧
  rest += decoder.decode()
  for (const frame of parseSseFrames(`${rest}\n\n`).frames) onFrame(frame)
}

interface Envelope<T> {
  code: string
  msg: string
  data?: T
}

/** 非 `code: '0'` 的响应：调用方按 `code` 分支，`errors` 只在 `E_INVALID_CONTENT` 时有内容。 */
export class ApiError extends Error {
  readonly code: string
  readonly errors: string[]

  constructor(code: string, msg: string, errors: string[] = []) {
    super(msg)
    this.code = code
    this.errors = errors
  }
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as Envelope<T>
  if (body.code === '0' && body.data !== undefined) return body.data
  const errors = (body.data as { errors?: unknown } | undefined)?.errors
  throw new ApiError(body.code, body.msg || '请求失败', Array.isArray(errors) ? errors.map(String) : [])
}

/** 整局的玩家投影；重连与续跑都靠它补齐。 */
export async function fetchSession(): Promise<SessionView> {
  return readEnvelope<SessionView>(await fetch('/api/session'))
}

/** 开新局。不可撤销，二次确认在调用方。`world` 缺省 = 重开当前世界。 */
export async function resetSession(world?: string): Promise<void> {
  await readEnvelope<unknown>(
    await fetch('/api/reset', {
      method: 'POST',
      // 没选包就不发 body，也不带 content-type：服务端把空 body 当成“重开当前世界”
      ...(world === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ world }) }),
    }),
  )
}

/* ── 作者壳：只在切到作者视图时才请求（docs/design/60-server.md §6） ── */

export async function fetchAuthorSession(): Promise<AuthorSessionView> {
  return readEnvelope<AuthorSessionView>(await fetch('/api/author/session'))
}

export async function fetchAuthorBeat(seq: number): Promise<AuthorBeatView> {
  return readEnvelope<AuthorBeatView>(await fetch(`/api/author/beat/${seq}`))
}

export interface AuthorContent {
  /** 磁盘上的内容包原文 */
  text: string
  activeHash: string
  diskHash: string
}

export async function fetchAuthorContent(): Promise<AuthorContent> {
  return readEnvelope<AuthorContent>(await fetch('/api/author/content'))
}

/** 唯一写文件的请求：只写 `content/`，本局内容不生效。校验失败抛 `ApiError` + `errors`。 */
export async function saveContent(text: string): Promise<{ saved: true; activeHash: string; diskHash: string }> {
  return readEnvelope<{ saved: true; activeHash: string; diskHash: string }>(
    await fetch('/api/author/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  )
}

export interface PostBeatOptions {
  signal?: AbortSignal
  onFrame: (frame: BeatFrame) => void
  /** 显式广播“所有人”；与 to 互斥；缺省时服务端按正文唯一人名推断（C10/C11） */
  all?: boolean
  /** “对谁说”的在场者显示名；缺省 = 自动推断 */
  to?: string
}

/**
 * 推进一拍。用 `fetch` + `AbortSignal`：`EventSource` 发不了 POST，也断不了流。
 * 流外失败（409 等）合成一个 `error` 帧，调用方只有一条失败路径。
 */
export async function postBeat(text: string, options: PostBeatOptions): Promise<void> {
  const response = await fetch('/api/beat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // 空 `to` 与 `all:false` 都不上车：body 里只有真正生效的那个意图
    body: JSON.stringify({
      text,
      ...(options.to === undefined || options.to === '' ? {} : { to: options.to }),
      ...(options.all === true ? { all: true } : {}),
    }),
    signal: options.signal,
  })
  if (!response.ok || response.body === null) {
    const body = (await response.json().catch(() => ({ code: 'E_NETWORK', msg: '这一拍没能开始' }))) as Envelope<unknown>
    const frame = toBeatFrame({ event: 'error', data: JSON.stringify({ code: body.code, msg: body.msg }) })
    if (frame !== null) options.onFrame(frame)
    return
  }
  await readSseFrames(response.body, (frame) => {
    const typed = toBeatFrame(frame)
    if (typed !== null) options.onFrame(typed)
  })
}
