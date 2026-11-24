#!/usr/bin/env node
/** Immutable R2 review packet registration. Reported IDs require independent host-log verification. */
import fs from 'node:fs';
import {p1State,priorStrengths,checkP1Report,recordFeedback} from './r3_p1_common.mjs';
import path from 'node:path';
import {projectRoot,readPlan,atomicWritePlan,safeFile,sha256} from './v3_common.mjs';
import {range,key,hashes,equal,validate,verify} from './r2_review_common.mjs';
import {hasR3Namespace} from './r3_state_common.mjs';
import {prepareR3ManuscriptSnapshot,verifyR3ManuscriptSnapshot} from './r3_manuscripts.mjs';
const a=process.argv.slice(2),flag=k=>{const i=a.indexOf(k);return i<0?null:a[i+1];};
const nonempty=x=>typeof x==='string'&&x.trim();
try{
  const [folder,action]=a;
  if(!folder||!['prepare','submit'].includes(action))throw new Error('R2_USAGE');
  const root=projectRoot(folder),plan=readPlan(root),state=plan.v3?.r2;
  if(state?.schemaVersion!==1)throw new Error('R2_NOT_ENABLED');
  const kind=flag('--scope'),end=Number(flag('--end'));
  if(!['chapter','arc'].includes(kind)||!Number.isSafeInteger(end)||end<1||
    (kind==='arc'&&(end<6||end%3!==0)))throw new Error('R2_INVALID_SCOPE');
  const numbers=range(kind,end);
  if(numbers.some(n=>!plan.chapters.some(c=>c.chapterNumber===n)))throw new Error('R2_CHAPTER_NOT_IN_PLAN');
  const records=kind==='chapter'?state.chapterReviews:state.arcReviews,old=records[String(end)];
  if(action==='prepare'){
    if(numbers.some(n=>{
      const c=plan.chapters.find(c=>c.chapterNumber===n);
      return c.wordCountPass!==true||(kind==='arc'&&c.status!=='completed');
    }))throw new Error('R2_CHAPTER_NOT_READY');
    const writers=kind==='chapter'?
      [{chapter:end,runId:flag('--writer-run-id'),contextId:flag('--writer-context-id')}]:
      numbers.map(n=>{
        const err=verify(root,plan,'chapter',n);if(err)throw new Error(err);
        const rec=state.chapterReviews[String(n)];
        return JSON.parse(fs.readFileSync(safeFile(root,rec.inputPath),'utf8')).writers[0];
      });
    if(writers.some(w=>!nonempty(w.runId)||!nonempty(w.contextId)))
      throw new Error('R2_WRITER_PROVENANCE_REQUIRED');
    const current=hashes(root,plan,numbers),revision=(old?.revision??0)+1,k=key(kind,end);
    const r3Snapshot=hasR3Namespace(plan)?prepareR3ManuscriptSnapshot(root,plan,kind,end,revision,old):null;
    const rel='reviews/r2/input-'+k+'-v'+revision+'.json';
    const p1=p1State(plan);
    const packet={schemaVersion:1,kind,end,revision,manuscriptHashes:current,writers,preparedAt:new Date().toISOString(),
      ...(p1?{p1Protocol:1,priorStrengths:priorStrengths(root,old)}:{}),
      ...(r3Snapshot?{r3Snapshot}:{})};
    const bytes=Buffer.from(JSON.stringify(packet,null,2)+'\n'),dst=path.join(root,rel);
    fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,bytes,{flag:'wx'});
    records[String(end)]={status:'under_review',revision,inputPath:rel,inputSha256:sha256(bytes),
      reviewPath:null,reviewSha256:null,manuscriptHashes:current,...(r3Snapshot?{r3Snapshot}:{})};
    atomicWritePlan(root,plan);
    console.log(JSON.stringify({status:'under_review',kind,end,revision,inputPath:rel,manuscriptHashes:current}));
  }else{
    if(old?.status!=='under_review')throw new Error('R2_NOT_PREPARED');
    const src=safeFile(root,flag('--report')),ip=safeFile(root,old.inputPath);
    if(!src||!ip)throw new Error('R2_REPORT_OR_PACKET_MISSING');
    const ib=fs.readFileSync(ip);
    if(sha256(ib)!==old.inputSha256)throw new Error('R2_INPUT_CHANGED');
    const packet=JSON.parse(ib);
    if(packet.kind!==kind||packet.end!==end||packet.revision!==old.revision||
        !equal(hashes(root,plan,numbers),packet.manuscriptHashes))
      throw new Error('R2_PREPARED_MANUSCRIPT_CHANGED');
    if(hasR3Namespace(plan)){
      const snapError=verifyR3ManuscriptSnapshot(root,plan,kind,end,old,packet);
      if(snapError)throw new Error(snapError);
    }
    const bytes=fs.readFileSync(src),report=JSON.parse(bytes);
    const errors=validate(report,packet);
    if(errors.length)throw new Error(errors.join(','));
    if(p1State(plan)){
      if(packet.p1Protocol!==1)throw new Error('R3_P1_PACKET_REQUIRED');
      checkP1Report(root,plan,report,kind,end,packet);
    }
    const rel='reviews/r2/report-'+key(kind,end)+'-v'+old.revision+'.json';
    if(path.resolve(src)===path.resolve(root,rel))throw new Error('R2_REPORT_INPUT_MUST_DIFFER');
    fs.writeFileSync(path.join(root,rel),bytes,{flag:'wx'});
    old.status=report.decision==='pass_candidate'?'passed':'revise';
    old.reviewPath=rel;old.reviewSha256=sha256(bytes);
    recordFeedback(plan,kind,end,old.revision,rel,old.reviewSha256);
    atomicWritePlan(root,plan);
    console.log(JSON.stringify({status:old.status,kind,end,revision:old.revision,reviewPath:rel,
      warning:'Reviewer identifiers are declarations, not independent execution proof.'}));
  }
}catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
