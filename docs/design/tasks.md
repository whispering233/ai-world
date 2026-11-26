# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C9 作者改名后的旧称呼提示

**目标**：作者在本次编辑里改 `places`/`names`/`items` 显示名后，如果 `core`/`voice`/`beliefs`/`drives`/`canon`/`opening`/`scene`/`title` 里还出现旧名，给非阻断提示；不自动改正文。

**范围**：
- 新增纯函数（`packages/web/src/author/stale-names.ts`）：比较编辑前/后的三类显示名；扫描正文；旧名出现在新名内部（如“安”→“安妮”）不算残留。
- `ContentEditor` 在首次读取时保存一份编辑前快照；改名后渲染 `Alert type=warning`，提示“保存不会自动替换”，保存按钮仍可用。
- 测试：纯函数覆盖前缀/多处/未改名；ContentEditor 覆盖提示出现且保存仍提交。
- 文档：`ui/DESIGN.md` 内容面板、`CHANGELOG.md`；真浏览器验证一次。

**不做**：不改正文/服务端校验/保存行为；不持久化旧名历史（重开表单后无法再检测此前改名）。

**验收**：`pnpm test`、`pnpm typecheck`、`pnpm build`；真浏览器改 `ann` 显示名后看到提示，保存仍可用；测试后恢复内容/数据。

**依赖**：C8 之后；独立 commit。

