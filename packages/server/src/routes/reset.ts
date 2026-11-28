/**
 * `POST /api/reset`：开新局（docs/api/20-api-beat.md §4）。
 *
 * 与 /beat 互斥；清空两条日志、按内容包重建世界。不可撤销，二次确认在客户端。
 * `{world}` 缺省 = 重开当前世界；给了就必须是已知世界，否则 400（当前世界与日志都不动）。
 */
import { Hono } from 'hono'
import type { Session } from '../session.ts'
import { codeOf, errorsOf, fail, readJsonObject, success } from './http.ts'

/** reset 的失败各有 HTTP 语义：坏请求 / 未知世界 / 坏内容 400，与 /beat 互斥 409。 */
const STATUS: Record<string, 400 | 409> = {
  E_INVALID_BODY: 400,
  E_UNKNOWN_WORLD: 400,
  E_INVALID_CONTENT: 400,
  E_BEAT_IN_FLIGHT: 409,
}

export function resetRoutes(session: Session): Hono {
  const app = new Hono()

  app.post('/reset', async (c) => {
    const body = await readJsonObject(c)
    // 空 body、无 Content-Type、坏 JSON 都是“没说要哪一局”：等价于重开当前世界
    const world = body?.['world']
    if (world !== undefined && typeof world !== 'string') {
      return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    }
    // 单飞只由 session.reset() 判（它第一步就抛 E_BEAT_IN_FLIGHT），路由层不再重复一次
    try {
      session.reset(world)
    } catch (error) {
      const code = codeOf(error)
      const status = STATUS[code]
      // 不在表里的错误照旧冒泡：那是真 bug，不该被翻译成 400
      if (status === undefined) throw error
      // 校验错误逐条带出来：客户端要显示“哪个包坏了”
      const detail = code === 'E_INVALID_CONTENT' ? { errors: errorsOf(error) } : undefined
      return fail(c, code, status, (error as Error).message, detail)
    }
    const view = session.view()
    return success(c, { title: view.title, clock: view.clock, clockText: view.clockText })
  })

  return app
}
