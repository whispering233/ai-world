import type { BeatView } from '@ai-world/shared'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'

export interface BeatListProps {
  beats: BeatView[]
  selected: number | null
  onSelect: (seq: number) => void
}

/** 一拍一行：时刻 + 玩家原话首句。点一行只换右侧详情，不动中间的阅读流。 */
export function BeatList({ beats, selected, onSelect }: BeatListProps) {
  if (beats.length === 0) return <p className="p-4 text-meta text-ink-soft">还没有拍。</p>
  // 新的在上；两行 label 自己排版，`Menu` 只负责选中态与上下键
  const items: MenuProps['items'] = [...beats].reverse().map((beat) => ({
    key: String(beat.seq),
    label: (
      <div className="flex flex-col gap-1 py-1">
        <span className="text-meta text-ink-soft">
          #{beat.seq} {beat.clockText}
        </span>
        <span className="truncate text-ink">{summaryOf(beat)}</span>
      </div>
    ),
  }))
  return (
    <Menu
      mode="inline"
      items={items}
      selectedKeys={selected === null ? [] : [String(selected)]}
      onClick={({ key }) => onSelect(Number(key))}
      classNames={{ item: 'h-auto' }}
      className="border-e-0 bg-transparent"
    />
  )
}

/** 首句摘要：读到第一个句末标点为止；本拍没有玩家发言时退到旁白。 */
function summaryOf(beat: BeatView): string {
  const text = beat.player ?? beat.passage ?? '（没有玩家发言）'
  const end = text.search(/[。！？!?\n]/)
  return end === -1 ? text : text.slice(0, end + 1)
}
