# 公共约定

所有端点共用本文约定；单端点细节见同目录 `10-` / `20-` / `30-` 文件。

## 1. 地址与传输

| 项 | 约定 |
| :--- | :--- |
| 基址 | `http://127.0.0.1:<port>/api`；只绑回环，**不做鉴权**（单机单人） |
| 开发态端口 | 服务端 `8787`，Vite dev `5173`（`/api` 反代到 8787） |
| 生产态端口 | 单进程，`8787`，同时托管 `packages/web/dist` |
| 请求体 | `Content-Type: application/json`，UTF-8 |
| 响应体 | `application/json; charset=utf-8`，结构见 §2 |
| 流式响应 | `text/event-stream`，帧格式见 §3 |

## 2. 响应体结构

| 字段 | 是否必选 | 数据类型 | 取值范围 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| code | 是 | string | | 错误码，默认 `"0"` |
| msg | 是 | string | | 错误码对应说明信息，默认 `"success"` |
| data | 否 | object | | 响应数据；错误时省略 |

```json
{ "code": "0", "msg": "success", "data": {} }
```

流式端点（`POST /api/beat`）的失败不走本结构，走 SSE 的 `error` 帧。

## 3. SSE 帧格式

```text
event: <帧名>
data: <单行 JSON>

```

| 项 | 约定 |
| :--- | :--- |
| 分隔 | 帧之间空一行；`data` 必须单行 JSON |
| 心跳 | `progress` 帧每秒一次，兼作心跳 |
| 终止 | 成功以 `done` 结束，失败以 `error` 结束；两者之后不再发帧 |
| 断连 | 客户端断开后服务端不中止已提交的拍，也不补发；重连靠 `GET /api/session` 全量重建 |
| 顺序 | `progress`* → (`passage` → `state` → `done`) 或 (`error`) |

## 4. 时间

- 所有时间以 `clock`（分钟数）传输，另附 `clockText`（`fmt(clock)` 的结果）。
- 响应里**不出现**日期、绝对时刻；时段名只由服务端 `fmt(clock)` 生成。
- 客户端不得自行格式化时间。

## 5. 幂等与并发

| 端点 | 幂等 | 并发 |
| :--- | :--- | :--- |
| `GET /api/session` | 是 | 允许 |
| `GET /api/author/*` | 是 | 允许 |
| `POST /api/beat` | 否 | **单飞**：已有拍在结算时返回 `E_BEAT_IN_FLIGHT` |
| `POST /api/reset` | 否 | 与 `/beat` 互斥 |
| `POST /api/author/content` | 否 | 与 `/beat` 互斥 |
