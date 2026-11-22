/** 时间分隔条。`clockText` 只来自服务端，界面不自己算时间。 */
export function BeatDivider({ clockText }: { clockText: string }) {
  return <p className="py-6 text-center text-meta text-ink-soft">{`—— ${clockText} ——`}</p>
}
