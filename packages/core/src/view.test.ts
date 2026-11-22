import { describe, expect, it } from 'vitest'
import type { Character } from './character.ts'
import { fmt } from './clock.ts'
import type { JournalEntry, PassageEntry } from './store.ts'
import type { World } from './world.ts'
import type { ContentStatusView, HealthView, TelemetryView, UsageView } from '@ai-world/shared'
import { authorView, beatViews, playerView, type AuthorViewInput, type PlayerViewInput } from './view.ts'

/* ── fixture：2 个人物 + 3 条 journal + 3 条 passage ──── */

// W6-1 之后 PassageEntry 带可选 beatSeq，行动作卡里还没有
type JoinedPassage = PassageEntry & { beatSeq?: number }
type Entry = JournalEntry & { telemetry?: TelemetryView }

const WORLD: World = {
  ledger: {
    clock: 700,
    at: { ann: 'saloon', doc: 'saloon', guest: 'saloon' },
    holds: { guest: { 'silver-dollar': 2, whiskey: 0 } },
    phys: {},
    rel: { ann: { guest: 1 } },
    // f-gone 不在 facts 里：旧日志引用了已不存在的事实
    knows: { guest: ['f-late', 'f-gone', 'f-early'] },
  },
  facts: {
    'f-late': { id: 'f-late', text: '安说过账本锁在柜台下面。', at: 660, actor: 'ann', kind: 'speech' },
    'f-early': { id: 'f-early', text: '科迪欠安两枚银元。', at: 620, supersededBy: 'f-late' },
  },
  places: { saloon: '酒馆' },
  ambient: { weather: 'storm' },
}

const NAMES = { guest: '你', ann: '安', doc: '道森医生' }
const ITEMS = { 'silver-dollar': '银元' }

const JOURNAL: Entry[] = [
  {
    seq: 1,
    type: 'beat',
    scene: '酒馆夜谈',
    clock: 600,
    claims: [
      { id: 'c1', actor: 'guest', text: '我推门进去。', kind: 'say' },
      { id: 'c2', actor: 'ann', text: '安把杯子收走。', kind: 'act' },
    ],
    order: ['guest', 'ann'],
    verdicts: [
      {
        claimId: 'c1',
        actor: 'guest',
        ok: true,
        deltas: [{ op: 'move', who: 'guest', to: 'saloon' }],
        duration: 3,
      },
    ],
    observations: { ann: { claimIds: ['c1'], summary: '安看见生面孔进门。' } },
    driveHits: [{ ent: 'ann', driveId: 'keep-saloon', delta: 0.1 }],
    experience: { ann: [{ t: 603, kind: 'seen', text: '生面孔进门。', w: 2 }] },
    telemetry: {
      models: { cognition: 'm', referee: 'stub-referee', narration: 'n' },
      usage: {
        cognition: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 10, retries: 0, calls: 2 },
        referee: { input: 3, output: 4, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 20, retries: 0, calls: 1 },
        narration: { input: 5, output: 6, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 30, retries: 0, calls: 1 },
      },
    },
  },
  {
    seq: 2,
    type: 'beat',
    scene: '酒馆夜谈',
    clock: 660,
    // 本拍没有玩家主张
    claims: [{ id: 'c3', actor: 'ann', text: '安没抬头。', kind: 'say' }],
    order: ['ann'],
    verdicts: [{ claimId: 'c3', actor: 'ann', ok: false, reason: '没有听众', deltas: [], duration: 0 }],
    observations: {},
    driveHits: [],
  },
  {
    seq: 3,
    type: 'beat',
    scene: '酒馆夜谈',
    clock: 700,
    claims: [{ id: 'c4', actor: 'guest', text: '我坐下。', kind: 'act' }],
    order: ['guest'],
    verdicts: [{ claimId: 'c4', actor: 'guest', ok: true, deltas: [], duration: 40 }],
    observations: {},
    driveHits: [],
  },
]

const PASSAGES: JoinedPassage[] = [
  { seq: 1, clock: 600, text: '雨顺着门缝往里渗。', source: 'narrator', beatSeq: 1 },
  // 旧日志：没有 beatSeq，只能按 clock 回退
  { seq: 2, clock: 660, text: '（旁白没写出来，这是事实摘要。）', source: 'fallback' },
  // 属于更晚的拍：指针不该把它借给第 3 拍
  { seq: 3, clock: 900, text: '后半夜的事。', source: 'narrator' },
]

const CHARACTERS = new Map<string, Character>([
  [
    'ann',
    {
      id: 'ann',
      core: '安十七岁跟着父亲往西走。',
      voice: '短句，报账式的平声。',
      drives: [{ id: 'keep-saloon', text: '撑过下一年', heat: 0.8 }],
      beliefs: { doc: '他手里那点药比枪值钱' },
      experience: [{ t: 603, kind: 'seen', text: '生面孔进门。', w: 2 }],
      busyUntil: 640,
    },
  ],
  [
    'doc',
    {
      id: 'doc',
      core: '道森医生没能念完医学院。',
      voice: '慢，半句话。',
      drives: [],
      beliefs: {},
      experience: [],
      busyUntil: 0,
    },
  ],
])

const USAGE: UsageView = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 0, retries: 0, calls: 0 }

const HEALTH: HealthView = {
  beats: 3,
  folds: 0,
  claims: { say: 2, act: 2 },
  noRate: 0.25,
  silentBeats: 1,
  factsPerBeat: 0.7,
  knowRate: 0.5,
  writeOps: { move: 1 },
  durationBuckets: { '0-3': 1, '4-30': 1, '31-239': 1, '240+': 0 },
  degraded: 1,
}

const CONTENT: ContentStatusView = { path: 'content/starter-town.json', activeHash: 'aaa', diskHash: 'bbb', changed: true }

const PLAYER_INPUT: PlayerViewInput = {
  title: '雨夜酒馆',
  player: 'guest',
  people: new Set(['ann', 'doc']),
  world: WORLD,
  names: NAMES,
  items: ITEMS,
  journal: JOURNAL,
  passages: PASSAGES,
  inFlight: false,
}

const AUTHOR_INPUT: AuthorViewInput = {
  title: '雨夜酒馆',
  world: WORLD,
  characters: CHARACTERS,
  names: NAMES,
  journal: JOURNAL,
  passages: PASSAGES,
  content: CONTENT,
  usage: { cognition: USAGE, referee: USAGE, narration: USAGE },
  health: HEALTH,
  prompts: [{ seq: 3, calls: [{ role: 'referee', text: '{"verdicts":[]}', ms: 12, retries: 0, messages: [] }] }],
}

/* ── 玩家投影 ─────────────────────────────────────────── */

describe('playerView', () => {
  it('place / here / holds / knows 全是显示名', () => {
    const view = playerView(PLAYER_INPUT)
    expect(view.title).toBe('雨夜酒馆')
    expect(view.clock).toBe(700)
    expect(view.clockText).toBe(fmt(700))
    expect(view.inFlight).toBe(false)
    expect(view.state.place).toBe('酒馆')
    expect(view.state.here).toEqual(['安', '道森医生'])
    // 数量为 0 的条目不算持有
    expect(view.state.holds).toEqual([{ name: '银元', count: 2 }])
  })

  it('knows 按 at 升序、被推翻的打标、查不到的 id 跳过', () => {
    expect(playerView(PLAYER_INPUT).state.knows).toEqual([
      { text: '科迪欠安两枚银元。', clockText: fmt(620), superseded: true },
      { text: '安说过账本锁在柜台下面。', clockText: fmt(660), superseded: false },
    ])
  })

  it('玩家不在 ledger.at 里时 place 与 here 为空，不抛错', () => {
    const world: World = { ...WORLD, ledger: { ...WORLD.ledger, at: { ann: 'saloon' } } }
    expect(playerView({ ...PLAYER_INPUT, world }).state).toMatchObject({ place: '', here: [] })
  })

  it('beat 与 passage 按 beatSeq 连接，缺 beatSeq 时按 clock 回退，缺 passage 时字段缺省', () => {
    const beats = playerView(PLAYER_INPUT).beats
    expect(beats.map((b) => b.seq)).toEqual([1, 2, 3])
    expect(beats[0]).toEqual({
      seq: 1,
      clock: 600,
      clockText: fmt(600),
      player: '我推门进去。',
      passage: '雨顺着门缝往里渗。',
      fallback: false,
    })
    // 无 beatSeq → 按 clock 命中，且 source 为 fallback
    expect(beats[1]).toEqual({
      seq: 2,
      clock: 660,
      clockText: fmt(660),
      passage: '（旁白没写出来，这是事实摘要。）',
      fallback: true,
    })
    expect(beats[1]).not.toHaveProperty('player')
    // 第 3 条 passage 属于更晚的拍，不借给本拍
    expect(beats[2]).toEqual({ seq: 3, clock: 700, clockText: fmt(700), player: '我坐下。', fallback: false })
    expect(beats[2]).not.toHaveProperty('passage')
  })

  it('journal 乱序时 beat 仍按 seq 升序', () => {
    const beats = beatViews({ journal: [...JOURNAL].reverse(), passages: PASSAGES, player: 'guest' })
    expect(beats.map((b) => b.seq)).toEqual([1, 2, 3])
  })
})

const FORBIDDEN = [
  'claim',
  'claims',
  'verdict',
  'verdicts',
  'delta',
  'deltas',
  'heat',
  'rel',
  'drives',
  'beliefs',
  'core',
  'token',
  'tokens',
  'cost',
  'no_rate',
  'notes',
  'telemetry',
  'observation',
  'observations',
  'experience',
]

function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out)
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key)
      collectKeys(inner, out)
    }
  }
  return out
}

describe('玩家投影的纪律断言', () => {
  it('递归键集合里没有引擎词', () => {
    const keys = collectKeys(playerView(PLAYER_INPUT))
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((key) => FORBIDDEN.includes(key))).toEqual([])
  })

  it('序列化后不出现任何实体 id 或物品 id', () => {
    const json = JSON.stringify(playerView(PLAYER_INPUT))
    for (const id of ['guest', 'ann', 'doc', 'saloon', 'silver-dollar', 'whiskey', 'f-late', 'f-early']) {
      expect(json).not.toContain(id)
    }
  })
})

/* ── 作者投影 ─────────────────────────────────────────── */

describe('authorView', () => {
  it('journal 逐条全量保留，telemetry 不丢', () => {
    const view = authorView(AUTHOR_INPUT)
    expect(view.journal).toHaveLength(JOURNAL.length)
    expect(view.journal).toEqual(JOURNAL)
    expect(view.journal[0]?.telemetry?.models.referee).toBe('stub-referee')
    expect(view.journal[0]?.verdicts[0]?.deltas).toEqual([{ op: 'move', who: 'guest', to: 'saloon' }])
    expect(view.journal[0]?.experience?.['ann']).toEqual([{ t: 603, kind: 'seen', text: '生面孔进门。', w: 2 }])
    expect(view.journal[1]?.verdicts[0]?.reason).toBe('没有听众')
  })

  it('world 原样映射，人物只给 experience 条数', () => {
    const view = authorView(AUTHOR_INPUT)
    expect(view.clock).toBe(700)
    expect(view.clockText).toBe(fmt(700))
    expect(view.world).toEqual(WORLD)
    expect(view.characters.map((c) => c.id)).toEqual(['ann', 'doc'])
    expect(view.characters[0]).toMatchObject({ name: '安', core: CHARACTERS.get('ann')?.core, experienceCount: 1 })
    expect(view.characters[0]).not.toHaveProperty('experience')
  })

  it('content / usage / health / prompts 透传', () => {
    const view = authorView(AUTHOR_INPUT)
    expect(view.content).toEqual(CONTENT)
    expect(view.health).toEqual(HEALTH)
    expect(view.prompts).toEqual(AUTHOR_INPUT.prompts)
    expect(view.usage.referee).toEqual(USAGE)
  })
})
