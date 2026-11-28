/**
 * 玩家自己的话：安静的引文块，不做气泡、不做头像。
 * 有目标时在引文上方标一句“你（对安）”——只显示名，不显示实体 id（ui/DESIGN §3）。
 */
export function PlayerLine({ text, to }: { text: string; to?: string }) {
  return (
    <div>
      {to !== undefined && <p className="mb-1 meta-line">你（对{to}）</p>}
      <blockquote className="border-l-2 border-rule pl-4 text-prose leading-prose text-ink-soft">{text}</blockquote>
    </div>
  )
}