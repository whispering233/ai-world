# `POST /api/beat` — 推进一拍（SSE）

## 1. 请求

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| text | 是 | string | 1–500 字 | 玩家本拍说的或做的；空串返回 `E_EMPTY_INPUT`，超长由服务端截断并在 `notes` 记一条 |

```json
{ "text": "我把两枚银元塞进安手里，要一杯威士忌。" }
```

## 2. 响应

`text/event-stream`。帧顺序：

```text
progress*  →  (passage → state → done)  |  error
```

| 帧名 | data 结构 | 何时发 |
| :--- | :--- | :--- |
| `progress` | `{elapsedMs, clockText}` | 每 1000ms 一次，兼作心跳；`clockText` 是本拍**开始前**的时刻 |
| `passage` | `BeatView`（见 [10-api-session.md](10-api-session.md) §2.2） | 本拍已落 journal，且旁白已成型（含 fallback） |
| `state` | `{clock, clockText, state}`，`state` 见 §2.1 | 紧接 `passage` |
| `done` | `{seq}` | 帧流结束；`seq` 为本拍 journal 序号 |
| `error` | `{code, msg}` | 失败；之后不再发帧 |

**没有 `passage` 帧就是没有发生**：只有裁判调用失败（`E_MODEL_CALL`）或内容未加载（`E_NO_CONTENT`）时才会没有 `passage`。旁白失败**不**属于这类——它会带着事实摘要兜底的正文发出，`fallback: true`。

## 3. 并发与中止

- 已有拍在结算时，本端点返回 HTTP 409 + `E_BEAT_IN_FLIGHT`，**不排队**。
- 客户端断开（`stream.onAbort` / `req.signal` / `close` 任一）：服务端中止在途的模型调用，**不落 journal、不落 passage**，世界不变。
- 中止只发生在提交之前。提交之后（`passage` 帧已发出）断开，服务端仍把 passage 写完落盘，重连后由 `GET /api/session` 补齐。
- 客户端不需要发取消请求；断开连接即为取消。

## 4. `POST /api/reset` — 开新局

| 项 | 约定 |
| :--- | :--- |
| 请求体 | 无 |
| 行为 | 与 `/api/beat` 互斥；清空 `data/<world>/journal.jsonl` 与 `passage.jsonl`，按**磁盘上当前内容包**重建世界与人物 |
| 响应 | `{code:"0", data:{title, clock, clockText}}` |
| 语义 | 内容编辑的**唯一生效路径**：保存内容后必须开新局，新内容才进入运行时 |
| 不可撤销 | 是。前端必须二次确认 |

## 5. 示例帧

```text
event: progress
data: {"elapsedMs":1000,"clockText":"第 2 天 · 夜"}

event: progress
data: {"elapsedMs":41000,"clockText":"第 2 天 · 夜"}

event: passage
data: {"seq":7,"clock":1452,"clockText":"第 2 天 · 夜","player":"我把两枚银元塞进安手里，要一杯威士忌。","passage":"安把银元按在掌心里，拇指搓了两下才收进围裙。","fallback":false}

event: state
data: {"clock":1452,"clockText":"第 2 天 · 夜","state":{"place":"酒馆","here":["安"],"holds":[],"knows":[]}}

event: done
data: {"seq":7}
```
