/**
 * 作者端点：三个只读投影 + 内容保存（docs/api/30-api-author.md）。
 *
 * 保存是全项目唯一能写文件的入口，只碰 `content/`；账本与 facts 仍然只有 referee 能写。
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Session } from '../session.ts'
import { codeOf, errorsOf, fail, readJsonObject, success } from './http.ts'

/** 保存的三条失败各有 HTTP 语义：坏请求与坏内容 400，与 /beat 互斥 409。 */
const STATUS: Record<string, 400 | 409> = {
  E_INVALID_BODY: 400,
  E_INVALID_CONTENT: 400,
  E_BEAT_IN_FLIGHT: 409,
}

export function authorRoutes(session: Session): Hono {
  const app = new Hono()

  app.get('/author/session', (c) => success(c, session.authorView()))

  app.get('/author/beat/:seq', (c) => {
    const beat = session.authorBeat(Number(c.req.param('seq')))
    if (beat === undefined) return fail(c, 'E_NOT_FOUND', 404, '资源不存在')
    return success(c, beat)
  })

  app.get('/author/content', (c) => {
    const { activeHash, diskHash } = session.content()
    return success(c, { text: session.contentText(), activeHash, diskHash })
  })

  app.post('/author/content', async (c) => {
    const text = await readText(c)
    if (text === undefined) return fail(c, 'E_INVALID_BODY', 400, '请求体格式错误')
    try {
      return success(c, session.saveContent(text))
    } catch (error) {
      const code = codeOf(error)
      const status = STATUS[code]
      // 不在表里的错误照旧冒泡：那是真 bug，不该被翻译成 400
      if (status === undefined) throw error
      // 校验错误逐条带出来给作者壳显示，不只给一句“校验失败”
      const detail = code === 'E_INVALID_CONTENT' ? { errors: errorsOf(error) } : undefined
      return fail(c, code, status, (error as Error).message, detail)
    }
  })

  return app
}

async function readText(c: Context): Promise<string | undefined> {
  const body = await readJsonObject(c)
  const text = body?.['text']
  return typeof text === 'string' ? text : undefined
}
