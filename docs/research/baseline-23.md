# 带道具的 20 拍基线（baseline-23，2026-11-26）

- 模型：`opencode-go/deepseek-v4.1-flash`（cognition / referee / narration / suggest）
- 命令：`env -u PI_MODEL node --experimental-strip-types scripts/experiment-multi-round.ts --beats 20 --mode baseline --tag baseline-23 --force`
- 内容：C7 后的 `content/starter-town.json`（player coat、ann/granny rag、hook 承载点、strongbox open=false）。
- 检测器：C3；默认短句，无 `--focus`/`--long`/`--unlock`。
- 产物：`data/experiment/baseline-23/`（不入库）。
- **不是** baseline-22 的严格 A/B：起始内容多了道具，旧基线只能做方向参考。

## 汇总

| 指标 | baseline-23 | baseline-22（C7 前） |
| :--- | ---: | ---: |
| 拍数 / 折场 | 20 / 1 | 20 / 1 |
| 墙钟总耗时 / 每拍 | 1324.3s / 66.2s | 1341.5s / 67.1s |
| 时钟推进 | 32 分钟 | 32 分钟 |
| 裁决 / `no_rate` | 100 / **6.0%** | 100 / 8.0% |
| 空结果 | **69.0%** | 71.0% |
| `fact` / `transfer` / `phys` / `consume` / `know` | 17 / 13 / 2 / 0 / 0 | 16 / 9 / 2 / 0 / 0 |
| `facts/beat` | 0.85 | 0.80 |
| `fact/claim` | 0.17 | 0.16 |
| 硬冲突 / 双花 / 失败 op | 0 / 0 / 0 | 0 / 0 / 0 |
| 动作提示 | 20/20 拍，60 条 | 20/20 拍，60 条 |
| 段落 ≤3 的拍 | 15/20 | 16/20 |
| 输入 / 输出 tokens | 267.0k / 152.6k | 232.4k / 132.4k |

## 道具实际落账

| 操作 | 次数 |
| :--- | ---: |
| `player → hook` coat | 1 |
| `ann → counter` rag | 1 |
| `granny → counter` rag | 1 |
| `counter → strongbox` rag | 1 |
| `hook` move | 0 |
| `strongbox` phys | 0 |

- 外套挂到门边钉子；安和格蕾妮的抹布都挪到柜台，随后一块被放进/搁到铁盒上（`holds` 对非人实体是承载/放置，不是“盒内”）。
- `hook` 没有被 `move`；没有 `locked=true + open=true` 的矛盾；`open` 本轮没被使用。
- `strongbox` 的 `locked` 不阻止 `transfer` 到它（v1 没有锁/持有联合校验）；这条是既有边界，本轮没有失败 op。

## 读法

- 道具让 `transfer` 从 baseline-22 的 9 升到 13；空结果 69% 与 71% 基本同级，没发现“每句都硬塞 op”。
- `no_rate` 6.0%、`facts/beat` 0.85、段落 15/20；都在三次默认基线的波动范围内，不能归因于道具。
- 20/20 拍提示、hard/double/failed op 全 0；新内容没有引入硬冲突。
- 道具入账证明的是“可被账本使用”，不是“空结果应该降低”；纯对话仍占大头。

## 风险

- 单次 20 拍；内容变了，不能把 baseline-23 和 C7 前的数字当同一轨迹。
- `strongbox.open` 没有不变量；本轮没触发，但以后要观察锁态与开合是否矛盾。
- 同台面内坐标仍不建模；`holds` 只到承载面。
- `ann`/`granny` 各有一块抹布是内容选择；如果要唯一来源，需重分内容，不能靠文本推断。
