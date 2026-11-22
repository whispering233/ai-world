/**
 * 模型配置：从 JSON 文件读，缺文件就用默认值。
 *
 * 为什么要文件：换通道（订阅 / 直连 / 别家）不该改代码。改代码意味着重新跑测试，
 * 而换通道这种事往往发生在"正在跑验收、对方抖动"的时候。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RetryPolicy } from '@earendil-works/pi-ai'
import type { ModelRole } from './llm.ts'

export interface ModelConfig {
  /** 三个角色只是调用点标签；允许都指向同一个模型 */
  models: Record<ModelRole, string>
  /** opencode 用会话头做路由；前缀 + 随机后缀 */
  sessionIdPrefix?: string
  /** 临时错误的重试策略；缺省 2 次、800ms 起退避 */
  retry?: RetryPolicy
}

/** 最后兜底：连 pi 自己的设置都读不到时用它。正常情况不该走到这里。 */
export const FALLBACK_MODEL = 'opencode-go/deepseek-v4.1-flash'

/**
 * 默认模型 = pi CLI 自己的默认模型。
 *
 * 这是唯一能防住"代码里写死了一个模型、而你的 pi 早就换了"的办法：
 * 优先级 `PI_MODEL` 环境变量 > `settings.json` 的 defaultModel，provider 取 `defaultProvider`。
 */
export function readPiDefaultModel(agentDir: string): string | undefined {
  const envModel = process.env['PI_MODEL']
  try {
    const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8')) as {
      defaultProvider?: unknown
      defaultModel?: unknown
    }
    const provider = typeof settings.defaultProvider === 'string' ? settings.defaultProvider : undefined
    const model =
      envModel ?? (typeof settings.defaultModel === 'string' ? settings.defaultModel : undefined)
    if (provider && model) return `${provider}/${model}`
  } catch {
    // 没有 settings.json 就交给兜底常量
  }
  return undefined
}

export function defaultConfig(base: string = FALLBACK_MODEL): ModelConfig {
  const models: Record<ModelRole, string> = { cognition: base, referee: base, narration: base }
  return { models, sessionIdPrefix: 'play' }
}


const ROLES: ModelRole[] = ['cognition', 'referee', 'narration']

/** 读配置。文件不存在 = 用默认值（不算错误）；文件存在但写坏了 = 抛错，不静默降级。 */
export function loadModelConfig(path: string, base: string = FALLBACK_MODEL): ModelConfig {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return defaultConfig(base)
  }

  const parsed: unknown = JSON.parse(text)
  const raw = asRecord(parsed) ?? {}
  const models = asRecord(raw['models']) ?? {}
  const resolved: Record<ModelRole, string> = { cognition: base, referee: base, narration: base }
  for (const role of ROLES) {
    const value = models[role]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`配置错误：models.${role} 必须是非空字符串（当前 ${JSON.stringify(value)}）`)
    }
    resolved[role] = value.trim()
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
