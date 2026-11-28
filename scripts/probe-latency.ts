// 对照测速：同一段裁判输入，只改「有没有工具」，分别量总耗时与首字耗时。
// 用法：node --experimental-strip-types scripts/probe-latency.ts
import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import { resolveModelConfig } from '@ai-world/core'
import { createLlm, type ToolSpec } from '@ai-world/core'
import { readonlyPiCredentials } from '@ai-world/core'
import { REFEREE_SYSTEM, SUBMIT_VERDICT_TOOL, refereePrompt, type RefereeInput } from '@ai-world/core'

const cfg = resolveModelConfig()
const ref = cfg.models.referee
const sessionId = `probe-${Date.now()}`

// 一段形状与真实裁判调用相当的输入
const input: RefereeInput = {
  clock: 28,
  context: [
    '地点：酒馆（门关着，灯芯短）',
    '在场：ann（老板娘，站在柜台后）、player（生客，进门两分钟）、doc（医生，坐在角落）',
    '可计量物：whiskey×3、morphine×11、silver-dollar×2',
    '最近发生：player 走进来点了一杯酒；ann 说「先付钱」；player 把 1 枚银元放在柜台上',
  ].join('\n'),
  claims: [
    { id: 'c1', actor: 'player', kind: 'say', text: '来一杯威士忌，钱放这了。' },
    { id: 'c2', actor: 'ann', kind: 'act', text: '把银元收进围裙，转身去取酒。' },
  ],
}
const user = refereePrompt(input)

async function total(label: string, tools: ToolSpec[] | undefined): Promise<void> {
  const llm = createLlm({ models: cfg.models, sessionId, credentials: readonlyPiCredentials(), retry: cfg.retry })
  const t0 = performance.now()
  try {
    const res = await llm.chat({
      role: 'referee',
      system: REFEREE_SYSTEM,
      messages: [{ role: 'user', content: user }],
      ...(tools ? { tools } : {}),
    })
    const ms = Math.round(performance.now() - t0)
    const out = res.outputTokens
    console.log(
      `${label.padEnd(12)} 总 ${String(ms).padStart(6)}ms  in ${res.inputTokens} out ${out}  ${out > 0 ? (out / (ms / 1000)).toFixed(1) : '-'} tok/s  工具调用 ${res.toolCalls.length}`,
    )
  } catch (e) {
    console.log(`${label.padEnd(12)} 失败 ${Math.round(performance.now() - t0)}ms  ${(e as Error).message}`)
  }
}

async function ttft(label: string): Promise<void> {
  const [provider, id] = ref.split('/')
  const collection = builtinModels({ credentials: readonlyPiCredentials() })
  const model = collection.getModel(provider ?? '', id ?? '')
  if (!model) {
    console.log(`${label.padEnd(12)} 模型不存在 ${ref}`)
    return
  }
  const t0 = performance.now()
  let first = 0
  let out = 0
  let inTok = 0
  const stream = collection.stream(
    model,
    { systemPrompt: REFEREE_SYSTEM, messages: [{ role: 'user', content: user, timestamp: Date.now() }] },
    { sessionId },
  )
  for await (const ev of stream) {
    if (first === 0 && (ev.type === 'text_start' || ev.type === 'text_delta' || ev.type === 'thinking_delta')) {
      first = performance.now() - t0
    }
  }
  const msg = await stream.result()
  out = msg.usage.output
  inTok = msg.usage.input
  const totalMs = Math.round(performance.now() - t0)
  console.log(
    `${label.padEnd(12)} 首字 ${String(Math.round(first)).padStart(6)}ms  总 ${String(totalMs).padStart(6)}ms  in ${inTok} out ${out}  生成 ${(totalMs - Math.round(first)).toFixed(0)}ms`,
  )
}

console.log(`模型 ${ref}\n`)
for (let round = 1; round <= 2; round += 1) {
  await total(`工具#${round}`, [SUBMIT_VERDICT_TOOL])
  await total(`纯文本#${round}`, undefined)
}
for (let round = 1; round <= 2; round += 1) {
  await ttft(`首字#${round}`)
}
