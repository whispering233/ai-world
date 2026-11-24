import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from './config.ts'

const dirs: string[] = []

function file(content: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-cfg-'))
  dirs.push(dir)
  const path = join(dir, 'models.json')
  if (content !== null) writeFileSync(path, content)
  return path
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

describe('loadModelConfig', () => {
  it('文件不存在时三个角色都指向传入的基准模型', () => {
    const cfg = loadModelConfig(file(null), 'opencode-go/deepseek-v4.1-flash')
    expect(cfg.models).toEqual({
      cognition: 'opencode-go/deepseek-v4.1-flash',
      referee: 'opencode-go/deepseek-v4.1-flash',
      narration: 'opencode-go/deepseek-v4.1-flash',
    })
  })

  it('不给基准模型时退回常量', () => {
    expect(loadModelConfig(file(null)).models.cognition).toBe(FALLBACK_MODEL)
  })

  it('只覆盖写了的角色，其余跟随基准模型', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: { referee: 'deepseek/deepseek-v4-pro' } })), 'pi/base')
    expect(cfg.models.referee).toBe('deepseek/deepseek-v4-pro')
    expect(cfg.models.cognition).toBe('pi/base')
  })

  it('角色写成空字符串时抛错，不静默降级', () => {
    expect(() => loadModelConfig(file(JSON.stringify({ models: { cognition: '  ' } })))).toThrow(/models\.cognition/)
  })
})

describe('readPiDefaultModel：默认值跟着 pi 走', () => {
  // 在 pi 会话里跑测试时 PI_MODEL 已设置，且优先级高于 settings.json；这里临时清掉，避免环境泄漏把用例跑红。
  const withoutPiModel = (fn: () => void): void => {
    const saved = process.env['PI_MODEL']
    delete process.env['PI_MODEL']
    try {
      fn()
    } finally {
      if (saved !== undefined) process.env['PI_MODEL'] = saved
    }
  }

  it('从 settings.json 读出 provider/defaultModel', () => {
    withoutPiModel(() => {
      const dir = mkdtempSync(join(tmpdir(), 'ai-world-pi-'))
      dirs.push(dir)
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ defaultProvider: 'opencode-go', defaultModel: 'deepseek-v4.1-flash' }))
      expect(readPiDefaultModel(dir)).toBe('opencode-go/deepseek-v4.1-flash')
    })
  })

  it('没有 settings.json 时返回 undefined，由调用方兜底', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-world-pi-'))
    dirs.push(dir)
    expect(readPiDefaultModel(dir)).toBeUndefined()
  })
})
