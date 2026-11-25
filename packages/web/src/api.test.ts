import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSseFrames, postBeat, readSseFrames, toBeatFrame } from './api.ts'
import type { SseFrame } from './api.ts'

const PROGRESS = 'event: progress\ndata: {"elapsedMs":1000,"clockText":"第 2 天 · 夜"}'
const PASSAGE =
  'event: passage\ndata: {"seq":7,"clock":1452,"clockText":"第 2 天 · 夜","player":"我要一杯","passage":"杯子推过来。","fallback":false}'
const DONE = 'event: done\ndata: {"seq":7}'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<SseFrame[]> {
  const frames: SseFrame[] = []
  await readSseFrames(streamOf(chunks), (frame) => frames.push(frame))
  return frames
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postBeat 请求体', () => {
  async function bodyOf(to?: string): Promise<unknown> {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)))
        return new Response(new ReadableStream({ start(controller) { controller.close() } }), { status: 200 })
      }) as unknown as typeof fetch,
    )
    await postBeat('我推门进去。', { onFrame: () => {}, ...(to === undefined ? {} : { to }) })
    return bodies[0]
  }

  it('没有目标时 body 只有 text，不带 to 键', async () => {
    expect(await bodyOf()).toEqual({ text: '我推门进去。' })
  })

  it('有目标时 body 带显示名', async () => {
    expect(await bodyOf('安')).toEqual({ text: '我推门进去。', to: '安' })
  })
})

describe('parseSseFrames', () => {
  it('切出单帧，尾部不留残渣', () => {
    const cut = parseSseFrames(`${PROGRESS}\n\n`)
    expect(cut.frames).toHaveLength(1)
    expect(cut.frames[0]?.event).toBe('progress')
    expect(cut.rest).toBe('')
  })

  it('半帧留在 rest 里，补上后半截才成帧', () => {
    const first = parseSseFrames(`${PROGRESS}\n\nevent: do`)
    expect(first.frames).toHaveLength(1)
    expect(first.rest).toBe('event: do')

    const second = parseSseFrames(`${first.rest}ne\ndata: {"seq":7}\n\n`)
    expect(second.frames).toHaveLength(1)
    expect(second.frames[0]?.data).toBe('{"seq":7}')
    expect(second.rest).toBe('')
  })

  it('三帧粘在一个 chunk 里也全切出来', () => {
    const cut = parseSseFrames(`${PROGRESS}\n\n${PASSAGE}\n\n${DONE}\n\n`)
    expect(cut.frames.map((frame) => frame.event)).toEqual(['progress', 'passage', 'done'])
  })

  it('认 \\r\\n\\r\\n 分隔', () => {
    const cut = parseSseFrames('event: done\r\ndata: {"seq":1}\r\n\r\n')
    expect(cut.frames).toHaveLength(1)
    expect(cut.frames[0]?.data).toBe('{"seq":1}')
    expect(cut.rest).toBe('')
  })
})

describe('toBeatFrame', () => {
  it('未知事件名忽略，不抛', () => {
    expect(toBeatFrame({ event: 'ping', data: '{}' })).toBeNull()
  })

  it('坏 JSON 忽略，不抛', () => {
    expect(toBeatFrame({ event: 'done', data: '{oops' })).toBeNull()
  })

  it('error 帧带上 code 与 msg', () => {
    const frame = toBeatFrame({ event: 'error', data: '{"code":"E_MODEL_CALL","msg":"裁判调用失败"}' })
    expect(frame).toEqual({ event: 'error', data: { code: 'E_MODEL_CALL', msg: '裁判调用失败' } })
  })
})

describe('readSseFrames', () => {
  it('半帧分两次喂，仍能拼成完整帧', async () => {
    const text = `${PROGRESS}\n\n${PASSAGE}\n\n${DONE}\n\n`
    const frames = await collect([text.slice(0, 12), text.slice(12, 90), text.slice(90)])
    expect(frames.map((frame) => frame.event)).toEqual(['progress', 'passage', 'done'])
  })

  it('流提前结束（没有 done）时，已解析的帧照样交出去', async () => {
    const frames = await collect([`${PROGRESS}\n\n${PASSAGE}\n\n`])
    expect(frames.map((frame) => frame.event)).toEqual(['progress', 'passage'])
  })

  it('末尾没有分隔符的最后一帧也不吞', async () => {
    const frames = await collect([`${PROGRESS}\n\n`, 'event: done\ndata: {"seq":7}'])
    expect(frames.map((frame) => frame.event)).toEqual(['progress', 'done'])
  })
})
