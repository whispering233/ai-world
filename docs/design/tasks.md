# 任务卡片（临时）

> 只放**未完成**的卡片。完成的卡片直接删除，不留历史——历史在 `CHANGELOG.md` 与 git 记录里。

## 1. 当前批次：W6 服务端 + 阅读面

设计与接口已定稿：[60-server.md](60-server.md)、[api/](../api/00-api-index.md)、[ui/DESIGN.md](../ui/DESIGN.md)。

| 卡 | 内容 | 依赖 | 验收 |
| :--- | :--- | :--- | :--- |
| **W6-0a** 布局迁移（行为零变化） | `pnpm-workspace.yaml`；`src/core/*` → `packages/core/src/`；`content/starter-town.ts` → `packages/content/src/`；`tests/*` → 各包 `src/*.test.ts`；`scripts/*` 导入改 `@ai-world/*`；5 个 `package.json`（子包统一 `private: true` + `version: "0.0.1"`，版本号单源仍是根包）+ `tsconfig`；删 `package-lock.json` 换 `pnpm-lock.yaml`；`.github/workflows/ci.yml` 换 `pnpm/action-setup` + `pnpm install --frozen-lockfile`；`README.md` 命令与目录树；`AGENTS.md` 的「结构」一节 | — | `pnpm typecheck` 0 错误；`pnpm test` 全绿且**用例数不变**；`pnpm play --beats 1` 跑通；CI 在 PR 上绿 |
| **W6-0b** 内容 JSON 化 | `content/starter-town.json`；`CharacterSeed`（剥 `experience`/`busyUntil`）；`ContentPack.characters: CharacterSeed[]` + `seedCharacters()`；`load.ts`（读 + `validatePack` + 内容哈希）；新增 `title`；`play.ts` 改用加载器 | W6-0a | `load.test.ts` 覆盖：合法包 / core 超长 / canon 超长 / 缺显示名 / 未知地点；`play.ts` 跑 1 拍正文与改动前逐字一致 |
| **W6-1** 服务端 | `packages/server/src/{index,session,llm}.ts` + `routes/{session,beat,reset}.ts`；core 三处可选字段（`BeatInput.telemetry`、`JournalEntry.telemetry`、`PassageEntry.beatSeq`）；SSE 帧 `progress/passage/state/done/error`；单拍互斥；`AbortController` + `Llm` 包装；prompt 环形缓冲（3 拍） | W6-0a | `session.test.ts` 用桩覆盖：并发第二请求 409、abort 不落 journal、reset 后 clock 归零、passage 缺失时 `BeatView.passage` 缺省；`curl /api/session` 返回玩家投影 |
| **W6-2** 两个投影 + 纪律断言 | `packages/shared/src/dto.ts`（纯类型、零 import）；`packages/core/src/view.ts` 的 `playerView` / `authorView`；`view.test.ts` | W6-0a | 玩家投影递归键集合断言：无 id、无 `claim/verdict/delta/heat/rel/drives/beliefs/core/token/cost/no_rate/notes`；作者投影含 journal 全量 |
| **W6-5** 体检表提取 | `packages/core/src/health.ts`（从 `play.ts` 抽出）；`play.ts` 改调用；`health.test.ts` | W6-0a | 用固定 journal fixture 断言 `health.ts` 的每项指标与旧 `play.ts` 口径逐项相等 |
| **W6-3** 玩家壳 | `packages/web/`（`package.json`/`tsconfig.json`/`index.html`/`vite.config.ts`/`main.tsx`/`App.tsx`/`tokens.css`）；11 个基础件；8 个玩家组件；`api.ts` + `api.test.ts`；`discipline.test.ts` | W6-1、W6-2 | `api.test.ts` 覆盖 SSE 分帧 / 半帧 / 多帧粘包 / `[DONE]` 缺失；`discipline.test.ts` 三条断言全绿；`ui-verifier` 跑 6 条路径（空世界 / 发送 / 等待 / 失败 / 抽屉 / 切到作者壳），截图 ≤8 张 |
| **W6-4** 作者壳 | `packages/web/src/author/*`（`AuthorApp`/`BeatList`/`BeatDetail`/`LedgerView`/`HealthPanel`/`ContentEditor`/`SaveDialog`）；`packages/server/src/routes/author.ts`；`POST /api/author/content` | W6-1、W6-2、W6-0b | 改 `core` 保存 → 横幅出现 → 开新局 → 桩模型收到的 prompt 里是新 `core`；保存非法内容返回 `E_INVALID_CONTENT` 且文件字节未变；作者端点无任何写 `data/` 的路径 |

> **W6-0a 的第一个验证点**：`exports: "./src/index.ts"` 能否被 `tsc --noEmit` 与 Node 类型剥离同时解析。Turborepo 把这种包叫 Just-in-Time Package；若 tsc 不认，回退方案是在 `tsconfig.base.json` 加 `paths` 映射（运行时仍靠 pnpm 符号链接）。先验证这一条，再动其余文件。

## 2. 并行分层

```text
W6-0a
  ├─ W6-0b ─┐
  ├─ W6-1  ─┼─ W6-3
  ├─ W6-2  ─┘  W6-4
  └─ W6-5
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

## 5. 执行与验证约定

- 一次只做一张卡；每张卡独立 commit，可单独回滚。
- 按端到端功能垂直切片，切到可单独提交、验证、回滚的粒度。
- 验证交给独立 subAgent，并给出条目上限（接口/文档 ≤6 条、UI 截图 ≤8 张）。
- 卡完成后删除本表对应行。
