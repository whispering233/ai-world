import type { HealthView } from '@ai-world/shared'
import { Descriptions } from 'antd'

export interface HealthPanelProps {
  health: HealthView
}

const BUCKETS = ['0-3', '4-30', '31-239', '240+'] as const

/** 口径与 `scripts/play.ts` 的体检表一致（共用 `packages/core/src/health.ts`）；每项一行。 */
export function HealthPanel({ health }: HealthPanelProps) {
  const items: { label: string; value: string }[] = [
    { label: '拍数', value: String(health.beats) },
    { label: '折场', value: String(health.folds) },
    { label: '无变化拍', value: String(health.silentBeats) },
    { label: 'no-rate', value: health.noRate.toFixed(2) },
    { label: 'facts/拍', value: health.factsPerBeat.toFixed(2) },
    { label: 'know-rate', value: health.knowRate.toFixed(2) },
    { label: 'claims say/act', value: `${health.claims.say} / ${health.claims.act}` },
    { label: '降级 notes', value: String(health.degraded) },
    ...Object.entries(health.writeOps).map(([op, count]) => ({ label: `写操作 ${op}`, value: String(count) })),
    ...BUCKETS.map((bucket) => ({ label: `时长 ${bucket} 分钟`, value: String(health.durationBuckets[bucket]) })),
  ]
  return (
    <Descriptions
      column={1}
      size="small"
      colon={false}
      className="text-meta"
      items={items.map((item) => ({ key: item.label, label: item.label, children: item.value }))}
    />
  )
}
