# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

串行顺序：**B2 → B3 → B4 → B5**。

### B2 作者壳换 chrome

**目标**：作者壳 7 个件换成 antd；`BeatDetail` 的 `Collapsible`、`LedgerView` 的表格、`ContentEditor` 的文本域优先复用 antd 现成件。**不改作者投影的字段与语义**。

| 现有件 | 换成 |
| :--- | :--- |
| `BeatList` | `List` 或 `Menu`（选中态由 antd 管） |
| `BeatDetail` | `Descriptions` + `Collapse` |
| `LedgerView` | `Table` |
| `HealthPanel` | `Descriptions` + `Statistic` |
| `ContentEditor` | `Input.TextArea`（保留现有的保存/校验交互） |
| `SaveDialog` | `Modal` |
| `ModeSwitch` | `Segmented` |

**验收**（真浏览器，条目上限 6）：三栏布局不塌（拍列表 / 阅读流 / 本拍详情）；点一拍能出详情且不闪上一拍；内容面板能打开、校验失败有报错、保存成功走三选一；`Ctrl/Cmd+Shift+D` 换壳不重置滚动；控制台 0 条 error；深色一轮。

已知坑（B1 实测）：antd v6 的 `Alert` 用 `title` 不是 `message`；`Drawer` 用 `size` 不是 `width`；`Divider` 用 `orientation` 不是 `type`。这三处写错只会 console.error，界面照常。

### B4 作者视图也能输入对话

**目标**：作者壳复用同一份阅读流与同一套发送逻辑，`Composer` 在两种壳里都在。**不改服务端**。

- `AuthorApp` 接收 `draft` / `onDraftChange` / `onSend` / `onStop` / `inFlight` / `elapsedMs`，在阅读流下方渲染同一个 `Composer`。
- 发送后作者投影要跟着刷新（`refresh()`），否则详情停在旧拍。
- 玩家壳的发送逻辑仍只有一处（`App.tsx` 的 `send`）。

**验收**（真浏览器，条目上限 5）：作者壳能发一拍并在阅读流里出现；右侧详情出现新拍；不重复发送；停止可用；换回玩家壳看到同一拍。

### B5 排版参数

**目标**：正文现在跟随 antd 默认 14px / 1.5715，段落间距几乎为零。只调排版变量，不改组件、不改色板。

- 正文档位（字号 / 行高 / 段间距）、行长、标题档。
- 深色下 antd 的 `colorBgLayout` 是纯黑 `#000000`，长文阅读是否可接受一并判断。

**验收**（真浏览器，条目上限 4）：浅色与深色各一张整页读数（字号 / 行高 / 段间距 / 行长 / 对比度）；连续三段的视觉可分性。
