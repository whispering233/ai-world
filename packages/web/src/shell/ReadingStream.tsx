import { useEffect, useRef } from 'react'
import type { BeatView } from '@ai-world/shared'
import { BeatDivider } from './BeatDivider.tsx'
import { EmptyState } from './EmptyState.tsx'
import { ErrorNotice } from './ErrorNotice.tsx'
import { PlayerLine } from './PlayerLine.tsx'
import { READING_COLUMN } from './column.ts'

const SCROLL_KEY = 'ai-world.scroll'

export interface ReadingStreamProps {
  beats: BeatView[]
  pendingText: string | null
}

/** 一拍一拍往下长；只有用户贴底时才跟随滚动。 */
export function ReadingStream({ beats, pendingText }: ReadingStreamProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const restored = useRef(false)

  // 续跑后回到上次读到的位置；没有记录就落在最新一拍
  useEffect(() => {
    const element = scroller.current
    if (element === null || restored.current || beats.length === 0) return
    restored.current = true
    const saved = Number(localStorage.getItem(SCROLL_KEY))
    if (saved > 0) {
      element.scrollTop = saved
      follow.current = false
    } else {
      element.scrollTop = element.scrollHeight
    }
  }, [beats.length])

  // 贴底才跟随；新一轮发送强制回底
  useEffect(() => {
    if (!restored.current) return
    if (pendingText !== null) follow.current = true
    const element = scroller.current
    if (element !== null && follow.current) element.scrollTop = element.scrollHeight
  }, [beats.length, pendingText])

  function handleScroll() {
    const element = scroller.current
    if (element === null) return
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32
    localStorage.setItem(SCROLL_KEY, String(Math.round(element.scrollTop)))
  }

  return (
    <div ref={scroller} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div aria-live="polite" className={`${READING_COLUMN} py-8`}>
        {beats.length === 0 && pendingText === null && <EmptyState />}
        {beats.map((beat, index) => {
          const previous = beats[index - 1]
          return (
            <article key={beat.seq} className="fade-in mb-8">
              {(previous === undefined || previous.clockText !== beat.clockText) && (
                <BeatDivider clockText={beat.clockText} />
              )}
              {beat.player !== undefined && <PlayerLine text={beat.player} />}
              {beat.passage !== undefined && (
                <p className="mt-4 whitespace-pre-wrap text-prose leading-prose text-ink">{beat.passage}</p>
              )}
              {beat.fallback && <ErrorNotice kind="fallback" />}
              {beat.passage === undefined && <ErrorNotice kind="missing" />}
            </article>
          )
        })}
        {pendingText !== null && (
          <article className="mb-8">
            <PlayerLine text={pendingText} />
          </article>
        )}
      </div>
    </div>
  )
}
