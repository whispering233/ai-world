/**
 * `POST /api/reset`：开新局（docs/api/20-api-beat.md §4）。
 *
 * 与 /beat 互斥；清空两条日志、按内容包重建世界。不可撤销，二次确认在客户端。
 */
import { Hono } from 'hono'
import type { Session } from '../session.ts'

export function resetRoutes(session: Session): Hono {
  const app = new Hono()

  app.post('/reset', (c) => {
    if (session.inFlight()) return c.json({ code: 'E_BEAT_IN_FLIGHT', msg: '上一拍还在结算' }, 409)
    session.reset()
    const view = session.view()
    return c.json({
      code: '0',
      msg: 'success',
      data: { title: view.title, clock: view.clock, clockText: view.clockText },
    })
  })

  return app
}
