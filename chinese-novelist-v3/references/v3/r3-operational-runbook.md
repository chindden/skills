# R3 实验运行手册（P0-09）

适用范围：仅适用于明确启用 R3 的独立小说实验项目。默认 R2 项目继续遵循原 SKILL.md / workflow.md / plan-review-protocol.md。进度台账：docs/R3-PRD.md。

## 1. 试跑边界与项目准备

- 在 chinese-novelist-v3 目录执行下面的脚本。
- **必须另建实验小说目录，不能直接改 xianmen-dazhanggui-r2-stage2 原项目。**
- 四份规划文件是 00-人物档案.md、01-大纲.md、02-写作计划.json、03-文风基准.md。
- Markdown 必须符合 references/v3/r3-markdown-sections.md：固定 H2 核心/滚动分区、按卷连续的 H3 边界。
- 写作计划必须有非空 chapters 数组，chapterNumber / filePath 可用于对应正文。
- 允许全书完整剧透方向，但不要将不必要的中后卷桥段置入核心冻结区。

    node scripts/init_v3_state.mjs <独立R3项目> --enable-r3 --json
    node scripts/r3_plan_sections.mjs <独立R3项目> --json

上面仅建立实验状态并检查文件分区，不代表批准。R3 使用 v3.r3 命名空间，v3.schemaVersion 保持 1；不会静默迁移 R2 审核或已获批准状态。

## 2. 核心契约准备、双独审和作者批准

先由实际规划 Agent 提供真实的执行标识：

    node scripts/r3_plan.mjs <项目> core-prepare --planner-run-id REAL_RUN --planner-context-id REAL_CONTEXT

输出 inputPath / inputSha256 / snapshotPath / snapshotSha256。内容快照保留三份 Markdown 的核心切片与稳定 JSON 元信息。修订后新版本自动生成 Diff。

必须让两个真实且互不共享审稿结论的上下文分别阅读核心快照，提交 JSON：
- architecture 检查 world_rules_and_power、character_causality、foreshadowing_and_finale。
- reader 检查 genre_promise、opening_and_rewards、protagonist_agency，还需 preserveStrengths（三条确实值得保留的优点）。

每份报告必须有 schemaVersion=1、kind=r3_core、role、revision、snapshotSha256、reviewer.kind=independent_agent、真实 reviewer.runId/contextId、summary、checks、issues、decision。checks 各项须有 id/status/evidence。issues 如存在应有 id/severity/status/artifact/quote/reason/suggestion/evidenceLevel，严重缺陷另需 reverseDefense。原文引用必须出现在相应快照中。真正的 BLOCKER 不得豁免。

    node scripts/r3_plan.mjs <项目> core-submit --role architecture --report reviews/core-architecture-source.json
    node scripts/r3_plan.mjs <项目> core-submit --role reader --report reviews/core-reader-source.json

两位编辑都报告 pass_candidate 才进入 awaiting_approval。必须取得用户对**当前核心版本**的明确批准并留存真实消息出处，建立项目内 JSON 证据。最小结构：

    {
      "schemaVersion": 1, "kind": "r3_core", "approved": true,
      "revision": 1, "inputSha256": "<本轮真实值>",
      "reviewSha256": {"architecture": "<真实值>", "reader": "<真实值>"},
      "source": "<可复核的真实消息位置>",
      "quote": "<用户的实际批准原话>",
      "approvedAt": "<实际 ISO8601 时间>"
    }

    node scripts/r3_plan.mjs <项目> core-approve --evidence reviews/core-author-source.json

脚本只能校验凭证形式与绑定哈希，不能独自证明作者身份、真实读者留存或编辑上下文隔离。

## 3. 卷级检查点与滚动规划

核心通过后准备卷一检查点：

    node scripts/r3_plan.mjs <项目> volume-prepare --volume 1 --start 1 --end 22

1–22 只是《仙门大掌柜》当前结构示例；其他作品使用自己的合法卷范围。prepare 会保存该卷原文及 chapterNumber/filePath 槽位，但不锁未来章节的 title。读完实际卷纲后，由作者明确批准该卷（不能用早前的 3B 产品原则代签）。

卷级证据最小结构：

    {
      "schemaVersion": 1, "kind": "r3_volume", "approved": true,
      "volId": 1, "revision": 1,
      "inputSha256": "<当卷输入真实值>",
      "coreInputSha256": "<本次核心输入真实值>",
      "source": "<可核对消息位置>",
      "quote": "<作者实际同意本卷的原话>",
      "approvedAt": "<实际 ISO8601 时间>"
    }

    node scripts/r3_plan.mjs <项目> volume-approve --volume 1 --evidence reviews/volume1-author-source.json
    node scripts/r3_plan.mjs <项目> verify --chapter 1
    node scripts/v3_gate.mjs <项目> --chapter 1 --json

需要修改已批准的核心或卷纲时，必须建立新 revision、重做相应独立审核/作者批准，不可直接覆盖快照。未获批准的后续卷可以滚动修改。卷末如果作者批准下一卷，重复 volume-prepare / volume-approve 并确保章节范围紧接上一卷；例如卷二为 23–48。

## 4. 正式连续写作和既有编辑门禁

P0 阶段的 reviewPolicy 必须为 every_chapter。风险分级审稿还未实现，严禁提前开启。

每章动笔前必须检查：

    node scripts/v3_gate.mjs <项目> --chapter N --json

仅当退出码 0 才允许写稿。稿件完成、达到字数要求并按原流程更新 chapters[n].wordCountPass/status、结构化账本后，再由真正独立编辑审稿：

    node scripts/r2_review.mjs <项目> prepare --scope chapter --end N --writer-run-id REAL_RUN --writer-context-id REAL_CONTEXT
    node scripts/r2_review.mjs <项目> submit --scope chapter --end N --report reviews/real-chapter-editor.json

对于 R3 项目，prepare 同时保存 reviews/r3/manuscripts 下的正文原文快照；新修订生成 Diff。未附 R3 快照的历史 R2 审稿记录不能冒充已经通过 R3 审核。

前三章后仍执行原 Pilot 停审与真实作者批准：

    node scripts/prepare_pilot_review.mjs <项目> --json
    node scripts/submit_pilot_review.mjs <项目> <真实编辑报告.json> --json
    node scripts/record_pilot_approval.mjs <项目> --evidence <真实作者确认.json> --json
    node scripts/v3_gate.mjs <项目> --chapter 4 --json

第 6、9、12……章进行原 R2 的三章整体独立审核；第 7、10、13……章写前由门禁校验。正式每章更新 story-ledger.json，以 audit_story_state.mjs --handoff 取数，原本的本地备份流程继续有效。

## 5. 风险码、失败恢复与禁止事项

- R3_CORE_NOT_APPROVED / R3_VOLUME_NOT_APPROVED：需要真实作者批准，不允许只修改 storyPlanApproved。
- CORE_PLAN_CHANGED / VOLUME_CHECKPOINT_CHANGED：审核后内容被改；停止写作并核实是否需要新版本和重审。
- R3_SNAPSHOT_HASH_MISMATCH：历史快照完整性异常；只可从可信快照恢复或重新审批，不能重新计算旧哈希洗白。
- R2_MANUSCRIPT_CHANGED / R3_MANUSCRIPT_CHANGED：已审正文发生变化，必须重新准备并独立审核。
- R3_REVIEW_POLICY_NOT_ENABLED：风险分级模式未开放。
- R3_VOLUME_NOT_APPROVED_FOR_CHAPTER_N：目标章节所在卷尚未批准。
- R3_*_INVALID：按真实证据修复 JSON，而不是伪造通过记录。

快照采用拒绝覆盖及清单校验，不是防御管理员恶意修改的绝对不可变存储。应另外保留 Git 与本地 ZIP 备份才能实现完整恢复。不得自动上传云端。

## 6. 开发与回归测试

以下命令从 chinese-novelist-v3 目录运行：

    node --test tests/r3-routing.test.mjs
    node --test scripts/tests/r3_plan_sections.test.mjs
    node --test scripts/tests/r3_plan_protocol.test.mjs
    node --test scripts/tests/r3_faults.test.mjs

同时要求原有 GitHub Actions 中 Chinese Novelist V3 tests 全部通过。测试中的作者消息为明确标示的 fixture，不构成真实批准。

**执行纪律**：P0-01 到 P0-09 通过自动化测试并更新 PRD 后，再邀请 Gemini 使用 R3 正式创作。P1/P2 尚待开发，不能把 P0 工程通过宣称为小说品质经实测提升。
