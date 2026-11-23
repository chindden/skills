# Chinese Novelist V3 · 开发版

这是一个独立 Skill，源自 [PenglongHuang/chinese-novelist-skill](https://github.com/PenglongHuang/chinese-novelist-skill) v2.3.2（MIT），保留原版文字参考和 Node.js 校验工具，同时加入面向精品网文的创意竞标、题材自适应架构、前三章强制停审、独立编辑与分卷审计。

## 安装
将整个 `chinese-novelist-v3/` 目录安装为新技能；保留已有 `chinese-novelist`。入口文件：`SKILL.md`。未引入特定平台私有的工具调用语法，需根据宿主环境授权选择真实工具。

## 主要参考
- [总流程](references/v3/workflow.md)
- [创意竞标](references/v3/creative-lab.md)
- [故事架构与题材路由](references/v3/story-architecture.md)
- [独立审稿](references/v3/editorial-gate.md)
- [状态与备份](references/v3/state-and-backup.md)
- [V2 工艺红队](references/v3/craft-and-redteam.md)
- [独立审稿 Agent 模板](references/v3/review-agent-template.md)
- [工程与创作验收](references/v3/acceptance.md)
- 原版工具：`scripts/check_chapter_wordcount.mjs`、`scripts/init_chapter_summaries.mjs`、`scripts/validate_project.mjs`

## 测试
```bash
node scripts/tests/init_chapter_summaries.test.mjs
node scripts/tests/validate_project.test.mjs
node scripts/tests/v3_gate.test.mjs
node scripts/tests/check_repetition.test.mjs
python3 -m unittest discover -s scripts/tests -p 'test_snapshot.py'
```

## 快照命令

```bash
python3 scripts/create_snapshot.py <项目目录> <新的快照.zip>
python3 scripts/verify_snapshot.py <快照.zip>
python3 scripts/restore_snapshot.py <快照.zip> <空目录>
```

仅本地校验，不代替真实 Drive 上传、回读及 SHA-256 核对。

## 限制
脚本能验证文件、状态、字数与备份完整性，不能客观证明文学品质。多 Agent 的隔离能力须经宿主实际验证。前三章写作质量需独立审稿、作者确认，并最终用目标读者盲评验证。
