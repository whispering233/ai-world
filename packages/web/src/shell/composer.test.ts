// @vitest-environment jsdom
/**
 * 输入区的键盘契约。`Sender` 自己实现 Enter / Shift+Enter / 组字判断，这几条**只能在事件层真跑一遍**：
 * 读源码看不出装上之后还成不成立，而错了的后果是半句话被发出去。
 *
 * jsdom 只需两个 stub（`matchMedia` / `ResizeObserver`）；下面 `beforeAll` 里就是全部。
 * 这里不断言样式，只断言「按了什么键、`onSend` 有没有被叫」。
 */
import { fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlayerStateView } from '@ai-world/shared'

beforeAll(async () => {
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

  // 预热：@ant-design/x 的首次渲染带有一次性的样式注入（Sender 与选项区的 Prompts 都在这一下）。
  // 放进 hook 里，纯事件断言才不会把注入耗时算成自己的 15s 超时（满负载并行时这一下能超十秒）。
  const { Composer } = await import('./Composer.tsx')
  const warm = render(
    createElement(Composer, {
      draft: '',
      onDraftChange: () => {},
      onSend: () => {},
      onStop: () => {},
      onWait: () => {},
      inFlight: false,
      elapsedMs: 0,
      hints: ['预热'],
    }),
  )
  warm.unmount()
}, 60_000)

async function mount(options: {
  draft: string
  inFlight?: boolean
  settled?: boolean
  state?: PlayerStateView
  hints?: string[]
}) {
  const { Composer } = await import('./Composer.tsx')
  const onSend = vi.fn()
  const onStop = vi.fn()
  const onWait = vi.fn()
  const onDraftChange = vi.fn()
  const { container, unmount } = render(
    createElement(Composer, {
      draft: options.draft,
      onDraftChange,
      onSend,
      onStop,
      onWait,
      inFlight: options.inFlight ?? false,
      settled: options.settled ?? false,
      elapsedMs: 0,
      state: options.state,
      ...(options.hints === undefined ? {} : { hints: options.hints }),
    }),
  )
  const textarea = container.querySelector('textarea')
  if (textarea === null) throw new Error('Sender 没有渲染出 textarea')
  return { container, textarea, onSend, onStop, onWait, onDraftChange, unmount }
}

function waitButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '等一会儿')
}

// 慢的是 @ant-design/x 的样式注入（单跑约 4s），满负载并行时 5s 不够；断言本身是即时事件。
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

  // 两段等待文案只报可证状态（决策 #45）：不说“已记录/已落盘”
  it('等待中先说「世界在回应…」', async () => {
    const { container, unmount } = await mount({ draft: '我推门进去。', inFlight: true })
    expect(container.textContent).toContain('世界在回应…')
    expect(container.textContent).not.toContain('这一拍已经定了')
    expect(container.textContent).toContain('00:00')
    unmount()
  })

  it('账本落定后换成「这一拍已经定了，正在落笔…」', async () => {
    const { container, unmount } = await mount({ draft: '我推门进去。', inFlight: true, settled: true })
    expect(container.textContent).toContain('这一拍已经定了，正在落笔…')
    expect(container.textContent).not.toContain('世界在回应…')
    expect(container.textContent).toContain('00:00')
    expect(container.textContent).not.toContain('已记录')
    unmount()
  })
}, 15_000)

/** 玩家投影：状态行只取地点与持有（ui/DESIGN §3） */
const playerState: PlayerStateView = {
  place: '酒馆',
  here: ['安'],
  holds: [{ name: '银元', count: 2 }],
  knows: [],
}

describe('Composer 的状态行与「等一会儿」', () => {
  it('状态行用显示名拼出地点与持有，不出现 id 与引擎词', async () => {
    const { container, unmount } = await mount({ draft: '', state: playerState })
    const text = container.textContent ?? ''
    expect(text).toContain('酒馆 · 你身上：银元×2')
    for (const word of ['ann', 'silver-dollar', 'claim', 'verdict', 'settled', 'inFlight']) expect(text).not.toContain(word)
    unmount()
  })

  it('身上空着时写「空手」', async () => {
    const { container, unmount } = await mount({ draft: '', state: { ...playerState, holds: [] } })
    expect(container.textContent).toContain('酒馆 · 你身上：空手')
    unmount()
  })

  it('还没读到会话时不渲染状态行', async () => {
    const { container, unmount } = await mount({ draft: '' })
    expect(container.textContent).not.toContain('你身上：')
    unmount()
  })

  it('placeholder 是「说点什么，或做什么…」', async () => {
    const { textarea, unmount } = await mount({ draft: '' })
    expect(textarea.getAttribute('placeholder')).toBe('说点什么，或做什么…')
    unmount()
  })

  it('空闲时点「等一会儿」发一条等待', async () => {
    const { container, onWait, unmount } = await mount({ draft: '我还没打完', state: playerState })
    const button = waitButton(container)
    expect(button).toBeDefined()
    fireEvent.click(button!)
    expect(onWait).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('等待中不给「等一会儿」，也不重复发送', async () => {
    const { container, onWait, unmount } = await mount({ draft: '', inFlight: true })
    expect(waitButton(container)).toBeUndefined()
    expect(onWait).not.toHaveBeenCalled()
    unmount()
  })
}, 15_000)

/** 选项区：最近一拍的动作提示，点选只填不发（ui/DESIGN §3） */
describe('Composer 的选项区', () => {
  const hints = ['问安账本的事', '把杯子推回柜台', '看一眼地窖门']

  function itemOf(container: HTMLElement, hint: string): HTMLElement | undefined {
    return Array.from(container.querySelectorAll<HTMLElement>('.ant-prompts-item')).find(
      (item) => item.textContent === hint,
    )
  }

  it('有提示时把三条都渲染出来', async () => {
    const { container, unmount } = await mount({ draft: '', hints })
    for (const hint of hints) expect(itemOf(container, hint)).toBeDefined()
    unmount()
  })

  it('点选项只调用 onDraftChange，绝不直接发送', async () => {
    const { container, onDraftChange, onSend, unmount } = await mount({ draft: '', hints })
    const item = itemOf(container, '把杯子推回柜台')
    expect(item).toBeDefined()
    fireEvent.click(item!)
    expect(onDraftChange).toHaveBeenCalledWith('把杯子推回柜台')
    expect(onSend).not.toHaveBeenCalled()
    unmount()
  })

  it('等待中不渲染选项', async () => {
    const { container, unmount } = await mount({ draft: '', hints, inFlight: true })
    for (const hint of hints) expect(itemOf(container, hint)).toBeUndefined()
    unmount()
  })

  it('没有提示时不渲染空选项区', async () => {
    const { container, unmount } = await mount({ draft: '' })
    expect(container.querySelector('.ant-prompts')).toBeNull()
    unmount()
  })
}, 15_000)
