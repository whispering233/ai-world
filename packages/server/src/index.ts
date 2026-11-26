/**
 * 入口：单进程、单用户；同一时刻只有一个世界在内存中（换包 = 开新局），只绑回环（docs/design/60-server.md §1 §7）。
 *
 * 一个进程同时承担 HTTP API、SSE、静态托管与内存态；不引数据库、队列、后台任务。
 *
 * `pnpm dev:server` 与 `pnpm serve` 是同一条命令：都托管 `packages/web/dist`。
 * 开发态另开 `pnpm dev:web` 用 Vite 热更新，它把 `/api` 反代到本进程；
 * 生产态只需要 `pnpm build` 一次，然后 `pnpm serve` 一个进程就够。
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { FALLBACK_MODEL, createLlm, loadModelConfig, readPiDefaultModel, readonlyPiCredentials } from '@ai-world/core'
import { CONTENT_DIR, contentPathFor, loadContentPack } from '@ai-world/content'
import { createSession, type WorldOption } from './session.ts'
import { authorRoutes } from './routes/author.ts'
import { beatRoutes } from './routes/beat.ts'
import { readRoutes } from './routes/session.ts'
import { resetRoutes } from './routes/reset.ts'

const HOST = '127.0.0.1'
const PORT = 8787
/** 缺省世界：只在启动时读一次，进程不记玩家选过什么 */
const DEFAULT_WORLD = 'starter-town'
/** 世界 id 就是内容包文件名：与 `contentPathFor` 的校验同一口径 */
const WORLD_ID = /^[a-z0-9-]+$/
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

// 可开的世界 = `content/` 下的 *.json：标题读不到就退回 id，不让一个坏包拖垮启动
const worlds = listWorlds()
const world = process.env.AI_WORLD ?? DEFAULT_WORLD
const active = worlds.find((w) => w.id === world)
if (active === undefined) {
  throw new Error(`AI_WORLD=${world} 不在内容包里；可用：${worlds.map((w) => w.id).join('、')}`)
}
const { pack } = loadContentPack(active.contentPath)
const session = createSession({ worlds, world: active.id, pack, llm })

const api = new Hono()
api.route('/', readRoutes(session))
api.route('/', authorRoutes(session))
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
    `cognition=${cfg.models.cognition} referee=${cfg.models.referee} narration=${cfg.models.narration} suggest=${cfg.models.suggest}`,
)
serve({ fetch: app.fetch, hostname: HOST, port: PORT })

/**
 * 扫 `content/*.json`：文件名即世界 id，标题从内容包里读。
 * 读不到或不是合法 JSON 只让标题退回 id —— 选中它时 `reset` 才报 `E_INVALID_CONTENT`。
 */
function listWorlds(): WorldOption[] {
  const names = readdirSync(CONTENT_DIR).filter((name) => name.endsWith('.json'))
  const worlds: WorldOption[] = []
  for (const name of names.sort()) {
    const id = basename(name, '.json')
    // 与 `contentPathFor` 同一口径：不合规的文件名不是世界，直接跳过
    if (!WORLD_ID.test(id)) continue
    const contentPath = contentPathFor(id)
    worlds.push({ id, title: titleOf(contentPath) ?? id, dir: join('data', id), contentPath })
  }
  return worlds
}

function titleOf(path: string): string | undefined {
  try {
    const pack = JSON.parse(readFileSync(path, 'utf8')) as { title?: unknown }
    return typeof pack.title === 'string' && pack.title.trim() !== '' ? pack.title : undefined
  } catch {
    return undefined
  }
}

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
