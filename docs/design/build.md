# 构建、运行与部署

服务端与阅读面落地后有两个运行入口：浏览器（`pnpm dev:server` + `pnpm dev:web`，或生产态 `pnpm serve`）与 CLI 试玩器（`pnpm play`，只跑世界层、打体检表）。世界内核仍是 `.ts` 源码直跑，没有编译步骤；只有前端有 `vite build`。

## 1. 环境

| 项 | 要求 |
| :--- | :--- |
| Node | ≥ 22.6（类型剥离） |
| 模型凭据 | `~/.pi/agent/auth.json`（**只读复用** pi CLI 的登录，不另存 key） |
| 网络 | 首切片直连供应商；离线不可用 |

```sh
pnpm install       # 工作区一次装完（服务端 + 前端）
pnpm typecheck     # 根与各包 tsc --noEmit，必须 0 错误
pnpm test          # vitest，全绿才能提交
```

## 2. 服务端与阅读面

```sh
pnpm dev:server   # http://127.0.0.1:8787，持有世界内存态；启动日志打印三个角色的模型串
pnpm dev:web      # http://127.0.0.1:5173，/api 反代到 8787
pnpm build        # vite build → packages/web/dist
pnpm serve        # 单进程：API + 静态资源
```

- 开发态两个终端：服务端常驻持有世界，前端改代码热更新，互不重启。
- 世界数据在 `data/<world>/`（`journal.jsonl` + `passage.jsonl`）；内容在 `content/<world>.json`（git 跟踪）。
- `POST /api/reset` = 开新局：清两条日志、按磁盘上的内容包重建。前端必须二次确认。
- 作者壳：顶栏 `⋯` 菜单「作者视图」或 `Ctrl/Cmd+Shift+D`；切换不重置任何状态。
- 内容编辑只在新局生效；保存后顶栏常驻“内容已变更，未生效”。

## 3. CLI 试玩

```sh
rm -rf data                              # 从干净世界开始；不复用上一轮账本
node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types scripts/play.ts --beats 30
```

- 出现 `你> ` 后，**一行输入 = 一拍**：写你说的或做的事都算
- 每拍约 50 秒（多人格并发认知 + 裁判结算 + 渲染），30 拍约 25 分钟
- 输入 **`/quit`** 结束并打印体检表；`Ctrl+C` 会跳过体检表
- `--beats N` 只是上限，`/quit` 可随时提前收尾
- 有 `data/` 时自动**续跑**：世界由 journal 重放复原，人物记忆由 `experience` 复原；续跑从新场景开始（场景上下文不落盘）
- `--fresh` 显式重开一局（清掉 journal/passage，替代手动 `rm -rf data`）
- 加 `--auto` 则不需要人输入，按内置脚本跑（用于回归跑分）
- `--network-family-autoselection-attempt-timeout=2000` **不是可选项**：到供应商的 TCP 握手常在 250ms 以上，Node 默认的 250ms 选路尝试上限会把每次连接提前掐断（报 `AggregateError (ETIMEDOUT)`）。手敲命令容易漏，漏了就连不上；`pnpm play` 已带好

试玩重点看三件事：它有没有记住你上一句、有没有人做你没要求的事、拒绝写得对不对。

### 3.1 体检表必须回答

- `no_rate`（按有风险的 claim 分桶）
- 写操作分布：`move/transfer/consume/phys/rel/fact/know`
- `facts/beat`：事实数 / 拍数；配合 `FACT_BUDGET = 12` 看裁判能看多远（≤1.0 = 12 条覆盖一整场 12 拍）
- `fact` 结构化覆盖率：带 `actor` / `kind` 的 fact 比例；低就说明裁判没按要求填
- `cacheRead` / `cacheWrite`：provider 报回的缓存命中量；不报时只显示 0，不能推断“没命中”
- `know_rate`：`know` 占全部写操作的比例
- `know/claim` 与平均听众数：判断是否又变回逐句广播
- `duration` 分桶：0–3 / 4–30 / 31–239 / ≥240 分钟
- 名字泄漏：正文里出现 `player/ann/doc/cody/granny` 等 id 的次数
- 物质 op 按 actor 拆分（player / NPC）与结束时的净持有变化
- `item`/持有错误与回滚 notes（例如把显示名当 item id）
- 空结果、长动作（`duration≥240`，不再要求空 deltas）、每拍墙钟耗时

### 3.2 `--auto` 探针

回归跑分不能只喂短对话，否则“物质不流动 / 时间钉死”可能只是探针 artifact。探针至少混合四类：

| 类型 | 例子 | 看什么 |
| :--- | :--- | :--- |
| 短对话 | “我问老板娘还有没有酒。” | no_rate、人物接话 |
| 等待 / 谈话 | “我在靠墙的桌边坐了一会儿，等雨小一点。” | duration 是否落在 4–30 分钟 |
| 物理动作 | “我把两枚银元放在柜台上。” | `transfer/consume/move/phys` 是否出现 |
| 长动作 | “我趴桌上睡到天亮。” | duration 是否 ≥240，clock 是否推进 |
| 知识交换 | 耳语“账本在柜台下面” | `know` 是否只给自己听见的人 |
| 事实守卫 | 交易 / 承诺 / 威胁 / 谎言 / 公开宣告各一条 | 这 5 类事件必须仍落 `fact`，减量不能减掉信号 |

长动作只跑**一次**，避免自动循环把“睡一整夜”重复成假长动作。移动探针放在**最后一拍**：出门后可能被门闩锁在外面，不能污染前面的基线。长动作若仍被裁判以“当前 clock 尚早”拒绝，优先查 duration 语义，不要为了凑 ≥240 分钟而加强制时长表。

## 4. 产物位置

| 路径 | 内容 |
| :--- | :--- |
| `data/starter-town/journal.jsonl` | 每拍的 claim / verdict / 观测（**账本的唯一凭据**，可重放） |
| `data/starter-town/passage.jsonl` | 已发出的叙述文本（只增不改） |

`data/` 是追加写的：同一目录连跑两次会把两轮拍混进同一张体检表，重开一局前先删。

## 5. 模型配置

默认模型**跟着 pi CLI 自己走**，不在代码里写死：

```text
config/models.json 显式值 > PI_MODEL 环境变量 > ~/.pi/agent/settings.json 的 defaultModel > 兜底常量
provider 一律取 settings.json 的 defaultProvider
```

`config/models.json` 只写要覆盖的角色（`cognition` 人物认知 / `referee` 裁判 / `narration` 渲染）；三个角色缺省指向同一模型。启动第一行会打印实际使用的模型串，调错立刻可见。

换供应商只改配置，不改代码。凭据从 `~/.pi/agent/auth.json` 只读解析，本程序不改写 pi 的登录状态。

## 6. 测速（可选）

```sh
node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types scripts/probe-latency.ts
```

对照两种输出通道（带工具 / 纯文本）的总耗时、输入输出 token、首字耗时，用来判断变慢是出在供应商、输出量还是工具调用上。

### 6.1 多轮交叉对话实验（可选，一次性）

```sh
pnpm experiment:multi-round -- --beats 6 --mode all --tag pilot-1
```

三臂：`baseline`（当前单次认知）、`self-retry`（控制臂：同样两轮，但第二轮只看自己的草稿）、`cross-talk`（第二轮看其他人的公开输出）。只共享 `outward`，`inner` 永不跨人；裁判仍是唯一写入口。产物在 `data/experiment/<tag>/<arm>/`，`report.md` 是汇总与样本。设计与指标见 [../research/multi-agent-architectures.md](../research/multi-agent-architectures.md) §6。

## 7. 常见故障

| 现象 | 含义 | 处理 |
| :--- | :--- | :--- |
| `裁决失败（本拍无进展）` | 裁判三次尝试全失败 | 该拍空转、账本不动，继续输入即可 |
| `认知失败（本拍沉默）：<人>` | 某个人物调用失败 | 它这拍没开口，其余人照常结算 |
| `Provider is not configured` | 模型串的 provider 与凭据不匹配 | 检查 `settings.json` 的 `defaultProvider` 与 `auth.json` |
| 所有调用立刻报 `AggregateError (ETIMEDOUT)` | 启动命令漏了 `--network-family-autoselection-attempt-timeout=2000`，Node 250ms 选路上限掐断了慢链路连接 | 用 `pnpm play`，或手敲命令时补上该 flag |
| 重试次数持续上涨 | 供应商抖动 | 属预期，重试只覆盖可重试错误；配额类错误立即失败 |

## 8. 分发

首切片不分发。运行依赖本机的 pi 凭据与 `src/`、`content/`、`config/` 三处源码目录，拷走即可运行。

## 9. CI

`.github/workflows/ci.yml` 在 push 到 `main`、PR 和手动触发时跑：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

**不跑 `pnpm play`**：它需要模型凭据与网络，结果不可重复。模型调用的回归靠 `scripts/play.ts --auto` 在本机跑，不进 CI。

CI 用 Node 22 与 pnpm 缓存（`pnpm/action-setup` 的版本取自根 `package.json` 的 `packageManager` 字段）；本地等价命令就是上面三条。`pnpm-lock.yaml` 必须提交，CI 用 `--frozen-lockfile` 而不是 `pnpm install`。

## 10. Release

`.github/workflows/release.yml` 在 push `vX.Y.Z` tag 时运行：先校验 tag 与 `package.json` 的 `version` 一致，再由 `hermannm/release-from-changelog` 从根 `CHANGELOG.md` 的 `## [vX.Y.Z] - 日期` 段创建 GitHub Release。

发布步骤：

```sh
# 1. 把 Unreleased 段改成 ## [vX.Y.Z] - 日期，并在顶部补新的 ## [Unreleased]
# 2. 抬版本（手工改根 package.json 的 version；子包 version 不参与发布）
# 3. 提交、打 tag、推送
git commit -am "release: v0.0.2"
git tag v0.0.2
git push origin main --tags
```

**不做 npm publish**：本项目是 `private: true` 的应用，不是库。**不做桌面打包**：没有 Electron 壳。tag 只从已通过 CI 的 `main` 打。

License：MIT，见根目录 `LICENSE`。
