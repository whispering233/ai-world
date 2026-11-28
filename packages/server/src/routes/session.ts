/**
 * 只读投影路由：玩家的 `/session`（作者投影在 `author.ts`）。
 *
 * 两个投影都不改状态；作者数据只在作者壳切过去时才请求（docs/design/60-server.md §6）。
 */
import { Hono } from 'hono'
import type { Session } from '../session.ts'
import { success } from './http.ts'

export function readRoutes(session: Session): Hono {
  const app = new Hono()

  app.get('/session', (c) => success(c, session.view()))

  return app
}
