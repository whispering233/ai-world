# 任务卡片（临时）

> 只放**未完成**的卡片；完成的卡片直接删除，历史在 `CHANGELOG.md` 与 git 记录里。
> 设计口径进 `docs/design/*`，下一步候选进 [backlog.md](backlog.md) §5。

## 当前批次

### T1 世界选择（换包 = 开新局）

**目标**：玩家在「新的一局」里选内容包；选了就切存档目录并重建。进程只保留一个默认值。

**改动**

| 文件 | 内容 |
| :--- | :--- |
| `packages/content/src/load.ts` | 新增 `contentPathFor(world)`；`STARTER_TOWN_PATH` 改为其调用（测试夹具不变） |
| `packages/shared/src/dto.ts` | `SessionView` 新增**可选** `worlds?: {id,title,active}[]`（必选会让 `core/view.ts` 的纯函数投影去读 `content/`，typecheck 必红） |
| `packages/server/src/session.ts` | 当前世界的 `dir`/`contentPath` 收成**单一来源**：`opts.*` 的 10 处引用（132/216/221/229/251/254/394/400-402/414）全部改读可变值，不留影子变量；`reset(world?)` 先加载+校验（`coded('E_INVALID_CONTENT')` 带 `errors`）再切目录再清日志；`view()` 补 `worlds` |
| `packages/server/src/index.ts` | 启动时扫描 `content/*.json`（名称 `^[a-z0-9-]+$`，title 读不到退回 id）；默认世界取 `AI_WORLD ?? 'starter-town'`，指向不存在的包直接启动失败 |
| `packages/server/src/routes/reset.ts` | 照抄 `beat.ts:103-110` 的 `readBody` 容错；`world` 非字符串 → `E_INVALID_BODY`，不在列表 → `E_UNKNOWN_WORLD`，校验失败 → `E_INVALID_CONTENT` + `data.errors` |
| `packages/web/src/{api,App}.tsx` | `resetSession(world?)`；新局弹窗加选包（默认当前）；`startNewGame` 成功后清空草稿与重发文本（但 `reload()` 不得清）；作者壳内容抽屉 `key={session.content.path}` 重挂载，否则旧包 JSON 会存进新世界 |

**验收**

- `GET /api/session` 的 `worlds` 按 id 升序，`active` 恰好一条。
- `POST /api/reset {world}` 后：响应 title 是新包；`data/<world>/` 出现新日志；另一个世界的日志字节不变。
- `{world:"nope"}`、`{world:"../x"}`、`{world:"A B"}` 全部 400，且当前世界与日志不变。
- 空 body 仍等价于重开当前世界（既有 `session.test.ts` 用例不改语义）。
- `pnpm typecheck` + `pnpm test` 绿；浏览器实测：弹窗能选包，切完顶栏标题变化。

### T2 西部世界内容包

**目标**：`content/westworld.json` 可玩，`AI_WORLD=westworld` 能起服务端与试玩器。

**内容**（口径见 [../reference/westworld-canon.md](../reference/westworld-canon.md)）

- 地点 3：`street` 甜水镇主街、`mariposa` 酒馆、`ranch` 艾伯纳西农场。
- 人物 6：`dolores` 0.6 / `maeve` 0.7 / `hector` 0.5 / `mib` 0.9 / `peter` 0.55 / `teddy` 0.4（数字为初始 `heat`）。
- 陈设 4：`bar`、`piano`、`table`、`barn`；物品 5：`whiskey`、`cup`、`milk`、`cards`、`revolver`。
- `phys`：`piano.playing=true`、`door.closed=true`、`barn.closed=true`。
- `canon` 10 条，只写世界里的人知道的事，**不写"他们是造出来的"**。
- `opening` 只给玩家：三十年前来过，答应过一个人。

**改动**：`content/westworld.json`（新）；`scripts/play.ts` 去掉酒馆/灯/雨的硬编码（`describeScene` 改成 `pack.scene` + 地点与在场，与 `session.ts:438` 同形），名字泄漏正则由 `pack.names` 生成，`--auto` 脚本按世界分表（未知世界直接报错）。

**验收**

- `loadContentPack(contentPathFor('westworld'))` 零错误。
- `AI_WORLD=westworld pnpm play --beats 3 --auto` 跑完不崩、体检表名字泄漏 0。
- `AI_WORLD=starter-town pnpm play --beats 3 --auto` 行为与改动前一致（原脚本仍可用）。

### T3 模拟运行与验收

**依赖** T1、T2。

- CLI：`AI_WORLD=westworld pnpm play --beats 20`，人工/脚本输入 20 拍，导出体检表。
- 浏览器：起服务端 + 前端，走一轮（选包 → 首屏 → 3 拍 → 开新局）。
- 验收条目：声音（抽查 3 拍）、循环感（两次进镇至少 1 次重复）、`kind:'self'` ≥1 条、passage 无 `机器人/程序/宿主/人造人/AI/循环/重置`、无 id、无绝对时间、`no_rate` 15–40%、`facts/beat` ≤1.0。
- 产出：`docs/research/westworld-run-20.md`（体检表 + 3 段样本 + 未达标项）。