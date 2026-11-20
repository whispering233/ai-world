# 项目规则

设计文档见 [docs/docs-map.md](docs/docs-map.md)。本文件只写"做错会返工"的约束。

## 不可违反

1. **只有 referee 能写 `ledger` 与 `facts`**。角色侧类型上拿不到写入口。
2. **不做能力清单**：不给人物 tools / skills / 动作词表 / 动作时长表。人物只输出自然语言。
3. **不做阶段化认知**：不恢复 感知→评价→目标→选择 式的多阶段链路。
4. **文本不是证据**：账本与文本冲突时以账本为准；已经发出的文本永不改写（不 retcon）。
5. **时间只有一个出口**：`fmt(clock)`。叙事文本禁止写绝对时间。
6. **fact 只增不改**：推翻旧事实 = 新增一条 + `supersededBy`。

## 结构

- `src/core/` 纯函数：账本、调度、场景、检索、裁判契约。全部可替换为确定性桩。
- 四个服务按**接口**寻址（`clock` / `ledger` / `referee` / `narrate`），不直接 import 具体实现。
- 用 `.ts` 后缀导入；ESM；`strict` + `noUncheckedIndexedAccess`。

## 开发顺序

讨论与返工风险 → 更新 `docs/` → 切 `docs/design/tasks.md` 任务卡 → 临时 worktree + 分支执行 → 独立验证 → 清卡 → 合并。

一次只做一张卡；每张卡独立 commit，可单独回滚。

## 别做的事

- 不加 ECS、向量库、插件框架、storylet 运行时（见 `docs/design/backlog.md` 的触发条件）。
- 不提前抽公共层：两个调用点之前不抽象。
- 不加没人要的配置项与开关。
