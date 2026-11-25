import { describe, expect, it } from 'vitest'
import { commit, createStubReferee, noRate, parseRefereeOutput, REFEREE_SYSTEM, refereePrompt, type Claim, type RefereeOutput } from './referee.ts'
import type { World } from './world.ts'

const claims: Claim[] = [
  { id: 'c1', actor: 'ann', text: '我一脚踹开铁门', kind: 'act' },
  { id: 'c2', actor: 'bob', text: '我抓住那把枪', kind: 'act' },
]

function world(): World {
  return {
    ledger: {
      clock: 10,
      at: { ann: 'saloon', bob: 'saloon' },
      holds: { ann: { gun: 1 }, bob: {} },
      phys: {},
      rel: {},
      knows: {},
    },
    facts: {},
    places: { saloon: '酒馆', street: '街道' },
  }
}

function output(verdicts: RefereeOutput['verdicts'], order: string[] = ['ann', 'bob']): RefereeOutput {
  return { order, verdicts, observations: {}, driveHits: [] }
}

describe('parseRefereeOutput：三种 verdict 形态', () => {
  it('ok 且有 deltas：发生并改变世界', () => {
    const raw = {
      order: ['ann'],
      verdicts: [{ claimId: 'c1', ok: true, deltas: [{ op: 'move', who: 'ann', to: 'street' }], duration: 2 }],
    }
    const { output: out } = parseRefereeOutput(raw, claims)
    const v = out.verdicts.find((x) => x.claimId === 'c1')
    expect(v?.ok).toBe(true)
    expect(v?.deltas).toHaveLength(1)
    expect(v?.duration).toBe(2)
  })

  it('ok 但 deltas 为空：话说了，账不动', () => {
    const raw = { verdicts: [{ claimId: 'c1', ok: true, deltas: [] }] }
    const { output: out } = parseRefereeOutput(raw, claims)
    expect(out.verdicts.find((v) => v.claimId === 'c1')?.ok).toBe(true)
    expect(out.verdicts.find((v) => v.claimId === 'c1')?.deltas).toEqual([])
  })

  it('no 且带 reason：不成立，reason 保留', () => {
    const nope = { verdicts: [{ claimId: 'c1', ok: false, reason: '门是铸铁焊死的', deltas: [{ op: 'move', who: 'ann', to: 'x' }] }] }
    const { output: out } = parseRefereeOutput(nope, claims)
    const v = out.verdicts.find((x) => x.claimId === 'c1')
    expect(v?.ok).toBe(false)
    expect(v?.reason).toBe('门是铸铁焊死的')
    expect(v?.deltas).toEqual([])
  })
})

describe('parseRefereeOutput：信封校验', () => {
  it('未知 claimId 丢弃，漏掉的 claim 按无事发生补齐', () => {
    const raw = { verdicts: [{ claimId: 'ghost', ok: true, deltas: [] }] }
    const { output: out, notes } = parseRefereeOutput(raw, claims)
    expect(out.verdicts.map((v) => v.claimId).sort()).toEqual(['c1', 'c2'])
    expect(notes.join(' ')).toContain('ghost')
    expect(notes.join(' ')).toContain('漏掉')
  })

  it('duration 缺省 1，越界被夹到 [0,1440]', () => {
    const raw = {
      verdicts: [
        { claimId: 'c1', ok: true, deltas: [] },
        { claimId: 'c2', ok: true, deltas: [], duration: 99999 },
      ],
    }
    const { output: out } = parseRefereeOutput(raw, claims)
    expect(out.verdicts.find((v) => v.claimId === 'c1')?.duration).toBe(1)
    expect(out.verdicts.find((v) => v.claimId === 'c2')?.duration).toBe(1440)
  })

  it('非对象输入不会抛异常', () => {
    expect(parseRefereeOutput('nope', claims).output.verdicts).toHaveLength(2)
  })
})

describe('REFEREE_SYSTEM：同一 phys 键的相反值', () => {
  it('写明只能留一条成立、另一条 ok:false，不靠落地顺序', () => {
    expect(REFEREE_SYSTEM).toContain('同一 phys 键')
    expect(REFEREE_SYSTEM).toContain('相反值')
    expect(REFEREE_SYSTEM).toContain('靠落地顺序')
  })
})

describe('refereePrompt：世界设定', () => {
  it('canon 渲染成世界设定块', () => {
    const prompt = refereePrompt({ clock: 10, claims, context: '现场', canon: ['这家酒馆欠着银行的债', '安不卖赊账'] })
    expect(prompt).toContain('世界设定：\n- 这家酒馆欠着银行的债\n- 安不卖赊账')
    expect(prompt).toContain('待裁决的主张：')
  })

  it('没有 canon 时不出世界设定块', () => {
    expect(refereePrompt({ clock: 10, claims, context: '现场' })).not.toContain('世界设定')
  })
})

describe('commit：写账本', () => {
  it('按 order 结算：先手先落地', () => {
    const out = output(
      [
        { claimId: 'c1', actor: 'ann', ok: true, deltas: [{ op: 'transfer', from: 'ann', to: 'bob', item: 'gun', n: 1 }], duration: 1 },
        { claimId: 'c2', actor: 'bob', ok: true, deltas: [{ op: 'rel', from: 'bob', to: 'ann', delta: -1 }], duration: 1 },
      ],
      ['bob', 'ann'],
    )
    const { world: w } = commit(world(), out)
    expect(w.ledger.holds.bob?.gun).toBe(1)
    expect(w.ledger.rel.bob?.ann).toBe(-1)
  })

  it('ok 为假的裁决一律不写入账本', () => {
    const out = output([
      { claimId: 'c1', actor: 'ann', ok: false, reason: '门是铸铁焊死的', deltas: [{ op: 'move', who: 'ann', to: 'street' }], duration: 1 },
    ])
    const { world: w, applied } = commit(world(), out)
    expect(w.ledger.at.ann).toBe('saloon')
    expect(applied).toHaveLength(0)
  })

  it('非法 op 被 apply 拒绝，不写半条状态', () => {
    const out = output([
      { claimId: 'c2', actor: 'bob', ok: true, deltas: [{ op: 'transfer', from: 'bob', to: 'ann', item: 'gun', n: 1 }], duration: 1 },
    ])
    const { world: w, applied } = commit(world(), out)
    expect(applied[0]?.results[0]?.ok).toBe(false)
    expect(w.ledger.holds.bob?.gun).toBeUndefined()
    expect(w.ledger.holds.ann?.gun).toBe(1)
  })
})

describe('统计与桩', () => {
  it('noRate = 拒绝数 / 总数', () => {
    expect(noRate([])).toBe(0)
    expect(noRate([{ claimId: 'a', actor: 'x', ok: true, deltas: [], duration: 1 }])).toBe(0)
    expect(
      noRate([
        { claimId: 'a', actor: 'x', ok: true, deltas: [], duration: 1 },
        { claimId: 'b', actor: 'x', ok: false, deltas: [], duration: 1 },
      ]),
    ).toBe(0.5)
  })

  it('stub 按顺序返回脚本，用完复用最后一条', async () => {
    const one = output([{ claimId: 'c1', actor: 'ann', ok: false, reason: '不', deltas: [], duration: 1 }])
    const referee = createStubReferee([one])
    const a = await referee.judge({ clock: 0, claims, context: '' })
    const b = await referee.judge({ clock: 0, claims, context: '' })
    expect(a.verdicts[0]?.ok).toBe(false)
    expect(b.verdicts[0]?.ok).toBe(false)
  })
})

describe('commit：一条裁决是一个事务', () => {
  it('任一条 op 不成立则整条裁决不写入（不能出现钱付了货没到）', () => {
    const out = output([
      {
        claimId: 'c1',
        actor: 'ann',
        ok: true,
        duration: 1,
        deltas: [
          { op: 'transfer', from: 'ann', to: 'bob', item: 'gun', n: 1 },
          { op: 'transfer', from: 'bob', to: 'ann', item: 'sword', n: 1 },
        ],
      },
    ])
    const { world: w, applied } = commit(world(), out)
    expect(applied[0]?.committed).toBe(false)
    expect(w.ledger.holds.ann?.gun).toBe(1)
    expect(w.ledger.holds.bob?.gun).toBeUndefined()
  })
})
