/**
 * 只读投影路由：玩家的 `/session` 与作者的 `/author/*`。
 *
 * 两个投影都不改状态；作者数据只在作者壳切过去时才请求（docs/design/60-server.md §6）。
 */
import { Hono } from 'hono'
import type { Session } from '../session.ts'

export function readRoutes(session: Session): Hono {
  const app = new Hono()

  app.get('/session', (c) => c.json({ code: '0', msg: 'success', data: session.view() }))
  app.get('/author/session', (c) => c.json({ code: '0', msg: 'success', data: session.authorView() }))
  app.get('/author/beat/:seq', (c) => {
    const beat = session.authorBeat(Number(c.req.param('seq')))
    if (beat === undefined) return c.json({ code: 'E_NOT_FOUND', msg: '资源不存在' }, 404)
    return c.json({ code: '0', msg: 'success', data: beat })
  })

  return app
}
