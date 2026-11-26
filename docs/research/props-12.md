# 道具/位置 12 拍 smoke（props-12，2026-11-26）

- 目的：确认新内容里的湿外套、抹布、门边钉子、铁盒盖能被裁判当账本状态使用，而不是只留在叙述里。
- 命令：`env -u PI_MODEL node --experimental-strip-types scripts/experiment-multi-round.ts --beats 12 --mode baseline --tag props-12 --force`
- 内容：C7 后的 `content/starter-town.json`（player coat 1、ann/granny rag 1、hook 承载点、strongbox open=false）。
- 产物：`data/experiment/props-12/`（不入库）。

## 结果

| 指标 | 值 |
| :--- | ---: |
| 拍数 / 墙钟 | 12 / 665.8s（55.5s/拍） |
| 时钟推进 | 17 分钟 |
| 裁决 / `no_rate` | 60 / 5.0% |
| 空结果 | 70.0% |
| 写操作 | `transfer` 10、`fact` 6、`phys` 2、`consume` 1 |
| 硬冲突 / 双花 / 失败 op | 0 / 0 / 0 |
| 动作提示 | 12/12 拍，36 条 |

## 道具实际落账

| 操作 | 次数 |
| :--- | ---: |
| `player → hook` coat | 1 |
| `hook → player` coat | 1 |
| `granny → counter` rag | 1 |
| `strongbox` phys | 0 |
| `hook` move | 0 |

第 1 拍就把湿外套挂到门边钉子，后面又取回；格蕾妮的抹布从身上挪到柜台。`hook` 没有被 `move`，`strongbox` 没有出现 `locked=true + open=true` 的矛盾状态。`open=false` 这条本轮没有被用到，留待解锁探针。

## 读法

- 外套/抹布已经从“文本细节”变成可持有、可转移的 item；`hook` 作为承载点可用，且没有进入人物/认知/claim。
- 空结果仍 70%，但这是 12 拍单次；新道具只解决了 7 条空结果中的一部分，台面内坐标仍未建模。
- `ann` 的 core 提到抹布，C7 同时给了 `ann.rag`；本轮没有出现“安抓不到抹布”的拒绝。
- 12 拍不是回归证明；它只证明新内容在真实裁判回合里可用。

## 风险

- `strongbox.open` 与 `locked` 没有不变量；本轮没有触发矛盾，但以后需要观察 `locked=true + open=true`。
- 同一台面内“挪半掌”仍不建模；换持有/承载面才是 `transfer`。
- `ann` 与 `granny` 各有一块抹布，是内容层选择；如果以后要唯一抹布，需重新分配，不要靠文本推断。
