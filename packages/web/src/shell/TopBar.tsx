import { useRef } from 'react'
import { Button } from '../ui/Button.tsx'

export interface TopBarProps {
  title: string
  clockText: string
  inFlight: boolean
  onOpenState: () => void
  onNewGame: () => void
  onAuthorView: () => void
  onAbout: () => void
}

/** 48px 细栏：只放全局信息，逐拍控制留在输入区。 */
export function TopBar({ title, clockText, inFlight, onOpenState, onNewGame, onAuthorView, onAbout }: TopBarProps) {
  const menu = useRef<HTMLDetailsElement>(null)
  const close = () => {
    if (menu.current !== null) menu.current.open = false
  }
  const choose = (action: () => void) => () => {
    close()
    action()
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-rule bg-paper px-4">
      <p className="truncate text-meta text-ink-soft">
        <span className="text-ink">{title}</span> · {clockText}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="quiet" onClick={onOpenState}>
          此刻
        </Button>
        <details ref={menu} className="group relative">
          <summary
            aria-label="更多"
            className="cursor-pointer list-none px-2 py-1 leading-none text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden"
          >
            ⋯
          </summary>
          {/* 打开时铺一层透明背景，点空白处收起 */}
          <div aria-hidden="true" onClick={close} className="fixed inset-0 hidden group-open:block" />
          <div className="absolute right-0 z-10 mt-1 hidden min-w-36 flex-col border border-rule bg-paper-2 py-1 group-open:flex">
            <Button variant="quiet" className="w-full text-left" disabled={inFlight} onClick={choose(onNewGame)}>
              新的一局
            </Button>
            <Button variant="quiet" className="w-full text-left" onClick={choose(onAuthorView)}>
              作者视图
            </Button>
            <Button variant="quiet" className="w-full text-left" onClick={choose(onAbout)}>
              关于
            </Button>
          </div>
        </details>
      </div>
    </header>
  )
}
