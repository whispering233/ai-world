# 玩家阅读面设计契约

> 本文只描述玩家侧阅读面的布局、排版与交互契约，不描述实现代码。作者/调试模式（三栏）在 [backlog.md](../design/backlog.md) 里。

## 0. 组件与样式基线

- **chrome 全部用 `antd` 6 + `@ant-design/x` 2**，不自绘基础件；`ui/` 只剩 `ModeSwitch`（`Segmented` 的薄壳）。
- **色板只有一个事实源**：`theme/AntdProvider.tsx` 的 `theme`（浅 `defaultAlgorithm` / 深 `darkAlgorithm`，antd 默认色板）。`tokens.css` 只把 `--ant-*` 映射成既有 class 名，并放排版 token。
- **层叠**：`@layer theme, base, antd, antdx, components, utilities` 必须写在 `@import "tailwindcss"` 之前。`antdx` 是 `@ant-design/x` 自己的层；漏写时 `Sender` 上的工具类被静默压掉（实测 1337px vs 384px），其余控件看不出来。
- **`<html class="ai-world-theme">` 必须与 `AntdProvider` 的 `cssVar.key` 同字面量**：antd 6 把 `--ant-*` 注入组件级 class 作用域、不注入 `:root`，不同步会让全站语义色静默变透明。
- **`@ant-design/cssinjs` 必须与 antd 内部读的同一实例**（当前 2.2.0）：版本错时只有 `.anticon` 进层，Button/Table 仍是运行时无层 CSS，而页面看着正常、类型检查也绿。
- **`zeroRuntime` 路线不可用**：`@ant-design/x` 不发 CSS，预编译产物里没有 x 的样式，Bubble/Sender 会裸奔。
- **`Bubble placement="end"` 在普通块级父容器里不会右对齐**（实测两条气泡 `left` 都是 24px）；用它得自己补布局或改走 `Bubble.List`。
- **jsdom 不算布局也不算层叠**：只需要 stub `matchMedia` 与 `ResizeObserver` 就能渲染，但样式类缺陷只能靠真浏览器。

antd 6 的三处改名：`Alert` 用 `title`、`Drawer` 用 `size`、`Divider` 用 `orientation`。写错只 `console.error`，界面照常。

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
- **输入区上方有一行安静的状态**：`酒馆 · 你身上：威士忌×1`，来自同一份玩家投影；不做常驻仪表盘。
- **选项区固定在输入区上方**：最多 3 条，点一下只填入输入框；自由输入永远是主入口。
- **正文列 38–42em 居中**：屏幕再宽也不铺满，保持书的行长。

## 3. 区域契约

### TopBar（48px）

- 左：世界名 · `fmt(clock)`。
- 右：`此刻`、菜单（新的一局 / 设置 / 关于）。
- 只放全局信息；逐拍控制留在输入区。

### ReadingStream

- 开篇散文（`opening`）在最上方，只读、不随拍增长；缺失时用“时间 · 地点 · 在场 · 你身上有什么”拼场景卡。
- 玩家输入用安静的前缀或引文块，**不用气泡**；有目标时显示“你（对安）”，不显示实体 id。
- 叙述是连续散文；段落间距大于行距；不使用聊天头像。
- 时间分隔：`—— 第 4 天 · 拂晓 ——`，只从 `fmt(clock)` 取。
- 滚动：只在用户贴底时跟随；用户上滚即停；新一轮发送时强制回底。
- 不显示 token、成本、模型、阶段名。

### Composer

- 吸底，与正文同宽。
- 上方一行状态：地点 + 持有（`text-meta text-ink-soft`），不显示 `heat`/`rel`/id。
- 状态行右侧是目标 chips：`所有人` + 在场者显示名；目标不在场时自动回到“所有人”；chip 支持鼠标与 Enter/Space。
- 状态行上方最多 3 条选项（x 的 `Prompts`；`Suggestion` 2.x 是下拉，不是固定列表）；点选只填入 `draft`，不直接发送。
- “等一会儿”始终对所有人，不继承已选中的单人目标。
- `Enter` 发送，`Shift+Enter` 换行；placeholder 是“说点什么，或做什么…”。
- 等待时禁止重复发送；显示已用时间与 `停止`；空闲时提供“等一会儿”按钮（发送预设等待文本，不改 API）。
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
- 一拍约 50–60 秒（真机 20 拍实测均 60.8s）；结算期间显示“世界在回应… 00:12”与玩家那句话下面的三条骨架。裁判返回后换成“这一拍已经定了，正在落笔…”。**不显示“认知/裁判/渲染”等引擎阶段名**；只允许结果状态。
- **旁白不流式**：一次成型后整段进入正文。旁白在写 journal **之前**调用，流出来的 token 没有“已发生”身份；假 draft 比等待更糟。也不做每人物流与裁决层流。
- 两种失败必须分开说：
  - 裁判失败（`error` 帧）：世界没有变。显示“这一拍没有发生”，不留任何正文。
  - 旁白失败（`fallback: true`）：世界**已经**变了。显示事实摘要兜底正文，并标一句“这一拍的叙述没有生成”。
- `停止` = 断开连接；服务端中止在途调用，提交前的拍不落账。提交后断开时服务端仍把旁白写完，重连由 `GET /api/session` 补齐。
- `prefers-reduced-motion` 时去掉光标闪烁与渐显。

## 5. 视觉方向

- **正文是读的，chrome 是用的**：两种尺度共存，不试图把它们合成一种。
- 底色跟随 antd 默认算法：浅色 `#f5f5f5`（`colorBgLayout`）、深色 `#000000`；墨色文字；1px hairline 分栏；零阴影、无渐变。
- 正文无衬线系统栈，17px / 行高 1.85，**不下载 web 字体**（离线可用）；控件与 meta 跟随 antd 默认 14px / 12px。
- 正文对比度：浅色 19.3:1、深色 21:1（均远超 4.5:1）。
- 深色底是纯黑 `#000000`，长文会觉得硬——这是「跟随 antd 默认」的既定取舍；若要改，得同时抬起 `colorBgLayout` 与 `colorBgContainer`，否则正文与气泡落到同一亮度层反而更糊。
- 颜色只在 `theme/AntdProvider.tsx`（不写自定义 seed），组件里只用 `paper` / `paper-2` / `ink` / `ink-soft` / `rule` / `accent` 这 6 个映射名。

## 6. 组件切分

chrome 全部用 antd 6 / `@ant-design/x` 2，见 §13；壳层的自有组件：

`TopBar` · `ReadingStream` · `PlayerLine` · `BeatDivider` · `Composer` · `StateDrawer` · `EmptyState` · `ErrorNotice`

状态行、目标 chips 与选项区都在 `Composer` 内，不新增文件；选项用 x 的 `Prompts`。

对话与旁白目前共用一段正文；把它们拆成「气泡 + 场景块」需要先定说话人契约，见 [backlog.md](../design/backlog.md) §6.1。

## 7. 响应式

| 视口 | 正文列 | 抽屉 |
| :--- | :--- | :--- |
| ≥1280px | 40rem 居中 | 360px 覆盖式 |
| 1024–1280px | 36rem 居中 | 360px 覆盖式 |
| <1024px | 全宽，左右 24px | 全屏 sheet |

## 8. 无障碍

- 流式文本用 `aria-live="polite"`。
- 焦点可见；`Esc` 关闭抽屉；`Enter` 发送、`Shift+Enter` 换行。
- `停止` 可键盘触达，有明确可读名称。
- 所有正文与控件满足 4.5:1 对比度。

## 9. 明确不做

- 地图、人物立绘、语音、复杂动画
- 存档槽 / 多世界切换
- 角色头像、消息列表（对话拆成气泡见 [backlog](../design/backlog.md) §6.1）
- 前端直连模型（key 不进浏览器）
- 状态库 / 路由库（组件与图标已换成 antd，见 §13）

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
│ 240px    │      40rem                │   420px          │
│          │                           │                  │
│ #7 夜    │  你：我把银元塞进安手里    │  claims          │
│ #6 夜    │  安把银元按在掌心里…       │  verdicts        │
│ #5 傍晚  │                           │  deltas          │
│ …        │  ── 第 2 天 · 夜 ──        │  被拒理由        │
│          │  …                        │  模型 / token    │
└──────────┴───────────────────────────┴──────────────────┘
```

- 拍列表：只显示 `clockText` 与首句摘要；点击定位到该拍，不改阅读流内容。
- 本拍详情：`claims` / `verdicts`（`ok`、`reason`、`deltas`、`duration`）/ `notes` / `telemetry`；再往下是 antd `Collapse` 的「账本原始」与「prompt」。
- 顶部条：内容状态（`activeHash === diskHash` 与否）、累计 cost、降级 notes 计数。
- 「内容」面板：`core` / `voice` / `drives` / `beliefs` / `canon` 表单 + 只读 JSON 块（世界结构）；显式「保存」→ 三选一弹窗。
- **作者壳也能发拍**：与玩家壳共用同一个 `Composer` 节点，位置在中栏底部；发送后作者投影按 `beats.length` 重取。
- 三栏固定宽度，不做拖拽分隔条。

## 13. tokens 与组件

单一 tokens 文件 `packages/web/src/tokens.css`（Tailwind 4 `@theme`）。暗色靠 `<html data-theme="dark">` 覆盖同名变量，组件不写颜色字面量。

| 层 | 内容 |
| :--- | :--- |
| chrome | 全部用 antd 6 / `@ant-design/x` 2 组件：`Alert` `Button` `Modal` `Drawer` `Collapse` `Table` `Descriptions` `Dropdown` `Divider` `Empty` `Segmented` `Timeline` `Skeleton`，加 `@ant-design/x` 的 `Sender` `Conversations` `Prompts` |
| `ui/` 下的自有件（1） | `ModeSwitch`（antd `Segmented` 的薄壳，壳切换的两处共用） |
| 玩家壳（8） | `TopBar` `ReadingStream` `PlayerLine` `BeatDivider` `Composer` `StateDrawer` `EmptyState` `ErrorNotice` |
| 作者壳（7） | `AuthorApp` `BeatList` `BeatDetail` `LedgerView` `HealthPanel` `ContentEditor` `SaveDialog` |

- **不留第二套组件**：`ui/` 下不许再长出手写的 `Button` / `Modal` / `Alert` / `Table` / `Collapse` 这一类；要新控件先找 antd。
- 就地的小排版包装只待在用到它的文件里（例如 `ContentEditor.tsx` 的 `LabeledField`），不进 `ui/`。
- 图标走 `@ant-design/icons`，不再用文本字符充当图标。
- 抽屉与模态的滚动锁定由 antd 自己管，`tokens.css` 不写 `body:has(...)` 这类全局选择器。
- `discipline.test.ts` 断言：玩家壳源码不出现 `claim`/`verdict`/`heat`/`rel`/`token`/`cost`/`no_rate`；玩家壳不 import 作者壳模块；玩家壳不出现颜色字面量（色值只允许在 `theme/AntdProvider.tsx`，映射名见 §5）。
- UI 改完必须跑一次**浏览器实测**：抽屉常开、`/` 返回 octet-stream、按钮被遮这三类缺陷，`pnpm test` 与 typecheck 全绿时都会漏过去。
