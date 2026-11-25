import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openStore, type ChatRequest, type ChatResult, type ContentPack, type Llm } from '@ai-world/core'
import { createSession, type Session } from './session.ts'

/* ── fixture：一个热人物 + 一个玩家；NPC 热到 0.8 才会被叫到 ── */

/** core 有 200–400 字的下限：fixture 必须真的合法，保存用例才走得通。 */
const CORE =
  '老板娘安守着这间酒馆十一年，见多了进进出出的客人，也听多了没头没尾的醉话。她记性好得很，谁欠过账、谁撒过谎，心里都有一本。雨夜里她话少，手上却不停：擦杯子、续酒、把跑偏的话题拨回正事。她待人不冷，只是从不许诺，凡是答应的都用一句短话钉死。后半夜她算账，笔尖在账本上压得很重，谁在她这间屋里多坐一刻、多喝一杯，她都知道。她也知道街面上谁刚得了钱、谁又要躲债，只是不说。她把银元收进围裙口袋时，会先括一下，再抬眼看看给钱的人。'

function pack(): ContentPack {
  return {
    title: '测试酒馆',
    world: {
      ledger: { clock: 0, at: { player: 'saloon', ann: 'saloon' }, holds: {}, phys: {}, rel: {}, knows: {} },
      facts: {},
      places: { saloon: '酒馆' },
    },
    characters: [
      { id: 'ann', core: CORE, voice: '短句', drives: [{ id: 'd1', text: '想把最后一杯酒卖出去', heat: 0.8 }], beliefs: {} },
    ],
    canon: ['外面的雨没停。'],
    player: 'player',
    names: { player: '你', ann: '安' },
    items: {},
  }
}

/** 带陈设的现场：柜台 / 铁盒 / 桌子 与 门 / 灯 都在账本里，但只有人是“在场者”。 */
function furnishedPack(): ContentPack {
  const base = pack()
  return {
    ...base,
    scene: '雨夜的酒馆，柜台上摆着酒瓶。',
    world: {
      ...base.world,
      ledger: {
        ...base.world.ledger,
        at: { player: 'saloon', ann: 'saloon', counter: 'saloon', strongbox: 'saloon', table: 'saloon', door: 'saloon', lamp: 'saloon' },
        holds: { counter: { whiskey: 3 }, strongbox: { 'ledger-book': 1 }, table: { cup: 1 } },
        phys: { strongbox: { locked: true }, door: { closed: true }, lamp: { lit: true } },
      },
    },
    names: { player: '你', ann: '安', counter: '柜台', strongbox: '铁盒', table: '桌子', door: '门', lamp: '灯' },
    items: { whiskey: '威士忌', 'ledger-book': '账本', cup: '杯子' },
  }
}

/** 玩家主张的 id 是 `p${clock}`；裁判只判它，人物主张由 parseRefereeOutput 按"无事发生"补齐。 */
const verdictFor = (claimId: string): string =>
  JSON.stringify({
    order: ['player'],
    verdicts: [{ claimId, ok: true, duration: 3, deltas: [{ op: 'fact', text: '玩家进门了。', actor: 'player', kind: 'state' }] }],
    // 感知摘要按实体写：缺一条就会在 notes 里留"无感知摘要"（决策 #42）
    observations: {
      player: { claimIds: [claimId], summary: '你推门进去了。' },
      ann: { claimIds: [claimId], summary: '你看见有人推门进来。' },
    },
  })

/** 两个显示名都在正文里：干净的一拍不该留下“旁白漏写”的 notes（T5）。 */
const narration = '雨顺着门缝往里渗，安抬头看了你一眼。'

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
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

function makeSession(dir: string, llm: Llm, contentPath = writePack(dir)): Session {
  return createSession({ dir, contentPath, pack: pack(), llm })
}

/** 每个用例一份临时内容包：保存用例绝不碰仓库里的 `content/`。 */
function writePack(dir: string, value: ContentPack = pack()): string {
  const path = join(dir, 'pack.json')
  writeFileSync(path, JSON.stringify(value, null, 2))
  return path
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

  it('总时限：provider 挂死时超时放锁，journal 不落，下一拍仍能发', async () => {
    const dir = tmpDir()
    let hang = true
    const llm = stubLlm({
      referee: async () => {
        if (hang) {
          hang = false
          await new Promise<never>(() => {})
        }
        return { text: verdictFor('p0'), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/referee' }
      },
    })
    const session = createSession({ dir, contentPath: writePack(dir), pack: pack(), llm, timeoutMs: 20 })

    const failure = await session.beat('我推门进去。', new AbortController().signal, noProgress).catch((error: Error) => error)
    expect(failure).toMatchObject({ code: 'E_MODEL_CALL' })
    expect((failure as Error).message).toContain('未结算')
    expect(session.inFlight()).toBe(false)
    expect(openStore(dir).readJournal()).toHaveLength(0)
    // 超时不得把世界锁死
    await expect(session.beat('我推门进去。', new AbortController().signal, noProgress)).resolves.toMatchObject({ seq: 1 })
  })

  /** 每拍都提一条自我修订：用来撞稀缺闸。 */
  function echoSelf(): ChatResult {
    return {
      text: JSON.stringify({ inner: '', outward: '安看了你一眼。', selfChange: '决定不再等' }),
      toolCalls: [],
      inputTokens: 1,
      outputTokens: 1,
      model: 'stub/cognition',
    }
  }

  /** 把裁判 prompt 里出现的 claimId 全部判成“成立且改了账本”：让每一拍都有世界签名。 */
  function echoSigned(req: ChatRequest): ChatResult {
    const prompt = req.messages[0]?.content ?? ''
    const ids = [...prompt.matchAll(/"claimId":\s*"([^"]+)"/g)].map((m) => m[1] ?? '')
    const verdicts = ids.map((claimId) => ({ claimId, ok: true, duration: 1, deltas: [{ op: 'fact', text: '发生了点事' }] }))
    return { text: JSON.stringify({ order: [], verdicts, observations: {} }), toolCalls: [], inputTokens: 1, outputTokens: 1, model: 'stub/referee' }
  }

  it('成长窗口按拍号：折场不重置，13 拍只长两次', async () => {
    const dir = tmpDir()
    const session = makeSession(
      dir,
      // 裁判把 prompt 里真实出现的 claimId 全部判成“成立并改了账本”，否则每一拍都没有签名；
      // 人物侧每拍都给一条自我修订，才会真的去撞稀缺闸
      stubLlm({ referee: async (req) => echoSigned(req), cognition: async () => echoSelf() }),
    )
    for (let i = 1; i <= 13; i += 1) await session.beat(`第 ${i} 句`, new AbortController().signal, noProgress)

    const journal = openStore(dir).readJournal()
    expect(journal.filter((e) => e.type === 'scene/fold')).toHaveLength(1)
    const refs = journal.flatMap((e) => e.experience?.['ann'] ?? []).filter((e) => e.kind === 'self').map((e) => e.ref)
    // 第 1 与第 11 拍：折场（第 12 拍末）不重置窗口
    expect(refs).toEqual([1, 11])
  })

  it('失败的一拍不占拍号', async () => {
    const dir = tmpDir()
    let fail = true
    const session = makeSession(
      dir,
      stubLlm({
        referee: async () => {
          if (fail) {
            fail = false
            throw new Error('模型挂了')
          }
          return { text: verdictFor('p0'), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/referee' }
        },
        cognition: async () => ({
          text: JSON.stringify({ inner: '', outward: '安看了你一眼。', selfChange: '决定不再等' }),
          toolCalls: [],
          inputTokens: 1,
          outputTokens: 1,
          model: 'stub/cognition',
        }),
      }),
    )

    await expect(session.beat('第一句', new AbortController().signal, noProgress)).rejects.toMatchObject({ code: 'E_MODEL_CALL' })
    await session.beat('第二句', new AbortController().signal, noProgress)

    const self = openStore(dir)
      .readJournal()
      .flatMap((e) => e.experience?.['ann'] ?? [])
      .filter((e) => e.kind === 'self')
    expect(self.map((e) => e.ref)).toEqual([1])
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

  it('sceneText 的“在场”只列玩家与人物，不列陈设与门灯', async () => {
    const prompts: string[] = []
    const dir = tmpDir()
    const value = furnishedPack()
    const session = createSession({
      dir,
      contentPath: writePack(dir, value),
      pack: value,
      llm: stubLlm({
        referee: async (req) => {
          prompts.push(req.messages[0]?.content ?? '')
          return { text: verdictFor('p0'), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/referee' }
        },
      }),
    })
    await session.beat('我看了看柜台。', new AbortController().signal, noProgress)

    // scene 散文本身可以提柜台，所以只取“在场”那一行断言
    const presentLine = prompts.join('\n').split('\n').find((line) => line.startsWith('酒馆：')) ?? ''
    expect(presentLine).toBe('酒馆：你、安在场。')
    for (const fixture of ['柜台', '铁盒', '桌子', '门', '灯']) expect(presentLine).not.toContain(fixture)
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

describe('内容保存', () => {
  it('保存合法内容：diskHash 变、activeHash 不变、changed 为 true、磁盘就是写入的文本', () => {
    const dir = tmpDir()
    const session = makeSession(dir, stubLlm())
    const before = session.content()
    const text = JSON.stringify({ ...pack(), canon: ['外面的雨没停。', '灯还亮着。'] }, null, 2)

    const saved = session.saveContent(text)
    const after = session.content()

    expect(saved.activeHash).toBe(before.activeHash)
    expect(saved.diskHash).not.toBe(before.diskHash)
    expect(after.activeHash).toBe(before.activeHash)
    expect(after.diskHash).toBe(saved.diskHash)
    expect(after.changed).toBe(true)
    expect(readFileSync(session.contentPath(), 'utf8')).toBe(text)
  })

  it('保存非法内容：抛 E_INVALID_CONTENT + errors，磁盘字节逐个不变', () => {
    const dir = tmpDir()
    const session = makeSession(dir, stubLlm())
    const path = session.contentPath()
    const before = readFileSync(path)
    const broken = JSON.stringify({ ...pack(), characters: [{ ...pack().characters[0], core: '老板娘' }] })
    let thrown: unknown
    try {
      session.saveContent(broken)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({ code: 'E_INVALID_CONTENT' })
    const errors = (thrown as { errors?: string[] }).errors ?? []
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join('')).toContain('core')
    expect(readFileSync(path).equals(before)).toBe(true)
    expect(session.content().changed).toBe(false)
  })

  it('保存后 reset()：activeHash 与 diskHash 对齐，新 core 真的进了人物', async () => {
    const systems: string[] = []
    const dir = tmpDir()
    const contentPath = writePack(dir)
    const scoped = createSession({
      dir,
      contentPath,
      pack: pack(),
      llm: stubLlm({
        cognition: async (req) => {
          systems.push(req.system ?? '')
          return {
            text: JSON.stringify({ inner: '', outward: '安看了你一眼。' }),
            toolCalls: [],
            inputTokens: 0,
            outputTokens: 0,
            model: 'stub/cognition',
          }
        },
      }),
    })
    const next = pack()
    const ann = next.characters[0]
    if (ann === undefined) throw new Error('fixture 里没有 ann')
    next.characters = [{ ...ann, core: `${CORE.slice(0, -1)}这句是新补的。` }]

    scoped.saveContent(JSON.stringify(next, null, 2))
    expect(scoped.content().changed).toBe(true)

    scoped.reset()

    const status = scoped.content()
    expect(status.activeHash).toBe(status.diskHash)
    expect(status.changed).toBe(false)
    systems.length = 0
    await scoped.beat('我推门进去。', new AbortController().signal, noProgress)
    expect(systems.join('\n')).toContain('这句是新补的。')
  })

  it('结算中保存：抛 E_BEAT_IN_FLIGHT，磁盘不动', async () => {
    const held = gate()
    const dir = tmpDir()
    const contentPath = writePack(dir)
    const session = createSession({
      dir,
      contentPath,
      pack: pack(),
      llm: stubLlm({
        referee: async () => {
          await held.wait
          return { text: verdictFor('p0'), toolCalls: [], inputTokens: 0, outputTokens: 0, model: 'stub/referee' }
        },
      }),
    })
    const before = readFileSync(contentPath)
    const pending = session.beat('我推门进去。', new AbortController().signal, noProgress)
    let code = ''
    try {
      session.saveContent(JSON.stringify(pack()))
    } catch (error) {
      code = (error as { code?: string }).code ?? ''
    }
    expect(code).toBe('E_BEAT_IN_FLIGHT')
    expect(readFileSync(contentPath).equals(before)).toBe(true)

    held.open()
    await expect(pending).resolves.toMatchObject({ seq: 1 })
  })
})
