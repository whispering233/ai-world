# 项目规则

设计文档见 [docs/docs-map.md](docs/docs-map.md)；跑法与配置见 [docs/design/build.md](docs/design/build.md)。本文件只写"做错会返工"的约束。

## 不可违反

1. **只有 referee 能写 `ledger` 与 `facts`**。角色侧类型上拿不到写入口。
2. **不做能力清单**：不给人物 tools / skills / 动作词表 / 动作时长表。人物只输出自然语言。
3. **不做阶段化认知**：不恢复 感知→评价→目标→选择 式的多阶段链路。
4. **文本不是证据**：账本与文本冲突时以账本为准；已经发出的文本永不改写（不 retcon）。**`ok` + 空 `deltas` 也不是状态**：它只表示“发生了”，不得拿来否决另一条改变账本的主张；持续性必须落 `phys` 键。
5. **时间只有一个出口**：`fmt(clock)`。叙事文本禁止写绝对时间。**一拍一个跨度**：`clock` 推进量 = 本拍已提交 claim 的 `max(duration)`；没有等距 tick，也没有 per-entity 的完成时刻——别把 `busyUntil` 那一套重新引进来。
6. **fact 只增不改**：推翻旧事实 = 新增一条 + `supersededBy`。
7. **fact 的结构字段是补充，不是第二个事实源**：`actor` 只能填动作发出者，`kind` 只用规定枚举；旧 fact 没有字段也必须能 replay。
8. **一拍内的改动要么全成、要么全退**：同一裁决里的多条写操作是一个事务。
9. **`phys` 键开放，但每个键要能写出“谁解除”**：新键登记到 `docs/db/schema.md` §9；写不出解除方式的键会永久粘住。

## 结构

- `packages/core/` 纯函数：账本、调度、场景、检索、裁判契约、LLM 适配、投影、体检。全部可替换为确定性桩。
- 四个注入点按**接口**寻址（`referee` / `cognition` / `narrator` / `suggester`）加一个 `store`；`runBeat` 只拿接口，不直接 import 具体实现。`suggester` 可选：不传就跳过提示，也不算降级。
- `BeatInput.claimSource` 是唯一的世界事件注入点（只读账本、产出仍是 claim）；storylet 冻结中，当前**没有生产实现**，只有测试里的内联桩。
- `packages/content/` 只做内容加载与校验；世界内容本体是根 `content/<world>.json`（git 跟踪），不放规则。
- **世界是一局**：`content/<world>.json` 的文件名就是世界 id（`^[a-z0-9-]+$`）；换包只能通过开新局（`POST /api/reset {world}`），每个世界独立 `data/<world>/`。同一时刻内存里只有一个世界，不存在“切了包但保留旧账本”。
- `AI_WORLD` 只决定进程首启默认（缺省 `starter-town`），**不是产品入口**；玩家在「新的一局」里选。客户端传来的 `world` 必须先过白名单（不得直接拼路径）。
- 界面文案与首屏示例不得绑定某个世界的名字/物品（`EmptyState.tsx` 曾写死 starter-town）；`scripts/play.ts --auto` 的脚本按世界分表，没有脚本就直接报错，不许静默复用 starter-town 的输入。
- 唯一能写文件的入口是 `POST /api/author/content`，且只写 `content/`；`data/` 只能由 store 追加。
- 聚焦：显式 `to` 优先；没给 `to` 时按正文里唯一的在场显示名/别名自动推断；显式“所有人”用 `all:true`，与 `to` 互斥。只做名字匹配，不解析动作；单字显示名会误命中。
- 小物（外套/抹布）走 `items`/`holds`；柜台/铁盒/钉子等陈设在 `ledger.at`。同一台面内的坐标不建模，换面才用 `transfer`。
- 依赖方向单向：`shared ← core ← content ← server ← web`；`web` 只依赖 `shared`，由 pnpm 严格 node_modules 强制，不靠自觉。
- 包入口是 `.ts` 源码（`exports` 指向 `src/index.ts`，无构建步骤）；发布时才逐包加 `build` 并把该包切到 `dist`。
- `scripts/` 放可丢弃的驱动脚本：试玩器、测速。它们不进任何包。
- 用 `.ts` 后缀导入；ESM；`strict` + `noUncheckedIndexedAccess`。

## 失败与降级

- 人物调用失败 → 该人物**本拍沉默**，其余人照常结算；不得因此丢掉整拍。
- 裁判调用失败 → 本拍**无进展**，账本不动、不落 journal；宁可空转也不编造未结算的世界。
- 降级必须留下 `notes`，不许静默吞掉。

## 模型与凭据

- 模型串**不写进代码**：要么 `config/models.json` 显式覆盖，要么跟随 pi 的默认（provider 取 `PI_PROVIDER` > `settings.json` 的 `defaultProvider`，model 取 `PI_MODEL` > `defaultModel`）。两条链都取不到就启动报错退出，不回退内置常量；仓库自带的 `config/models.json` 是空模板。
- 凭据只读 `~/.pi/agent/auth.json`，不另存 key、不改写 pi 的登录状态。
- `sessionId` 是 provider 的路由/缓存亲和头，不是消息线程；一次世界运行只用一个，不按角色拆。
- 启动时打印实际使用的模型串；调错模型必须当场可见。

## UI 与组件

- **chrome 只有一套**：`antd` 6 + `@ant-design/x` 2。不写第二套自绘基础件；确实缺的薄包装放调用点文件内，不进 `src/ui/`。
- `tokens.css` 的排层语句必须在 `@import "tailwindcss"` 之前，层序必须含 `antdx`（`@ant-design/x` 自己的层）。漏写时 `Sender` 的工具类被静默压掉，页面看着正常、类型检查也绿。
- `<html class="ai-world-theme">` 与 `AntdProvider` 的 `cssVar.key` 必须同字面量：antd 6 不把 `--ant-*` 注入 `:root`，不同步会让全站语义色静默变透明。
- `@ant-design/cssinjs` 必须与 antd 内部读的同一实例（当前 2.2.0），否则 `<StyleProvider layer>` 静默失效（只有图标进层）。
- 色值不许进组件：色板只在 `theme/AntdProvider.tsx`（浅 `defaultAlgorithm` / 深 `darkAlgorithm`，不自定 seed），组件里只用 `paper` / `paper-2` / `ink` / `ink-soft` / `rule` / `accent` 这几个映射名。
- 目标单选组（chips）必须区分 `自动` / `所有人` / 在场者：自动才推断，显式所有人发 `all:true`；不要退回“null = 所有人”的旧语义。它是**一组单选按钮**：整组只占一个 Tab 停靠点，←/→/Home/End 移动并同时选中。
- **不要用 `Tag.CheckableTag` 做单选**：它硬编码 `role="checkbox"` 与 `tabIndex=0`（`restProps` 展开在前，覆写不掉），套一层 `role=radio` 的 `span` 会变成 6 颗 chip 占 12 个停靠点。现在是 `<Tag>` 管外观 + 自建 `radiogroup`。
- `meta-line`（次要元信息）与 `dump`（JSON / prompt 转储）是**唯一成套语义排版类**；布局仍旧用工具类拼，不给 `flex gap-2` 起名。
- 动画类（`.blink` / `.fade-in`）必须待在 `@layer components`：层外样式的优先级高于所有 layer，`motion-reduce:` 一类覆盖会被静默压掉。
- `tokens.css` 里**连注释都不能写颜色字面量**（`theme/layers.test.ts` 会红）；要说明比值就只说数字。
- 作者改显示名后的旧称呼 warning 只比较本次表单会话，只提示、不自动改正文；单字名会误报。
- antd 6 改名：`Alert` 用 `title`、`Drawer` 用 `size`、`Divider` 用 `orientation`、`Timeline` 用 `title`/`content`。写错只 `console.error`，界面照常。
- `@ant-design/x` 的 `CodeHighlighter` 会给产物加 **+238 kB gzip**（`react-syntax-highlighter` + `mermaid`）：只用得着它的复制按钮就不值，除非代码只在已懒加载的作者壳里。
- 正文档位（17px / 1.85 / 段距 24px / 列宽 40rem）在 `tokens.css`；jsdom 不算布局也不算层叠，UI 卡必须跑真浏览器。
- 「此刻」抽屉的宽度分档（≥1312 → 360px、1200–1311 → 320px、更窄全屏）是按“不覆盖正文文字区”反推的，不是拍的：文字右缘 = `(视口 + 列宽)/2 − 24`，改分界先重算。
- 系统深浅色：`dataset.theme` 要在**首帧前**先落一次（否则深色系统闪一帧浅色），之后由 effect 跟随 `matchMedia` 的 `change`；两处读同一个 `MQL`，不许各写一套。

## 发布

- 版本号三处一致才能发：tag `vX.Y.Z`、根 `package.json` 的 `version`、`CHANGELOG.md` 的 `## [vX.Y.Z] - 日期`。Release 工作流先校验，不一致直接红。
- 只改根 `package.json`；子包 `version` 不参与发布。
- tag 只从已通过 CI 的 `main` 打；发完补回新的 `## [Unreleased]`。

## 开发顺序

讨论与返工风险 → 更新 `docs/` → 切 `docs/design/tasks.md` 任务卡 → 临时 worktree + 分支执行 → 独立验证 → 清卡 → 合并。

一次只做一张卡；每张卡独立 commit，可单独回滚。测试前清掉 `PI_MODEL`，否则环境变量会覆盖 settings，config 用例会假红。
`docs/design/tasks.md` 只保留未完成卡片：完成后删除卡片，历史在 git/CHANGELOG，不把完成清单堆回临时文件。
测试文件名只用 `.test.ts`：`vitest.config.ts` 的 `include` 不认 `.tsx`，组件测试用 `createElement` 写（`.tsx` 会被静默跳过，看着“全绿”其实一条没跑）。
`scripts/play.ts` 与服务端共用 `data/<world>`，**没有锁**：跑试玩器前先确认服务没在跑，否则两边各自算 seq。

- UI 卡改完必须跑一次**浏览器实测**：类型检查与单测全绿也会漏掉抽屉常开、`/` 返回 octet-stream、按钮被遮这类缺陷。
- 临时 worktree 用完 `git worktree remove --force` 后，Windows 上常留一个被句柄占着的**空目录**：`git worktree prune` + 删分支就算收口，物理目录重启后再删。
- 并行卡都往 `packages/core/src/index.ts` 加导出时**按字母序插入**，否则合并必撞同一行。

## 别做的事

- 不加 ECS、向量库、插件框架、storylet 运行时（已冻结：3 次重复测不出收益，见 `docs/design/backlog.md` 与 `docs/research/storylet-probe.md` §18）。
- 不提前抽公共层：两个调用点之前不抽象。
- 不加没人要的配置项与开关。
- 不在 `docs/` 里保留历史实现记录或任务卡语义。
