/**
 * 层叠与 cssVar 作用域的两条回归保护。B0 实测过这两种坏法都**看不出来**：
 * 层序漏写 `antdx` 时 Sender 的宽度被静默压到 `utilities` 之后（1337px vs 384px），
 * `cssVar.key` 与 `<html class>` 不一致时 `--ant-*` 全是空值（暖纸底 + 冷白控件），
 * 类型检查、单测、页面首屏都不报错。只有源码断言拦得住，所以断言写在这里而不是浏览器里。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME_CLASS } from './AntdProvider.tsx'

const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB_DIR = dirname(SRC_DIR)

const TOKENS_CSS = readFileSync(join(SRC_DIR, 'tokens.css'), 'utf8')
const INDEX_HTML = readFileSync(join(WEB_DIR, 'index.html'), 'utf8')

/** 排层语句：顺序即优先级，`antdx` 漏了 x 的样式会跑到 `utilities` 后面。 */
const LAYER_ORDER = /@layer\s+theme\s*,\s*base\s*,\s*antd\s*,\s*antdx\s*,\s*components\s*,\s*utilities\s*;/
const TAILWIND_IMPORT = /@import\s+"tailwindcss"\s*;/

describe('tokens.css 的层序', () => {
  it('排层语句含 antdx，且写在 @import "tailwindcss" 之前', () => {
    const layer = LAYER_ORDER.exec(TOKENS_CSS)
    const tailwind = TAILWIND_IMPORT.exec(TOKENS_CSS)
    expect(layer).not.toBeNull()
    expect(tailwind).not.toBeNull()
    expect(layer!.index).toBeLessThan(tailwind!.index)
  })

  it('自检：漏掉 antdx 或顺序颠倒的写法不通过', () => {
    const missingAntdx = '@layer theme, base, antd, components, utilities;\n@import "tailwindcss";'
    expect(LAYER_ORDER.test(missingAntdx)).toBe(false)
    expect(LAYER_ORDER.test('@import "tailwindcss";\n@layer theme, base, antd, antdx, components, utilities;')).toBe(true)
  })
})

describe('cssVar 作用域', () => {
  it('index.html 的 <html class> 与 AntdProvider 的 cssVar.key 是同一个字面量', () => {
    const htmlClass = /<html\b[^>]*\bclass="([^"]*)"/.exec(INDEX_HTML)
    expect(htmlClass).not.toBeNull()
    expect(htmlClass![1]!.split(/\s+/)).toContain(THEME_CLASS)
  })

  it('tokens.css 把颜色映射到 --ant-*，不留颜色字面量', () => {
    expect(TOKENS_CSS).toContain('--color-paper: var(--ant-color-bg-layout)')
    expect(TOKENS_CSS).not.toMatch(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i)
  })
})
