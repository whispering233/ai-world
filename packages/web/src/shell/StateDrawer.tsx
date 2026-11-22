import type { PlayerStateView } from '@ai-world/shared'
import { DataTable } from '../ui/DataTable.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { KeyValueList } from '../ui/KeyValueList.tsx'

export interface StateDrawerProps {
  open: boolean
  onClose: () => void
  state: PlayerStateView | null
}

/** 「此刻」：只放玩家能验证的四件事，v1 只读。 */
export function StateDrawer({ open, onClose, state }: StateDrawerProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="此刻"
      panelClassName="ml-auto mr-0 h-dvh max-h-none w-full max-w-none flex-col rounded-none border-y-0 border-r-0 border-l-rule p-0 sm:w-[360px]"
    >
      <div className="flex-1 overflow-y-auto p-6">
        {state === null ? (
          <p className="text-meta text-ink-soft">还没有读到世界的状态。</p>
        ) : (
          <div className="flex flex-col gap-8">
            <KeyValueList
              items={[
                { label: '你在哪', value: state.place },
                { label: '谁在这里', value: state.here.length === 0 ? '没有人' : state.here.join('、') },
              ]}
            />
            <section>
              <h3 className="mb-2 text-meta text-ink-soft">你身上有什么</h3>
              {state.holds.length === 0 ? (
                <p>空手。</p>
              ) : (
                <DataTable
                  columns={['物品', '数量']}
                  rows={state.holds.map((hold) => [hold.name, String(hold.count)])}
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
      </div>
    </Dialog>
  )
}
