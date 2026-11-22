/** 玩家自己的话：安静的引文块，不做气泡、不做头像。 */
export function PlayerLine({ text }: { text: string }) {
  return (
    <blockquote className="border-l-2 border-rule pl-4 font-serif text-prose leading-prose text-ink-soft">
      {text}
    </blockquote>
  )
}
