/**
 * usage 的零值：四角色的空计数器。
 *
 * 零值只在这一处定义——本拍 telemetry、进程累计、试玩器体检表都从这里起。
 * 字段集由 `UsageView`（`@ai-world/shared`）决定，作者壳与玩家壳也读它。
 */
import type { UsageView } from '@ai-world/shared'
import type { ModelRole } from './llm.ts'

function zero(): UsageView {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 0, retries: 0, calls: 0 }
}

/** 四个角色各一个零值计数器。 */
export function zeroUsageByRole(): Record<ModelRole, UsageView> {
  return { cognition: zero(), referee: zero(), narration: zero(), suggest: zero() }
}
