# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### T2 世界切片统一（决策 #42）

#### 目标

人物与裁判看到同一份现场；人物的场景上下文包含裁判给本人的感知摘要；本场景物件的 `phys` 不再对人物隐身；裁判拿到 `canon`。

#### 范围

- `packages/core/src/beat.ts`
  - 人物的 `sceneFor` 改用 `describeLedger(world, present, …)`（`present` 含门/灯/地窖门等本场景物件），事实切片同口径；不再用 `inScene`。
  - `appendBeat.texts` 对每个 `scene.participants` 生成：自己的 claim（显示名 + outcome）+ `observations[ent].summary`（标签“我感知到的：”）。没有 observation 时只留自己那句并记 `notes`；两者都没有则不追加。
  - 上下文行用显示名，不用实体 id。
  - 裁判输入补 `canon`：`RefereeInput` 加可选 `canon?: readonly string[]`，`runBeat` 传入；`refereePrompt` 渲染“世界设定”。
- `packages/core/src/referee.ts`
  - `REFEREE_SYSTEM` 加一条：`observations.summary` 固定第二人称、只写该实体感知到的；`observations.claimIds` 是感知白名单，没列出的 claim 等于没看见。
- 测试：`packages/core/src/beat.test.ts`、`referee.test.ts`。

#### 不做

`inner`/空 claim（T4）、旁白编排（T5）、focus（T10）、开场（T3）。

#### 验收

- `pnpm test`、`pnpm typecheck` 全绿。
- 新增测试至少覆盖：
  - 门 `closed` 出现在人物账本切片里；
  - 下一拍 `contextOf(ent)` 含 `observations[ent].summary`；
  - 缺 observation 时不追加其他人的 claim，并记 `notes`；
  - 上下文行不出现实体 id；
  - 裁判 prompt 含 `canon`。

#### 依赖 / 并行

依赖 T1；与 T3 并行。不新增 `packages/core/src/index.ts` 导出；若新增，按字母序插入。一个 commit。

---

### T3 开场与现场（决策 #43）

#### 目标

首屏不再是空白；作者可写一段开场散文与一句现场描述；现场进入人物/裁判/旁白上下文；没有 `opening` 时回退场景卡。

#### 范围

- `packages/core/src/content.ts`：`ContentPack` 加可选 `opening?: string`、`scene?: string`；`validatePack` 校验类型与长度（opening ≤600 字，scene ≤160 字），空串视为缺失，旧内容包不报错。
- `packages/web/src/author/ContentEditor.tsx`：两个 textarea（opening / scene），沿用现有 `LabeledField`；保存仍整份序列化回传。
- `packages/server/src/session.ts`：`view()` 透出 `pack.opening`；`sceneText()` 拼 `scene`（若有）+ 地点 + 在场。
- `packages/shared/src/dto.ts`：`SessionView` 加 `opening?: string`。
- `packages/core/src/view.ts`：`playerView` 输入加 `opening`，原样透出。
- `packages/web/src/shell/ReadingStream.tsx` / `EmptyState.tsx`：正文最上方渲染 `opening`；无 `opening` 且无拍时渲染场景卡（`clockText` / `place` / `here` / `holds`）。
- `content/starter-town.json`：补 `opening`（≤600 字，无绝对时间）与 `scene`（≤160 字）。
- `scripts/play.ts` 与 `scripts/experiment-multi-round.ts` 的 `describeScene` 同步拼 `scene`，避免回归脚本看不到新字段。
- 测试：`packages/core/src/content.test.ts`、`packages/core/src/view.test.ts`、`packages/web/src/shell/reading-stream.test.ts`（用 `createElement` 写 `.test.ts`）。

#### 不做

LLM 生成开场；journal/passage 新增记录；`ambient` 进 prompt（天气/夜色写进 `scene`；`ambient` 仍只给环境前因读）。

#### 验收

- `pnpm test`、`pnpm typecheck`、`pnpm build` 全绿。
- 真浏览器：首屏有 `opening`，刷新仍在；无 `opening` 的回退卡由单元测试覆盖。浏览器截图 ≤6 张。
- 不改 `data/`；不提交 `packages/web/dist`。

#### 依赖 / 并行

依赖 T1；与 T2 并行；`packages/core/src/index.ts` 若加导出按字母序。一个 commit。

---

## 当前批次合并后的验证

T2 与 T3 合并到 `main` 后跑一次 10 拍 smoke（**不是**回归证明，单次 10 拍没有分辨率）：

```bash
node --network-family-autoselection-attempt-timeout=2000 --experimental-strip-types \
  scripts/experiment-multi-round.ts --beats 10 --mode baseline --tag t2t3-baseline --force
```

- 跑前：停掉服务端（`data/` 没有锁）；清掉 `PI_MODEL`；确认模型串打印正确。
- 看：`no` 率（玩家/NPC 分桶）、拒绝理由里“人物不可见状态”的条数、passage 段落数、折场数、每拍耗时。
- 产物在 `data/experiment/t2t3-baseline/baseline/`，不入库。
- 结果决定下一批：T4（claim 语义 + inner）与 T5（旁白编排）是否按原计划切。