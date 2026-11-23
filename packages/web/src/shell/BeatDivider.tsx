import { Divider } from 'antd'

/** 时间分隔条。`clockText` 只来自服务端，界面不自己算时间。 */
export function BeatDivider({ clockText }: { clockText: string }) {
  return (
    <Divider plain className="my-6 text-meta">
      {clockText}
    </Divider>
  )
}
