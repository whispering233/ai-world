import { Banner } from '../ui/Banner.tsx'

/**
 * 三种失败分开说：世界没变 / 世界变了但没写出来 / 只有叙述没落盘。
 * 文案不出现阶段名，玩家只关心这一拍到底有没有发生。
 */
export type ErrorKind = 'refused' | 'fallback' | 'missing'

const COPY: Record<ErrorKind, { tone: 'alert' | 'note'; text: string }> = {
  refused: { tone: 'alert', text: '这一拍没有发生。' },
  fallback: { tone: 'note', text: '这一拍的叙述没有生成。' },
  missing: { tone: 'note', text: '这一叙述没有保存。' },
}

export function ErrorNotice({ kind }: { kind: ErrorKind }) {
  const copy = COPY[kind]
  return (
    <div className="mt-4">
      <Banner tone={copy.tone}>{copy.text}</Banner>
    </div>
  )
}
