# 项目规则

设计文档见 [docs/docs-map.md](docs/docs-map.md)；跑法与配置见 [docs/design/build.md](docs/design/build.md)。本文件只写"做错会返工"的约束。

## 不可违反

1. **只有 referee 能写 `ledger` 与 `facts`**。角色侧类型上拿不到写入口。
2. **不做能力清单**：不给人物 tools / skills / 动作词表 / 动作时长表。人物只输出自然语言。
3. **不做阶段化认知**：不恢复 感知→评价→目标→选择 式的多阶段链路。
4. **文本不是证据**：账本与文本冲突时以账本为准；已经发出的文本永不改写（不 retcon）。**`ok` + 空 `deltas` 也不是状态**：它只表示“发生了”，不得拿来否决另一条改变账本的主张；持续性必须落 `phys` 键。
5. **时间只有一个出口**：`fmt(clock)`。叙事文本禁止写绝对时间。
6. **fact 只增不改**：推翻旧事实 = 新增一条 + `supersededBy`。
7. **fact 的结构字段是补充，不是第二个事实源**：`actor` 只能填动作发出者，`kind` 只用规定枚举；旧 fact 没有字段也必须能 replay。
8. **一拍内的改动要么全成、要么全退**：同一裁决里的多条写操作是一个事务。
9. **`phys` 键开放，但每个键要能写出“谁解除”**：新键登记到 `docs/db/schema.md` §9；写不出解除方式的键会永久粘住。

## 结构

- `packages/core/` 纯函数：账本、调度、场景、检索、裁判契约、LLM 适配、投影、体检。全部可替换为确定性桩。
- 四个服务按**接口**寻址（`clock` / `ledger` / `referee` / `narrate`），不直接 import 具体实现。
- `BeatInput.claimSource` 是唯一的世界事件注入点（只读账本、产出仍是 claim）；storylet 冻结中，目前只有 `scripts/` 与测试在用。
- `packages/content/` 只放世界内容与内容校验，不放规则。
- 依赖方向单向：`shared ← core ← content ← server ← web`；`web` 只依赖 `shared`，由 pnpm 严格 node_modules 强制，不靠自觉。
- 包入口是 `.ts` 源码（`exports` 指向 `src/index.ts`，无构建步骤）；发布时才逐包加 `build` 并把该包切到 `dist`。
- `scripts/` 放可丢弃的驱动脚本：试玩器、测速。它们不进任何包。
- 用 `.ts` 后缀导入；ESM；`strict` + `noUncheckedIndexedAccess`。

## 失败与降级

- 人物调用失败 → 该人物**本拍沉默**，其余人照常结算；不得因此丢掉整拍。
- 裁判调用失败 → 本拍**无进展**，账本不动、不落 journal；宁可空转也不编造未结算的世界。
- 降级必须留下 `notes`，不许静默吞掉。

## 模型与凭据

- 模型串只在 `config/models.json`；缺省值从 pi CLI 自身设置推导，**代码里不写死模型**。
- 凭据只读 `~/.pi/agent/auth.json`，不另存 key、不改写 pi 的登录状态。
- `sessionId` 是 provider 的路由/缓存亲和头，不是消息线程；一次世界运行只用一个，不按角色拆。
- 启动时打印实际使用的模型串；调错模型必须当场可见。

## 开发顺序

讨论与返工风险 → 更新 `docs/` → 切 `docs/design/tasks.md` 任务卡 → 临时 worktree + 分支执行 → 独立验证 → 清卡 → 合并。

一次只做一张卡；每张卡独立 commit，可单独回滚。测试前清掉 `PI_MODEL`，否则环境变量会覆盖 settings，config 用例会假红。

- UI 卡改完必须跑一次**浏览器实测**：类型检查与单测全绿也会漏掉抽屉常开、`/` 返回 octet-stream、按钮被遮这类缺陷。
- 并行卡都往 `packages/core/src/index.ts` 加导出时**按字母序插入**，否则合并必撞同一行。

## 别做的事

- 不加 ECS、向量库、插件框架、storylet 运行时（已冻结：3 次重复测不出收益，见 `docs/design/backlog.md` 与 `docs/research/storylet-probe.md` §18）。
- 不提前抽公共层：两个调用点之前不抽象。
- 不加没人要的配置项与开关。
- 不在 `docs/` 里保留历史实现记录或任务卡语义。
