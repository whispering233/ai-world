import { StrictMode, useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { AntdProvider } from './theme/AntdProvider.tsx'
import './tokens.css'

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root')

const root = document.documentElement
// 去掉光标闪烁与渐显；tokens.css 里按 data-motion 关掉动画。动效偏好只判一次。
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.motion = 'reduced'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/** 订阅系统深浅色：切换时浏览器对 `MediaQueryList` 发 `change`，快照跟着重新读 */
function subscribeDark(onChange: () => void): () => void {
  darkQuery.addEventListener('change', onChange)
  return () => darkQuery.removeEventListener('change', onChange)
}

function darkSnapshot(): boolean {
  return darkQuery.matches
}

/**
 * 深浅色只认系统：antd 的算法与 tokens 的 `color-scheme` 用同一个 `dark`，不装两套。
 * `dataset.theme` 只能在 effect 里写——render 期间不碰 DOM；两处共用这一个 `dark`，
 * 所以切系统主题时 React 重渲染与 `<html data-theme>` 同时变，不会一个深一个浅。
 */
function Shell() {
  const dark = useSyncExternalStore(subscribeDark, darkSnapshot)
  useEffect(() => {
    root.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  return (
    <AntdProvider dark={dark}>
      <App />
    </AntdProvider>
  )
}

createRoot(container).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
