import { Empty } from 'antd'

export function EmptyState() {
  return (
    <div className="py-20 text-center">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span className="text-title text-ink">还没有任何一拍。</span>}
      />
      <p className="mt-3 text-meta text-ink-soft">在下面写一句你想说的话，世界会回应。</p>
    </div>
  )
}
