/**
 * antd 主题唯一入口：颜色只在这里定（浅 `defaultAlgorithm` / 深 `darkAlgorithm`，不写自定义 seed）。
 * 层叠、cssinjs 实例、`cssVar.key` 与 `<html class>` 同步三条约束的理由见 `docs/ui/DESIGN.md` §0。
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
