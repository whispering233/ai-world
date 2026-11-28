/**
 * `POST /api/beat`：推进一拍，用 SSE 回帧（帧名与载荷见 docs/api/20-api-beat.md §2）。
 *
 * 在流外能判的都判完（格式、空输入、单飞），流内只剩「跑一拍 → 发帧」；
 * 客户端断开的三路都接到同一个 AbortController 上（§3）。
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Session } from '../session.ts'
import { codeOf, fail, readJsonObject } from './http.ts'

/** @hono/node-server 把 node 的 res 挂在 c.env.outgoing；hono 自己的断连判定也看它。 */
interface NodeResponse {
  writableFinished: boolean
  on(event: 'close', handler: () => void): void
  off(event: 'close', handler: () => void): void
}

export function beatRoutes(session: Session): Hono {
  const app = new Hono()

  app.post('/beat', async (c) => {
    const body = await readJsonObject(c)
    if (body === undefined) return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    const rawText = body['text']
    const rawTo = body['to']
    const rawAll = body['all']
    if (typeof rawText !== 'string') return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    // `to` 是显示名，不是 id；只做形状校验，能不能匹配上由 session 定（docs/api/20-api-beat.md §1）
    if (rawTo !== undefined && typeof rawTo !== 'string') return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    if (rawAll !== undefined && typeof rawAll !== 'boolean') return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    const text = rawText
    const to = rawTo === undefined ? '' : rawTo.trim()
    const all = rawAll === true
    // 「所有人」与「对谁说」互斥（C11）：同时给就是坏体，不替调用方二选一
    if (all && to !== '') return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    if (rawText.trim() === '') return fail(c, 'E_EMPTY_INPUT', 400, '玩家输入为空')
    // 单飞是 HTTP 语义（409），所以必须在开流之前判：流一旦开了只能发 error 帧
    if (session.inFlight()) return fail(c, 'E_BEAT_IN_FLIGHT', 409, '上一拍还在结算')

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
        }, to, all)
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
