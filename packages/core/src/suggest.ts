/**
 * 动作提示（见 docs/design/50-llm.md §2、docs/design/tasks.md 的 S1）。
 *
 * 一拍之后给玩家 3 句他现在就能输入的短动作。只读玩家可见的投影（显示名、已知事实）、
 * 本拍玩家自己说的那句与本拍感知摘要：不看裁判意见、不看别人的主张、不看账本 id。
 * 它不改账本、不改正文；失败只丢提示。
 */
import { createFauxLlm, type Llm } from './llm.ts'
import { tryParseModelJson } from './model-json.ts'

/** 一条 hint 的字数上限；按码点算，避免拆坏代理对。 */
export const HINT_MAX = 3
export const HINT_MAX_CHARS = 40

export interface SuggestHolds {
  name: string
  count: number
}

export interface SuggestInput {
  /** 场景的静态描述 */
  sceneText: string
  /** 玩家所在地点的显示名 */
  place: string
  /** 同地点其他在场者的显示名（不含家具） */
  here: readonly string[]
  /** 玩家持有的显示名与数量 */
  holds: readonly SuggestHolds[]
  /** 玩家已知事实的文本，按发生时间升序；调用方只给最近几条 */
  knows: readonly string[]
  /** 玩家本拍的输入原文 */
  playerClaim: string
  /** 本拍裁判给玩家的感知摘要；缺省表示没感知到新东西 */
  observation?: string
}

export interface SuggestResult {
  hints: string[]
  /** 模型有输出但没产出合法提示时的降级原因；调用方负责并进 notes */
  notes?: string[]
}

export interface Suggester {
  suggest(input: SuggestInput): Promise<SuggestResult>
}

export const SUGGEST_SYSTEM = `你是这个世界的动作提示器。你只做一件事：给玩家 3 句他现在就能输入的短动作。

规则：
1. 只输出 JSON：{"hints":["…","…","…"]}。不要代码围栏、不要标题、不要解释。
2. 正好 3 条；每条 6–24 字，最多 40 字；每条都是玩家能直接打在输入框里的一句话。
3. 具体、能推动场景：指向现场已经存在的人、物、柜台、门、账本，不写空泛的类别（“观察”“交谈”“移动”）。
4. 不要重复玩家刚做过的事；不要假设动作会成功（不写“成功了”“拿到了”这类结论）。
5. 不替别人做决定：不写别人会说什么、做什么，只写玩家自己要做的。
6. 不写引擎词（claim / verdict / delta / phys / ledger / token / cost / heat / rel / drives / beliefs），不写任何 id 或编号。`

/** 一条 hint 太长就按码点裁断：宁可半句话，也不让输入框被塞满。 */
function clip(text: string): string {
  const points = Array.from(text)
  return points.length <= HINT_MAX_CHARS ? text : points.slice(0, HINT_MAX_CHARS).join('')
}

/**
 * 解析模型文本里的 hints：非字符串项丢掉，trim、去空、去重、最多 3 条、每条 ≤40 字。
 * 格式坏或没有 hints 时返回空数组——提示失败不该冒到一拍上去。
 */
export function parseHints(text: string): string[] {
  const obj = tryParseModelJson(text)
  if (obj === undefined) return []
  const raw = obj['hints']
  if (!Array.isArray(raw)) return []
  const hints: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const hint = clip(item.trim())
    if (hint === '' || hints.includes(hint)) continue
    hints.push(hint)
    if (hints.length === HINT_MAX) break
  }
  return hints
}

function buildPrompt(input: SuggestInput): string {
  const holds = input.holds.map((item) => `${item.name}×${item.count}`).join('、')
  const knows = input.knows.map((text) => `- ${text}`).join('\n')
  return [
    `现场：\n${input.sceneText}`,
    `地点：${input.place}`,
    `在场：${input.here.length === 0 ? '没有别人' : input.here.join('、')}`,
    `你身上：${holds === '' ? '空手' : holds}`,
    `你已知的事：\n${knows === '' ? '（还什么都不知道）' : knows}`,
    `你刚才说/做：${input.playerClaim === '' ? '（这一拍没说话）' : input.playerClaim}`,
    input.observation === undefined ? '这一拍你没感知到什么新东西。' : `这一拍你感知到的：${input.observation}`,
  ].join('\n\n')
}

export function createSuggester(llm: Llm): Suggester {
  return {
    async suggest(input) {
      const res = await llm.chat({
        role: 'suggest',
        system: SUGGEST_SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(input) }],
      })
      const hints = parseHints(res.text)
      if (hints.length > 0) return { hints }
      const raw = res.text.trim()
      // 空文本与格式不符都是降级，必须留痕（AGENTS：降级不许静默吞掉）
      return { hints, notes: [`动作提示未产出：${raw === '' ? '空文本' : raw.slice(0, 40)}`] }
    },
  }
}

/** 离线桩：与真调用走同一条路径，脚本即模型原文。 */
export function createStubSuggester(script: string[]): Suggester {
  return createSuggester(createFauxLlm(script))
}