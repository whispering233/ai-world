import type { WorldView } from '@ai-world/shared'

export interface LedgerViewProps {
  world: WorldView
}

/**
 * 账本原始快照：**不做显示名替换**，作者要看到账本里到底存了什么 id。
 * 六张表一次给全，逐个键手写渲染只会多一份要维护的投影。
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
    <pre className="overflow-x-auto whitespace-pre-wrap break-all text-meta text-ink-soft">
      {JSON.stringify(raw, null, 2)}
    </pre>
  )
}
