# Stage 2 · 故事蓝图审核与定向修订协议

> 这是 [V3 唯一主流程](workflow.md) Stage 2 的原生必经环节，不是额外测试提示词。规划门禁检查文件与审核证据的版本完整性；编辑负责文学判断，不能把脚本通过等同于作品优秀。

## 一、进入规划阶段
- 作者已提供/锁定的题材、主角、故事承诺优先。上一轮创意竞标若尚未获得作者确认，候选可以用于**独立规划实验**，但不能记为正式立项通过。
- 只将真实作者创意选择记录为 creativeDecision=accepted；不得由执行 Agent 擅自签字。
- 先诊断原始创意：读者承诺、主角不可替代性、主成长机制、能力边界、反派行动、人物关系、续航能力、篇幅与结局。严重缺陷可比较最多两条修复路线并保留取舍理由，**没有必要时不强制生成两个方案**。

## 二、先讲完整故事，再拆成大纲
正式规划文件沿用 R2 原有结构：00-人物档案.md、01-大纲.md、02-写作计划.json、03-文风基准.md；不强制新增十四份文件。

01-大纲.md 必须实际包含：
1. **可完整剧透的故事梗概**：开端、行动、主要对手的反制、重大转折、真实答案、结局与人物具体归宿；不允许只有宣传语或“揭晓惊天真相”占位。
2. **规则与资源契约**：力量的输入/输出、限制与代价、修炼资源与边界、世界治理规则、对手可能采取的反制。不适用于非奇幻题材时替换为该题材的真实制度/专业限制。
3. **全书→分卷→故事弧→近三章**：各卷不同的行动目标与冲突来源，近三章到场景级，远端只锁定关键转折和人物命运，保留续写弹性。
4. **人物命运、节奏及伏笔图**：期待→铺垫→阶段兑现→后果→新期待，明确高潮与余波、情绪高低、关键秘密的证据及回收位置。

## 三、冻结前的跨文件一致性审计
针对适用题材逐项排查，不允许以模型自评高分抵消确定性矛盾：
- 经营与资源：库存、现金、收入、成本、债款、产能、劳动力、交易期限与能量来源；数值相关故事应能逐项核算。
- 时间与成长：相对日历、修炼/康复时间、期限、境界增长的前因、角色不可能在同一时刻出现两地。
- 能力与信息：金手指是否临时越界读心、预知或无成本升级；角色是否使用了其尚未知晓的线索。
- 世界治理：宗门/法律/组织的规则是否对双方一致；对手是否会主动堵住已暴露的致命缺陷。
- 人物行为：主角犯错必须符合既有性格、信息与现实取舍；不能为了安排内鬼、重伤或反转让主角无故降智。
- 阅读体验：不同故事弧是否有真实兑现、个人高光与必要的喘息；别把审稿周期误当高潮频率。
- 篇幅承载：修为升级、组织规模、人物关系与终局事件需要有足够叙事时间。不得武断规定“100章必然只能到某境界”。

必要时在 01-大纲.md 增加数值、时间与信息边界核对表。对需要外部验证的职业常识或历史事实标注待核实，不伪造来源。

## 四、冻结蓝图与双独立编辑
规划 Agent 自查并保存正式文件后，执行：

    node scripts/plan_review.mjs <项目目录> prepare --planner-run-id REAL_RUN --planner-context-id REAL_CONTEXT

该命令将三份规划 Markdown 的基准内容和写作计划的稳定结构制成带 SHA-256 的审核包，保存于 reviews/plan/input-vN.json。若规划更新，必须重新 prepare，revision 自增，不能覆盖旧审核包。

交给两个**不同的真实执行上下文**只读审稿，互不输入对方报告、自评分或预设通过结论：
- architecture（架构编辑）：resources_and_numbers、timeline_and_progression、world_rules_and_power、character_causality、foreshadowing_and_finale。
- reader（目标读者编辑）：genre_promise、opening_and_rewards、midgame_pacing、protagonist_agency、relationships_and_emotion。

每位编辑的报告 JSON 必须含 schemaVersion:1、kind:"plan"、role、revision、完整 artifactHashes、reviewer:{kind:"independent_agent",runId,contextId}、decision、summary、checks、issues。checks 每项含 id、status（pass/issue/not_applicable）与 evidence。issues 中每条含 id、severity（BLOCKER/MAJOR/MINOR）、status（open/resolved/accepted）、artifact（实际被审的 Markdown 文件名）、quote（**逐字存在的原文片段**）、reason、suggestion；接受 MAJOR 风险须加 acceptanceReason，BLOCKER 不准接受风险放行。

两份真实报告分别存至项目目录，再由规划 Agent 运行：

    node scripts/plan_review.mjs <项目目录> submit --role architecture --report reviews/plan-architecture-source.json
    node scripts/plan_review.mjs <项目目录> submit --role reader --report reviews/plan-reader-source.json

报告需有明确引用与修改建议。双评审可运用反事实压力测试（盟友退出、强敌采取合理反制、核心能力受限等），**根据本书最薄弱环节选择**，不固定三道考题。不可伪称实际读者留存或市场评分。

## 五、定向修改、复审与作者批准
- 任一评审指出未解决的 BLOCKER/MAJOR，必须把对应蓝图标为 revise/reject；作者针对原文证据进行局部修订，并检查所有受影响的人物、规则、卷纲和近三章。
- 修改之后再次 prepare，产生新的不可变审核包，再由两个独立上下文重新评审。**不许修改旧评审结论来冒充修复。**
- 两份报告均为 pass_candidate 时，仅进入 awaiting_approval；不可自动设置 storyPlanApproved=true。
- 向作者展示完整故事梗概、规则审计结果、两路评审的主要结论与剩余非阻断争议，取得对当前版本的真实、明确批准消息。
- 将作者凭证 JSON 保存为项目内独立文件：必须含 schemaVersion:1、kind:"plan"、approved:true、当前 revision、inputSha256、两份报告 reviewSha256、quote（用户原话）、source（可核对的真实消息出处）、approvedAt（时间）。之后执行：

    node scripts/plan_review.mjs <项目目录> approve --evidence reviews/plan-author-evidence.json
    node scripts/plan_review.mjs <项目目录> verify
    node scripts/v3_gate.mjs <项目目录> --chapter 1 --json

只有作者批准与两份独立评审均匹配当前冻结版本，方可进入 Stage 3。脚本只校验凭据格式与哈希，无法证明所声明的 runId/contextId 或作者身份真实，必须核对宿主任务日志和真实用户消息。

## 六、连载期间的修改与旧项目兼容
- 批准的 00-人物档案.md 和 01-大纲.md 是规划基准；新增的**正文事实**写入 story-ledger.json，禁止为了更新人物章末状态静默改写批准的架构。若需改变核心剧情/人物弧线/世界硬规则，按此流程重新评审和请求批准。
- 03-文风基准.md 在“本书校准段落”标题**后**的连载校准内容可追加，不能改写已冻结的基准部分。
- 全新 V3 项目初始化时默认启用 planGate；只有真实 Stage 2 双审与作者批准后才可开始第1章。
- 已有 V3/R2 项目默认保留原有兼容行为，**不会被静默迁移**。用户明确希望启用新版规划门禁时执行：

    node scripts/init_v3_state.mjs <项目目录> --enable-plan-gate --json

  该操作会取消之前的 storyPlanApproved 标记，要求新一轮真实评审；旧项目在未迁移前不得宣称已通过新版 Stage 2。

本协议的文学审查不能由机器客观证明其效果；最终还需相同 Gemini 环境的真实作品规划复审、前三章试写和读者盲评。