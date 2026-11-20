# ai-world

单机单人、中文、阅读式的文字模拟世界。

**世界有一本可被验证的账本，人物只有一次判断，二者之间由唯一的裁判连接。**

## 文档

| 文件 | 内容 |
| :--- | :--- |
| [docs/docs-map.md](docs/docs-map.md) | 设计文档索引 |
| [docs/design/00-master-design.md](docs/design/00-master-design.md) | 总体设计与已定决策 |
| [docs/db/schema.md](docs/db/schema.md) | 数据结构 |

## 命令

```sh
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
```

运行时要求 Node ≥ 22.6（源码用 `.ts` 后缀导入，靠类型剥离直接运行）。
