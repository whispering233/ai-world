/**
 * antd 主题唯一入口：颜色只在这里定。
 * 浅色 `defaultAlgorithm` / 深色 `darkAlgorithm`，色板用 antd 默认色板，不写自定义 seed。
 *
 * 层叠：`<StyleProvider layer>` 把 antd 运行时样式整体包进 `@layer antd`；层序钉在 `tokens.css`
 * 顶部（`theme, base, antd, antdx, components, utilities`，`antdx` 是 `@ant-design/x` 自己的层）。
 * `@ant-design/cssinjs` 必须与 antd 的样式钩子读的**同一份实例**（2.2.0），否则 StyleProvider 设的
 * React context 没人读，`layer` 静默失效：只有图标样式进层，Button / Table 仍是无层 CSS，页面看着正常。
 *
 * `cssVar.key` 必须与 `index.html` 的 `<html class>` 字面量一致：antd 6 不把 `--ant-*` 注入 `:root`，
 * 只给带这个类的元素挂变量。不一致时 `tokens.css` 里那 7 个映射全是空值，表现为「暖纸底 + 冷白控件」。
 */
import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider, theme } from 'antd'
import type { ReactNode } from 'react'

/** 与 `index.html` 里的 `<html class>` 同一个字面量；`theme/layers.test.ts` 守这条一致性。 */
export const THEME_CLASS = 'ai-world-theme'

export interface AntdProviderProps {
  dark: boolean
  children: ReactNode
}

export function AntdProvider({ dark, children }: AntdProviderProps) {
  return (
    <StyleProvider layer>
      <ConfigProvider
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          cssVar: { key: THEME_CLASS },
        }}
      >
        {children}
      </ConfigProvider>
    </StyleProvider>
  )
}
