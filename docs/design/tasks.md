# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### B0 组件库基线与样张（探针）

**目标**：把 `antd` 6.7 + `@ant-design/x` 2.10 装进 `@ai-world/web`，选出一条在本项目真实生效的「Tailwind 4 ↔ antd」层叠路线，并留下可复看的一页样张。**不改动任何现有组件**（`shell/`、`author/`、`ui/` 一律不动，`main.tsx` 不动）。

要回答的三件事：

1. **层叠路线**：① 官方 `@layer theme, base, antd, components, utilities` + `<StyleProvider layer>`；② `theme={{ zeroRuntime: true }}` + `@import 'antd/dist/antd.css' layer(antd)`；③ 不排层 + 纪律守卫（ai-editor 现行）。判据：挂在 antd 组件根元素上的 Tailwind 工具类（`w-20`/`mt-2`）是否被无层 CSS 静默压掉；`message`/图标样式是否正常；暗色是否跟着走。
2. **jsdom 可行性**：`@testing-library/react` + `jsdom` 渲染 `Button`/`Table`/`Modal`/`Bubble` 需要哪些 stub（候选 `matchMedia`、`ResizeObserver`），是否值得进 CI。
3. **观感**：`Bubble` 去掉头像与元信息后，与无气泡正文段落并置是否还成立。

**验收**（真浏览器，逐条取证，条目上限 6）：样张页同屏 `Button` / `Sender` / `Bubble`×2 / `Table`(3 行) / `Drawer`；每个控件挂一个 Tailwind 布局类并报告是否生效；深色一轮报告色偏；jsdom stub 清单 + 是否留下的结论。不 bump 版本号、不改 `CHANGELOG.md`；结论回填 `docs/ui/DESIGN.md` §0。

**依赖**：无。B1（玩家壳）依赖本卡结论。
