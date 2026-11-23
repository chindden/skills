# V3 执行流程（唯一流程入口）

此文档优先于旧版 phase1–4 的自动一口气写完、批次并行和固定三章套路条款。

## Stage 0：项目定位与能力发现
- 检查现有 `02-写作计划.json`、人物档案、章节摘要及未完成项目；禁止在未核对路径时覆盖已有小说。
- 探测实际可用的文件读写、Node.js、独立子 Agent。**此阶段不启用 Google Drive**，不申请云端权限，不触发上传。
- 续写先查质量门禁状态，再查最近相关人物与事实账本，不要把“上一章摘要”当作全部世界事实。

## Stage 1：创意竞标
读取 [creative-lab.md](creative-lab.md)。无论是否已有构思，默认提出 3 套互不换皮的独立引擎或重构路线；不强行推翻作者明确锁定的设定。
- 创意卡记录主角缺陷与反作用、世界/现实约束、独特矛盾、承诺给读者的体验、可持续 30–100 章的转化机制。
- 独立比较与淘汰；所有方案不合格则重来，不强行选择。
- 向作者请求创意方向确认；未确认不进入结构化正文生产。

## Stage 2：精品故事架构
读取 [story-architecture.md](story-architecture.md)。
- 先定核心承诺、终局方向和人物关键关系，再定全书/卷/故事弧/章节层级；近三章详细，后续按卷逐渐具体化。
- 建立 `00-人物档案.md`、`01-大纲.md`、`03-文风基准.md` 与事实词典，利用原版 `phase2-planning.md` 的模板和 `init_chapter_summaries.mjs` 初始化摘要。
- 先创建原版 `02-写作计划.json`，再运行 `node scripts/init_v3_state.mjs <项目目录> --json` 初始化 `v3` 和 `story-ledger.json`；规划确认后才记录 `creativeDecision=accepted`、`storyPlanApproved=true`。
- 选定标题和规划需用户确认；故事方向变化需形成变更记录。

## Stage 3：前三章试写
- 强制串行完成 1→2→3 章，写前按原版 `chapter-checklist.md` 读取大纲、最近章节、人物状态和文风。
- 选用题材对应的开篇动力，不要求所有作品开篇有死亡威胁或金手指。
- 每章运行原版字数脚本并更新摘要、事实账本；禁止为达字数注水。
- 第 3 章完成后先运行 `node scripts/validate_project.mjs <项目目录> --upto 3 --json`，通过后用 `node scripts/prepare_pilot_review.mjs <项目目录> --json` 固化前三章 SHA-256、递增审核修订号并进入 `under_review`；此时停止所有第 4 章及以后正文创作。

## Stage 4：独立红队停审
读取 [editorial-gate.md](editorial-gate.md)。
- 派出独立上下文编辑 Agent；只提供作品、设定与核查规则，不提供作者自评分、创作解释或“应给好评”指示。
- 输出缺陷 ID、定位、证据、严重性、影响和可操作修订；技术与事实性质疑要区分已核实与待查。
- 出现阻断缺陷则标 `revise`，返工后重审。不得仅把状态改为 passed 规避问题。
- 实际独立编辑按 [操作手册](operational-runbook.md) 生成结构化审稿 JSON，用 `submit_pilot_review.mjs` 验证并入档。通过候选进入 `awaiting_approval`；用户明确确认后保存真实聊天证据，再由 `record_pilot_approval.mjs` 记录批准，进入 `passed`。不得自行模拟用户发言。

## Stage 5：分卷续写
- **每次创建章节正文前运行** `node scripts/v3_gate.mjs <项目目录> --chapter N --json`。失败立即停止。
- 每章执行写前状态检索→正文→独立抽审/重点审稿→事实回填→脚本验证；只写一个逻辑连续章，再领取下一章。
- 不允许同时让多名写手修改相邻章节或同一 JSON/Markdown 状态文件。可并行做资料核验和独立编辑。
- 每章填充 `story-ledger.json`：真实发生的事实、伏笔、关系变化、故事机制。每五章执行 `node scripts/audit_story_state.mjs <项目目录> --upto N --write --json`，再由独立编辑完成语义层面的重复审查、人物选择及卷目标审查。
- 对远期卷纲的改动必须记录原因、影响范围和上一版快照；不得静默改写已成立的正文事实。

## Stage 6：本地校验与作品验收
- 本阶段**仅做本地**工程校验与可选 ZIP 快照的恢复测试。不连接 Google Drive，不上传数据，也不将云端备份写为本轮必验项。
- 完整 ZIP 本地快照工具：`scripts/create_snapshot.py`、`verify_snapshot.py`、`restore_snapshot.py`；用户明确需要本地快照时才执行。
- 质量验收包括至少三章对照盲评和十章续写检查；只有作品质量实际提升才能判断方法有效。
- [Gemini Tasks 实跑手册](operational-runbook.md) 列出启动、停审、提交和人工审批的实际步骤。

## 编辑反馈分级
- **BLOCKER**：事实矛盾、规则崩坏、关键动机断裂、非铺垫的机械降神；需修正并复审。
- **MAJOR**：动机薄弱、故事引擎重复、人物工具化、强烈文风漂移；修正或由用户知情接受并记录。
- **MINOR**：局部措辞、节奏细节；可随下一轮润色。
