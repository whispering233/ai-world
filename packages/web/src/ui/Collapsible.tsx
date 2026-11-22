import type { ReactNode } from 'react'

export interface CollapsibleProps {
  summary: ReactNode
  children: ReactNode
  open?: boolean
  className?: string
}

/** 折叠就是 `<details>`：键盘可达、无需状态。 */
export function Collapsible({ summary, children, open, className = '' }: CollapsibleProps) {
  return (
    <details className={`group ${className}`} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-meta text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="group-open:hidden">
          ▸
        </span>
        <span aria-hidden="true" className="hidden group-open:inline">
          ▾
        </span>
        {summary}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}
