import { Prompts, Sender } from '@ant-design/x'
import { Button } from 'antd'
import type { PlayerStateView } from '@ai-world/shared'
import { READING_COLUMN } from './column.ts'

export interface ComposerProps {
  draft: string
  onDraftChange: (draft: string) => void
  onSend: () => void
  onStop: () => void
  /** 等待 = 一条普通输入，不改 API（决策 #49） */
  onWait: () => void
  inFlight: boolean
  /** 账本已落定、旁白还没成型：等待文案换一段 */
  settled?: boolean
  elapsedMs: number
  /** 同一份玩家投影：地点与持有，不显示 id / heat / rel（ui/DESIGN §3） */
  state?: PlayerStateView
  /** 最近一拍生成的动作提示（≤3 条）：点选只填入输入框，不发送（ui/DESIGN §3） */
  hints?: string[]
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
export function Composer({ draft, onDraftChange, onSend, onStop, onWait, inFlight, settled, elapsedMs, state, hints }: ComposerProps) {
  const holds = state?.holds.map((item) => `${item.name}×${item.count}`).join('、') ?? ''
  return (
    <div className="shrink-0 border-t border-rule bg-paper">
      <div className={`${READING_COLUMN} py-3`}>
        {/* 选项只填不送：自由输入永远是主入口；等待中不给选项（同一时刻只处理一条输入） */}
        {!inFlight && hints !== undefined && hints.length > 0 && (
          <div className="mb-2">
            <Prompts
              items={hints.map((hint) => ({ key: hint, label: hint }))}
              vertical={false}
              wrap
              onItemClick={({ data }) => onDraftChange(data.key)}
            />
          </div>
        )}
        {state !== undefined && (
          <p className="mb-2 text-meta text-ink-soft">
            {state.place} · 你身上：{holds === '' ? '空手' : holds}
          </p>
        )}
        <Sender
          value={draft}
          onChange={(value) => onDraftChange(value)}
          onSubmit={(value) => {
            if (inFlight || value.trim() === '') return
            onSend()
          }}
          onCancel={onStop}
          loading={inFlight}
          placeholder="说点什么，或做什么…"
          autoSize={{ minRows: 2, maxRows: 6 }}
          aria-label="你说或做什么"
        />
        <div className="mt-2 flex items-center justify-between text-meta text-ink-soft">
          <span>
            {inFlight ? (
              <>
                {settled === true ? '这一拍已经定了，正在落笔…' : '世界在回应…'} {mmss(elapsedMs)}
                <span aria-hidden="true" className="blink">
                  ▍
                </span>
              </>
            ) : (
              'Enter 发送 · Shift+Enter 换行'
            )}
          </span>
          {/* 等待中不提供：同一时刻只允许一条在途输入 */}
          {!inFlight && (
            <Button size="small" type="text" onClick={onWait}>
              等一会儿
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
