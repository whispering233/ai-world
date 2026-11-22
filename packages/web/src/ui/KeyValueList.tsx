import type { ReactNode } from 'react'

export interface KeyValueItem {
  label: string
  value: ReactNode
}

export interface KeyValueListProps {
  items: KeyValueItem[]
  className?: string
}

export function KeyValueList({ items, className = '' }: KeyValueListProps) {
  return (
    <dl className={`grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-meta text-ink-soft">{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
