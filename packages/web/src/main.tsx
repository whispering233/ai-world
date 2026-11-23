import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { AntdProvider } from './theme/AntdProvider.tsx'
import './tokens.css'

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root')

const root = document.documentElement
// 深色只判一次：antd 的算法与 tokens 的 color-scheme 用同一个结果，不装两套
const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
root.dataset.theme = dark ? 'dark' : 'light'
// 去掉光标闪烁与渐显；tokens.css 里按 data-motion 关掉动画
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.motion = 'reduced'

createRoot(container).render(
  <StrictMode>
    <AntdProvider dark={dark}>
      <App />
    </AntdProvider>
  </StrictMode>,
)
