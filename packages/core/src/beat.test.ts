import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runBeat, type BeatInput } from './beat.ts'
import { createStubCognition } from './cognition.ts'
import type { Character } from './character.ts'
import { createStubNarrator, type NarrationInput } from './narrate.ts'
import { createStubReferee, type RefereeInput, type RefereeOutput } from './referee.ts'
import { openScene } from './scene.ts'
import { openStore, replay, replayCharacters, type Store } from './store.ts'
import { createStubSuggester } from './suggest.ts'
import type { EntId, World } from './world.ts'
import type { Referee } from './referee.ts'

const dirs: string[] = []

function tmpStore(): Store {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-beat-'))
  dirs.push(dir)
  return openStore(dir)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

function world(): World {
  return {
    ledger: { clock: 0, at: { player: 'saloon', ann: 'saloon', doc: 'saloon' }, holds: {}, phys: {}, rel: {}, knows: {} },
    facts: {},
    places: { saloon: '酒馆', street: '街道' },
  }
}

function characters(): Map<EntId, Character> {
  const mk = (id: EntId, text: string): Character => ({
    id,
    core: text,
    voice: '短句',
    drives: [{ id: 'd1', text: '想把这杯酒卖出去', heat: 0.8 }],
    beliefs: {},
    experience: [],
    busyUntil: 0,
  })
  return new Map([
    ['ann', mk('ann', '老板娘')],
    ['doc', mk('doc', '医生')],
    ['player', { id: 'player', drives: [], beliefs: {}, experience: [], busyUntil: 0 }],
  ])
}

const say = (text: string) => JSON.stringify({ inner: '想说话', outward: text })

function verdict(claimId: string, deltas: RefereeOutput['verdicts'][number]['deltas'], duration = 1): RefereeOutput['verdicts'][number] {
  return { claimId, actor: 'ann', ok: true, deltas, duration }
}

/** 每拍都“成立但什么都没变”，且 claimId 跟着本拍的 claims 走。 */
function okJudge(): Referee {
  return {
    async judge({ claims }) {
      return {
        order: ['player'],
        verdicts: claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: 1 })),
        observations: {},
        driveHits: [],
      }
    },
  }
}

function base(store: Store, referee: RefereeOutput[]): BeatInput {
  return {
    world: world(),
    scene: openScene({ id: 's1', place: 'saloon', clock: 0, participants: ['player', 'ann', 'doc'] }),
    characters: characters(),
    player: 'player',
    beatIndex: 1,
    sceneText: '雨夜的酒馆，灯快没了。',
    canon: ['这家酒馆欠着银行的债'],
    deps: {
      store,
      referee: createStubReferee(referee),
      cognition: createStubCognition([say('ann 把杯子推过去'), say('doc 抬头看了一眼')]),
      narrator: createStubNarrator(['雨还没停。', '灯灭了一盏。', '没人再说话。']),
    },
  }
}

describe('runBeat：并发', () => {
  it('同一拍内多个 actor 的认知同时发起，不等前一个返回', async () => {
    const store = tmpStore()
    const input = base(store, [
      { order: ['ann'], verdicts: [verdict('a0', [], 1), verdict('d0', [], 1)], observations: {}, driveHits: [] },
    ])
    const gate: (() => void)[] = []
    let started = 0
    const cognition = {
      think: () => {
        started += 1
        return new Promise<{ output: { inner: string; outward: string }; experience: [] }>((resolve) => {
          gate.push(() => resolve({ output: { inner: '看着', outward: '点了下头' }, experience: [] }))
        })
      },
    }
    const running = runBeat({ ...input, deps: { ...input.deps, cognition } })
    await new Promise((r) => setTimeout(r, 0))
    // 串行实现此时只会发起 1 次
    expect(started).toBe(2)
    for (const release of gate) release()
    await running
  })
})

describe('runBeat：玩家输入可见', () => {
  it('人物认知的 sceneText 含玩家本拍输入', async () => {
    const store = tmpStore()
    const seen: string[] = []
    const input = base(store, [
      {
        order: ['ann'],
        verdicts: [
          { claimId: 'p0', actor: 'player', ok: true, deltas: [], duration: 1 },
          verdict('a0', [], 1),
          verdict('d0', [], 1),
        ],
        observations: {},
        driveHits: [],
      },
    ])
    input.playerClaim = '我把银元放在柜台上'
    const cognition = {
      think: (req: { sceneText: string }) => {
        seen.push(req.sceneText)
        return Promise.resolve({ output: { inner: '看着', outward: '点了下头' }, experience: [] })
      },
    }
    await runBeat({ ...input, deps: { ...input.deps, cognition } })
    expect(seen).toHaveLength(2)
    expect(seen.every((s) => s.includes('我把银元放在柜台上'))).toBe(true)
  })

  it('玩家行是未裁决主张：含“未裁决”，不再含“刚才说/做”', async () => {
    const store = tmpStore()
    const seen: string[] = []
    const input = base(store, [])
    input.playerClaim = '我把银元放在柜台上'
    const cognition = {
      think: (req: { sceneText: string }) => {
        seen.push(req.sceneText)
        return Promise.resolve({ output: { inner: '看着', outward: '点了下头' }, experience: [] })
      },
    }
    await runBeat({ ...input, deps: { ...input.deps, cognition } })

    expect(seen.every((s) => s.includes('玩家这一拍提出（尚未裁决）：我把银元放在柜台上'))).toBe(true)
    expect(seen.some((s) => s.includes('玩家刚才说/做'))).toBe(false)
  })
})

describe('runBeat：没开口不成 claim', () => {
  it('outward 为空的角色不进 claims，但有内容的人照常结算', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我把银元放在柜台上'
    const judged: string[][] = []
    input.deps.referee = {
      async judge({ claims }) {
        judged.push(claims.map((c) => c.id))
        return {
          order: [],
          verdicts: claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: 1 })),
          observations: {},
          driveHits: [],
        }
      },
    }
    input.deps.cognition = createStubCognition([say('ann 把杯子推过去'), JSON.stringify({ inner: '不想搭话', outward: '   ' })])
    const r = await runBeat(input)

    // 安一条、医生空 outward 不占 claim id
    expect(judged).toEqual([['p0', 'ann0']])
    expect(r.committedClaims).toEqual(['p0', 'ann0'])
  })

  it('全场沉默且玩家没开口：本拍没有主张，不调裁判', async () => {
    const store = tmpStore()
    const input = base(store, [])
    let called = 0
    input.deps.referee = {
      async judge() {
        called += 1
        return { order: [], verdicts: [], observations: {}, driveHits: [] }
      },
    }
    input.deps.cognition = createStubCognition(['', ''])
    const r = await runBeat(input)

    expect(called).toBe(0)
    expect(r.journalSeq).toBe(0)
    expect(r.notes).toContain('没有主张，本拍未发生')
  })
})

describe('runBeat：内心话只落 thought', () => {
  it('inner 进 experience 的 thought（w=1），不进 claim', async () => {
    const store = tmpStore()
    const input = base(store, [])
    const judged: string[] = []
    input.deps.referee = {
      async judge({ claims }) {
        judged.push(...claims.map((c) => c.text))
        return {
          order: [],
          verdicts: claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: 1 })),
          observations: {},
          driveHits: [],
        }
      },
    }
    input.deps.cognition = createStubCognition([say('ann 把杯子推过去'), say('doc 抬头看了一眼')])
    const r = await runBeat(input)

    const thoughts = (r.characters.get('ann')?.experience ?? []).filter((e) => e.kind === 'thought')
    expect(thoughts).toEqual([{ t: 0, kind: 'thought', text: '想说话', w: 1 }])
    expect(judged).not.toContain('想说话')
  })
})

describe('runBeat：人物与裁判同一份现场（决策 #42）', () => {
  const recording = (slices: { id: string; sceneText: string }[]) => ({
    think: (req: { character: { id: string }; sceneText: string }) => {
      slices.push({ id: req.character.id, sceneText: req.sceneText })
      return Promise.resolve({ output: { inner: '看着', outward: '点了下头' }, experience: [] })
    },
  })

  it('人物的账本切片含本场景物件的 phys：门不再对人隐身', async () => {
    const store = tmpStore()
    const input = base(store, [
      { order: ['ann'], verdicts: [verdict('a0', [], 1), verdict('d0', [], 1)], observations: {}, driveHits: [] },
    ])
    input.world = {
      ...input.world,
      ledger: {
        ...input.world.ledger,
        at: { ...input.world.ledger.at, door: 'saloon' },
        phys: { door: { closed: true } },
      },
    }
    const slices: { id: string; sceneText: string }[] = []
    await runBeat({ ...input, names: { door: '铁门' }, deps: { ...input.deps, cognition: recording(slices) } })

    expect(slices).toHaveLength(2)
    expect(slices.every((s) => s.sceneText.includes('铁门') && s.sceneText.includes('closed=true'))).toBe(true)
  })

  it('裁判给本人的感知摘要进下一拍的上下文', async () => {
    const store = tmpStore()
    const input = base(store, [
      {
        order: ['ann'],
        verdicts: [verdict('a0', [], 1), verdict('d0', [], 1)],
        observations: { doc: { claimIds: ['a0'], summary: '你看见安把杯子推了过来' } },
        driveHits: [],
      },
    ])
    const first = await runBeat(input)
    const slices: { id: string; sceneText: string }[] = []
    await runBeat({
      ...input,
      world: first.world,
      scene: first.scene,
      characters: first.characters,
      deps: { ...input.deps, cognition: recording(slices) },
    })

    const sliceOf = (id: string) => slices.find((s) => s.id === id)?.sceneText ?? ''
    expect(sliceOf('doc')).toContain('我感知到的：你看见安把杯子推了过来')
    // 没被写进 observations 的人看不到别人的感知
    expect(sliceOf('ann')).not.toContain('你看见安把杯子推了过来')
  })

  it('缺 observation 时不广播别人的 claim，并记 notes', async () => {
    const store = tmpStore()
    const input = base(store, [
      { order: ['ann'], verdicts: [verdict('p0', [], 1), verdict('a0', [], 1), verdict('d0', [], 1)], observations: {}, driveHits: [] },
    ])
    input.playerClaim = '我把银元放在柜台上'
    const r = await runBeat(input)

    const ann = r.scene.context['ann']?.join('\n') ?? ''
    expect(ann).toContain('把杯子推过去')
    expect(ann).not.toContain('我把银元放在柜台上')
    expect(r.notes.some((n) => n.includes('无感知摘要') && n.includes('ann'))).toBe(true)
  })

  it('上下文行用显示名，不出现实体 id', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.deps.cognition = createStubCognition(['把杯子推了过去', '抬头看了一眼'])
    input.deps.referee = {
      async judge({ claims }) {
        return {
          order: [],
          verdicts: claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: 1 })),
          observations: {
            ann: { claimIds: [], summary: '你看见柜台上的银元被收走了' },
            doc: { claimIds: [], summary: '你听见有人推门进来' },
          },
          driveHits: [],
        }
      },
    }
    input.playerClaim = '我把银元放在柜台上'
    const r = await runBeat({ ...input, names: { player: '你', ann: '安', doc: '医生' } })

    const lines = r.scene.participants.flatMap((ent) => r.scene.context[ent] ?? [])
    const joined = lines.join('\n')
    expect(joined).toContain('安：')
    expect(joined).toContain('我感知到的：')
    for (const id of ['player', 'ann', 'doc']) expect(joined).not.toContain(id)
  })

  it('canon 进裁判输入', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我推门进去'
    let canon: readonly string[] | undefined
    const referee: Referee = {
      async judge(req: RefereeInput) {
        canon = req.canon
        return {
          order: [],
          verdicts: req.claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: 1 })),
          observations: {},
          driveHits: [],
        }
      },
    }
    await runBeat({ ...input, deps: { ...input.deps, referee } })

    expect(canon).toEqual(['这家酒馆欠着银行的债'])
  })
})

describe('runBeat：降级', () => {
  it('一个人物的认知抛错时，其余人照常结算，拍不会丢', async () => {
    const store = tmpStore()
    const input = base(store, [
      { order: ['ann'], verdicts: [verdict('a0', [], 1)], observations: {}, driveHits: [] },
    ])
    const cognition = {
      think: (req: { character: { id: string } }) =>
        req.character.id === 'doc'
          ? Promise.reject(new Error('ETIMEDOUT'))
          : Promise.resolve({ output: { inner: '看着', outward: '点了下头' }, experience: [] }),
    }
    const r = await runBeat({ ...input, deps: { ...input.deps, cognition } })
    expect(r.journalSeq).toBeGreaterThan(0)
    expect(r.notes.some((n) => n.includes('doc') && n.includes('认知失败'))).toBe(true)
    expect(store.readJournal()).toHaveLength(1)
  })
})

describe('runBeat：裁判降级', () => {
  it('裁判调用失败时整拍空转，账本不动、不落 journal', async () => {
    const store = tmpStore()
    const input = base(store, [])
    const referee = { judge: () => Promise.reject(new Error('ETIMEDOUT')) }
    const r = await runBeat({ ...input, deps: { ...input.deps, referee } })
    expect(r.world).toEqual(input.world)
    expect(r.journalSeq).toBe(0)
    expect(r.notes.some((n) => n.includes('裁决失败'))).toBe(true)
    expect(store.readJournal()).toHaveLength(0)
  })
})

describe('runBeat：三拍连续', () => {
  it('每拍落一条 journal，时钟只按已提交的最长动作推进', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      { order: ['ann'], verdicts: [verdict('p0', [{ op: 'rel', from: 'ann', to: 'player', delta: 1 }], 2)], observations: { player: { claimIds: ['p0'], summary: '她把杯子推过来' } }, driveHits: [] },
      { order: ['ann'], verdicts: [verdict('a2', [{ op: 'phys', who: 'ann', key: 'lamp', value: false }], 1)], observations: {}, driveHits: [] },
      { order: [], verdicts: [{ claimId: 'p3', actor: 'ann', ok: false, reason: '酒没了', deltas: [], duration: 1 }], observations: {}, driveHits: [] },
    ]
    let input = base(store, referee)
    input.playerClaim = '我要一杯酒'
    let r = await runBeat(input)

    input = { ...input, world: r.world, scene: r.scene, characters: r.characters }
    r = await runBeat(input)

    input = { ...input, world: r.world, scene: r.scene, characters: r.characters, playerClaim: '再来一杯' }
    r = await runBeat(input)

    const journal = store.readJournal()
    expect(journal.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(journal.map((e) => e.clock)).toEqual([2, 3, 3])
    expect(store.readPassage().map((p) => p.text)).toEqual(['雨还没停。', '灯灭了一盏。', '没人再说话。'])
    expect(store.readPassage().every((p) => p.source === 'narrator')).toBe(true)
    expect(r.world.ledger.rel.ann?.player).toBe(1)
    expect(r.world.ledger.phys.ann?.lamp).toBe(false)
    // 被拒绝的理由进当事人记忆，不进 notes（notes 只记 op 级失败）
    expect(r.characters.get('ann')?.experience.at(-1)?.text).toContain('酒没了')
  })
})

describe('runBeat：观测与后果写回人物', () => {
  it('在场者把观测记成经验，被拒绝者记住理由', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [{ claimId: 'p0', actor: 'ann', ok: false, reason: '门是铸铁焊死的', deltas: [], duration: 1 }],
        observations: { doc: { claimIds: ['p0'], summary: '他看见有人去推那扇铁门' } },
        driveHits: [{ ent: 'ann', driveId: 'd1', delta: -0.3 }],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我一脚踹开铁门'
    const r = await runBeat(input)

    expect(r.characters.get('doc')?.experience.at(-1)?.text).toContain('铁门')
    expect(r.characters.get('ann')?.experience.at(-1)?.text).toContain('铸铁')
    expect(r.characters.get('ann')?.drives[0]?.heat).toBeCloseTo(0.5)
    // 玩家看得到自己失败的理由
    expect(r.characters.get('player')?.experience).toEqual([])
  })
})

describe('runBeat：旁白失败', () => {
  const referee: RefereeOutput[] = [
    {
      order: ['ann'],
      verdicts: [
        { claimId: 'p0', actor: 'player', ok: false, reason: '门是铸铁焊死的', deltas: [], duration: 1 },
        verdict('a0', [], 1),
        verdict('d0', [], 1),
      ],
      observations: {},
      driveHits: [],
    },
  ]

  it('旁白抛错时保留账本，落 fallback passage 并留 notes', async () => {
    const store = tmpStore()
    const input = base(store, referee)
    input.playerClaim = '我一脚踹开铁门'
    const narrator = { narrate: () => Promise.reject(new Error('ETIMEDOUT')) }
    const r = await runBeat({ ...input, deps: { ...input.deps, narrator } })

    expect(r.passage).toContain('叙述没有生成')
    expect(r.passage).toContain('门是铸铁焊死的')
    expect(r.notes.some((n) => n.includes('旁白失败'))).toBe(true)
    expect(store.readJournal()).toHaveLength(1)
    expect(store.readPassage()).toHaveLength(1)
    expect(store.readPassage()[0]?.source).toBe('fallback')
  })

  it('旁白返回空文本时同样不丢拍', async () => {
    const store = tmpStore()
    const input = base(store, referee)
    input.playerClaim = '我一脚踹开铁门'
    const narrator = { narrate: async () => ({ text: '   ', absoluteTime: [] }) }
    const r = await runBeat({ ...input, deps: { ...input.deps, narrator } })

    expect(r.passage).toContain('叙述没有生成')
    expect(r.notes.some((n) => n.includes('旁白失败'))).toBe(true)
    expect(store.readJournal()).toHaveLength(1)
    expect(store.readPassage()[0]?.source).toBe('fallback')
  })
})

describe('runBeat：旁白编排', () => {
  it('旁白事件按裁判给的 order 排，未列出的保持 claim 原顺序', async () => {
    const store = tmpStore()
    const judge: RefereeOutput[] = [
      {
        order: ['doc'],
        verdicts: [verdict('p0', [], 1), verdict('ann0', [], 1), verdict('doc0', [], 1)],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, judge)
    input.playerClaim = '我推门进去'
    let actors: EntId[] = []
    let events = 0
    const narrator = {
      narrate: async (req: NarrationInput) => {
        actors = req.events.map((e) => e.actor)
        events = req.events.length
        return { text: '你推门进去。', absoluteTime: [] }
      },
    }
    await runBeat({ ...input, deps: { ...input.deps, narrator } })

    // order 里的 doc 先写；玩家与 ann 没被列出，保持收集顺序接在后面
    expect(actors).toEqual(['doc', 'player', 'ann'])
    expect(events).toBe(3)
    // 收集顺序不变：journal 记的是 claim 原顺序，不是叙述顺序
    expect(store.readJournal()[0]?.claims.map((c) => c.actor)).toEqual(['player', 'ann', 'doc'])
  })

  it('已落账的动作没在旁白里露面时记一条 notes，且 passage 原样', async () => {
    const store = tmpStore()
    const judge: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [], 1), verdict('ann0', [], 1), verdict('doc0', [], 1)],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, judge)
    input.playerClaim = '我推门进去'
    const prose = '安把杯子推过去，医生抬头看了一眼。'
    const narrator = { narrate: async () => ({ text: prose, absoluteTime: [] }) }
    const r = await runBeat({
      ...input,
      names: { player: '你', ann: '安', doc: '医生' },
      deps: { ...input.deps, narrator },
    })

    expect(r.committedClaims).toHaveLength(3)
    // 漏写用显示名（安/你），不是 id；只报告，一个字的正文都不改
    expect(r.notes.filter((n) => n.startsWith('旁白漏写：'))).toEqual(['旁白漏写：你'])
    expect(r.passage).toBe(prose)
    expect(store.readPassage()[0]?.text).toBe(prose)
  })

  it('旁白超过 3 段时记一条段落数 notes，正文原样', async () => {
    const store = tmpStore()
    const judge: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [], 1), verdict('ann0', [], 1), verdict('doc0', [], 1)],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, judge)
    input.playerClaim = '我推门进去'
    const prose = '你推门进去。\n\n安把杯子推过去。\n\n医生抬头看了一眼。\n\n雨还没停。'
    const narrator = { narrate: async () => ({ text: prose, absoluteTime: [] }) }
    const r = await runBeat({
      ...input,
      names: { player: '你', ann: '安', doc: '医生' },
      deps: { ...input.deps, narrator },
    })

    expect(r.notes.filter((n) => n.startsWith('旁白段落数'))).toEqual(['旁白段落数 4 > 3'])
    expect(r.passage).toBe(prose)
    expect(store.readPassage()[0]?.text).toBe(prose)
  })

  it('旁白 3 段时不记段落数 notes', async () => {
    const store = tmpStore()
    const judge: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [], 1), verdict('ann0', [], 1), verdict('doc0', [], 1)],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, judge)
    input.playerClaim = '我推门进去'
    const prose = '你推门进去。\n\n安把杯子推过去。\n\n医生抬头看了一眼。'
    const narrator = { narrate: async () => ({ text: prose, absoluteTime: [] }) }
    const r = await runBeat({
      ...input,
      names: { player: '你', ann: '安', doc: '医生' },
      deps: { ...input.deps, narrator },
    })

    expect(r.notes.some((n) => n.startsWith('旁白段落数'))).toBe(false)
    expect(r.passage).toBe(prose)
  })
})

describe('runBeat：显示名', () => {
  it('旁白事件带显示名，正文不泄漏玩家 id', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [], 1), verdict('a0', [], 1), verdict('d0', [], 1)],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我推门进去'
    let firstEventName = ''
    const narrator = {
      narrate: async (req: NarrationInput) => {
        // 事件已按裁判 order 排，不能再拿位置当“玩家那条”：按 actor 找
        firstEventName = req.events.find((e) => e.actor === 'player')?.name ?? ''
        return { text: '你推门进去，雨声跟了进来。', absoluteTime: [] }
      },
    }
    const r = await runBeat({
      ...input,
      names: { player: '你', ann: '安', doc: '医生' },
      items: { 'silver-dollar': '银元' },
      deps: { ...input.deps, narrator },
    })

    expect(firstEventName).toBe('你')
    expect(r.passage).not.toContain('player')
  })

  it('裁判上下文保留物品 id，避免把显示名当 item id', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我把两枚银元塞进安手里'
    input.world = {
      ...input.world,
      ledger: { ...input.world.ledger, holds: { player: { 'silver-dollar': 2 } } },
    }
    let context = ''
    const referee: Referee = {
      async judge(req: RefereeInput) {
        context = req.context
        return {
          order: ['ann'],
          verdicts: [verdict('p0', [], 1), verdict('a0', [], 1), verdict('d0', [], 1)],
          observations: {},
          driveHits: [],
        }
      },
    }
    await runBeat({
      ...input,
      names: { player: '你', ann: '安', doc: '医生' },
      items: { 'silver-dollar': '银元' },
      deps: { ...input.deps, referee },
    })

    expect(context).toContain('银元(silver-dollar)×2')
  })
})

describe('runBeat：事实切片接线', () => {
  it('别名从 runBeat 传到裁判上下文：玩家事实不会被时间挤掉', async () => {
    const store = tmpStore()
    const base0 = base(store, [])
    const noise = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`n${i}`, { id: `n${i}`, text: `街边杂事${i}`, at: 1 }]),
    )
    const playerFact = { id: 'mine', text: '玩家把门闩推了回去', at: 0 }
    const input: BeatInput = {
      ...base0,
      world: { ...base0.world, facts: { ...noise, mine: playerFact } },
    }
    input.playerClaim = '我推门进去'
    let context = ''
    const referee: Referee = {
      async judge(req: RefereeInput) {
        context = req.context
        return {
          order: ['ann'],
          verdicts: [verdict('p0', [], 1), verdict('a0', [], 1), verdict('d0', [], 1)],
          observations: {},
          driveHits: [],
        }
      },
    }
    await runBeat({ ...input, deps: { ...input.deps, referee } })
    expect(context).not.toContain('玩家把门闩推了回去')

    await runBeat({ ...input, aliases: { player: ['玩家'] }, deps: { ...input.deps, referee } })
    expect(context).toContain('玩家把门闩推了回去')
  })
})

describe('runBeat：已提交 claim', () => {
  it('只把全部 op 都通过的 claim 记为已提交', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [
          verdict('p0', [{ op: 'fact', text: '雨小了' }], 1),
          { claimId: 'a0', actor: 'ann', ok: true, deltas: [{ op: 'transfer', from: 'ann', to: 'player', item: 'missing', n: 1 }], duration: 1 },
        ],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我看了看窗外'
    const r = await runBeat(input)

    expect(r.committedClaims).toContain('p0')
    expect(r.committedClaims).not.toContain('a0')
  })
})

describe('runBeat：clock 只按已提交 claim 推进', () => {
  it('被拒绝的 480 分钟 claim 不推进 clock', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [{ claimId: 'p0', actor: 'player', ok: false, reason: '没有一整夜可睡', deltas: [], duration: 480 }],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我睡一整夜'
    const r = await runBeat(input)

    expect(r.committedClaims).toEqual([])
    expect(r.world.ledger.clock).toBe(0)
    expect(store.readJournal()[0]?.clock).toBe(0)
  })

  it('ok 但 op 非法整条回滚的 480 分钟 claim 不推进 clock', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [
          {
            claimId: 'p0',
            actor: 'player',
            ok: true,
            deltas: [{ op: 'consume', from: 'player', item: 'ghost', n: 1 }],
            duration: 480,
          },
        ],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我喝掉不存在的东西'
    const r = await runBeat(input)

    expect(r.committedClaims).toEqual([])
    expect(r.world.ledger.clock).toBe(0)
    expect(store.readJournal()[0]?.clock).toBe(0)
  })

  it('合法 480 分钟 claim 推进 clock，fact.at 落在结束时刻', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [{ claimId: 'p0', actor: 'player', ok: true, deltas: [{ op: 'fact', text: '他睡了一整夜' }], duration: 480 }],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我睡一整夜'
    const r = await runBeat(input)

    expect(r.committedClaims).toEqual(['p0'])
    expect(r.world.ledger.clock).toBe(480)
    expect(Object.values(r.world.facts).find((f) => f.text === '他睡了一整夜')?.at).toBe(480)
    expect(r.folded?.reason).toBe('time')
    // 折场即重开：返回的场景就是下一拍要用的场景
    expect(r.scene.beats).toBe(0)
    expect(r.scene.openedAt).toBe(480)
    expect(r.scene.context['ann']).toEqual([])
  })

  it('地点变化折场后，新场景落在玩家落账后的位置', async () => {
    const store = tmpStore()
    const input = base(store, [
      {
        order: ['player'],
        verdicts: [{ claimId: 'p0', actor: 'player', ok: true, deltas: [{ op: 'move', who: 'player', to: 'street' }], duration: 1 }],
        observations: {},
        driveHits: [],
      },
    ])
    input.playerClaim = '我推门出去'
    const r = await runBeat(input)

    expect(r.folded?.reason).toBe('place')
    expect(r.scene.place).toBe('street')
    expect(r.scene.participants).toEqual(['player', 'ann', 'doc'])
  })

  it('12 拍只折一次，之后的拍落在新场景里', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.deps.referee = okJudge()
    let world = input.world
    let scene = input.scene
    for (let i = 0; i < 13; i += 1) {
      const r = await runBeat({ ...input, world, scene, playerClaim: `第 ${i} 句` })
      world = r.world
      scene = r.scene
    }

    const folds = store.readJournal().filter((e) => e.type === 'scene/fold')
    expect(folds).toHaveLength(1)
    // 折场在同一个结算内重开：第 13 拍已经落在新场景里
    expect(scene.beats).toBe(1)
    expect(scene.id).toBe(`s${folds[0]?.seq}`)
    for (const lines of Object.values(scene.context)) expect(lines).toHaveLength(1)
  })

  it('上下文达到 16k 就折场，不等满 12 拍', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.deps.referee = okJudge()
    // 每拍一句 7000 字：最长上下文三拍就过 16k（7000 × 0.9 × 3）
    const long = '我'.repeat(7000)
    let world = input.world
    let scene = input.scene
    const reasons: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const r = await runBeat({ ...input, world, scene, playerClaim: long })
      world = r.world
      scene = r.scene
      if (r.folded) reasons.push(r.folded.reason)
    }

    expect(reasons).toEqual(['tokens'])
  })

  it('拒绝的 480 不遮蔽合法 claim 的 5 分钟', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [
          { claimId: 'p0', actor: 'player', ok: false, reason: '没有一整夜可睡', deltas: [], duration: 480 },
          verdict('a0', [{ op: 'fact', text: '安应了一声' }], 5),
        ],
        observations: {},
        driveHits: [],
      },
    ]
    const input = base(store, referee)
    input.playerClaim = '我睡一整夜'
    const r = await runBeat(input)

    expect(r.committedClaims).toContain('a0')
    expect(r.world.ledger.clock).toBe(5)
  })
})

describe('runBeat：人物状态可回放', () => {
  it('两拍之后，只用 journal 就能重建人物记忆与热度', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [{ op: 'fact', text: '雨小了' }], 2), verdict('a0', [], 1), verdict('d0', [], 1)],
        observations: { doc: { claimIds: ['p0'], summary: '他看见有人把门推上' } },
        driveHits: [{ ent: 'ann', driveId: 'd1', delta: -0.3 }],
      },
      {
        order: ['ann'],
        verdicts: [verdict('p2', [{ op: 'fact', text: '灯灭了' }], 1), verdict('a2', [], 1), verdict('d2', [], 1)],
        observations: { doc: { claimIds: ['p2'], summary: '灯被人吹了' } },
        driveHits: [],
      },
    ]
    let input = base(store, referee)
    input.playerClaim = '我把门推上'
    let r = await runBeat(input)
    input = { ...input, world: r.world, scene: r.scene, characters: r.characters, playerClaim: '我吹了灯' }
    r = await runBeat(input)

    const rebuilt = replayCharacters(store.readJournal(), base(store, []).characters)
    expect(rebuilt).toEqual(r.characters)
    expect(rebuilt.get('doc')?.experience.at(-1)?.text).toContain('灯')
    expect(rebuilt.get('ann')?.drives[0]?.heat).toBeCloseTo(0.5)
  })

  it('旧 journal 没有 experience 字段时，人物停在初始状态而不是崩', () => {
    const store = tmpStore()
    const entries = [
      {
        seq: 1,
        type: 'beat' as const,
        scene: 's1',
        clock: 1,
        claims: [],
        order: [],
        verdicts: [],
        observations: {},
        driveHits: [],
      },
    ]
    const initial = base(store, []).characters
    expect(replayCharacters(entries, initial)).toEqual(initial)
  })
})

describe('runBeat：未落 journal 不推进记忆', () => {
  it('裁判失败时返回入参人物，记忆不会比 journal 多一条', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我把门推上'
    const referee = { judge: () => Promise.reject(new Error('ETIMEDOUT')) }
    const r = await runBeat({ ...input, deps: { ...input.deps, referee } })

    expect(r.journalSeq).toBe(0)
    expect(r.characters).toBe(input.characters)
    expect(replayCharacters(store.readJournal(), input.characters)).toEqual(r.characters)
  })
})

describe('runBeat：可回放', () => {
  it('按 journal 重放得到的 World 与最后一拍相同', async () => {
    const store = tmpStore()
    const referee: RefereeOutput[] = [
      { order: ['ann'], verdicts: [verdict('p0', [{ op: 'fact', text: '酒馆起火了' }, { op: 'know', who: ['doc'], fact: 'f0' }], 5)], observations: {}, driveHits: [] },
    ]
    const input = base(store, referee)
    input.playerClaim = '我点了火'
    const r = await runBeat(input)

    const played = replay(store.readJournal(), world())
    expect(played).toEqual(r.world)
    expect(played.facts.f0?.at).toBe(5)
  })
})

describe('runBeat：世界事件（claim 第三来源）', () => {
  function withLamp(input: BeatInput): BeatInput {
    const ledger = structuredClone(input.world.ledger)
    ledger.at['lamp'] = 'saloon'
    ledger.phys['lamp'] = { lit: true }
    return { ...input, world: { ...input.world, ledger } }
  }

  it('抽卡产出的 claim 照常裁决、落账、进 journal', async () => {
    const store = tmpStore()
    const input = withLamp(
      base(store, [
        { order: ['lamp'], verdicts: [verdict('w0', [{ op: 'phys', who: 'lamp', key: 'lit', value: false }], 1)], observations: {}, driveHits: [] },
      ]),
    )
    const r = await runBeat({
      ...input,
      claimSource: { draw: () => [{ id: 'w0', actor: 'lamp', text: '灯焰跳了两下，灭了。', kind: 'act' }] },
    })

    expect(r.committedClaims).toContain('w0')
    expect(r.world.ledger.phys['lamp']?.['lit']).toBe(false)
    expect(store.readJournal().flatMap((e) => e.claims).some((c) => c.id === 'w0')).toBe(true)
  })

  it('抽卡失败只丢世界事件，本拍照常结算', async () => {
    const store = tmpStore()
    const input = base(store, [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [{ op: 'fact', text: '玩家点了火' }], 1), verdict('a0', [], 1), verdict('d0', [], 1)],
        observations: {},
        driveHits: [],
      },
    ])
    const r = await runBeat({
      ...input,
      playerClaim: '我点了火',
      claimSource: {
        draw: () => {
          throw new Error('模型超时')
        },
      },
    })

    expect(r.journalSeq).toBeGreaterThan(0)
    expect(r.notes.join(' ')).toContain('抽卡失败')
    expect(r.world.facts['f0']).toBeDefined()
  })
})

describe('runBeat：成长闸', () => {
  const signedBeat: RefereeOutput = {
    order: ['ann'],
    verdicts: [{ claimId: 'ann0', actor: 'ann', ok: true, deltas: [{ op: 'fact', text: '安把杯子推过去' }], duration: 1 }],
    observations: {},
    driveHits: [],
  }
  const quietBeat: RefereeOutput = {
    order: ['ann'],
    verdicts: [{ claimId: 'ann0', actor: 'ann', ok: true, deltas: [], duration: 1 }],
    observations: {},
    driveHits: [],
  }
  const withSelf = (text: string): string => JSON.stringify({ inner: '忍住', outward: '安把杯子推过去。', selfChange: text })
  const selves = (ch?: Character) => (ch?.experience ?? []).filter((e) => e.kind === 'self')

  it('签名的一拍：自我修订落成 kind:self，未开闸的修订不降级成普通记忆', async () => {
    const store = tmpStore()
    const input = base(store, [signedBeat])
    input.deps.cognition = createStubCognition([withSelf('我不再指望他替我说话'), say('doc 抬头看了一眼')])
    const r = await runBeat(input)

    const list = selves(r.characters.get('ann'))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'self', text: '我不再指望他替我说话', w: 3 })
    // 未开闸的修订不得降级成普通记忆：内心话只留 thought，selfChange 原文不落
    const thoughts = (r.characters.get('ann')?.experience ?? []).filter((e) => e.kind === 'thought')
    expect(thoughts.map((e) => e.text)).toEqual(['忍住'])
  })

  it('没有签名的一拍：自我修订直接丢弃', async () => {
    const store = tmpStore()
    const input = base(store, [quietBeat])
    input.deps.cognition = createStubCognition([withSelf('我不再指望他替我说话'), say('doc 抬头看了一眼')])
    const r = await runBeat(input)

    expect(selves(r.characters.get('ann'))).toHaveLength(0)
    const thoughts = (r.characters.get('ann')?.experience ?? []).filter((e) => e.kind === 'thought')
    expect(thoughts.map((e) => e.text)).toEqual(['忍住'])
  })

  it('整条回滚不算签名：自我修订不落', async () => {
    const store = tmpStore()
    const input = base(store, [
      {
        order: ['ann'],
        verdicts: [{ claimId: 'ann0', actor: 'ann', ok: true, deltas: [{ op: 'consume', from: 'ann', item: 'ghost', n: 1 }], duration: 1 }],
        observations: {},
        driveHits: [],
      },
    ])
    input.deps.cognition = createStubCognition([withSelf('我不再指望他替我说话'), say('doc 抬头看了一眼')])
    const r = await runBeat(input)

    expect(r.committedClaims).toEqual([])
    expect(selves(r.characters.get('ann'))).toHaveLength(0)
  })

  it('隔过窗口就能再长一条：窗口按拍号算，不按场景', async () => {
    const store = tmpStore()
    const input = base(store, [signedBeat])
    input.deps.cognition = createStubCognition([
      withSelf('第一条'),
      say('doc 抬头看了一眼'),
      withSelf('第二条'),
      say('doc 又看了一眼'),
    ])
    const first = await runBeat({ ...input, beatIndex: 1 })
    // 第 11 拍：还在同一个场景里，但第一条已经出了 10 拍窗口
    const second = await runBeat({ ...input, world: first.world, scene: first.scene, characters: first.characters, beatIndex: 11 })

    expect(second.folded).toBeUndefined()
    expect(selves(second.characters.get('ann')).map((e) => e.text)).toEqual(['第一条', '第二条'])
    expect(selves(second.characters.get('ann')).map((e) => e.ref)).toEqual([1, 11])
  })

  it('同一场景只长一条：第二个签名拍的自我修订被稀缺闸挡住', async () => {
    const store = tmpStore()
    const input = base(store, [signedBeat])
    input.deps.cognition = createStubCognition([
      withSelf('第一条'),
      say('doc 抬头看了一眼'),
      withSelf('第二条'),
      say('doc 又看了一眼'),
    ])
    const first = await runBeat(input)
    const second = await runBeat({ ...input, world: first.world, scene: first.scene, characters: first.characters, beatIndex: 2 })

    const list = selves(second.characters.get('ann'))
    expect(list).toHaveLength(1)
    expect(list[0]?.text).toBe('第一条')
    expect(second.folded).toBeUndefined()
    expect(store.readJournal()[1]?.experience?.['ann']?.some((e) => e.kind === 'self')).toBe(false)
  })
})

describe('runBeat：动作提示', () => {
  /** 一拍能落账的最小裁决：玩家那句话成立、无变化。 */
  const settled: RefereeOutput = {
    order: ['player'],
    verdicts: [{ claimId: 'p0', actor: 'player', ok: true, deltas: [], duration: 1 }],
    observations: { player: { claimIds: ['p0'], summary: '你把银元放在柜台上。' } },
    driveHits: [],
  }

  const HINTS = ['问安账本的事', '把杯子推回柜台', '看一眼地窖门']

  it('带 suggester 时 result.hints 与 passage.hints 一致，并落盘', async () => {
    const store = tmpStore()
    const input = base(store, [settled])
    input.playerClaim = '我把银元放在柜台上。'
    const r = await runBeat({ ...input, deps: { ...input.deps, suggester: createStubSuggester([JSON.stringify({ hints: HINTS })]) } })

    expect(r.hints).toEqual(HINTS)
    expect(store.readPassage()[0]?.hints).toEqual(HINTS)
  })

  it('suggester 抛错时这一拍照常落账，只是没有提示', async () => {
    const store = tmpStore()
    const input = base(store, [settled])
    input.playerClaim = '我把银元放在柜台上。'
    const suggester = { suggest: () => Promise.reject(new Error('ETIMEDOUT')) }
    const r = await runBeat({ ...input, deps: { ...input.deps, suggester } })

    expect(r.journalSeq).toBeGreaterThan(0)
    expect(r.passage).not.toBe('')
    expect(r).not.toHaveProperty('hints')
    expect(r.notes.some((n) => n.includes('动作提示失败') && n.includes('ETIMEDOUT'))).toBe(true)
    expect(store.readPassage()[0]?.hints).toBeUndefined()
  })

  it('不传 suggester：没有提示，也不留 note（旧调用点不受影响）', async () => {
    const store = tmpStore()
    const input = base(store, [settled])
    input.playerClaim = '我把银元放在柜台上。'
    const r = await runBeat(input)

    expect(r).not.toHaveProperty('hints')
    expect(r.notes.filter((n) => n.includes('动作提示'))).toEqual([])
  })

  it('与旁白并行：两边都发起之后才等结果', async () => {
    const store = tmpStore()
    const input = base(store, [settled])
    input.playerClaim = '我把银元放在柜台上。'
    const gates: (() => void)[] = []
    let started = 0
    const narrator = {
      narrate: () => {
        started += 1
        return new Promise<{ text: string; absoluteTime: string[] }>((resolve) => {
          gates.push(() => resolve({ text: '雨还没停。', absoluteTime: [] }))
        })
      },
    }
    const suggester = {
      suggest: () => {
        started += 1
        return new Promise<{ hints: string[] }>((resolve) => {
          gates.push(() => resolve({ hints: HINTS }))
        })
      },
    }
    const running = runBeat({ ...input, deps: { ...input.deps, narrator, suggester } })
    await new Promise((r) => setTimeout(r, 0))
    // 串行实现此时只会发起旁白那一次
    expect(started).toBe(2)
    for (const release of gates) release()
    const r = await running
    expect(r.hints).toEqual(HINTS)
  })

  it('含 id 或引擎词的提示被丢掉，并在 notes 里留痕', async () => {
    const store = tmpStore()
    const input = base(store, [settled])
    input.playerClaim = '我把银元放在柜台上。'
    const hints = ['问 ann 账本的事', '看 ledger 一眼', '看一眼地窖门']
    const r = await runBeat({
      ...input,
      names: { player: '你', ann: '安' },
      items: { 'silver-dollar': '银元' },
      deps: { ...input.deps, suggester: createStubSuggester([JSON.stringify({ hints })]) },
    })

    expect(r.hints).toEqual(['看一眼地窖门'])
    expect(r.notes.filter((n) => n.includes('动作提示被丢弃'))).toHaveLength(2)
  })

  it('地点 id 也算 id：提示里出现 saloon 会被丢掉', async () => {
    const store = tmpStore()
    const input = base(store, [settled])
    input.playerClaim = '我把银元放在柜台上。'
    const hints = ['回 saloon 去看看', '问 ann 账本的事', '看一眼地窖门']
    const r = await runBeat({
      ...input,
      names: { player: '你', ann: '安' },
      items: { 'silver-dollar': '银元' },
      deps: { ...input.deps, suggester: createStubSuggester([JSON.stringify({ hints })]) },
    })

    expect(r.hints).toEqual(['看一眼地窖门'])
    expect(r.notes.filter((n) => n.includes('动作提示被丢弃'))).toHaveLength(2)
  })

  it('输入只有玩家可见的数据：没有别人的原话、没有感知以外的东西', async () => {
    const store = tmpStore()
    const input = base(store, [
      {
        order: ['ann'],
        verdicts: [verdict('p0', [], 1), verdict('ann0', [], 1), verdict('doc0', [], 1)],
        observations: { player: { claimIds: ['p0'], summary: '你把银元放在柜台上。' } },
        driveHits: [],
      },
    ])
    input.playerClaim = '我把银元放在柜台上。'
    const seen: { input: Parameters<typeof JSON.stringify>[0] }[] = []
    const suggester = {
      suggest: (req: unknown) => {
        seen.push({ input: req })
        return Promise.resolve({ hints: [] })
      },
    }
    await runBeat({
      ...input,
      names: { player: '你', ann: '安', doc: '医生', counter: '柜台' },
      items: { 'silver-dollar': '银元' },
      deps: { ...input.deps, suggester },
    })

    // 只看喂进去的**值**：字段名（playerClaim）里带 player 是代码写法，不是泄漏
    const values: string[] = []
    const walk = (value: unknown): void => {
      if (typeof value === 'string') values.push(value)
      else if (Array.isArray(value)) value.forEach(walk)
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk)
    }
    walk(seen[0]?.input)
    const fed = values.join('\n')
    // 别人的主张与裁判意见都不进提示器
    expect(fed).not.toContain('把杯子推过去')
    expect(fed).not.toContain('抬头看了一眼')
    // 实体 id、物品 id 一个都不出现
    for (const id of ['player', 'ann', 'doc', 'counter', 'silver-dollar']) expect(fed).not.toContain(id)
    expect(fed).toContain('你把银元放在柜台上。')
    expect(fed).toContain('我把银元放在柜台上。')
    expect(fed).toContain('安')
  })
})

describe('runBeat：聚焦（对谁说）', () => {
  /** 记录每个人物拿到的现场切片；返回一句非空 outward，好让 claim 真的进裁判。 */
  const recording = (slices: { id: string; sceneText: string }[]) => ({
    think: (req: { character: { id: string }; sceneText: string }) => {
      slices.push({ id: req.character.id, sceneText: req.sceneText })
      return Promise.resolve({ output: { inner: '看着', outward: '点了下头' }, experience: [] })
    },
  })

  /** 把裁判收集到的 claim id 记下来：用来证明“谁被叫到”。 */
  function claimRecorder() {
    const judged: string[] = []
    const referee: Referee = {
      async judge({ claims }) {
        judged.push(...claims.map((c) => c.id))
        return {
          order: [],
          verdicts: claims.map((c) => ({ claimId: c.id, actor: c.actor, ok: true, deltas: [], duration: 1 })),
          observations: {},
          driveHits: [],
        }
      },
    }
    return { judged, referee }
  }

  it('目标在场时只叫玩家 + 目标：其余热人物这一拍不产生 claim', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我把银元塞进安手里'
    input.playerTo = 'ann'
    const { judged, referee } = claimRecorder()
    const slices: { id: string; sceneText: string }[] = []
    const r = await runBeat({
      ...input,
      deps: { ...input.deps, referee, cognition: recording(slices) },
    })

    // 安与医生都是 heat 0.8；聚焦时只叫安
    expect(slices.map((s) => s.id)).toEqual(['ann'])
    expect(judged).toEqual(['p0', 'ann0'])
    expect(r.committedClaims).toEqual(['p0', 'ann0'])
    expect(store.readJournal()).toHaveLength(1)
  })

  it('玩家 claim 带 to：journal 里存实体 id', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我把银元塞进安手里'
    input.playerTo = 'ann'
    await runBeat({ ...input, deps: { ...input.deps, referee: okJudge() } })

    const entry = store.readJournal()[0]
    expect(entry?.claims.find((c) => c.actor === 'player')).toMatchObject({ to: 'ann' })
    // 人物的 claim 不带 to：目标只属于玩家这次发言
    expect(entry?.claims.find((c) => c.actor === 'ann')).not.toHaveProperty('to')
  })

  it('被聚焦的人看到“对你说”，其他人仍是“提出”', async () => {
    const focused: { id: string; sceneText: string }[] = []
    const all: { id: string; sceneText: string }[] = []
    const input = base(tmpStore(), [])

    await runBeat({
      ...input,
      playerClaim: '我把银元塞进安手里',
      playerTo: 'ann',
      deps: { ...input.deps, referee: okJudge(), cognition: recording(focused) },
    })
    await runBeat({
      ...input,
      playerClaim: '我把银元塞进安手里',
      deps: { ...input.deps, referee: okJudge(), cognition: recording(all) },
    })

    expect(focused[0]?.sceneText).toContain('玩家这一拍对你说（尚未裁决）：我把银元塞进安手里')
    expect(focused[0]?.sceneText).not.toContain('玩家这一拍提出')
    expect(all.every((s) => s.sceneText.includes('玩家这一拍提出（尚未裁决）：我把银元塞进安手里'))).toBe(true)
    expect(all.some((s) => s.sceneText.includes('对你说'))).toBe(false)
  })

  it('目标不在场：按所有人结算并留 note，claim 不带 to', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我朝门口喊了一声'
    input.playerTo = 'ghost'
    const { judged, referee } = claimRecorder()
    const r = await runBeat({ ...input, deps: { ...input.deps, referee } })

    expect(judged).toEqual(['p0', 'ann0', 'doc0'])
    expect(r.notes.some((n) => n.includes('聚焦目标不在场') && n.includes('ghost'))).toBe(true)
    const entry = store.readJournal()[0]
    expect(entry?.claims.find((c) => c.actor === 'player')).not.toHaveProperty('to')
  })

  it('目标就是玩家自己：等于对所有人，claim 不带 to', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我自言自语'
    input.playerTo = 'player'
    const { judged, referee } = claimRecorder()
    await runBeat({ ...input, deps: { ...input.deps, referee } })

    expect(judged).toEqual(['p0', 'ann0', 'doc0'])
    expect(store.readJournal()[0]?.claims.find((c) => c.actor === 'player')).not.toHaveProperty('to')
  })

  it('不传 playerTo：调度与 claim 形状都不变', async () => {
    const store = tmpStore()
    const input = base(store, [])
    input.playerClaim = '我把银元放柜台上'
    const { judged, referee } = claimRecorder()
    const r = await runBeat({ ...input, deps: { ...input.deps, referee } })

    expect(judged).toEqual(['p0', 'ann0', 'doc0'])
    expect(store.readJournal()[0]?.claims.find((c) => c.actor === 'player')).not.toHaveProperty('to')
    expect(r.notes.some((n) => n.includes('聚焦'))).toBe(false)
  })
})
