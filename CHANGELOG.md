# Changelog
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]
### Added
- `journal` 记录每拍新增的 `experience` 与 `driveHits`，`replayCharacters` 能只用 journal 重建人物记忆与热度（不再依赖进程内存）。
- `docs/research/world-baseline.md`：20 拍基线（`fact` 24 条、`facts/beat` 1.20、`fact/claim` 0.27、`know` 2 条、`transfer` 3 / `consume` 0 / `move` 0、无变化拍 5/20、2 次折场），并记录“事实密度未达 ≤1.0”的三类残留。
- `docs/research/multi-agent-architectures.md`：Claude Code Agent Teams / Orca·Herdr / DeepSeek Super-agent / pi 生态的编排架构调研，以及 ai-world 保留裁判作为唯一提交层的理由。
- `scripts/experiment-multi-round.ts`：baseline / self-retry / cross-talk 三臂的一拍内多轮对话实验，输出 journal/passage/metrics/report。
- `docs/research/multi-round-experiment.md`：pilot 6 拍三臂结果（回声率、no_rate、成本、硬冲突）与结论。

### Changed
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
- 未落 journal 的拍（裁判失败 / 无主张）不再推进人物记忆，重启后记忆与 journal 保持一致。
- 事件流排序恢复：`describeFacts` 之前只匹配实体 id，而事实文本是显示名（“安说…”），`提到在场者 +2` 的权重从未命中，切片退化为纯时间倒序。现在按 id / 显示名 / 别名匹配。
- 时钟只按已提交 claim 的 duration 推进；被拒绝或整条回滚的 claim 不再推进世界时间。
- `readPiDefaultModel` 的用例先清掉 `PI_MODEL`：在 pi 会话里跑测试时该环境变量优先级更高，会把用例跑红。
- 折场的“时间跳跃 ≥240 分钟”改用上一拍结束时刻判断，长时间跳跃能真正触发。
- 人物认知现在能看到玩家本拍的输入（此前只有裁判看得到）。
- 旁白抛错或返回空文本时不再丢拍：journal 先落，passage 用事实摘要兜底并标记 `fallback`。
- 裁判上下文的持有物补上 `item(id)` 映射；体检表只统计已提交 claim 的写操作，不再把回滚的 op 算成世界变化。

## [v0.0.1] - 2026-11-21
### Note
首个可玩切片：无界面的文字世界，可连续推进 20 拍并输出体检指标；同时落地 CI、Release 与 MIT License。

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
