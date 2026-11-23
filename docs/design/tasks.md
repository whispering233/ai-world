# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

串行顺序：**B1 → B2 → B3 → B4 → B5**。B1 与 B2 可以并行（玩家壳与作者壳文件不重叠），但两者都要改 `tokens.css` 之外的同一个 `AntdProvider`，故实际按串行推进；B5 只改排版变量，必须等 B1/B2 的截图出来再开。

### B1 玩家壳换 chrome

**目标**：玩家壳 6 个件换成 antd / `@ant-design/x`；**不改 `passage` 语义、不改 `ReadingStream` 结构**（对话气泡是另一张卡）。

| 现有件 | 换成 |
| :--- | :--- |
| `TopBar` | `Button` + `Dropdown`/`Menu` + `Divider` |
| `Composer` | x `Sender` |
| `StateDrawer` | `Drawer` + `Descriptions` + `Table` |
| `EmptyState` | `Empty` |
| `ErrorNotice` | `Alert`（`refused`/`fallback`/`missing` 三档文案不动） |
| `BeatDivider` | `Divider` |

配套（不做就会出现「暖纸底 + 冷白控件」）：

- `index.html` 的 `<html>` 加 cssVar 作用域类（antd v6 不把 `--ant-*` 注入 `:root`；缺这个类，`@theme` 里的映射全是空值）。
- 生产版 `AntdProvider`（只保留路线 a，去掉 `route` 参数）挂进 `main.tsx`；深色仍按 `prefers-color-scheme`。
- `tokens.css` 的 7 个颜色变量改指 `--ant-*`：`paper`→`colorBgLayout`、`paper-2`→`colorBgContainer`、`ink`→`colorText`、`ink-soft`→`colorTextSecondary`、`rule`→`colorBorderSecondary`、`accent`→`colorPrimary`、`danger`→`colorError`；**不重命名**那 118 处 class。
- 字号取 antd 默认（正文 14px / 1.5715），衬线退役；排版参数见 B5。

已知坑（B0 实测）：`Sender` 没有 `disabled`，流式期间只给 `loading` 并拦发送；antd `Drawer` 自带滚动锁与焦点管理，`body:has(dialog[open])` 对它无效；x 的样式在 `@layer antdx`，层序不能漏。

**验收**（真浏览器，条目上限 6）：发送即回显 + 计时 + 停止；流式中不能重复发送；抽屉打开 / `Esc` 关闭 / 背后的按钮可点；三种 `ErrorNotice` 的文案；分拍分隔条；深色一轮 + 控制台无 error（favicon 404 不计）。

### B5 排版参数

正文现在跟随 antd 默认 14px / 1.5715。这张卡只调排版变量（正文档位、行长、段间距、标题档），不改组件、不改色板。开卡前先看 B1/B2 的实际截图。
