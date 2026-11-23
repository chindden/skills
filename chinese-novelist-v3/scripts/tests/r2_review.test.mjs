#!/usr/bin/env node
/** R2 execution-state tests. Fixture IDs simulate separate agents, not actual isolation. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkGate} from '../r2_review_common.mjs';
const resolve=n=>fileURLToPath(new URL('../'+n+'.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'novelist-r2-'));
const planPath=path.join(root,'02-写作计划.json');
const run=(name,...args)=>{
  const r=spawnSync(process.execPath,[resolve(name),root,...args,'--json'],{encoding:'utf8'});
  if(!r.stdout.trim())throw new Error(name+': '+r.stderr);
  return {code:r.status,out:JSON.parse(r.stdout)};
};
const plan=()=>JSON.parse(fs.readFileSync(planPath,'utf8'));
const save=p=>fs.writeFileSync(planPath,JSON.stringify(p,null,2));
const prepare=(scope,end)=>run('r2_review','prepare','--scope',scope,'--end',String(end),
  ...(scope==='chapter'?['--writer-run-id','writer-run-'+end,'--writer-context-id','writer-context-'+end]:[]));
const submit=(scope,end,decision='pass_candidate',issues=[],reviewerRun='editor-run-'+end)=>
  submitReview(scope,end,decision,issues,reviewerRun);
const submitReview=(scope,end,decision,issues,reviewerRun)=>{
  const r=plan().v3.r2[scope==='chapter'?'chapterReviews':'arcReviews'][String(end)];
  const packet=JSON.parse(fs.readFileSync(path.join(root,r.inputPath),'utf8'));
  const report={schemaVersion:1,kind:scope,end,revision:r.revision,
    manuscriptHashes:packet.manuscriptHashes,
    reviewer:{kind:'independent_agent',runId:reviewerRun,contextId:reviewerRun+'-context'},
    decision,summary:'Fixture independent review; actual host isolation not asserted',issues};
  const src='source-'+scope+'-'+end+'.json';
  fs.writeFileSync(path.join(root,src),JSON.stringify(report,null,2));
  return run('r2_review','submit','--scope',scope,'--end',String(end),'--report',src);
};
try{
  save({chapters:Array.from({length:6},(_,i)=>({
    chapterNumber:i+1,filePath:'chapter'+(i+1)+'.md',status:i===0?'completed':'pending',wordCountPass:true
  }))});
  for(let n=1;n<=6;n++)fs.writeFileSync(path.join(root,'chapter'+n+'.md'),'第'+n+'章。这是章节正文。');
  assert.equal(run('init_v3_state').code,0);
  let p=plan();p.v3.creativeDecision='accepted';p.v3.storyPlanApproved=true;save(p);
  assert.equal(run('v3_gate','--chapter','1').code,0);
  assert.ok(run('v3_gate','--chapter','2').out.issues.some(i=>i.code==='R2_REVIEW_NOT_PASSED_ch001'));
  const first=prepare('chapter',1);
  assert.equal(first.code,0);
  assert.equal(submit('chapter',1,'pass_candidate',[],'writer-run-1').code,2,'author cannot approve own draft');
  const issue={id:'X',severity:'BLOCKER',status:'open',chapter:1,
    quote:'这是章节正文',reason:'fixture unresolved blocker',suggestion:'fix locally'};
  assert.equal(submit('chapter',1,'pass_candidate',[issue]).code,2);
  assert.equal(submit('chapter',1).code,0);
  assert.equal(run('v3_gate','--chapter','2').code,0,'chapter 1 reviewed; chapter 2 can begin');
  assert.equal(run('v3_gate','--chapter','3').code,1,'chapter 2 cannot be skipped');
  for(let n=2;n<=6;n++){
    p=plan();p.chapters[n-1].status='completed';save(p);
    assert.equal(prepare('chapter',n).code,0);
    assert.equal(submit('chapter',n).code,0);
  }
  assert.deepEqual(checkGate(root,plan(),7),['R2_REVIEW_NOT_PASSED_arc006']);
  assert.equal(prepare('arc',6).code,0);
  assert.equal(submit('arc',6).code,0);
  assert.deepEqual(checkGate(root,plan(),7),[]);
  assert.equal(run('v3_gate','--finalize','6').out.issues.some(i=>i.code.startsWith('R2_')),false,
    'six chapter R2 reviews and arc review passed; legacy pilot still blocks without owner approval');
  const review=path.join(root,plan().v3.r2.chapterReviews['3'].reviewPath);
  fs.appendFileSync(review,' ');
  assert.ok(checkGate(root,plan(),7).some(e=>e.includes('REVIEW_CHANGED_ch003')));
  fs.writeFileSync(review,fs.readFileSync(review,'utf8').trimEnd());
  fs.appendFileSync(path.join(root,'chapter5.md'),'修订');
  assert.ok(checkGate(root,plan(),7).some(e=>e.includes('MANUSCRIPT_CHANGED_ch005')));
  assert.equal(prepare('chapter',5).code,0,'re-review modified manuscript');
  assert.equal(submit('chapter',5).code,0);
  assert.equal(prepare('arc',6).code,0,'arc is stale after chapter 5 changes');
  assert.equal(submit('arc',6).code,0);
  assert.deepEqual(checkGate(root,plan(),7),[]);
  assert.equal(run('v3_gate','--finalize','5').out.issues.some(i=>i.code==='R2_FINALIZE_NOT_LAST_CHAPTER'),true);
  console.log('PASS R2 reviews: isolation IDs, no-skips, blockers, stale hashes, arc, finalization');
}finally{fs.rmSync(root,{recursive:true,force:true});}
