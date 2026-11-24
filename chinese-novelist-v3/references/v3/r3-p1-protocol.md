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

## 4. 持续学习：Google Drive 唯一权威经验库

经验库是用户控制的 Google Drive 独立目录，不是 novel 项目账本或公开 Skill 仓库。Notebook 不进入跨作品经验架构；本地文件只供临时校验、备份迁移。沉淀有效方法、踩坑原因、适用及慎用边界。单书的设定、人物、事实必须留在单书；跨作品只保存可迁移的方法与证据。经验数量可为零，禁止每章默认检索和强制使用技巧，禁止把一条观察宣传成普遍定律。

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

在既有节点报告或独立轻量日志中记录项目ID、节点及对应完成凭证/版本、判断结果（无新增/新增/更新/淘汰/不可用）、相关经验 ID/版本及简要理由。同一节点同一证据版本不重复复盘，重跑只在实质证据变化时补记；无经验也算完成判断，不创建空经验条目。库不可用或写入失败只提示并继续，不阻断写作、不重试打断创作。未获作者授权不得创建或写入云端经验库；不建立本地在线副本。

### 4.2 唯一目录、身份定位与分层组织

唯一长期经验权威载体为用户 Google Drive，根目录精确命名 `[CN-R3-EXP] 跨作品创作经验库`。可选 Memory ID `workflows/cn_r3_experience_hub` 仅存根目录定位指针及作者偏好，不保存唯一经验正文。优先核验已知 folder ID 的真实名称、账号权限和目录身份；无指针、失效或 Memory 不可用时，通过 Drive 文件夹精确名称搜索并完成所有分页。禁止用模糊匹配直接写入。查找失败/权限不足不是不存在；同名多个、身份不明或部分初始化时暂停经验写入并报告，不自动合并/重建，不影响小说创作。确认无目录且作者已授权初始化才创建；同一时刻只能有一个经验维护会话。

初始主题按六域组织：01-character-relation（人物关系）、02-conflict-pacing（冲突节奏）、03-plot-reversal（反转/伏笔）、04-worldbuilding-economy（世界观及规则）、05-prose-anti-cliche（文风反套路）、06-workflow-review（创作与审稿）。每份主题聚合多个经验，有稳定 ID、可读适用边界，初始主题版本 v1；主题文件名为 `01-character-relation-v1.md` 等。根目录有不可变版本索引 `00-INDEX-v1.md`；staging/ 暂存，archive/ 保存已提交历史索引和主题、另以 REJECTED- 前缀隔离拒绝候选。只有有效索引引用的唯一文件是现行版本，不按最新修改时间或最高主题版本扫描。单部作品事实/正文以原项目为准，跨作品库只存脱敏通用方法和必要证据；作品专属 Notebook 可选但不承担经验或事实权威源。未来达到实际检索瓶颈才考虑细分，不预设条目规模或增加 Notebook。

### 4.3 可见字段、严格校验与选择性检索

使用 `scripts/r3_experience_drive.mjs`（以下简称 TOOL），它是离线确定性工具，不持有 Drive 凭证，不直接调用云端 API。旧 `r3_experience.mjs` 保留为历史离线库兼容入口，禁止用它建立运行期权威库或 Notebook/Memory 同步。

主题输入 JSON：{title,entries:[{id,title,revision,status,scope:"global",tags,applicability,method,cautions,evidence,changeReason}]}。所有正文字段为非空单行字符串，tags 为字符串数组，evidence 为对象数组（projectId,kind,source,observation）；kind 为 self_observation / independent_review / author_feedback / reader_feedback / controlled_comparison。supported 至少一条非自评证据，mature 至少两个不同作品的非自评证据；这不是文学正确性证明。新经验 revision=1；更新同 ID 递增一版，保留旧证据及修订原因；retired 不复活；候选/淘汰不默认召回。记录反例、适用条件、冲突经验；不以作者单次意见伪造跨作品验证，不设固定技法冷却章数。历史经验不能覆盖现行 Skill、作者要求或冻结契约。

    node scripts/r3_experience_drive.mjs render-theme INPUT.json > THEME.md
    node scripts/r3_experience_drive.mjs validate THEME.md
    node scripts/r3_experience_drive.mjs index TEMP_DIR 1 01-character-relation-v1.md 02-conflict-pacing-v1.md ...
    node scripts/r3_experience_drive.mjs resolve TEMP_DIR
    node scripts/r3_experience_drive.mjs check-ref INDEX.md EXACT_THEME_FILENAME THEME.md

实际初始化须列出全部六份初始主题文件（空主题允许），不是传入省略号。主题格式为可见 H1、H2（ID | 标题 | vN | 状态）及结构化字段列表；标签、验证证据为可见 JSON 值，其余为文字。Google Docs 会剥离 HTML 注释并转义标点，工具兼容 Markdown 标点反转义；必须在宿主真实上传后回读导出、解析并与预期语义数据比较，失败不发布。实验旧格式可用 inspect-experiment 只读解析，不满足证据 schema 的数据禁止直接晋升正式经验。不要虚构项目证据或把实验经验写入正式库。

召回时先完成根目录枚举，按数字版本定位最高索引，要求该名称唯一，索引标题版本匹配，且所有引用文件名在根目录唯一可定位；若存在重复、歧义或索引损坏，跳过本次经验使用而非静默回退到可能已撤回的旧版。读取索引选相关主题，完整导出对应主题后执行 check-ref 校验其语义哈希及索引条目，才可从 supported/mature 中自主选用。没有匹配时不必读主题；不按章注入。使用前重查最新索引版本，版本变化则重新检索。所有临时文件使用独立会话目录；Drive 不可用时无经验继续，不将临时缓存视为权威。复盘同时核对本阶段实际使用的历史 ID/版本、预期与实际效果、负面影响、适用条件变化；按证据更新、降级、合并（保留旧 ID 为 retired）或淘汰。不新增逐章日志或硬配额。

### 4.4 安全发布（单写者、不可变索引提交）

Gemini 的 Drive 工具实测支持搜索、创建、读内容/导出及移动/重命名；不支持内容 CAS/If-Match，搜索可能有最终一致性延迟。不要假设原地内容更新或并发事务。作者或调度方保证全库串行写入（不只是单主题）。不自动抢锁、不多会话并发初始化；有竞争迹象只暂停经验写入。

1. 枚举根目录/暂存/归档，完成分页与身份校验；下载当前索引及其引用的全部主题到临时目录（写入前全库校验）。运行 resolve，记录基线索引文件名/内容哈希。现有索引与正文不一致则停止写入、报告并由作者确认恢复；不静默重建生效。
2. 根据已验证证据仅修改明确 ID；render-theme 生成候选主题。创建于 staging/，候选名含唯一事务标识，旧索引及旧主题完全不动。回读实际候选 Markdown，确认 validate 通过。
3. 使用实际回读文件运行：

       node scripts/r3_experience_drive.mjs prepare TEMP_DIR BASE_INDEX OLD_THEME NEW_THEME CANDIDATE.md CHANGED_ID

   多个明确变更 ID 可追加参数。prepare 检查保留未修改条目、ID 唯一、版本递增、证据不丢及退休状态；返回候选语义 SHA、baseSha256、下一索引文件名和 indexText。将 indexText 原样写入临时文件，不让模型手工编辑索引。真实上传/转换后的内容必须重新回读校验。
4. 发布前重新枚举根目录、下载最新有效索引及其引用文件到新临时目录，运行 `confirm-base FRESH_DIR BASE_INDEX BASE_SHA256`。若任何 ID、版本、内容或资源唯一性变化/不确定，停止发布；不把检查称为原子 CAS。
5. 将已校验候选移动到根目录，命名精确的新主题版本（确认不存在同名文件），回读确认内容与候选一致。此时旧索引仍是唯一提交点。即使此处中断、根目录多一个新版主题，也不得读取未引用文件。
6. 创建更高版本不可变索引（不覆盖旧索引），以该完整且经校验的索引发布为提交点。枚举确认唯一、回读最新索引与其全部引用主题，运行 resolve，并确认返回的新版本、全部 ID/状态/内容和预期索引一致。若创建结果不明或回读失败，禁止盲目重试和归档；先重新枚举，确认是否已提交。最高索引损坏时停止经验读写并报告，保留全部文件用于恢复，绝不自动回落到可能已撤回经验的旧索引。
7. 确认新索引有效才归档旧索引及不再被新索引引用的旧主题；未变更主题留在根目录。归档失败不影响已确认的新版，后续串行恢复时复查引用关系再清理；不删除任何已提交历史。失败候选标 REJECTED- 后隔离，禁止默认召回。重入优先按已知事务标识/文件 ID 查找候选与已提交索引；基线变化重新准备，不重复创建。查询失败不得当作资源不存在。

### 4.5 完整备份、迁移与恢复

在串行维护暂停写入时，通过 Drive 原生工具完整枚举并导出当前索引、全部引用主题、archive/ 全部已提交历史索引及主题；失败候选作为可选隔离证据（REJECTED- 文件不参与经验历史）。不把 staging/ 未提交候选纳入正常备份。保留原始导出的 Markdown，不以摘要替代；核对源文件清单与实际导出，重查最新索引未变化。临时目录需只包含现行提交、archive/ 历史、可选 README.md，运行：

    node scripts/r3_experience_drive.mjs seal EXPORT_DIR
    node scripts/r3_experience_drive.mjs verify EXPORT_DIR
    node scripts/r3_experience_drive.mjs restore EXPORT_DIR NEW_DIR

seal 生成独立 SHA-256/字节数清单；verify 重新解析当前与全部历史索引、重建索引并核验一致性、连续历史及证据，拒绝缺失、篡改、未提交文件；restore 至新目录再验，不覆盖现有库。打包整个已校验目录为 ZIP。对另一 Agent 只需标准 Markdown 与清单，无原 Drive ID 依赖；使用安全解压（拒绝路径穿越、重复路径及符号链接）后验证。另账号真实云端恢复应由作者授权，先新建隔离目录、上传/回读校验，再切换入口，不能静默替换原库。不得将本地 manifest 的自洽误称为独立证明远端枚举无遗漏。

## 5. 错误处理与回归

- R3_LEDGER_BINDING_STALE_OR_MISSING_N：回查定稿源及具体投影，不只重算 hash。
- R3_P1_ARC_FIX_DUE_ID：当前弧尚未关闭的实质风险，要求独立确认处理，非强制每章高潮。
- R3_P1_*_EVIDENCE / *_INVALID：按真实输入字段、原文证据修正。不得直接改审批状态。
- 原字数工具仍是 `node scripts/check_chapter_wordcount.mjs CHAPTER MIN_WORDS --json`；结果 `results[0].word_count`，plan `wordCount`、`wordCountPass`。不得混用字段或静默改旧 CLI。
- 使用完整 R3 delivery ZIP 交付含 P1 状态、账本绑定和审核历史；另行按授权导出用户经验库，不把私人库混入小说/Skill 仓库。
- 回归命令：`node --test scripts/tests/r3_plan_protocol.test.mjs`、`node --test scripts/tests/r3_experience.test.mjs`，`node --test scripts/tests/r3_experience_drive.test.mjs`，以及现有 R3、R2/V3 测试。

文学收益与创作摩擦仍需后续真实连载实测；不要求逐模块进行 Gemini 试跑，不伪造作者批准。
