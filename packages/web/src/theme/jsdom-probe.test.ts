// @vitest-environment jsdom
/**
 * B0 探针：antd 6 / @ant-design/x 的组件能不能在 jsdom 里渲染（能否进 CI 的前置问题）。
 *
 * 实测结论（本文件就是证据）：5 个组件只要 2 个 stub —— `window.matchMedia`
 * （antd Table 的 responsiveObserver 读断点）与 `ResizeObserver`（x Sender 的自动高度）。
 * 补上这两个之后 `Button` / `Table` / `Drawer(open)` / `Bubble` / `Sender` 全部渲染出根类。
 * 不 stub 时前两者的报错原文：`TypeError: window.matchMedia is not a function`、
 * `ReferenceError: ResizeObserver is not defined`。
 *
 * 这里只断言「渲染出来了」，不断言样式：jsdom 不算层叠，层叠路线只能在真浏览器里量（见 `sample.tsx`）。
 */
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

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

describe('antd 6 / x 在 jsdom 里渲染', () => {
  it('antd Button', async () => {
    const { Button } = await import('antd')
    const { container } = render(createElement(Button, null, '确定'))
    expect(container.querySelector('.ant-btn')).not.toBeNull()
  })

  it('antd Table', async () => {
    const { Table } = await import('antd')
    const { container } = render(
      createElement(Table, {
        rowKey: 'key',
        pagination: false,
        dataSource: [{ key: '1', place: '酒馆' }],
        columns: [{ title: '地点', dataIndex: 'place' }],
      }),
    )
    expect(container.querySelector('.ant-table')).not.toBeNull()
  })

  it('antd Drawer（open）', async () => {
    const { Drawer } = await import('antd')
    render(createElement(Drawer, { open: true, title: '此刻' }, createElement('p', null, '你在哪：酒馆')))
    expect(document.querySelector('.ant-drawer')).not.toBeNull()
  })

  it('x Bubble', async () => {
    const { Bubble } = await import('@ant-design/x')
    const { container } = render(createElement(Bubble, { content: '我推门进去。' }))
    expect(container.querySelector('.ant-bubble')).not.toBeNull()
  })

  it('x Sender', async () => {
    const { Sender } = await import('@ant-design/x')
    const { container } = render(createElement(Sender, { placeholder: '说点什么…' }))
    expect(container.querySelector('.ant-sender')).not.toBeNull()
  })
})