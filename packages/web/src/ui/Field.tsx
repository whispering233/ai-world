import type { ReactNode } from 'react'

export interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}

export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-meta text-ink-soft">
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="text-meta text-ink-soft">{hint}</p>}
    </div>
  )
}
