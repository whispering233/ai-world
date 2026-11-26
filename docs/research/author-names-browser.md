# 作者表单 `places` / `names` 浏览器验证

- 2026-11-26
- 目的：确认作者壳能改地点/实体显示名，空地点名会被拒绝，保存后开新局玩家视图真的用新名字。

## 1. 空地点名

- 内容面板把 `saloon` 清空，点“保存”。
- 返回错误“地点 saloon 缺少显示名”，弹窗不关闭、内容不写盘。
- 这是本轮补的 `validatePack` 检查；`names` 原本就有非空检查，`places` 之前漏了。

## 2. 改显示名

- 把 `names.ann` 改成“安妮”，`places.saloon` 改成“雨夜酒馆”。
- 保存后点“开新局（推荐）”；玩家壳状态行显示：
  - `雨夜酒馆 · 你身上：银元×2`
  - 在场 chips：`安妮 / 道森医生 / 科迪 / 格蕾妮`
- 下一拍正文用“安妮”称呼；`GET /api/session` 的 `state.place` 是“雨夜酒馆”，`state.here` 是“安妮…”。
- 玩家投影没有出现 `ann` / `saloon` id。

## 3. 发现的作者侧 caveat

- opening / core / voice / beliefs / canon 是作者写的散文，**不会因为 `names` 改了自动重写**。示例里开场仍是“安”，科迪的台词里也还会说“安”。
- 这不是玩家投影泄漏 id，而是作者改显示名后必须同步正文；表单已在 `names` 下加一行提示：“改显示名只影响玩家投影与上下文标签；core、voice、beliefs、canon 里的旧称呼不会自动改。”
- 如果以后要自动改，必须做一次全内容引用检查/替换，属于内容工具，不在本轮。

## 4. 验证环境

- 服务 `pnpm serve`；`content/starter-town.json` 与 `data/starter-town` 先备份，验证后恢复；服务已停。
- 测试 355、typecheck、build 绿。
- 截图：`C:\Users\17677\.betterwright\artifacts\85b42e1702877c85\proof-1795680559022-9e4dcf.png`（临时文件，不入库）。

## 5. 结论

- `places`/`names` 表单可用；空地点名被校验拦住；保存后新局生效。
- 作者壳只改标签，正文里的旧称呼要作者自己改；这条已写进表单提示和本节。
