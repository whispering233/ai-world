import type { KeyboardEvent } from 'react'
import { Button } from '../ui/Button.tsx'
import { TextField } from '../ui/TextField.tsx'
import { READING_COLUMN } from './column.ts'

export interface ComposerProps {
  draft: string
  onDraftChange: (draft: string) => void
  onSend: () => void
  onStop: () => void
  inFlight: boolean
  elapsedMs: number
}

function mmss(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function Composer({ draft, onDraftChange, onSend, onStop, inFlight, elapsedMs }: ComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    // 组字中的 Enter 是输入法在选词，不是发送
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    onSend()
  }

  return (
    <div className="shrink-0 border-t border-rule bg-paper">
      <div className={`${READING_COLUMN} py-3`}>
        <TextField
          multiline
          rows={2}
          value={draft}
          onValueChange={onDraftChange}
          onKeyDown={handleKeyDown}
          disabled={inFlight}
          ariaLabel="你说或做什么"
          placeholder="说点什么…"
        />
        <div className="mt-2 flex items-center justify-between text-meta text-ink-soft">
          {inFlight ? (
            <span>
              世界在回应… {mmss(elapsedMs)}
              <span aria-hidden="true" className="blink">
                ▍
              </span>
            </span>
          ) : (
            <span>Enter 发送 · Shift+Enter 换行</span>
          )}
          {inFlight ? (
            <Button onClick={onStop}>停止</Button>
          ) : (
            <Button onClick={onSend} disabled={draft.trim() === ''}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
