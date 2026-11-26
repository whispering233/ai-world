// @vitest-environment jsdom
/**
 * 等待中的形态与首屏：只表达“这一拍在生成”或“还没有拍”，不出现任何阶段名（`ui/DESIGN.md` §4）。
 *
 * 这里能断言的只有结构；骨架屏长什么样、动画在 `prefers-reduced-motion` 下是否停，
 * 都要真浏览器（jsdom 不算布局也不算层叠）。
 */
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { BeatView } from '@ai-world/shared'
import { ReadingStream } from './ReadingStream.tsx'

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const beat: BeatView = { seq: 1, clock: 3, clockText: '第 1 天 · 子夜', player: '我推门进去。', passage: '灯亮着。', fallback: false }

function mount(pendingText: string | null) {
  return render(createElement(ReadingStream, { beats: [beat], pendingText }))
}

describe('ReadingStream：等待中的骨架', () => {
  it('在途时出现骨架，并且对读屏器隐藏', () => {
    const { container, unmount } = mount('我又说了一句。')
    const skeleton = container.querySelector('.ant-skeleton')
    expect(skeleton).not.toBeNull()
    expect(skeleton?.closest('[aria-hidden="true"]')).not.toBeNull()
    // 玩家那句话照常先显示，不等服务端
    expect(container.textContent).toContain('我又说了一句。')
    unmount()
  })

  it('不在途时没有骨架，也没有空的占位块', () => {
    const { container, unmount } = mount(null)
    expect(container.querySelector('.ant-skeleton')).toBeNull()
    expect(container.textContent).toContain('灯亮着。')
    unmount()
  })
})

/** 场景卡素材：一段玩家投影，只用于没有 opening 且没有拍的场景。 */
const scene = {
  clockText: '第 1 天 · 夜',
  state: { place: '酒馆', here: ['安', '道森医生'], holds: [{ name: '银元', count: 2 }], knows: [] },
}

describe('ReadingStream：首屏', () => {
  it('有拍时 opening 仍在最上方，且排在叙述之前', () => {
    const { container, unmount } = render(
      createElement(ReadingStream, { beats: [beat], pendingText: null, opening: '雨把街灯打得只剩一团黄。', scene }),
    )
    const text = container.textContent ?? ''
    expect(text).toContain('雨把街灯打得只剩一团黄。')
    expect(text.indexOf('雨把街灯打得只剩一团黄。')).toBeLessThan(text.indexOf('灯亮着。'))
    unmount()
  })

  it('没有 opening 也没有拍时，场景卡用时间、地点、在场与持有拼出来', () => {
    const { container, unmount } = render(createElement(ReadingStream, { beats: [], pendingText: null, scene }))
    const text = container.textContent ?? ''
    expect(text).toContain('第 1 天 · 夜 · 酒馆')
    expect(text).toContain('在场：安、道森医生')
    expect(text).toContain('你身上：银元×2')
    // 卡片里不出现实体 id，也不出现引擎词
    for (const word of ['ann', 'doc', 'saloon', 'silver-dollar', 'claim', 'verdict']) expect(text).not.toContain(word)
    unmount()
  })

  it('有 opening 但没有拍时不显示场景卡，也不显示空状态文案', () => {
    const { container, unmount } = render(
      createElement(ReadingStream, { beats: [], pendingText: null, opening: '雨把街灯打得只剩一团黄。', scene }),
    )
    const text = container.textContent ?? ''
    expect(text).toContain('雨把街灯打得只剩一团黄。')
    expect(text).not.toContain('你身上：')
    unmount()
  })

  it('还没读到会话时不渲染场景卡', () => {
    const { container, unmount } = render(createElement(ReadingStream, { beats: [], pendingText: null }))
    expect((container.textContent ?? '').trim()).toBe('')
    unmount()
  })
})

/** 首屏示例：只在这一拍还没开始时出现；是样子，不是可点的选项（决策 #46）。
 * 与 `EmptyState.tsx` 同字面量：示例不得绑定某个世界的名字或物品。 */
const EXAMPLES = ['我先看看这地方。', '我跟身边的人搭句话。', '我往门口走。']

function expectsExamples(text: string): void {
  for (const example of EXAMPLES) expect(text).toContain(example)
}

describe('ReadingStream：首屏示例', () => {
  it('有 opening 时示例排在开篇之后', () => {
    const { container, unmount } = render(
      createElement(ReadingStream, { beats: [], pendingText: null, opening: '雨把街灯打得只剩一团黄。', scene }),
    )
    const text = container.textContent ?? ''
    expectsExamples(text)
    expect(text.indexOf('雨把街灯打得只剩一团黄。')).toBeLessThan(text.indexOf(EXAMPLES[0]!))
    unmount()
  })

  it('没有 opening 时示例在场景卡里', () => {
    const { container, unmount } = render(createElement(ReadingStream, { beats: [], pendingText: null, scene }))
    const text = container.textContent ?? ''
    expectsExamples(text)
    expect(text).toContain('说点什么，或做什么')
    expect(text).not.toContain('写一句你想说的话')
    const card = Array.from(container.querySelectorAll('div')).find((element) =>
      element.textContent?.startsWith('第 1 天 · 夜 · 酒馆'),
    )
    for (const example of EXAMPLES) expect(card?.textContent ?? '').toContain(example)
    unmount()
  })

  it('已经有拍之后不再显示示例', () => {
    const { container, unmount } = render(
      createElement(ReadingStream, { beats: [beat], pendingText: null, opening: '雨把街灯打得只剩一团黄。', scene }),
    )
    for (const example of EXAMPLES) expect(container.textContent ?? '').not.toContain(example)
    unmount()
  })

  it('在途时不显示示例（一句已经发出去）', () => {
    const { container, unmount } = render(
      createElement(ReadingStream, { beats: [], pendingText: '我又说了一句。', opening: '雨把街灯打得只剩一团黄。', scene }),
    )
    for (const example of EXAMPLES) expect(container.textContent ?? '').not.toContain(example)
    unmount()
  })
})

/** “对谁说”：只显示名，不显示实体 id（ui/DESIGN §3） */
describe('ReadingStream：目标前缀', () => {
  it('拍里带 playerTo 时，玩家行上方写「你（对安）」', () => {
    const withTarget: BeatView = { ...beat, playerTo: '安' }
    const { container, unmount } = render(createElement(ReadingStream, { beats: [withTarget], pendingText: null }))
    const text = container.textContent ?? ''
    expect(text).toContain('你（对安）')
    // 前缀在玩家那句之前，正文照常在后
    expect(text.indexOf('你（对安）')).toBeLessThan(text.indexOf('我推门进去。'))
    unmount()
  })

  it('无目标时不出现前缀，玩家那句照常显示', () => {
    const { container, unmount } = render(createElement(ReadingStream, { beats: [beat], pendingText: null }))
    const text = container.textContent ?? ''
    expect(text).toContain('我推门进去。')
    expect(text).not.toContain('（对')
    unmount()
  })

  it('等待中的那一拍也显示目标', () => {
    const { container, unmount } = render(
      createElement(ReadingStream, { beats: [beat], pendingText: '我又说了一句。', pendingTo: '道森医生' }),
    )
    const text = container.textContent ?? ''
    expect(text).toContain('你（对道森医生）')
    expect(text).toContain('我又说了一句。')
    unmount()
  })
})
