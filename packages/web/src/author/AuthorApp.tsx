import { Alert, Button, Collapse, Modal } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import type { AuthorBeatView, AuthorSessionView, BeatView } from '@ai-world/shared'
import { fetchAuthorBeat, fetchAuthorSession } from '../api.ts'
import { ReadingStream } from '../shell/ReadingStream.tsx'
import { ModeSwitch } from '../ui/ModeSwitch.tsx'
import type { ShellMode } from '../ui/ModeSwitch.tsx'
import { BeatDetail } from './BeatDetail.tsx'
import { BeatList } from './BeatList.tsx'
import { ContentEditor } from './ContentEditor.tsx'
import { HealthPanel } from './HealthPanel.tsx'
import { SaveDialog } from './SaveDialog.tsx'

export interface AuthorAppProps {
  /** 与玩家壳同一份阅读流：换壳不重新请求、不重置滚动位置 */
  beats: BeatView[]
  pendingText: string | null
  onModeChange: (mode: ShellMode) => void
  /** 开新局由 App 统一做：玩家壳也要一起换成新局 */
  onNewGame: () => Promise<void>
}

/** 作者壳：拍列表 / 同一份阅读流 / 本拍详情，固定宽度，不做拖拽分隔条。 */
export function AuthorApp({ beats, pendingText, onModeChange, onNewGame }: AuthorAppProps) {
  const [session, setSession] = useState<AuthorSessionView | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [beat, setBeat] = useState<AuthorBeatView | null>(null)
  const [contentOpen, setContentOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setSession(await fetchAuthorSession())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 单拍详情只在点选时取：不把 prompt 这类大块数据塞进整局投影
  useEffect(() => {
    if (selected === null) {
      setBeat(null)
      return
    }
    let alive = true
    fetchAuthorBeat(selected).then(
      (next) => {
        if (alive) setBeat(next)
      },
      () => {
        if (alive) setBeat(null)
      },
    )
    return () => {
      alive = false
    }
  }, [selected])

  const changed = session?.content.changed === true
  const cost = session === null ? 0 : Object.values(session.usage).reduce((sum, usage) => sum + usage.cost, 0)
  // 点下一拍时旧详情还在内存里：只渲染与当前选中一致的拍，不闪上一拍的账
  const shown = beat !== null && beat.entry.seq === selected ? beat : null

  async function startNewGame(): Promise<void> {
    setSaved(false)
    await onNewGame()
    setSelected(null)
    await refresh()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-rule px-4 text-meta text-ink-soft">
        <div className="flex items-center gap-4">
          <span>{changed ? '内容已变更，未生效' : '内容已生效'}</span>
          <span>累计 cost {cost.toFixed(4)}</span>
          <span>降级 {session?.health.degraded ?? 0} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="text" size="small" onClick={() => setContentOpen(true)}>
            内容
          </Button>
          <ModeSwitch mode="author" onModeChange={onModeChange} />
        </div>
      </header>

      {changed && (
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-rule px-4 py-2">
          <Alert type="warning" showIcon title="内容已变更，未生效。" className="flex-1" />
          <Button size="small" onClick={() => setSaved(true)}>
            开新局
          </Button>
        </div>
      )}

      {failed && (
        <div className="shrink-0 px-4 py-2">
          <Alert type="error" showIcon title="读不到作者投影。请确认服务在跑。" />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside aria-label="拍列表" className="w-60 shrink-0 overflow-y-auto border-r border-rule">
          <BeatList beats={beats} selected={selected} onSelect={setSelected} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <ReadingStream beats={beats} pendingText={pendingText} />
        </div>

        <aside aria-label="本拍详情" className="w-[420px] shrink-0 overflow-y-auto border-l border-rule p-4">
          <BeatDetail beat={shown} world={session?.world ?? null} />
          <div className="mt-6 border-t border-rule pt-3">
            <Collapse
              ghost
              size="small"
              items={[
                {
                  key: 'health',
                  label: '体检',
                  children:
                    session === null ? (
                      <p className="text-meta text-ink-soft">还没有读到作者投影。</p>
                    ) : (
                      <HealthPanel health={session.health} />
                    ),
                },
              ]}
            />
          </div>
        </aside>
      </div>

      <Modal
        open={contentOpen}
        onCancel={() => setContentOpen(false)}
        title="内容"
        footer={null}
        width={720}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        {contentOpen && (
          <ContentEditor
            onSaved={() => {
              setContentOpen(false)
              setSaved(true)
              void refresh()
            }}
          />
        )}
      </Modal>

      <SaveDialog
        open={saved}
        onClose={() => {
          setSaved(false)
          void refresh()
        }}
        onNewGame={() => void startNewGame()}
      />
    </div>
  )
}
