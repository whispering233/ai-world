# 前缀顺序与缓存计量（2026-11-21）

- 模型：`opencode-go/deepseek-v4.1-flash`（三角色同模型）
- 命令：`rm -rf data && pnpm play -- --beats 6 --auto`
- 目的：W5 只验证两件事——`cognition` 的 system 前缀顺序是否按设计排好；provider 是否会上报 `cacheRead` / `cacheWrite`。**这不是缓存收益的 A/B 基准。**

## 实测

| 角色 | 调用 | input | output | cacheRead | cacheWrite |
| :--- | ---: | ---: | ---: | ---: | ---: |
| cognition | 24 | 21311 | 16867 | 6144 | 0 |
| referee | 6 | 9717 | 14466 | 4608 | 0 |
| narration | 6 | 3519 | 8155 | 0 | 0 |

- `cacheRead` 有上报：cognition 6144、referee 4608。
- `cacheWrite` 全为 0；当前 provider 可能采用自动缓存、或不上报写入量，不能据此断定“没有写缓存”。
- narration 的 `cacheRead` 为 0；本轮只有 6 次调用，不能据此断定“narration 永远不命中”。

## 顺序

`cognition` 的 system 现在是：

```text
core → voice → 输出指令 → canon → drives → beliefs → 记忆
```

稳定段（core/voice/输出指令）在 `canon` 前，`canon` 在易变状态前。测试 `tests/cognition.test.ts` 用捕获的 system 断言了这个顺序。

## 不能宣称的事

- 没有改动前的同样 6 拍 A/B 数据，所以**不能把 cacheRead 归因于这次重排**；只能确认“顺序符合设计，计量链路通了”。
- 没有跑 20 拍；缓存收益需要多轮、跨场景才能看清，且 provider 的缓存策略不透明。
- `cacheWrite=0` 不等于没有缓存；只表示 provider 没有报这个数。

## 结论

W5 的目标是“让缓存可观测 + 把 canon 放回半稳定段”，两者都完成。是否值得继续优化缓存，要等有 before/after 数据再谈；当前不引入 cache-warming、不改 sessionId、不做 per-role 拆分。
