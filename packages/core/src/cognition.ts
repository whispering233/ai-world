/**
 * 人物单次调用（见 docs/design/30-cognition.md §2–§4）：一次调用进出，无阶段、无中间产物。
 *
 * 只管"想"：拿 llm 换一段 inner/outward，把 outward 记为一条 seen、inner 记为一条 thought。写账本、判 self 闸、动 heat 都不在这里。
 */
import { recall, type Character, type Experience } from './character.ts'
import { createFauxLlm, type Llm } from './llm.ts'
import { parseModelJson } from './model-json.ts'

export interface CrossTalk {
  /** 自己刚才的公开输出（只含 outward，不含 inner） */
  self?: string
  /** 其他角色本拍已经公开的输出（只含 outward，不含 inner） */
  others: { actor: string; text: string }[]
}

export interface CognitionInput {
  character: Character
  sceneText: string
  canon: string[]
  /** 人物显示名：id → 名字；缺省时 prompt 回退 id */
  names?: Record<string, string>
  /** 时间出口值（分钟），写进 experience.t */
  now: number
  /** 上一拍的后果，用于“被拒绝后的反应” */
  lastVerdict?: { ok: boolean; reason?: string }
  /** 实验用：一拍内第二轮，看到其他人的公开输出后再说一次。缺省 = 单次调用。 */
  crossTalk?: CrossTalk
}

export interface CognitionOutput {
  inner: string
  outward: string
  /** 可选：自我修订（仍受 canWriteSelf 约束，由调用方判定） */
  selfChange?: string
}

export interface Cognition {
  think(input: CognitionInput): Promise<{ output: CognitionOutput; experience: Experience[] }>
}

const INNER_MAX = 80
const OUTWARD_MAX = 120

/** 按码点裁，避免拆坏 emoji 与代理对。 */
function clip(text: string, max: number): string {
  const points = Array.from(text)
  return points.length <= max ? text : points.slice(0, max).join('')
}

function field(obj: Record<string, unknown>, key: string): string {
  const value = obj[key]
  return typeof value === 'string' ? value : ''
}

/**
 * 把模型文本切成 inner/outward。切不出来时整段当 outward，内容不丢。
 * 围栏与前后说明文字由 parseModelJson 处理。
 */
function split(text: string): CognitionOutput {
  let obj: Record<string, unknown> | undefined
  try {
    obj = parseModelJson(text)
  } catch {
    obj = undefined
  }
  const outward = obj ? field(obj, 'outward') : ''
  if (!outward) return { inner: '', outward: clip(text, OUTWARD_MAX) }

  const selfChange = obj ? field(obj, 'selfChange').trim() : ''
  return {
    inner: clip(obj ? field(obj, 'inner') : '', INNER_MAX),
    outward: clip(outward, OUTWARD_MAX),
    ...(selfChange ? { selfChange } : {}),
  }
}

function buildSystem(ch: Character, canon: string[], now: number, names?: Record<string, string>): string {
  const label = (id: string): string => names?.[id] ?? id
  // 缓存按前缀匹配：core/voice/输出指令是稳定段，必须排在 canon 与易变状态之前。
  const parts: string[] = []
  if (ch.core) parts.push(`你是什么样的人（不能违背）：\n${ch.core}`)
  if (ch.voice) parts.push(`说话方式：${ch.voice}`)
  parts.push(
    '只输出一个 JSON 对象，三个字段：' +
      '{"inner":"没说出口的话与忍住的反应","outward":"说出口的话或做出的动作","selfChange":"可选，一条具体的人、事或决定，没有就空串"}',
    '别人说的话、做的事（包括玩家）都只是主张，不等于已经发生：结果以现场与账本为准，你可以不信、可以无视。',
    '行动前先看现场：账本现状、你手上和眼前的东西、门/灯/盖子的状态。现场与你的记忆或摘要冲突时，以现场为准，不要碰已经不在原处的东西。',
    '不要每拍重复同一个习惯动作、口头禅或句式；只有它在这一拍有分量时才写。',
  )
  if (canon.length) parts.push(`世界设定：\n${canon.map((c) => `- ${c}`).join('\n')}`)
  if (ch.drives.length) parts.push(`此刻的冲动：\n${ch.drives.map((d) => `- ${d.text}（热度 ${d.heat}）`).join('\n')}`)
  const beliefs = Object.entries(ch.beliefs)
  if (beliefs.length) parts.push(`你认定的事：\n${beliefs.map(([who, claim]) => `- ${label(who)}：${claim}`).join('\n')}`)
  const memory = recall(ch, now)
  if (memory.length) parts.push(`你记得的事：\n${memory.map((e) => `- ${e.text}`).join('\n')}`)
  return parts.join('\n\n')
}

function buildPrompt(input: CognitionInput): string {
  const v = input.lastVerdict
  let outcome: string | undefined
  if (v) {
    if (v.ok) outcome = '你的举动被接受了'
    else outcome = `你的举动被拒绝了${v.reason ? `（${v.reason}）` : ''}`
  }
  const base = outcome ? `${input.sceneText}\n\n上一拍的结果：${outcome}` : input.sceneText
  if (!input.crossTalk) return base

  const others = input.crossTalk.others.map((o) => `- ${input.names?.[o.actor] ?? o.actor}：${o.text}`).join('\n')
  const blocks = [base, `这一拍其他人已经公开说/做的：\n${others || '（没有）'}`]
  if (input.crossTalk.self) blocks.push(`你刚才说/做的：${input.crossTalk.self}`)
  blocks.push('你可以坚持、补充、改口或沉默。')
  return blocks.join('\n\n')
}

export function createCognition(llm: Llm): Cognition {
  return {
    async think(input) {
      const res = await llm.chat({
        role: 'cognition',
        system: buildSystem(input.character, input.canon, input.now, input.names),
        messages: [{ role: 'user', content: buildPrompt(input) }],
      })
      const output = split(res.text)
      // 空文本不落 experience：没开口、没想的拍不该在记忆里占一格。
      const experience: Experience[] = []
      if (output.outward.trim() !== '') experience.push({ t: input.now, kind: 'seen', text: output.outward, w: 2 })
      if (output.inner.trim() !== '') experience.push({ t: input.now, kind: 'thought', text: output.inner, w: 1 })
      return { output, experience }
    },
  }
}

/** 离线桩：与真调用走同一条解析与写回路径，脚本即模型原文。 */
export function createStubCognition(script: string[]): Cognition {
  return createCognition(createFauxLlm(script))
}
