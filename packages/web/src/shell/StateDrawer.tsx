import { useEffect, useState } from 'react'
import type { PlayerStateView } from '@ai-world/shared'
import { Descriptions, Drawer, Table, Timeline } from 'antd'

export interface StateDrawerProps {
  open: boolean
  onClose: () => void
  state: PlayerStateView | null
}

/** 与 `ui/DESIGN.md` §7 的分界一致：窄于 1024 用全屏 sheet，再宽才是 360 覆盖式。 */
const WIDE = '(min-width: 1024px)'

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const query = window.matchMedia(WIDE)
    const onChange = (event: MediaQueryListEvent): void => setWide(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

/**
 * 「此刻」：只放玩家能验证的四件事，v1 只读。
 * 桌面端覆盖式 360px，不挤压正文；窄屏撑满。滚动锁与焦点管理由 `Drawer` 自己做。
 */
export function StateDrawer({ open, onClose, state }: StateDrawerProps) {
  const wide = useWide()
  return (
    <Drawer open={open} onClose={onClose} title="此刻" placement="right" size={wide ? 360 : '100%'}>
      {state === null ? (
        <p className="meta-line">还没有读到世界的状态。</p>
      ) : (
        <div className="flex flex-col gap-8">
          <Descriptions
            column={1}
            size="small"
            colon={false}
            items={[
              { key: 'place', label: '你在哪', children: state.place },
              { key: 'here', label: '谁在这里', children: state.here.length === 0 ? '没有人' : state.here.join('、') },
            ]}
          />
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