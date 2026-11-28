import { describe, expect, it } from 'vitest'
import { canWriteSelf, recall, remember, score, selfInWindow, type Character, type Experience } from './character.ts'

function ch(experience: Experience[] = []): Character {
  return {
    id: 'ann',
    core: '作者写的 200 字',
    voice: '短句，少形容词',
    drives: [{ id: 'd1', text: '不想再欠人情', heat: 0.9 }],
    beliefs: { bob: '他撒过谎' },
    experience,
  }
}

describe('score：衰减与 self 加权', () => {
  it('符合 w × 0.5^((now−t)/48) + self 0.3', () => {
    expect(score({ t: 0, kind: 'seen', text: '', w: 1 }, 0)).toBe(1)
    expect(score({ t: 0, kind: 'seen', text: '', w: 2 }, 48)).toBe(1)
    expect(score({ t: 0, kind: 'seen', text: '', w: 3 }, 24)).toBeCloseTo(3 * 0.5 ** 0.5, 10)
    expect(score({ t: 0, kind: 'self', text: '', w: 1 }, 48)).toBeCloseTo(0.8, 10)
    expect(score({ t: 10, kind: 'self', text: '', w: 3 }, 58)).toBeCloseTo(1.8, 10)
  })

  it('self 在任何时刻都比同 w 同 t 的 seen 高 0.3', () => {
    const seen = score({ t: 20, kind: 'seen', text: '', w: 2 }, 100)
    const self = score({ t: 20, kind: 'self', text: '', w: 2 }, 100)
    expect(self - seen).toBeCloseTo(0.3, 10)
  })
})

describe('recall：排序、limit、截断', () => {
  const a: Experience = { t: 0, kind: 'seen', text: 'a:w2@t0=1.0', w: 2 }
  const b: Experience = { t: 48, kind: 'seen', text: 'b:w1@t48=1.0', w: 1 }
  const c: Experience = { t: 0, kind: 'self', text: 'c:w1@t0=0.8', w: 1 }
  const d: Experience = { t: 0, kind: 'seen', text: 'd:w1@t0=0.5', w: 1 }

  it('同分时 t 大的在前，其余按分数降序', () => {
    expect(recall(ch([a, b, c, d]), 48).map((e) => e.text)).toEqual([b.text, a.text, c.text, d.text])
  })

  it('超过 limit 被截断，默认 12', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ t: 0, kind: 'seen' as const, text: `e${i}`, w: 1 as const }))
    expect(recall(ch(many), 0)).toHaveLength(12)
    expect(recall(ch([a, b, c, d]), 48, 2).map((e) => e.text)).toEqual([b.text, a.text])
  })
})

describe('remember：只追加，不改入参', () => {
  it('返回新对象，core/voice 保持原值', () => {
    const original = ch([{ t: 0, kind: 'seen', text: '旧事', w: 1 }])
    const snapshot = structuredClone(original)
    const next = remember(original, { t: 5, kind: 'self', text: '我不再指望他替我说话', w: 3 })

    expect(original).toEqual(snapshot)
    expect(next).not.toBe(original)
    expect(next.experience).not.toBe(original.experience)
    expect(next.experience.map((e) => e.text)).toEqual(['旧事', '我不再指望他替我说话'])
    expect(next.core).toBe(snapshot.core)
    expect(next.voice).toBe(snapshot.voice)
  })
})

describe('selfInWindow：稀缺窗口按拍号', () => {
  const self = (ref?: number): Experience => ({ t: 0, kind: 'self', text: 'x', w: 3, ...(ref === undefined ? {} : { ref }) })

  it('只数窗口内的条目；窗口外与没有拍号的旧条目都不算', () => {
    const ann = ch([self(3), self(9), self(12), self()])
    expect(selfInWindow(ann, 12)).toBe(3)
    expect(selfInWindow(ann, 20)).toBe(1)
    expect(selfInWindow(ch([self()]), 20)).toBe(0)
  })
})

describe('canWriteSelf：成长闸', () => {
  it('未签名或最近 10 拍已有 self 都拒绝', () => {
    expect(canWriteSelf({ signed: false, recentSelf: 0 })).toBe(false)
    expect(canWriteSelf({ signed: true, recentSelf: 1 })).toBe(false)
    expect(canWriteSelf({ signed: true, recentSelf: 0 })).toBe(true)
  })
})
