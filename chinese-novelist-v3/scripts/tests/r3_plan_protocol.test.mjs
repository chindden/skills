#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSnapshot,verifySnapshot} from '../r3_snapshots.mjs';
import {textDiff} from '../r3_diff.mjs';
import {sha256} from '../v3_common.mjs';
import {issueKey} from '../r3_p1_common.mjs';
import {momentum,cascadeWarnings} from '../r3_feedback_view.mjs';
import {structuredChecks} from '../r3_structured_checks.mjs';

const script=name=>fileURLToPath(new URL('../'+name+'.mjs',import.meta.url));
const outline='# 故事大纲\n## 核心契约\n核心承诺：经营与修仙同频。核心能力不能读心。\n## 滚动卷纲\n### 第1卷\n卷一：灵米经营。\n### 第2卷\n卷二：开新坊市。\n';
const character='# 人物档案\n## 核心人设\n主角先小利后天下。\n## 动态状态与远期弧线\n角色成长由正文决定。\n';
const style='# 文风基准\n## 文风指纹\n烟火气，人物有私心。\n## 本书校准段落\n';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r3-protocol-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const plan={novelName:'测试卷',writingMode:'serial',minWordsPerChapter:1000,totalChapters:4,
    chapters:[1,2,3,4].map(n=>({chapterNumber:n,title:'第'+n+'章',filePath:'chapters/'+n+'.md',status:'pending'})),
    v3:{schemaVersion:1,creativeDecision:'accepted',storyPlanApproved:false,
      r2:{schemaVersion:1,chapterReviews:{},arcReviews:{}},pilotGate:{status:'pending'},
      r3:{schemaVersion:1,mode:'experimental',status:'bootstrap',reviewPolicy:'every_chapter',
        corePlan:{status:'pending'},volumeCheckpoints:{},finalRefinement:{status:'pending'}}}};
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify(plan,null,2)+'\n');
  for(const [file,content] of [['00-人物档案.md',character],['01-大纲.md',outline],['03-文风基准.md',style]])
    fs.writeFileSync(path.join(root,file),content);
  return root;
}
const read=root=>JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json'),'utf8'));
const save=(root,p)=>fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify(p,null,2)+'\n');
const run=(root,...flags)=>{
  const r=spawnSync(process.execPath,[script('r3_plan'),root,...flags],{encoding:'utf8'});
  assert.ok(r.stdout.trim(),r.stderr);
  return {code:r.status,data:JSON.parse(r.stdout)};
};
const rfile=(root,rel,o)=>fs.writeFileSync(path.join(root,rel),JSON.stringify(o,null,2)+'\n');
const evidence=(root,kind,fields)=>({schemaVersion:1,kind,approved:true,source:'fixture-author-message-not-real',
  quote:'我确认本次规划版本。',approvedAt:'2026-11-24T00:00:00Z',...fields});
const report=(role,packet,decision='pass_candidate')=>({
  schemaVersion:1,kind:'r3_core',role,revision:packet.revision,
  snapshotSha256:packet.snapshotSha256,
  reviewer:{kind:'independent_agent',runId:'run-'+role,contextId:'ctx-'+role},
  summary:'测试复审文本，不代表真实独立模型审稿。',
  checks:(role==='architecture'?['world_rules_and_power','character_causality','foreshadowing_and_finale']:
    ['genre_promise','opening_and_rewards','protagonist_agency']).map(id=>({id,status:'pass',evidence:'本文本有明确证据与实际因果。'})),
  preserveStrengths:role==='reader'?['烟火气','反派可信','情绪发展']:undefined,issues:[],decision
});
function approvedCore(root){
  const a=run(root,'core-prepare','--planner-run-id','writer1','--planner-context-id','writer-context');
  assert.equal(a.code,0,JSON.stringify(a.data));
  const packet=JSON.parse(fs.readFileSync(path.join(root,a.data.inputPath),'utf8'));
  for(const role of ['architecture','reader']){
    rfile(root,'report-'+role+'.json',report(role,packet));
    const r=run(root,'core-submit','--role',role,'--report','report-'+role+'.json');
    assert.equal(r.code,0,JSON.stringify(r.data));
  }
  const gate=read(root).v3.r3.corePlan;
  rfile(root,'evidence-core.json',evidence(root,'r3_core',{
    revision:gate.revision,inputSha256:gate.inputSha256,
    reviewSha256:{architecture:gate.reviews.architecture.sha256,reader:gate.reviews.reader.sha256}}));
  const done=run(root,'core-approve','--evidence','evidence-core.json');
  assert.equal(done.code,0,JSON.stringify(done.data));
  return gate;
}
function approvedVolume(root,vol,start,end){
  const pre=run(root,'volume-prepare','--volume',String(vol),'--start',String(start),'--end',String(end));
  assert.equal(pre.code,0,JSON.stringify(pre.data));
  const rec=read(root).v3.r3.volumeCheckpoints[String(vol)];
  rfile(root,'evidence-volume.json',evidence(root,'r3_volume',{
    volId:vol,revision:rec.revision,inputSha256:rec.inputSha256,
    coreInputSha256:rec.coreInputSha256}));
  const done=run(root,'volume-approve','--volume',String(vol),'--evidence','evidence-volume.json');
  assert.equal(done.code,0,JSON.stringify(done.data));
  return rec;
}

test('source-based Diff first shows changed lines and checksums',()=>{
  const delta=textDiff('a\nb\nc\n','a\nx\nc\n','story.md');
  assert.match(delta,/^-b$/m);
  assert.match(delta,/^\+x$/m);
  assert.match(delta,/before-sha256 [0-9a-f]{64}/);
});
test('snapshot retry is idempotent, mutation or history tampering fails',t=>{
  const root=fixture(t);
  let s=createSnapshot(root,'reviews/r3/core/v1',{'core.md':'text\n'});
  assert.equal(s.reused,false);
  assert.equal(createSnapshot(root,'reviews/r3/core/v1',{'core.md':'text\n'}).reused,true);
  assert.throws(()=>createSnapshot(root,'reviews/r3/core/v1',{'core.md':'changed\n'}),/R3_SNAPSHOT_CONFLICT/);
  fs.writeFileSync(path.join(root,'reviews/r3/core/v1/core.md'),'tampered\n');
  assert.throws(()=>verifySnapshot(root,s.path,s.sha256),/R3_SNAPSHOT_HASH_MISMATCH/);
});
test('core review and author approval are mandatory; R2 consent alone never passes',t=>{
  const root=fixture(t);
  assert.equal(run(root,'verify','--chapter','1').data.issues[0],'R3_CORE_NOT_APPROVED');
  let p=read(root);p.v3.storyPlanApproved=true;save(root,p);
  assert.equal(run(root,'verify','--chapter','1').data.issues[0],'R3_CORE_NOT_APPROVED');
  approvedCore(root);
  assert.equal(run(root,'verify','--chapter','1').data.issues[0],'R3_VOLUME_NOT_APPROVED');
  approvedVolume(root,1,1,2);
  assert.equal(run(root,'verify','--chapter','1').code,0);
  assert.equal(run(root,'verify','--chapter','3').code,1);
  assert.ok(run(root,'verify','--chapter','3').data.issues.includes('R3_VOLUME_NOT_APPROVED_FOR_CHAPTER_3'));
});
test('future volume can change without altering approved core or volume one',t=>{
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,2);
  fs.writeFileSync(path.join(root,'01-大纲.md'),outline.replace('开新坊市','开灵丹坊'));
  assert.equal(run(root,'verify','--chapter','2').code,0);
  approvedVolume(root,2,3,4);
  assert.equal(run(root,'verify','--chapter','4').code,0);
  fs.writeFileSync(path.join(root,'01-大纲.md'),outline.replace('开新坊市','开第三家丹坊'));
  const x=run(root,'verify','--chapter','4');
  assert.equal(x.code,1);
  assert.ok(x.data.issues.includes('VOLUME_CHECKPOINT_CHANGED'));
});
test('core tampering invalidates old approval, while changing remote title and chapter status does not',t=>{
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,2);
  const plan=read(root);
  plan.chapters[3].title='更精彩的标题';
  plan.chapters[0].status='completed';
  plan.totalChapters=110;
  save(root,plan);
  assert.equal(run(root,'verify','--chapter','2').code,0);
  fs.writeFileSync(path.join(root,'01-大纲.md'),outline.replace('核心能力不能读心','核心能力可以读心'));
  const result=run(root,'verify','--chapter','1');
  assert.equal(result.code,1);
  assert.ok(result.data.issues.includes('CORE_PLAN_CHANGED'));
});
test('volume slots enforce file paths and chapter-number boundaries',t=>{
  const root=fixture(t);approvedCore(root);
  const invalid=run(root,'volume-prepare','--volume','1','--start','2','--end','3');
  assert.equal(invalid.code,2);
  assert.equal(invalid.data.error,'R3_VOLUME_RANGE_GAP');
  approvedVolume(root,1,1,2);
  const plan=read(root);plan.chapters[0].filePath='chapters/changed.md';save(root,plan);
  const result=run(root,'verify','--chapter','1');
  assert.equal(result.code,1);
  assert.ok(result.data.issues.includes('VOLUME_CHECKPOINT_CHANGED'));
});
test('wrong or missing core human approval source is rejected, no auto-sign',t=>{
  const root=fixture(t);
  const pre=run(root,'core-prepare','--planner-run-id','writer1','--planner-context-id','writer-context');
  const packet=JSON.parse(fs.readFileSync(path.join(root,pre.data.inputPath),'utf8'));
  for(const role of ['architecture','reader']){
    rfile(root,'report-'+role+'.json',report(role,packet));
    assert.equal(run(root,'core-submit','--role',role,'--report','report-'+role+'.json').code,0);
  }
  const gate=read(root).v3.r3.corePlan;
  rfile(root,'bad-approval.json',evidence(root,'r3_core',{revision:gate.revision,
    inputSha256:'false',reviewSha256:{architecture:gate.reviews.architecture.sha256,reader:gate.reviews.reader.sha256}}));
  assert.equal(run(root,'core-approve','--evidence','bad-approval.json').code,2);
  assert.equal(read(root).v3.r3.corePlan.status,'awaiting_approval');
});
test('changed previous frozen snapshot blocks next core prepare',t=>{
  const root=fixture(t);approvedCore(root);
  const g=read(root).v3.r3.corePlan;
  fs.writeFileSync(path.join(root,g.snapshotPath,'01-core.md'),'tampered');
  const x=run(root,'core-prepare','--planner-run-id','writer2','--planner-context-id','writer2ctx');
  assert.equal(x.code,2);
  assert.match(x.data.error,/R3_SNAPSHOT_HASH_MISMATCH/);
});
test('full core revision generates an immutable Diff and invalidates earlier author consent',t=>{
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,2);
  fs.writeFileSync(path.join(root,'00-人物档案.md'),character.replace('先小利后天下','先天下后小利'));
  const x=run(root,'core-prepare','--planner-run-id','writer2','--planner-context-id','writer2ctx');
  assert.equal(x.code,0,JSON.stringify(x.data));
  assert.equal(x.data.revision,2);
  assert.ok(x.data.diffPath);
  const text=fs.readFileSync(path.join(root,x.data.diffPath),'utf8');
  assert.match(text,/先小利后天下/);assert.match(text,/先天下后小利/);
  assert.equal(run(root,'verify','--chapter','1').code,1);
});


test('R3 chapter gate requires real core and volume approval, not legacy storyPlanApproved',t=>{
  const root=fixture(t);
  const gate=(...args)=>{
    const result=spawnSync(process.execPath,[script('v3_gate'),root,...args,'--json'],{encoding:'utf8'});
    return {code:result.status,data:JSON.parse(result.stdout)};
  };
  assert.ok(gate('--chapter','1').data.issues.some(i=>i.code==='R3_CORE_NOT_APPROVED'));
  approvedCore(root);
  assert.ok(gate('--chapter','1').data.issues.some(i=>i.code==='R3_VOLUME_NOT_APPROVED'));
  approvedVolume(root,1,1,2);
  const allowed=gate('--chapter','1');
  assert.equal(allowed.code,0,JSON.stringify(allowed.data));
  const skipped=gate('--chapter','3');
  assert.equal(skipped.code,1);
  assert.ok(skipped.data.issues.some(i=>i.code==='R3_VOLUME_NOT_APPROVED_FOR_CHAPTER_3'));
  const x=read(root);x.v3.r3.reviewPolicy='risk_tiered';save(root,x);
  assert.ok(gate('--chapter','1').data.issues.some(i=>i.code==='R3_REVIEW_POLICY_NOT_ENABLED'));
});
test('R3 chapter reviews include source snapshots, validate them, and deny stale text',t=>{
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,2);
  const ch=path.join(root,'chapters');
  fs.mkdirSync(ch);
  fs.writeFileSync(path.join(ch,'1.md'),'第一章原稿：主角开设灵米坊，因信用立下第一笔账。\n');
  const plan=read(root);
  plan.chapters[0].status='completed';plan.chapters[0].wordCountPass=true;
  save(root,plan);
  const gate=()=>{
    const g=spawnSync(process.execPath,[script('v3_gate'),root,'--chapter','2','--json'],{encoding:'utf8'});
    return {code:g.status,data:JSON.parse(g.stdout)};
  };
  assert.ok(gate().data.issues.some(i=>i.code==='R2_REVIEW_NOT_PASSED_ch001'));
  const prep=spawnSync(process.execPath,[script('r2_review'),root,'prepare',
    '--scope','chapter','--end','1','--writer-run-id','writer-a','--writer-context-id','ctx-a'],
    {encoding:'utf8'});
  assert.equal(prep.status,0,prep.stdout);
  const packet=JSON.parse(prep.stdout);
  const stamped=read(root).v3.r2.chapterReviews['1'];
  assert.ok(stamped.r3Snapshot.path.startsWith('reviews/r3/manuscripts/'));
  assert.ok(fs.existsSync(path.join(root,stamped.r3Snapshot.path,'chapter-0001.md')));
  const report={schemaVersion:1,kind:'chapter',end:1,revision:1,
    manuscriptHashes:packet.manuscriptHashes,
    reviewer:{kind:'independent_agent',runId:'editor-a',contextId:'editor-ctx'},
    decision:'pass_candidate',summary:'测试审稿，不代表真实文学判断。',issues:[]};
  rfile(root,'r2-editor-report.json',report);
  const submit=spawnSync(process.execPath,[script('r2_review'),root,'submit',
    '--scope','chapter','--end','1','--report','r2-editor-report.json'],{encoding:'utf8'});
  assert.equal(submit.status,0,submit.stdout);
  assert.equal(gate().code,0);
  fs.appendFileSync(path.join(ch,'1.md'),'悄然修改了已审正文。');
  assert.ok(gate().data.issues.some(i=>i.code==='R2_MANUSCRIPT_CHANGED_ch001'));
  fs.writeFileSync(path.join(ch,'1.md'),'第一章原稿：主角开设灵米坊，因信用立下第一笔账。\n');
  fs.appendFileSync(path.join(root,stamped.r3Snapshot.path,'chapter-0001.md'),'tampered\n');
  assert.ok(gate().data.issues.some(i=>i.code.includes('R3_SNAPSHOT_HASH_MISMATCH')));
});
test('R3 Pilot preparation requires core and first three chapter coverage, not legacy storyPlanApproved',t=>{
  const root=fixture(t);approvedCore(root);
  const plan=read(root);
  // Pilot cannot launch before the corresponding chapter range is approved.
  const a=spawnSync(process.execPath,[script('prepare_pilot_review'),root,'--json'],{encoding:'utf8'});
  assert.equal(a.status,2);
  assert.match(JSON.parse(a.stdout).error,/R3_PLAN_APPROVAL_REQUIRED/);
  approvedVolume(root,1,1,2);
  const b=spawnSync(process.execPath,[script('prepare_pilot_review'),root,'--json'],{encoding:'utf8'});
  assert.equal(b.status,2);
  assert.match(JSON.parse(b.stdout).error,/R3_PLAN_APPROVAL_REQUIRED/);
});


function readyPilot(t,lastDecision='pass_candidate'){
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,4);
  const dir=path.join(root,'chapters');fs.mkdirSync(dir);
  const plan=read(root);
  for(let n=1;n<=3;n++){
    fs.writeFileSync(path.join(dir,n+'.md'),'第'+n+'章正式文本：掌柜作出有代价的经营选择。\n');
    plan.chapters[n-1].status='completed';
    plan.chapters[n-1].wordCountPass=true;
  }
  save(root,plan);
  for(let n=1;n<=3;n++){
    const prepared=spawnSync(process.execPath,[script('r2_review'),root,'prepare',
      '--scope','chapter','--end',String(n),'--writer-run-id','writer-'+n,
      '--writer-context-id','ctx-'+n],{encoding:'utf8'});
    assert.equal(prepared.status,0,prepared.stdout);
    const pkt=JSON.parse(prepared.stdout);
    rfile(root,'chapter-review-'+n+'.json',{
      schemaVersion:1,kind:'chapter',end:n,revision:1,manuscriptHashes:pkt.manuscriptHashes,
      reviewer:{kind:'independent_agent',runId:'editor-'+n,contextId:'editorctx-'+n},
      decision:n===3?lastDecision:'pass_candidate',summary:'测试报告占位，不代表真实文学审核。',issues:n===3&&lastDecision==='revise'?[{id:'TIME-1',severity:'MAJOR',status:'open',chapter:3,quote:'第3章正式文本',reason:'测试时序冲突',suggestion:'测试定向修订'}]:[]
    });
    const submitted=spawnSync(process.execPath,[script('r2_review'),root,'submit',
      '--scope','chapter','--end',String(n),
      '--report','chapter-review-'+n+'.json'],{encoding:'utf8'});
    assert.equal(submitted.status,0,submitted.stdout);
  }
  rfile(root,'story-ledger.json',{schemaVersion:1,facts:[],handoffs:[]});
  return root;
}
test('full R3 Pilot path requires genuine-shaped chapter reviews, independent Pilot and author evidence',t=>{
  const root=readyPilot(t);
  const g=(n)=>spawnSync(process.execPath,[script('v3_gate'),root,
    '--chapter',String(n),'--json'],{encoding:'utf8'});
  const deny=g(4);
  assert.equal(deny.status,1);
  assert.ok(JSON.parse(deny.stdout).issues.some(x=>x.code==='PILOT_NOT_PASSED'));
  const prepared=spawnSync(process.execPath,[script('prepare_pilot_review'),root,'--json'],{encoding:'utf8'});
  assert.equal(prepared.status,0,prepared.stdout);
  const p=JSON.parse(prepared.stdout),hashes=Object.fromEntries(p.chapters.map(c=>[String(c.chapterNumber),c.sha256]));
  rfile(root,'pilot-source.json',{
    schemaVersion:1,revision:p.revision,manuscriptHashes:hashes,
    reviewer:{kind:'independent_agent',runId:'pilot-editor'},
    decision:'pass_candidate',summary:'测试报告，用于 Pilot 状态机校验。',
    issues:[],strengths:['有烟火气','人物有选择','冲突推动关系']
  });
  const submitted=spawnSync(process.execPath,[script('submit_pilot_review'),root,'pilot-source.json','--json'],{encoding:'utf8'});
  assert.equal(submitted.status,0,submitted.stdout);
  const pg=read(root).v3.pilotGate;
  rfile(root,'pilot-approval.json',{
    schemaVersion:1,approved:true,revision:pg.revision,
    reviewSha256:pg.reviewSha256,
    quote:'我明确批准这三个试读章节继续写第四章。',source:'fixture-not-real-author',
    approvedAt:'2026-11-24T01:00:00Z'
  });
  const approved=spawnSync(process.execPath,[script('record_pilot_approval'),root,
    '--evidence','pilot-approval.json','--json'],{encoding:'utf8'});
  assert.equal(approved.status,0,approved.stdout);
  const allow=g(4);
  assert.equal(allow.status,0,allow.stdout);
});

test('restoring exact approved core and volume bytes restores gate without forging a new approval',t=>{
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,2);
  assert.equal(run(root,'verify','--chapter','1').code,0);
  fs.writeFileSync(path.join(root,'00-人物档案.md'),character.replace('先小利后天下','先天下后小利'));
  assert.ok(run(root,'verify','--chapter','1').data.issues.includes('CORE_PLAN_CHANGED'));
  fs.writeFileSync(path.join(root,'00-人物档案.md'),character);
  assert.equal(run(root,'verify','--chapter','1').code,0);
  const changedVolume=outline.replace('卷一：灵米经营。','卷一：开设丹坊。');
  assert.notEqual(changedVolume,outline);
  fs.writeFileSync(path.join(root,'01-大纲.md'),changedVolume);
  const changedResult=run(root,'verify','--chapter','1');
  assert.ok(changedResult.data.issues.includes('VOLUME_CHECKPOINT_CHANGED'),JSON.stringify(changedResult.data));
  fs.writeFileSync(path.join(root,'01-大纲.md'),outline);
  assert.equal(run(root,'verify','--chapter','1').code,0);
});


test('core review verdict is order-independent: one revise and one pass always remains revise',t=>{
  for(const order of [['architecture','reader'],['reader','architecture']]){
    const root=fixture(t);
    const prepared=run(root,'core-prepare','--planner-run-id','writer1','--planner-context-id','writer-context');
    assert.equal(prepared.code,0);
    const packet=JSON.parse(fs.readFileSync(path.join(root,prepared.data.inputPath),'utf8'));
    for(const role of order){
      const decision=role==='architecture'?'revise':'pass_candidate';
      const source=report(role,packet,decision);
      if(decision==='revise')source.issues=[{
        id:'ARCH-01',severity:'MAJOR',status:'open',artifact:'01-core.md',
        quote:'核心能力不能读心。',reason:'测试：信息来源仍需核对。',
        suggestion:'明确不读心场景中的推理依据。',
        evidenceLevel:'causal_break',
        reverseDefense:'不能预先假定缺陷成立，须依据已有原文辨别合理留白。'
      }];
      const file='independent-'+role+'.json';
      rfile(root,file,source);
      const registered=run(root,'core-submit','--role',role,'--report',file);
      assert.equal(registered.code,0,JSON.stringify(registered.data));
    }
    const state=read(root).v3.r3.corePlan;
    assert.equal(state.status,'revise',order.join(' -> '));
    assert.equal(state.reviews.architecture.decision,'revise');
    assert.equal(state.reviews.reader.decision,'pass_candidate');
    const approval=run(root,'core-approve','--evidence','not-submitted.json');
    assert.equal(approval.code,2);
    assert.equal(approval.data.error,'R3_CORE_REVIEWS_NOT_PASSED');
  }
});

const cli=(name,root,...args)=>spawnSync(process.execPath,[script(name),root,...args,'--json'],{encoding:'utf8'});
function prepareCandidate(root){
  const p=cli('prepare_pilot_review',root);
  assert.equal(p.status,0,p.stdout);
  const packet=JSON.parse(p.stdout);
  rfile(root,'pilot-source.json',{
    schemaVersion:1,revision:packet.revision,
    manuscriptHashes:Object.fromEntries(packet.chapters.map(c=>[String(c.chapterNumber),c.sha256])),
    reviewer:{kind:'independent_agent',runId:'pilot-fixture-editor'},
    decision:'pass_candidate',summary:'测试候选，不代表真实文学审核。',issues:[],
    strengths:['人物有选择','前后呼应','可继续读']
  });
}
function writePilotApproval(root){
  const pg=read(root).v3.pilotGate;
  rfile(root,'pilot-approval.json',{schemaVersion:1,approved:true,revision:pg.revision,
    reviewSha256:pg.reviewSha256,quote:'测试确认，非真实作者批准。',source:'fixture-not-real-author',
    approvedAt:'2026-11-24T01:00:00Z'});
}
function denyPilot(root,name,args,pattern){
  const before=fs.readFileSync(path.join(root,'02-写作计划.json'));
  const x=cli(name,root,...args);
  assert.equal(x.status,2,x.stdout);
  assert.match(JSON.parse(x.stdout).error,pattern);
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),before);
}
test('P0-F01: completed chapter with real revise report cannot prepare or restart Pilot',t=>{
  const root=readyPilot(t,'revise');
  assert.equal(read(root).v3.r2.chapterReviews['3'].status,'revise');
  for(const args of [[],['--restart']]){
    denyPilot(root,'prepare_pilot_review',args,/R2_REVIEW_NOT_PASSED_ch003/);
  }
  assert.ok(!fs.existsSync(path.join(root,'reviews/pilot-input-v1.json')));
});
test('P0-F01: missing review, stale manuscript, missing input/report or snapshot block Pilot before writes',t=>{
  const root=readyPilot(t);
  const original=read(root),rec=original.v3.r2.chapterReviews['3'];
  const modified=structuredClone(original);delete modified.v3.r2.chapterReviews['3'];save(root,modified);
  denyPilot(root,'prepare_pilot_review',[],/R2_REVIEW_NOT_PASSED_ch003/);save(root,original);
  const incomplete=structuredClone(original);incomplete.chapters[2].wordCountPass=false;save(root,incomplete);
  denyPilot(root,'prepare_pilot_review',[],/R2_PREVIOUS_INCOMPLETE_3/);save(root,original);
  const chapter=path.join(root,'chapters/3.md'),bytes=fs.readFileSync(chapter);
  fs.appendFileSync(chapter,'stale');
  denyPilot(root,'prepare_pilot_review',[],/R2_MANUSCRIPT_CHANGED_ch003/);fs.writeFileSync(chapter,bytes);
  for(const rel of [rec.inputPath,rec.reviewPath]){
    const p=path.join(root,rel),b=fs.readFileSync(p);fs.unlinkSync(p);
    denyPilot(root,'prepare_pilot_review',[],/R2_REVIEW_FILE_MISSING_ch003/);fs.writeFileSync(p,b);
  }
  const snap=path.join(root,rec.r3Snapshot.path,'chapter-0003.md'),b=fs.readFileSync(snap);
  fs.appendFileSync(snap,'tamper');
  denyPilot(root,'prepare_pilot_review',[],/R3_SNAPSHOT_HASH_MISMATCH_ch003/);fs.writeFileSync(snap,b);
  assert.ok(!fs.existsSync(path.join(root,'reviews/pilot-input-v1.json')));
  assert.equal(cli('prepare_pilot_review',root).status,0);
});
test('P0-F01: stale chapter evidence after preparation blocks Pilot report and author registration',t=>{
  const root=readyPilot(t);prepareCandidate(root);
  const original=read(root),modified=structuredClone(original);
  modified.v3.r2.chapterReviews['3'].status='revise';save(root,modified);
  denyPilot(root,'submit_pilot_review',['pilot-source.json'],/R2_REVIEW_NOT_PASSED_ch003/);
  assert.ok(!fs.existsSync(path.join(root,'reviews/pilot-review-v1.json')));
  save(root,original);
  assert.equal(cli('submit_pilot_review',root,'pilot-source.json').status,0);
  writePilotApproval(root);
  const current=read(root),f=path.join(root,current.v3.r2.chapterReviews['1'].inputPath),b=fs.readFileSync(f);
  fs.appendFileSync(f,' ');
  denyPilot(root,'record_pilot_approval',['--evidence','pilot-approval.json'],/R2_REVIEW_CHANGED_ch001/);
  assert.equal(read(root).v3.pilotGate.status,'awaiting_approval');
  fs.writeFileSync(f,b);
  assert.equal(cli('record_pilot_approval',root,'--evidence','pilot-approval.json').status,0);
});
const py=name=>fileURLToPath(new URL('../'+name+'.py',import.meta.url));
const delivery=(...args)=>spawnSync('python3',[py('r3_delivery'),...args],{encoding:'utf8'});
const outdir=t=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'r3-delivery-out-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
function deliveryResult(result){
  assert.equal(result.status,0,result.stdout+' '+result.stderr);
  const data=JSON.parse(result.stdout);assert.equal(data.restorationVerified,true);return data;
}
test('P0-F02: complete ZIP replays awaiting_approval and approved Pilot, includes snapshots, never mutates source',t=>{
  const root=readyPilot(t);prepareCandidate(root);
  assert.equal(cli('submit_pilot_review',root,'pilot-source.json').status,0);
  const out=outdir(t),archive=path.join(out,'candidate.zip');
  const planBefore=fs.readFileSync(path.join(root,'02-写作计划.json'));
  const result=deliveryResult(delivery('create',root,archive,'--upto','3'));
  assert.equal(result.checkpoint.pilotStatus,'awaiting_approval');
  assert.equal(result.checkpoint.gate.status,'blocked');
  assert.ok(result.checkpoint.gate.issues.includes('PILOT_NOT_PASSED'));
  assert.deepEqual(deliveryResult(delivery('verify',archive)).checkpoint,result.checkpoint);
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),planBefore);
  const bytes=fs.readFileSync(archive);
  assert.equal(delivery('create',root,archive,'--upto','3').status,2);
  assert.deepEqual(fs.readFileSync(archive),bytes);
  const unpacked=path.join(out,'restored');
  const restore=spawnSync('python3',[py('restore_snapshot'),archive,unpacked],{encoding:'utf8'});
  assert.equal(restore.status,0,restore.stderr);
  const plan=read(root),ch=plan.v3.r2.chapterReviews['3'],core=plan.v3.r3.corePlan;
  for(const rel of [ch.inputPath,ch.reviewPath,ch.r3Snapshot.path+'/manifest.json',core.inputPath,
    core.snapshotPath+'/manifest.json',plan.v3.pilotGate.reviewInputPath,'story-ledger.json'])
    assert.deepEqual(fs.readFileSync(path.join(unpacked,rel)),fs.readFileSync(path.join(root,rel)));
  writePilotApproval(root);
  assert.equal(cli('record_pilot_approval',root,'--evidence','pilot-approval.json').status,0);
  const passed=deliveryResult(delivery('create',root,path.join(out,'approved.zip'),'--upto','3'));
  assert.equal(passed.checkpoint.pilotStatus,'passed');
  assert.equal(passed.checkpoint.gate.status,'allowed');
});
test('P0-F02: missing review evidence, tampered snapshot and generic backup cannot masquerade as complete delivery',t=>{
  const root=readyPilot(t);prepareCandidate(root);
  assert.equal(cli('submit_pilot_review',root,'pilot-source.json').status,0);
  const out=outdir(t),archive=path.join(out,'candidate.zip'),plan=read(root),rec=plan.v3.r2.chapterReviews['3'];
  for(const rel of [rec.inputPath,rec.r3Snapshot.path+'/manifest.json',plan.v3.pilotGate.reviewInputPath,'story-ledger.json']){
    const p=path.join(root,rel),bytes=fs.readFileSync(p);fs.unlinkSync(p);
    const bad=delivery('create',root,archive,'--upto','3');assert.equal(bad.status,2,bad.stdout);
    assert.ok(!fs.existsSync(archive));fs.writeFileSync(p,bytes);
  }
  const snap=path.join(root,rec.r3Snapshot.path,'chapter-0003.md'),old=fs.readFileSync(snap);
  fs.appendFileSync(snap,'tamper');
  assert.equal(delivery('create',root,archive,'--upto','3').status,2);assert.ok(!fs.existsSync(archive));
  fs.writeFileSync(snap,old);
  deliveryResult(delivery('create',root,archive,'--upto','3'));
  const generic=path.join(out,'generic.zip');
  assert.equal(spawnSync('python3',[py('create_snapshot'),root,generic],{encoding:'utf8'}).status,0);
  assert.match(delivery('verify',generic).stdout,/generic backup\/review-only ZIP/);
  // A self-consistent hash manifest that omits a required file must still fail replay.
  const incomplete=path.join(out,'incomplete.zip');
  const rewrite=spawnSync('python3',['-c',
    'import json,sys,zipfile; src,dst,omit=sys.argv[1:]; a=zipfile.ZipFile(src); m=json.loads(a.read("manifest.json")); m["files"]=[x for x in m["files"] if x["path"]!=omit]; b=zipfile.ZipFile(dst,"x"); [b.writestr(n,a.read(n)) for n in a.namelist() if n not in ("manifest.json",omit)]; b.writestr("manifest.json",json.dumps(m)); b.close(); a.close()',
    archive,incomplete,rec.inputPath],{encoding:'utf8'});
  assert.equal(rewrite.status,0,rewrite.stderr);
  assert.equal(spawnSync('python3',[py('verify_snapshot'),incomplete],{encoding:'utf8'}).status,0);
  const invalid=delivery('verify',incomplete);
  assert.equal(invalid.status,2,invalid.stdout);
  assert.match(invalid.stdout,/R2_REVIEW_FILE_MISSING_ch003/);
});

const p1run=(root,...args)=>spawnSync(process.execPath,[script('r3_p1'),root,...args],{encoding:'utf8'});
const jsonOk=r=>{assert.equal(r.status,0,r.stdout+' '+r.stderr);return JSON.parse(r.stdout)};
const jsonBad=(r,pattern)=>{assert.notEqual(r.status,0,r.stdout);assert.match(r.stdout,pattern)};
const ledgerRead=root=>JSON.parse(fs.readFileSync(path.join(root,'story-ledger.json'),'utf8'));
const ledgerSave=(root,l)=>rfile(root,'story-ledger.json',l);
const chapterQuote=n=>'第'+n+'章正式文本';
function basicLedger(n){
  const nums=Array.from({length:n},(_,i)=>i+1);
  return {schemaVersion:1,facts:[],foreshadowing:[],relationships:[],
    mechanisms:nums.map(chapter=>({id:'M'+chapter,chapter,goal:'经营'+chapter,strategy:'谈判',
      opposition:'缺钱',cost:'承担风险',outcome:'完成交易'})),
    handoffs:nums.map(chapter=>({chapter,asOf:'D+'+chapter,events:[{when:'D+'+chapter,event:'完成交易'}],knowledge:[]}))};
}
function bindChapter(root,n){
  const i=jsonOk(p1run(root,'inspect','--chapter',String(n)));
  const {rows,literaryStatus,...base}=i;
  const anchors=Object.fromEntries(rows.map(r=>[r.id,n===0?'核心能力不能读心。':chapterQuote(n)]));
  rfile(root,'binding.json',{schemaVersion:1,...base,checkedBy:{runId:'fixture-binder',contextId:'fixture-bind-ctx'},
    reviewNote:'测试：逐条回查原文，非真实文学判断。',anchors});
  return jsonOk(p1run(root,'bind','--evidence','binding.json'));
}
const fact=(id,chapter,value,extra={})=>({id,chapter,kind:'established',subject:'灵米',key:'归属',scope:'global',
  value,evidence:'原文',...extra});
const p1meta=(extra={})=>({schemaVersion:1,literaryStatus:'UNVERIFIED',preserveStrengths:[],signals:[],
  followUps:[],revisionProtection:[],...extra});
const strength=(n,id='STR1')=>({id,status:'observed',chapter:n,quote:chapterQuote(n),reason:'有实际代价选择'});
const threeStrengths=()=>[1,2,3].map(n=>strength(n,'STR'+n));
const issue=(n,extra={})=>({id:'ISS-'+n,severity:'MINOR',status:'open',chapter:n,quote:chapterQuote(n),
  reason:'局部措辞不顺',suggestion:'完本定向复核',classification:'C',evidenceLevel:'narrative_risk',
  disposition:'defer_to_final',subject:'灵米',key:'归属',factId:null,...extra});
function p1New(t,end=4){
  const root=fixture(t);approvedCore(root);approvedVolume(root,1,1,end);
  ledgerSave(root,basicLedger(0));
  jsonOk(p1run(root,'activate','--project-id','test-book'));
  fs.mkdirSync(path.join(root,'chapters'));
  return root;
}
function p1Chapter(root,n){
  const plan=read(root);plan.chapters[n-1].status='completed';plan.chapters[n-1].wordCountPass=true;
  save(root,plan);
  const p=path.join(root,'chapters',n+'.md');
  if(!fs.existsSync(p))fs.writeFileSync(p,chapterQuote(n)+'：掌柜作出有代价的经营选择。\n');
  const l=ledgerRead(root),base=basicLedger(n);
  if(!l.handoffs.some(x=>x.chapter===n)){
    l.handoffs.push(base.handoffs[n-1]);l.mechanisms.push(base.mechanisms[n-1]);ledgerSave(root,l);
  }
  const prepared=jsonOk(cli('r2_review',root,'prepare','--scope','chapter','--end',String(n),
    '--writer-run-id','writer-'+n,'--writer-context-id','writerctx-'+n));
  const pkt=JSON.parse(fs.readFileSync(path.join(root,prepared.inputPath),'utf8'));
  assert.equal(pkt.p1Protocol,1);
  return {schemaVersion:1,kind:'chapter',end:n,revision:pkt.revision,manuscriptHashes:pkt.manuscriptHashes,
    reviewer:{kind:'independent_agent',runId:'editor-'+n+'-'+pkt.revision,contextId:'editorctx-'+n+'-'+pkt.revision},
    decision:'pass_candidate',summary:'测试审稿',issues:[],p1:p1meta()};
}
function p1Submit(root,r){
  rfile(root,'p1-report.json',r);
  return cli('r2_review',root,'submit','--scope',r.kind,'--end',String(r.end),'--report','p1-report.json');
}
const p1gate=(root,n)=>cli('v3_gate',root,'--chapter',String(n));
test('P1 migration preserves actual Pilot candidate; binds existing sources and rejects stale ledger without requiring synopsis',t=>{
  const root=readyPilot(t);prepareCandidate(root);
  const source=JSON.parse(fs.readFileSync(path.join(root,'pilot-source.json'),'utf8'));
  source.issues=[{id:'P-legacy',severity:'MINOR',status:'open',chapter:3,quote:chapterQuote(3),
    reason:'测试局部瑕疵',suggestion:'完本回看'}];rfile(root,'pilot-source.json',source);
  jsonOk(cli('submit_pilot_review',root,'pilot-source.json'));
  const old=read(root),l=basicLedger(3);
  l.facts=[{...fact('CORE',0,'不能读心'),subject:'能力',key:'边界'},
    fact('F1',1,'甲',{supersededBy:'F2'}),fact('F2',2,'乙')];
  l.foreshadowing=[{id:'P1',chapter:1,description:'伏笔',status:'open',
    progress:[{chapter:3,quote:chapterQuote(3),note:'推进'}]}];
  ledgerSave(root,l);
  const activation=jsonOk(p1run(root,'activate','--project-id','pilot-book'));
  assert.equal(activation.baselineUpto,3);assert.deepEqual(read(root).v3.pilotGate,old.v3.pilotGate);
  const status=p1run(root,'status','--upto','3');assert.equal(status.status,1);
  assert.equal(JSON.parse(status.stdout).legacyCandidates.length,1);
  assert.match(status.stdout,/R3_LEDGER_BINDING_STALE_OR_MISSING/);
  for(let n=0;n<=3;n++)bindChapter(root,n);
  const h=jsonOk(cli('audit_story_state',root,'--upto','3','--handoff'));
  assert.equal(h.recentSources.length,3);assert.equal(h.literaryStatus,'UNVERIFIED');
  assert.deepEqual(h.baseline.facts.map(f=>f.id),['CORE','F2']);
  assert.ok(!fs.existsSync(path.join(root,'99-章节摘要.md')));
  const at1=jsonOk(cli('audit_story_state',root,'--upto','1','--handoff'));
  assert.deepEqual(at1.baseline.facts.map(f=>f.id),['CORE','F1']);
  writePilotApproval(root);jsonOk(cli('record_pilot_approval',root,'--evidence','pilot-approval.json'));
  jsonOk(p1gate(root,4));
  const good=ledgerRead(root),bad=structuredClone(good);bad.facts[2].value='丙';ledgerSave(root,bad);
  jsonBad(p1gate(root,4),/R3_LEDGER_BINDING_STALE_OR_MISSING_2/);
  jsonBad(cli('audit_story_state',root,'--upto','3','--handoff'),/R3_LEDGER_BINDING_STALE_OR_MISSING_2/);
  ledgerSave(root,good);jsonOk(p1gate(root,4));
  const archive=path.join(outdir(t),'p1-pilot.zip');
  assert.equal(deliveryResult(delivery('create',root,archive,'--upto','3')).checkpoint.gate.status,'allowed');
});
test('P1 review refuses hard causal deferral, invented quotations, missing defense and missing protocol; allows C and B in chapter',t=>{
  const root=p1New(t),r=p1Chapter(root,1);
  const b=issue(1,{id:'B1',severity:'MAJOR',classification:'B',disposition:'fix_in_arc',
    subject:'人物',key:'动机',reverseDefense:{chapter:1,quote:chapterQuote(1),reason:'尝试现有解释'}});
  for(const [patch,pattern] of [
    [{...b,classification:'A'},/HARD_CAUSAL_FLOOR|R2_UNRESOLVED_ISSUES/],
    [{...b,evidenceLevel:'causal_break'},/CAUSAL_BREAK_MUST_FIX_NOW/],
    [{...b,reverseDefense:null},/REVERSE_DEFENSE_REQUIRED/],
    [{...b,quote:'不存在的引文'},/EVIDENCE_OR_DISPOSITION/]
  ])jsonBad(p1Submit(root,{...r,issues:[patch]}),pattern);
  jsonBad(p1Submit(root,{...r,decision:'revise',issues:[{...b,classification:'A'}]}),/HARD_CAUSAL_FLOOR/);
  jsonBad(p1Submit(root,{...r,p1:undefined}),/REPORT_FIELDS_INVALID/);
  jsonOk(p1Submit(root,{...r,issues:[b,issue(1)],p1:p1meta({preserveStrengths:[strength(1)]})}));
  bindChapter(root,1);jsonOk(p1gate(root,2));
  const s=jsonOk(p1run(root,'status','--upto','1'));assert.equal(s.deferredIssues.length,2);
  assert.equal(s.dueIssues.length,0);
});
test('P1 Pilot closes due B at arc boundary, deduplicates C, retains real author gate and specific cascade warnings',t=>{
  const root=p1New(t);
  const b=issue(1,{id:'B1',severity:'MAJOR',classification:'B',disposition:'fix_in_arc',
    subject:'人物',key:'动机',reverseDefense:{chapter:1,quote:chapterQuote(1),reason:'现有文字仍不足'}});
  const c=issue(1);
  for(let n=1;n<=3;n++){
    const r=p1Chapter(root,n);
    if(n===1){const l=ledgerRead(root);l.facts.push(fact('F1',1,'甲'));ledgerSave(root,l);c.factId='F1';r.issues=[b,c]}
    r.p1=p1meta({signals:n===1?[{kind:'promise_open',id:'PROMISE',chapter:n,quote:chapterQuote(n),description:'后续经营机会'}]:[]});
    jsonOk(p1Submit(root,r));bindChapter(root,n);
  }
  jsonBad(p1gate(root,4),/R3_P1_ARC_FIX_DUE_/);
  const handoff=jsonOk(cli('audit_story_state',root,'--upto','3','--handoff','--anchor','F1'));
  assert.equal(handoff.cascadeWarnings.length,1);assert.equal(handoff.cascadeWarnings[0].factId,'F1');
  const prepared=jsonOk(cli('prepare_pilot_review',root));
  const hashes=Object.fromEntries(prepared.chapters.map(x=>[String(x.chapterNumber),x.sha256]));
  const r={schemaVersion:1,revision:prepared.revision,manuscriptHashes:hashes,
    reviewer:{kind:'independent_agent',runId:'pilot-editor',contextId:'pilot-context'},
    decision:'pass_candidate',summary:'测试',issues:[{...c,id:'C-pilot'}],
    strengths:['一','二','三'],p1:p1meta({preserveStrengths:threeStrengths()})};
  rfile(root,'p1-pilot.json',r);jsonBad(cli('submit_pilot_review',root,'p1-pilot.json'),/R3_P1_ARC_FIX_DUE_/);
  r.p1.followUps=[{trackingId:issueKey(b),status:'resolved',chapter:3,quote:chapterQuote(3),reason:'本弧已补强'}];
  rfile(root,'p1-pilot.json',r);jsonOk(cli('submit_pilot_review',root,'p1-pilot.json'));
  const status=jsonOk(p1run(root,'status','--upto','3'));
  assert.equal(status.deferredIssues.find(x=>x.trackingId===issueKey(b)).status,'resolved');
  assert.equal(status.deferredIssues.find(x=>x.trackingId===issueKey(c)).references.length,2);
  assert.equal(status.deferredIssues.filter(x=>x.status==='open').length,1);
  jsonBad(p1gate(root,4),/PILOT_NOT_PASSED/);
  writePilotApproval(root);jsonOk(cli('record_pilot_approval',root,'--evidence','pilot-approval.json'));
  jsonOk(p1gate(root,4));
});
test('P1 revision requires explicit preservation review and rebinds manuscript/ledger; prior feedback retained',t=>{
  const root=p1New(t),r=p1Chapter(root,1);
  r.p1.preserveStrengths=[strength(1)];r.issues=[issue(1)];
  jsonOk(p1Submit(root,r));bindChapter(root,1);
  fs.appendFileSync(path.join(root,'chapters/1.md'),'新增测试段落。');
  const next=p1Chapter(root,1);
  jsonBad(p1Submit(root,next),/REVISION_PROTECTION_REQUIRED/);
  next.p1.revisionProtection=[{id:'STR1',status:'preserved',chapter:1,quote:chapterQuote(1),reason:'保留有效选择'}];
  jsonOk(p1Submit(root,next));
  jsonBad(p1gate(root,2),/R3_LEDGER_BINDING_STALE_OR_MISSING_1/);
  bindChapter(root,1);jsonOk(p1gate(root,2));
  assert.equal(jsonOk(p1run(root,'status','--upto','1')).deferredIssues.length,1);
});
test('P1 volume retrospective is source-backed candidate, never auto-edits next volume; soft dormant reminders use last progress',t=>{
  const root=p1New(t,2);
  for(let n=1;n<=2;n++){
    const r=p1Chapter(root,n);r.p1.signals=[{kind:n===1?'promise_open':'promise_progress',
      id:'P1',chapter:n,quote:chapterQuote(n),description:'读者期待'}];
    jsonOk(p1Submit(root,r));bindChapter(root,n);
  }
  const p=jsonOk(p1run(root,'volume','--volume','1'));
  const old=fs.readFileSync(path.join(root,'02-写作计划.json')),oldOutline=fs.readFileSync(path.join(root,'01-大纲.md'));
  assert.equal(p.packet.endChapter,2);
  const candidate={schemaVersion:1,packetSha256:p.packetSha256,reviewer:{runId:'fixture-editor',contextId:'fixture'},
    observations:[{chapter:1,quote:chapterQuote(1),reason:'有代价选择',proposal:'保留'}],
    nextVolumeProposals:[{chapter:2,quote:chapterQuote(2),reason:'期待仍在',proposal:'卷二可继续'}]};
  rfile(root,'volume-candidate.json',candidate);
  const saved=jsonOk(p1run(root,'volume','--volume','1','--candidate','volume-candidate.json'));
  assert.equal(saved.status,'candidate_only');assert.ok(fs.existsSync(path.join(root,saved.snapshotPath,'manifest.json')));
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),old);
  assert.deepEqual(fs.readFileSync(path.join(root,'01-大纲.md')),oldOutline);
  const m=momentum({signals:[{kind:'character_progress',id:'CORE',chapter:1,core:true},
    {kind:'negative',chapter:11},{kind:'negative',chapter:12}]},{foreshadowing:[
    {id:'P',chapter:1,status:'open',progress:[{chapter:9}]}]},12);
  assert.equal(m.consecutiveNegativeChapters,2);
  assert.ok(m.warnings.some(x=>x.code==='CORE_CHARACTER_TRACKING_DORMANT'));
  assert.ok(!m.warnings.some(x=>x.code==='LONG_OPEN_FORESHADOW'));
  assert.equal(cascadeWarnings({deferredIssues:[{status:'open',subject:'灵米',key:'归属'}]},[{subject:'灵米',key:'重量'}]).length,0);
});
test('P1 deterministic checks use explicit same-unit quantities and day/minute fields, not prose claims',t=>{
  const root=p1New(t),r=p1Chapter(root,1);jsonOk(p1Submit(root,r));
  const l=ledgerRead(root);
  l.r3Checks=[{id:'Q1',chapter:1,kind:'quantity_balance',impact:'hard',quote:chapterQuote(1),
    unit:'铜钱',opening:10,deltas:[-3],closing:8},
    {id:'T1',chapter:1,kind:'chronology',impact:'advisory',quote:chapterQuote(1),
      earlier:{day:2,minuteOfDay:1},later:{day:1,minuteOfDay:1439},relation:'before'}];
  ledgerSave(root,l);bindChapter(root,1);
  jsonBad(p1gate(root,2),/R3_STRUCTURED_QUANTITY_BALANCE_MISMATCH_Q1/);
  l.r3Checks[0].closing=7;ledgerSave(root,l);bindChapter(root,1);jsonOk(p1gate(root,2));
  assert.equal(structuredChecks(l,1).length,1);
  const audit=jsonOk(cli('audit_story_state',root,'--upto','1'));
  assert.ok(audit.issues.some(i=>i.code==='R3_STRUCTURED_CHRONOLOGY_MISMATCH'));
});
