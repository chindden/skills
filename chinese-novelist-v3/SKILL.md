---
name: chinese-novelist-v3
description: 中文精品网文的创意竞标、故事规划、前三章试写与独立审稿、分卷连载、续写、跨章一致性审计。兼容中文小说多题材。仅在用户要求创作或审校小说时使用。
---

# Chinese Novelist V3

目标：帮助作者产出**有辨识度、人物鲜活、逻辑可信且值得追读**的作品。流程和评分是提高质量的手段，不是精品保证。

## R3 实验模式（仅显式启用）

**仅当作者明确要求使用 R3，且工作项目通过 `init_v3_state.mjs --enable-r3` 显式建立 `v3.r3` 状态时**，优先读取 [R3 实验运行手册](references/v3/r3-operational-runbook.md) 与 [R3 严格分区协议](references/v3/r3-markdown-sections.md)。本文件后续 Stage 2 的 `plan_review.mjs` 整文件冻结说明仅适用于 R2/V3 旧模式；R3 改用独立的 `r3_plan.mjs` 核心与卷级审批，不可混用旧批准链。

R3 继续复用原逐章独立审稿、三章弧审、Pilot 停审与事实账本；P1/P2 新增的叙事动能、延期修复、风险分级审稿、Spike 和完本精修**尚未实现前不得假装已具备**。所有 R3 正文动笔前仍以 `v3_gate.mjs --chapter N --json` 的**真实退出码 0**为准。只用独立实验项目，R2 原项目不静默迁移。

研发与完成度见 [R3 PRD](docs/R3-PRD.md)。单元测试通过不等于小说好看；须单独评估读者持续追读意愿。

## 执行优先级
1. 先读本文件及 [V3 总流程](references/v3/workflow.md)。所有 V3 门禁、状态和用户确认要求优先于原版 `references/flows/` 中的“自动写完整书”指令。原版保留为技法和工具底座，**不要运行与 V3 冲突的旧流程**。
2. 根据任务按需读取 [创意竞标](references/v3/creative-lab.md)、[题材与架构](references/v3/story-architecture.md)、[八套原创网文知识库总索引](references/webnovel/README.md)、[独立审稿](references/v3/editorial-gate.md)、[状态与备份](references/v3/state-and-backup.md)。知识库必须**先选题材/主流派及读者承诺，再按任务读取少量相关库与具体章节**；不能每次全库灌入上下文，不以套路数量代替故事质量。
3. 原版人物、对话、章节、悬念和文风指南仍可按需读取。V2 的反套路、资源限制、对话博弈与二阶 AI 味建议已吸收到 V3 参考文档；旧版固定爽点配额并非通用硬约束。

## 六阶段主流程
1. **创意竞标**：先用知识库完成目标读者、题材与成熟流派定位（作者已指定则沿用），区别世界题材、主引擎、金手指、人物策略与爽点；默认比较 3 个真正不同的故事引擎；对已锁定题材提供 3 个不违背约束的展开方案。**先论证再选择**：检查主角命运是否与独特设定不可替代地耦合、人物是否具有自主行动与代价、作品是否能持续产生不同类型冲突和阶段性兑现。记录淘汰证据，用户决定最终选项；不能把凑足三案或高自评分当作创意合格。
2. **故事架构**：遵循 [Stage 2 原生蓝图审核与修订协议](references/v3/plan-review-protocol.md)：创意诊断→完整剧透故事→四级规划及资源/时间/规则审计→冻结蓝图→架构与读者双独立审稿→定向返工及复审→作者批准。全书→分卷→故事弧→章节；按需读取人物关系、成长机制和爽点节奏库；写前先设计**人物关系与命运弧线、读者期待—铺垫—升级—兑现—余波—新期待的节奏蓝图**，明确局部兑现、重大转折、情绪高低变化以及不可逆后果。近端细化、远端保持弹性，保存角色与关系状态、规则、资源、线索、伏笔、文风指纹。参考 2–5 章局部兑现、8–15 章重大变化可作讨论起点，**绝不规定每三章/十章强制高潮**；跨度随题材、章长、故事因果调整。
3. **前三章试写**：按题材创作并严格串行，具体场景、技法及命名问题只查对应知识库；每章初稿须由不同执行上下文的独立编辑核查，只有定向修复和复核通过后才标记完成、更新正式账本。
4. **强制停审**：第 3 章后运行 `node scripts/prepare_pilot_review.mjs <项目目录> --json` 并禁止启动第 4 章，直到独立审稿、缺陷返工、复审与用户确认均有记录。支持隔离子 Agent；不支持时不得谎称独立审稿。
5. **分卷连载**：相邻正文串行；每章强制独立核查，第 6、9、12……章再做最近三章整体独审；定稿后更新结构化账本，每五章执行 `node scripts/audit_story_state.mjs <项目目录> --upto N --write --json`，其发现是待人工/独立编辑核查的线索，不是文学评分。
6. **本地快照（可选）**：可生成 ZIP 与 SHA-256 清单，验证本地恢复。**本阶段禁止自动上传 Google Drive 或其他云端**，待用户后续明确授权并通过环境实测再接入。

新项目运行 `node scripts/init_v3_state.mjs <项目目录> --json` 后默认启用 R2 与 Stage 2 规划门禁；已有 V3 项目按需显式运行 `--enable-r2` 和/或 `--enable-plan-gate`。不可伪造历史审稿记录或作者批准；真实流程与命令见 [规划审核协议](references/v3/plan-review-protocol.md) 和 [运行手册](references/v3/operational-runbook.md)。

## 不可跳过的可执行门禁
- **正式规划 Stage 2**：运行 `node scripts/plan_review.mjs <项目目录> prepare --planner-run-id REAL_RUN --planner-context-id REAL_CONTEXT` 冻结规划；架构与目标读者编辑分别独立提交报告。发现未解决的 BLOCKER/MAJOR 必须修正后重新冻结、重新双审；两路审核通过后仍须作者明确批准并运行 `plan_review.mjs approve`。新项目不能靠直接设 `storyPlanApproved=true` 绕过门禁。脚本验证证据与版本，不证明文学质量。
- 在**创建每一章正文前**运行：
  `node scripts/v3_gate.mjs <项目目录> --chapter <章号> --json`
  第 2 章起检验此前所有章节独审，第 4 章还需 Pilot 和作者确认，第 7、10、13……章还需上一组三章整体独审。最后一章定稿后必须运行 `node scripts/v3_gate.mjs <项目目录> --finalize N --json`。非 0 退出码立即停止。
- 工程校验使用 `node scripts/validate_project.mjs <项目目录> --upto N --json`，只检查已写完的第 1 至 N 章；全书完成后才执行不带 `--upto` 的全量校验。它只验证状态和字数，**不代表文学审稿通过**。
- 每章和每三章的审稿报告必须有原文证据、严重程度和明确返工点，并绑定正文哈希及写手/编辑运行标识。写作 Agent 不能批准自己的稿件；程序核查声明字段但不能独自证明真实上下文隔离。
- 生产小说正文时的项目字段和门禁规则见 [状态与备份](references/v3/state-and-backup.md)、[V2 工艺红队](references/v3/craft-and-redteam.md) 和 [独立编辑模板](references/v3/review-agent-template.md)。
- 如果无法真实操作目录、脚本或子 Agent，明确说明降级能力并保留交付记录；**不得伪造文件、执行日志、审核人或备份**。

详细验收规则见 [工程与写作验收](references/v3/acceptance.md)。

## 质量原则
- 硬规则：因果、已确立事实、信息边界、重要物品及资源状态不能自相矛盾。
- 软策略：高潮密度、章末钩子、对话篇幅、视角密度、人物理性程度视题材与情境确定；真实人物允许可信的非理性、犹疑和失误。**章末悬念不等于高潮，新谜题不能长期替代旧承诺兑现；高潮应改变人物、关系或局势，而不只是加大事件声量。**
- 以真实读者盲评和作品对照为最终质量证据；不以自评分或字数判定精品。

## 兼容与来源
八套网文知识库以通用写作方法重新整理；分类结构参考了 [lingfengQAQ/webnovel-writer](https://github.com/lingfengQAQ/webnovel-writer) 的开放项目思路，**未复制其 GPL-3.0 原文、CSV 条目或实现代码**；参考建议不视为市场事实或质量保证。具体见 [知识库说明](references/webnovel/README.md)。
本技能从 PenglongHuang/chinese-novelist-skill v2.3.2 的文字参考与 Node.js 工具改造，MIT License 见根目录 `LICENSE`。原版入口备份在 `references/legacy/upstream-SKILL.md`。V2 的设计贡献属于创作规则融合，而非原版自动化测试功能。
