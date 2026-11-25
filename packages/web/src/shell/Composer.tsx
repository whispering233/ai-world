import { Sender } from '@ant-design/x'
import { READING_COLUMN } from './column.ts'

export interface ComposerProps {
  draft: string
  onDraftChange: (draft: string) => void
  onSend: () => void
  onStop: () => void
  inFlight: boolean
  /** 账本已落定、旁白还没成型：等待文案换一段 */
  settled?: boolean
  elapsedMs: number
}

function mmss(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * 输入区的键盘契约由 `Sender` 自己实现：`submitType="enter"` 时 Enter 发送、Shift+Enter 换行，
 * 且组字期间（compositionstart→compositionend）不发送；`shell/composer.test.ts` 把这三件钉住。
 * 等待期只给 `loading`（发送按钮换成停止），不用 `disabled`——那会把输入框一起锁灰，
 * 而设计只要求「不许重复发送」；重复发送在 `onSubmit` 入口再拦一道。
 */
export function Composer({ draft, onDraftChange, onSend, onStop, inFlight, settled, elapsedMs }: ComposerProps) {
  return (
    <div className="shrink-0 border-t border-rule bg-paper">
      <div className={`${READING_COLUMN} py-3`}>
        <Sender
          value={draft}
          onChange={(value) => onDraftChange(value)}
          onSubmit={(value) => {
            if (inFlight || value.trim() === '') return
            onSend()
          }}
          onCancel={onStop}
          loading={inFlight}
          placeholder="说点什么…"
          autoSize={{ minRows: 2, maxRows: 6 }}
          aria-label="你说或做什么"
        />
        <p className="mt-2 text-meta text-ink-soft">
          {inFlight ? (
            <span>
              {settled === true ? '这一拍已经定了，正在落笔…' : '世界在回应…'} {mmss(elapsedMs)}
              <span aria-hidden="true" className="blink">
                ▍
              </span>
            </span>
          ) : (
            'Enter 发送 · Shift+Enter 换行'
          )}
        </p>
      </div>
    </div>
  )
}
