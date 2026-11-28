import { ArrowDownOutlined } from '@ant-design/icons'
import { Button, Skeleton } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { BeatView, PlayerStateView } from '@ai-world/shared'
import { BeatDivider } from './BeatDivider.tsx'
import { EmptyState, SayExamples } from './EmptyState.tsx'
import { ErrorNotice } from './ErrorNotice.tsx'
import { PlayerLine } from './PlayerLine.tsx'
import { READING_COLUMN } from './column.ts'

const SCROLL_KEY = 'ai-world.scroll'
/** 离底多少像素内算“贴着底读”，与 `scrollTop` 的取整误差留余量 */
const STICK_PX = 32

export interface ReadingStreamProps {
  beats: BeatView[]
  pendingText: string | null
  /** 在途那一拍选定的目标显示名：已经发出、还没收到 passage 时也要显示 */
  pendingTo?: string
  /** 首屏散文：作者写了就一直在最上方，不随拍增长 */
  opening?: string
  /** 场景卡素材：没有 opening 且还没有拍时用它；缺省表示还没读到会话 */
  scene?: { clockText: string; state: PlayerStateView }
}

/** 段落按空行拆开：`whitespace-pre-wrap` 下一整块里的空行只有行高那么高，段落分不清（需要「段间距 > 行距」）。 */
function prose(text: string) {
  return text.split(/\n{2,}/).map((paragraph, index) => (
    <p key={index} className="whitespace-pre-wrap text-prose leading-prose text-ink">
      {paragraph}
    </p>
  ))
}

/**
 * 一拍一拍往下长；只有用户贴底时才跟随。
 *
 * 贴底与“回到最新”是两件事：读者上滚看旧文时不抢滚动位置，但新拍到达要有个能点的去处，
 * 否则只能靠猜“上面是不是又多了一段”。
 */
export function ReadingStream({ beats, pendingText, pendingTo, opening, scene }: ReadingStreamProps) {
  const hasOpening = opening !== undefined && opening.trim() !== ''
  /** 首屏：还没有拍、也没有在途输入。示例只在这一刻出现，且不绑某个世界（`AGENTS.md`） */
  const idle = beats.length === 0 && pendingText === null
  const scroller = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const restored = useRef(false)
  const previous = useRef(beats.length)
  const [unread, setUnread] = useState(0)

  // 续跑后回到上次读到的位置；没有记录就落在**最后一拍的开头**，而不是末尾的半句话
  useEffect(() => {
    const element = scroller.current
    if (element === null || restored.current || beats.length === 0) return
    restored.current = true
    const saved = Number(localStorage.getItem(SCROLL_KEY))
    if (saved > 0) {
      element.scrollTop = saved
      follow.current = false
      return
    }
    const articles = element.querySelectorAll('article')
    const last = articles[articles.length - 1]
    if (last) element.scrollTop += last.getBoundingClientRect().top - element.getBoundingClientRect().top - 16
  }, [beats.length])

  // 贴底才跟随；新一轮发送强制回底；上滚时有新拍到达就记一笔待读
  useEffect(() => {
    // 首屏加载（0 → n）不是“新拍”：那是这一局已经发生过的内容
    const grew = previous.current > 0 && beats.length > previous.current
    previous.current = beats.length
    if (!restored.current) return
    if (pendingText !== null) {
      follow.current = true
      setUnread(0)
    }
    const element = scroller.current
    if (element !== null && follow.current) {
      element.scrollTop = element.scrollHeight
      return
    }
    if (grew) setUnread((count) => count + 1)
  }, [beats.length, pendingText])

  function handleScroll() {
    const element = scroller.current
    if (element === null) return
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_PX
    localStorage.setItem(SCROLL_KEY, String(Math.round(element.scrollTop)))
    if (follow.current) setUnread(0)
  }

  function jumpToLatest() {
    const element = scroller.current
    if (element === null) return
    follow.current = true
    setUnread(0)
    element.scrollTop = element.scrollHeight
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div ref={scroller} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div aria-live="polite" className={`${READING_COLUMN} py-8`}>
          {hasOpening && (
            <article className="fade-in mb-8">
              <div className="space-y-6">{prose(opening)}</div>
              {idle && <SayExamples />}
            </article>
          )}
          {!hasOpening && idle && scene !== undefined && (
            <EmptyState clockText={scene.clockText} state={scene.state} />
          )}
          {beats.map((beat, index) => {
            const previousBeat = beats[index - 1]
            return (
              <article key={beat.seq} className="fade-in mb-8">
                {(previousBeat === undefined || previousBeat.clockText !== beat.clockText) && (
                  <BeatDivider clockText={beat.clockText} />
                )}
                {beat.player !== undefined && <PlayerLine text={beat.player} {...(beat.playerTo === undefined ? {} : { to: beat.playerTo })} />}
                {/* `space-y-6` 给 24px：段间距必须大于行高，否则一整段看不出分断 */}
                {beat.passage !== undefined && <div className="mt-4 space-y-6">{prose(beat.passage)}</div>}
                {beat.fallback && <ErrorNotice kind="fallback" />}
                {beat.passage === undefined && <ErrorNotice kind="missing" />}
              </article>
            )
          })}
          {pendingText !== null && (
            <article className="mb-8">
              <PlayerLine text={pendingText} {...(pendingTo === undefined ? {} : { to: pendingTo })} />
              {/* 等待中的骨架：只表示“这一拍在生成”，不出现阶段名（ui/DESIGN §4） */}
              <div className="mt-4" aria-hidden="true">
                <Skeleton active title={false} paragraph={{ rows: 3, width: ['100%', '96%', '62%'] }} />
              </div>
            </article>
          )}
        </div>
      </div>
      {unread > 0 && (
        <Button
          shape="round"
          size="small"
          icon={<ArrowDownOutlined />}
          onClick={jumpToLatest}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow"
        >
          有新的 {unread} 拍
        </Button>
      )}
    </div>
  )
}