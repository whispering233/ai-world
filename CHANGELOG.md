# Changelog
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]
### Added
- `docs/research/multi-agent-architectures.md`：Claude Code Agent Teams / Orca·Herdr / DeepSeek Super-agent / pi 生态的编排架构调研，以及 ai-world 保留裁判作为唯一提交层的理由。

### Changed
- 玩家 UI 布局定稿：单栏阅读面 + 顶部细栏 + 底部输入 + 按需右抽屉；三栏仅作者/调试模式，记入 backlog。
- 架构决策：裁判仍是唯一写入口；per-character agent 与 Super-agent 式中央代理不直接写世界状态，最多作为 claim 来源/导演层。

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
