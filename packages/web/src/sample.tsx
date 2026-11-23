/**
 * B0 探针样张：三条「Tailwind 4 ↔ antd 6」层叠路线的同一份代码。
 *
 * 打开方式：`/sample.html?route=a|b|c`（默认 a），`&dark=1` 切深色，`&drawer=1` 开局就打开抽屉
 * （抽屉是 portal，不打开就没有根元素可量）。
 *
 * 三条路线一次只加载一份 CSS 入口：`@layer` 的层序由文档里**第一条**排层语句钉死，
 * 三份 CSS 同页共存会互相改写层序，「并存」只能是同一份代码换参数重载。
 *
 * 测量不靠肉眼：每个控件根元素挂工具类，下面另起一行放一个挂同样类的纯 `div` 对照组，
 * 挂载后用 `getComputedStyle` 逐项比对，结果直接渲染成表格。
 * 控件与对照组都待在**块级**容器里：并列 flex 会把双方一起压缩，宽度就不再是工具类说了算。
 */
import { Bubble, Sender } from '@ant-design/x'
import { Button, Drawer, Table } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AntdProvider } from './theme/AntdProvider.tsx'
import type { CascadeRoute } from './theme/AntdProvider.tsx'

interface RouteSpec {
  title: string
  detail: string
  loadCss: () => Promise<unknown>
}

const ROUTES: Record<CascadeRoute, RouteSpec> = {
  a: {
    title: '路线 a：官方 @layer 排层 + <StyleProvider layer>',
    detail:
      'route-a.css 先写 @layer theme, base, antd, components, utilities 再 @import "tailwindcss"；antd 运行时样式被 StyleProvider 包进 layer(antd)。注意 x 用的是自己的 @layer antdx，官方那份层序里没有它 → Sender 的宽度被压在 utilities 之后（见表）。',
    loadCss: () => import('./theme/route-a.css'),
  },
  b: {
    title: '路线 b：theme={{ zeroRuntime: true }} + 预编译 antd CSS 进 layer(antd)',
    detail:
      'route-b.css 用 @import "antd/dist/antd.css" layer(antd)；运行时不再注入 antd 样式（x 不发 CSS，Sender / Bubble 无样式）。',
    loadCss: () => import('./theme/route-b.css'),
  },
  c: {
    title: '路线 c：不排层 + 纪律守卫（ai-editor 现行）',
    detail:
      'antd 以无层 <style> 注入，无层规则压过 @layer 里的工具类；布局必须挂外层 div 或走 antd token。',
    loadCss: () => import('./theme/route-c.css'),
  },
}

const params = new URLSearchParams(window.location.search)
const rawRoute = params.get('route')
const route: CascadeRoute = rawRoute === 'b' || rawRoute === 'c' ? rawRoute : 'a'
const dark = params.get('dark') === '1'
const drawerInitiallyOpen = params.get('drawer') === '1'

const MEASURED_PROPERTIES = ['width', 'height', 'marginTop', 'marginBottom', 'marginLeft', 'maxWidth'] as const
type MeasuredProperty = (typeof MEASURED_PROPERTIES)[number]
type Reading = Record<MeasuredProperty, string>

/** 判定「工具类有没有生效」只看这几个属性：高度会被内容撑开，对照不上不代表工具类失效。 */
const JUDGED_PROPERTIES: readonly MeasuredProperty[] = ['width', 'marginTop', 'marginBottom', 'marginLeft', 'maxWidth']

interface ProbeSpec {
  key: string
  label: string
  /** 挂在 antd 组件根元素上的标记类：用来精确取到 antd 自己挂类的那个元素。 */
  marker: string
  /** 挂在这些根元素上的 Tailwind 工具类；对照组 div 挂同一串。 */
  utilities: string
}

const BUTTON_PROBE: ProbeSpec = { key: 'button', label: 'antd Button', marker: 'probe-button', utilities: 'w-20 mt-2 mb-4 h-10' }
const SENDER_PROBE: ProbeSpec = { key: 'sender', label: 'x Sender', marker: 'probe-sender', utilities: 'w-96 mt-2' }
const BUBBLE_START_PROBE: ProbeSpec = {
  key: 'bubble-start',
  label: 'x Bubble placement=start',
  marker: 'probe-bubble-start',
  utilities: 'w-60 mt-1',
}
const BUBBLE_END_PROBE: ProbeSpec = {
  key: 'bubble-end',
  label: 'x Bubble placement=end',
  marker: 'probe-bubble-end',
  utilities: 'w-60 mt-1',
}
const TABLE_PROBE: ProbeSpec = { key: 'table', label: 'antd Table', marker: 'probe-table', utilities: 'mt-4 max-w-md' }
const DRAWER_PROBE: ProbeSpec = {
  key: 'drawer',
  label: 'antd Drawer（点开后才测）',
  marker: 'probe-drawer',
  utilities: 'w-80 mt-2',
}

const PROBES: readonly ProbeSpec[] = [
  BUTTON_PROBE,
  SENDER_PROBE,
  BUBBLE_START_PROBE,
  BUBBLE_END_PROBE,
  TABLE_PROBE,
  DRAWER_PROBE,
]

function classesFor(probe: ProbeSpec): string {
  return `${probe.marker} ${probe.utilities}`
}

function readReading(element: Element): Reading {
  const style = window.getComputedStyle(element)
  return {
    width: style.width,
    height: style.height,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    marginLeft: style.marginLeft,
    maxWidth: style.maxWidth,
  }
}

function formatReading(reading: Reading): string {
  return MEASURED_PROPERTIES.map((property) => `${property}=${reading[property]}`).join(' · ')
}

interface ProbeReading {
  control: Reading
  /** `null` = 页面上找不到挂标记类（带工具类）的元素。 */
  target: Reading | null
}

/** 工具类被压掉的属性（控件的计算值与对照组不一致）。 */
function lostProperties(reading: ProbeReading): readonly MeasuredProperty[] {
  const { control, target } = reading
  if (target === null) return []
  return JUDGED_PROPERTIES.filter((property) => control[property] !== target[property])
}

function ControlDiv({ probe }: { probe: ProbeSpec }) {
  return (
    <div id={`control-${probe.key}`} className={`${probe.utilities} bg-slate-200 text-xs text-neutral-900`}>
      对照组 {probe.utilities}
    </div>
  )
}

const TABLE_CELL = 'border px-1 text-left'

function Sample() {
  const [text, setText] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(drawerInitiallyOpen)
  const [readings, setReadings] = useState<Record<string, ProbeReading>>({})

  const measureAll = useCallback(() => {
    const next: Record<string, ProbeReading> = {}
    for (const probe of PROBES) {
      const control = document.getElementById(`control-${probe.key}`)
      if (control === null) continue
      const target = document.querySelector(`.${probe.marker}`)
      next[probe.key] = { control: readReading(control), target: target === null ? null : readReading(target) }
    }
    setReadings(next)
  }, [])

  useEffect(() => {
    // 抽屉是 portal + 有进场动画：晚一点再量，否则量到动画中途的值。
    const timer = setTimeout(measureAll, 300)
    return () => clearTimeout(timer)
  }, [measureAll, drawerOpen])

  const routeSpec = ROUTES[route]
  const violations = PROBES.flatMap((probe) => {
    const reading = readings[probe.key]
    if (reading === undefined) return []
    const lost = lostProperties(reading)
    return lost.length === 0 ? [] : [{ probe, lost }]
  })

  return (
    <div className={`min-h-screen p-6 text-sm ${dark ? 'bg-neutral-900 text-neutral-100' : 'bg-white text-neutral-900'}`}>
      <h1 className="text-lg font-semibold">{routeSpec.title}</h1>
      <p className="mt-1 max-w-2xl text-neutral-500">{routeSpec.detail}</p>
      <p className="mt-2 flex gap-3">
        {(['a', 'b', 'c'] as const).map((candidate) => (
          <a
            key={candidate}
            href={`?route=${candidate}${dark ? '&dark=1' : ''}`}
            className={candidate === route ? 'font-semibold underline' : 'underline'}
          >
            route={candidate}
          </a>
        ))}
        <a href={`?route=${route}${dark ? '' : '&dark=1'}`} className="underline">
          {dark ? '切浅色' : '切深色'}
        </a>
      </p>

      <section className="mt-6">
        <h2 className="font-semibold">1. Button（w-20 mt-2 mb-4 h-10）</h2>
        <div className="mt-2">
          <Button className={classesFor(BUTTON_PROBE)}>确定</Button>
        </div>
        <ControlDiv probe={BUTTON_PROBE} />
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">2. Sender（w-96 mt-2）</h2>
        <div className="mt-2">
          <Sender
            className={classesFor(SENDER_PROBE)}
            value={text}
            onChange={(value) => setText(value)}
            placeholder="说点什么…"
            onSubmit={() => setText('')}
          />
        </div>
        <ControlDiv probe={SENDER_PROBE} />
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">3. Bubble ×2（无头像）+ 紧挨一段无气泡正文</h2>
        <div className="mt-2 max-w-2xl">
          <Bubble className={classesFor(BUBBLE_START_PROBE)} placement="start" content="我推门进去，找了个靠门的位子坐下。" />
          <Bubble className={classesFor(BUBBLE_END_PROBE)} placement="end" content="安没有抬头，先把杯子收走，才开口。" />
          <p className="mt-2">
            雨顺着门缝往里渗。安没有抬头，先把杯子收走，才开口。她的声音不高，尾音很短，像在报账。
          </p>
        </div>
        <ControlDiv probe={BUBBLE_START_PROBE} />
        <ControlDiv probe={BUBBLE_END_PROBE} />
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">4. Table（mt-4 max-w-md，3 行）</h2>
        <Table
          className={classesFor(TABLE_PROBE)}
          size="small"
          pagination={false}
          rowKey="key"
          dataSource={[
            { key: '1', place: '酒馆', detail: '靠门的位子' },
            { key: '2', place: '吧台', detail: '安在擦杯子' },
            { key: '3', place: '雨里', detail: '门缝渗水' },
          ]}
          columns={[
            { title: '地点', dataIndex: 'place' },
            { title: '细节', dataIndex: 'detail' },
          ]}
        />
        <div className="mt-3">
          <ControlDiv probe={TABLE_PROBE} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">5. Drawer（w-80 mt-2，点按钮打开后才测）</h2>
        <div className="mt-2">
          <Button onClick={() => setDrawerOpen(true)}>此刻</Button>
        </div>
        <ControlDiv probe={DRAWER_PROBE} />
        <Drawer
          className={classesFor(DRAWER_PROBE)}
          title="此刻"
          placement="right"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        >
          <p>你在哪：酒馆</p>
          <p>谁在这里：安</p>
          <p>你身上有什么：银元 × 1</p>
        </Drawer>
      </section>

      <section className="mt-8 max-w-3xl">
        <h2 className="font-semibold">测量（getComputedStyle）</h2>
        <p className="mt-1 text-neutral-500">
          判定只看 {JUDGED_PROPERTIES.join(' / ')}：与对照组的计算值不一致即「被压掉」。
        </p>
        <button type="button" onClick={measureAll} className="mt-2 border border-current px-2 py-1 text-xs">
          重新测量
        </button>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={TABLE_CELL}>控件</th>
              <th className={TABLE_CELL}>挂的类</th>
              <th className={TABLE_CELL}>对照组</th>
              <th className={TABLE_CELL}>控件根</th>
              <th className={TABLE_CELL}>判定</th>
            </tr>
          </thead>
          <tbody>
            {PROBES.map((probe) => {
              const reading = readings[probe.key]
              const lost = reading === undefined ? [] : lostProperties(reading)
              return (
                <tr key={probe.key}>
                  <td className={TABLE_CELL}>{probe.label}</td>
                  <td className={TABLE_CELL}>
                    <code>{probe.utilities}</code>
                  </td>
                  <td className={TABLE_CELL}>{reading === undefined ? '未测' : formatReading(reading.control)}</td>
                  <td className={TABLE_CELL}>
                    {reading === undefined
                      ? '未测'
                      : reading.target === null
                        ? '未找到根元素'
                        : formatReading(reading.target)}
                  </td>
                  <td className={TABLE_CELL}>
                    {reading === undefined || reading.target === null
                      ? '未测'
                      : lost.length === 0
                        ? '全生效'
                        : `被压掉：${lost.join(' / ')}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-6 max-w-3xl">
        <h2 className="font-semibold">纪律守卫（运行时）</h2>
        <p className="mt-1 text-neutral-500">
          规则同 ai-editor：antd 根元素上的布局类被压掉时，布局改挂外层 div 或走 antd token / props，不许用 <code>!</code> 前缀硬压。
        </p>
        {Object.keys(readings).length === 0 ? (
          <p className="mt-2">等待测量…</p>
        ) : violations.length === 0 ? (
          <p className="mt-2">通过：没有一个控件根元素上的工具类被压掉。</p>
        ) : (
          <ul className="mt-2">
            {violations.map(({ probe, lost }) => (
              <li key={probe.key}>
                违规：{probe.label} 的 <code>{probe.utilities}</code> 被压掉（{lost.join(' / ')}）→ 布局必须挂外层 div。
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root')

// 先把路线的 CSS 装进文档再渲染：层序与 antd 注入顺序都要在首帧之前定下来。
await ROUTES[route].loadCss()

createRoot(container).render(
  <AntdProvider route={route} dark={dark}>
    <Sample />
  </AntdProvider>,
)