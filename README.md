# ai-world

单机单人、中文、阅读式的文字模拟世界。

**世界有一本可被验证的账本，人物只有一次判断，二者之间由唯一的裁判连接。**

输入一句话就是一拍：四个人物各自决定说什么、做什么，裁判结算成账本，叙述逐拍生长。浏览器里读，作者视图里看它是怎么结算的。

## 现在能做什么

| 能力 | 现状 |
| :--- | :--- |
| 逐拍推进对白 | ✅ 每拍 50–70 秒（真实模型，并发认知 + 裁判 + 渲染） |
| 可验证账本 | ✅ 所在 / 持有 / 物质键 / 关系 / 知识 / 结构化事实，全部可重放 |
| 叙事只增不改 | ✅ 已发出的正文不回改 |
| 时间流动 | ⚠️ 以最长的动作推进；20 拍实测推进约 8.6 小时（含一次 8 小时长动作） |
| 浏览器阅读面 | ✅ 单栏散文 + 按需抽屉，无聊天组件 |
| 作者视图 | ✅ 三栏：拍列表 / 同一份正文 / claims·verdicts·账本·体检·内容编辑 |
| 物质流 / 知识通胀 | ⚠️ 已知偏薄，见 [backlog.md](docs/design/backlog.md) §1 |

## 开始玩

```sh
pnpm install
pnpm build     # 只有前端需要构建
pnpm serve     # 打开 http://127.0.0.1:8787
```

需要 Node ≥ 22.6 与 pi CLI 的模型凭据（`~/.pi/agent/auth.json`，只读复用）。

- `Enter` 发送，`Shift+Enter` 换行；顶栏「此刻」看你在哪、身上有什么、知道什么。
- `Ctrl/Cmd+Shift+D` 或 `⋯` 菜单切作者视图；切换不重置阅读位置。
- 想改前端代码：两个终端跑 `pnpm dev:server` + `pnpm dev:web`，打开 `http://127.0.0.1:5173`（Vite 热更新，`/api` 反代到 8787）。

世界数据在 `data/starter-town/`（`journal.jsonl` + `passage.jsonl`，不入库），内容在 `content/starter-town.json`（git 跟踪）。删掉 `data/starter-town/` 就是干净世界；服务端重启会自动从 journal 重放续跑。

也可以只用 CLI 跑世界层、出体检表：

```sh
pnpm play -- --beats 20 --auto
```

完整跑法、模型配置与故障处理见 [docs/design/build.md](docs/design/build.md)。

## 开发

```sh
pnpm test          # vitest，199 个用例
pnpm typecheck     # 根 + 各包 tsc --noEmit，必须 0 错误
pnpm play -- --beats 20 --fresh --auto   # 20 拍基线，出体检表
```

包结构：`packages/{shared,core,content,server,web}`，依赖方向 `shared ← core ← content ← server ← web`，包入口是 `.ts` 源码（无构建步骤）。发布、tag 与版本号约定见 [docs/design/build.md](docs/design/build.md) §10。

实验脚本（一次性，证据落 `data/`，不入库）：`scripts/experiment-storylet.ts`（`--run N` / `--report`）、`scripts/probe-storylet.ts`、`scripts/probe-storylet-fill.ts`；结论见 [docs/research/storylet-probe.md](docs/research/storylet-probe.md)。

约束见 [AGENTS.md](AGENTS.md)：只有裁判能写账本、人物没有技能表、时间只有一个出口、玩家视图不出现引擎语义。

## 文档

| 文件 | 内容 |
| :--- | :--- |
| [docs/docs-map.md](docs/docs-map.md) | 设计文档索引 |
| [docs/design/00-master-design.md](docs/design/00-master-design.md) | 总体设计与已定决策 |
| [docs/design/60-server.md](docs/design/60-server.md) | 服务端、一拍生命周期、两种壳、组件方案 |
| [docs/api/00-api-index.md](docs/api/00-api-index.md) | 接口索引与两种投影 |
| [docs/ui/DESIGN.md](docs/ui/DESIGN.md) | 阅读面与作者视图的布局、视觉、交互契约 |
| [docs/db/schema.md](docs/db/schema.md) | 数据结构 |
| [docs/design/backlog.md](docs/design/backlog.md) | 延后项、监控阈值、已知失败模式、下一步候选 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更 |

## License

[MIT](LICENSE) © 2026 whispering233
