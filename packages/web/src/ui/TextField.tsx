import type { KeyboardEvent } from 'react'

/** 单行与多行共用一套外观；颜色/字号全部来自 tokens。 */
const FIELD_CLASS =
  'w-full rounded-sm border border-rule bg-paper px-3 py-2 text-body text-ink placeholder:text-ink-soft focus-visible:border-accent disabled:opacity-40'

export interface TextFieldProps {
  value: string
  onValueChange: (value: string) => void
  id?: string
  multiline?: boolean
  rows?: number
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void
}

export function TextField({
  value,
  onValueChange,
  id,
  multiline = false,
  rows = 3,
  placeholder,
  disabled = false,
  ariaLabel,
  className = '',
  onKeyDown,
}: TextFieldProps) {
  const shared = {
    id,
    value,
    placeholder,
    disabled,
    'aria-label': ariaLabel,
    className: `${FIELD_CLASS} ${className}`,
  }
  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={rows}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    )
  }
  return (
    <input type="text" {...shared} onChange={(event) => onValueChange(event.target.value)} onKeyDown={onKeyDown} />
  )
}
