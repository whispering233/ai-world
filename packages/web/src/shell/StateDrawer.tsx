import { useEffect, useState } from 'react'
import type { PlayerStateView } from '@ai-world/shared'
import { Drawer, Table, Timeline } from 'antd'

export interface StateDrawerProps {
  open: boolean
  onClose: () => void
  state: PlayerStateView | null
}

/**
 * 两档阈值由 `ui/DESIGN.md` §7 反推：文字右缘 = (视口 + 列宽) / 2 − 24，
 * 抽屉起点必须不小于它。1312 是全 40rem 列的最低门槛；1200 是 36rem 列取整后的门槛。
 */
const WIDE = '(min-width: 1312px)'
const MEDIUM = '(min-width: 1200px)'

type DrawerSize = 360 | 320 | '100%'

function readSize(): DrawerSize {
  if (window.matchMedia(WIDE).matches) return 360
  if (window.matchMedia(MEDIUM).matches) return 320
  return '100%'
}

/** 两档共用一次 effect：任一阈值跨过就重算，不出现两个各自 useState 的旧值。 */
function useDrawerSize(): DrawerSize {
  const [size, setSize] = useState<DrawerSize>(readSize)
  useEffect(() => {
    const queries = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)]
    const onChange = (): void => setSize(readSize())
    for (const query of queries) query.addEventListener('change', onChange)
    return () => {
      for (const query of queries) query.removeEventListener('change', onChange)
    }
  }, [])
  return size
}

/**
 * 「此刻」：只放玩家能验证的四件事，v1 只读。
 * 宽屏覆盖式 360 / 320，不挤压正文；窄屏撑满。滚动锁与焦点管理由 `Drawer` 自己做。
 */
export function StateDrawer({ open, onClose, state }: StateDrawerProps) {
  const size = useDrawerSize()
  return (
    <Drawer open={open} onClose={onClose} title="此刻" placement="right" size={size}>
      {state === null ? (
        <p className="meta-line">还没有读到世界的状态。</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h3 className="mb-2 meta-line">你在哪</h3>
            <p>{state.place}</p>
          </section>
          <section>
            <h3 className="mb-2 meta-line">谁在这里</h3>
            <p>{state.here.length === 0 ? '没有人' : state.here.join('、')}</p>
          </section>
          <section>
            <h3 className="mb-2 meta-line">你身上有什么</h3>
            {state.holds.length === 0 ? (
              <p>空手。</p>
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey="name"
                dataSource={state.holds}
                columns={[
                  { key: 'name', title: '物品', dataIndex: 'name' },
                  { key: 'count', title: '数量', dataIndex: 'count', align: 'right', width: 64 },
                ]}
              />
            )}
          </section>
          <section>
            <h3 className="mb-2 meta-line">你知道什么</h3>
            {state.knows.length === 0 ? (
              <p>还什么都不知道。</p>
            ) : (
              <Timeline
                items={state.knows.map((fact) => ({
                  key: `${fact.clockText}·${fact.text}`,
                  color: fact.superseded ? 'gray' : 'blue',
                  title: <span className="meta-line">{fact.clockText}</span>,
                  content: <span className={fact.superseded ? 'line-through' : ''}>{fact.text}</span>,
                }))}
              />
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}
