#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkIds} from '../plan_review_common.mjs';

const script=name=>fileURLToPath(new URL('../'+name+'.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'r2-stage2-plan-gate-'));
const pf=path.join(root,'02-写作计划.json');
const read=()=>JSON.parse(fs.readFileSync(pf,'utf8'));
const save=x=>fs.writeFileSync(pf,JSON.stringify(x,null,2)+'\n');
const run=(scriptName,...a)=>{
  const p=spawnSync(process.execPath,[script(scriptName),root,...a],{encoding:'utf8'});
  assert.ok(p.stdout.trim(),'missing tool output '+p.stderr);
  return {code:p.status,data:JSON.parse(p.stdout)};
};
const report=(role,rev,hashes,decision='pass_candidate',issues=[])=>({
  schemaVersion:1,kind:'plan',role,revision:rev,artifactHashes:hashes,
  reviewer:{kind:'independent_agent',runId:'real-fixture-'+role+'-'+rev,contextId:'fixture-context-'+role+'-'+rev},
  decision,summary:'测试用独立评审结论，有具体文本依据，但不代表真实文学审稿。',
  checks:checkIds[role].map(id=>({id,status:'pass',evidence:'检视了相关规划事实与人物动机，未发现额外硬性冲突。'})),
  issues
});
try{
  const chapters=[1,2,3].map(n=>({chapterNumber:n,title:'章节'+n,filePath:'第'+n+'章.md',status:'pending'}));
  save({version:1,novelName:'原创作品',totalChapters:3,minWordsPerChapter:2000,chapters});
  for(const [name,content] of [
    ['00-人物档案.md','# 人物档案\n主角在债务压力下必须在守信和盈利之间做出决定。\n重要配角会自行追求职业与自由，并有反制能力。\n'],
    ['01-大纲.md','# 全剧透故事梗概\n第八章先解决债务清偿，再转入道统争夺。主角最终凭旧约的可回溯证据取胜。\n每一卷有具体的读者期待、局部兑现与余波。\n'],
    ['03-文风基准.md','# 文风指纹\n人物说话有独立目标，叙述随危机与日常改变速度，避免制式的高光总结句。\n## 本书校准段落\n'],
  ])fs.writeFileSync(path.join(root,name),content);
  assert.equal(run('init_v3_state','--json').code,0);
  assert.equal(read().v3.planGate.status,'pending','new projects require Stage 2 review');
  let plan=read();plan.v3.creativeDecision='accepted';plan.v3.storyPlanApproved=true;save(plan);
  assert.ok(run('v3_gate','--chapter','1','--json').data.issues.some(i=>i.code==='PLAN_REVIEW_NOT_APPROVED'),
    'manually toggling storyPlanApproved may not bypass the plan gate');
  let prep=run('plan_review','prepare','--planner-run-id','fixture-writer','--planner-context-id','fixture-writer-context');
  assert.equal(prep.code,0);
  assert.equal(prep.data.revision,1);
  assert.equal(read().v3.storyPlanApproved,false,'prepare must revoke stale approval');
  const defect={id:'P0-1',severity:'BLOCKER',status:'open',artifact:'01-大纲.md',quote:'第八章先解决债务清偿',
    reason:'示例：未核对足够现金流支持债款。',suggestion:'核对账目并修改叙事中的金额。'};
  fs.writeFileSync(path.join(root,'review-a.json'),JSON.stringify(report('architecture',1,prep.data.artifactHashes,'pass_candidate',[defect])));
  assert.match(run('plan_review','submit','--role','architecture','--report','review-a.json').data.error,/PLAN_UNRESOLVED_SEVERE_ISSUES/);
  fs.writeFileSync(path.join(root,'review-a.json'),JSON.stringify(report('architecture',1,prep.data.artifactHashes,'revise',[defect])));
  assert.equal(run('plan_review','submit','--role','architecture','--report','review-a.json').data.status,'revise');
  assert.equal(run('plan_review','approve','--evidence','approval.json').code,2,'cannot approve rejected plan');
  fs.appendFileSync(path.join(root,'01-大纲.md'),'修订：核对债务与交易金额，使相关现金流成立。\n');
  prep=run('plan_review','prepare','--planner-run-id','fixture-writer','--planner-context-id','fixture-writer-context');
  assert.equal(prep.data.revision,2,'revisions never overwrite the old review');
  assert.ok(fs.existsSync(path.join(root,'reviews/plan/input-v1.json')));
  assert.ok(fs.existsSync(path.join(root,'reviews/plan/input-v2.json')));
  const hash=prep.data.artifactHashes;
  fs.writeFileSync(path.join(root,'review-a.json'),JSON.stringify(report('architecture',2,hash)));
  assert.equal(run('plan_review','submit','--role','architecture','--report','review-a.json').data.status,'under_review');
  const duplicate=report('reader',2,hash);duplicate.reviewer.contextId='fixture-context-architecture-2';
  fs.writeFileSync(path.join(root,'review-b.json'),JSON.stringify(duplicate));
  assert.match(run('plan_review','submit','--role','reader','--report','review-b.json').data.error,/PLAN_SELF_OR_DUPLICATE_REVIEW/);
  fs.writeFileSync(path.join(root,'review-b.json'),JSON.stringify(report('reader',2,hash)));
  assert.equal(run('plan_review','submit','--role','reader','--report','review-b.json').data.status,'awaiting_approval');
  assert.equal(run('plan_review','verify').code,1,'independent pass candidates do not approve the plan');
  const g=read().v3.planGate;
  const approval={schemaVersion:1,kind:'plan',approved:true,revision:g.revision,
    inputSha256:g.inputSha256,
    reviewSha256:{architecture:g.reviews.architecture.sha256,reader:g.reviews.reader.sha256},
    quote:'我确认这版故事规划可以进入试写。',source:'test_fixture_not_real_author',
    approvedAt:'2026-11-23T12:00:00Z'};
  fs.writeFileSync(path.join(root,'approval.json'),JSON.stringify({...approval,reviewSha256:{...approval.reviewSha256,reader:'bad'}}));
  assert.match(run('plan_review','approve','--evidence','approval.json').data.error,/PLAN_AUTHOR_EVIDENCE_INVALID/);
  fs.writeFileSync(path.join(root,'approval.json'),JSON.stringify(approval));
  assert.equal(run('plan_review','approve','--evidence','approval.json').code,0);
  assert.equal(read().v3.storyPlanApproved,true);
  assert.equal(run('plan_review','verify').code,0);
  assert.equal(run('v3_gate','--chapter','1','--json').code,0);
  fs.appendFileSync(path.join(root,'01-大纲.md'),'未经批准的蓝图修改');
  assert.ok(run('v3_gate','--chapter','1','--json').data.issues.some(i=>i.code==='PLAN_BLUEPRINT_CHANGED'));
  fs.writeFileSync(path.join(root,'01-大纲.md'),fs.readFileSync(path.join(root,'01-大纲.md'),'utf8').replace('未经批准的蓝图修改',''));
  assert.equal(run('plan_review','verify').code,0,'reverting to exact reviewed bytes restores approval validity');
  fs.appendFileSync(path.join(root,g.reviews.reader.path),' ');
  assert.ok(run('plan_review','verify').data.issues.includes('PLAN_READER_REVIEW_CHANGED'));
  console.log('PASS Stage 2 plan review: freeze, dual reviewers, blockers, author evidence and stale checks');
}finally{fs.rmSync(root,{recursive:true,force:true});}
