# ai-world

单机单人、中文、阅读式的文字模拟世界。

**世界有一本可被验证的账本，人物只有一次判断，二者之间由唯一的裁判连接。**

你现在可以直接玩：输入一句话就是一拍，四个人物各自决定说什么、做什么，裁判结算成账本，叙述逐拍生长。

## 现在能做什么

| 能力 | 现状 |
| :--- | :--- |
| 逐拍推进对白 | ✅ 每拍数十秒（实测 10 拍 7–10 分钟） |
| 可验证账本 | ✅ 所在 / 持有 / 物质键 / 关系 / 知识 / 结构化事实，全部可重放 |
| 叙事只增不改 | ✅ 已发出的正文不回改 |
| 时间流动 | ⚠️ 以最长的动作推进；实测 20 拍推进约 8.6 小时（含一次 8 小时长动作） |
| 阅读界面 / 服务端 | ⏳ 未开始 |

## 开始玩

```sh
npm install
rm -rf data
node --experimental-strip-types scripts/play.ts --beats 30
```

出现 `你> ` 后，一行输入就是一拍；`/quit` 结束并打印体检表。需要 Node ≥ 22.6 与 pi CLI 的模型凭据（`~/.pi/agent/auth.json`，只读复用）。

完整跑法、模型配置与故障处理见 [docs/design/build.md](docs/design/build.md)。

## 文档

| 文件 | 内容 |
| :--- | :--- |
| [docs/docs-map.md](docs/docs-map.md) | 设计文档索引 |
| [docs/design/00-master-design.md](docs/design/00-master-design.md) | 总体设计与已定决策 |
| [docs/design/build.md](docs/design/build.md) | 运行、游玩、模型配置、故障 |
| [docs/db/schema.md](docs/db/schema.md) | 数据结构 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更 |

## 开发

```sh
npm test           # vitest，142 个用例
npm run typecheck  # tsc --noEmit，必须 0 错误
npm run play -- --beats 20 --fresh --auto   # 20 拍基线，出体检表
node --experimental-strip-types scripts/probe-latency.ts   # 可选：模型测速
```

实验脚本（一次性，证据落 `data/`，不入库）：`scripts/experiment-storylet.ts`（`--run N` / `--report`）、`scripts/probe-storylet.ts`、`scripts/probe-storylet-fill.ts`；结论见 [docs/research/storylet-probe.md](docs/research/storylet-probe.md)。

约束见 [AGENTS.md](AGENTS.md)：只有裁判能写账本、人物没有技能表、时间只有一个出口。

## License

[MIT](LICENSE) © 2026 whispering233
