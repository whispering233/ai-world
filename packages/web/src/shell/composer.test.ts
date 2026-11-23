// @vitest-environment jsdom
/**
 * 输入区的键盘契约。`Sender` 自己实现 Enter / Shift+Enter / 组字判断，这几条**只能在事件层真跑一遍**：
 * 读源码看不出装上之后还成不成立，而错了的后果是半句话被发出去。
 *
 * jsdom 只需两个 stub（`matchMedia` / `ResizeObserver`，见 `theme/jsdom-probe.test.ts`）；
 * 这里不断言样式，只断言「按了什么键、`onSend` 有没有被叫」。
 */
import { fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

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

async function mount(options: { draft: string; inFlight?: boolean }) {
  const { Composer } = await import('./Composer.tsx')
  const onSend = vi.fn()
  const onStop = vi.fn()
  const { container, unmount } = render(
    createElement(Composer, {
      draft: options.draft,
      onDraftChange: () => {},
      onSend,
      onStop,
      inFlight: options.inFlight ?? false,
      elapsedMs: 0,
    }),
  )
  const textarea = container.querySelector('textarea')
  if (textarea === null) throw new Error('Sender 没有渲染出 textarea')
  return { textarea, onSend, onStop, unmount }
}

describe('Composer 的键盘契约', () => {
  it('Enter 发送', async () => {
    const { textarea, onSend, unmount } = await mount({ draft: '我推门进去。' })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('Shift+Enter 不发送', async () => {
    const { textarea, onSend, unmount } = await mount({ draft: '我推门进去。' })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    unmount()
  })

  it('输入法组字中的 Enter 不发送，组字结束后恢复', async () => {
    const { textarea, onSend, unmount } = await mount({ draft: 'wo men' })
    fireEvent.compositionStart(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.compositionEnd(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('空白内容不发送', async () => {
    const { textarea, onSend, unmount } = await mount({ draft: '   ' })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    unmount()
  })

  it('等待中不重复发送（Enter 与发送按钮都拦住）', async () => {
    const { textarea, onSend, unmount } = await mount({ draft: '我推门进去。', inFlight: true })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    const sendButton = textarea.closest('.ant-sender')?.querySelector<HTMLButtonElement>('button[type="button"]')
    if (sendButton !== null && sendButton !== undefined) fireEvent.click(sendButton)
    expect(onSend).not.toHaveBeenCalled()
    unmount()
  })

  it('等待中点停止：Sender 的 loading 按钮接到 onStop', async () => {
    const { textarea, onStop, unmount } = await mount({ draft: '我推门进去。', inFlight: true })
    const buttons = Array.from(textarea.closest('.ant-sender')?.querySelectorAll('button') ?? [])
    const stopButton = buttons[buttons.length - 1]
    expect(stopButton).toBeDefined()
    fireEvent.click(stopButton!)
    expect(onStop).toHaveBeenCalledTimes(1)
    unmount()
  })
})
