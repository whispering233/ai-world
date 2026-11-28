/**
 * 解析模型返回的 JSON。
 *
 * `parseJsonWithRepair` 只修字符串里的控制字符与坏转义，**不剥 markdown 围栏、不跳过前后说明文字**。
 * 而模型（尤其被要求"只输出 JSON"时）极爱写成「好的，这是结果：\n```json\n{...}\n```」。
 * 所以这里先取出第一个平衡的 `{...}`，再交给 repair 补尾。
 */
import { parseJsonWithRepair, parseStreamingJson } from '@earendil-works/pi-ai'

/** 模型约定的输出是一个对象；字段名由各调用点的解析函数负责收窄。 */
export interface ModelJsonObject {
  [key: string]: unknown
}

export function parseModelJson(text: string): ModelJsonObject {
  const body = extractObject(text)
  if (body === undefined) throw new Error('模型的输出里没有 JSON 对象')
  let value: unknown
  try {
    // 先补坏转义与裸控制字符
    value = parseJsonWithRepair(body)
  } catch {
    // 还被截断（max_tokens 用完）时，用 partial 解析把已说完的部分救回来
    value = parseStreamingJson(body)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('模型的 JSON 不是一个对象')
  }
  return value as ModelJsonObject
}

/**
 * 同 `parseModelJson`，但解析不出来返回 `undefined` 而不抛。
 *
 * 降级语义留在调用点：认知把整段当 outward、提示返回 `[]`、裁判走
 * “无事发生 + notes”，三者不是同一个兜底，不能在这里统一。
 */
export function tryParseModelJson(text: string): ModelJsonObject | undefined {
  try {
    return parseModelJson(text)
  } catch {
    return undefined
  }
}

/** 从头扫到括号配平为止；字符串里的括号不算。找不到左括号返回 undefined，截断时返回剩余部分交给 repair。 */
function extractObject(text: string): string | undefined {
  const start = text.indexOf('{')
  if (start < 0) return undefined

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text.charAt(i)
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}
