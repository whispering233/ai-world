import { Prompts, Sender } from '@ant-design/x'
import { Button, Tag } from 'antd'
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { PlayerStateView } from '@ai-world/shared'
import { READING_COLUMN } from './column.ts'

/** 「等一会儿」发的是这一句普通输入；服务端照常结算，不改 API（决策 #49） */
export const WAIT_TEXT = '我等着，看看他们怎么说。'

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
  /** “对谁说”的当前目标（显示名）；`null` = 没有点名的人 */
  target?: string | null
  /** 自动：按正文唯一人名推断目标（C11 的默认态） */
  auto?: boolean
  /** 玩家显式点的「所有人」：广播，不推断 */
  explicitAll?: boolean
  /** 选择只改目标，不发送（ui/DESIGN §3） */
  onTargetChange?: (target: string | null) => void
  onAuto?: () => void
  onAll?: () => void
  /** 最近一拍生成的动作提示（≤3 条）：点选只填入输入框，不发送（ui/DESIGN §3） */
  hints?: string[]
}

/** 目标单选组的一项：`自动` / `所有人` / 一位在场者的显示名 */
interface TargetOption {
  /** React key：显示名不保证唯一（重名时服务端会让聚焦失败），所以不拿 label 当 key */
  key: string
  label: string
  checked: boolean
  select: () => void
}

/**
 * 目标单选组（ui/DESIGN §3 / §8）：整组只占一个 Tab 停靠点，←/→ 移动并同时选中。
 * 不用 `Tag` 的 checkable（勾选）变体：它硬编码 `role="checkbox"` 与 `tabIndex=0`，覆写不掉，
 * 整组于是变成每颗 chip 一个停靠点、方向键全无效。这里外层 `span` 管语义与焦点，`Tag` 只管外观。
 */
function TargetGroup({ options }: { options: TargetOption[] }) {
  const nodes = useRef<Array<HTMLSpanElement | null>>([])
  const checkedIndex = options.findIndex((option) => option.checked)
  /** roving tabindex：停靠点跟着选中项；一项都没选中（点名的目标已不在场）时落在第一项 */
  const rovingIndex = checkedIndex === -1 ? 0 : checkedIndex

  function selectAt(index: number) {
    options[index]?.select()
    // 指针和焦点要一起走：原生 radio 移动焦点即选中，这里补上被移动后的焦点
    nodes.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1
    if (last < 0) return
    const focusedIndex = nodes.current.findIndex((node) => node === document.activeElement)
    const from = focusedIndex === -1 ? rovingIndex : focusedIndex
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        selectAt(from === 0 ? last : from - 1)
        return
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        selectAt(from === last ? 0 : from + 1)
        return
      case 'Home':
        event.preventDefault()
        selectAt(0)
        return
      case 'End':
        event.preventDefault()
        selectAt(last)
        return
      case ' ':
      case 'Enter':
        event.preventDefault()
        selectAt(from)
        return
      default:
        return
    }
  }

  return (
    // 整组只有一个 onKeyDown：事件从焦点项冒泡到这里，按键一次只走一条路
    <div role="radiogroup" aria-label="对谁说" className="flex flex-wrap items-center gap-1" onKeyDown={handleKeyDown}>
      {options.map((option, index) => (
        <span
          key={option.key}
          ref={(node) => {
            nodes.current[index] = node
          }}
          role="radio"
          aria-checked={option.checked}
          tabIndex={index === rovingIndex ? 0 : -1}
          onClick={option.select}
          className="chip rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {/* Tag 只留字号与内边距：底色/边框归 `chip` 管，而 `aria-checked` 在外层 span 上 */}
          <Tag className="border-0 bg-transparent text-inherit">{option.label}</Tag>
        </span>
      ))}
    </div>
  )
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
export function Composer({ draft, onDraftChange, onSend, onStop, onWait, inFlight, settled, elapsedMs, state, target, auto, explicitAll, onTargetChange, onAuto, onAll, hints }: ComposerProps) {
  const holds = state?.holds.map((item) => `${item.name}×${item.count}`).join('、') ?? ''
  // 「自动」与「所有人」是两个不同的意图：前者让服务端按正文推断，后者不推断（C11）
  const targetOptions: TargetOption[] = [
    { key: 'auto', label: '自动', checked: auto === true, select: () => onAuto?.() },
    { key: 'all', label: '所有人', checked: explicitAll === true, select: () => onAll?.() },
    ...(state?.here ?? []).map((name, index) => ({
      key: `${name}-${index}`,
      label: name,
      checked: target === name,
      select: () => onTargetChange?.(name),
    })),
  ]
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 meta-line">
            <span>
              {state.place} · 你身上：{holds === '' ? '空手' : holds}
            </span>
            {/* 目标 chips：只改状态，不发送；目标只影响发送时（所以等待中也不锁） */}
            <TargetGroup options={targetOptions} />
          </div>
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
        <div className="mt-2 flex items-center justify-between meta-line">
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
            // 它是一条会发出去的输入：体积按次要按钮给，把真正发送的那句话放进 title / aria-label
            <Button size="small" title={WAIT_TEXT} aria-label={WAIT_TEXT} onClick={onWait}>
              等一会儿
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
