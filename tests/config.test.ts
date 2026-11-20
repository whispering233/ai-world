import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_MODELS, loadModelConfig } from '../src/core/config.ts'

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
  it('文件不存在时用默认值', () => {
    expect(loadModelConfig(file(null)).models).toEqual(DEFAULT_MODELS)
  })

  it('只覆盖写了的档位，其余仍是默认值', () => {
    const cfg = loadModelConfig(file(JSON.stringify({ models: { strong: 'deepseek/deepseek-v4-pro' } })))
    expect(cfg.models.strong).toBe('deepseek/deepseek-v4-pro')
    expect(cfg.models.fast).toBe(DEFAULT_MODELS.fast)
  })

  it('档位写成空字符串时抛错，不静默降级', () => {
    expect(() => loadModelConfig(file(JSON.stringify({ models: { fast: '  ' } })))).toThrow(/models\.fast/)
  })
})
