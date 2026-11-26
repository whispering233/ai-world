# 错误码

## 1. 错误码表

| code | msg |
| :--- | :--- |
| `"0"` | `"success"` |
| `"E_BEAT_IN_FLIGHT"` | `"上一拍还在结算"` |
| `"E_EMPTY_INPUT"` | `"玩家输入为空"` |
| `"E_NO_CONTENT"` | `"世界内容未加载"` |
| `"E_INVALID_CONTENT"` | `"内容校验失败"` |
| `"E_INVALID_BODY"` | `"请求体格式错误"` |
| `"E_UNKNOWN_WORLD"` | `"未知的世界"` |
| `"E_STORE_WRITE"` | `"日志写入失败"` |
| `"E_MODEL_CALL"` | `"模型调用失败"` |
| `"E_NOT_FOUND"` | `"资源不存在"` |
| `"E_INTERNAL"` | `"服务端内部错误"` |

## 2. 使用规则

- HTTP 状态码与 `code` 同时给：`0` → 200；`E_BEAT_IN_FLIGHT` / `E_INVALID_*` / `E_EMPTY_INPUT` / `E_UNKNOWN_WORLD` → 400（`E_BEAT_IN_FLIGHT` 用 409）；`E_NO_CONTENT` / `E_NOT_FOUND` → 404；`E_MODEL_CALL` / `E_STORE_WRITE` / `E_INTERNAL` → 500。
- `E_MODEL_CALL` 只在**裁判调用失败**时返回（整拍无进展）；人物认知失败不报错，该人物本拍沉默并记入 `notes`；旁白失败不报错，改用事实摘要兜底并把 `source` 标成 `fallback`。
- `E_INVALID_CONTENT` 的 `data.errors` 是 `string[]`，逐条来自 `validatePack()`。
- 错误信息面向**开发者**（作者模式直接展示）；玩家壳只展示自己的文案，不复述 `msg`。
