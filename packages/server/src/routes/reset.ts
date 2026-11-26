/**
 * `POST /api/reset`：开新局（docs/api/20-api-beat.md §4）。
 *
 * 与 /beat 互斥；清空两条日志、按内容包重建世界。不可撤销，二次确认在客户端。
 * `{world}` 缺省 = 重开当前世界；给了就必须是已知世界，否则 400（当前世界与日志都不动）。
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Session } from '../session.ts'

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
    const body = await readBody(c)
    // 空 body、无 Content-Type、坏 JSON 都是“没说要哪一局”：等价于重开当前世界
    const world = body?.world
    if (world !== undefined && typeof world !== 'string') {
      return c.json({ code: 'E_INVALID_BODY', msg: '请求体格式错误' }, 400)
    }
    if (session.inFlight()) return c.json({ code: 'E_BEAT_IN_FLIGHT', msg: '上一拍还在结算' }, 409)
    try {
      session.reset(world)
    } catch (error) {
      const code = codeOf(error)
      const status = STATUS[code]
      // 不在表里的错误照旧冒泡：那是真 bug，不该被翻译成 400
      if (status === undefined) throw error
      return c.json(
        {
          code,
          msg: (error as Error).message,
          // 校验错误逐条带出来：客户端要显示“哪个包坏了”
          ...(code === 'E_INVALID_CONTENT' ? { data: { errors: errorsOf(error) } } : {}),
        },
        status,
      )
    }
    const view = session.view()
    return c.json({
      code: '0',
      msg: 'success',
      data: { title: view.title, clock: view.clock, clockText: view.clockText },
    })
  })

  return app
}

async function readBody(c: Context): Promise<{ world?: unknown } | undefined> {
  try {
    const body: unknown = await c.req.json()
    return typeof body === 'object' && body !== null ? (body as { world?: unknown }) : undefined
  } catch {
    return undefined
  }
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'E_INTERNAL'
}

function errorsOf(error: unknown): string[] {
  const errors = (error as { errors?: unknown }).errors
  return Array.isArray(errors) ? errors.map(String) : []
}
