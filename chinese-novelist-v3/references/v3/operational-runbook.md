# V3 操作手册

本手册补充[总流程](workflow.md)。在 Skill 根目录运行以下命令；项目与 Skill 源码分目录保存。

## 1. 核对安装与初始化

确认宿主实际使用的 Skill 名称和位置；仅把源码检出到工作区不代表宿主已经注册。测试时记录 Git commit、已加载入口文件的 SHA-256、Node 版本、命令退出码。无真实注册或独立编辑入口时标记为未验证。不得覆盖现有 Skill 或小说；本阶段不使用 Google Drive。

按原版[写作计划](../flows/phase2-planning.md)在新项目中建立 `02-写作计划.json`，再运行：

```sh
node scripts/init_v3_state.mjs <项目目录> --json
node scripts/init_chapter_summaries.mjs <项目目录>
```

规划好未来章节但不要提前建立空正文。真实作品的创意与规划由作者确认后，才记录 `creativeDecision=accepted`、`storyPlanApproved=true`。

## 逐章账本交接

写第 N 章前查看上一章交接；第 1 章用 0，没有上一章。命令输出当前要衔接的一章，不把整本账本交给写手。写作上下文只补充本章涉及的较早事实、相关人物已知或误信的信息，并按正常文风写作。已立时间优先于规划；如有矛盾先回查已写正文，未知时间标明不明，不能猜成事实。

```sh
node scripts/audit_story_state.mjs <项目目录> --upto 0 --handoff --json
# 写完第 1 章，完成字数检查、摘要、账本和计划状态后：
node scripts/audit_story_state.mjs <项目目录> --upto 1 --handoff --json
```

写后记录时间锚、按时间顺序可交接的关键事件和本章人物知情变化。沿用故事内日历，或把已知起点锚定为 D+0，再用 D+1 等相对日；只在正文已确立时填精确时间。跨日、倒叙或并行事件以条目说明来由。没有知情变化时保留空数组。不填未发生的计划；标示角色推测与事实的区别。

以下是 `story-ledger.json` 的单章结构示例，后续增量加入，不覆盖已有条目；各分类条目的 `id` 全局唯一：

```json
{
  "schemaVersion": 1,
  "facts": [{"id":"F1","chapter":1,"kind":"established","subject":"值班单","key":"状态","value":"已登记","evidence":"第1章，值班员登记场景"}],
  "foreshadowing": [{"id":"P1","chapter":1,"status":"open","description":"柜内还有一张未写日期的值班单"}],
  "relationships": [{"id":"R1","chapter":1,"characters":["甲","乙"],"change":"乙答应保管副本","consequence":"甲次日须向乙取回"}],
  "mechanisms": [{"id":"M1","chapter":1,"goal":"留下凭证","strategy":"登记值班单","opposition":"对方要求口头通知","cost":"承诺次日到场","outcome":"留下登记件"}],
  "handoffs": [{"chapter":1,"events":[{"when":"D+0 19:00","event":"甲登记值班单并把副本交给乙"}],"knowledge":[{"character":"乙","change":"已知登记件存在，未读正文"}]}]
}
```

写后使用本章章号校验；退出非 0 则回查本章原稿和账本，先修正再开下一章。恢复会话时可重跑同一只读检查。此模式验证字段和交接是否齐全；日期冲突和因果仍须按原文独立审计。早期账本没有交接记录时需要从正文补齐；不自动迁移，不覆盖测试基线。

## 2. 前三章与独立审稿

依次写完 1–3 章，更新计划状态、摘要和账本。检查实际字数和文件，再固化本次稿件：

```sh
node scripts/validate_project.mjs <项目目录> --upto 3 --json
node scripts/prepare_pilot_review.mjs <项目目录> --json
node scripts/v3_gate.mjs <项目目录> --chapter 4 --json
```

最后一条此时应退出 1，且不得开始第四章。把命令生成的 `reviews/pilot-input-vN.json`、对应三份正文、必要设定和[编辑模板](review-agent-template.md)交给独立编辑。不要交付作者自评分；保留宿主可见的子任务运行记录和实际输入清单。

让编辑产出可阅读的报告，以及包含 `schemaVersion: 1`、`revision`、`reviewer.kind`、`reviewer.runId`、`manuscriptHashes`（键为 `"1"`、`"2"`、`"3"`）、`decision`、`summary`、`strengths`、`issues` 的 JSON。每条问题包含 `id`、`severity`、`status`、`chapter`、`quote`、`reason`、`suggestion`；接受的问题须注明 `acceptanceReason`。先核对引用与正文，再登记：

```sh
node scripts/submit_pilot_review.mjs <项目目录> reviews/editor-report-vN.json --json
```

报告源文件不能与脚本生成的 `reviews/pilot-review-vN.json` 同名。返工后重新校验字数并生成新审稿包；已有待审或通过记录时，只在确认确有修改后给 `prepare_pilot_review.mjs` 加 `--restart`。编辑通过候选只进入 `awaiting_approval`。

## 3. 作者批准与里程碑

出示当前版本正文和审稿结论，等作者明确同意本版再继续第四章。审批 JSON 需记录实际消息的 `quote`、`source`、`approvedAt`，并绑定 `schemaVersion: 1`、`approved: true`、`revision`、`reviewSha256`。不得由写手或编辑代签。仅限明确标注的独立测试夹具使用模拟凭据，不得把夹具状态复制到真实项目。

```sh
node scripts/record_pilot_approval.mjs <项目目录> --evidence reviews/author-approval-vN.json --json
node scripts/v3_gate.mjs <项目目录> --chapter 4 --json
```

后续每章写作前执行对应章号的门禁；完成第 5、10 章时，用 `validate_project.mjs --upto N` 验证到该章，再运行 `node scripts/audit_story_state.mjs <项目目录> --upto N --write --json`，由编辑检查机制重复、人物变化和追读体验。全书完成后才省略 `--upto` 做全量校验。结构化报告和退出码不是文学评分。
