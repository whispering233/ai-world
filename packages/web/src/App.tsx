import { Alert, Modal, Select } from 'antd'
import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react'
import type { BeatView, SessionView } from '@ai-world/shared'
import { fetchSession, postBeat, resetSession } from './api.ts'
import type { BeatFrame } from './api.ts'
import { Composer, WAIT_TEXT } from './shell/Composer.tsx'
import { ErrorNotice } from './shell/ErrorNotice.tsx'
import type { ErrorKind } from './shell/ErrorNotice.tsx'
import { ReadingStream } from './shell/ReadingStream.tsx'
import { effectiveTarget } from './shell/target.ts'
import { StateDrawer } from './shell/StateDrawer.tsx'
import { TopBar } from './shell/TopBar.tsx'
import { READING_COLUMN } from './shell/column.ts'
import type { ShellMode } from './ui/ModeSwitch.tsx'

const MODE_KEY = 'ai-world.mode'

// 作者壳只在切过去时才下载：静态 import 会让每个读者都付这份体积（当时测到 1.12 MB 的单 chunk）。
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
  /** “对谁说”的目标（在场者显示名）；null = 没有点名的人 */
  target: string | null
  /** 显式点了「所有人」：发送时带 `all:true`，服务端不推断（决策 #48） */
  explicitAll: boolean
  /** 在途那一拍实际带上的目标：等待中也要能看出“对安说的” */
  pendingTo: string | null
  loadFailed: boolean
}

type Action =
  /** `newGame`：开新局换了世界，旧世界的草稿与在途文本不能带过去（`reload()` 不吃这一支） */
  | { type: 'loaded'; session: SessionView; newGame?: boolean }
  | { type: 'load-failed' }
  | { type: 'draft'; draft: string }
  | { type: 'target'; target: string | null; all?: boolean }
  | { type: 'send'; text: string; keepDraft: boolean; to: string | null; all: boolean }
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
    target: null,
    explicitAll: false,
    pendingTo: null,
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
      return { ...state, beats: [...state.beats, frame.data], pendingText: null, pendingTo: null, settled: false }
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
        pendingTo: null,
        error: 'refused',
        draft: restoredDraft(state),
      }
  }
}

/** 失败时把玩家那一句退回输入框；已经打好的草稿优先，「等一会儿」不能把它冲掉 */
function restoredDraft(state: AppState): string {
  return state.draft !== '' ? state.draft : (state.pendingText ?? '')
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loaded': {
      const { session } = action
      return {
        ...state,
        session,
        beats: session.beats,
        inFlight: session.inFlight,
        // 取到了会话就说明这次读是成功的：上一次失败留下的错误条不能继续挂着
        error: null,
        loadFailed: false,
        pendingTo: null,
        ...(action.newGame === true ? { draft: '', pendingText: null } : {}),
      }
    }
    case 'load-failed':
      return { ...state, loadFailed: true }
    case 'draft':
      return { ...state, draft: action.draft }
    case 'target':
      // 点在场者 / 「自动」都落在「不广播」；只有「所有人」把 explicitAll 置真
      return { ...state, target: action.target, explicitAll: action.all === true }
    case 'send': {
      const text = action.text.trim()
      if (text === '' || state.inFlight) return state
      return {
        ...state,
        draft: action.keepDraft ? state.draft : '',
        pendingText: text,
        // 显式「所有人」是广播：等待行不该再显示「对安说的」（to 与 all 由调用方二选一）
        pendingTo: action.all ? null : action.to,
        inFlight: true,
        settled: false,
        elapsedMs: 0,
        error: null,
      }
    }
    case 'frame':
      return applyFrame(state, action.frame)
    case 'end':
      // 流在没有 done 的情况下结束：已落盘的拍照常显示，没落盘的那句退回去
      if (!state.inFlight) return state
      return state.pendingText === null
        ? { ...state, inFlight: false, settled: false, elapsedMs: 0, pendingTo: null }
        : { ...state, inFlight: false, settled: false, elapsedMs: 0, pendingText: null, pendingTo: null, error: 'refused', draft: restoredDraft(state) }
    case 'stop':
      // 停止 = 断开连接；账本由服务端决定，界面不猜
      return { ...state, inFlight: false, settled: false, elapsedMs: 0, pendingText: null, pendingTo: null }
    case 'failed':
      return {
        ...state,
        inFlight: false,
        settled: false,
        elapsedMs: 0,
        error: 'refused',
        pendingText: null,
        pendingTo: null,
        draft: restoredDraft(state),
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
  /** 新局弹窗里选中的包；null = 当前世界（服务端有 `worlds` 时才可能换成别的） */
  const [newWorld, setNewWorld] = useState<string | null>(null)
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

  // 目标只对“仍在场的显示名”生效：在场名单由服务端投影给，不自己猜（ui/DESIGN §3）。
  // `here` 每帧都是新数组，依赖用它的稳定字符串，否则每次心跳都会重跑一次。
  const hereKey = (state.session?.state.here ?? []).join('\u0000')
  useEffect(() => {
    if (state.target === null) return
    if (effectiveTarget(state.target, state.session?.state.here ?? []) !== null) return
    dispatch({ type: 'target', target: null })
  }, [hereKey, state.target])

  // 有效目标：不在场就当没选（服务端也会按自己那份投影再验一次，两边不会偏差）
  const target = effectiveTarget(state.target, state.session?.state.here ?? [])

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

  /** `keepDraft` 只给「等一会儿」用：等待不该吃掉玩家已经打好的半句话 */
  async function send(text = state.draft.trim(), keepDraft = false, to: string | null = target, all = state.explicitAll) {
    if (text === '' || state.inFlight) return
    const broadcast = all && to === null
    dispatch({ type: 'send', text, keepDraft, to, all: broadcast })
    const controller = new AbortController()
    inFlightRequest.current = controller
    try {
      await postBeat(text, {
        signal: controller.signal,
        onFrame: (frame) => dispatch({ type: 'frame', frame }),
        ...(to === null ? {} : { to }),
        ...(broadcast ? { all: true } : {}),
      })
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

  async function startNewGame(world?: string) {
    dispatch({ type: 'dialog', dialog: 'none' })
    try {
      await resetSession(world)
      // 换了世界就是换了世界：草稿与在途文本都属于旧世界，随新局一起作废
      dispatch({ type: 'loaded', session: await fetchSession(), newGame: true })
      setNewWorld(null)
    } catch {
      dispatch({ type: 'load-failed' })
    }
  }

  // 旧服务端没有 `worlds`：不渲染选包，退化成「重开当前世界」
  const worlds = state.session?.worlds ?? []
  const activeWorld = worlds.find((world) => world.active)?.id ?? null

  // 两个壳共用同一个输入节点：发送逻辑只有下面这一个 `send`
  // 选项只取最近一拍：更早的提示已经跟当前现场无关
  const lastHints = state.beats.at(-1)?.hints
  const composer = (
    <Composer
      draft={state.draft}
      onDraftChange={(draft) => dispatch({ type: 'draft', draft })}
      onSend={() => void send()}
      onStop={() => inFlightRequest.current?.abort()}
      // 等待文案是“看看他们怎么说”，始终对所有人，不继承已选中的单人目标
      // 显式 `all:true`：等待是广播，服务端不该再从正文里推断目标
      onWait={() => void send(WAIT_TEXT, true, null, true)}
      inFlight={state.inFlight}
      settled={state.settled}
      elapsedMs={state.elapsedMs}
      state={state.session?.state}
      target={target}
      auto={!state.explicitAll && target === null}
      explicitAll={state.explicitAll}
      onTargetChange={(next) => dispatch({ type: 'target', target: next })}
      onAuto={() => dispatch({ type: 'target', target: null })}
      onAll={() => dispatch({ type: 'target', target: null, all: true })}
      {...(lastHints === undefined ? {} : { hints: lastHints })}
    />
  )

  // 两个壳共用同一份首屏素材：换壳不重新请求，也不丢掉 opening
  const scene =
    state.session === null ? undefined : { clockText: state.session.clockText, state: state.session.state }

  return (
    <div className="flex h-dvh flex-col">
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
        <Suspense fallback={<p className="p-6 meta-line">正在载入作者视图…</p>}>
          <AuthorApp
            beats={state.beats}
            pendingText={state.pendingText}
            {...(state.pendingTo === null ? {} : { pendingTo: state.pendingTo })}
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
            {...(state.pendingTo === null ? {} : { pendingTo: state.pendingTo })}
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
        onCancel={() => {
          setNewWorld(null)
          dispatch({ type: 'dialog', dialog: 'none' })
        }}
        title="新的一局"
        cancelText="取消"
        okText="开新局"
        okButtonProps={{ danger: true }}
        onOk={() => void startNewGame(newWorld ?? undefined)}
      >
        <p className="text-body">开新局会清空这一局的全部记录，不可撤销。</p>
        {/* 旧服务端没有 `worlds`：不渲染选包，行为与以前一样（重开当前世界） */}
        {worlds.length > 0 && (
          <div className="mt-4">
            <p className="meta-line">内容包</p>
            <Select
              className="mt-1 w-full"
              options={worlds.map((world) => ({ value: world.id, label: world.title }))}
              value={newWorld ?? activeWorld}
              onChange={(value) => setNewWorld(value)}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={state.dialog === 'about'}
        onCancel={() => dispatch({ type: 'dialog', dialog: 'none' })}
        title="关于"
        footer={null}
      >
        <div className="text-body">
          <p>一句一句写下去，世界一拍一拍回应。</p>
          <p className="mt-3 meta-line">调试与账本信息只在作者视图里。</p>
        </div>
      </Modal>
    </div>
  )
}
