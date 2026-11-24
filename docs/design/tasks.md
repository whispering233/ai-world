# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次：工程债（四张卡，文件不重叠，可并行）

### D1 core：`seq` 由「最大 seq + 1」推

- [ ] `store.ts` 的 `prepare()` 改用已有最大 `seq`，坏行不再让序号回退
- [ ] 断言：中间行损坏时，新记录的 `seq` 仍大于已存在的最大值

### D2 core：内容包校验补齐 + `apply` 全函数

- [ ] `validatePack()` 覆盖 `ledger.clock`（有限、非负）、`holds` 数量（正整数）、`phys` 值（数字/布尔且有限）、`rel`（目标存在、值有限）、`knows`（形态）
- [ ] `ledger.ts` 的 `holdsOf/physOf/relOf/knowsOf` 对缺失的 `ledger` 子对象兜底，不留 TypeError
- [ ] 断言：坏包逐条被拒；缺子对象的 world 跑 `apply` 不抛

### D3 ci：Windows job

- [ ] `ci.yml` 改 `matrix.os: [ubuntu-latest, windows-latest]`，`fail-fast: false`
- 验证：只能靠推送后看 CI；本地等价命令已在两个平台跑过

### D4 server：路由层 HTTP/SSE 契约

- [ ] 新测试：坏 JSON → 400 `E_INVALID_BODY`；空输入 → 400 `E_EMPTY_INPUT`；结算中 → 409 `E_BEAT_IN_FLIGHT`
- [ ] 新测试：一拍正常结束的帧序（`passage` → `state` → `done`）；模型失败只发 `error` 帧
- 不做：真断连（需要真 socket），留给浏览器实测