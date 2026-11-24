// @vitest-environment jsdom
/**
 * 等待中的形态：只表达“这一拍在生成”，不出现任何阶段名（`ui/DESIGN.md` §4）。
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