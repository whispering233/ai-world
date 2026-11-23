import type { WorldView } from '@ai-world/shared'

export interface LedgerViewProps {
  world: WorldView
}

/**
 * 账本原始快照：**不做显示名替换**，作者要看到账本里到底存了什么 id。
 * 六张表一次给全，逐个键手写渲染只会多一份要维护的投影；形状任意，所以保持 `JSON.stringify`。
 */
export function LedgerView({ world }: LedgerViewProps) {
  const { ledger, facts } = world
  const raw = {
    at: ledger.at,
    holds: ledger.holds,
    phys: ledger.phys,
    rel: ledger.rel,
    knows: ledger.knows,
    facts,
  }
  return (
    <div className="max-h-96 overflow-auto rounded-sm bg-paper-2 p-3">
      <pre className="whitespace-pre-wrap break-all text-meta text-ink-soft">{JSON.stringify(raw, null, 2)}</pre>
    </div>
  )
}
