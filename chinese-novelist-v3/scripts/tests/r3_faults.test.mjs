#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSnapshot,verifySnapshot} from '../r3_snapshots.mjs';
import {frozenCoreFiles} from '../r3_plan_common.mjs';
const cli=fileURLToPath(new URL('../r3_plan.mjs',import.meta.url));
const tmp=(t,label='r3-fault-')=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),label));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
};
function project(t){
  const root=tmp(t);
  fs.writeFileSync(path.join(root,'00-人物档案.md'),
    '# 档案\n## 核心人设\n人物以信用与私心组成有代价的联盟。\n## 动态状态与远期弧线\n演化中。\n');
  fs.writeFileSync(path.join(root,'01-大纲.md'),
    '# 大纲\n## 核心契约\n不能读心，终局依靠合法资源与团队合作。\n## 滚动卷纲\n### 第1卷\n开灵米店，偿还债务。\n### 第2卷\n扩张联盟但有新对手。\n');
  fs.writeFileSync(path.join(root,'03-文风基准.md'),
    '# 文风\n## 文风指纹\n不磨平人物缺点与鲜活感。\n## 本书校准段落\n');
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify({
    novelName:'隔离实验',writingMode:'serial',minWordsPerChapter:500,
    chapters:[1,2,3,4].map(i=>({chapterNumber:i,filePath:'chapter/'+i+'.md',title:'第'+i+'章'})),
    v3:{schemaVersion:1,creativeDecision:'accepted',storyPlanApproved:false,
      r3:{schemaVersion:1,mode:'experimental',status:'bootstrap',reviewPolicy:'every_chapter',
        corePlan:{status:'pending'},volumeCheckpoints:{},finalRefinement:{status:'pending'}}}
  },null,2)+'\n');
  return root;
}
const run=(root,...args)=>{
  const out=spawnSync(process.execPath,[cli,root,...args],{encoding:'utf8'});
  assert.ok(out.stdout.trim(),out.stderr);
  return {status:out.status,result:JSON.parse(out.stdout)};
};
const read=root=>JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json'),'utf8'));
test('snapshot rejects traversal and symlink parents outside project',t=>{
  const root=tmp(t),outside=tmp(t,'r3-external-');
  assert.throws(()=>createSnapshot(root,'reviews/r3/../../escape',{'a.md':'x'}),/R3_SNAPSHOT_PATH_INVALID/);
  assert.throws(()=>verifySnapshot(root,'reviews/r3/../core/v1'),/R3_SNAPSHOT_PATH_INVALID/);
  fs.mkdirSync(path.join(root,'reviews'),{recursive:true});
  fs.symlinkSync(outside,path.join(root,'reviews','r3'),'dir');
  assert.throws(()=>createSnapshot(root,'reviews/r3/core/v1',{'a.md':'text'}),/R3_SNAPSHOT_UNSAFE/);
  assert.equal(fs.existsSync(path.join(outside,'core','v1')),false);
});
test('extra or substituted files invalidate an already committed snapshot',t=>{
  const root=tmp(t);
  const snap=createSnapshot(root,'reviews/r3/core/v1',{'00.md':'the original'});
  const dir=path.join(root,snap.path);
  fs.writeFileSync(path.join(dir,'unknown.md'),'extra');
  assert.throws(()=>verifySnapshot(root,snap.path,snap.sha256),/R3_SNAPSHOT_EXTRA_OR_MISSING_FILE/);
  fs.rmSync(path.join(dir,'unknown.md'));
  assert.equal(verifySnapshot(root,snap.path,snap.sha256).files['00.md'],'the original');
  fs.rmSync(path.join(dir,'00.md'));
  const external=path.join(root,'external.txt');fs.writeFileSync(external,'the original');
  fs.symlinkSync(external,path.join(dir,'00.md'));
  assert.throws(()=>verifySnapshot(root,snap.path,snap.sha256),/R3_SNAPSHOT_UNSAFE/);
});
test('simulated crash after snapshot commit can resume exact same snapshot without rewriting',t=>{
  const root=project(t);
  const pre=createSnapshot(root,'reviews/r3/core/v1',frozenCoreFiles(root));
  const run1=run(root,'core-prepare','--planner-run-id','writer','--planner-context-id','context');
  assert.equal(run1.status,0,JSON.stringify(run1.result));
  assert.equal(run1.result.snapshotSha256,pre.sha256);
  const core=read(root).v3.r3.corePlan;
  assert.equal(core.status,'under_review');
  assert.equal(verifySnapshot(root,pre.path,pre.sha256).manifestSha256,pre.sha256);
});
test('a different orphan snapshot blocks prepare rather than being overwritten',t=>{
  const root=project(t);
  createSnapshot(root,'reviews/r3/core/v1',{'poison.md':'different text'});
  const before=fs.readFileSync(path.join(root,'02-写作计划.json'));
  const run1=run(root,'core-prepare','--planner-run-id','writer','--planner-context-id','context');
  assert.equal(run1.status,2);
  assert.equal(run1.result.error,'R3_SNAPSHOT_CONFLICT');
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),before);
});
test('independent review cannot be self-approved or reuse another reviewer context',t=>{
  const root=project(t);
  const init=run(root,'core-prepare','--planner-run-id','writer','--planner-context-id','writer-context');
  assert.equal(init.status,0);
  const packet=JSON.parse(fs.readFileSync(path.join(root,init.result.inputPath),'utf8'));
  const make=(role,context)=>({
    schemaVersion:1,kind:'r3_core',role,revision:packet.revision,snapshotSha256:packet.snapshotSha256,
    reviewer:{kind:'independent_agent',runId:role==='architecture'?'arch':'reader',contextId:context},
    decision:'pass_candidate',summary:'仅用于验证报告隔离，不是正式文学审稿。',
    checks:(role==='architecture'?['world_rules_and_power','character_causality','foreshadowing_and_finale']:
      ['genre_promise','opening_and_rewards','protagonist_agency']).map(id=>({id,status:'pass',evidence:'测试输入，保留原文引用与证据。'})),
    preserveStrengths:role==='reader'?['A','B','C']:undefined,issues:[]
  });
  fs.writeFileSync(path.join(root,'self.json'),JSON.stringify(make('architecture','writer-context')));
  assert.equal(run(root,'core-submit','--role','architecture','--report','self.json').status,2);
  fs.writeFileSync(path.join(root,'arch.json'),JSON.stringify(make('architecture','independent-ctx')));
  assert.equal(run(root,'core-submit','--role','architecture','--report','arch.json').status,0);
  fs.writeFileSync(path.join(root,'reader.json'),JSON.stringify(make('reader','independent-ctx')));
  const x=run(root,'core-submit','--role','reader','--report','reader.json');
  assert.equal(x.status,2);
  assert.equal(x.result.error,'R3_CORE_REPORT_INVALID');
});
test('quote invented by model is rejected even when report claims a pass',t=>{
  const root=project(t),init=run(root,'core-prepare','--planner-run-id','w','--planner-context-id','ctx');
  const packet=JSON.parse(fs.readFileSync(path.join(root,init.result.inputPath),'utf8'));
  const report={schemaVersion:1,kind:'r3_core',role:'architecture',revision:1,
    snapshotSha256:packet.snapshotSha256,reviewer:{kind:'independent_agent',runId:'ed','contextId':'edc'},
    decision:'pass_candidate',summary:'测试。',checks:['world_rules_and_power','character_causality','foreshadowing_and_finale']
      .map(id=>({id,status:'pass',evidence:'细节校核过。'})),
    issues:[{id:'x',severity:'MINOR',status:'resolved',artifact:'01-core.md',quote:'世界最强无敌读心术',
      reason:'这句话并不存在。',suggestion:'保持角色可信。',evidenceLevel:'narrative_risk'}]};
  fs.writeFileSync(path.join(root,'bad-report.json'),JSON.stringify(report));
  assert.equal(run(root,'core-submit','--role','architecture','--report','bad-report.json').status,2);
});
