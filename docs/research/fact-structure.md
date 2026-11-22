# fact 结构化：6 拍 smoke（2026-11-21）

- 模型：`opencode-go/deepseek-v4.1-flash`
- 命令：`rm -rf data && pnpm play -- --beats 6 --auto`
- 目的：确认 `actor` / `kind` 能被裁判填出、能落账本、能被体检表统计；**不是 20 拍密度回归**。

## 实测

| 指标 | 值 |
| :--- | ---: |
| 提交 claim | 30 / 30 |
| 已提交写操作 | 15 |
| fact | 10 |
| `actor` 覆盖 | 10 / 10 |
| `kind` 覆盖 | 10 / 10 |
| `facts/beat` | 1.67（6 拍样本） |

`kind` 分布：`speech` 6、`state` 2、`promise` 1、`other` 1。

## 样本

| seq | actor | kind | text |
| ---: | :--- | :--- | :--- |
| 3 | player | promise | player 当着众人承诺：明天中午之前还上那两枚银元 |
| 3 | ann | state | ann 定下明天中午点数银元、缺一枚不认的期限… |
| 3 | doc | speech | doc 表态：钱先由 player 拿着… |
| 4 | ann | other | 安收下两枚银元并给 player 倒了一杯威士忌… |
| 7 | cody | speech | 科迪当众指出：有人凑到道森医生耳边低声说了话 |

- `actor` 全部是账本里存在的实体 id；没有虚构实体。
- 混合事件（收钱 + 倒酒 + 要求交代）落成 `other`，没有硬塞进单一类别；这是可接受的降级。
- `actor` 覆盖率只证明“字段填了”，不证明语义全对；上面 5 条是人工抽检，不是全量语义校验。

## 不能宣称的事

- 这 6 拍的 `facts/beat = 1.67` **高于**已记录的 20 拍基线 1.20；单样本波动，不能据此说结构化让事实变多或变少。
- 没有跑 20 拍；W3b-C 不追密度，`facts/beat` 的长期目标仍是 ≤1.0。
- 旧 fact 无 `actor/kind` 的 replay 由单测覆盖；本次 smoke 的新 fact 全带字段，未覆盖混合旧数据。

## 结论

结构化字段的“产生 → 落库 → 排序 → 统计”链路已通：`describeFacts` 先看 `fact.actor` 是否在场，文本匹配作为回退。是否真的改善裁判的“主语归属”，要等更长的多场景样本；本轮只确认接口与数据可用。
