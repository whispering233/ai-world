# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

串行执行（C5→C2→C3→C4→C1），单 worktree、一卡一 commit。C5 先定类名；C2 必须先于 C4（抢 `Composer` 同一块，且 `WAIT_TEXT` 只有一处使用点）；C1 最后，因为前面四张卡挪过行号。

### C5 - CSS 治理

**目标**：把重复的排版写法收敛成两个语义类，让动画回到层里。

1. `packages/web/src/tokens.css`
   - 新增（`@theme` 之后、`@layer base` 之前）：`@utility meta-line { font-size: var(--text-meta); color: var(--color-ink-soft); }` 与 `@utility dump { font-size: var(--text-meta); overflow-x: auto; white-space: pre-wrap; word-break: break-all; }`。**直接写声明，不要 `@apply text-meta text-ink-soft`**（token 被裁时会静默丢样式）。
   - `.blink` / `.fade-in` / `@keyframes ink-blink` / `@keyframes ink-fade` / `[data-motion="reduced"]` 规则移进 `@layer components`。
   - 删 `:root { color-scheme: light }`（与 UA 默认同值，dark 规则保留）。
2. `className` 里相邻的 `text-meta text-ink-soft`（**53 行 / 11 文件**，`grep -rn` 为准）替换成 `meta-line`；有间距类的保留间距类（如 `mb-2 meta-line`）。
3. `<pre>` 转储 5 处（`author/BeatDetail.tsx` 3、`author/ContentEditor.tsx` 1、`author/LedgerView.tsx` 1）的 `overflow-x-auto whitespace-pre-wrap break-all text-meta` 换成 `dump`；原来带 `text-ink-soft` 的保留颜色。
4. `App.tsx` 根 div 的 `bg-paper text-ink` 删掉（`body` 已设同值）。

**禁止**：改行为/文案；动 `flex`/`gap`/`border` 这类布局工具类；动 antd props。

**验收**：`grep -rn 'text-meta text-ink-soft' packages/web/src` 为 0；`pnpm -C packages/web test`、`pnpm typecheck` 全绿；`pnpm --filter @ai-world/web build` 后 `dist/assets/*.css` 能 grep 到 `.meta-line{` 与 `.dump{`，CSS gzip ≤ 基线 3.42 kB。

**commit**：`refactor(web): fold repeated meta typography into utilities`

### C2 - 目标单选组的无障碍

**事实**：antd `Tag.CheckableTag` 硬编码 `role="checkbox"` + `tabIndex=0`（`node_modules/antd/es/tag/CheckableTag.js`），覆写不掉；现状外层 `role=radio` 套它，实测 6 个 chip 占 12 个 tab 停靠点、方向键无效。

1. `shell/Composer.tsx`
   - 去掉 `Tag.CheckableTag`，用 `<Tag>` 负责外观。每个选项外层 `<span role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}>`；roving：选中项 0、其余 −1；一个都没选中时第一个为 0。
   - `role="radiogroup"` 容器挂**一个** `onKeyDown`：←/↑ 前一项、→/↓ 后一项、Home/End 首尾、Space/Enter 选中；`preventDefault()`，移动后 `focus()` 跟上。
   - `tokens.css` 加 `@utility chip`：`&[aria-checked="true"] { background-color: var(--color-accent); border-color: var(--color-accent); color: var(--ant-color-text-light-solid); }`。**不许写 hex**（`layers.test.ts` 断言 tokens.css 无颜色字面量）。
   - 「等一会儿」：`<Button size="small" title={WAIT_TEXT} aria-label={WAIT_TEXT}>等一会儿</Button>`，文案与 `textContent` 不变。
   - `WAIT_TEXT` 从 `App.tsx` 迁到 `Composer.tsx` 并导出，`App.tsx` 改为 import。
2. `shell/composer.test.ts`：现有 9 条按 `.ant-tag-checkable` / `-checked` 定位的用例改成 `getAllByRole('radio')`；新增 3 条——整组只有 1 个 `tabIndex=0`、按 → 后 `document.activeElement` 是下一个 radio 且 `onTargetChange` 被调用、Space 选中当前项。

**禁止**：改 `to`/`all:true` 语义；加依赖；动 `Prompts`/`Sender` 其它行为。

**验收**：`pnpm -C packages/web test`、`pnpm typecheck` 全绿；真浏览器 1280/390——整组 1 个停靠点、方向键有效、390 仍换行、选中态文字对比度 ≥4.5:1。

**commit**：`fix(web): make the target chooser a real radio group`

### C3 - 抽屉不再切字

1. `shell/StateDrawer.tsx`：`useWide()` 改两档——`(min-width: 1312px)` → `360`，`(min-width: 1200px)` → `320`，否则 `'100%'`；两档都要监听变化。
2. 四段（你在哪 / 谁在这里 / 你身上有什么 / 你知道什么）统一 `<section>` + `<h3 className="mb-2 meta-line">`；前两段用 `<p>` 承载，不再用 `Descriptions`。
3. 焦点陷阱：**先复现**再用真浏览器记录 `document.activeElement`。antd 6 默认 `focusable.trap = mask !== false`（`@rc-component/drawer/es/hooks/useFocusable.js`）。修法按优先级：显式 `focusable={{ trap: true, focusTriggerAfterClose: true }}` → 仍逃逸则记进 `backlog.md` 并在回报里写清楚，**不要**为让测试绿而写假结论。

**禁止**：改正文列宽、改 push 布局、加手动开关、改 `DESIGN` §7 表。

**验收**：1280×900 抽屉 320px 且正文零遮挡；1312 宽 360px；1199 宽全屏；四段都是 h3。

**commit**：`fix(web): size the state drawer so it never covers prose`

### C4 - 状态正确性

1. `main.tsx`：`dark` 从「启动判一次」改成订阅 `prefers-color-scheme`，并在同一处写 `document.documentElement.dataset.theme`（`useSyncExternalStore` 或 effect 二选一，不要两处各写）。不加手动主题开关。
2. `App.tsx` reducer 的 `loaded` 分支清 `error: null`。
3. `author/AuthorApp.tsx`：「累计 cost」→「本次进程 cost」（`shared/src/dto.ts:261` 要求注明）。
4. `Composer.tsx`：`draft.length > 500` 时在提示行显示「已 N 字，发送后会被截到 500 字」（契约见 `docs/api/20-api-beat.md:7`）。不要发明 400 之类的阈值。

**禁止**：加配置项/开关；改 `settled`/`stop` 语义；动主题色板。

**验收**：`pnpm test` + `pnpm typecheck`；真浏览器切换系统深色不重载即生效（`--color-paper` 由 `#f5f5f5` 变 `#000`）。

**commit**：`fix(web): track the system theme and clear stale errors`

### C1 - 注释校准（零行为）

按当前行号重取（前面几张卡挪过行）：

1. `App.tsx` 作者壳懒加载注释：删「带着 Table / Descriptions 这类玩家壳用不到的组件」（`shell/StateDrawer.tsx` 就在用），只留「作者壳只在切过去时下载」。
2. 误引决策 #46 三处（`shell/EmptyState.tsx`、`shell/ReadingStream.tsx`、`shell/reading-stream.test.ts`）→ 改成「首屏示例不绑世界（`AGENTS.md`）」。
3. `author/SaveDialog.tsx`：`docs/api/30-api-author.md §3` → `§4`。
4. `C10`/`C11` 是验证卡号不是决策号，6 处（`Composer.tsx` ×3、`App.tsx`、`api.ts`、`composer.test.ts`）→ 改引决策 `#48`。
5. `tokens.css` 顶部 `w-96` 的例子换成不含已删类名的说法（保留「x 组件的工具类会被静默压掉」这条知识）。
6. `discipline.test.ts` 规则 4 名称与「tokens.css 是颜色的家」→ 改成「玩家壳不写颜色字面量；色板在 antd 主题里，tokens 只做映射」。
7. `shell/column.ts` 注释「1024–1280 36rem」→ 与 `DESIGN` §7 一致（1024–1279）。
8. `author/ContentEditor.tsx`「这是卡内接受的限制」→ 改成不依赖卡片历史的表述。
9. `Composer.tsx` 的 `submitType="enter"` 说明：写明这是 `Sender` 的**默认值**（代码没有显式设置）。
10. 与 `docs/ui/DESIGN.md` §0 逐句重复的长注释（`theme/AntdProvider.tsx`、`theme/layers.test.ts`、`tokens.css` 头、`discipline.test.ts` 头）→ 留一句理由 + 指针；`App.tsx` 的 `1.12 MB` 这类不可复现数字删掉或标「当时」。

**禁止**：改断言逻辑、改行为/文案、顺手重排。

**验收**：`pnpm test` + `pnpm typecheck` 全绿；`git diff` 里除注释外没有改动。

**commit**：`docs(web): correct stale code comments`
