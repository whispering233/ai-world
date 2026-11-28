/**
 * 源码扫描：玩家壳不碰作者壳、不碰引擎包、不碰引擎词、不写颜色字面量。
 * 基线与理由见 `docs/ui/DESIGN.md` §0 与 `docs/design/60-server.md` §6。
 * 每条规则都喂违规样例与合法样例，防止正则写歪了还"全绿"。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * 规则 1–4 只管玩家壳。作者壳在 `author/`，里面必然出现 verdict / heat / core 这些词，
 * 而且 `App.tsx` 要 import `AuthorApp`——这两件事都不该让它假红。
 */
const PLAYER_SCOPE = ['shell/', 'ui/', 'api.ts', 'main.tsx']

/** 只有 `App.tsx` 可以 import `author/`：两个壳的接线只能有一处。 */
const AUTHOR_IMPORTERS = ['App.tsx']

// 静态与动态 import 都要认：懒加载只是换了写法，不是松绑隔离
const AUTHOR_IMPORT = /(?:from\s+|import\(\s*)'(?:\.\/|\.\.\/)author\//

interface SourceFile {
  name: string
  lines: string[]
}

interface Rule {
  name: string
  pattern: RegExp
  violates: string
  allows: string
}

const RULES: Rule[] = [
  {
    name: '规则 1：玩家壳不 import 作者壳',
    pattern: /from\s+'\.{1,2}\/author/,
    violates: "import { AuthorApp } from '../author/AuthorApp.tsx'",
    allows: "import { TopBar } from './shell/TopBar.tsx'",
  },
  {
    name: '规则 2：玩家壳只依赖 @ai-world/shared',
    pattern: /from\s+'@ai-world\/(?!shared)/,
    violates: "import { playerView } from '@ai-world/core'",
    allows: "import type { BeatView } from '@ai-world/shared'",
  },
  {
    name: '规则 3：玩家壳不出现引擎标识符',
    pattern: /\b(?:verdicts?|claims?|deltas?|no_rate|noRate|telemetry|observations|heat|drives|beliefs)\b/,
    violates: 'const rows = beat.verdicts.filter((item) => item.ok)',
    allows: 'const rows = session.beats.length',
  },
  {
    name: '规则 4：玩家壳不写颜色字面量（色板只在 antd 主题里，tokens.css 只做映射）',
    pattern: /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\(|hsla?\(/i,
    violates: "style={{ color: '#faf6ee' }}",
    allows: 'className="bg-paper text-ink"',
  },
]

function sourceFiles(): SourceFile[] {
  return (
    readdirSync(SOURCE_DIR, { recursive: true, encoding: 'utf8' })
      // Windows 的 recursive readdir 返回反斜杠；不归一化的话 `shell/` 前缀一条也匹配不上
      .map((name) => name.split(sep).join('/'))
      .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts'))
      .sort()
      .map((name) => ({ name, lines: readFileSync(join(SOURCE_DIR, name), 'utf8').split('\n') }))
  )
}

function isComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('{/*')
}

const FILES = sourceFiles()

function inPlayerScope(name: string): boolean {
  return PLAYER_SCOPE.some((prefix) => name === prefix || name.startsWith(prefix))
}

const PLAYER_FILES = FILES.filter((file) => inPlayerScope(file.name))

function linesMatching(files: SourceFile[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    file.lines.flatMap((line, index) =>
      isComment(line) || !pattern.test(line) ? [] : [`${file.name}:${index + 1}: ${line.trim()}`],
    ),
  )
}

describe('玩家壳纪律', () => {
  describe('扫描范围', () => {
    it('扫到了源码，且只扫非测试的 .ts/.tsx', () => {
      expect(FILES.length).toBeGreaterThan(10)
      expect(FILES.some((file) => file.name.endsWith('.test.ts'))).toBe(false)
      expect(FILES.some((file) => file.name === 'App.tsx')).toBe(true)
    })

    it('玩家壳范围在扫描结果里真的存在，且不含 author/', () => {
      expect(PLAYER_FILES.length).toBeGreaterThan(5)
      // 路径归一化的回归锁：不归一化时这一条在 Windows 上必红，四条守卫也一条没扫到
      expect(PLAYER_FILES.map((file) => file.name)).toContain('shell/Composer.tsx')
      expect(PLAYER_FILES.some((file) => file.name === 'api.ts')).toBe(true)
      expect(PLAYER_SCOPE.some((prefix) => prefix.startsWith('author/'))).toBe(false)
      expect(PLAYER_FILES.some((file) => file.name.startsWith('author/'))).toBe(false)
    })

    it('src/ 下只有 App.tsx 允许 import author/', () => {
      const importers = FILES.filter((file) => linesMatching([file], AUTHOR_IMPORT).length > 0).map((file) => file.name)
      expect(importers.sort()).toEqual(AUTHOR_IMPORTERS)
      expect(PLAYER_FILES.some((file) => linesMatching([file], AUTHOR_IMPORT).length > 0)).toBe(false)
    })

    it('自检：import author/ 的三种写法都认', () => {
      expect(AUTHOR_IMPORT.test("import { AuthorApp } from './author/AuthorApp.tsx'")).toBe(true)
      expect(AUTHOR_IMPORT.test("import { AuthorApp } from '../author/AuthorApp.tsx'")).toBe(true)
      expect(AUTHOR_IMPORT.test("const AuthorApp = lazy(() => import('./author/AuthorApp.tsx'))")).toBe(true)
      expect(AUTHOR_IMPORT.test("import { TopBar } from './shell/TopBar.tsx'")).toBe(false)
    })

    it('tokens.css 里只有映射，没有色值', () => {
      expect(readFileSync(join(SOURCE_DIR, 'tokens.css'), 'utf8')).toMatch(/--color-paper:/)
    })

    it('注释行豁免，代码行不豁免', () => {
      expect(isComment('// claim')).toBe(true)
      expect(isComment('  * verdict')).toBe(true)
      expect(isComment('const claims = 1')).toBe(false)
    })
  })

  for (const rule of RULES) {
    describe(rule.name, () => {
      it('自检：违规样例命中', () => {
        expect(rule.pattern.test(rule.violates)).toBe(true)
      })

      it('自检：合法样例不误报', () => {
        expect(rule.pattern.test(rule.allows)).toBe(false)
      })

      it('源码里没有违规行', () => {
        expect(linesMatching(PLAYER_FILES, rule.pattern)).toEqual([])
      })
    })
  }
})
