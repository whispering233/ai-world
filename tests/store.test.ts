import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Claim, RefereeOutput } from '../src/core/referee.ts'
import { openStore, replay, type JournalEntry } from '../src/core/store.ts'
import type { World } from '../src/core/world.ts'

const dirs: string[] = []

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-store-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function world(): World {
  return {
    ledger: {
      clock: 10,
      at: { ann: 'saloon', bob: 'saloon' },
      holds: {},
      phys: {},
      rel: {},
      knows: {},
    },
    facts: {},
    places: { saloon: '酒馆', street: '街道' },
  }
}

function beat(clock: number, out: RefereeOutput, claims: Claim[] = []): Omit<JournalEntry, 'seq'> {
  return { type: 'beat', scene: 'saloon', clock, claims, ...out }
}

const move: RefereeOutput = {
  order: ['ann'],
  verdicts: [{ claimId: 'c1', actor: 'ann', ok: true, deltas: [{ op: 'move', who: 'ann', to: 'street' }], duration: 2 }],
  observations: {},
  driveHits: [],
}

const factAndKnow: RefereeOutput = {
  order: ['bob'],
  verdicts: [
    {
      claimId: 'c2',
      actor: 'bob',
      ok: true,
      deltas: [
        { op: 'fact', text: '酒馆起火了' },
        { op: 'know', who: ['bob'], fact: 'f0' },
      ],
      duration: 1,
    },
  ],
  observations: { bob: { claimIds: ['c2'], summary: '你看见火苗' } },
  driveHits: [{ ent: 'bob', driveId: 'survive', delta: 0.2 }],
}

describe('openStore：追加写入与重开', () => {
  it('2 条 beat + 1 条 passage 重开后原样返回，seq 连续', () => {
    const dir = tmp()
    const s = openStore(dir)
    const a = s.appendBeat(beat(11, move))
    const b = s.appendBeat(beat(12, factAndKnow))
    const p = s.appendPassage({ clock: 11, text: 'ann 推门出去', source: 'narrator' })

    const reopened = openStore(dir)
    expect(reopened.readJournal()).toEqual([a, b])
    expect(reopened.readJournal().map((e) => e.seq)).toEqual([1, 2])
    expect(reopened.readPassage()).toEqual([p])
    expect(reopened.readPassage().map((e) => e.seq)).toEqual([1])
    // 重开后 seq 接着往下走，不从头再来
    expect(reopened.appendBeat(beat(13, move)).seq).toBe(3)
    expect(reopened.appendPassage({ clock: 13, text: '街道', source: 'npc' }).seq).toBe(2)
  })
})

describe('readJournal：尾部撕裂', () => {
  it('半行垃圾被丢掉，不抛，且之后仍能继续追加', () => {
    const dir = tmp()
    const s = openStore(dir)
    s.appendBeat(beat(11, move))
    s.appendBeat(beat(12, factAndKnow))
    s.close()
    appendFileSync(join(dir, 'journal.jsonl'), '{"seq":3,"type":"be')

    const reopened = openStore(dir)
    expect(reopened.readJournal().map((e) => e.seq)).toEqual([1, 2])

    reopened.appendBeat(beat(13, move))
    expect(reopened.readJournal().map((e) => e.seq)).toEqual([1, 2, 3])
  })
})

const structuredFact: RefereeOutput = {
  order: ['bob'],
  verdicts: [
    {
      claimId: 'c3',
      actor: 'bob',
      ok: true,
      deltas: [{ op: 'fact', text: 'bob 把门锁了', actor: 'bob', kind: 'state' }],
      duration: 1,
    },
  ],
  observations: {},
  driveHits: [],
}

describe('replay：重放即真相', () => {
  it('按 seq 升序重放：clock 与 fact.at 都随记录恢复', () => {
    const dir = tmp()
    const s = openStore(dir)
    s.appendBeat(beat(11, move))
    s.appendBeat(beat(12, factAndKnow))
    s.close()

    const readBack = openStore(dir).readJournal()
    const played = replay(readBack, world())

    expect(played.ledger.clock).toBe(12)
    expect(played.ledger.at.ann).toBe('street')
    expect(played.ledger.knows.bob).toEqual(['f0'])
    // fact 记在它发生的时刻，不是初始时钟
    expect(played.facts.f0?.at).toBe(12)
    // 顺序由 seq 定，不由数组顺序定
    expect(replay([...readBack].reverse(), world())).toEqual(played)
  })

  it('结构化的 actor/kind 也随 journal 重放', () => {
    const dir = tmp()
    const s = openStore(dir)
    s.appendBeat(beat(11, structuredFact))
    s.close()

    const played = replay(openStore(dir).readJournal(), world())
    expect(played.facts.f0).toMatchObject({ text: 'bob 把门锁了', actor: 'bob', kind: 'state', at: 11 })
  })
})
