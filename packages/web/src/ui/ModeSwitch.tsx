import { Button } from './Button.tsx'

export type ShellMode = 'player' | 'author'

const LABEL: Record<ShellMode, string> = { player: '阅读面', author: '作者视图' }

export interface ModeSwitchProps {
  mode: ShellMode
  onModeChange: (mode: ShellMode) => void
}

/** 两个外壳共用同一份流与状态，切换只换皮。 */
export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <fieldset className="flex gap-1 border-0 p-0">
      <legend className="sr-only">视图</legend>
      {(Object.keys(LABEL) as ShellMode[]).map((option) => (
        <Button
          key={option}
          variant="quiet"
          aria-pressed={mode === option}
          className={mode === option ? 'text-ink underline underline-offset-4' : ''}
          onClick={() => onModeChange(option)}
        >
          {LABEL[option]}
        </Button>
      ))}
    </fieldset>
  )
}
