import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runBeat, type BeatInput } from '../src/core/beat.ts'
import { createStubCognition } from '../src/core/cognition.ts'
import type { Character } from '../src/core/character.ts'
import { createStubNarrator, type NarrationInput } from '../src/core/narrate.ts'
import { createStubReferee, type RefereeOutput } from '../src/core/referee.ts'
import { openScene } from '../src/core/scene.ts'
import { openStore, replay, type Store } from '../src/core/store.ts'
import type { EntId, World } from '../src/core/world.ts'

const dirs: string[] = []

function tmpStore(): Store {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-beat-'))
  dirs.push(dir)
  return openStore(dir)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
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

function base(store: Store, referee: RefereeOutput[]): BeatInput {
  return {
    world: world(),
    scene: openScene({ id: 's1', place: 'saloon', clock: 0, participants: ['player', 'ann', 'doc'] }),
    characters: characters(),
    player: 'player',
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
  it('每拍落一条 journal，时钟按最长动作推进', async () => {
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
    expect(journal.map((e) => e.clock)).toEqual([2, 3, 4])
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
        firstEventName = req.events[0]?.name ?? ''
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
