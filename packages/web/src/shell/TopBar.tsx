import { MoreOutlined } from '@ant-design/icons'
import { Button, Divider, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import type { ShellMode } from '../ui/ModeSwitch.tsx'

export interface TopBarProps {
  title: string
  clockText: string
  inFlight: boolean
  mode: ShellMode
  onOpenState: () => void
  onNewGame: () => void
  onModeChange: (mode: ShellMode) => void
  onAbout: () => void
}

/** 48px 细栏：只放全局信息，逐拍控制留在输入区。 */
export function TopBar({ title, clockText, inFlight, mode, onOpenState, onNewGame, onModeChange, onAbout }: TopBarProps) {
  // 开新局会清空整局记录，结算中不给点
  const items: MenuProps['items'] = [
    { key: 'new-game', label: '新的一局', disabled: inFlight },
    { key: 'mode', label: mode === 'player' ? '作者视图' : '阅读面' },
    { type: 'divider' },
    { key: 'about', label: '关于' },
  ]

  function handleMenuClick({ key }: { key: string }) {
    if (key === 'new-game') onNewGame()
    if (key === 'mode') onModeChange(mode === 'player' ? 'author' : 'player')
    if (key === 'about') onAbout()
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-rule bg-paper px-4">
      <p className="truncate meta-line">
        <span className="text-ink">{title}</span> · {clockText}
      </p>
      <div className="flex items-center gap-1">
        <Button type="text" size="small" onClick={onOpenState}>
          此刻
        </Button>
        <Divider orientation="vertical" className="mx-1" />
        <Dropdown menu={{ items, onClick: handleMenuClick }} trigger={['click']} placement="bottomRight">
          <Button type="text" size="small" icon={<MoreOutlined />} aria-label="更多" />
        </Dropdown>
      </div>
    </header>
  )
}
