#!/usr/bin/env node
/** Read-only validation of a fully reviewed R3 checkpoint, including a legitimate Pilot stop. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectRoot,readPlan,readJsonFile,safeFile,sha256,pilotHashes,sameHashes,structuredReportValid} from './v3_common.mjs';
import {hasR3Namespace,validR3Namespace} from './r3_state_common.mjs';
import {verifyR3Plan} from './r3_plan_common.mjs';
import {checkGate} from './r2_review_common.mjs';

const fail=message=>{throw new Error(message);};
function check(root,upto){
  const plan=readPlan(root);
  if(!hasR3Namespace(plan)||!validR3Namespace(plan.v3.r3)||plan.v3.schemaVersion!==1||
     plan.v3.creativeDecision!=='accepted'||plan.v3.r3.reviewPolicy!=='every_chapter')
    fail('R3_DELIVERY_STATE_INVALID');
  if(!Number.isSafeInteger(upto)||upto<1||upto>plan.chapters.length||
     plan.chapters.some(c=>c.chapterNumber>upto&&c.status==='completed'))
    fail('R3_DELIVERY_CHECKPOINT_INVALID');
  const planning=verifyR3Plan(root,plan,upto);
  if(planning.length)fail('R3_DELIVERY_PLAN_INVALID: '+planning.join(','));
  const reviews=checkGate(root,plan,upto+1);
  if(reviews.length)fail('R3_DELIVERY_REVIEWS_INVALID: '+reviews.join(','));
  // The ledger is part of the portable project, not a substitute for source text.
  const ledger=readJsonFile(root,'story-ledger.json');
  if(!ledger||typeof ledger!=='object'||Array.isArray(ledger))fail('R3_DELIVERY_LEDGER_INVALID');
  const pilot=plan.v3.pilotGate;
  if(!pilot||!['pending','under_review','awaiting_approval','revise','passed'].includes(pilot.status))
    fail('R3_DELIVERY_PILOT_STATE_INVALID');
  if((upto<3&&pilot.status!=='pending')||(upto>3&&pilot.status!=='passed'))
    fail('R3_DELIVERY_PILOT_STATE_INVALID');
  if(pilot.status!=='pending'){
    const hashes=pilotHashes(root,plan),packet=readJsonFile(root,pilot.reviewInputPath);
    if(!Number.isSafeInteger(pilot.revision)||pilot.revision<1||packet.schemaVersion!==1||
       packet.revision!==pilot.revision||!Array.isArray(packet.chapters)||packet.chapters.length!==3||
       !sameHashes(pilot.reviewedChapterHashes,hashes)||
       ![1,2,3].every(n=>packet.chapters.some(c=>c.chapterNumber===n&&
          c.filePath===plan.chapters.find(p=>p.chapterNumber===n).filePath&&c.sha256===hashes[String(n)])))
      fail('R3_DELIVERY_PILOT_INPUT_INVALID');
    if(pilot.status!=='under_review'){
      const file=safeFile(root,pilot.reviewPath);
      if(!file)fail('R3_DELIVERY_PILOT_REPORT_MISSING');
      const bytes=fs.readFileSync(file),report=JSON.parse(bytes);
      if(sha256(bytes)!==pilot.reviewSha256||structuredReportValid(report,pilot.revision,hashes).length||
         report.decision!==pilot.reviewDecision||
         (pilot.status==='revise'?report.decision==='pass_candidate':report.decision!=='pass_candidate'))
        fail('R3_DELIVERY_PILOT_REPORT_INVALID');
    }
  }
  const finalize=upto===plan.chapters.length;
  const proc=spawnSync(process.execPath,[fileURLToPath(new URL('./v3_gate.mjs',import.meta.url)),root,
    finalize?'--finalize':'--chapter',String(finalize?upto:upto+1),'--json'],{encoding:'utf8'});
  if(![0,1].includes(proc.status))fail('R3_DELIVERY_GATE_ERROR: '+(proc.stderr||proc.stdout||proc.error));
  const gate=JSON.parse(proc.stdout);
  if(gate.status!==(proc.status===0?'allowed':'blocked')||!Array.isArray(gate.issues))
    fail('R3_DELIVERY_GATE_INVALID');
  const expected=new Set();
  if(!finalize)expected.add('R3_VOLUME_NOT_APPROVED_FOR_CHAPTER_'+(upto+1));
  if(upto===3&&pilot.status!=='passed'){
    for(const code of ['PILOT_NOT_PASSED','NO_HUMAN_APPROVAL','APPROVAL_RECORD_MISSING'])expected.add(code);
    if(['pending','under_review','revise'].includes(pilot.status))expected.add('NO_POSITIVE_REVIEW');
    if(['pending','under_review'].includes(pilot.status))expected.add('REVIEW_MISSING');
    if(pilot.status==='pending')expected.add('STALE_REVIEW');
    if(pilot.status==='revise')expected.add('REVIEW_REJECTED');
  }
  const unexpected=gate.issues.filter(i=>!expected.has(i.code));
  if(unexpected.length)fail('R3_DELIVERY_UNEXPECTED_GATE_ISSUES: '+unexpected.map(i=>i.code).join(','));
  return {schemaVersion:1,upto,pilotStatus:pilot.status,gate:{mode:finalize?'finalize':'chapter',
    chapter:finalize?upto:upto+1,status:gate.status,issues:gate.issues.map(i=>i.code)}};
}
try{
  const [folder,flag,value,...rest]=process.argv.slice(2);
  if(!folder||flag!=='--upto'||!/^\d+$/.test(value||'')||rest.length)
    fail('Usage: r3_delivery_check.mjs <project> --upto N');
  console.log(JSON.stringify(check(projectRoot(folder),Number(value))));
}catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
