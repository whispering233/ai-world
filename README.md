# ai-world

单机单人、中文、阅读式的文字模拟世界。

**世界有一本可被验证的账本，人物只有一次判断，二者之间由唯一的裁判连接。**

你现在可以直接玩：输入一句话就是一拍，四个人物各自决定说什么、做什么，裁判结算成账本，叙述逐拍生长。

## 现在能做什么

| 能力 | 现状 |
| :--- | :--- |
| 逐拍推进对白 | ✅ 每拍约 50 秒，可连跑 20 拍以上 |
| 可验证账本 | ✅ 所在 / 持有 / 物质键 / 关系 / 知识，全部可重放 |
| 叙事只增不改 | ✅ 已发出的正文不回改 |
| 时间流动 | ⚠️ 以最长的动作推进，实测 20 拍约 41 分钟 |
| 阅读界面 / 服务端 | ⏳ 未开始（W11、W12） |

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
npm test           # vitest，134 个用例
npm run typecheck  # tsc --noEmit，必须 0 错误
node --experimental-strip-types scripts/probe-latency.ts   # 可选：模型测速
```

约束见 [AGENTS.md](AGENTS.md)：只有裁判能写账本、人物没有技能表、时间只有一个出口。

## License

[MIT](LICENSE) © 2026 whispering233
