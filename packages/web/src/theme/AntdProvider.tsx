/**
 * antd 主题唯一入口（照 ai-editor 的做法：颜色只在这里定）。
 * 浅色 `defaultAlgorithm` / 深色 `darkAlgorithm`，色板用 antd 默认色板，不写自定义 seed。
 *
 * 深色开关 = URL `?dark=1`（探针页二选一：显式参数便于在真浏览器里一轮跑完，
 * 不读 `prefers-color-scheme`——headless 浏览器改系统偏好要过 devtools 协议）。
 *
 * 三条层叠路线只在这里分叉：
 * - `a`：`<StyleProvider layer>` 把 antd 运行时样式整体包进 `@layer antd`；
 * - `b`：`theme={{ zeroRuntime: true }}`，运行时不再注入样式，改由 `antd/dist/antd.css` 供给
 *   （该文件已由 `route-b.css` 装进 `layer(antd)`）；
 * - `c`：什么都不加，antd 以**无层** `<style>` 注入。
 *
 * `@ant-design/cssinjs` 必须与 antd 的样式钩子读的**同一份实例**，否则 StyleProvider 设的
 * React context 没人读，`layer` 静默失效（实测：装 2.1.2 时只有图标样式进了 `@layer antd`，
 * Button / Table 仍然是运行时注入的无层 CSS）。antd 的 `genStyleUtils` 来自
 * `@ant-design/cssinjs-utils@2.1.2`，它解析到的是 cssinjs **2.2.0**，所以这里直接钉 2.2.0。
 */
import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider, theme } from 'antd'
import type { ReactNode } from 'react'

export type CascadeRoute = 'a' | 'b' | 'c'

export interface AntdProviderProps {
  route: CascadeRoute
  dark: boolean
  children: ReactNode
}

export function AntdProvider({ route, dark, children }: AntdProviderProps) {
  const provider = (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        ...(route === 'b' ? { zeroRuntime: true } : {}),
      }}
    >
      {children}
    </ConfigProvider>
  )

  return route === 'a' ? <StyleProvider layer>{provider}</StyleProvider> : provider
}