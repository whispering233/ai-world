// @vitest-environment jsdom
/**
 * 作者壳的地点与显示名表单：只能改显示值，保存仍是**整份** pack。
 * 这里盯的是"改一处会不会带走别处"——`world.ambient`、`world.ledger`、`aliases` 与作者壳还不认识的
 * 顶层字段必须原样回到提交的 JSON 里，否则点一次保存就静默删掉半个内容包。
 *
 * API 全 mock，只断言提交的 body；不写盘、不碰 `content/`。
 * jsdom 需要 `matchMedia` / `ResizeObserver` 两个 stub（antd 的输入件在挂载时会问一次）。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentEditor } from './ContentEditor.tsx'

const api = vi.hoisted(() => ({
  fetchAuthorContent: vi.fn(),
  saveContent: vi.fn(),
}))

vi.mock('../api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.ts')>()
  return { ...actual, fetchAuthorContent: api.fetchAuthorContent, saveContent: api.saveContent }
})

/** 真实内容包的形状再加大括号：`futureNote` 是作者壳还没声明、保存时必须带回去的字段。 */
const pack = {
  title: '雨夜酒馆',
  opening: '雨从屋檐上垂下来，把街灯压成一团黄。',
  scene: '雨夜的酒馆，湿气沉在桌面上。',
  world: {
    ledger: {
      clock: 48,
      at: { player: 'saloon', ann: 'saloon', counter: 'saloon' },
      holds: { counter: { whiskey: 3, cup: 2 } },
      phys: { door: { locked: true } },
      rel: { ann: { player: 1 } },
      knows: { ann: ['f1'] },
    },
    facts: { f1: { id: 'f1', text: '门闩着。', at: 0 } },
    places: { saloon: '酒馆', street: '街道' },
    ambient: { weather: 'storm', night: true },
  },
  characters: [
    {
      id: 'ann',
      core: '她擦杯子，不抬头。',
      voice: '短句，不解释。',
      drives: [{ id: 'tend-bar', text: '把杯子收走。', heat: 0.4 }],
      beliefs: { 'b1': '柜台是她的地盘。' },
    },
  ],
  canon: ['雨一直下。'],
  player: 'player',
  names: { player: '你', ann: '安', counter: '柜台' },
  items: { whiskey: '威士忌', cup: '杯子' },
  aliases: { player: ['旅人'] },
  futureNote: { keep: ['这个字段作者壳不认识'] },
}

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

beforeEach(() => {
  api.fetchAuthorContent.mockReset()
  api.saveContent.mockReset()
  api.fetchAuthorContent.mockResolvedValue({ text: JSON.stringify(pack, null, 2), activeHash: 'h1', diskHash: 'h1' })
  api.saveContent.mockResolvedValue({ saved: true, activeHash: 'h1', diskHash: 'h2' })
})

describe('ContentEditor 的地点与显示名', () => {
  it('改一处 place 与一个 name 后保存：新值进 body，未知字段与 id 原样', async () => {
    const onSaved = vi.fn()
    // 没有 `globals: true`，RTL 不会自动卸挂——手动 `unmount()`，否则上一条的 DOM 会漏到下一条（见 composer.test.ts）
    const { unmount } = render(createElement(ContentEditor, { onSaved }))

    const place = await screen.findByLabelText('地点 saloon 的显示名')
    fireEvent.change(place, { target: { value: '雨夜酒馆' } })
    fireEvent.change(screen.getByLabelText('实体 ann 的显示名'), { target: { value: '安妮' } })
    // antd 会给两个汉字的按钮文案插一个空格（“保 存”），只能按宽松名字找
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => expect(api.saveContent).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledTimes(1)
    unmount()

    const [text] = api.saveContent.mock.calls[0]! as [string]
    const submitted = JSON.parse(text) as typeof pack

    expect(submitted.world.places).toEqual({ saloon: '雨夜酒馆', street: '街道' })
    expect(submitted.names).toEqual({ player: '你', ann: '安妮', counter: '柜台' })

    // 未知字段：world 里没声明的键、顶层没声明的键都得原样回来
    expect(submitted.world.ambient).toEqual(pack.world.ambient)
    expect(submitted.world.ledger).toEqual(pack.world.ledger)
    expect(submitted.world.facts).toEqual(pack.world.facts)
    expect(submitted.aliases).toEqual(pack.aliases)
    expect(submitted.items).toEqual(pack.items)
    expect(submitted.futureNote).toEqual(pack.futureNote)

    // 没有改 id：报错路径靠这层保证不了，只能靠键集合不变
    expect(Object.keys(submitted.world.places)).toEqual(Object.keys(pack.world.places))
    expect(Object.keys(submitted.names)).toEqual(Object.keys(pack.names))

    // 其余表单字段也照旧在 body 里
    expect(submitted.title).toBe(pack.title)
    expect(submitted.canon).toEqual(pack.canon)
    expect(submitted.characters).toEqual(pack.characters)
  }, 30_000)

  it('只读 JSON 预览仍在：places/names 不是唯一入口，但完整内容还看得见', async () => {
    const { unmount } = render(createElement(ContentEditor, { onSaved: () => {} }))

    await screen.findByLabelText('地点 street 的显示名')
    expect(screen.getByText('世界结构（只读）')).toBeDefined()
    expect(screen.getByText('places')).toBeDefined()
    expect(screen.getByText('names')).toBeDefined()
    unmount()
  }, 30_000)
})