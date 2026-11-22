export interface NumberFieldProps {
  value: number
  onValueChange: (value: number) => void
  id?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}

export function NumberField({ value, onValueChange, id, min, max, step, disabled = false }: NumberFieldProps) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className="w-24 rounded-sm border border-rule bg-paper px-2 py-1 text-body text-ink focus-visible:border-accent disabled:opacity-40"
      onChange={(event) => {
        // 清空输入框时 valueAsNumber 是 NaN，别把它写进上层状态
        if (!Number.isNaN(event.target.valueAsNumber)) onValueChange(event.target.valueAsNumber)
      }}
    />
  )
}
