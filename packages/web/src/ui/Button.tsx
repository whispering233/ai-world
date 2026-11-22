import type { ButtonHTMLAttributes } from 'react'

const VARIANT_CLASS = {
  plain: 'border border-rule text-ink hover:bg-paper-2',
  quiet: 'text-ink-soft hover:text-ink',
  danger: 'border border-danger text-danger hover:bg-paper-2',
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASS
}

export function Button({ variant = 'plain', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-sm px-3 py-1 text-meta transition-colors disabled:opacity-40 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    />
  )
}
