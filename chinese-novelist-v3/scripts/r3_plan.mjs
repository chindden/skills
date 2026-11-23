#!/usr/bin/env node
/**
 * R3 independent plan lifecycle, snapshots, dual-context core review and
 * source-bound author approvals. Does not mutate R2 planGate or R2 projects.
 *
 * Commands:
 *  core-prepare [--planner-run-id ID --planner-context-id ID]
 *  core-submit --role architecture|reader --report RELATIVE
 *  core-approve --evidence RELATIVE
 *  volume-prepare --volume N --start N --end N
 *  volume-approve --volume N --evidence RELATIVE
 *  verify [--chapter N]
 */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot,readPlan,atomicWritePlan,safeFile,sha256} from './v3_common.mjs';
import {inspectR3Plan} from './r3_plan_sections.mjs';
import {createSnapshot,verifySnapshot,snapshotText} from './r3_snapshots.mjs';
import {snapshotDiff} from './r3_diff.mjs';
import {
  coreRoles,validCoreReview,validApproval,readRecordedInput,verifyCore,verifyVolume,verifyR3Plan,
  frozenCoreFiles,volumeFile,chapterSlots
} from './r3_plan_common.mjs';
import {hasR3Namespace,validR3Namespace} from './r3_state_common.mjs';

const fail=x=>{throw new Error(x)};
const args=process.argv.slice(2), dir=args[0],action=args[1];
const option=key=>{const i=args.indexOf(key);return i>=0?args[i+1]:null};
const integer=key=>{const s=option(key);return s!==null&&/^[1-9]\d*$/.test(s)?Number(s):NaN};
const present=x=>typeof x==='string'&&x.trim();
const output=o=>console.log(JSON.stringify(o,null,2));
const writeNew=(root,rel,contents)=>{
  const dst=path.join(root,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.writeFileSync(dst,contents,{flag:'wx'});return sha256(Buffer.from(contents));
};
const readEvidence=(root,relative)=>{
  if(!relative||!relative.endsWith('.json'))fail('R3_EVIDENCE_PATH_INVALID');
  const f=safeFile(root,relative);
  if(!f)fail('R3_EVIDENCE_MISSING');
  return JSON.parse(fs.readFileSync(f,'utf8'));
};
const inputFile=(root,c)=>{
  if(!c?.inputPath||!c.inputSha256)fail('R3_INPUT_NOT_PREPARED');
  return readRecordedInput(root,c.inputPath,c.inputSha256);
};
function checkReviewScope(c,input,root){
  if(c.snapshotSha256!==input.snapshotSha256)fail('R3_SNAPSHOT_RECORD_MISMATCH');
  const frozen=verifySnapshot(root,input.snapshotPath,input.snapshotSha256);
  if(JSON.stringify(Object.keys(frozen.files).sort())===JSON.stringify([]))fail('R3_SNAPSHOT_EMPTY');
  const current=frozenCoreFiles(root);
  if(Object.keys(current).some(k=>frozen.files[k]!==current[k]))fail('CORE_PLAN_CHANGED');
  return frozen;
}
function corePrepare(root,plan){
  const r=plan.v3.r3,previous=r.corePlan||{},revision=(previous.revision||0)+1;
  const current=frozenCoreFiles(root,plan);
  let prior=null;
  if(revision>1){
    const input=inputFile(root,previous);
    if(input.revision!==revision-1)fail('R3_CORE_PREVIOUS_REVISION_MISMATCH');
    prior=verifySnapshot(root,input.snapshotPath,input.snapshotSha256).files;
  }
  const files={...current};
  if(prior)files['diff.md']=snapshotDiff(
    Object.fromEntries(Object.keys(current).map(k=>[k,prior[k]??''])),current);
  const ref='reviews/r3/core/v'+revision;
  const snap=createSnapshot(root,ref,files);
  const packet={schemaVersion:1,kind:'r3_core',revision,snapshotPath:ref,
    snapshotSha256:snap.sha256,planner:{runId:option('--planner-run-id'),contextId:option('--planner-context-id')},
    preparedAt:new Date().toISOString()};
  if(!present(packet.planner.runId)||!present(packet.planner.contextId))
    fail('R3_CORE_PLANNER_PROVENANCE_MISSING');
  const inputPath='reviews/r3/core/input-v'+revision+'.json';
  const inputSha256=writeNew(root,inputPath,snapshotText(packet));
  r.corePlan={status:'under_review',revision,inputPath,inputSha256,
    snapshotPath:ref,snapshotSha256:snap.sha256,reviews:{},
    approvalPath:null,approvalSha256:null};
  atomicWritePlan(root,plan);
  output({status:'under_review',revision,inputPath,inputSha256,snapshotPath:ref,
    snapshotSha256:snap.sha256,diffPath:prior?ref+'/diff.md':null});
}
function coreSubmit(root,plan){
  const c=plan.v3.r3.corePlan,role=option('--role');
  if(!coreRoles.includes(role)||!['under_review','revise'].includes(c?.status))
    fail('R3_CORE_REVIEW_NOT_READY');
  if(c.reviews?.[role])fail('R3_CORE_REVIEW_ROLE_ALREADY_SUBMITTED');
  const input=inputFile(root,c),frozen=checkReviewScope(c,input,root);
  const raw=readEvidence(root,option('--report'));
  const otherRole=coreRoles.find(x=>x!==role);
  const old=c.reviews?.[otherRole],other=old?readEvidence(root,old.path):null;
  if(!validCoreReview(raw,input,role,other,frozen.files))fail('R3_CORE_REPORT_INVALID');
  const rel='reviews/r3/core/report-'+role+'-v'+c.revision+'.json';
  const digest=writeNew(root,rel,snapshotText(raw));
  c.reviews[role]={path:rel,sha256:digest,decision:raw.decision};
  c.status=coreRoles.every(x=>c.reviews[x]?.decision==='pass_candidate')?'awaiting_approval':
    raw.decision==='pass_candidate'?'under_review':'revise';
  atomicWritePlan(root,plan);
  output({status:c.status,role,revision:c.revision,reviewPath:rel,reviewSha256:digest});
}
function coreApprove(root,plan){
  const c=plan.v3.r3.corePlan;
  if(c?.status!=='awaiting_approval'||!coreRoles.every(r=>c.reviews?.[r]?.decision==='pass_candidate'))
    fail('R3_CORE_REVIEWS_NOT_PASSED');
  const input=inputFile(root,c);checkReviewScope(c,input,root);
  const evidence=readEvidence(root,option('--evidence'));
  const hashes=Object.fromEntries(coreRoles.map(role=>[role,c.reviews[role].sha256]));
  if(!validApproval(evidence,'r3_core',{revision:c.revision,
      inputSha256:c.inputSha256,reviewSha256:hashes}))fail('R3_CORE_AUTHOR_EVIDENCE_INVALID');
  for(const role of coreRoles){
    const rec=c.reviews[role],report=readEvidence(root,rec.path);
    if(sha256(Buffer.from(snapshotText(report)))!==rec.sha256||
      !validCoreReview(report,input,role))fail('R3_CORE_REVIEW_INVALID');
  }
  const rel='reviews/r3/core/approval-v'+c.revision+'.json';
  const digest=writeNew(root,rel,snapshotText(evidence));
  c.status='passed';c.approvalPath=rel;c.approvalSha256=digest;
  atomicWritePlan(root,plan);
  output({status:'passed',revision:c.revision,approvalPath:rel,
    note:'The approval source declaration must be verified against the real author message.'});
}
function volumePrepare(root,plan){
  const volId=integer('--volume'),start=integer('--start'),end=integer('--end');
  if(!Number.isSafeInteger(volId)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end))
    fail('R3_VOLUME_ARGS_INVALID');
  const core=verifyCore(root,plan);
  const cp=plan.v3.r3.volumeCheckpoints;
  if(volId>1){
    const prev=verifyVolume(root,plan,volId-1,core);
    if(start!==prev.endChapter+1)fail('R3_VOLUME_RANGE_GAP');
  }else if(start!==1)fail('R3_VOLUME_RANGE_GAP');
  for(const key of Object.keys(cp))
    if(Number(key)>volId && cp[key]?.status==='passed')fail('R3_VOLUME_LATER_APPROVAL_EXISTS');
  const slots=chapterSlots(plan,start,end);
  const files={'volume.md':volumeFile(root,volId,plan),'slots.json':snapshotText(slots)};
  const prev=cp[String(volId)],rev=(prev?.revision||0)+1;
  if(prev && rev>1){
    const prior=inputFile(root,prev);
    const oldFiles=verifySnapshot(root,prior.snapshotPath,prior.snapshotSha256).files;
    files['diff.md']=snapshotDiff(
      {'volume.md':oldFiles['volume.md'],'slots.json':oldFiles['slots.json']},
      {'volume.md':files['volume.md'],'slots.json':files['slots.json']});
  }
  const rel='reviews/r3/volumes/v'+volId+'/r'+rev;
  const snap=createSnapshot(root,rel,files);
  const packet={schemaVersion:1,kind:'r3_volume',volId,revision:rev,
    startChapter:start,endChapter:end,coreInputSha256:core.inputSha256,
    snapshotPath:rel,snapshotSha256:snap.sha256,preparedAt:new Date().toISOString()};
  const inputPath='reviews/r3/volumes/v'+volId+'/input-r'+rev+'.json';
  const digest=writeNew(root,inputPath,snapshotText(packet));
  cp[String(volId)]={volId,startChapter:start,endChapter:end,status:'awaiting_approval',
    revision:rev,coreInputSha256:core.inputSha256,inputPath,inputSha256:digest,
    snapshotPath:rel,snapshotSha256:snap.sha256,approvalPath:null,approvalSha256:null};
  atomicWritePlan(root,plan);
  output({status:'awaiting_approval',volId,revision:rev,inputPath,
    inputSha256:digest,snapshotPath:rel,diffPath:files['diff.md']?rel+'/diff.md':null});
}
function volumeApprove(root,plan){
  const id=integer('--volume'),c=plan.v3.r3.volumeCheckpoints[String(id)];
  if(c?.status!=='awaiting_approval')fail('R3_VOLUME_NOT_PREPARED');
  const core=verifyCore(root,plan);
  const input=inputFile(root,c);
  const frozen=verifySnapshot(root,input.snapshotPath,input.snapshotSha256);
  if(input.coreInputSha256!==core.inputSha256 ||
    frozen.files['volume.md']!==volumeFile(root,id,plan)||
    frozen.files['slots.json']!==snapshotText(chapterSlots(plan,input.startChapter,input.endChapter)))
    fail('VOLUME_CHECKPOINT_CHANGED');
  const evidence=readEvidence(root,option('--evidence'));
  if(!validApproval(evidence,'r3_volume',{volId:id,revision:c.revision,
    inputSha256:c.inputSha256,coreInputSha256:core.inputSha256}))
    fail('R3_VOLUME_AUTHOR_EVIDENCE_INVALID');
  const rel='reviews/r3/volumes/v'+id+'/approval-r'+c.revision+'.json';
  const digest=writeNew(root,rel,snapshotText(evidence));
  c.status='passed';c.approvalPath=rel;c.approvalSha256=digest;
  atomicWritePlan(root,plan);
  output({status:'passed',volId:id,revision:c.revision,approvalPath:rel});
}
try{
  if(!dir||!action||!['core-prepare','core-submit','core-approve','volume-prepare',
    'volume-approve','verify'].includes(action))fail('R3_PLAN_USAGE');
  const root=projectRoot(dir),plan=readPlan(root);
  if(!hasR3Namespace(plan)||!validR3Namespace(plan.v3.r3))fail('R3_NOT_ENABLED');
  switch(action){
    case 'core-prepare':corePrepare(root,plan);break;
    case 'core-submit':coreSubmit(root,plan);break;
    case 'core-approve':coreApprove(root,plan);break;
    case 'volume-prepare':volumePrepare(root,plan);break;
    case 'volume-approve':volumeApprove(root,plan);break;
    case 'verify':{
      const n=option('--chapter')?integer('--chapter'):null;
      if(n!==null&&!Number.isSafeInteger(n))fail('R3_INVALID_CHAPTER');
      const issues=verifyR3Plan(root,plan,n);
      output({status:issues.length?'blocked':'allowed',issues,
        literaryStatus:'UNVERIFIED',chapter:n});
      process.exitCode=issues.length?1:0;
      break;
    }
  }
}catch(e){output({status:'error',error:e.message});process.exitCode=2}
