import { Button, Modal } from 'antd'

export interface SaveDialogProps {
  open: boolean
  onClose: () => void
  /** 开新局会清掉本局记录，所以它排在第一个并标「推荐」；后两项都是"本局不变" */
  onNewGame: () => void
}

/** 保存后的三选一（docs/api/30-api-author.md §3）。 */
export function SaveDialog({ open, onClose, onNewGame }: SaveDialogProps) {
  return (
    <Modal open={open} onCancel={onClose} title="内容已保存" footer={null} width={448}>
      <div className="flex flex-col gap-4 pt-2">
        <p className="text-body">新内容只在新局生效：本局的人物 drives 热度与 beliefs 不会被改写。</p>
        <div className="flex flex-col items-start gap-2">
          <Button type="primary" onClick={onNewGame}>
            开新局（推荐）
          </Button>
          <Button onClick={onClose}>只保存，本局不变</Button>
          <Button type="text" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </Modal>
  )
}
