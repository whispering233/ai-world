import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FALLBACK_MODEL, loadModelConfig, readPiDefaultModel } from '../src/core/config.ts'

const dirs: string[] = []

function file(content: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-world-cfg-'))
  dirs.push(dir)
  const path = join(dir, 'models.json')
  if (content !== null) writeFileSync(path, content)
  return path
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('loadModelConfig', () => {
  it('文件不存在时三档都指向传入的基准模型', () => {
    const cfg = loadModelConfig(file(null), 'opencode-go/deepseek-v4.1-flash')
    expect(cfg.models).toEqual({
      fast: 'opencode-go/deepseek-v4.1-flash',
      strong: 'opencode-go/deepseek-v4.1-flash',
      mid: 'opencode-go/deepseek-v4.1-flash',
    })
  })

  it('不给基准模型时退回常量', () => {
    expect(loadModelConfig(file(null)).models.fast).toBe(FALLBACK_MODEL)
  })

  it('只覆盖写了的档位，其余跟随基准模型', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: { strong: 'deepseek/deepseek-v4-pro' } })), 'pi/base')
    expect(cfg.models.strong).toBe('deepseek/deepseek-v4-pro')
    expect(cfg.models.fast).toBe('pi/base')
  })

  it('档位写成空字符串时抛错，不静默降级', () => {
    expect(() => loadModelConfig(file(JSON.stringify({ models: { fast: '  ' } })))).toThrow(/models\.fast/)
  })
})

describe('readPiDefaultModel：默认值跟着 pi 走', () => {
  it('从 settings.json 读出 provider/defaultModel', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-world-pi-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ defaultProvider: 'opencode-go', defaultModel: 'deepseek-v4.1-flash' }))
    expect(readPiDefaultModel(dir)).toBe('opencode-go/deepseek-v4.1-flash')
  })

  it('没有 settings.json 时返回 undefined，由调用方兜底', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-world-pi-'))
    dirs.push(dir)
    expect(readPiDefaultModel(dir)).toBeUndefined()
  })
})
