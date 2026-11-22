/**
 * 作者端点：三个只读投影 + 内容保存（docs/api/30-api-author.md）。
 *
 * 保存是全项目唯一能写文件的入口，只碰 `content/`；账本与 facts 仍然只有 referee 能写。
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Session } from '../session.ts'

/** 保存的三条失败各有 HTTP 语义：坏请求与坏内容 400，与 /beat 互斥 409。 */
const STATUS: Record<string, 400 | 409> = {
  E_INVALID_BODY: 400,
  E_INVALID_CONTENT: 400,
  E_BEAT_IN_FLIGHT: 409,
}

export function authorRoutes(session: Session): Hono {
  const app = new Hono()

  app.get('/author/session', (c) => c.json({ code: '0', msg: 'success', data: session.authorView() }))

  app.get('/author/beat/:seq', (c) => {
    const beat = session.authorBeat(Number(c.req.param('seq')))
    if (beat === undefined) return c.json({ code: 'E_NOT_FOUND', msg: '资源不存在' }, 404)
    return c.json({ code: '0', msg: 'success', data: beat })
  })

  app.get('/author/content', (c) => {
    const { activeHash, diskHash } = session.content()
    return c.json({ code: '0', msg: 'success', data: { text: session.contentText(), activeHash, diskHash } })
  })

  app.post('/author/content', async (c) => {
    const text = await readText(c)
    if (text === undefined) return c.json({ code: 'E_INVALID_BODY', msg: '请求体格式错误' }, 400)
    try {
      return c.json({ code: '0', msg: 'success', data: session.saveContent(text) })
    } catch (error) {
      const code = codeOf(error)
      const status = STATUS[code]
      if (status === undefined) throw error
      return c.json(
        {
          code,
          msg: (error as Error).message,
          // 校验错误逐条带出来给作者壳显示，不只给一句“校验失败”
          ...(code === 'E_INVALID_CONTENT' ? { data: { errors: errorsOf(error) } } : {}),
        },
        status,
      )
    }
  })

  return app
}

async function readText(c: Context): Promise<string | undefined> {
  try {
    const body: unknown = await c.req.json()
    const text = (body as { text?: unknown } | null)?.text
    return typeof text === 'string' ? text : undefined
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
