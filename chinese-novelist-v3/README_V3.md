# Chinese Novelist V3 · 开发版

这是一个独立 Skill，源自 [PenglongHuang/chinese-novelist-skill](https://github.com/PenglongHuang/chinese-novelist-skill) v2.3.2（MIT），保留原版文字参考和 Node.js 校验工具，同时加入面向精品网文的创意竞标、题材自适应架构、前三章强制停审、独立编辑与分卷审计。

## 安装
将整个 `chinese-novelist-v3/` 目录安装为新技能；保留已有 `chinese-novelist`。入口文件：`SKILL.md`。未引入特定平台私有的工具调用语法，需根据宿主环境授权选择真实工具。

## 主要参考
- [总流程](references/v3/workflow.md)
- [运行手册](references/v3/operational-runbook.md)
- [创意竞标](references/v3/creative-lab.md)
- [故事架构与题材路由](references/v3/story-architecture.md)
- [Stage 2 原生蓝图审核及修订协议](references/v3/plan-review-protocol.md)
- [八套网文知识库（按创作阶段检索）](references/webnovel/README.md)
- [独立审稿](references/v3/editorial-gate.md)
- [状态与备份](references/v3/state-and-backup.md)
- [V2 工艺红队](references/v3/craft-and-redteam.md)
- [独立审稿 Agent 模板](references/v3/review-agent-template.md)
- [工程与创作验收](references/v3/acceptance.md)
- 原版工具：`scripts/check_chapter_wordcount.mjs`、`scripts/init_chapter_summaries.mjs`、`scripts/validate_project.mjs`

## 测试
```bash
node scripts/tests/plan_review.test.mjs
node scripts/tests/reference_catalog.test.mjs
node scripts/tests/init_chapter_summaries.test.mjs
node scripts/tests/validate_project.test.mjs
node scripts/tests/init_v3_state.test.mjs
node scripts/tests/v3_gate.test.mjs
node scripts/tests/audit_story_state.test.mjs
node scripts/tests/check_repetition.test.mjs
node scripts/tests/prepare_pilot_review.test.mjs
python3 -m unittest discover -s scripts/tests -p 'test_snapshot.py'
```

## 创意与章节的知识库接入
在创意竞标前先选目标读者、题材和主引擎，必要时组合重生、系统、苟道、反派视角等辅助机制；构思需要明确读者回报、长期冲突和失效模式。规划时查成长、人物关系和节奏库，写章时只按当前场景查场景/技法/命名库。详细路由见 [references/webnovel/README.md](references/webnovel/README.md)。这不是将上游 GPL 数据整包复制；本库是独立撰写的创作参考，也不保证自动增加文学评分。

## Stage 2 原生规划门禁
新建项目按 Skill 正式流程诊断创意、写出完整故事因果、完成四级规划与跨文件数值/规则审计；冻结后经架构/目标读者双独立评审。未解决的重大缺陷须定向返工、重新冻结、复审，作者批准最新版后才允许写第一章。**不是靠测试提示词临时补流程。**

    node scripts/plan_review.mjs <项目目录> prepare --planner-run-id REAL_RUN --planner-context-id REAL_CONTEXT
    node scripts/plan_review.mjs <项目目录> submit --role architecture --report reviews/plan-architecture-source.json
    node scripts/plan_review.mjs <项目目录> submit --role reader --report reviews/plan-reader-source.json
    # 两路均通过且作者真正批准之后
    node scripts/plan_review.mjs <项目目录> approve --evidence reviews/plan-author-evidence.json
    node scripts/plan_review.mjs <项目目录> verify

详细输入格式见 [协议](references/v3/plan-review-protocol.md)。默认仍只使用原有三份 Markdown 规划工件及写作计划；不强制添加14份文档。旧项目需作者明确选择 `--enable-plan-gate` 才启用，不静默阻断其既有章节。

## 前三章审稿包

```bash
node scripts/prepare_pilot_review.mjs <项目目录> --json
node scripts/v3_gate.mjs <项目目录> --chapter 4 --json
node scripts/check_repetition.mjs <项目目录> --json
```

前三章完成后先生成审稿输入与哈希，然后交给独立编辑。评审、用户批准和稿件哈希都符合才可继续第 4 章。

## 快照命令

```bash
python3 scripts/create_snapshot.py <项目目录> <新的快照.zip>
python3 scripts/verify_snapshot.py <快照.zip>
python3 scripts/restore_snapshot.py <快照.zip> <空目录>
```

本阶段只验证本地快照与恢复，不运行 Google Drive 上传、下载或同步。

## 限制
脚本能验证文件、状态、字数与备份完整性，不能客观证明文学品质。多 Agent 的隔离能力须经宿主实际验证。前三章写作质量需独立审稿、作者确认，并最终用目标读者盲评验证。
