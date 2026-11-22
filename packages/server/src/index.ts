/**
 * 入口：单进程、单世界、单用户，只绑回环（docs/design/60-server.md §1 §7）。
 *
 * 一个进程同时承担 HTTP API、SSE、静态托管与内存态；不引数据库、队列、后台任务。
 *
 * `pnpm dev:server` 与 `pnpm serve` 本卡是同一条命令：静态托管对 dist 缺失已容错，
 * 到 W6-3 有了 packages/web 之后，`serve` 才真正依赖 `pnpm build` 的产物。
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { FALLBACK_MODEL, createLlm, loadModelConfig, readPiDefaultModel, readonlyPiCredentials } from '@ai-world/core'
import { STARTER_TOWN_PATH, loadContentPack } from '@ai-world/content'
import { createSession } from './session.ts'
import { beatRoutes } from './routes/beat.ts'
import { readRoutes } from './routes/session.ts'
import { resetRoutes } from './routes/reset.ts'

const HOST = '127.0.0.1'
const PORT = 8787
const DATA_DIR = 'data/starter-town'
const DIST = resolve(fileURLToPath(new URL('../../web/dist/', import.meta.url)))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

// 默认模型跟着 pi 自己的设置走（settings.json / PI_MODEL），配置文件只做覆盖
const piDefault = readPiDefaultModel(join(homedir(), '.pi', 'agent')) ?? FALLBACK_MODEL
const cfg = loadModelConfig(process.env.AI_WORLD_CONFIG ?? 'config/models.json', piDefault)
const llm = createLlm({
  models: cfg.models,
  credentials: readonlyPiCredentials(),
  sessionId: `${cfg.sessionIdPrefix ?? 'play'}-${randomUUID()}`,
  ...(cfg.retry ? { retry: cfg.retry } : {}),
})

const { pack } = loadContentPack(STARTER_TOWN_PATH)
const session = createSession({ dir: DATA_DIR, pack, llm, title: pack.title })

const api = new Hono()
api.route('/', readRoutes(session))
api.route('/', beatRoutes(session))
api.route('/', resetRoutes(session))
api.all('/*', (c) => c.json({ code: 'E_NOT_FOUND', msg: '资源不存在' }, 404))

const app = new Hono()
app.route('/api', api)
app.get('*', serveWeb)

// 调错模型要当场可见，不能等到第一拍失败
const beats = session.view().beats.length
console.log(
  `ai-world http://${HOST}:${PORT} | ${pack.title} | 已有 ${beats} 拍 | ` +
    `cognition=${cfg.models.cognition} referee=${cfg.models.referee} narration=${cfg.models.narration}`,
)
serve({ fetch: app.fetch, hostname: HOST, port: PORT })

/** 托管 packages/web/dist：先给文件，再 SPA fallback；`resolve` 后必须仍在 dist 内（防目录穿越）。 */
async function serveWeb(c: Context): Promise<Response> {
  const pathname = decodeURIComponent(new URL(c.req.url).pathname)
  const file = resolve(DIST, `.${pathname}`)
  if (file !== DIST && !file.startsWith(DIST + sep)) return notBuilt(c)
  const fallback = join(DIST, 'index.html')
  const direct = await tryRead(file)
  const served = direct ?? (await tryRead(fallback))
  if (served === undefined) return notBuilt(c)
  // 类型看**实际发出的那个文件**：SPA fallback 的请求路径常常没有扩展名（/、/author）
  const servedPath = direct === undefined ? fallback : file
  return new Response(new Uint8Array(served), {
    headers: { 'content-type': TYPES[extname(servedPath)] ?? 'application/octet-stream' },
  })
}

async function tryRead(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path)
  } catch {
    return undefined
  }
}

/** dist 还不存在不是错误：服务端照常可用，只是没有界面可给。 */
function notBuilt(c: Context): Response {
  return c.json({ code: 'E_NOT_FOUND', msg: '资源不存在：先执行 pnpm build 生成 packages/web/dist' }, 404)
}
