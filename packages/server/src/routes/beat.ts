/**
 * `POST /api/beat`：推进一拍，用 SSE 回帧（帧名与载荷见 docs/api/20-api-beat.md §2）。
 *
 * 在流外能判的都判完（格式、空输入、单飞），流内只剩「跑一拍 → 发帧」；
 * 客户端断开的三路都接到同一个 AbortController 上（§3）。
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import type { Session } from '../session.ts'

/** @hono/node-server 把 node 的 res 挂在 c.env.outgoing；hono 自己的断连判定也看它。 */
interface NodeResponse {
  writableFinished: boolean
  on(event: 'close', handler: () => void): void
  off(event: 'close', handler: () => void): void
}

export function beatRoutes(session: Session): Hono {
  const app = new Hono()

  app.post('/beat', async (c) => {
    const body = await readBody(c)
    if (body === undefined) return c.json({ code: 'E_INVALID_BODY', msg: '请求体格式错误' }, 400)
    if (typeof body.text !== 'string') return c.json({ code: 'E_INVALID_BODY', msg: '请求体格式错误' }, 400)
    // `to` 是显示名，不是 id；只做形状校验，能不能匹配上由 session 定（docs/api/20-api-beat.md §1）
    if (body.to !== undefined && typeof body.to !== 'string') return c.json({ code: 'E_INVALID_BODY', msg: '请求体格式错误' }, 400)
    const text = body.text
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    if (text.trim() === '') return c.json({ code: 'E_EMPTY_INPUT', msg: '玩家输入为空' }, 400)
    // 单飞是 HTTP 语义（409），所以必须在开流之前判：流一旦开了只能发 error 帧
    if (session.inFlight()) return c.json({ code: 'E_BEAT_IN_FLIGHT', msg: '上一拍还在结算' }, 409)

    const clockText = session.view().clockText
    const controller = new AbortController()
    return streamSSE(c, async (stream) => {
      const cancel = (): void => controller.abort()
      stream.onAbort(cancel)
      c.req.raw.signal.addEventListener('abort', cancel, { once: true })
      const outgoing = (c.env as { outgoing?: NodeResponse } | undefined)?.outgoing
      const onClose = (): void => {
        if (outgoing?.writableFinished !== true) cancel()
      }
      outgoing?.on('close', onClose)

      try {
        const res = await session.beat(text, controller.signal, (elapsedMs, phase) => {
          void stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ elapsedMs, clockText, ...(phase === undefined ? {} : { phase }) }),
          })
        }, to)
        await stream.writeSSE({ event: 'passage', data: JSON.stringify(res.beat) })
        await stream.writeSSE({
          event: 'state',
          data: JSON.stringify({ clock: res.view.clock, clockText: res.view.clockText, state: res.view.state }),
        })
        await stream.writeSSE({ event: 'done', data: JSON.stringify({ seq: res.seq }) })
      } catch (error) {
        // 没有 passage 帧就是没有发生：这里只发 error，之后不再发帧
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ code: codeOf(error), msg: (error as Error).message }),
        })
      } finally {
        c.req.raw.signal.removeEventListener('abort', cancel)
        outgoing?.off('close', onClose)
      }
    })
  })

  return app
}

async function readBody(c: Context): Promise<{ text?: unknown; to?: unknown } | undefined> {
  try {
    const body: unknown = await c.req.json()
    return typeof body === 'object' && body !== null ? (body as { text?: unknown; to?: unknown }) : undefined
  } catch {
    return undefined
  }
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'E_INTERNAL'
}
