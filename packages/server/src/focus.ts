/**
 * 没点目标时的名字自动聚焦（docs/design/00-master-design.md 决策 #48）。
 *
 * 只做一件事：在玩家原话里找**本场人物的显示名或别名整串**，命中恰好一个人时把他当目标。
 * 不解析动作、不分词、不猜代词：没有唯一命中就交回"所有人"，与没这层推断时完全一样。
 *
 * 已知启发式风险：单字显示名（安/门/灯）会撞上文本里的同一个字，例如"稍微安心"命中的是"安"。
 * 本轮接受这个误命中率；真要收紧得做分词或让作者给长别名。
 */
import type { EntId } from '@ai-world/core'

export interface FocusInput {
  /** 截断后的玩家原话 */
  text: string
  /** 候选实体：调用方已过滤成本场非玩家人物 */
  people: readonly EntId[]
  names: Record<EntId, string>
  aliases?: Record<EntId, readonly string[]>
}

/** 唯一命中才返回；0 个或多人命中都返回 undefined。 */
export function inferFocus(input: FocusInput): EntId | undefined {
  const hits = new Set<EntId>()
  for (const ent of input.people) {
    const labels = [input.names[ent] ?? '', ...(input.aliases?.[ent] ?? [])].map((label) => label.trim())
    // 空白标签不能算命中：`text.includes('')` 恒真，一个空名字会把所有人都算进来
    if (labels.some((label) => label !== '' && input.text.includes(label))) hits.add(ent)
  }
  if (hits.size !== 1) return undefined
  const [only] = [...hits]
  return only
}