import {
  retryAssistantCall,
  validateToolArguments,
  type RetryPolicy,
  type Api,
  type Context,
  type CredentialStore,
  type Message,
  type Model,
  type MutableModels,
  type Tool,
  type ToolCall,
} from '@earendil-works/pi-ai'

/** 三个模型角色：cognition = 人物认知，referee = 裁判，narration = 渲染（见 docs/design/50-llm.md §2）。 */
export type ModelRole = 'cognition' | 'referee' | 'narration'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolSpec {
  name: string
  description: string
  /** 纯 JSON Schema（pi-ai 会用它校验模型给出的参数） */
  parameters: Record<string, unknown>
}

export interface ChatRequest {
  role: ModelRole
  system?: string
  messages: ChatMessage[]
  signal?: AbortSignal
  /** 给了工具就等于要求模型用工具回答；参数由 pi-ai 校验 */
  tools?: ToolSpec[]
}

export interface ChatResult {
  text: string
  /** 模型给出的工具调用（已按 schema 校验并补全类型） */
  toolCalls: { name: string; args: Record<string, unknown> }[]
  inputTokens: number
  outputTokens: number
  model: string
  /** provider 报回的缓存命中量；不报时缺省 */
  cacheRead?: number
  cacheWrite?: number
}

export interface UsageSample {
  role: ModelRole
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** 本次调用总耗时（含重试与退避） */
  ms: number
  /** 本次调用触发的重试次数 */
  retries: number
}

export interface Llm {
  chat(req: ChatRequest): Promise<ChatResult>
}

/**
 * 首次 chat() 才加载 provider 目录：模块加载期不读 env，也不因为缺 key 报错。
 * 每个 Llm 实例各自持有一个目录，这样注入的凭据存储不会跨实例串味。
 */
function modelLoader(credentials?: CredentialStore): () => Promise<MutableModels> {
  let collection: MutableModels | undefined
  return async () => {
    if (!collection) {
      const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
      collection = credentials ? builtinModels({ credentials }) : builtinModels()
    }
    return collection
  }
}

/**
 * 把纯文本历史补成 pi-ai 的消息。
 * 助手消息要求 api/provider/usage 齐全，历史文本没有这些签名，用当前模型与零值补齐；
 * provider 只读 content，thinking 的跨模型处理也只看出处字段。
 */
function toMessage(m: ChatMessage, model: Model<Api>, at: number): Message {
  if (m.role === 'user') return { role: 'user', content: m.content, timestamp: at }
  return {
    role: 'assistant',
    content: [{ type: 'text', text: m.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: at,
  }
}

/** 模型串为 "provider/modelId"，角色名只能来自配置，不硬编码。 */
export interface LlmConfig {
  models: Record<ModelRole, string>
  onUsage?: (sample: UsageSample) => void
  /** 订阅式供应商（如 opencode-go）的凭据存储；不给就走环境变量 */
  credentials?: CredentialStore
  /** 会话标识：opencode 用它做路由头，多家供应商用它做缓存亲和。一次世界运行用一个 */
  sessionId?: string
  /** 临时错误的重试预算；缺省 2 次、800ms 起退避（pi CLI 同款策略） */
  retry?: RetryPolicy
}

export function createLlm(config: LlmConfig): Llm {
  const loadModels = modelLoader(config.credentials)
  return {
    async chat(req) {
      const ref = config.models[req.role] ?? ''
      const at = ref.indexOf('/')
      const models_ = await loadModels()
      const model =
        at > 0 && at < ref.length - 1 ? models_.getModel(ref.slice(0, at), ref.slice(at + 1)) : undefined
      if (!model) throw new Error(`模型未配置或不存在：role=${req.role} model=${ref || '(空)'}`)

      const context: Context = {
        systemPrompt: req.system,
        messages: req.messages.map((m) => toMessage(m, model, Date.now())),
        ...(req.tools ? { tools: req.tools.map(toTool) } : {}),
      }
      // 传输层抖动由 pi-ai 的 retryAssistantCall 处理：它只重试可重试的错误，
      // 配额/鉴权这类确定性错误立刻返回，不会白等。
      const startedAt = performance.now()
      let retries = 0
      const res = await retryAssistantCall(
        () =>
          models_.complete(model, context, {
            signal: req.signal,
            ...(config.sessionId ? { sessionId: config.sessionId } : {}),
          }),
        config.retry ?? { enabled: true, maxRetries: 2, baseDelayMs: 800 },
        req.signal,
        {
          onRetryScheduled: () => {
            retries += 1
          },
        },
      )
      if (res.stopReason === 'error') {
        throw new Error(`模型调用失败：role=${req.role} model=${ref}：${res.errorMessage ?? '无错误详情'}`)
      }

      const result: ChatResult = {
        text: res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
        toolCalls: collectToolCalls(res.content, req.tools ?? []),
        inputTokens: res.usage.input,
        outputTokens: res.usage.output,
        model: ref,
        cacheRead: res.usage.cacheRead,
        cacheWrite: res.usage.cacheWrite,
      }
      config.onUsage?.({
        role: req.role,
        model: ref,
        input: result.inputTokens,
        output: result.outputTokens,
        cacheRead: res.usage.cacheRead,
        cacheWrite: res.usage.cacheWrite,
        ms: Math.round(performance.now() - startedAt),
        retries,
      })
      return result
    },
  }
}

/** 离线测试桩：按顺序吐脚本，用完复用最后一条。 */
export function createFauxLlm(script: string[]): Llm {
  let i = 0
  return {
    async chat(req) {
      const text = script.length === 0 ? '' : (script[Math.min(i++, script.length - 1)] ?? '')
      return { text, toolCalls: [], inputTokens: 0, outputTokens: 0, model: `faux/${req.role}` }
    },
  }
}

/** Tool.parameters 收纯 JSON Schema；ToolSpec 就是那个形状，转一次只是去掉我们自己的字段。 */
function toTool(spec: ToolSpec): Tool {
  return { name: spec.name, description: spec.description, parameters: spec.parameters }
}

/** 只收模型真正调用过的工具；参数校验失败时 pi-ai 会给出带字段路径的错误。 */
function collectToolCalls(
  content: readonly { type: string }[],
  tools: readonly ToolSpec[],
): { name: string; args: Record<string, unknown> }[] {
  const out: { name: string; args: Record<string, unknown> }[] = []
  for (const block of content) {
    if (block.type !== 'toolCall') continue
    const call = block as ToolCall
    const spec = tools.find((t) => t.name === call.name)
    if (!spec) continue
    out.push({ name: call.name, args: validateToolArguments(toTool(spec), call) as Record<string, unknown> })
  }
  return out
}
