#!/usr/bin/env node
/** Explicit R3 P1 activation, source binding and read-only feedback/volume packets. */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot,readPlan,readJsonFile,atomicWritePlan,safeFile,sha256} from './v3_common.mjs';
import {validR3Namespace} from './r3_state_common.mjs';
import {checkGate,verify} from './r2_review_common.mjs';
import {verifyCore,verifyVolume} from './r3_plan_common.mjs';
import {p1State,nonempty,readFeedback,p1GateIssues,digest,legacyCandidates} from './r3_p1_common.mjs';
import {bindingInput,verifyBinding,continuityIssues,recentSources} from './r3_continuity_common.mjs';
import {createSnapshot,snapshotText} from './r3_snapshots.mjs';
import {momentum,cascadeWarnings} from './r3_feedback_view.mjs';
const fail=x=>{throw new Error(x)},out=x=>console.log(JSON.stringify(x,null,2));
const [dir,action,...args]=process.argv.slice(2);
const opts=new Map();
function option(k){return opts.get(k)}
function integer(k,min=0){
  const x=option(k),n=Number(x);
  if(!/^\d+$/.test(x??'')||!Number.isSafeInteger(n)||n<min)fail('R3_P1_BAD_'+k);
  return n;
}
function uptoComplete(plan){
  let n=0;
  while(plan.chapters.some(c=>c.chapterNumber===n+1&&c.status==='completed'))n++;
  if(plan.chapters.some(c=>c.chapterNumber>n&&c.status==='completed'))fail('R3_P1_NONCONTIGUOUS_BASELINE');
  return n;
}
function readLedger(root){
  const l=readJsonFile(root,'story-ledger.json');
  if(l?.schemaVersion!==1)fail('R3_LEDGER_SCHEMA_INVALID');
  return l;
}
function writeLedger(root,l){
  const target=path.join(root,'story-ledger.json');
  if(fs.lstatSync(target).isSymbolicLink())fail('R3_LEDGER_UNSAFE');
  const tmp=target+'.p1-tmp-'+process.pid;
  fs.writeFileSync(tmp,snapshotText(l),{flag:'wx'});
  try{fs.renameSync(tmp,target)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
function activate(root,plan){
  if(p1State(plan)){if(plan.v3.r3.p1.projectId!==option('--project-id'))fail('R3_P1_PROJECT_ID_IMMUTABLE');
    return out({status:'unchanged',p1:plan.v3.r3.p1});}
  const id=option('--project-id');
  if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))fail('R3_P1_PROJECT_ID_INVALID');
  const upto=uptoComplete(plan),legacyReviews={};
  const errs=checkGate(root,plan,upto+1);
  if(errs.length)fail('R3_P1_BASELINE_INVALID: '+errs.join(','));
  const r2=plan.v3.r2;
  for(const [kind,records] of [['chapter',r2.chapterReviews],['arc',r2.arcReviews]]){
    for(const [end,rec] of Object.entries(records)){
      if(rec.status!=='passed'||Number(end)>upto)fail('R3_P1_FINISH_PENDING_REVIEW_FIRST');
      const issue=verify(root,plan,kind,Number(end));
      if(issue)fail(issue);
      legacyReviews[kind+':'+end]={inputSha256:rec.inputSha256,reviewSha256:rec.reviewSha256,reviewPath:rec.reviewPath};
    }
  }
  const pilot=plan.v3.pilotGate;
  if(pilot?.status==='under_review')fail('R3_P1_FINISH_PENDING_PILOT_FIRST');
  let legacyPilot=null;
  if(['awaiting_approval','passed'].includes(pilot?.status)){
    const f=safeFile(root,pilot.reviewPath);
    if(!f||sha256(fs.readFileSync(f))!==pilot.reviewSha256)fail('R3_P1_LEGACY_PILOT_CHANGED');
    legacyPilot={revision:pilot.revision,reviewSha256:pilot.reviewSha256,reviewPath:pilot.reviewPath};
  }
  plan.v3.r3.p1={schemaVersion:1,projectId:id,baselineUpto:upto,legacyReviews,legacyPilot,reviewHistory:[]};
  atomicWritePlan(root,plan);
  out({status:'activated',baselineUpto:upto,legacyReviews:Object.keys(legacyReviews).length,
    note:'No historical approval was changed. Reconcile and bind existing ledger sources before continuing.'});
}
function requireActive(plan){
  const s=p1State(plan);if(!s)fail('R3_P1_NOT_ENABLED');return s;
}
function inspect(root,plan,n){
  if(n===0)verifyCore(root,plan);
  else {const issue=verify(root,plan,'chapter',n);if(issue)fail(issue)}
  const l=readLedger(root),i=bindingInput(root,plan,l,n);
  const {sourceText,...fields}=i;return {l,i,fields};
}
function volumePacket(root,plan,vol){
  const state=requireActive(plan),record=verifyVolume(root,plan,vol),n=record.endChapter;
  if(uptoComplete(plan)!==n)fail('R3_P1_VOLUME_PACKET_REQUIRES_CURRENT_COMPLETED_BOUNDARY');
  const errs=[...checkGate(root,plan,n+1),...continuityIssues(root,plan,n),...p1GateIssues(root,plan,n+1)];
  if(errs.length)fail('R3_P1_VOLUME_NOT_READY: '+errs.join(','));
  const l=readLedger(root),feedback=readFeedback(root,plan,{upto:n});
  const visible=new Map(l.facts.filter(f=>f.chapter<=n).map(f=>[f.id,f]));
  const activeFacts=[...visible.values()].filter(f=>!visible.has(f.supersededBy)&&f.kind!=='provisional');
  const openForeshadowing=l.foreshadowing.filter(f=>f.chapter<=n&&
    (f.status==='open'||(f.payoffChapter??f.closureChapter??Infinity)>n));
  return {schemaVersion:1,projectId:state.projectId,volume:vol,startChapter:record.startChapter,
    endChapter:n,volumeInputSha256:plan.v3.r3.volumeCheckpoints[String(vol)].inputSha256,
    ledgerSha256:sha256(fs.readFileSync(path.join(root,'story-ledger.json'))),
    activeFacts,openForeshadowing,relationships:l.relationships.filter(r=>r.chapter<=n),
    momentum:momentum(feedback,l,n),deferredIssues:feedback.deferredIssues.filter(i=>i.status==='open'),
    recentSources:recentSources(root,plan,n),literaryStatus:'UNVERIFIED'};
}
try{
  const allowed={activate:['--project-id'],inspect:['--chapter'],bind:['--evidence'],
    status:['--upto'],volume:['--volume','--candidate']};
  if(!dir||!Object.hasOwn(allowed,action)||args.length%2)fail('R3_P1_USAGE');
  for(let i=0;i<args.length;i+=2){
    if(!allowed[action].includes(args[i])||opts.has(args[i])||args[i+1].startsWith('--'))fail('R3_P1_BAD_ARGS');
    opts.set(args[i],args[i+1]);
  }
  const root=projectRoot(dir),plan=readPlan(root);
  if(!validR3Namespace(plan.v3?.r3))fail('R3_NOT_ENABLED');
  if(action==='activate')activate(root,plan);
  else{
    requireActive(plan);
    if(action==='inspect'){
      const n=integer('--chapter');
      out({...inspect(root,plan,n).fields,literaryStatus:'UNVERIFIED'});
    }else if(action==='bind'){
      const b=readJsonFile(root,option('--evidence')),n=b.chapter;
      if(!Number.isSafeInteger(n)||n<0)fail('R3_P1_BIND_CHAPTER_INVALID');
      const {l,i}=inspect(root,plan,n);
      verifyBinding(i,b);
      if(!l.r3Bindings)l.r3Bindings={};
      l.r3Bindings[String(n)]=b;writeLedger(root,l);
      out({status:'bound',chapter:n,projectionSha256:i.projectionSha256,literaryStatus:'UNVERIFIED'});
    }else if(action==='status'){
      const n=option('--upto')===undefined?uptoComplete(plan):integer('--upto');
      if(n>uptoComplete(plan))fail('R3_P1_STATUS_FUTURE');
      const l=readLedger(root),f=readFeedback(root,plan,{upto:n});
      const issues=continuityIssues(root,plan,n,l);
      out({status:issues.length?'needs_reconciliation':'ready',upto:n,issues,
        dueIssues:p1GateIssues(root,plan,n+1),deferredIssues:f.deferredIssues,legacyCandidates:legacyCandidates(root,plan),
        momentum:momentum(f,l,n),recentSources:recentSources(root,plan,n),literaryStatus:'UNVERIFIED'});
      process.exitCode=issues.length?1:0;
    }else{
      const v=integer('--volume',1),packet=volumePacket(root,plan,v),packetSha256=digest(packet);
      if(!option('--candidate'))out({packet,packetSha256});
      else{
        const c=readJsonFile(root,option('--candidate'));
        if(c?.schemaVersion!==1||c.packetSha256!==packetSha256||
          !nonempty(c.reviewer?.runId)||!nonempty(c.reviewer?.contextId)||
          !Array.isArray(c.observations)||!Array.isArray(c.nextVolumeProposals))
          fail('R3_P1_VOLUME_CANDIDATE_INVALID');
        for(const x of [...c.observations,...c.nextVolumeProposals]){
          const f=safeFile(root,plan.chapters.find(p=>p.chapterNumber===x.chapter)?.filePath);
          if(!Number.isSafeInteger(x.chapter)||x.chapter<1||x.chapter>packet.endChapter||!f||
            !nonempty(x.quote)||!fs.readFileSync(f,'utf8').includes(x.quote)||!nonempty(x.reason)||
            !nonempty(x.proposal))fail('R3_P1_VOLUME_CANDIDATE_EVIDENCE_INVALID');
        }
        const rel='reviews/r3/retrospectives/volume-'+v+'/'+digest([packet,c]).slice(0,24);
        const snap=createSnapshot(root,rel,{'packet.json':snapshotText(packet),'candidate.json':snapshotText(c)});
        out({status:'candidate_only',snapshotPath:snap.path,sha256:snap.sha256,
          literaryStatus:'UNVERIFIED',note:'Does not change outline, volume checkpoint or author approval.'});
      }
    }
  }
}catch(e){out({status:'error',error:e.message});process.exitCode=2}
