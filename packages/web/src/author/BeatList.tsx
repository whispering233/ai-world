import { Conversations } from '@ant-design/x'
import type { ConversationItemType } from '@ant-design/x'
import type { BeatView } from '@ai-world/shared'

export interface BeatListProps {
  beats: BeatView[]
  selected: number | null
  onSelect: (seq: number) => void
}

/**
 * 一拍一行：时刻 + 玩家原话首句。点一行只换右侧详情，不动中间的阅读流。
 *
 * 编号用**拍序**（1 起），不用 journal 的 `seq`：折场也占一条 journal，直接显示 seq 会出现
 * “20 拍却编到 #22、中间缺 #19”这种跳号。分组用 `clockText`，长局里至少能按时间折叠着找。
 */
export function BeatList({ beats, selected, onSelect }: BeatListProps) {
  if (beats.length === 0) return <p className="p-4 meta-line">还没有拍。</p>

  // 新的在上；倒序后第 i 项的拍序是 length - i
  const items: ConversationItemType[] = [...beats].reverse().map((beat, index) => ({
    key: String(beat.seq),
    group: beat.clockText,
    label: (
      <div className="flex flex-col gap-1">
        <span className="truncate">{summaryOf(beat)}</span>
        <span className="meta-line">第 {beats.length - index} 拍</span>
      </div>
    ),
  }))

  return (
    <Conversations
      items={items}
      groupable
      activeKey={selected === null ? undefined : String(selected)}
      onActiveChange={(key) => onSelect(Number(key))}
      className="bg-transparent"
    />
  )
}

/** 首句摘要：读到第一个句末标点为止；本拍没有玩家发言时退到旁白。 */
function summaryOf(beat: BeatView): string {
  const text = beat.player ?? beat.passage ?? '（没有玩家发言）'
  const end = text.search(/[。！？!?\n]/)
  return end === -1 ? text : text.slice(0, end + 1)
}