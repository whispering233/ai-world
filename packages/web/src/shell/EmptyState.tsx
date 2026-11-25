import type { PlayerStateView } from '@ai-world/shared'

export interface EmptyStateProps {
  clockText: string
  state: PlayerStateView
}

/** 首屏示例：说或做的样子，不是选项——点不了，也不能替玩家决定（决策 #46） */
const EXAMPLES = ['我把银元推过去。', '我问安账本的事。', '我走到门口听雨。']

/** 有 opening 时排在开篇之后，没有 opening 时排进场景卡 */
export function SayExamples() {
  return (
    <ul className="mt-2 space-y-1 text-meta text-ink-soft">
      {EXAMPLES.map((example) => (
        <li key={example}>比如：{example}</li>
      ))}
    </ul>
  )
}

/**
 * 没有开场散文时的场景卡：只有时间、地点、在场与身上有什么（ui/DESIGN §3）。
 * 不出现实体 id，也不出现引擎词——它替代的是一段正文，不是一份仪表盘。
 */
export function EmptyState({ clockText, state }: EmptyStateProps) {
  const holds = state.holds.map((item) => `${item.name}×${item.count}`).join('、')
  return (
    <div className="border border-rule p-5">
      <p className="text-title text-ink">
        {clockText} · {state.place}
      </p>
      <p className="mt-2 text-meta text-ink-soft">
        {state.here.length === 0 ? '这里只有你一个人。' : `在场：${state.here.join('、')}`}
      </p>
      <p className="mt-1 text-meta text-ink-soft">你身上：{holds === '' ? '空手' : holds}</p>
      <p className="mt-4 text-meta text-ink-soft">说点什么，或做什么</p>
      <SayExamples />
    </div>
  )
}
