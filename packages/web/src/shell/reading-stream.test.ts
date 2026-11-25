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
