/**
 * 路由共用的 HTTP 辅助：错误码提取、错误信封、成功信封、请求体窄化。
 *
 * **不放共用状态码表**：每条路由只翻译自己那几个 code，表外一律 rethrow 交给 Hono 的
 * 默认 500——那是真 bug，不该被翻译成 400。各路由的 `STATUS` 是策略，不是重复。
 * 错误码与状态码的对应关系见 docs/api/error-code.md §2。
 */
import type { Context } from 'hono'

/** 错误对象上的 `code`；没有就当作内部错误。 */
export function codeOf(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'E_INTERNAL'
}

/** `E_INVALID_CONTENT` 带的逐条错误（原样来自 `validatePack()`）。 */
export function errorsOf(error: unknown): string[] {
  const errors = (error as { errors?: unknown }).errors
  return Array.isArray(errors) ? errors.map(String) : []
}

/**
 * 请求体解析成对象。
 *
 * 非对象 / 坏 JSON / 缺 `Content-Type` 一律返回 `undefined`，由调用点决定这算
 * "坏体 400" 还是缺省值——`reset` 把空 body 当"重开当前世界"，`beat` 当坏体。
 */
export async function readJsonObject(c: Context): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await c.req.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** 失败信封。`status` 由调用点给：那是每条路由自己的语义。 */
export function fail(
  c: Context,
  code: string,
  status: 400 | 404 | 409 | 500,
  msg: string,
  data?: unknown,
): Response {
  return c.json({ code, msg, ...(data === undefined ? {} : { data }) }, status)
}

/** 成功信封：`code` 恒为 `"0"`。 */
export function success(c: Context, data: unknown): Response {
  return c.json({ code: '0', msg: 'success', data })
}
