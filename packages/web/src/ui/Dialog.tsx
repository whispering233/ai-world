import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button.tsx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 抽屉要贴边贴高，所以面板样式由调用方给 */
  panelClassName?: string
}

/** 模态就是 `<dialog showModal>`：外部 inert、Esc 关闭、top layer 都不用自己实现。 */
export function Dialog({ open, onClose, title, children, panelClassName = '' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`m-auto hidden flex-col rounded-sm border border-rule bg-paper p-0 text-ink open:flex backdrop:bg-ink/25 ${panelClassName}`}
    >
      <header className="flex items-center justify-between border-b border-rule px-4 py-2">
        <h2 className="text-title">{title}</h2>
        <Button variant="quiet" aria-label="关闭" onClick={onClose}>
          ×
        </Button>
      </header>
      {children}
    </dialog>
  )
}
