# `GET /api/session` — 玩家投影

## 1. 请求

无参数。

## 2. 响应

`data` 结构：

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| title | 是 | string | | 世界标题，来自 `ContentPack.title` |
| opening | 否 | string | | 首屏散文，来自 `ContentPack.opening`；缺失时前端回退场景卡 |
| clock | 是 | number | ≥0 | 当前世界时刻（分钟） |
| clockText | 是 | string | | `fmt(clock)` 的结果，客户端不得自行格式化 |
| state | 是 | PlayerState | | 见 §2.1 |
| beats | 是 | BeatView[] | | 按 `seq` 升序，含全部已发生的拍 |
| inFlight | 是 | boolean | | 是否有拍正在结算（重连后用来恢复等待态） |
| worlds | 否 | `{id,title,active}[]` | 按 `id` 升序 | 可选世界列表；由服务端在 `session.view()` 里补上，`playerView()` 纯函数投影不产生它，缺省表示“只有当前世界可选” |

### 2.1 PlayerState

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| place | 是 | string | | 玩家所在地的**显示名** |
| here | 是 | string[] | | 同地点其他在场者的显示名，不含玩家自己 |
| holds | 是 | `{name,count}[]` | count ≥1 | 玩家持有物显示名与数量；空数组表示空手 |
| knows | 是 | `{text,clockText,superseded}[]` | | 玩家已知事实，按发生时间升序 |
| knows[].superseded | 是 | boolean | | 该事实已被推翻（仍然列出，不删除） |

**禁止出现**：实体 id、物品 id、地点 id、`claim` `verdict` `delta` `heat` `rel` `drives` `beliefs` `core` `token` `cost` `no_rate` `notes`。

### 2.2 BeatView

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| seq | 是 | number | ≥1 | journal 的 seq，仅用于稳定列表键；界面不展示 |
| clock | 是 | number | | 本拍结束时刻 |
| clockText | 是 | string | | 时间分隔条文案 |
| player | 否 | string | | 玩家本拍输入原文；缺省表示本拍没有玩家发言 |
| playerTo | 否 | string | | 本拍玩家说话对象的显示名；缺省表示对所有人/无目标 |
| passage | 否 | string | | 旁白正文；缺省表示 passage 落盘失败 |
| fallback | 是 | boolean | | `true` = 旁白失败，`passage` 是事实摘要兜底 |
| hints | 否 | string[] | | 本拍生成的动作提示（≤3 条）；失败时缺省，不影响正文 |

**数据来源**：`journal.jsonl`（取 `claims` 里 `actor === player` 的文本、`clock`）与 `passage.jsonl`（取 `text`、`source`）按 `PassageEntry.beatSeq` 连接；旧日志无 `beatSeq` 时按 `clock` 顺序回退匹配。

### 2.3 WorldView

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| id | 是 | string | `^[a-z0-9-]+$` | 包文件名（不含 `.json`），用作选择参数 |
| title | 是 | string | | 该包 `ContentPack.title`；读不到时退回 id |
| active | 是 | boolean | | 当前世界；恰好一条为 true |

`worlds[].id` 是**包名**，不是实体 / 物品 / 地点 id，不受上面的禁止清单约束；界面只展示 `title`。

## 3. 静态资源

| 路径 | 行为 |
| :--- | :--- |
| `/api/*` 未匹配 | JSON 404，`code: "E_NOT_FOUND"` |
| 命中 `packages/web/dist` 下的文件 | 直接返回（`resolve` 后必须仍在 dist 内，防目录穿越） |
| 其余 GET | 返回 `index.html`（SPA fallback） |
| `dist` 不存在 | 返回 JSON 404 并提示先执行 `pnpm build`，不崩 |

## 4. 示例

```json
{
  "code": "0",
  "msg": "success",
  "data": {
    "title": "雨夜酒馆",
    "opening": "雨把街灯打得只剩一团黄。你推门进来，门轴在身后自己合上。",
    "clock": 1450,
    "clockText": "第 2 天 · 夜",
    "state": {
      "place": "酒馆",
      "here": ["安", "医生"],
      "holds": [{ "name": "银元", "count": 3 }],
      "knows": [
        { "text": "安欠了科迪两枚银元。", "clockText": "第 1 天 · 傍晚", "superseded": false },
        { "text": "账本藏在柜台下面。", "clockText": "第 1 天 · 深夜", "superseded": true }
      ]
    },
    "beats": [
      {
        "seq": 1,
        "clock": 1450,
        "clockText": "第 2 天 · 夜",
        "player": "我推门进去，找了个靠门的位子坐下。",
        "playerTo": "安",
        "passage": "雨顺着门缝往里渗。安没有抬头，先把杯子收走，才开口。",
        "fallback": false,
        "hints": ["问安账本的事", "把湿外套搭在椅背上", "看一眼地窖门"]
      }
    ],
    "inFlight": false
  }
}
```
