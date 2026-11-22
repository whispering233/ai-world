/**
 * 每拍的模型调用作用域：注入 `signal`，把 prompt 与结果记进 sink（docs/design/60-server.md §4）。
 *
 * 为什么在这里做而不是在 core：core 的 `Llm` 接口不变，服务端只是包一层；
 * 中止也要在这里兜住——不是所有 provider 都老实看 `signal`，race 让中止立刻生效。
 */
import type { ModelRoleName, PromptCallView, UsageView } from '@ai-world/shared'
import type { BeatTelemetry, ChatRequest, ChatResult, Llm } from '@ai-world/core'

/** 一场拍的回收站：`telemetry` 会被 runBeat 读走，`calls` 进 prompt 环形缓冲。 */
export interface BeatSink {
  telemetry: BeatTelemetry
  calls: PromptCallView[]
}

export function emptyUsage(): UsageView {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 0, retries: 0, calls: 0 }
}

export function withBeatScope(llm: Llm, signal: AbortSignal, sink: BeatSink): Llm {
  return {
    async chat(req: ChatRequest): Promise<ChatResult> {
      if (signal.aborted) throw abortError()
      const startedAt = performance.now()
      const res = await raceAbort(llm.chat({ ...req, signal }), signal)
      const ms = Math.round(performance.now() - startedAt)
      sink.calls.push({
        role: req.role,
        ...(req.system === undefined ? {} : { system: req.system }),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        text: res.text,
        ms,
        retries: res.retries ?? 0,
      })
      const role: ModelRoleName = req.role
      const usage = sink.telemetry.usage[role]
      usage.input += res.inputTokens
      usage.output += res.outputTokens
      usage.cacheRead += res.cacheRead ?? 0
      usage.cacheWrite += res.cacheWrite ?? 0
      usage.cost += res.cost ?? 0
      usage.ms += ms
      usage.retries += res.retries ?? 0
      usage.calls += 1
      sink.telemetry.models[role] = res.model
      return res
    },
  }
}

/** 客户端断开后不该等 provider 自己反应：signal 一响就当场认输。 */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function abortError(): Error {
  const error = new Error('请求已中止')
  error.name = 'AbortError'
  return error
}
