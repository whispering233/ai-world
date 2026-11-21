# 构建、运行与部署

首切片没有构建步骤：源码用 `.ts` 后缀导入，靠 Node 的类型剥离直接运行。没有打包、没有编译产物、没有服务端进程。

## 1. 环境

| 项 | 要求 |
| :--- | :--- |
| Node | ≥ 22.6（类型剥离） |
| 模型凭据 | `~/.pi/agent/auth.json`（**只读复用** pi CLI 的登录，不另存 key） |
| 网络 | 首切片直连供应商；离线不可用 |

```sh
npm install        # 只装运行时依赖与 vitest/typescript
npm run typecheck  # tsc --noEmit，必须 0 错误
npm test           # vitest，全绿才能提交
```

## 2. 游玩（自己试玩）

```sh
rm -rf data                              # 从干净世界开始；不复用上一轮账本
node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types scripts/play.ts --beats 30
```

- 出现 `你> ` 后，**一行输入 = 一拍**：写你说的或做的事都算
- 每拍约 50 秒（多人格并发认知 + 裁判结算 + 渲染），30 拍约 25 分钟
- 输入 **`/quit`** 结束并打印体检表；`Ctrl+C` 会跳过体检表
- `--beats N` 只是上限，`/quit` 可随时提前收尾
- 加 `--auto` 则不需要人输入，按内置脚本跑（用于回归跑分）
- `--network-family-autoselection-attempt-timeout=2000` **不是可选项**：到供应商的 TCP 握手常在 250ms 以上，Node 默认的 250ms 选路尝试上限会把每次连接提前掐断（报 `AggregateError (ETIMEDOUT)`）。手敲命令容易漏，漏了就连不上；`npm run play` 已带好

试玩重点看三件事：它有没有记住你上一句、有没有人做你没要求的事、拒绝写得对不对。

## 3. 产物位置

| 路径 | 内容 |
| :--- | :--- |
| `data/starter-town/journal.jsonl` | 每拍的 claim / verdict / 观测（**账本的唯一凭据**，可重放） |
| `data/starter-town/passage.jsonl` | 已发出的叙述文本（只增不改） |

`data/` 是追加写的：同一目录连跑两次会把两轮拍混进同一张体检表，重开一局前先删。

## 4. 模型配置

默认模型**跟着 pi CLI 自己走**，不在代码里写死：

```
config/models.json 显式值 > PI_MODEL 环境变量 > ~/.pi/agent/settings.json 的 defaultModel > 兜底常量
provider 一律取 settings.json 的 defaultProvider
```

`config/models.json` 只写要覆盖的档位（`fast` 人物认知 / `strong` 裁判 / `mid` 渲染）；三档缺省指向同一模型。启动第一行会打印实际使用的模型串，调错立刻可见。

换供应商只改配置，不改代码。凭据从 `~/.pi/agent/auth.json` 只读解析，本程序不改写 pi 的登录状态。

## 5. 测速（可选）

```sh
node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types scripts/probe-latency.ts
```

对照两种输出通道（带工具 / 纯文本）的总耗时、输入输出 token、首字耗时，用来判断变慢是出在供应商、输出量还是工具调用上。

## 6. 常见故障

| 现象 | 含义 | 处理 |
| :--- | :--- | :--- |
| `裁决失败（本拍无进展）` | 裁判三次尝试全失败 | 该拍空转、账本不动，继续输入即可 |
| `认知失败（本拍沉默）：<人>` | 某个人物调用失败 | 它这拍没开口，其余人照常结算 |
| `Provider is not configured` | 模型串的 provider 与凭据不匹配 | 检查 `settings.json` 的 `defaultProvider` 与 `auth.json` |
| 所有调用立刻报 `AggregateError (ETIMEDOUT)` | 启动命令漏了 `--network-family-autoselection-attempt-timeout=2000`，Node 250ms 选路上限掐断了慢链路连接 | 用 `npm run play`，或手敲命令时补上该 flag |
| 重试次数持续上涨 | 供应商抖动 | 属预期，重试只覆盖可重试错误；配额类错误立即失败 |

## 7. 分发

首切片不分发。运行依赖本机的 pi 凭据与 `src/`、`content/`、`config/` 三处源码目录，拷走即可运行。

## 8. CI

`.github/workflows/ci.yml` 在 push 到 `main`、PR 和手动触发时跑：

```sh
npm ci
npm run typecheck
npm test
```

**不跑 `npm run play`**：它需要模型凭据与网络，结果不可重复。模型调用的回归靠 `scripts/play.ts --auto` 在本机跑，不进 CI。

CI 使用 Node 22 与 npm 缓存；本地等价命令就是上面三条。`package-lock.json` 必须提交，CI 用 `npm ci` 而不是 `npm install`。
