# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### C11 区分“自动”与“所有人”

**目标**：玩家显式点“所有人”时不再被 C10 的自动聚焦覆盖；默认新增“自动”状态，只有它才按正文唯一人名推断。

**范围**：
- Web `Composer` 目标 chips：`自动`（默认，按正文唯一人名推断）、`所有人`（显式广播，不推断）、在场者；点选只改状态不发。
- App 状态：`target` 旁增 `explicitAll`；发送 body 带 `to` 或 `all:true`，互斥；等待按钮发 `all:true`。
- API `POST /api/beat`：新增可选 `all:boolean`；`all:true` 跳过聚焦；`all` 与 `to` 同时给非空值 → 400。
- Session：`beat(..., to?, all?)`；`all:true` 不做显式解析、不自动推断；`to` 无效仍不回退；缺省/`all:false` 维持 C10 自动。
- 测试：路由显式 all+人名不聚焦、all/to 冲突 400、all 非布尔 400；Composer 三个状态与点击；api body；现有 C10 测试不回归。
- 文档：api/20 §1、ui/DESIGN、00/40/60、CHANGELOG。

**不做**：不加“自动判定动作对象”、不改 C10 名字匹配、不做中文分词。

**验收**：`pnpm test`、`pnpm typecheck`、`pnpm build`；真浏览器确认默认“自动”、点“所有人”后 chip 选中且发送按钮仍可用（不实际发送模型请求）。

**依赖**：C10 之后；独立 commit。

