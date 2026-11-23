# V3 操作手册

本手册补充[总流程](workflow.md)。在 Skill 根目录运行以下命令；项目与 Skill 源码分目录保存。

## 1. 核对安装与初始化

确认宿主实际使用的 Skill 名称和位置；仅把源码检出到工作区不代表宿主已经注册。测试时记录 Git commit、已加载入口文件的 SHA-256、Node 版本、命令退出码。无真实注册或独立编辑入口时标记为未验证。不得覆盖现有 Skill 或小说；本阶段不使用 Google Drive。

旧 V3 项目需先显式执行 `node scripts/init_v3_state.mjs <项目目录> --enable-r2 --json` 激活 R2；旧章不能伪造审稿通过记录。**新项目初始化默认启用 R2 和 Stage 2 规划门禁**；已有项目若明确切换到新的规划协议，应运行 `node scripts/init_v3_state.mjs <项目目录> --enable-plan-gate --json`，自动撤销旧规划批准状态，要求真实规划评审和作者重新确认。不静默迁移既有作品。

按原版[写作计划](../flows/phase2-planning.md)在新项目中建立 `02-写作计划.json`，再运行：

```sh
node scripts/init_v3_state.mjs <项目目录> --json
node scripts/init_chapter_summaries.mjs <项目目录>
```

规划好未来章节但不要提前建立空正文。作者明确确认创意方向后，才能记录 `creativeDecision=accepted`；`storyPlanApproved=true` 只能在新版规划门禁通过并收到作者明确批准后由脚本登记，不得手动改写。

## Stage 2 正式规划审核、返工、复审与批准

遵循 [Stage 2 审核协议](plan-review-protocol.md)。先将创意诊断、完整剧透梗概、规则及资源台账、人物弧线、全书/分卷/故事弧/近三章细纲、读者兑现节奏写入原生规划文件；它们必须真实存在，不能仅保存在一次性的实验报告中。

规划 Agent 完成初步自查后，运行：

    node scripts/plan_review.mjs <项目目录> prepare --planner-run-id REAL_PLANNER_RUN --planner-context-id REAL_PLANNER_CONTEXT

产生不可覆盖、带 revision 的 reviews/plan/input-vN.json。冻结内容包括 00-人物档案.md、01-大纲.md、03-文风基准.md 的基准部分，以及 02-写作计划.json 的稳定章节/标题/字数设置字段；章节状态与写作过程数据不计入冻结哈希。

在两个真实隔离的执行上下文分别执行架构编辑 architecture、读者编辑 reader；二者只读冻结内容，不接受规划 Agent 的自评分或对方评论。审核 JSON 至少含 schemaVersion、kind:"plan"、role、revision、artifactHashes、reviewer (kind/runId/contextId)、decision、summary、checks、issues。每个角色必须逐项覆盖协议列出的五个检查 ID，给出具体依据；缺陷引用必须实际出现在所审 Markdown。报告源文件准备好后执行：

    node scripts/plan_review.mjs <项目目录> submit --role architecture --report reviews/plan-architecture-source.json
    node scripts/plan_review.mjs <项目目录> submit --role reader --report reviews/plan-reader-source.json

出现未解决 BLOCKER/MAJOR，必须局部修复涉及的资源/时间/因果或阅读节奏，并检查上下游卷纲；重新 prepare 产生 vN+1、两路重审。修改报告状态而不修改蓝图，不能算完成返工。

两份独立报告均为 pass_candidate 后，状态只能是 awaiting_approval。作者审定当前版本的完整故事概览、审稿结论及已知风险，发送**真实明确批准消息**后，将 schemaVersion:1、kind:"plan"、approved:true、revision、inputSha256、reviewSha256:{architecture,reader}、approvedAt、quote、source 记录到项目内的 reviews/plan-author-evidence.json；不得由 Agent 模拟：

    node scripts/plan_review.mjs <项目目录> approve --evidence reviews/plan-author-evidence.json
    node scripts/plan_review.mjs <项目目录> verify
    node scripts/v3_gate.mjs <项目目录> --chapter 1 --json

通过这些命令只表明文件、哈希、角色声明与批准记录的结构一致；是否真的存在独立子代理或真实作者同意，仍应对照宿主日志与原始聊天消息。后续章节新事实写入 story-ledger.json；重大规划变更必须再次审批。03-文风基准.md 的“本书校准段落”标题之后可追加已写正文带来的校准，不需要为此重新批准整个故事蓝图。

## 逐章账本交接

写第 N 章前用 N−1 作为截止章；第 1 章用 0。先根据本章提纲挑选会被回提的事实 ID，再运行交接。输出分为三部分：

- `baseline`：截至目前的故事时间，以及仍有效的 `scope:"global"` 条目。只给会跨多章约束叙事的世界规则、重要事件、角色已知或误信的事项标全局，普通场景细节不入基线。开篇前已锁定的设定可用 `chapter:0`，未发生的规划不能当成事实。
- `lastHandoff`：上一章的新事件、知情变化和关系变化。首章为空。
- `historyAnchors`：通过可重复的 `--anchor ID` 只取本章要回提且已经发生的早期条目。若已有后续事实替代，会标为历史状态，不与现态混用。用大纲或账本的相关条目定位 ID，不把整本账本交给写手。

将三块中与本章有关的内容交给写手，然后按正常文风写作。已立时间优先于规划；如有矛盾先回查已写正文，未知时间标明不明，不能猜成事实。

```sh
node scripts/audit_story_state.mjs <项目目录> --upto 0 --handoff --json
# 写完第 1 章，完成字数检查、摘要、账本和计划状态后：
node scripts/audit_story_state.mjs <项目目录> --upto 1 --handoff --json
# 写第 3 章前，提取刚完成的第 2 章和第 1 章的 F1：
node scripts/audit_story_state.mjs <项目目录> --upto 2 --handoff --anchor F1 --json
```

写后用 `asOf` 记录章末主时间线的落点，另按时间顺序记录可交接事件和本章人物知情变化。沿用故事内日历，或把已知起点锚定为 D+0，再用 D+1 等相对日；只有在正文已确立时才填精确时间。倒叙或并行事件说明其与主线的关系。没有知情变化时保留空数组；角色误信使用 `kind:"character-belief"`，推测用 `provisional`。全局状态变化时用 `supersededBy` 指向新事实 ID；不要将互相矛盾的全局值同时当现状。

以下是 `story-ledger.json` 的单章结构示例，后续增量加入，不覆盖已有条目；各分类条目的 `id` 全局唯一：

```json
{
  "schemaVersion": 1,
  "facts": [
    {"id":"G1","chapter":0,"scope":"global","kind":"established","subject":"登记室","key":"规则","value":"只能由当班人员核对登记件","evidence":"已锁定的故事设定"},
    {"id":"F1","chapter":1,"kind":"established","subject":"值班单","key":"登记日期","value":"D+0","evidence":"第1章，值班员登记场景"}
  ],
  "foreshadowing": [{"id":"P1","chapter":1,"status":"open","description":"柜内还有一张未写日期的值班单"}],
  "relationships": [{"id":"R1","chapter":1,"characters":["甲","乙"],"change":"乙答应保管副本","consequence":"甲次日须向乙取回"}],
  "mechanisms": [{"id":"M1","chapter":1,"goal":"留下凭证","strategy":"登记值班单","opposition":"对方要求口头通知","cost":"承诺次日到场","outcome":"留下登记件"}],
  "handoffs": [{"chapter":1,"asOf":"D+0 19:00","events":[{"when":"D+0 19:00","event":"甲登记值班单并把副本交给乙"}],"knowledge":[{"character":"乙","change":"已知登记件存在，未读正文"}]}]
}
```

写后使用本章章号校验；退出非 0 则回查本章原稿和账本，先修正再开下一章。恢复会话时可重跑同一只读检查。此模式验证字段和交接是否齐全；日期冲突和因果仍须按原文独立审计。早期账本没有交接记录时需要从正文补齐；不自动迁移，不覆盖测试基线。

## R2 逐章独立审稿与三章循环

### 每章审稿：第 N 章
1. 写作 Agent 完成初稿与常规自查，运行字数脚本，在计划中记录 `wordCount`、`wordCountPass:true`，但本章保持 `in_progress`；不得将作者自查当成独立审核。
2. 使用宿主可查的真实写手运行与上下文 ID，冻结当前正文哈希并生成审稿包：

```sh
node scripts/r2_review.mjs <项目目录> prepare --scope chapter --end N --writer-run-id REAL_WRITER_RUN --writer-context-id REAL_WRITER_CONTEXT
```

3. 在**另一个真实执行上下文**启动审核 Agent，提供冻结正文、必要前文/设定和 [R2 独审模板](r2-review-agent-template.md)。不提供作者自评分或私有构思；保存宿主运行证据及实际输入。审核 Agent 不直接修改正文。
4. 编辑根据审稿包写报告 JSON，存入项目内源文件（如 `reviews/editor-submission.json`）。登记并绑定哈希：

```sh
node scripts/r2_review.mjs <项目目录> submit --scope chapter --end N --report reviews/editor-submission.json
```

5. 如果有证实的缺陷，写手只修有问题的文本或账本；**正文任何变化都须重新 prepare、重新独立审稿和 submit**。获得 `pass_candidate` 后才能标记该章 `completed`、以最终正文更新摘要与事实账本，再运行写后交接校验。
6. 写下一章前运行：

```sh
node scripts/v3_gate.mjs <项目目录> --chapter NEXT_N --json
```

### 每三章整体审稿：第 6、9、12……章
第 3 章继续沿用原有 Pilot 独立审稿和作者确认，不生成重复的三章 R2 报告。第 6、9、12……章在完成单章审核、章节定稿、账本交接后，再由独立上下文连读最近三章，审查人物发展、剧情推进、悬念兑现、重复机制、节奏与追读意愿：

```sh
node scripts/r2_review.mjs <项目目录> prepare --scope arc --end 6
node scripts/r2_review.mjs <项目目录> submit --scope arc --end 6 --report reviews/arc-submission.json
node scripts/v3_gate.mjs <项目目录> --chapter 7 --json
```

以后把结束章号替换为 9、12……，但不需要每次再次请求作者批准。原本每五章账本审计仍单独执行。

### 审稿报告 JSON 最小格式

```json
{
  "schemaVersion":1,"kind":"chapter","end":1,"revision":1,
  "manuscriptHashes":{"1":"<从真实准备包复制 SHA-256>"},
  "reviewer":{"kind":"independent_agent","runId":"<真实审稿运行 ID>","contextId":"<真实审稿上下文 ID>"},
  "decision":"pass_candidate","summary":"本章已核查的人物、时间及因果问题",
  "issues":[]
}
```

每个问题包含 `id,severity,status,chapter,quote,reason,suggestion`，如果 `status=accepted` 还须给 `acceptanceReason`。只有未发现未解决的 BLOCKER/MAJOR，报告才允许 `pass_candidate`；任何 BLOCKER 不可通过简单接受风险放行。

### 成书最终门禁

```sh
node scripts/v3_gate.mjs <项目目录> --finalize LAST_N --json
```

审核包/报告不可覆盖旧修订号，保存在 `reviews/r2/`；正文或报告变动后当前审稿无效。脚本只验证文件哈希、字段、写手/审稿者**声明的**运行上下文 ID 不相同，无法证明实际存在独立子 Agent。必须结合 Gemini Tasks 真实调用日志核验；无独立 Agent 时停止而非假装通过。本轮不接入 Google Drive。
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

后续每章写作前执行对应章号的门禁；R2 要求每章独立审稿和每三章整体独审；完成第 5、10 章时，用 `validate_project.mjs --upto N` 验证到该章，再运行 `node scripts/audit_story_state.mjs <项目目录> --upto N --write --json`，由编辑检查机制重复、人物变化和追读体验。全书完成后才省略 `--upto` 做全量校验。结构化报告和退出码不是文学评分。
