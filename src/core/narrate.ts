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
  text: string
  /** 结果的简短描述，如“门被踹开了” / “被拒绝了：门是铸铁焊死的” */
  outcome: string
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
4. 只输出散文本身，不要标题、不要 JSON、不要解释。`

function buildPrompt(input: NarrationInput): string {
  const elapsed = input.clockAfter - input.clockBefore
  const events = input.events.map((e) => `- ${e.actor}：${e.text} → ${e.outcome}`).join('\n')
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
