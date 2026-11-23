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
      "reviewInputPath": null,
      "reviewPath": null,
      "reviewSha256": null,
      "reviewedChapterHashes": {},
      "reviewDecision": null,
      "approvedAt": null,
      "approvalPath": null,
      "approvalSha256": null,
      "humanApproved": false
    },
    "backup": { "lastVerifiedSnapshot": null }
  }
}
```

- `status` 从 `pending` 进入 `under_review`。审稿要求返工时进入 `revise`，通过候选进入 `awaiting_approval`，只有真实作者确认入档后才进入 `passed`。修改前三章后须生成新版本的审稿包；不得直接写 `passed`。
- 独立审稿记录必须绑定前三章 SHA-256。新修订将旧审稿置为过期，不能只改 JSON 的状态来冒充通过。
- 作者批准需有对话证据和日期，审稿 Agent 不可代签。
- `reviewDecision` 须是 `pass_candidate`，且 `humanApproved=true`、三个章节完整、审稿报告文件存在，才能放行第四章。
- 正文的章节编号与章节文件由写作计划唯一定位；不要擅自扫描其他文件替代既有计划。

## 3. 持久化准则
- 本地 Tasks 远程工作区作写作源，但不视为永久硬盘。
- 本阶段不接入 Google Drive 或其他云端备份，不读取、上传、下载或同步小说数据；Skill 源码仓库不是小说备份。
- 用户需要本地快照时，使用完整 ZIP 存储各章、设定、审核、计划与 manifest。生成或恢复失败时保留已有正文，不将快照记为有效。
- 新任务先读取现有本地计划；经用户同意从本地快照恢复时，选已验证的版本，并恢复到独立空目录，避免覆盖。

## 4. 工具边界
- `scripts/v3_gate.mjs` 检查第四章以后创作前的门禁条件；原版脚本仍负责字数与项目状态。
- `scripts/create_snapshot.py` 创建完整 ZIP 和 SHA 清单，只处理本地文件，不负责登录 Drive。
- ZIP 解压前运行 `python3 scripts/verify_snapshot.py <快照.zip>`；使用 `python3 scripts/restore_snapshot.py <快照.zip> <空目录>`，拒绝路径穿越、重复条目和覆盖已有文件，先验证后恢复。
