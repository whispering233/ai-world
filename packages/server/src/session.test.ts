import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openStore, type ChatRequest, type ChatResult, type ContentPack, type Llm } from '@ai-world/core'
import { createSession, type Session } from './session.ts'

/* ── fixture：一个热人物 + 一个玩家；NPC 热到 0.8 才会被叫到 ── */

function pack(): ContentPack {
  return {
    title: '测试酒馆',
    world: {
      ledger: { clock: 0, at: { player: 'saloon', ann: 'saloon' }, holds: {}, phys: {}, rel: {}, knows: {} },
      facts: {},
      places: { saloon: '酒馆' },
    },
    characters: [
      { id: 'ann', core: '老板娘', voice: '短句', drives: [{ id: 'd1', text: '想把最后一杯酒卖出去', heat: 0.8 }], beliefs: {} },
    ],
    canon: ['外面的雨没停。'],
    player: 'player',
    names: { player: '你', ann: '安' },
    items: {},
  }
}

/** 玩家主张的 id 是 `p${clock}`；裁判只判它，人物主张由 parseRefereeOutput 按"无事发生"补齐。 */
const verdictFor = (claimId: string): string =>
  JSON.stringify({
    order: ['player'],
    verdicts: [{ claimId, ok: true, duration: 3, deltas: [{ op: 'fact', text: '玩家进门了。', actor: 'player', kind: 'state' }] }],
    observations: {},
  })

const narration = '雨顺着门缝往里渗。'

/** 按角色分派的桩：referee 缺省给一条能落账的裁决，narration 缺省给一句话。 */
function stubLlm(overrides: Partial<Record<ChatRequest['role'], (req: ChatRequest) => Promise<ChatResult>>> = {}): Llm {
  return {
    async chat(req) {
      const override = overrides[req.role]
      if (override) return override(req)
      const text =
        req.role === 'referee' ? verdictFor('p0') : req.role === 'narration' ? narration : JSON.stringify({ inner: '', outward: '安看了你一眼。' })
      return { text, toolCalls: [], inputTokens: 10, outputTokens: 5, model: `stub/${req.role}`, cost: 0.01, retries: 1 }
    },
  }
}

const dirs: string[] = []

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-server-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function makeSession(dir: string, llm: Llm): Session {
  return createSession({ dir, pack: pack(), llm, title: '测试酒馆' })
}

const noProgress = (): void => {}

/** 一个卡在闸门上的 promise：用来验证"拍还在结算"与中止。 */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}

describe('createSession', () => {
  it('正常一拍：journal +1、passage +1、passage.beatSeq 对上 journal.seq', async () => {
    const dir = tmpDir()
    const session = makeSession(dir, stubLlm())
    const before = session.view()
    const res = await session.beat('我推门进去。', new AbortController().signal, noProgress)

    expect(res.seq).toBe(1)
    expect(session.view().beats).toHaveLength(before.beats.length + 1)
    expect(res.view.clock).toBe(3)
    expect(res.beat.passage).toBe(narration)

    const store = openStore(dir)
    const journal = store.readJournal()
    const passages = store.readPassage()
    expect(journal).toHaveLength(1)
    expect(passages).toHaveLength(1)
    expect(passages[0]?.beatSeq).toBe(journal[0]?.seq)
    // telemetry 由服务端注入：模型串与用量都落在 journal 里
    expect(journal[0]?.telemetry?.models.referee).toBe('stub/referee')
    expect(journal[0]?.telemetry?.usage.referee.calls).toBe(1)
    expect(session.view().inFlight).toBe(false)
  })

  it('并发：第一拍未完成时第二次 beat() 立刻抛 E_BEAT_IN_FLIGHT', async () => {
    const held = gate()
    const session = makeSession(
      tmpDir(),
      stubLlm({ referee: async () => {
        await held.wait
        return { text: verdictFor('p0'), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/referee' }
      } }),
    )
    const first = session.beat('我推门进去。', new AbortController().signal, noProgress)
    expect(session.inFlight()).toBe(true)
    await expect(session.beat('我又说了一句。', new AbortController().signal, noProgress)).rejects.toMatchObject({
      code: 'E_BEAT_IN_FLIGHT',
    })
    held.open()
    await expect(first).resolves.toMatchObject({ seq: 1 })
    expect(session.inFlight()).toBe(false)
  })

  it('abort：中止后 journal 不落、world 的 clock 不变', async () => {
    const dir = tmpDir()
    const held = gate()
    const session = makeSession(
      dir,
      stubLlm({ referee: async () => {
        await held.wait
        return { text: verdictFor('p0'), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/referee' }
      } }),
    )
    const controller = new AbortController()
    const pending = session.beat('我推门进去。', controller.signal, noProgress)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'E_MODEL_CALL' })
    held.open()
    const store = openStore(dir)
    expect(store.readJournal()).toHaveLength(0)
    expect(store.readPassage()).toHaveLength(0)
    expect(session.view().clock).toBe(0)
    expect(session.view().beats).toHaveLength(0)
  })

  it('reset()：clock 归 0、journal 清空', async () => {
    const dir = tmpDir()
    const session = makeSession(dir, stubLlm())
    await session.beat('我推门进去。', new AbortController().signal, noProgress)
    expect(session.view().clock).toBe(3)

    session.reset()

    expect(session.view().clock).toBe(0)
    expect(session.view().beats).toHaveLength(0)
    expect(openStore(dir).readJournal()).toHaveLength(0)
    expect(openStore(dir).readPassage()).toHaveLength(0)
  })

  it('旁白失败：passage 走事实摘要兜底，fallback 为 true', async () => {
    const session = makeSession(
      tmpDir(),
      stubLlm({ narration: async () => ({ text: '', toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/narration' }) }),
    )
    const res = await session.beat('我推门进去。', new AbortController().signal, noProgress)
    expect(res.beat.fallback).toBe(true)
    expect(res.beat.passage).toContain('这一拍的叙述没有生成')
  })

  it('view() 的 beats 里玩家原话来自本拍的 claim', async () => {
    const session = makeSession(tmpDir(), stubLlm())
    await session.beat('我把两枚银元塞进安手里。', new AbortController().signal, noProgress)
    expect(session.view().beats[0]?.player).toBe('我把两枚银元塞进安手里。')
  })

  it('authorView()：journal 与 usage 都有内容，单拍详情能拿到 prompts 与 notes', async () => {
    const session = makeSession(tmpDir(), stubLlm())
    await session.beat('我推门进去。', new AbortController().signal, noProgress)

    const view = session.authorView()
    expect(view.journal).toHaveLength(1)
    expect(view.usage.cognition.calls).toBe(1)
    expect(view.usage.referee.calls).toBe(1)
    expect(view.usage.narration.calls).toBe(1)
    expect(view.usage.referee.cost).toBeCloseTo(0.01)
    expect(view.prompts).toHaveLength(1)
    expect(view.prompts[0]?.calls.map((call) => call.role).sort()).toEqual(['cognition', 'narration', 'referee'])

    const detail = session.authorBeat(1)
    expect(detail?.entry.seq).toBe(1)
    expect(detail?.passage?.text).toBe(narration)
    expect(detail?.prompts).toHaveLength(3)
    expect(detail?.notes).toEqual([])
    expect(session.authorBeat(99)).toBeUndefined()
  })
})
