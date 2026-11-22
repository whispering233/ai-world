import type { ReactNode } from 'react'

export interface BannerProps {
  /** alert = 世界没有变；note = 只是少了一句话 */
  tone?: 'alert' | 'note'
  children: ReactNode
  className?: string
}

const TONE_CLASS = {
  alert: 'border-danger text-danger',
  note: 'border-rule text-ink-soft',
} as const

export function Banner({ tone = 'note', children, className = '' }: BannerProps) {
  return (
    <p
      role={tone === 'alert' ? 'alert' : 'status'}
      className={`border-l-2 py-1 pl-3 text-meta ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </p>
  )
}
