import type { ReactNode } from 'react'
import { Button } from './Button.tsx'

export interface EditableListProps<T> {
  items: T[]
  onItemsChange: (items: T[]) => void
  /** 新条目的初始值 */
  newItem: () => T
  renderItem: (item: T, index: number) => ReactNode
  addLabel: string
  ariaLabel: string
}

/** 增删一行的通用列表编辑器；条目内部字段由调用方渲染。 */
export function EditableList<T>({
  items,
  onItemsChange,
  newItem,
  renderItem,
  addLabel,
  ariaLabel,
}: EditableListProps<T>) {
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2">
          <div className="flex-1">{renderItem(item, index)}</div>
          <Button
            variant="quiet"
            aria-label={`删除第 ${index + 1} 项`}
            onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
          >
            ×
          </Button>
        </li>
      ))}
      <li>
        <Button variant="quiet" onClick={() => onItemsChange([...items, newItem()])}>
          ＋ {addLabel}
        </Button>
      </li>
    </ul>
  )
}
