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
  const report={schemaVersion:1,revision:1,reviewer:{kind:'independent_agent',runId:'real-run-001'},
    manuscriptHashes:hashes,decision:'pass_candidate',summary:'开篇可进入继续写作候选。',
    strengths:['角色身份清晰'],issues:[]};
  fs.writeFileSync(path.join(root,'review-source.json'),JSON.stringify(report));
  assert.equal(run('submit_pilot_review','review-source.json').code,0,'accepts structured independent review');
  assert.equal(run('v3_gate','--chapter','4').code,1,'still blocked before user approval');
  const gate=plan().v3.pilotGate;
  const evidence={schemaVersion:1,approved:true,revision:1,reviewSha256:gate.reviewSha256,
    quote:'同意以上三章作为定稿并开始第4章',source:'user_chat_message',approvedAt:'2026-11-23T12:00:00Z'};
  fs.writeFileSync(path.join(root,'user-confirmation.json'),JSON.stringify(evidence));
  assert.equal(run('record_pilot_approval','--evidence','user-confirmation.json').code,0);
  assert.equal(run('v3_gate','--chapter','4').code,0,'allows with matching evidence and review');
  fs.appendFileSync(path.join(root,'chapter-2.md'),'改后');
  assert.ok(run('v3_gate','--chapter','4').out.issues.some(x=>x.code==='STALE_REVIEW'));
  fs.writeFileSync(path.join(root,'chapter-2.md'),'第2章\n正文');
  fs.appendFileSync(path.join(root,'reviews/pilot-review-v1.json'),' ');
  assert.ok(run('v3_gate','--chapter','4').out.issues.some(x=>x.code==='REVIEW_CHANGED'));
  console.log('PASS integrated V3 pilot gate: 11 assertions');
}finally{fs.rmSync(root,{recursive:true,force:true});}
