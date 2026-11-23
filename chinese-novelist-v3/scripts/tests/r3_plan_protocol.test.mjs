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


test('full R3 Pilot path requires genuine-shaped chapter reviews, independent Pilot and author evidence',t=>{
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
      decision:'pass_candidate',summary:'测试报告占位，不代表真实文学审核。',issues:[]
    });
    const submitted=spawnSync(process.execPath,[script('r2_review'),root,'submit',
      '--scope','chapter','--end',String(n),
      '--report','chapter-review-'+n+'.json'],{encoding:'utf8'});
    assert.equal(submitted.status,0,submitted.stdout);
  }
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
  fs.writeFileSync(path.join(root,'01-大纲.md'),outline.replace('开办灵米坊','放弃灵米坊'));
  assert.ok(run(root,'verify','--chapter','1').data.issues.includes('VOLUME_CHECKPOINT_CHANGED'));
  fs.writeFileSync(path.join(root,'01-大纲.md'),outline);
  assert.equal(run(root,'verify','--chapter','1').code,0);
});
