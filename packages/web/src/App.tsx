import { Alert, Modal } from 'antd'
import { lazy, Suspense, useEffect, useReducer, useRef } from 'react'
import type { BeatView, SessionView } from '@ai-world/shared'
import { fetchSession, postBeat, resetSession } from './api.ts'
import type { BeatFrame } from './api.ts'
import { Composer } from './shell/Composer.tsx'
import { ErrorNotice } from './shell/ErrorNotice.tsx'
import type { ErrorKind } from './shell/ErrorNotice.tsx'
import { ReadingStream } from './shell/ReadingStream.tsx'
import { StateDrawer } from './shell/StateDrawer.tsx'
import { TopBar } from './shell/TopBar.tsx'
import { READING_COLUMN } from './shell/column.ts'
import type { ShellMode } from './ui/ModeSwitch.tsx'

const MODE_KEY = 'ai-world.mode'

// 作者壳只在切过去时才下载：它带着 Table / Descriptions 这类玩家壳用不到的组件，
// 静态 import 会让每个读者都付这份体积（实测 1.12 MB 的单 chunk）。
const AuthorApp = lazy(() => import('./author/AuthorApp.tsx').then((mod) => ({ default: mod.AuthorApp })))

interface AppState {
  session: SessionView | null
  beats: BeatView[]
  inFlight: boolean
  settled: boolean
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
    settled: false,
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
      // settled 只由 phase 帧置真：之后的心跳帧没有 phase，不得把它翻回去
      return { ...state, elapsedMs: frame.data.elapsedMs, settled: frame.data.phase === 'settled' ? true : state.settled }
    case 'passage':
      // 停止之后迟到的帧不能落进正文：那一拍由重取的 session 权威给出
      if (!state.inFlight) return state
      return { ...state, beats: [...state.beats, frame.data], pendingText: null, settled: false }
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
      return { ...state, inFlight: false, settled: false, elapsedMs: 0 }
    case 'error':
      // 没有 passage 帧就是没有发生：把玩家那句话退回输入框
      return {
        ...state,
        inFlight: false,
        settled: false,
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
      return { ...state, draft: '', pendingText: text, inFlight: true, settled: false, elapsedMs: 0, error: null }
    }
    case 'frame':
      return applyFrame(state, action.frame)
    case 'end':
      // 流在没有 done 的情况下结束：已落盘的拍照常显示，没落盘的那句退回去
      if (!state.inFlight) return state
      return state.pendingText === null
        ? { ...state, inFlight: false, settled: false, elapsedMs: 0 }
        : { ...state, inFlight: false, settled: false, elapsedMs: 0, pendingText: null, error: 'refused', draft: state.pendingText }
    case 'stop':
      // 停止 = 断开连接；账本由服务端决定，界面不猜
      return { ...state, inFlight: false, settled: false, elapsedMs: 0, pendingText: null }
    case 'failed':
      return {
        ...state,
        inFlight: false,
        settled: false,
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

/**
 * 等锁释放之后再取一次会话：停止之后用它补齐，避免漏拍或卡在“结算中”。
 * 服务端 `busy` 在 `finally` 才释放，取太快会拿到 `inFlight:true`，而 SSE 已经断了。
 */
async function settle(): Promise<SessionView | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const session = await fetchSession()
      if (!session.inFlight) return session
    } catch {
      return null
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return null
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

  /** 停止之后把已落账、界面没显示的那一拍补回来；读不到就保持现状，不抹掉已有正文 */
  async function reload() {
    const session = await settle()
    if (session !== null) dispatch({ type: 'loaded', session })
  }

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
      const aborted = controller.signal.aborted
      dispatch({ type: aborted ? 'stop' : 'failed' })
      // 停止只停止等待：服务端可能已经把这一拍落了账，重取一次把它补回来
      if (aborted) void reload()
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
      settled={state.settled}
      elapsedMs={state.elapsedMs}
    />
  )

  // 两个壳共用同一份首屏素材：换壳不重新请求，也不丢掉 opening
  const scene =
    state.session === null ? undefined : { clockText: state.session.clockText, state: state.session.state }

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
        <Suspense fallback={<p className="p-6 text-meta text-ink-soft">正在载入作者视图…</p>}>
          <AuthorApp
            beats={state.beats}
            pendingText={state.pendingText}
            opening={state.session?.opening}
            scene={scene}
            onModeChange={(mode) => dispatch({ type: 'mode', mode })}
            onNewGame={startNewGame}
            composer={composer}
          />
        </Suspense>
      ) : (
        <>
          <ReadingStream
            beats={state.beats}
            pendingText={state.pendingText}
            opening={state.session?.opening}
            scene={scene}
          />
          {state.loadFailed && (
            <div className={`${READING_COLUMN} pb-2`}>
              <Alert type="error" showIcon title="读不到世界。请确认服务在跑。" />
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

      {/* 开新局不可撤销：取消在左、红色「开新局」在右，没有第三种出路 */}
      <Modal
        open={state.dialog === 'new-game'}
        onCancel={() => dispatch({ type: 'dialog', dialog: 'none' })}
        title="新的一局"
        cancelText="取消"
        okText="开新局"
        okButtonProps={{ danger: true }}
        onOk={() => void startNewGame()}
      >
        <p className="text-body">开新局会清空这一局的全部记录，不可撤销。</p>
      </Modal>

      <Modal
        open={state.dialog === 'about'}
        onCancel={() => dispatch({ type: 'dialog', dialog: 'none' })}
        title="关于"
        footer={null}
      >
        <div className="text-body">
          <p>一句一句写下去，世界一拍一拍回应。</p>
          <p className="mt-3 text-meta text-ink-soft">调试与账本信息只在作者视图里。</p>
        </div>
      </Modal>
    </div>
  )
}
