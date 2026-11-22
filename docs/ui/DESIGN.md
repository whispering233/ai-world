# 玩家阅读面设计契约（v1）

> 本文只描述玩家侧阅读面的布局、排版与交互契约，不描述实现代码。作者/调试模式（三栏）在 [backlog.md](../design/backlog.md) 里。

## 1. 定位

- 玩家是**读者**，不是操作台用户。
- 主内容是一拍一拍生长的散文；账本只用于验证，不做常驻仪表盘。
- 界面不解释引擎：不出现 claim / verdict / tier / token / 成本 / 阶段名。

## 2. 布局定稿

**单栏阅读面 + 顶部细栏 + 底部输入 + 按需右抽屉。**

```text
┌────────────────────────────────────────────────────┐
│  酒馆 · 第 3 天 · 夜              [此刻]  [⋯]      │ 48px
├────────────────────────────────────────────────────┤
│                                                    │
│        你：我推门进去，找了个靠门的位子坐下。       │
│                                                    │
│        雨顺着门缝往里渗。安没有抬头，先把杯子       │
│        收走，才开口。她的声音不高，尾音很短，       │
│        像在报账。                                   │
│        ……                                          │
│                                                    │
│        ── 第 4 天 · 拂晓 ──                        │
│        ……                                          │
│                                                    │
├────────────────────────────────────────────────────┤
│  [ 说点什么…                                  ]    │
│  Enter 发送 · Shift+Enter 换行          [停止]     │
└────────────────────────────────────────────────────┘
```

- **没有左栏**：世界 / 存档 / 设置收进右上角菜单。
- **没有常驻右栏**：`此刻` 是抽屉；桌面端覆盖式 360px，不挤压正文、不改变阅读位置；移动端全屏 sheet。
- **正文列 38–42em 居中**：屏幕再宽也不铺满，保持书的行长。

## 3. 区域契约

### TopBar（48px）

- 左：世界名 · `fmt(clock)`。
- 右：`此刻`、菜单（新的一局 / 设置 / 关于）。
- 只放全局信息；逐拍控制留在输入区。

### ReadingStream

- 玩家输入用安静的前缀或引文块，**不用气泡**。
- 叙述是连续散文；段落间距大于行距；不使用聊天头像。
- 时间分隔：`—— 第 4 天 · 拂晓 ——`，只从 `fmt(clock)` 取。
- 滚动：只在用户贴底时跟随；用户上滚即停；新一轮发送时强制回底。
- 不显示 token、成本、模型、阶段名。

### Composer

- 吸底，与正文同宽。
- `Enter` 发送，`Shift+Enter` 换行。
- 等待时禁止重复发送；显示已用时间与 `停止`。
- 发送失败保留原文；发送成功清空。

### StateDrawer「此刻」

只放玩家能验证的东西：

- 你在哪
- 谁在这里（显示名）
- 你身上有什么（显示名 + 数量）
- 你知道什么（只列玩家 `knows`；被推翻的事实标“已被推翻”，不删除）

**不显示**：`heat`、`rel` 数值、`drives`、`beliefs`、`core`、`claims`、`verdicts`、`no_rate`。
v1 只读；打开抽屉不改变阅读位置。

## 4. 等待与失败

- **发送即回显**：玩家那一句立刻进正文（引文块），不等服务端。
- 一拍约 50 秒；结算期间显示“世界在回应… 00:12”，**不显示“认知/裁判/渲染”**，也不显示任何阶段名。
- **旁白不流式**：一次成型后整段进入正文。`runBeat` 在调旁白之前就已落 journal，流出来的文本没有“草稿”身份；假 draft 比等待更糟。
- 两种失败必须分开说：
  - 裁判失败（`error` 帧）：世界没有变。显示“这一拍没有发生”，不留任何正文。
  - 旁白失败（`fallback: true`）：世界**已经**变了。显示事实摘要兜底正文，并标一句“这一拍的叙述没有生成”。
- `停止` = 断开连接；服务端中止在途调用，提交前的拍不落账。提交后断开时服务端仍把旁白写完，重连由 `GET /api/session` 补齐。
- `prefers-reduced-motion` 时去掉光标闪烁与渐显。

## 5. 视觉方向

- **书页，不是仪表盘，也不是聊天软件。**
- 暖纸 / 暖黑；墨色文字；1px hairline 分栏；零阴影、无渐变、无 AI 紫。
- 正文衬线系统栈，chrome 无衬线；**不下载 web 字体**（离线可用）。
- 正文 18–20px / 行高 1.9；meta 13px；标题 22–24px；最多四档。
- 暗色不用纯黑；正文对比度不低于 4.5:1。
- 颜色、字号、间距最终收敛到单一 tokens 文件（实现阶段）。

## 6. 组件切分

`TopBar` · `ReadingStream` · `PlayerLine` · `BeatDivider` · `Composer` · `StateDrawer` · `EmptyState` · `ErrorNotice`

不引入 `Bubble` / `Conversations` / `ThoughtChain` 这类聊天语义组件。

## 7. 响应式

| 视口 | 正文列 | 抽屉 |
| :--- | :--- | :--- |
| ≥1280px | 42rem 居中 | 360px 覆盖式 |
| 1024–1280px | 38rem 居中 | 360px 覆盖式 |
| <1024px | 全宽，左右 24px | 全屏 sheet |

## 8. 无障碍

- 流式文本用 `aria-live="polite"`。
- 焦点可见；`Esc` 关闭抽屉；`Enter` 发送、`Shift+Enter` 换行。
- `停止` 可键盘触达，有明确可读名称。
- 所有正文与控件满足 4.5:1 对比度。

## 9. 明确不做

- 地图、人物立绘、语音、复杂动画
- 存档槽 / 多世界切换
- 聊天式气泡、角色头像、消息列表
- 前端直连模型（key 不进浏览器）
- 组件库 / 图标库 / 状态库 / 路由库（见 §13）

## 10. 开工前置

已满足：玩家可读名称（`ContentPack.names/items`）、旁白失败 fallback、持久化/恢复（journal 重放）。

仍未满足：世界层三项缺陷（物质流薄 / 知识通胀 / 时间钉死）。它不阻塞阅读面，但会让前三拍读起来“什么也没发生”——那是世界层的问题，不要在 UI 里遮掩。

## 11. 两种壳

- 一个 SPA、一个进程。玩家壳（默认）与作者壳共用同一份阅读流与同一份状态。
- 切换：TopBar `⋯` 菜单「作者视图」，或 `Ctrl/Cmd+Shift+D`；`mode` 与滚动位置记 localStorage。
- 切换**不重置**任何东西：同一 `clock`、同一批 passages、同一滚动位置，只换外壳。
- 作者数据只在切到作者壳时请求；玩家壳不请求 `/api/author/*`。
- 隔离靠三层，不靠开关：玩家投影纯函数（`view.test.ts`）、玩家壳源码扫描（`discipline.test.ts`）、作者数据懒取。

## 12. 作者模式（三栏）

```text
┌──────────┬───────────────────────────┬──────────────────┐
│ 拍列表   │      同一份阅读流          │   本拍详情        │
│ 240px    │      38–42em               │   420px          │
│          │                           │                  │
│ #7 夜    │  你：我把银元塞进安手里    │  claims          │
│ #6 夜    │  安把银元按在掌心里…       │  verdicts        │
│ #5 傍晚  │                           │  deltas          │
│ …        │  ── 第 2 天 · 夜 ──        │  被拒理由        │
│          │  …                        │  模型 / token    │
└──────────┴───────────────────────────┴──────────────────┘
```

- 拍列表：只显示 `clockText` 与首句摘要；点击定位到该拍，不改阅读流内容。
- 本拍详情：`claims` / `verdicts`（`ok`、`reason`、`deltas`、`duration`）/ `notes` / `telemetry`；再往下是 `Collapsible` 的「账本原始」与「prompt」。
- 顶部条：内容状态（`activeHash === diskHash` 与否）、累计 cost、降级 notes 计数。
- 「内容」面板：`core` / `voice` / `drives` / `beliefs` / `canon` 表单 + 只读 JSON 块（世界结构）；显式「保存」→ 三选一弹窗。
- 三栏固定宽度，不做拖拽分隔条。

## 13. tokens 与组件

单一 tokens 文件 `packages/web/src/tokens.css`（Tailwind 4 `@theme`）。暗色靠 `<html data-theme="dark">` 覆盖同名变量，组件不写颜色字面量。

| 层 | 内容 |
| :--- | :--- |
| 基础件（11） | `Button` `Field` `TextField` `NumberField` `Collapsible` `Dialog` `Banner` `KeyValueList` `EditableList` `DataTable` `ModeSwitch` |
| 玩家壳（8） | `TopBar` `ReadingStream` `PlayerLine` `BeatDivider` `Composer` `StateDrawer` `EmptyState` `ErrorNotice` |
| 作者壳（7） | `AuthorApp` `BeatList` `BeatDetail` `LedgerView` `HealthPanel` `ContentEditor` `SaveDialog` |

- 不引组件库 / 图标库 / 状态库 / 路由库。折叠 `<details>`、模态 `<dialog showModal>`（外部 inert + top layer 嵌套）、表格 `<table>`、键值 `<dl>`、滑杆 `<input type=range>`。
- 图标用文本字符（`×` `▸` `▾` `↻` `⋯`）。
- 抽屉滚动锁定：`body:has(dialog[open]) { overflow: hidden }`。
- `discipline.test.ts` 断言：玩家壳源码不出现 `claim`/`verdict`/`heat`/`rel`/`token`/`cost`/`no_rate`；玩家壳不 import 作者壳模块；颜色字面量只允许出现在 tokens 文件；字号只用四档。
- `<dialog>` 上不许直接写 `flex`/`block`：Tailwind 的 `.flex` 会压过 UA 的 `dialog:not([open]){display:none}`，抽屉会常开、拦住后面的按钮，而且 `Esc` 后依然显示。用 `hidden` + `open:flex`（特异度 0,2,0 > 0,1,0）。
- UI 改完必须跑一次**浏览器实测**：抽屉常开、`/` 返回 octet-stream、按钮被遮这三类缺陷，`pnpm test` 与 typecheck 全绿时都会漏过去。
