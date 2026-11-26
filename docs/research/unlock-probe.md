# 成交 / 解锁探针（unlock-probe）

- 2026-11-26
- 模型：`opencode-go/deepseek-v4.1-flash`（cognition / referee / narration / suggest）
- 命令：`experiment-multi-round.ts --beats 8 --mode baseline --tag unlock-probe --unlock --force`
- 目的：补 M1 的“威士忌成交 / 铁盒解锁”只被拒绝路径覆盖的缺口。

## 1. 威士忌成交：已经在 baseline-20 成功

`baseline-20` 第 6 拍：

| actor | op | 结果 |
| :--- | :--- | :--- |
| player | `transfer` player→counter `silver-dollar 2` | 钱离手 |
| ann | `transfer` counter→ann `silver-dollar 2` | 安收钱 |
| ann | `transfer` counter→player `whiskey 1` | 倒一杯 |
| ann | `transfer` ann→player `cup 1` | 给杯子 |

四条都 `ok`；这不是“只被拒绝路径覆盖”。M1 当时缺的成交路径已经在真实模型里跑通。

## 2. 铁盒解锁：8 拍探针全部被角色挡住

固定输入：

1. 店内坐下
2. 问安铁盒里是不是账本
3. 问格蕾妮借钥匙
4. 两枚银元放在柜台上，只看一眼账本
5. 趁格蕾妮转身去摘钥匙串
6. 拿钥匙开铁盒
7. 打开铁盒拿账本
8. 翻开账本问最后一页

结果：

| 拍 | 玩家主张 | 结果 |
| :--- | :--- | :--- |
| 2 | 问账本 | `ok`，没有 op |
| 3 | 借钥匙 | `ok`，没人答应，钥匙仍在格蕾妮腰上 |
| 4 | 放银元 | `transfer` player→counter 2，钱落到柜台 |
| 5 | 摘钥匙 | **拒绝**：格蕾妮没转身，手肘挡住；科迪卡位 |
| 6 | 拿钥匙开盒 | **拒绝**：钥匙仍在格蕾妮腰上 |
| 7 | 开盒拿账本 | **拒绝**：铁盒仍锁着，没有钥匙/撬具 |
| 8 | 翻账本 | **拒绝**：账本还在锁着的铁盒里 |

8 拍：`no_rate 10.0%`、空结果 72.5%、硬冲突 0、`transfer` 3（主要是银元/杯子）、`phys` 0；没有一次 `strongbox locked=false`，也没有 `ledger-book` 易手。

## 3. 结论

- **威士忌成交成立**：baseline-20 第 6 拍已完整落账，M1 的成交缺口关闭。
- **铁盒解锁不是机制缺陷，是内容 gate**：安的 core 写明“账本锁在铁盒里，谁也不给看”，格蕾妮一直守着钥匙；偷钥匙被合理拒绝。`phys locked`/钥匙/账本转移的 op 在账本单测里可用，但 starter-town 没有给出一条社会路径。
- 如果要在 starter-town 里成功解锁，需要改内容/角色（安的信任、借钥匙、钥匙暂时离身），不是改裁判或加新 op；这属于叙事设计，不是代码修复。

## 4. 风险

- 只试了“偷钥匙”这一条路径；没有试长期信任、交易、威胁等社会路径。
- 8 拍样本小；`no_rate 10%` 是 4 次有依据的拒绝，不是裁判过度拒绝的证据。
- 真实模型里 `phys strongbox locked=false` 仍未出现；机制只由单测覆盖。
