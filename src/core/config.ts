/**
 * 模型配置：从 JSON 文件读，缺文件就用默认值。
 *
 * 为什么要文件：换通道（订阅 / 直连 / 别家）不该改代码。改代码意味着重新跑测试，
 * 而换通道这种事往往发生在"正在跑验收、对方抖动"的时候。
 */
import { readFileSync } from 'node:fs'
import type { RetryPolicy } from '@earendil-works/pi-ai'
import type { Tier } from './llm.ts'

export interface ModelConfig {
  /** 三档只是角色标签与成本分桶；允许都指向同一个模型 */
  models: Record<Tier, string>
  /** opencode 用会话头做路由；前缀 + 随机后缀 */
  sessionIdPrefix?: string
  /** 临时错误的重试策略；缺省 2 次、800ms 起退避 */
  retry?: RetryPolicy
}

export const DEFAULT_MODELS: Record<Tier, string> = {
  fast: 'opencode-go/deepseek-v4.1-flash',
  strong: 'opencode-go/deepseek-v4.1-flash',
  mid: 'opencode-go/deepseek-v4.1-flash',
}

export const DEFAULT_CONFIG: ModelConfig = { models: DEFAULT_MODELS, sessionIdPrefix: 'play' }

const TIERS: Tier[] = ['fast', 'strong', 'mid']

/** 读配置。文件不存在 = 用默认值（不算错误）；文件存在但写坏了 = 抛错，不静默降级。 */
export function loadModelConfig(path: string): ModelConfig {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return DEFAULT_CONFIG
  }

  const parsed: unknown = JSON.parse(text)
  const raw = asRecord(parsed) ?? {}
  const models = asRecord(raw['models']) ?? {}
  const resolved = { ...DEFAULT_MODELS }
  for (const tier of TIERS) {
    const value = models[tier]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`配置错误：models.${tier} 必须是非空字符串（当前 ${JSON.stringify(value)}）`)
    }
    resolved[tier] = value.trim()
  }

  const prefix = raw['sessionIdPrefix']
  const retry = asRecord(raw['retry'])
  return {
    models: resolved,
    ...(typeof prefix === 'string' && prefix !== '' ? { sessionIdPrefix: prefix } : { sessionIdPrefix: 'play' }),
    ...(retry ? { retry: readRetry(retry) } : {}),
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readRetry(raw: Record<string, unknown>): RetryPolicy {
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    enabled: raw['enabled'] !== false,
    maxRetries: num(raw['maxRetries'], 2),
    baseDelayMs: num(raw['baseDelayMs'], 800),
  }
}
