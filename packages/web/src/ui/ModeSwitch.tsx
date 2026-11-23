import { Segmented } from 'antd'

export type ShellMode = 'player' | 'author'

const OPTIONS: { label: string; value: ShellMode }[] = [
  { label: '阅读面', value: 'player' },
  { label: '作者视图', value: 'author' },
]

export interface ModeSwitchProps {
  mode: ShellMode
  onModeChange: (mode: ShellMode) => void
}

/** 两个外壳共用同一份流与状态，切换只换皮；选中态与键盘切换由 `Segmented` 自己管。 */
export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <Segmented<ShellMode>
      aria-label="视图"
      size="small"
      value={mode}
      options={OPTIONS}
      onChange={onModeChange}
    />
  )
}
