# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### A1 可证的中途状态（决策 #45）

#### 目标

裁判返回、账本在内存落定后发一帧 `progress { phase:'settled' }`；UI 说“这一拍已经定了，正在落笔…”，不说“已记录”。

#### 范围

- `packages/shared/src/dto.ts`：`ProgressFrame` 加可选 `phase?: 'settled'`。
- `packages/core/src/beat.ts`：`BeatInput` 加可选 `onSettled`；在真实 `commit(at, out)` 之后、旁白之前调用一次。
- `packages/server/src/session.ts`：`beat()` 的 `onProgress` 允许第二个参数 `phase`；把 `onSettled` 接到 `onProgress(elapsed, 'settled')`。
- `packages/server/src/routes/beat.ts`：`progress` 帧带上 `phase`（没有就不写字段）。
- `packages/web/src/App.tsx`：state 加 `settled`；`send` 清空，`progress.phase==='settled'` 置真，`passage/done/error/end/stop/failed` 清空。
- `packages/web/src/shell/Composer.tsx`：等待文案分两段；`settled` 时显示“这一拍已经定了，正在落笔…”，否则“世界在回应…”。
- 测试：`routes/beat.test.ts` 断言 `phase` 帧在 `passage` 之前且 data 含 `"phase":"settled"`；`composer.test.ts` 断言两段文案。

#### 不做

阶段名（认知/裁判/渲染）、每角色进度、token 流；状态行与“等一会儿”（A2）。

#### 验收

- `pnpm test`、`pnpm typecheck` 全绿。
- 文案里不出现“已记录/已落盘”；帧顺序为 `progress(phase) → passage → state → done`。

#### 依赖 / 并行

依赖 T4/T5/D（已合并）。与 A2 串行（同改 Composer/App）。一个 commit。

---

### A2 状态行、示例与“等一会儿”（决策 #46/#49）

#### 目标

输入区显示玩家投影里的地点与持有；首屏给出“说/做”示例；点击“等一会儿”发送一条普通等待 claim。

#### 范围

- `packages/web/src/shell/Composer.tsx`：状态行（地点 · 你身上）、placeholder 改“说点什么，或做什么…”、“等一会儿”按钮（`onWait`，等待中禁用）。
- `packages/web/src/App.tsx`：`send()` 支持显式文本；`onWait` 发送预设等待文本；把 `session.state` 传给 Composer。
- `packages/web/src/shell/ReadingStream.tsx` / `EmptyState.tsx`：没有拍时给 2–3 条说/做示例；有 opening 时示例排在开篇之后，没有 opening 时排在场景卡里。
- 测试：`composer.test.ts` 断言状态行、按钮回调、placeholder；`reading-stream.test.ts` 断言首屏示例。

#### 不做

目标 chips（B）、`suggest` 提示（B）、任何 API 字段（等待就是普通 text）。

#### 验收

- `pnpm test`、`pnpm typecheck`、`pnpm build` 全绿。
- 真浏览器：首屏有 opening/示例/状态行；点“等一会儿”能发出一拍并收到 passage；截图 ≤6 张。
- 不改 `data/`；不提交 `dist/`。

#### 依赖 / 并行

依赖 A1；一个 commit。