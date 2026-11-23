import { useEffect, useReducer, useRef } from 'react'
import type { BeatView, SessionView } from '@ai-world/shared'
import { fetchSession, postBeat, resetSession } from './api.ts'
import type { BeatFrame } from './api.ts'
import { AuthorApp } from './author/AuthorApp.tsx'
import { Composer } from './shell/Composer.tsx'
import { ErrorNotice } from './shell/ErrorNotice.tsx'
import type { ErrorKind } from './shell/ErrorNotice.tsx'
import { ReadingStream } from './shell/ReadingStream.tsx'
import { StateDrawer } from './shell/StateDrawer.tsx'
import { TopBar } from './shell/TopBar.tsx'
import { READING_COLUMN } from './shell/column.ts'
import { Banner } from './ui/Banner.tsx'
import { Button } from './ui/Button.tsx'
import { Dialog } from './ui/Dialog.tsx'
import type { ShellMode } from './ui/ModeSwitch.tsx'

const MODE_KEY = 'ai-world.mode'

interface AppState {
  session: SessionView | null
  beats: BeatView[]
  inFlight: boolean
  elapsedMs: number
  error: ErrorKind | null
  mode: ShellMode
  drawerOpen: boolean
  dialog: 'none' | 'new-game' | 'about'
  draft: string
  pendingText: string | null
  loadFailed: boolean
}

type Action =
  | { type: 'loaded'; session: SessionView }
  | { type: 'load-failed' }
  | { type: 'draft'; draft: string }
  | { type: 'send' }
  | { type: 'frame'; frame: BeatFrame }
  | { type: 'end' }
  | { type: 'stop' }
  | { type: 'failed' }
  | { type: 'mode'; mode: ShellMode }
  | { type: 'drawer'; open: boolean }
  | { type: 'dialog'; dialog: AppState['dialog'] }

function initialState(): AppState {
  return {
    session: null,
    beats: [],
    inFlight: false,
    elapsedMs: 0,
    error: null,
    mode: localStorage.getItem(MODE_KEY) === 'author' ? 'author' : 'player',
    drawerOpen: false,
    dialog: 'none',
    draft: '',
    pendingText: null,
    loadFailed: false,
  }
}

function applyFrame(state: AppState, frame: BeatFrame): AppState {
  switch (frame.event) {
    case 'progress':
      return { ...state, elapsedMs: frame.data.elapsedMs }
    case 'passage':
      return { ...state, beats: [...state.beats, frame.data], pendingText: null }
    case 'state':
      if (state.session === null) return state
      return {
        ...state,
        session: {
          ...state.session,
          clock: frame.data.clock,
          clockText: frame.data.clockText,
          state: frame.data.state,
        },
      }
    case 'done':
      return { ...state, inFlight: false, elapsedMs: 0 }
    case 'error':
      // 没有 passage 帧就是没有发生：把玩家那句话退回输入框
      return {
        ...state,
        inFlight: false,
        elapsedMs: 0,
        pendingText: null,
        error: 'refused',
        draft: state.pendingText ?? state.draft,
      }
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loaded': {
      const { session } = action
      return { ...state, session, beats: session.beats, inFlight: session.inFlight, loadFailed: false }
    }
    case 'load-failed':
      return { ...state, loadFailed: true }
    case 'draft':
      return { ...state, draft: action.draft }
    case 'send': {
      const text = state.draft.trim()
      if (text === '' || state.inFlight) return state
      return { ...state, draft: '', pendingText: text, inFlight: true, elapsedMs: 0, error: null }
    }
    case 'frame':
      return applyFrame(state, action.frame)
    case 'end':
      // 流在没有 done 的情况下结束：已落盘的拍照常显示，没落盘的那句退回去
      if (!state.inFlight) return state
      return state.pendingText === null
        ? { ...state, inFlight: false, elapsedMs: 0 }
        : { ...state, inFlight: false, elapsedMs: 0, pendingText: null, error: 'refused', draft: state.pendingText }
    case 'stop':
      // 停止 = 断开连接；账本由服务端决定，界面不猜
      return { ...state, inFlight: false, elapsedMs: 0, pendingText: null }
    case 'failed':
      return {
        ...state,
        inFlight: false,
        elapsedMs: 0,
        error: 'refused',
        pendingText: null,
        draft: state.pendingText ?? state.draft,
      }
    case 'mode':
      return { ...state, mode: action.mode }
    case 'drawer':
      return { ...state, drawerOpen: action.open }
    case 'dialog':
      return { ...state, dialog: action.dialog }
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const inFlightRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    fetchSession().then(
      (session) => {
        if (alive) dispatch({ type: 'loaded', session })
      },
      () => {
        if (alive) dispatch({ type: 'load-failed' })
      },
    )
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(MODE_KEY, state.mode)
  }, [state.mode])

  // Ctrl/Cmd+Shift+D 换壳
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'd') return
      event.preventDefault()
      dispatch({ type: 'mode', mode: state.mode === 'player' ? 'author' : 'player' })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.mode])

  async function send() {
    const text = state.draft.trim()
    if (text === '' || state.inFlight) return
    dispatch({ type: 'send' })
    const controller = new AbortController()
    inFlightRequest.current = controller
    try {
      await postBeat(text, { signal: controller.signal, onFrame: (frame) => dispatch({ type: 'frame', frame }) })
      dispatch({ type: 'end' })
    } catch {
      dispatch({ type: controller.signal.aborted ? 'stop' : 'failed' })
    } finally {
      inFlightRequest.current = null
    }
  }

  async function startNewGame() {
    dispatch({ type: 'dialog', dialog: 'none' })
    try {
      await resetSession()
      dispatch({ type: 'loaded', session: await fetchSession() })
    } catch {
      dispatch({ type: 'load-failed' })
    }
  }

  // 两个壳共用同一个输入节点：发送逻辑只有下面这一个 `send`
  const composer = (
    <Composer
      draft={state.draft}
      onDraftChange={(draft) => dispatch({ type: 'draft', draft })}
      onSend={() => void send()}
      onStop={() => inFlightRequest.current?.abort()}
      inFlight={state.inFlight}
      elapsedMs={state.elapsedMs}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <TopBar
        title={state.session?.title ?? '…'}
        clockText={state.session?.clockText ?? ''}
        inFlight={state.inFlight}
        mode={state.mode}
        onOpenState={() => dispatch({ type: 'drawer', open: true })}
        onNewGame={() => dispatch({ type: 'dialog', dialog: 'new-game' })}
        onModeChange={(mode) => dispatch({ type: 'mode', mode })}
        onAbout={() => dispatch({ type: 'dialog', dialog: 'about' })}
      />

      {state.mode === 'author' ? (
        <AuthorApp
          beats={state.beats}
          pendingText={state.pendingText}
          onModeChange={(mode) => dispatch({ type: 'mode', mode })}
          onNewGame={startNewGame}
          composer={composer}
        />
      ) : (
        <>
          <ReadingStream beats={state.beats} pendingText={state.pendingText} />
          {state.loadFailed && (
            <div className={`${READING_COLUMN} pb-2`}>
              <Banner tone="alert">读不到世界。请确认服务在跑。</Banner>
            </div>
          )}
          {state.error !== null && (
            <div className={`${READING_COLUMN} pb-2`}>
              <ErrorNotice kind={state.error} />
            </div>
          )}
          {composer}
        </>
      )}

      <StateDrawer
        open={state.drawerOpen}
        onClose={() => dispatch({ type: 'drawer', open: false })}
        state={state.session?.state ?? null}
      />

      <Dialog
        open={state.dialog === 'new-game'}
        onClose={() => dispatch({ type: 'dialog', dialog: 'none' })}
        title="新的一局"
      >
        <div className="p-4">
          <p className="text-body">开新局会清空这一局的全部记录，不可撤销。</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => dispatch({ type: 'dialog', dialog: 'none' })}>
              取消
            </Button>
            <Button variant="danger" onClick={() => void startNewGame()}>
              开新局
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={state.dialog === 'about'} onClose={() => dispatch({ type: 'dialog', dialog: 'none' })} title="关于">
        <div className="p-4 text-body">
          <p>一句一句写下去，世界一拍一拍回应。</p>
          <p className="mt-3 text-meta text-ink-soft">调试与账本信息只在作者视图里。</p>
        </div>
      </Dialog>
    </div>
  )
}
