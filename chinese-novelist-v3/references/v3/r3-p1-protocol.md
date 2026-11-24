# R3 P1 创作反馈与持续学习协议

仅适用于明确启用 P1 的独立 R3 项目。P0、R2 和真实作者批准规则不变；P2 尚未开放。所有自动化输出的文学状态均为 UNVERIFIED：证据存在、字段正确、哈希一致，不等于文学判断成立。

## 1. 激活与一次性旧项目迁移

在真实独立小说目录上操作，先备份原始项目。当前已经通过独审的连续章可保留原审核凭证；先完成尚在 under_review/revise 的逐章审稿，不伪造通过状态。旧 Pilot awaiting_approval 可以保留。

    node scripts/r3_p1.mjs PROJECT activate --project-id my-novel
    node scripts/r3_p1.mjs PROJECT status

新作品在 R3 初始化后也显式激活。project-id 是本书唯一稳定标识，不使用书名或角色名作为跨作品身份。已有 R3 未激活的项目继续使用 P0；不自动修改既有批准。旧 P0 MINOR 作为 legacyCandidates（原文引文、来源、现行引文是否仍存在）进入待语义复核候选，不冒充已分级的 P1 审稿。需要转为可追踪问题时由真正独立审稿重新核对相关章节并登记 P1 C 类意见；不为迁移重审整卷、不虚构结论。

**唯一事实源**：定稿正文和已审核的核心契约。story-ledger.json 是紧凑、版本绑定的事实投影，不是第二份正文。P1 不再要求初始化或手工更新 99-章节摘要.md；已有摘要只作历史参考，不删除、不据其覆盖正文，不让过时摘要阻断写作。不要执行与此相冲突的旧 R2 章节摘要步骤。远期按需回查真实正文。

先逐项回查已有账本（包括历史时序与数量、覆盖链、handoff），把旧值纠正为当前实际证据。以下流程用于已有每章及新定稿章：

    node scripts/r3_p1.mjs PROJECT inspect --chapter N
    node scripts/r3_p1.mjs PROJECT bind --evidence reviews/ledger-bind-N.json

inspect 返回 sourceHash、reviewHash、projectionSha256 和 rows。绑定输入示例（真实值由 inspect 获取，anchors 必须恰好覆盖返回的 row IDs）：

    {
      "schemaVersion": 1, "chapter": 1,
      "sourceHash": "REAL_MANUSCRIPT_SHA256",
      "reviewHash": "REAL_REVIEW_SHA256",
      "projectionSha256": "REAL_PROJECTION_SHA256",
      "checkedBy": {"runId":"REAL_RUN","contextId":"REAL_CONTEXT"},
      "reviewNote":"回查定稿原文，核对全部列出的事实、覆盖链与交接事件",
      "anchors":{"facts:F1":"正文中的实际原文引文","handoff:1":"正文中的实际原文引文","mechanisms:M1":"正文中的实际原文引文"}
    }

若有 chapter=0、scope=global 的初始事实，另 inspect/bind --chapter 0，源为已批准的核心原文快照。bind 只接受当前已通过审核且字节一致的正文；只检验引用存在与版本，语义核对仍是 Agent 的实际工作，不用重复人工审批，不把随意填写的引文当证明。

保留旧 ledger schemaVersion=1：facts、foreshadowing、relationships、mechanisms、handoffs 数组。修改正文、当前审核报告、绑定内事实或交接数据，会使相关绑定过期；只重新核对受影响的章节，避免给全书重做摘要。supersededBy 必须指向同属性、同种类的后续事实，迁移边绑定至新事实所在章。foreshadowing 变更使用：

    {"id":"P1","chapter":1,"description":"原有伏笔","status":"open","progress":[{"chapter":6,"quote":"第6章真实引文","note":"实际推进"}]}

paid 使用 payoffChapter，dropped 使用 closureChapter；二者都需 closureQuote、closureReason，绑定在关闭章。不要提前把未来计划冒充已发生进展。旧章的历史状态可按当时章节恢复；若实际改变已发生的转移证据，对受影响章节重绑。没有变化则不触碰原绑定。

## 2. 每章、三章弧和 Pilot 的实际写作顺序

    node scripts/v3_gate.mjs PROJECT --chapter N --json
    node scripts/audit_story_state.mjs PROJECT --upto PREVIOUS --handoff --json

两者必须真实成功。handoff 的 recentSources 提供最近三章原文路径与哈希，实际阅读所需原文，远期才按 anchor 回查。deferredIssues、momentum、cascadeWarnings 是可选阅读提示；不能凭人物同名就判定事实冲突。正式创作仍串行，预检通过才动笔。每章仍由独立 Agent 审稿，运行原 r2_review.mjs prepare/submit 命令；提交新版报告前读取实际 inputPath 的 p1Protocol、priorStrengths、manuscriptHashes、writer IDs。P1 不改变 R2 输入中的 schemaVersion=1、kind、end、revision、reviewer、decision、summary、issues。真实完成独审后标记 completed，更新事实账本，再 inspect/bind 当前章。每三章弧先完成章审与事实绑定，再弧审；前三章仍使用 Pilot，之后第6/9/12章等使用 arc。任何正文修订均重审相关章节及受影响弧审、更新绑定。第4章仍需真实作者批准。P1 Pilot 增加 reviewer.contextId，与逐章写手声明上下文不同。

### 审稿分类

| classification | severity | disposition | 允许未解决时 pass_candidate |
|---|---|---|---|
| A：真实硬伤 | BLOCKER 或 MAJOR | fix_now | 否；不允许 accepted |
| B：实质阅读风险 | MAJOR | fix_now 或 fix_in_arc | 仅单章的 fix_in_arc，当前三章弧末必须解决 |
| C：非阻断局部瑕疵 | MINOR | fix_now 或 defer_to_final | 仅 defer_to_final |
| blank：合理留白 | 非 BLOCKER | keep_as_blank | accepted，说明原文辩护与接受原因 |

不能把真实 causal_break 降级为 B/C。evidenceLevel 是 explicit_conflict / causal_break / narrative_risk / reasonable_blank；evidenceBasis 是 explicit_text / reasonable_inference / requires_new_setting。需要新增设定才能解释的内容不能冒充合理留白。MAJOR/BLOCKER 须提供 reverseDefense（同审核范围的真实章号、引文、理由）；反向辩护先尝试现有文本的最强合理解释，仍不成立则如实确认硬伤，不要求强行洗白。示例单章 C 类：

    {
      "id":"C-01","chapter":1,"quote":"本章原文的真实连续引文",
      "severity":"MINOR","status":"open","reason":"局部称谓不统一，不改变因果",
      "suggestion":"完本时核对称谓","classification":"C","disposition":"defer_to_final",
      "evidenceLevel":"explicit_conflict","evidenceBasis":"explicit_text",
      "subject":"角色或物件","key":"称谓","factId":null
    }

B 类增加 reverseDefense: {"chapter":1,"quote":"真实原文","reason":"现有因果仍不足或合理解释是什么"}。若引用具体事实，factId 必须确实属于同 subject/key。程序拒绝虚构引文；字段错误码指出 issue 序号。修复状态必须由独立审稿确认，而非写手设 accepted。不要为凑问题数量捏造缺陷。

报告新增 p1 块（普通章审允许空 preserveStrengths；Pilot/arc 三个观察槽，找不到真实亮点时用 not_established 与理由）：

    {
      "schemaVersion":1,"literaryStatus":"UNVERIFIED",
      "preserveStrengths":[{"id":"S1","status":"observed","chapter":1,"quote":"实际原文","reason":"为何值得保留"}],
      "signals":[{"kind":"promise_open","id":"PROMISE-1","chapter":1,"quote":"实际原文","description":"具体读者期待"}],
      "followUps":[],"revisionProtection":[]
    }

signals 可为 promise_open / promise_progress / promise_paid / negative / spark / character_progress；同一期待使用同一稳定 ID；core:true 仅用于实际确认需要跟踪的核心角色。叙事动能为已登记观察，不是实际读者行为统计；长期未记录推进只是软提醒，没有强制高潮周期、数量或连续负面硬指标。

当 input packet 含 priorStrengths，revisionProtection 必须逐项覆盖其 ID，status 为 preserved / changed / removed，附修订后的真实章号、引文与原因。修订的任务是保住有效人物、节奏、文风和新鲜感，不等于禁止一切改变。

status/handoff 自动从不可覆盖的已登记审稿历史派生 deferredIssues；同章、同具体属性/事实与同原文锚点的重复观察合并引用，不重复抄写台账。报告使用 followUps: [{"trackingId":"从 status 得到的真实 ID","status":"resolved","chapter":3,"quote":"本轮审核范围实际原文","reason":"实际如何补强"}]。三章弧末的 B 必须真实关闭，不能用 C 类或 accepted 绕过；C 只记录并可在后续确认修复。原文锚点变化但确属同一问题时由编辑显式复核跟进，不做同名自动归并。到完本仍有 B 应先修复；C 留给 P2 的独立完本精修，不提前假称精修模块已实现。

## 3. 结构化检查与卷末复盘

可选 r3Checks 数组，每条以真实 quote 绑定至相应章。例如：

    {"id":"Q1","chapter":2,"kind":"quantity_balance","impact":"hard","quote":"真实原文","unit":"铜钱","opening":10,"deltas":[-3],"closing":7}
    {"id":"T1","chapter":2,"kind":"chronology","impact":"advisory","quote":"真实原文","earlier":{"day":1,"minuteOfDay":600},"later":{"day":1,"minuteOfDay":660},"relation":"before"}

quantity_balance 仅对同一单位的明确整数做精确计算；chronology 仅对明确 day/minuteOfDay 及 before/not_after 校验。impact=hard 应只用于真实会破坏关键连续性的已明确数据，advisory 仅提示；不得从自然语言自动臆测数字、历法或人物心理。所有未结构化内容仍由独立编辑按原文审查。

完成当前批准卷、全部该范围章审/所需弧审及账本绑定后：

    node scripts/r3_p1.mjs PROJECT volume --volume V

输出 packet 及 packetSha256，包含版本、有效事实、关系、开放伏笔、动能、延期问题与近期原文路径。让编辑阅读原文提出下一卷候选：候选 JSON 为 schemaVersion:1、packetSha256、reviewer:{runId,contextId}、observations、nextVolumeProposals；后两个数组每项含 chapter、quote、reason、proposal，均为实际证据。允许没有新机会，不凑数量。

    node scripts/r3_p1.mjs PROJECT volume --volume V --candidate reviews/volume-candidate.json

生成不可覆盖的候选快照，绝不自动改大纲或批准下一卷。新的卷仍走 P0 volume-prepare/volume-approve。角色缺席和长期伏笔警告只说明已登记观察的间隔，不能宣称一定发生文学问题。

## 4. 持续学习：Markdown 权威知识源，宿主可选

经验库是用户控制的独立目录，不是 novel 项目账本或公开 Skill 仓库。沉淀有效方法、踩坑原因、适用及慎用边界。单书的设定、人物、事实必须留在单书；跨作品只保存可迁移的方法与证据。经验数量可为零，禁止每章默认检索和强制使用技巧，禁止把一条观察宣传成普遍定律。

### 4.1 触发协议（作者确认）

**强制的是轻量复盘判断，不是产生经验；主动检索不等于强制采用。** 由已显式激活 P1 的 Skill 在自然工作流节点主动提示模型，不依赖宿主后台记忆；不新增正文门禁、作者审批或常驻 Agent。

| 节点 | 动作 |
|---|---|
| 新作品立项，正式规划前 | 主动按题材、读者承诺、风格及实际难点检索全局经验；已有单书事实不能跨书使用。无库、无命中或不适用时直接继续。 |
| Pilot 验收完成（通过独立审稿并获得真实作者确认） | 结合正文、编辑证据和作者反馈，主动判断有无可迁移的成功方法或失败教训；不代签批准。 |
| 每卷完结，下一卷规划前 | 在既有 volume 复盘中合并执行经验判断；不另设打断创作的任务。 |
| 全书完结（正式 finalize 成功后） | 结合全书、跨卷记录与反馈复盘，验证、修订、淘汰既有经验；不依赖尚未实施的 P2 精修。 |
| 作者明确且有实质价值的纠正，或真实读者有效反馈 | 按需复盘，普通措辞修改或零散意见不自动触发；明确作者偏好与通用方法的区别。 |
| 创作/审稿出现明确诊断问题、规划卡点或必要修订 | 仅针对实际问题按需检索；不以每章或每三章弧为默认学习/检索周期。 |

在上述复盘节点提示模型：“结合本阶段真实原文、独立审稿及有效反馈，是否存在有证据、可复用且有适用边界的成功经验、失败教训，或需要更新/淘汰的旧经验？没有就明确无新增，不为凑数生成。” 先检索可能重复的旧条目；仅在证据支持时新建、更新、降级或淘汰。单书事实和人物理解留在项目内；跨作品仅存抽象方法与必要、脱敏的证据引用。

在既有节点报告或独立轻量日志中记录项目ID、节点及对应完成凭证/版本、判断结果（无新增/新增/更新/淘汰/不可用）、相关经验 ID/版本及简要理由。同一节点同一证据版本不重复复盘，重跑只在实质证据变化时补记；无经验也算完成判断，不创建空经验条目。库不可用或同步失败只提示并继续，不阻断写作、不重试打断创作。作者未授权同步时保持本地。

### 4.2 经验入库与成熟度

    node scripts/r3_experience.mjs upsert LIBRARY --input experience.json --expected 0

输入为 schemaVersion:1、id（稳定字母数字下划线短横线）、revision:1、scope:"global" 或 "project"（后者必须有 projectId 且命令带 --project-id）、status:"candidate"、title、method、applicability、cautions、changeReason、tags、evidence。evidence 数组至少一条 {projectId,kind,source,observation}，kind 为 self_observation / independent_review / author_feedback / reader_feedback / controlled_comparison；source 引用真实可核验来源，observation 说明限制。status=supported 至少有一条非自评证据；mature 至少两个作品的非自评证据；这些只是最低材料要求，不自动证明经验正确。后续使用同 id、revision+1、--expected 当前版本；错误/过时可修订、降回 candidate 或标 retired，不改旧版历史。项目 scope/ID 不静默转全局。跨项目泛化需另建经实际核验的全局条目，不复制私有剧情。

新作品立项时主动检索；其余仅在创作诊断、规划卡点、必要修订或上述复盘中需要时检索：

    node scripts/r3_experience.mjs search LIBRARY --query "人物 选择" --project-id my-novel
    node scripts/r3_experience.mjs get LIBRARY --id REAL_ID --project-id my-novel
    node scripts/r3_experience.mjs index LIBRARY --project-id my-novel

默认排除 candidate 和 retired；最多五个本地关键词命中，不声称本地检索是语义搜索。只有明确研究候选才用 --include-candidates。宿主 Notebook 可提供语义召回，但再次 get 当前本地版本、scope 与 status，旧版、缺项、越权条目全部忽略。Agent 自主判断是否采用，记录实际触发、命中 ID/版本、采用或不采用及原因/替代方案；没有有益经验则按作品自身需求继续。经验不属于任何写作门禁，不修改事实账本。检索/远端不可用时如实标明并回退本地或无经验创作。

Notebook / Memory 只在宿主真正提供相应接口、用户授权同步时使用。index 的 entries 是当前有效 Markdown 路径/版本/hash；withdrawn 是撤回或降级候选，远端应删除或清晰标记不可召回为成熟经验。使用宿主实际 Notebook 创建/写入/刷新源/检索工具，或 Memory 原生条目保存/检索工具；不猜测接口、不伪造返回。Notebook 是检索/案例视图，Memory 只保存轻量索引与入口，不存单书精确事实。远端回读需核对真实 ID、revision 及权威源 hash；如果无法确认完整字节或版本，不能声称已验证。可选记录真实宿主回执：

    node scripts/r3_experience.mjs receipt LIBRARY --input sync-result.json --project-id my-novel

回执含 id、revision、sourceSha256、provider:"notebook"|"memory"、status:"verified"|"failed"|"unavailable"、detail；verified 另需 remoteId、observedRevision、observedSourceSha256 与本地匹配。此记录只是宿主声明，非脚本连接远端的独立验证。用户未授权上传则不上传，不需要伪造 receipt。不可把 P1 本地测试通过当作 Notebook 跨会话可靠性的证明。

导出/恢复至新的目录（无远端依赖，保留 Markdown 当前版和历史 SHA-256）：

    node scripts/r3_experience.mjs export LIBRARY --out NEW_EXPORT --project-id my-novel
    node scripts/r3_experience.mjs verify NEW_EXPORT
    node scripts/r3_experience.mjs restore NEW_EXPORT --out NEW_LIBRARY

仅用户实际要求完整私有库备份时 export --all，避免跨作品泄漏；普通 scoped export 包含全局与该项目条目。宿主回执不作为知识源、不随经验导出。将恢复库交给另一 Agent 即可继续读取/更新标准 Markdown；直接跨平台 Notebook 接入能力仍须真实验证。

## 5. 错误处理与回归

- R3_LEDGER_BINDING_STALE_OR_MISSING_N：回查定稿源及具体投影，不只重算 hash。
- R3_P1_ARC_FIX_DUE_ID：当前弧尚未关闭的实质风险，要求独立确认处理，非强制每章高潮。
- R3_P1_*_EVIDENCE / *_INVALID：按真实输入字段、原文证据修正。不得直接改审批状态。
- 原字数工具仍是 `node scripts/check_chapter_wordcount.mjs CHAPTER MIN_WORDS --json`；结果 `results[0].word_count`，plan `wordCount`、`wordCountPass`。不得混用字段或静默改旧 CLI。
- 使用完整 R3 delivery ZIP 交付含 P1 状态、账本绑定和审核历史；另行按授权导出用户经验库，不把私人库混入小说/Skill 仓库。
- 回归命令：`node --test scripts/tests/r3_plan_protocol.test.mjs`、`node --test scripts/tests/r3_experience.test.mjs`，以及现有 R3、R2/V3 测试。

文学收益与创作摩擦仍需后续真实连载实测；不要求逐模块进行 Gemini 试跑，不伪造作者批准。
