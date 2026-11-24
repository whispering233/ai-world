# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次：接线缺陷（纯缺陷，不改世界观）

顺序即依赖：A1 → A2 → A3。A1 动 `core`，A2 动 `server`，A3 只动 `web`，三卡文件不重叠。

### A1 core：折场重开收进 runBeat，tokens 改「最长上下文」

- [ ] `runBeat` 折场后立刻装配下一场景，返回的 `scene` 即下一拍场景（口径见 `40-time-and-loop.md` §2）
- [ ] `scene.tokens` 改为当前最长参与者上下文的估算，折场归零；`FOLD_AFTER_TOKENS` 从死代码变成真触发
- [ ] `scripts/play.ts` 删掉自己那段重开（只留打印）
- [ ] 断言：13 拍恰好 1 条 `scene/fold`、`result.scene.beats === 0`、`context` 清空、`place` 是玩家落账后的位置；超长上下文按 tokens 先折
- 不做：折场材料 → `experience` 的压缩（那是一次新调用，属成长批）

### A2 server：一拍总时限

- [ ] `session.beat` 合成客户端 signal + 总时限（缺省 180s，`SessionOptions` 留测试旋钮）
- [ ] 超时走 `E_MODEL_CALL`：世界不动、`inFlight()` 回 false、下一拍可正常发
- [ ] 断言：挂住的 llm + 短时限 → 抛 `E_MODEL_CALL`，journal 不落，锁释放

### A3 web：Windows 守卫、慢测试、停止后补齐

- [ ] `discipline.test.ts` 路径分隔符归一化，并加一条"必须扫到 `shell/Composer.tsx`"的断言（Windows 上修之前必红）
- [ ] `composer.test.ts` 给 jsdom + `Sender` 用例一个 15s 预算（慢的是样式注入，不是我们的代码）
- [ ] `App.tsx` 停止后重取 `GET /api/session`；非在途时丢弃迟到的 `passage` 帧，防止与重取结果叠成两条
- 验证：`pnpm test` 全绿；"停止后补齐"只能真浏览器验（需要模型凭据，本轮不跑）