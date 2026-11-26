/**
 * `POST /api/beat` 的线上契约（docs/api/20-api-beat.md §2 §3）。
 *
 * 这些分支只在路由层存在：坏体、空输入、单飞是**开流之前**的 HTTP 语义（400/409），
 * 帧序是开流之后的事。真断连需要真 socket，留给浏览器实测，不在单测里假装。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatRequest, ChatResult, Llm } from '@ai-world/core'
import { loadContentPack, STARTER_TOWN_PATH } from '@ai-world/content'
import { createSession, type Session } from '../session.ts'
import { beatRoutes } from './beat.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-route-'))
  dirs.push(dir)
  return dir
}

/** 用真实内容包开局：路由层只关心 HTTP 契约，不关心 fixture 人物的 core 有多长。 */
function session(llm: Llm): Session {
  const dir = tmpDir()
  const { pack } = loadContentPack(STARTER_TOWN_PATH)
  return createSession({
    worlds: [{ id: 'starter-town', title: pack.title, dir, contentPath: STARTER_TOWN_PATH }],
    world: 'starter-town',
    pack,
    llm,
  })
}

const verdictFor = (claimId: string): string =>
  JSON.stringify({
    order: ['player'],
    verdicts: [{ claimId, ok: true, duration: 1, deltas: [{ op: 'fact', text: '玩家进门了。' }] }],
    observations: {},
  })

function stubLlm(options: { hang?: Promise<void>; fail?: boolean } = {}): Llm {
  return {
    async chat(req: ChatRequest): Promise<ChatResult> {
      if (options.hang) await options.hang
      if (options.fail) throw new Error('模型挂了')
      const text =
        req.role === 'referee' ? verdictFor('p0') : req.role === 'narration' ? '雨顺着门缝往里渗。' : JSON.stringify({ inner: '', outward: '她抬眼看了你一下。' })
      return { text, toolCalls: [], inputTokens: 1, outputTokens: 1, model: `stub/${req.role}` }
    },
  }
}

function app(target: Session): Hono {
  return new Hono().route('/', beatRoutes(target))
}

function post(target: Session, body: string): Promise<Response> {
  return Promise.resolve(
    app(target).request('/beat', { method: 'POST', body, headers: { 'content-type': 'application/json' } }),
  )
}

/** 只取事件名，顺序即到达顺序。 */
function events(sse: string): string[] {
  return [...sse.matchAll(/^event: (.+)$/gm)].map((m) => m[1] ?? '')
}

/** 取某个事件名的全部 data 行。 */
function dataOf(sse: string, name: string): string[] {
  return [...sse.matchAll(/^event: (.+)\ndata: (.+)$/gm)].filter((m) => m[1] === name).map((m) => m[2] ?? '')
}

describe('POST /beat：开流之前的 HTTP 语义', () => {
  it('坏 JSON 与缺 text 都是 400 E_INVALID_BODY', async () => {
    const target = session(stubLlm())
    for (const body of ['不是 JSON', '{}', '{"text":1}']) {
      const res = await post(target, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'E_INVALID_BODY' })
    }
  })

  it('空输入是 400 E_EMPTY_INPUT', async () => {
    const res = await post(session(stubLlm()), '{"text":"   "}')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'E_EMPTY_INPUT' })
  })

  it('结算中是 409，不是排队', async () => {
    let open!: () => void
    const hang = new Promise<void>((resolve) => {
      open = resolve
    })
    const target = session(stubLlm({ hang }))
    const pending = target.beat('我推门进去。', new AbortController().signal, () => {})

    const res = await post(target, '{"text":"我又说了一句。"}')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'E_BEAT_IN_FLIGHT' })

    open()
    await pending
  })
})

describe('POST /beat：SSE 帧', () => {
  it('正常一拍：落定帧先于 passage → state → done', async () => {
    const res = await post(session(stubLlm()), '{"text":"我推门进去。"}')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const sse = await res.text()
    expect(events(sse)).toEqual(['progress', 'passage', 'state', 'done'])
    // settled 是唯一能证明“账本已定”的帧，必须在正文之前到达
    expect(dataOf(sse, 'progress')[0]).toContain('"phase":"settled"')
    expect(sse.indexOf('"phase":"settled"')).toBeLessThan(sse.indexOf('event: passage'))
  })

  it('模型失败只发一帧 error，不发 passage', async () => {
    const res = await post(session(stubLlm({ fail: true })), '{"text":"我推门进去。"}')
    const frames = events(await res.text())
    expect(frames).toEqual(['error'])
  })
})

describe('POST /beat：对谁说（to）', () => {
  it('body 的 to 一路到 passage 帧：客户端只看到显示名', async () => {
    const res = await post(session(stubLlm()), '{"text":"我把两枚银元塞进安手里。","to":"安"}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage.playerTo).toBe('安')
  })

  it('不定 to 或 to 是空白，且正文没提人：都是所有人，passage 帧没有 playerTo', async () => {
    for (const body of ['{"text":"我推门进去。"}', '{"text":"我推门进去。","to":"   "}']) {
      const res = await post(session(stubLlm()), body)
      const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
      expect(passage).not.toHaveProperty('playerTo')
    }
  })

  it('to 是空白且正文只提到一个人：仍然自动聚焦', async () => {
    const res = await post(session(stubLlm()), '{"text":"我走到安面前，把银元放下。","to":"   "}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage.playerTo).toBe('安')
  })

  it('没发 to 但正文里只提到一个人：那个人就是聚焦目标', async () => {
    const res = await post(session(stubLlm()), '{"text":"我走到安面前，把银元放下。"}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage.playerTo).toBe('安')
  })

  it('没发 to 但正文里提到两个人：不猜，仍是所有人', async () => {
    const res = await post(session(stubLlm()), '{"text":"我对安和科迪说话。"}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage).not.toHaveProperty('playerTo')
  })

  it('显式 to 优先：正文只提到安，to 点的是科迪', async () => {
    const res = await post(session(stubLlm()), '{"text":"我看看安，却什么也没说。","to":"科迪"}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage.playerTo).toBe('科迪')
  })

  it('显式 to 对不上人不回退自动聚焦：正文提到安也仍是所有人', async () => {
    const res = await post(session(stubLlm()), '{"text":"我朝安那边喊了一声。","to":"不存在"}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage).not.toHaveProperty('playerTo')
  })

  it('to 不是字符串：400 E_INVALID_BODY', async () => {
    for (const body of ['{"text":"我推门进去。","to":1}', '{"text":"我推门进去。","to":null}', '{"text":"我推门进去。","to":{}}']) {
      const res = await post(session(stubLlm()), body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'E_INVALID_BODY' })
    }
  })
})

/** 「自动」与「所有人」是两个意图：前者允许服务端按正文推断，后者不允许（C11） */
describe('POST /beat：显式所有人（all）', () => {
  it('all:true 时不按正文推断：正文只提到安也没有 playerTo', async () => {
    const res = await post(session(stubLlm()), '{"text":"我走到安面前。","all":true}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage).not.toHaveProperty('playerTo')
  })

  it('all:false 与缺省同义：正文只提到安就聚焦到他', async () => {
    const res = await post(session(stubLlm()), '{"text":"我走到安面前。","all":false}')
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage.playerTo).toBe('安')
  })

  it('all:true 与空白 to 不冲突：空白 to 本来就等于没给', async () => {
    const res = await post(session(stubLlm()), '{"text":"我走到安面前。","all":true,"to":"   "}')
    expect(res.status).toBe(200)
    const passage = JSON.parse(dataOf(await res.text(), 'passage')[0] ?? '{}') as { playerTo?: string }
    expect(passage).not.toHaveProperty('playerTo')
  })

  it('all:true 与 to 互斥：同时给当事人就是 400 E_INVALID_BODY', async () => {
    const res = await post(session(stubLlm()), '{"text":"我走到安面前。","all":true,"to":"安"}')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'E_INVALID_BODY' })
  })

  it('all 不是布尔：400 E_INVALID_BODY', async () => {
    for (const body of [
      '{"text":"我推门进去。","all":"yes"}',
      '{"text":"我推门进去。","all":1}',
      '{"text":"我推门进去。","all":null}',
    ]) {
      const res = await post(session(stubLlm()), body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'E_INVALID_BODY' })
    }
  })
})
