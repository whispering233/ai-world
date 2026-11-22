import type { BeatView } from '@ai-world/shared'

export interface BeatListProps {
  beats: BeatView[]
  selected: number | null
  onSelect: (seq: number) => void
}

/** 一拍一行：时刻 + 玩家原话首句。点一行只换右侧详情，不动中间的阅读流。 */
export function BeatList({ beats, selected, onSelect }: BeatListProps) {
  if (beats.length === 0) return <p className="p-4 text-meta text-ink-soft">还没有拍。</p>
  return (
    <ol className="flex flex-col">
      {[...beats].reverse().map((beat) => {
        const current = beat.seq === selected
        return (
          <li key={beat.seq}>
            <button
              type="button"
              onClick={() => onSelect(beat.seq)}
              aria-current={current ? 'true' : undefined}
              className={`flex w-full flex-col items-start gap-1 border-b border-rule px-3 py-2 text-left text-meta hover:bg-paper-2 ${
                current ? 'bg-paper-2' : ''
              }`}
            >
              <span className="text-ink-soft">
                #{beat.seq} {beat.clockText}
              </span>
              <span className="w-full truncate text-ink">{summaryOf(beat)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** 首句摘要：读到第一个句末标点为止；本拍没有玩家发言时退到旁白。 */
function summaryOf(beat: BeatView): string {
  const text = beat.player ?? beat.passage ?? '（没有玩家发言）'
  const end = text.search(/[。！？!?\n]/)
  return end === -1 ? text : text.slice(0, end + 1)
}
