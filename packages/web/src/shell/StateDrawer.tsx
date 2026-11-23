import type { PlayerStateView } from '@ai-world/shared'
import { Descriptions, Drawer, Table } from 'antd'

export interface StateDrawerProps {
  open: boolean
  onClose: () => void
  state: PlayerStateView | null
}

/**
 * 「此刻」：只放玩家能验证的四件事，v1 只读。
 * 桌面端覆盖式 360px，不挤压正文；窄屏撑满。滚动锁与焦点管理由 `Drawer` 自己做。
 */
export function StateDrawer({ open, onClose, state }: StateDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="此刻" placement="right" size="min(360px, 100vw)">
      {state === null ? (
        <p className="text-meta text-ink-soft">还没有读到世界的状态。</p>
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
            <h3 className="mb-2 text-meta text-ink-soft">你身上有什么</h3>
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
            <h3 className="mb-2 text-meta text-ink-soft">你知道什么</h3>
            {state.knows.length === 0 ? (
              <p>还什么都不知道。</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {state.knows.map((fact) => (
                  <li key={`${fact.clockText}·${fact.text}`} className={fact.superseded ? 'text-ink-soft' : ''}>
                    <p className={fact.superseded ? 'line-through' : ''}>{fact.text}</p>
                    <p className="text-meta text-ink-soft">
                      {fact.clockText}
                      {fact.superseded && ' · 已被推翻'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}
