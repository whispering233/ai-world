import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'

export interface SaveDialogProps {
  open: boolean
  onClose: () => void
  /** 开新局会清掉本局记录，所以它排在第一个并标「推荐」；后两项都是"本局不变" */
  onNewGame: () => void
}

/** 保存后的三选一（docs/api/30-api-author.md §3）。 */
export function SaveDialog({ open, onClose, onNewGame }: SaveDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="内容已保存">
      <div className="flex w-[28rem] flex-col gap-4 p-4">
        <p className="text-body">新内容只在新局生效：本局的人物 drives 热度与 beliefs 不会被改写。</p>
        <div className="flex flex-col items-start gap-2">
          <Button onClick={onNewGame}>开新局（推荐）</Button>
          <Button variant="quiet" onClick={onClose}>
            只保存，本局不变
          </Button>
          <Button variant="quiet" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
