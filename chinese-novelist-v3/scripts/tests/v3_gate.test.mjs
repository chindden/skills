#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const resolve=(name)=>fileURLToPath(new URL('../'+name+'.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-gate-integration-'));
const planFile=path.join(root,'02-写作计划.json');
const run=(name,...args)=>{const res=spawnSync(process.execPath,[resolve(name),root,...args,'--json'],{encoding:'utf8'});
  return {code:res.status,out:JSON.parse(res.stdout)};};
const plan=()=>JSON.parse(fs.readFileSync(planFile,'utf8'));
const save=p=>fs.writeFileSync(planFile,JSON.stringify(p,null,2));
try{
  const chapters=[];
  for(let n=1;n<=3;n++){const file='chapter-'+n+'.md';fs.writeFileSync(path.join(root,file),'第'+n+'章\n正文');chapters.push({chapterNumber:n,filePath:file,status:'completed',wordCountPass:true});}
  save({chapters,v3:{schemaVersion:1,creativeDecision:'accepted',storyPlanApproved:true,
    pilotGate:{status:'pending',revision:0,humanApproved:false}}});
  assert.equal(run('v3_gate','--chapter','1').code,0,'first three can be drafted');
  assert.equal(run('v3_gate','--chapter','4').code,1,'blocks fourth chapter before review');
  assert.equal(run('prepare_pilot_review').code,0,'creates independent review packet');
  assert.equal(run('prepare_pilot_review').code,2,'cannot silently restart review');
  assert.equal(run('v3_gate','--chapter','4').code,1);
  const hashes=plan().v3.pilotGate.reviewedChapterHashes;
  const reviewer={kind:'independent_agent',runId:'test-fixture-revision-1'};
  const defect={id:'TEST-1',severity:'MAJOR',status:'open',chapter:1,quote:'正文',reason:'测试：正文缺少行动后果',suggestion:'补上后果'};
  const rejected={schemaVersion:1,revision:1,reviewer,manuscriptHashes:hashes,
    decision:'revise',summary:'测试夹具：需要返工。',strengths:[],issues:[defect]};
  fs.writeFileSync(path.join(root,'review-source.json'),JSON.stringify({...rejected,decision:'pass_candidate'}));
  assert.match(run('submit_pilot_review','review-source.json').out.error,/UNRESOLVED_MAJOR_ISSUES/);
  fs.writeFileSync(path.join(root,'review-source.json'),JSON.stringify(rejected));
  assert.equal(run('submit_pilot_review','review-source.json').out.status,'revise');
  assert.ok(run('v3_gate','--chapter','4').out.issues.some(x=>x.code==='REVIEW_REJECTED'));
  fs.appendFileSync(path.join(root,'chapter-1.md'),'\n测试返工');
  assert.equal(run('prepare_pilot_review').out.revision,2);
  assert.match(run('submit_pilot_review','review-source.json').out.error,/REVIEW_REVISION_MISMATCH/);
  const report={schemaVersion:1,revision:2,reviewer:{...reviewer,runId:'test-fixture-revision-2'},
    manuscriptHashes:plan().v3.pilotGate.reviewedChapterHashes,decision:'pass_candidate',summary:'测试夹具：允许进入继续写作候选。',
    strengths:['角色身份清晰'],issues:[]};
  fs.writeFileSync(path.join(root,'review-source.json'),JSON.stringify(report));
  assert.equal(run('submit_pilot_review','review-source.json').code,0,'accepts structured independent review');
  assert.equal(run('v3_gate','--chapter','4').code,1,'still blocked before user approval');
  const gate=plan().v3.pilotGate;
  const evidence={schemaVersion:1,approved:true,revision:2,reviewSha256:gate.reviewSha256,
    quote:'测试夹具模拟批准，非真实用户批准。',source:'test_fixture',approvedAt:'2026-11-23T12:00:00Z'};
  fs.writeFileSync(path.join(root,'user-confirmation.json'),JSON.stringify(evidence));
  assert.equal(run('record_pilot_approval','--evidence','user-confirmation.json').code,0);
  assert.equal(run('v3_gate','--chapter','4').code,0,'allows with matching evidence and review');
  fs.appendFileSync(path.join(root,'chapter-2.md'),'改后');
  assert.ok(run('v3_gate','--chapter','4').out.issues.some(x=>x.code==='STALE_REVIEW'));
  fs.writeFileSync(path.join(root,'chapter-2.md'),'第2章\n正文');
  fs.appendFileSync(path.join(root,'reviews/pilot-review-v2.json'),' ');
  assert.ok(run('v3_gate','--chapter','4').out.issues.some(x=>x.code==='REVIEW_CHANGED'));
  console.log('PASS integrated V3 pilot gate: 16 assertions');
}finally{fs.rmSync(root,{recursive:true,force:true});}
