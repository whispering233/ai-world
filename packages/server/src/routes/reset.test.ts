/**
 * `POST /api/reset` 的线上契约（docs/api/20-api-beat.md §4）。
 *
 * 空 body 等价于重开当前世界；给了 `world` 就必须是已知世界，坏体/未知世界都是 400，
 * 与 /beat 互斥是 409。开新局不可撤销，所以这些分支在当前世界与日志都不动的**前提下**才成立。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import type { Llm } from '@ai-world/core'
import { STARTER_TOWN_PATH, loadContentPack } from '@ai-world/content'
import { createSession, type Session } from '../session.ts'
import { resetRoutes } from './reset.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-reset-'))
  dirs.push(dir)
  return dir
}

/** 只有一个已知世界：`nope` 这类 id 因此必然落在 `E_UNKNOWN_WORLD`。 */
function session(): Session {
  const dir = tmpDir()
  const { pack } = loadContentPack(STARTER_TOWN_PATH)
  return createSession({
    worlds: [{ id: 'starter-town', title: pack.title, dir, contentPath: STARTER_TOWN_PATH }],
    world: 'starter-town',
    pack,
    llm: throwOnCall(),
  })
}

function throwOnCall(): Llm {
  return {
    async chat() {
      throw new Error('reset 路由不该调用模型')
    },
  }
}

function post(target: Session, init: { body?: string; contentType?: string } = {}): Promise<Response> {
  return Promise.resolve(
    new Hono()
      .route('/', resetRoutes(target))
      .request('/reset', {
        method: 'POST',
        ...(init.body === undefined ? {} : { body: init.body }),
        ...(init.contentType === undefined ? {} : { headers: { 'content-type': init.contentType } }),
      }),
  )
}

describe('POST /reset：世界选择', () => {
  it('空 body 等价于重开当前世界', async () => {
    const target = session()
    const title = target.view().title
    for (const init of [{}, { body: '{}', contentType: 'application/json' }]) {
      const res = await post(target, init)
      const body = (await res.json()) as { code: string; data: { title: string } }
      expect(res.status).toBe(200)
      expect(body.code).toBe('0')
      expect(body.data.title).toBe(title)
    }
  })

  // 容错与 /beat 同一口径：解析不出对象就当没给 body，不把裸 Error 抛成 500
  it('坏 JSON、空 body、缺 Content-Type 都不算坏体：仍然重开当前世界', async () => {
    const target = session()
    for (const init of [
      { body: '不是 JSON', contentType: 'application/json' },
      { body: '不是 JSON' },
      { body: '' },
      { body: '[1,2]', contentType: 'application/json' },
    ]) {
      const res = await post(target, init)
      expect(res.status).toBe(200)
      expect(((await res.json()) as { code: string }).code).toBe('0')
    }
  })

  it('{world:123} 是 400 E_INVALID_BODY，当前世界不动', async () => {
    const target = session()
    const title = target.view().title
    const res = await post(target, { body: '{"world":123}', contentType: 'application/json' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('E_INVALID_BODY')
    expect(target.view().title).toBe(title)
  })

  it("{world:'nope'} 是 400 E_UNKNOWN_WORLD，当前世界不动", async () => {
    const target = session()
    const title = target.view().title
    for (const world of ['nope', '../x', 'A B']) {
      const res = await post(target, { body: JSON.stringify({ world }), contentType: 'application/json' })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { code: string }).code).toBe('E_UNKNOWN_WORLD')
    }
    expect(target.view().title).toBe(title)
  })

  it('已知世界照常重开：响应 title 是当前包的标题', async () => {
    const target = session()
    const res = await post(target, { body: '{"world":"starter-town"}', contentType: 'application/json' })
    const body = (await res.json()) as { code: string; data: { title: string; clock: number } }
    expect(res.status).toBe(200)
    expect(body.data.title).toBe(target.view().title)
    expect(body.data.clock).toBe(0)
  })
})