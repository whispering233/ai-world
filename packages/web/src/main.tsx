import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './tokens.css'

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root')

const root = document.documentElement
root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
// 去掉光标闪烁与渐显；tokens.css 里按 data-motion 关掉动画
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.motion = 'reduced'

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
