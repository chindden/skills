#!/usr/bin/env node
/** Stage 2 freeze, dual independent plan review, and author approval. Checks evidence integrity, not literary quality. */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot,readPlan,atomicWritePlan,safeFile,sha256} from './v3_common.mjs';
import {roles,planGateState,fingerprint,hashEqual,validatePlanReview,verifyPlanGate} from './plan_review_common.mjs';
const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
try{
  const [folder,action]=args;
  if(!folder||!['prepare','submit','approve','verify'].includes(action))throw Error('PLAN_USAGE: <project> prepare|submit|approve|verify');
  const root=projectRoot(folder),plan=readPlan(root),g=plan.v3?.planGate;
  if(g?.schemaVersion!==1)throw Error('PLAN_GATE_NOT_ENABLED: initialize a new project or migrate explicitly with --enable-plan-gate');
  const directory=path.join(root,'reviews','plan');
  if(action==='prepare'){
    const planner={runId:flag('--planner-run-id'),contextId:flag('--planner-context-id')};
    if(!nonempty(planner.runId)||!nonempty(planner.contextId))throw Error('PLAN_PLANNER_PROVENANCE_REQUIRED');
    const artifactHashes=fingerprint(root,plan),revision=(g.revision||0)+1;
    const packet={schemaVersion:1,kind:'plan',revision,artifactHashes,planner,preparedAt:new Date().toISOString()};
    fs.mkdirSync(directory,{recursive:true});
    const rel='reviews/plan/input-v'+revision+'.json',bytes=Buffer.from(JSON.stringify(packet,null,2)+'\n');
    fs.writeFileSync(path.join(root,rel),bytes,{flag:'wx'});
    plan.v3.planGate={...planGateState(),status:'under_review',revision,inputPath:rel,
      inputSha256:sha256(bytes),artifactHashes};
    // New revision always invalidates previous approval and chapter authorization.
    plan.v3.storyPlanApproved=false;
    atomicWritePlan(root,plan);
    console.log(JSON.stringify({status:'under_review',revision,inputPath:rel,artifactHashes,
      warning:'Reviewer and author identities must be verified from real host/user logs.'}));
  }else if(action==='submit'){
    if(!['under_review','revise'].includes(g.status))throw Error('PLAN_NOT_PREPARED');
    const role=flag('--role'),src=safeFile(root,flag('--report')),ip=safeFile(root,g.inputPath);
    if(!roles.includes(role)||g.reviews?.[role])throw Error('PLAN_ROLE_INVALID_OR_ALREADY_SUBMITTED');
    if(!src||!ip)throw Error('PLAN_REPORT_OR_PACKET_MISSING');
    const ib=fs.readFileSync(ip);
    if(sha256(ib)!==g.inputSha256)throw Error('PLAN_INPUT_CHANGED');
    const packet=JSON.parse(ib);
    if(!hashEqual(fingerprint(root,plan),packet.artifactHashes))throw Error('PLAN_BLUEPRINT_CHANGED_BEFORE_REVIEW');
    const report=JSON.parse(fs.readFileSync(src,'utf8'));
    const otherRole=roles.find(x=>x!==role),otherRec=g.reviews?.[otherRole];
    const other=otherRec?JSON.parse(fs.readFileSync(safeFile(root,otherRec.path),'utf8')):null;
    const errors=validatePlanReview(root,report,packet,role,other);
    if(errors.length)throw Error(errors.join(','));
    const rel='reviews/plan/report-'+role+'-v'+g.revision+'.json';
    if(path.resolve(src)===path.resolve(root,rel))throw Error('PLAN_REPORT_SOURCE_MUST_DIFFER');
    fs.mkdirSync(directory,{recursive:true});const bytes=fs.readFileSync(src);
    fs.writeFileSync(path.join(root,rel),bytes,{flag:'wx'});
    g.reviews[role]={path:rel,sha256:sha256(bytes),decision:report.decision};
    g.status=roles.every(x=>g.reviews[x]?.decision==='pass_candidate')?'awaiting_approval':
      Object.values(g.reviews).some(x=>x.decision!=='pass_candidate')?'revise':'under_review';
    atomicWritePlan(root,plan);
    console.log(JSON.stringify({status:g.status,revision:g.revision,role,decision:report.decision,reviewPath:rel}));
  }else if(action==='approve'){
    if(g.status!=='awaiting_approval')throw Error('PLAN_REVIEWS_NOT_PASSED');
    if(plan.v3.creativeDecision!=='accepted')throw Error('PLAN_CREATIVE_NOT_APPROVED_BY_AUTHOR');
    const src=safeFile(root,flag('--evidence'));
    if(!src)throw Error('PLAN_AUTHOR_EVIDENCE_MISSING');
    const a=JSON.parse(fs.readFileSync(src,'utf8'));
    const matches=a.schemaVersion===1&&a.kind==='plan'&&a.approved===true&&
      a.revision===g.revision&&a.inputSha256===g.inputSha256&&
      nonempty(a.source)&&nonempty(a.quote)&&a.quote.trim().length>=2&&
      Number.isFinite(Date.parse(a.approvedAt))&&
      roles.every(role=>a.reviewSha256?.[role]===g.reviews?.[role]?.sha256);
    if(!matches)throw Error('PLAN_AUTHOR_EVIDENCE_INVALID');
    // Check all inputs and reviews immediately before recording approval.
    const probe={...plan,v3:{...plan.v3,storyPlanApproved:true,planGate:{...g,
      status:'passed',humanApproved:true,approvedAt:a.approvedAt,approvalPath:flag('--evidence'),
      approvalSha256:sha256(fs.readFileSync(src))}}};
    const errors=verifyPlanGate(root,probe);
    if(errors.length)throw Error(errors.join(','));
    const rel='reviews/plan/approval-v'+g.revision+'.json';
    if(path.resolve(src)===path.resolve(root,rel))throw Error('PLAN_APPROVAL_SOURCE_MUST_DIFFER');
    const bytes=fs.readFileSync(src);
    fs.writeFileSync(path.join(root,rel),bytes,{flag:'wx'});
    g.status='passed';g.humanApproved=true;g.approvedAt=a.approvedAt;
    g.approvalPath=rel;g.approvalSha256=sha256(bytes);
    plan.v3.storyPlanApproved=true;
    atomicWritePlan(root,plan);
    console.log(JSON.stringify({status:'passed',revision:g.revision,approvalPath:rel,
      warning:'Approval source/quote are evidence declarations; verify against real user message.'}));
  }else{
    const errors=verifyPlanGate(root,plan);
    console.log(JSON.stringify({status:errors.length?'blocked':'allowed',issues:errors,revision:g.revision}));
    if(errors.length)process.exitCode=1;
  }
}catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
