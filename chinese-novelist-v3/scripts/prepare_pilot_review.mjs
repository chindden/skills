#!/usr/bin/env node
/** Seal chapter hashes and prepare a versioned handoff for independent review. */
import fs from 'node:fs';
import {p1State,priorStrengths} from './r3_p1_common.mjs';
import path from 'node:path';
import {projectRoot,readPlan,atomicWritePlan,pilotHashes,sha256} from './v3_common.mjs';
import {hasR3Namespace} from './r3_state_common.mjs';
import {assertR3PilotPrerequisites} from './r2_review_common.mjs';

const args=process.argv.slice(2),folder=args[0],restart=args.includes('--restart');
try {
  if(!folder || args.slice(1).some(x=>!['--json','--restart'].includes(x)))
    throw new Error('Usage: prepare_pilot_review.mjs <project-dir> [--restart] [--json]');
  const root=projectRoot(folder),plan=readPlan(root);
  if(plan.v3?.schemaVersion!==1||plan.v3.creativeDecision!=='accepted')
    throw new Error('CREATIVE_AND_PLAN_APPROVAL_REQUIRED');
  if(hasR3Namespace(plan)){
    assertR3PilotPrerequisites(root,plan);
  }else if(plan.v3.storyPlanApproved!==true){
    throw new Error('CREATIVE_AND_PLAN_APPROVAL_REQUIRED');
  }
  const gate=plan.v3.pilotGate||{};
  if(['under_review','awaiting_approval','passed'].includes(gate.status)&&!restart)
    throw new Error('REVIEW_ALREADY_IN_PROGRESS_OR_PASSED: use --restart only after deliberate revision');
  const hashes=pilotHashes(root,plan);
  const revision=(Number.isSafeInteger(gate.revision)&&gate.revision>=0?gate.revision:0)+1;
  const reviewRel='reviews/pilot-input-v'+revision+'.json';
  const chapters=plan.chapters.filter(c=>[1,2,3].includes(c.chapterNumber))
    .sort((a,b)=>a.chapterNumber-b.chapterNumber)
    .map(c=>({chapterNumber:c.chapterNumber,filePath:c.filePath,sha256:hashes[String(c.chapterNumber)]}));
  const p1=p1State(plan);
  const packet={schemaVersion:1,revision,createdAt:new Date().toISOString(),chapters,
    ...(p1?{p1Protocol:1,priorStrengths:priorStrengths(root,gate)}:{}),
    note:'Editor must read original chapters and settings independently; self-ratings are excluded.'};
  const reviewFile=path.join(root,reviewRel);
  fs.mkdirSync(path.dirname(reviewFile),{recursive:true});
  const packetBytes=Buffer.from(JSON.stringify(packet,null,2)+'\n');
  fs.writeFileSync(reviewFile,packetBytes,{flag:'wx'});
  plan.v3.pilotGate={
    ...gate,status:'under_review',revision,reviewInputPath:reviewRel,reviewPath:null,reviewSha256:null,
    ...(p1?{reviewInputSha256:sha256(packetBytes)}:{}),
    reviewedChapterHashes:hashes,reviewDecision:null,humanApproved:false,approvedAt:null,approvalPath:null,approvalSha256:null
  };
  atomicWritePlan(root,plan);
  console.log(JSON.stringify({status:'under_review',revision,reviewInput:reviewRel,chapters},null,2));
}catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
