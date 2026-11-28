/**
 * 模型配置：从 JSON 文件读，缺文件就用 pi 自己的默认值。
 *
 * 为什么要文件：换通道（订阅 / 直连 / 别家）不该改代码。改代码意味着重新跑测试，
 * 而换通道这种事往往发生在"正在跑验收、对方抖动"的时候。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RetryPolicy } from '@earendil-works/pi-ai'
import { DEFAULT_RETRY, type ModelRole } from './llm.ts'

export interface ModelConfig {
  /** 四个角色只是调用点标签；允许都指向同一个模型 */
  models: Record<ModelRole, string>
  /** opencode 用会话头做路由；前缀 + 随机后缀。解析后总有值 */
  sessionIdPrefix: string
  /** 临时错误的重试策略。解析后总有值，缺省来自 DEFAULT_RETRY */
  retry: RetryPolicy
}

/** 会话前缀的缺省值；每次运行在它后面追加随机后缀。 */
export const DEFAULT_SESSION_PREFIX = 'play'

/** 模型配置文件的缺省路径，`AI_WORLD_CONFIG` 可覆盖。 */
export const DEFAULT_CONFIG_PATH = 'config/models.json'

const MISSING_MODEL =
  '未找到模型：请在 config/models.json 里写明角色模型，或让 pi 有一个默认模型（settings.json，或 PI_MODEL + PI_PROVIDER）'

/** pi CLI 的状态目录：`settings.json` 与 `auth.json` 都在这里。 */
export function piAgentDir(): string {
  return join(homedir(), '.pi', 'agent')
}

/**
 * 默认模型 = pi CLI 自己的默认模型。
 *
 * model 侧与 provider 侧是**并列的两条链**，不是一个覆盖另一个：
 * model 侧 `PI_MODEL` > settings 的 `defaultModel`；provider 侧 `PI_PROVIDER` > settings 的 `defaultProvider`。
 * `PI_MODEL` 只有裸模型名，所以两侧都取到才拼得出 `provider/modelId`（docs/design/config.md §1.1）。
 */
export function readPiDefaultModel(agentDir: string): string | undefined {
  let settings: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8'))
    settings = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    // 没有 settings.json 就只靠环境变量——不能把已经拿到的 PI_MODEL 一起丢掉
  }
  const pick = (env: string | undefined, key: string): string | undefined => {
    if (env !== undefined && env !== '') return env
    const value = settings[key]
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const provider = pick(process.env['PI_PROVIDER'], 'defaultProvider')
  const model = pick(process.env['PI_MODEL'], 'defaultModel')
  return provider !== undefined && model !== undefined ? `${provider}/${model}` : undefined
}

/**
 * 一个角色最终用哪个模型串。
 *
 * 显式值写坏了（空串、非字符串）**抛错**，不静默降级；没写就跟随 pi 的默认值；
 * 两边都没有就报错退出，不回退任何内置常量（docs/design/config.md §1.1）。
 */
function resolveRole(role: ModelRole, value: unknown, base: string | undefined): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (value !== undefined) {
    throw new Error(`配置错误：models.${role} 必须是非空字符串（当前 ${JSON.stringify(value)}）`)
  }
  if (base === undefined) throw new Error(`配置错误：${role}。${MISSING_MODEL}`)
  return base
}

function build(
  models: Record<string, unknown>,
  base: string | undefined,
  prefix: unknown,
  retry: unknown,
): ModelConfig {
  // 动作提示是旁白之后的一句短输出：没写就跟着 cognition 走，不另立一档（50 §2）
  const suggest = models['suggest'] === undefined ? models['cognition'] : models['suggest']
  return {
    models: {
      cognition: resolveRole('cognition', models['cognition'], base),
      referee: resolveRole('referee', models['referee'], base),
      narration: resolveRole('narration', models['narration'], base),
      suggest: resolveRole('suggest', suggest, base),
    },
    sessionIdPrefix:
      typeof prefix === 'string' && prefix.trim() !== '' ? prefix.trim() : DEFAULT_SESSION_PREFIX,
    retry: readRetry(retry),
  }
}

export function defaultConfig(base?: string): ModelConfig {
  return build({}, base, undefined, undefined)
}

/** 读配置。文件不存在 = 全跟随 pi；文件存在但写坏了 = 抛错，不静默降级。 */
export function loadModelConfig(path: string, base?: string): ModelConfig {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return defaultConfig(base)
  }

  const parsed: unknown = JSON.parse(text)
  const raw = asRecord(parsed) ?? {}
  return build(asRecord(raw['models']) ?? {}, base, raw['sessionIdPrefix'], raw['retry'])
}

/**
 * 唯一取配置入口：自己读 `AI_WORLD_CONFIG`，模型串落到 pi 的默认值上。
 *
 * 调用点不再各拼一遍 `join(homedir(), '.pi', 'agent')` 与配置路径。
 */
export function resolveModelConfig(agentDir: string = piAgentDir()): ModelConfig {
  const path = process.env['AI_WORLD_CONFIG'] ?? DEFAULT_CONFIG_PATH
  return loadModelConfig(path, readPiDefaultModel(agentDir))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** 文件里只写要改的字段；没写的字段落回 DEFAULT_RETRY。 */
function readRetry(raw: unknown): RetryPolicy {
  const record = asRecord(raw) ?? {}
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const enabled = record['enabled']
  return {
    enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_RETRY.enabled,
    maxRetries: num(record['maxRetries'], DEFAULT_RETRY.maxRetries),
    baseDelayMs: num(record['baseDelayMs'], DEFAULT_RETRY.baseDelayMs),
  }
}
