/**
 * 渲染（见 docs/design/20-referee.md §6、docs/design/40-time-and-loop.md §6）。
 *
 * 只把裁判判完的结果写成人话：不判成败、不写账本、不碰任何角色的记忆。
 * 产出的文本是"传闻"，永不写回 experience / self / facts。
 */
import { createFauxLlm, type Llm } from './llm.ts'
import type { EntId } from './world.ts'

export interface NarrationEvent {
  actor: EntId
  /** 人物显示名；缺省时回退 actor id */
  name?: string
  text: string
  /** 结果的简短描述，如“门被踹开了” / “被拒绝了：门是铸铁焊死的” */
  outcome: string
  /** 裁判判定已落账；缺省表示调用方没给落账名单（旧脚本），prompt 里不标 */
  committed?: boolean
}

export interface NarrationInput {
  clockBefore: number
  clockAfter: number
  /** 场景装配好的现场文本 */
  sceneText: string
  events: NarrationEvent[]
}

export interface Narrator {
  narrate(input: NarrationInput): Promise<{ text: string; absoluteTime: string[] }>
}

/**
 * 旁白失败时的确定性兜底：只列已结算的 claim 与 outcome，不调模型、不编新事实。
 * 文本很丑，但比丢拍诚实；source 会标成 fallback。
 */
export function fallbackPassage(events: readonly NarrationEvent[]): string {
  const lines = events.map((e) => `- ${e.name ?? e.actor}：${e.text} → ${e.outcome}`)
  return [
    '（这一拍的叙述没有生成；以下是已结算的结果。）',
    '',
    lines.length > 0 ? lines.join('\n') : '（没有可呈现的结果）',
  ].join('\n')
}

/** 找出文本里的绝对时间表达；空数组表示干净。只报告命中，不改文本。 */
export function findAbsoluteTime(text: string): string[] {
  const num = '[一二三四五六七八九十百零〇\\d]'
  const re = new RegExp(
    [
      `第\\s*${num}+\\s*[天日]`, // 第3天 / 第三天
      `(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|半夜)?\\d+\\s*[点時]`, // 上午10点
      `\\d{1,2}\\s*[:：]\\s*\\d{2}`, // 14:30 / 14：30
      `${num}{1,3}\\s*月\\s*${num}{1,3}\\s*[日号]`, // 3月5日 / 三月五日
    ].join('|'),
    'g',
  )
  return [...text.matchAll(re)].map((m) => m[0])
}

const NARRATOR_SYSTEM = `你是这个世界的叙述者。你把裁判已经判定的结果写成散文，不替任何人做决定。

规则：
1. 只能使用相对时间说法：“过了一会儿”“没多久”“天已经黑了”“几个小时后”。不得写出任何具体时刻、日期或第几天（不写“第3天”“上午10点”“14:30”这类说法）。
2. 只写裁判给出的结果：不新增世界变化、不改结局、不编造谁得到了什么。
3. 补光照、动作、语气可以；这些细节只是传闻，不是事实。
4. 只输出散文本身，不要标题、不要 JSON、不要解释。
5. 一拍的独立人物段落最多两段；其余已落账的动作并进背景，不要一人一段。
6. 每个 [已落账] 的动作都必须在正文里至少出现一次，哪怕只是一句背景。
7. 按给出的顺序写，不要逐条复述：不要一个动作一段。`

/** 落账标记：缺省不标，免得把已落账的动作说成未成立。 */
function tag(e: NarrationEvent): string {
  if (e.committed === undefined) return ''
  return e.committed ? '[已落账] ' : '[未成立] '
}

function buildPrompt(input: NarrationInput): string {
  const elapsed = input.clockAfter - input.clockBefore
  const events = input.events.map((e) => `- ${tag(e)}${e.name ?? e.actor}：${e.text} → ${e.outcome}`).join('\n')
  return `现场：\n${input.sceneText}\n\n这一拍过去的时间：${elapsed} 分钟（换算成相对说法，不要写出数字时刻）\n\n这一拍的结果：\n${events}`
}

export function createNarrator(llm: Llm): Narrator {
  return {
    async narrate(input) {
      const res = await llm.chat({
        role: 'narration',
        system: NARRATOR_SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(input) }],
      })
      return { text: res.text, absoluteTime: findAbsoluteTime(res.text) }
    },
  }
}

/** 离线桩：与真调用走同一条路径，脚本即模型原文（命中项照样只报告不删改）。 */
export function createStubNarrator(script: string[]): Narrator {
  return createNarrator(createFauxLlm(script))
}
