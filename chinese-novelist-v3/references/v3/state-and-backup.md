# V3 项目状态、门禁和不可变备份

## 1. 工程源
沿用 `00-人物档案.md`、`01-大纲.md`、`02-写作计划.json`、`03-文风基准.md`、`99-章节摘要.md` 和原版 Node.js 工具。
新增（按需）：`04-创意竞标.md`、`05-分卷蓝图.md`、`reviews/`、`backups/`、`story-mechanism-ledger.md`。
项目文档中区分“计划设定／正文已确立事实／角色误信／待核实事实”。不同文件对同一事实矛盾时，先回查正文及修订记录，不自动选择新版本覆盖旧版本。

## 2. 计划 JSON 的 V3 字段
`02-写作计划.json` 保留原版全部字段，额外增加以下结构：

```json
{
  "v3": {
    "schemaVersion": 1,
    "creativeDecision": "accepted",
    "storyPlanApproved": true,
    "pilotGate": {
      "status": "pending",
      "revision": 0,
      "reviewPath": null,
      "reviewedChapterHashes": {},
      "reviewDecision": null,
      "approvedAt": null,
      "humanApproved": false
    },
    "backup": { "lastVerifiedSnapshot": null }
  }
}
```

- `status` 仅允许 `pending` → `under_review` → `revise` / `passed`。修改前三章后回到 `under_review`；不得从 `pending` 直接写 `passed`。
- 独立审稿记录必须绑定前三章 SHA-256。新修订将旧审稿置为过期，不能只改 JSON 的状态来冒充通过。
- 作者批准需有对话证据和日期，审稿 Agent 不可代签。
- `reviewDecision` 须是 `pass_candidate`，且 `humanApproved=true`、三个章节完整、审稿报告文件存在，才能放行第四章。
- 正文的章节编号与章节文件由写作计划唯一定位；不要擅自扫描其他文件替代既有计划。

## 3. 持久化准则
- 本地 Tasks 远程工作区作写作源，但不视为永久硬盘。
- 外部 Google Drive / Git 可备份，用完整不可变 ZIP 快照存储，包括本书各章、设定、审核、计划及 manifest。
- 上传后必须从远端回读并验证 ZIP SHA-256，才将 `backups/verified-<快照ID>.json` 标为有效。
- 备份失败不影响本地已完成正文，但不得声称“备份成功”；后续任务应重试。
- 新任务先读取本地计划，再检查是否存在需要恢复或冲突的版本；优先最新**已验证**快照，不只按日期猜测。
- 云端上传 .md 的转换行为依赖具体连接器；优先 ZIP 以规避不保真的转码。不要默认连接器支持原地覆写或删除。
- 建议每章结束生成可恢复快照，每五章保留明确里程碑；旧快照保留策略由用户决定。

## 4. 工具边界
- `scripts/v3_gate.mjs` 检查第四章以后创作前的门禁条件；原版脚本仍负责字数与项目状态。
- `scripts/create_snapshot.py` 创建完整 ZIP 和 SHA 清单，只处理本地文件，不负责登录 Drive。
- 上传、回读、校验、记录云端文件 ID 由宿主 Agent 的**真实连接器调用**负责。没有写入权限时报告阻断，不应伪装上传。
- ZIP 解压前运行 `python3 scripts/verify_snapshot.py <快照.zip>`；使用 `python3 scripts/restore_snapshot.py <快照.zip> <空目录>`，拒绝路径穿越、重复条目和覆盖已有文件，先验证后恢复。
