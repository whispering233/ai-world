# Changelog
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]
### Added
- `packages/web`：chrome 换成 `antd` 6 + `@ant-design/x` 2（`Alert` `Button` `Modal` `Drawer` `Collapse` `Table` `Descriptions` `Menu` `Dropdown` `Divider` `Empty` `Segmented` + `Sender`），图标走 `@ant-design/icons`；`@ant-design/cssinjs` 钉在 `2.2.0`（与 antd 内部读同一实例，否则 `<StyleProvider layer>` 静默失效）。
- `packages/web/src/theme/AntdProvider.tsx`：色板唯一事实源（浅 `defaultAlgorithm` / 深 `darkAlgorithm`、antd 默认色板、`cssVar.key` = `<html class="ai-world-theme">`），`<StyleProvider layer>` 把 antd 运行时样式放进 `@layer antd`。
- `packages/web/src/theme/layers.test.ts`：层序必须含 `antdx` 且在 `@import "tailwindcss"` 之前；红线是 `Sender` 的工具类漏了会被静默压掉。
- `packages/web/src/shell/composer.test.ts`：`Sender` 的 Enter 发送 / Shift+Enter 换行 / 流式期间不可重复发送。
- 开发者依赖：`jsdom` + `@testing-library/react`（只需 stub `matchMedia` 与 `ResizeObserver`）。
- 作者视图也能发拍：两壳共用同一个 `Composer` 节点（`AuthorApp` 只多一个 `composer: ReactNode`），发送后作者投影跟着 `beats.length` 刷新。

### Changed
- 正文档位 17px / 1.85 / 段间 24px，列宽 40rem（1024–1280 降 36rem）；`passage` 按空行拆成多个 `<p>` 渲染，段落间距才大于行距。暖纸色板与衬线正文退役。
- `tokens.css` 从「唯一改色入口」改成映射层：`--ant-*` → 既有 class 名 + 排版 token（`paper` `paper-2` `ink` `ink-soft` `rule` `accent`）。
- `docs/design/backlog.md` §6：组件迁移之后的两条 UI 待办（对话与场景分层、等待反馈），各自卡在一条没定的语义契约上。

### Fixed
- 折场在服务端是空操作：`runBeat` 现在在同一次结算内装配下一场景并返回，12 拍之后不再每拍重复写 `scene/fold`，场景上下文不再无限增长。
- `scene.tokens` 口径修正为「最长参与者上下文」：原来的本拍增量让 16k 折场永不触发（现在它是保险丝，正常内容仍由 12 拍先折）。
- 一拍总时限 180s：provider 挂死时不再永久占锁，超时按 `E_MODEL_CALL` 降级，世界不动。
- 停止后前端重取 `GET /api/session`（等锁释放再套用），补回已落账但界面未显示的那一拍；迟到的 `passage` 帧不再重复落进正文。
- 玩家壳源码扫描在 Windows 上路径分隔符不归一化，四条隔离守卫一条也没扫到；`composer` 用例补了并行负载下的时间预算。
- antd 6 的三处改名（`Alert.title` / `Drawer.size` / `Divider.orientation`）：写错时界面正常、只有 `console.error`。

### Removed
- `packages/web/src/ui/` 下 10 个手写基础件：`Banner` `Button` `Collapsible` `DataTable` `Dialog` `EditableList` `Field` `KeyValueList` `NumberField` `TextField`（`ModeSwitch` 留作 `Segmented` 的薄壳）。
- `tokens.css` 的 `--color-danger`：换成 antd 按钮之后没有使用点。

## [v0.0.2] - 2026-11-22
### Added
- `JournalEntry.committed`（可选）：本拍真正落账的 claim id。`verdicts` 是裁判原话，可能含 `ok` 但整条回滚的条目；这个字段才是“账本真的变了”的名单。
- `packages/web`：玩家阅读面（Vite + React 19 + Tailwind 4，**零组件库/图标库/状态库/路由库**）——`tokens.css` 单一改色入口（七色 + 四档字号 + 两个系统字体栈，暗色靠 `data-theme` 覆盖同名变量）、11 个手写基础件、8 个玩家组件、`api.ts`（SSE 分帧解析 + `fetch` + `AbortSignal`，不用 `EventSource`）。
- `packages/web/src/discipline.test.ts`：源码扫描四条规则（不 import 作者壳 / 只依赖 shared / 不出现引擎标识符 / 颜色只在 tokens.css）**加规则自检**（违规样例必命中、合法样例必不误报）。
- `packages/server`：单进程 Hono 服务端——`GET /api/session`、`POST /api/beat`（SSE：`progress`/`passage`/`state`/`done`/`error`）、`POST /api/reset`、`GET /api/author/{session,beat/:seq}`，静态托管与 SPA fallback；一拍单飞（并发 409），断连三路都接 `AbortController`。
- `packages/server/src/session.ts`：`createSession` 把 boot / 单拍互斥 / abort / usage 累计 / prompt 环形缓冲收在一个不依赖 HTTP 的内核里，路由只是薄适配。
- `JournalEntry.telemetry`（可选）：每拍的模型串与用量，由服务端注入；`replay` 不读它。
- `PassageEntry.beatSeq`（可选）：连接玩家原话与旁白的稳定键；旧日志按 `clock` 回退。
- `ChatResult.cost` / `ChatResult.retries`：把 pi-ai 报回的金额与重试次数透出来，作者模式要显示。
- `content/starter-town.json`：世界内容从 TS 代码变成 git 跟踪的 JSON 数据包（含新增 `title`）；`packages/content` 提供 `loadContentPack` / `contentHash` / `STARTER_TOWN_PATH`，运行时字段由 `seedCharacters()` 补空。
- `packages/core/src/view.ts`：`playerView` / `authorView` / `beatViews` 三个只读投影，玩家侧输出显示名与可验证状态，作者侧保留原值与全量 journal。
- `packages/core/src/health.ts`：`healthView` 把体检口径抽成纯函数，作者投影与 CLI 试玩器共用。
- `packages/shared/src/dto.ts`：玩家/作者投影与 SSE 帧的线上类型（零 import，浏览器安全）。
- `World.ambient`（可选）：世界常态声明，只读根常量、与 `places` 同性质，不属于事实流；环境类故事事件的前因读它，缺键即不满足。
- `docs/research/storylet-probe.md` §12 §13：v3 10 拍 A/B（两级前因）——世界事件落账 3/3、首条发生在第 1 拍，**净效果 1 个死拍**；同拍与玩家“推门”竞争时裁判判“风胜”，玩家动作被顶掉。
- `tests/storylet-pool.test.ts`：锁住“ambient 与 facts 不许互借”与冷却规则。
- `docs/research/storylet-probe.md` §18 §19：R1 后 3+3 重跑——`no_rate` 21.1%→14.3%、世界事件落账 17%→26%，但空转拍仍在噪声带；逐条核对后修正诊断：多数拒绝有账本依据，瓶颈是骨架与账本状态不相容（“风把闩好的门吹开”），不是裁判拿未落账 claim 当证据。
- `docs/research/storylet-probe.md` §16 §17：两臂各 3 次、每次 10 拍的重复实验——空转拍 base 中位 1 / storylet 中位 2（抽卡无收益），世界事件落账 3/18；否决理由多在引用本拍**未落账**的人物主张（“格蕾妮的拇指正抵在闩销上”），暴露“裁判拿未落账 claim 当证据”；`COOLDOWN_BEATS` 实际与分钟比较，冷却只有 2–3 拍。
- `scripts/storylet-pool.ts`：骨架池（冷却 6 拍、前因只认 `facts`、模板文本）、`pickSkeleton` / `causesFor` 与填肉入口。
- `docs/research/storylet-probe.md` §10 §11：v2 10 拍 A/B（冷却 + 紧前因 + 模板文本）——世界事件落账 2/2、抽卡边际成本 0，但空转拍 2/10 → 3/10：“无因不抽”让抽卡只能事后跟风，填不到最早的静。
- `BeatInput.claimSource`：世界事件作为 claim 第三来源的注入点，只读账本、产出仍由裁判裁决；缺省时一拍只有玩家与人物，抽卡失败只丢世界事件并注 `notes`。
- `docs/research/storylet-probe.md` 增 §7 §8：填肉 3 条（硬检查全过，软规则被破），10 拍 A/B（空转拍 3/10 → 1/9，但 +21% 墙钟、一张牌连抽 6 次、7 条世界事件只落账 1 条）；同一份文档记录“第一版净收益为负”与四个实现级修正点（后经 3 次重复判定为噪声，见 §16）。
- `docs/research/storylet-probe.md`：6 次真实裁决的 storylet 探针（非人 actor 可行，缺前因会被拒，竞争臂世界事件 0/3 落账，裁判自造前提）；`scripts/probe-storylet.ts` 可重跑，`--replay` 不重复调用。
- storylet 定为 claim 第三来源：作者骨架 + 只读条件，抽卡产出世界事件，模型只填文本；不写账本、不做多拍进度。
- `docs/research/fact-structure.md`：6 拍 fact 结构化 smoke（actor/kind 10/10，`facts/beat` 1.67，单样本不作密度结论）。
- `docs/research/cache-prefix.md`：6 拍缓存计量（cognition cacheRead 6144 / referee 4608 / narration 0，cacheWrite 全 0）与“不能归因”的说明。
- `fact` 可选 `actor` / `kind`：`actor` 是动作发出者，`kind` 为 `speech / promise / threat / lie / transaction / identity / state / other`；旧 fact 无字段仍可 replay。
- `journal` 记录每拍新增的 `experience` 与 `driveHits`，`replayCharacters` 能只用 journal 重建人物记忆与热度（不再依赖进程内存）。
- `docs/research/world-baseline.md`：20 拍基线（`fact` 24 条、`facts/beat` 1.20、`fact/claim` 0.27、`know` 2 条、`transfer` 3 / `consume` 0 / `move` 0、无变化拍 5/20、2 次折场），并记录“事实密度未达 ≤1.0”的三类残留。
- `docs/research/multi-agent-architectures.md`：Claude Code Agent Teams / Orca·Herdr / DeepSeek Super-agent / pi 生态的编排架构调研，以及 ai-world 保留裁判作为唯一提交层的理由。
- `scripts/experiment-multi-round.ts`：baseline / self-retry / cross-talk 三臂的一拍内多轮对话实验，输出 journal/passage/metrics/report。
- `docs/research/multi-round-experiment.md`：pilot 6 拍三臂结果（回声率、no_rate、成本、硬冲突）与结论。

### Changed
- 版本号抬到 `0.0.2`：tag、根 `package.json`、本文件的版本段三处一致由 Release 工作流校验，子包 `version` 不参与发布。
- 玩家壳与作者壳同在一个 SPA，纯前端开关切换；两套只读投影（玩家 / 作者）分成两个端点，隔离靠投影纯函数 + 源码扫描，不靠服务端开关。
- 世界内容改为根 `content/<world>.json`（git 跟踪）；作者视图可编辑 `core` / `voice` / `drives` / `beliefs` / `canon`，保存只写盘，新局才生效。
- 生产态改为单进程：`pnpm serve` 同时给 API 与 `packages/web/dist`；开发态拆成 `dev:server` + `dev:web`（Vite 热更新，`/api` 反代）。
- `docs/design/tasks.md` 只保留未完成任务卡：设计口径按主题进设计文档，下一步候选进 `backlog.md` §5。
- 仓库改为 pnpm workspace：`packages/{shared,core,content}`，包入口是 `.ts` 源码（`exports` 指向 `src/index.ts`，无构建步骤）；`npm install` / `npm test` 等命令换成 `pnpm`，锁文件由 `package-lock.json` 换成 `pnpm-lock.yaml`。
- `AGENTS.md` 结构一节改为按包描述依赖方向（`shared ← core ← content ← server ← web`），并写明包入口策略。
- `docs/design/build.md`：CI 改为 `pnpm install --frozen-lockfile`；抬版本改为只改根 `package.json`。
- `AGENTS.md`：第 4 条补“空 `deltas` 不是状态”，新增第 9 条“`phys` 键要能写出解除者”；结构一节注明 `claimSource` 是唯一世界事件注入点。
- `README.md`：用例数与每拍/20 拍时间口径按实测更新，补实验脚本入口。
- `docs/design/backlog.md` §4：标注 20 拍基线在 R1 之后已过期，重跑前不作判据。
- `docs/db/schema.md` §9：`phys` 键登记表（键 / 语义 / 值域 / 挂载 / **解除方式**）与命名原则；`phys` 键保持开放、不冻结，但每个键必须能写出解除方式。
- 裁判规则 9b：`ok` + 空 `deltas` 只表示“发生了”，不得作为否决依据；需要持续的事必须落 `phys` 键。
- `scripts/experiment-storylet.ts` 支持 `--run N` 与 `--report`：按同条件重复出分布（各 run 值 + 中位 + 范围），不再看单点；避让已回退（`avoidKeys` 删除）。
- `describeLedger` 导出，供探针拼出与 `runBeat` 同构的裁判上下文；行为不变。
- 世界事件的前因只从 `facts` 读：没有已确认的前因就不抽；关键词命中不算前因（A/B 里“账本”把“地窖”抽了出来，六次全被拒）。
- 裁判的 `fact` 输出增加 `actor`/`kind` 填法；`describeFacts` 先按 `fact.actor` 是否在场加权，再回退文本匹配；试玩体检表增加 fact 结构化覆盖率。
- `cognition` 的 system 前缀按稳定度重排（core/voice → 输出指令 → canon → drives/beliefs/记忆），并把 provider 的 `cacheRead`/`cacheWrite` 接入 `ChatResult`、`UsageSample` 与试玩体检表。
- 试玩器默认续跑：有 journal 就重放世界与人物记忆，`--fresh` 显式重开一局。
- `fact` 语义收窄：只记会改变后续判断的事件（承诺、威胁、谎言、公开宣告、交易完成、身份揭示、状态改变），账本已记过的状态不再复述；`facts/beat` 从 4.45 降到 1.10–1.20（目标 ≤1.0，未达标）。体检表增加 `facts/beat` 与「无变化拍」。
- `ContentPack.aliases`：额外检索词，只用于事实切片匹配（裁判把玩家写成“玩家”，而显示名是“你”）。
- 知识写入收窄：普通对话不再逐句 `know`；`know` 只用于听众原本不知道且以后会用的信息（秘密、计划、债务、身份、跨场景承诺），在场者的即时记忆交给 `observations`。体检表增加 `know/claim` 与平均听众数。
- 秘密探针改为耳语，并要求 `know.who` 只列确实听见的人。
- 写操作语义清理：`give` → `transfer`（任何持有变化，含抢夺/没收），`take` → `consume`（物品离开世界）；旧 journal 的 `give`/`take` 只作 replay 别名。
- 试玩体检表增加写操作分布、`know_rate`、duration 分桶、名字泄漏、每拍墙钟、物质 op 按 actor 拆分、净持有变化与回滚原因；`--auto` 探针混入短对话/物理/长动作/知识交换/消耗，长动作只跑一次，移动探针放末拍。
- 裁判增加 `duration` 与当前 `clock` 的语义澄清：长动作按实际耗时推进时间，不因当前 clock 尚早被拒。
- 人物/物品显示名进入 `ContentPack.names/items`；认知 prompt、旁白、试玩场景与体检表统一用名字，不再把 `player/ann/doc` 等 id 写进正文。
- `typecheck` 现在覆盖 `scripts/`（实验脚本不再绕过类型检查）。
- 玩家 UI 布局定稿：单栏阅读面 + 顶部细栏 + 底部输入 + 按需右抽屉；三栏仅作者/调试模式，记入 backlog。
- 架构决策：裁判仍是唯一写入口；per-character agent 与 Super-agent 式中央代理不直接写世界状态，最多作为 claim 来源/导演层。

### Fixed
- 文档校正：`60-server.md` 说 `play.ts` 与 `session.ts` 共用 boot 逻辑（实际是各自持有同一套纯函数）；研究文档里的运行命令统一到 `pnpm`；`docs-map` 与 backlog 的 storylet 结论补到 §18 §19（R1 后重测仍无收益）。
- `/` 与 SPA fallback 返回 `application/octet-stream`，浏览器直接下载而不是渲染：content-type 改为按**实际发出的文件**判定。
- 「此刻」抽屉首屏就常开、`Esc` 关不掉、遮住「停止」与「此刻」按钮：`<dialog>` 不再直接写 `display`，改用 `hidden` + `open:flex`。
- 玩家视图的「谁在这里」把灯、门、地窖门列成人：投影改用人物白名单。
- 重启后作者视图的体检表报 0 次写操作：落账名单改由 `journal.committed` 提供，不再依赖内存集合。
- 作者视图改标题后开新局，顶栏仍显示旧标题：标题改从内容包取。
- `dev:server` / `serve` 漏了 `--network-family-autoselection-attempt-timeout=2000`：Node 默认 250ms 选路上限会掐断到供应商的握手。
- 文档与注释清理：移除过期的计划编号与 `state.json` 存储描述，修正“裁判优先走 tool calling”的注释，并更新 `fact` 结构化后的遗留项说明。
- 未落 journal 的拍（裁判失败 / 无主张）不再推进人物记忆，重启后记忆与 journal 保持一致。
- 事件流排序恢复：`describeFacts` 之前只匹配实体 id，而事实文本是显示名（“安说…”），`提到在场者 +2` 的权重从未命中，切片退化为纯时间倒序。现在按 id / 显示名 / 别名匹配。
- 时钟只按已提交 claim 的 duration 推进；被拒绝或整条回滚的 claim 不再推进世界时间。
- `readPiDefaultModel` 的用例先清掉 `PI_MODEL`：在 pi 会话里跑测试时该环境变量优先级更高，会把用例跑红。
- 折场的“时间跳跃 ≥240 分钟”改用上一拍结束时刻判断，长时间跳跃能真正触发。
- 人物认知现在能看到玩家本拍的输入（此前只有裁判看得到）。
- 旁白抛错或返回空文本时不再丢拍：journal 先落，passage 用事实摘要兜底并标记 `fallback`。
- 裁判上下文的持有物补上 `item(id)` 映射；体检表只统计已提交 claim 的写操作，不再把回滚的 op 算成世界变化。

### Removed
- `packages/content/src/starter-town.ts`：世界内容不再以 TS 代码形式存在，改为根 `content/starter-town.json`；运行时字段（`experience` / `busyUntil`）由 `seedCharacters()` 补空。

## [v0.0.1] - 2026-11-21
### Added
- GitHub Actions CI：push / PR 跑 `npm ci`、`npm run typecheck`、`npm test`。
- GitHub Actions Release：push `vX.Y.Z` tag 时从本文件的对应版本段创建 GitHub Release。
- MIT License。
- 世界账本：5 类状态（所在 / 持有 / 物质键 / 关系 / 知识），7 个写操作，全部纯函数、可重放。
- 事件流：事实只增不改，被推翻的旧事实以 `supersededBy` 保留。
- 唯一写入口：裁判一词一批结算，`verdict:'no'` 为一等公民；同一裁决内的改动事务化，失败整条回滚。
- 单次自由认知：人物无技能表、无工具、无动作词表，一次调用进出，产出 `inner` 与 `outward`。
- 时间模型：单一 `clock` 分钟数，时长归属本拍最长动作；无等距 tick。
- 场景：进入装配、场景内只追加、按地点变化 / 时间跳跃 / 拍数 / 体积折场。
- 内容包：酒馆与街道两个地点，安 / 道森医生 / 科迪 / 格蕾妮四个人物，威士忌、吗啡、私酒、钥匙等地窖与门灯规则。
- 试玩器 `scripts/play.ts`：交互逐拍推进，退出时输出体检表（拍数、折场、no_rate、空结果、长动作、分角色耗时与重试）。
- 测速脚本 `scripts/probe-latency.ts`：对照工具调用与纯文本两种输出通道的耗时与 token。

### Changed
- 模型配置键改为按调用点命名：`cognition` / `referee` / `narration`，替换不可读的 `fast` / `strong` / `mid`。
- 默认模型改为从 pi CLI 自身设置推导，代码内不再写死模型串；换供应商只改配置。
- 事件流喂给裁判的条数由"最后 8 条"改为按在场者与新鲜度择优取 12 条，被推翻的事实不再喂。

### Fixed
- 同一拍内多个人物的认知改为并发发起，一拍总时长下降约 15%。
- 单个人物调用失败降级为"本拍沉默"，不再中断整拍；裁判失败降级为"本拍无进展"，账本不动。
- 同一裁决内的多个写操作改为事务化，避免"钱付了货没到"。
- 裁判输出改为工具调用提交，参数经 schema 校验；模型未调用工具时退回文本 JSON。

### Removed
- 无
