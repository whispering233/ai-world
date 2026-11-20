import type { Api, Context, Message, Model, MutableModels } from '@earendil-works/pi-ai'

/** 三档模型：人物认知 = fast，裁判 = strong，渲染 = mid（见 docs/design/50-llm.md §2）。 */
export type Tier = 'fast' | 'strong' | 'mid'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  tier: Tier
  system?: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

export interface ChatResult {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
}

export interface Llm {
  chat(req: ChatRequest): Promise<ChatResult>
}

let collection: MutableModels | undefined

/** 首次 chat() 才加载 provider 目录：模块加载期不读 env，也不因为缺 key 报错。 */
async function models(): Promise<MutableModels> {
  if (!collection) {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
    collection = builtinModels()
  }
  return collection
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

/** 模型串为 "provider/modelId"，档位只能来自配置，不硬编码。 */
export function createLlm(config: { models: Record<Tier, string> }): Llm {
  return {
    async chat(req) {
      const ref = config.models[req.tier] ?? ''
      const at = ref.indexOf('/')
      const models_ = await models()
      const model =
        at > 0 && at < ref.length - 1 ? models_.getModel(ref.slice(0, at), ref.slice(at + 1)) : undefined
      if (!model) throw new Error(`模型未配置或不存在：tier=${req.tier} model=${ref || '(空)'}`)

      const context: Context = {
        systemPrompt: req.system,
        messages: req.messages.map((m) => toMessage(m, model, Date.now())),
      }
      const res = await models_.complete(model, context, { signal: req.signal })
      if (res.stopReason === 'error') {
        throw new Error(`模型调用失败：tier=${req.tier} model=${ref}：${res.errorMessage ?? '无错误详情'}`)
      }

      return {
        text: res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
        inputTokens: res.usage.input,
        outputTokens: res.usage.output,
        model: ref,
      }
    },
  }
}

/** 离线测试桩：按顺序吐脚本，用完复用最后一条。 */
export function createFauxLlm(script: string[]): Llm {
  let i = 0
  return {
    async chat(req) {
      const text = script.length === 0 ? '' : (script[Math.min(i++, script.length - 1)] ?? '')
      return { text, inputTokens: 0, outputTokens: 0, model: `faux/${req.tier}` }
    },
  }
}
