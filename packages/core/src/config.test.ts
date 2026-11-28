import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadModelConfig, readPiDefaultModel } from './config.ts'

const dirs: string[] = []

function file(content: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-cfg-'))
  dirs.push(dir)
  const path = join(dir, 'models.json')
  if (content !== null) writeFileSync(path, content)
  return path
}

function settings(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-pi-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(content))
  return dir
}

function emptyDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-pi-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

/**
 * 在 pi 会话里跑测试时 `PI_MODEL` / `PI_PROVIDER` 已设置，且优先级高于 settings.json；
 * 这里临时清掉，避免环境泄漏把用例跑红。
 */
function withoutPiEnv(fn: () => void): void {
  const savedModel = process.env['PI_MODEL']
  const savedProvider = process.env['PI_PROVIDER']
  delete process.env['PI_MODEL']
  delete process.env['PI_PROVIDER']
  try {
    fn()
  } finally {
    if (savedModel !== undefined) process.env['PI_MODEL'] = savedModel
    if (savedProvider !== undefined) process.env['PI_PROVIDER'] = savedProvider
  }
}

describe('loadModelConfig', () => {
  it('文件不存在时四个角色都指向传入的基准模型', () => {
    const cfg = loadModelConfig(file(null), 'opencode-go/deepseek-v4.1-flash')
    expect(cfg.models).toEqual({
      cognition: 'opencode-go/deepseek-v4.1-flash',
      referee: 'opencode-go/deepseek-v4.1-flash',
      narration: 'opencode-go/deepseek-v4.1-flash',
      suggest: 'opencode-go/deepseek-v4.1-flash',
    })
  })

  it('仓库自带的空模板 + 有 pi 默认值：四角色全跟随它', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: {} })), 'pi/base')
    expect(cfg.models.cognition).toBe('pi/base')
    expect(cfg.models.suggest).toBe('pi/base')
  })

  it('空模板且没有 pi 默认值时抛错，不回退内置常量（config.md §1.1）', () => {
    expect(() => loadModelConfig(file(JSON.stringify({ models: {} })))).toThrow(/未找到模型/)
    expect(() => loadModelConfig(file(null))).toThrow(/未找到模型/)
  })

  it('只覆盖写了的角色，其余跟随基准模型', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: { referee: 'deepseek/deepseek-v4-pro' } })), 'pi/base')
    expect(cfg.models.referee).toBe('deepseek/deepseek-v4-pro')
    expect(cfg.models.cognition).toBe('pi/base')
  })

  it('没写 models.suggest 时跟随 cognition（50 §2）', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: { cognition: 'cheap/fast' } })), 'pi/base')
    expect(cfg.models.suggest).toBe('cheap/fast')
  })

  it('显式写了 models.suggest 就用自己的', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: { cognition: 'cheap/fast', suggest: 'other/tiny' } })), 'pi/base')
    expect(cfg.models.suggest).toBe('other/tiny')
    expect(cfg.models.cognition).toBe('cheap/fast')
  })

  it('角色写成空字符串时抛错，不静默降级', () => {
    expect(() => loadModelConfig(file(JSON.stringify({ models: { cognition: '  ' } })))).toThrow(/models\.cognition/)
  })

  it('retry 与 sessionIdPrefix 解析后总有值（DEFAULT_RETRY / DEFAULT_SESSION_PREFIX）', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: {} })), 'pi/base')
    expect(cfg.retry).toEqual({ enabled: true, maxRetries: 2, baseDelayMs: 800 })
    expect(cfg.sessionIdPrefix).toBe('play')
  })

  it('文件里只写要改的 retry 字段，其余落回 DEFAULT_RETRY', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: {}, retry: { maxRetries: 5 } })), 'pi/base')
    expect(cfg.retry).toEqual({ enabled: true, maxRetries: 5, baseDelayMs: 800 })
  })
})

describe('readPiDefaultModel：默认值跟着 pi 走', () => {
  it('从 settings.json 读出 provider/defaultModel', () => {
    withoutPiEnv(() => {
      expect(readPiDefaultModel(settings({ defaultProvider: 'opencode-go', defaultModel: 'v4.1-flash' }))).toBe(
        'opencode-go/v4.1-flash',
      )
    })
  })

  it('没有 settings.json 也没有环境变量时返回 undefined，由调用方兜底', () => {
    withoutPiEnv(() => {
      expect(readPiDefaultModel(emptyDir())).toBeUndefined()
    })
  })

  it('只有环境变量、没有 settings.json 时也能拼出模型串（PI_MODEL 不能因读不到文件被丢掉）', () => {
    withoutPiEnv(() => {
      process.env['PI_MODEL'] = 'deepseek-v4.1-flash'
      process.env['PI_PROVIDER'] = 'opencode-go'
      expect(readPiDefaultModel(emptyDir())).toBe('opencode-go/deepseek-v4.1-flash')
    })
  })

  it('PI_PROVIDER 优先于 settings.json 的 defaultProvider', () => {
    withoutPiEnv(() => {
      process.env['PI_PROVIDER'] = 'env-provider'
      expect(readPiDefaultModel(settings({ defaultProvider: 'file-provider', defaultModel: 'm' }))).toBe(
        'env-provider/m',
      )
    })
  })

  it('PI_MODEL 优先于 settings.json 的 defaultModel', () => {
    withoutPiEnv(() => {
      process.env['PI_MODEL'] = 'env-model'
      expect(readPiDefaultModel(settings({ defaultProvider: 'p', defaultModel: 'file-model' }))).toBe('p/env-model')
    })
  })

  it('只有 PI_MODEL 没有 provider 时返回 undefined（两侧都要有才拼得出串）', () => {
    withoutPiEnv(() => {
      process.env['PI_MODEL'] = 'env-model'
      expect(readPiDefaultModel(emptyDir())).toBeUndefined()
    })
  })
})
