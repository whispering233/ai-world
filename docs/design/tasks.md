# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W6 服务端 + 阅读面

设计与接口已定稿：[60-server.md](60-server.md)、[api/](../api/00-api-index.md)、[ui/DESIGN.md](../ui/DESIGN.md)。

| 卡 | 内容 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- |
| **W6-3** 玩家壳 | `packages/web/`（`package.json`/`tsconfig.json`/`index.html`/`vite.config.ts`/`main.tsx`/`App.tsx`/`tokens.css`）；11 个基础件；8 个玩家组件；`api.ts` + `api.test.ts`；`discipline.test.ts` | — | `api.test.ts` 覆盖 SSE 分帧 / 半帧 / 多帧粘包 / `[DONE]` 缺失；`discipline.test.ts` 三条断言全绿；`ui-verifier` 跑 6 条路径（空世界 / 发送 / 等待 / 失败 / 抽屉 / 切到作者壳），截图 ≤8 张 |
| **W6-4** 作者壳 | `packages/web/src/author/*`（`AuthorApp`/`BeatList`/`BeatDetail`/`LedgerView`/`HealthPanel`/`ContentEditor`/`SaveDialog`）；`packages/server/src/routes/author.ts`；`POST /api/author/content` | W6-3 | 改 `core` 保存 → 横幅出现 → 开新局 → 桩模型收到的 prompt 里是新 `core`；保存非法内容返回 `E_INVALID_CONTENT` 且文件字节未变；作者端点无任何写 `data/` 的路径 |

## 2. 并行分层

```text
W6-3 → W6-4
```

- 一层内的卡互不重叠，可在各自的临时 worktree 里并行。
- `W6-3` 与 `W6-4` 共用 `packages/web/src/ui/` 与 `tokens.css`：`ui/` 由 `W6-3` 先落，`W6-4` 只增不改。

## 3. 下一批候选（待讨论）

| 候选 | 现在做它的理由 | 先看什么 |
| :--- | :--- | :--- |
| 世界层三项缺陷（物质流 / 知识通胀 / 时间钉死） | 阅读面落地后会在浏览器里直接暴露"读了三拍什么也没发生" | [world-baseline.md](../research/world-baseline.md)、[backlog.md](backlog.md) §4 |
| storylet 骨架与账本状态的相容性（冻结中） | R1 后逐条核对：14 条拒绝里绝大多数有账本依据，瓶颈是骨架没把"闩着/完好/没受力"写进 `when` | [storylet-probe.md](../research/storylet-probe.md) §18 |
| 世界事件与玩家主张的优先级 | 关键词避让已证伪，但"玩家动作被顶掉"仍没有规则 | [storylet-probe.md](../research/storylet-probe.md) §12 §14 |
| `places`/`names` 进作者表单 | 显示名错一个字，正文就会漏 id | [api/30-api-author.md](../api/30-api-author.md) §3 |
| 折场时压 experience | 上下文预算吃紧时 | `recall` 的检索权重 |
| 缓存 A/B | 有 before/after 需求时 | 同条件换前缀顺序各跑 6 拍 |

## 4. 已固化的小约定

- 接口寻址：`clock` / `ledger` / `referee` / `narrate` 四个服务按接口注入，桩实现与真实实现可互换。
- 测试桩优先：任何一端都能被确定性桩替换，测试不联网。
- 人物侧零词表：卡片里出现"动作枚举""技能表""时长表"一律打回。
- 测量先于改世界：先用已提交 op / duration 分桶 / `know_rate` / `facts/beat` / `cacheRead` 定位，再切卡。
- 体检表只统计已提交 claim 的 ops；回滚的 claim 不算世界变化。
- 10 拍单次 A/B 没有分辨率：要测就 3 次以上并报分布。
- `transfer` 是唯一持有变化 op；`consume` 只表示物品离开世界；旧 `give/take` 仅 replay 别名。
- `clock` 只按已提交 claim 的最大 duration 推进；时间跳跃折场用上一拍结束时刻判断。
- `know` 只记听众原本不知道且以后会用的信息；在场记忆交给 `observations`；耳语只发给听见的人。
- 事实切片的"提到在场者"先看 `fact.actor`，再回退 id / 显示名 / 别名文本匹配；别名只用于匹配，不改显示名。
- `fact` 只记会改变后续判断的事件；`journal`/`passage` 才是全量记录。
- `fact` 可选 `actor`/`kind`；旧 fact 没有字段也必须能 replay；kind 未知会被拒，不确定用 `other`。
- `know` 用文本新建 fact 时 `kind:'speech'`，不假装知道说话人。
- 人物的新记忆与 `driveHits` 进 journal；未落 journal 的拍不推进记忆；`replayCharacters` 只用 journal。
- `sessionId` 是 provider 的路由/缓存亲和头，不是消息线程；一次世界运行一个，不按角色拆。
- `cognition` 的 system 顺序：core/voice → 输出指令 → canon → drives/beliefs/记忆。
- 在 pi 会话里跑测试时先清 `PI_MODEL`，避免环境泄漏把 config 用例跑红。
- **服务端单进程持内存世界**；一拍单飞，并发 `/beat` 返回 409，不排队。
- **旁白不流式**：`runBeat` 在调旁白前已落 journal，所谓"草稿"没有可回滚的内容。
- **两种壳纯前端切换**：玩家投影是纯函数，玩家壳源码受纪律扫描；不做服务端开关、不做构建期移除。
- **内容 `content/<world>.json` 只存作者字段**；`experience`/`busyUntil` 由 `seedCharacters()` 补空。
- **内容只在新局生效**；保存后本局用 `activeHash`，`activeHash ≠ diskHash` 时作者壳常驻横幅。
- **prompt 只在内存环形缓冲保留最近 3 拍**，不落盘（体积 + 隐私面）。
- **`telemetry` 是运行观测，不是世界状态**：`replay` 不读它，缺它不影响账本。
- **`PassageEntry.beatSeq` 是玩家原话与旁白的连接键**；旧日志按 `clock` 顺序回退匹配。
- **包入口指 `.ts` 源码**（无构建步骤）；发布时才逐包加 `build` 并把该包 `exports` 切到 `dist`。
- **不引组件库**：原生 `<details>`/`<dialog>`/`<table>`/`<dl>`；图标用文本字符。
- 玩家投影的输入必须显式带 `player`：`at`/`holds`/`knows` 都按它取，不从内容包推；`at[player]` 缺失时退化成空 `place`/空 `here`，不抛错。
- `healthView` 不传 `committed` 时退化为“所有 `ok` 的 verdict”，会把回滚的条目算进写操作；服务端与 `play.ts` 都必须传。
- 世界内容是根 `content/<world>.json`（git 跟踪）；`experience`/`busyUntil` 由 `seedCharacters()` 补空，内容文件里不允许出现。
- 玩家投影的“无 id”由 `view.test.ts` 两条断言守住：递归键集合无引擎词、序列化后不出现任何实体/物品 id。
- 并行卡都往 `packages/core/src/index.ts` 加导出时，**按字母序插入**，否则合并必撞同一行。
- 单拍互斥在**开流之前**判（HTTP 409）；流一开就只能发 `error` 帧。
- `session.beat()` 的 `signal` 不指望 provider 老实看：`withBeatScope` 把每次 `chat()` 与 `signal` 做 `Promise.race`。
- `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 不是可选装饰：pnpm 12 默认发布冷却会让 `--frozen-lockfile` 直接拒掉刚发布的 `hono`。
- `pnpm dev:server` / `serve` 必须带 `--network-family-autoselection-attempt-timeout=2000`，与 `play` 同理。

## 5. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
