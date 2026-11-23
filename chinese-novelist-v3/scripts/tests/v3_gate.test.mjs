#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const checker=fileURLToPath(new URL('../v3_gate.mjs', import.meta.url));
const base=fs.mkdtempSync(path.join(os.tmpdir(),'v3-gate-test-'));
try{
  const chapters=[];const hashes={};
  for(let n=1;n<=3;n++){
    const file='chapter-'+n+'.md', data='第'+n+'章\n故事正文'+n+'\n';
    fs.writeFileSync(path.join(base,file),data);
    hashes[String(n)]=crypto.createHash('sha256').update(data).digest('hex');
    chapters.push({chapterNumber:n,filePath:file,status:'completed',wordCountPass:true});
  }
  const plan={chapters,v3:{schemaVersion:1,creativeDecision:'accepted',storyPlanApproved:true,pilotGate:{status:'under_review',reviewDecision:null,humanApproved:false,approvedAt:null,reviewPath:null,reviewedChapterHashes:{}}}};
  fs.writeFileSync(path.join(base,'02-写作计划.json'),JSON.stringify(plan));
  const check=(num)=>{const res=spawnSync(process.execPath,[checker,base,'--chapter',String(num),'--json'],{encoding:'utf8'});return {code:res.status,report:JSON.parse(res.stdout)};};
  assert.equal(check(1).code,0,'前三章可试写');
  assert.equal(check(4).code,1,'审核前阻止第四章');
  fs.writeFileSync(path.join(base,'reviews.md'),'独立编辑审稿报告：没有阻断缺陷。');
  plan.v3.pilotGate={status:'passed',reviewDecision:'pass_candidate',humanApproved:true,approvedAt:'2026-11-23T10:00:00Z',reviewPath:'reviews.md',reviewedChapterHashes:hashes};
  fs.writeFileSync(path.join(base,'02-写作计划.json'),JSON.stringify(plan));
  assert.equal(check(4).code,0,'用户批准、审稿哈希一致后通过');
  fs.appendFileSync(path.join(base,'chapter-2.md'),'改稿后不同');
  assert.ok(check(4).report.issues.some(x=>x.code==='STALE_REVIEW'),'正文更改触发过期');
  plan.v3.pilotGate.reviewPath='../escape.md';
  fs.writeFileSync(path.join(base,'02-写作计划.json'),JSON.stringify(plan));
  assert.ok(check(4).report.issues.some(x=>x.code==='REVIEW_MISSING'),'阻止越界审稿路径');
  plan.v3.pilotGate.humanApproved=false;
  fs.writeFileSync(path.join(base,'02-写作计划.json'),JSON.stringify(plan));
  assert.ok(check(4).report.issues.some(x=>x.code==='NO_HUMAN_APPROVAL'),'未获批准必须阻断');
  console.log('PASS v3_gate: 6 assertions');
} finally { fs.rmSync(base,{recursive:true,force:true}); }
