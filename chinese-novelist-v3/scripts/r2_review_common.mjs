import fs from 'node:fs';
import {safeFile,sha256} from './v3_common.mjs';
import {hasR3Namespace} from './r3_state_common.mjs';
import {verifyR3ManuscriptSnapshot} from './r3_manuscripts.mjs';
export const r2State=()=>({schemaVersion:1,chapterReviews:{},arcReviews:{}});
export const range=(kind,end)=>kind==='chapter'?[end]:[end-2,end-1,end];
export const key=(kind,end)=>(kind==='chapter'?'ch':'arc')+String(end).padStart(3,'0');
export function hashes(root,plan,numbers){
  const out={};
  for(const n of numbers){
    const c=plan.chapters.find(c=>c.chapterNumber===n);
    if(!c)throw new Error('R2_MISSING_CHAPTER_'+n);
    const p=safeFile(root,c.filePath);
    if(!p)throw new Error('R2_MISSING_MANUSCRIPT_'+n);
    out[String(n)]=sha256(fs.readFileSync(p));
  }
  return out;
}
export const equal=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&
  Object.keys(b).every(k=>a[k]===b[k]&&/^[0-9a-f]{64}$/.test(a[k]));
export function validate(report,packet){
  const errors=[];
  if(report?.schemaVersion!==1||report.kind!==packet.kind||
      report.end!==packet.end||report.revision!==packet.revision)
    errors.push('R2_SCOPE_MISMATCH');
  if(!equal(report?.manuscriptHashes,packet.manuscriptHashes))errors.push('R2_HASH_MISMATCH');
  if(report?.reviewer?.kind!=='independent_agent'||
      typeof report.reviewer.runId!=='string'||!report.reviewer.runId.trim()||
      typeof report.reviewer.contextId!=='string'||!report.reviewer.contextId.trim())
    errors.push('R2_REVIEWER_MISSING');
  if(packet.writers.some(w=>w.runId===report?.reviewer?.runId||
        w.contextId===report?.reviewer?.contextId))errors.push('R2_SELF_REVIEW');
  if(!['pass_candidate','revise','reject'].includes(report?.decision)||
     typeof report?.summary!=='string'||!report.summary.trim()||
     !Array.isArray(report?.issues))errors.push('R2_REPORT_INVALID');
  if(Array.isArray(report?.issues)){
    const ids=new Set();
    for(const i of report.issues){
      if(typeof i?.id!=='string'||!i.id.trim()||ids.has(i.id)||
        !['BLOCKER','MAJOR','MINOR'].includes(i.severity)||
        !['open','resolved','accepted'].includes(i.status)||
        !range(packet.kind,packet.end).includes(i.chapter)||
        typeof i.quote!=='string'||!i.quote.trim()||
        typeof i.reason!=='string'||!i.reason.trim()||
        typeof i.suggestion!=='string'||!i.suggestion.trim()||
        (i.status==='accepted'&&!(typeof i.acceptanceReason==='string'&&i.acceptanceReason.trim()))){
        errors.push('R2_INVALID_ISSUE');break;
      }
      ids.add(i.id);
    }
    if(report.decision==='pass_candidate'&&report.issues.some(i=>
      (i.status==='open'&&['BLOCKER','MAJOR'].includes(i.severity))||
      (i.status==='accepted'&&i.severity==='BLOCKER')))errors.push('R2_UNRESOLVED_ISSUES');
  }
  return errors;
}
export function verify(root,plan,kind,end){
  const record=plan.v3?.r2?.[kind==='chapter'?'chapterReviews':'arcReviews']?.[String(end)];
  if(record?.status!=='passed')return 'R2_REVIEW_NOT_PASSED_'+key(kind,end);
  const ip=safeFile(root,record.inputPath),rp=safeFile(root,record.reviewPath);
  if(!ip||!rp)return 'R2_REVIEW_FILE_MISSING_'+key(kind,end);
  const ib=fs.readFileSync(ip),rb=fs.readFileSync(rp);
  if(sha256(ib)!==record.inputSha256||sha256(rb)!==record.reviewSha256)
    return 'R2_REVIEW_CHANGED_'+key(kind,end);
  let packet,report;
  try{packet=JSON.parse(ib);report=JSON.parse(rb);}catch{return 'R2_BAD_JSON_'+key(kind,end);}
  if(packet.kind!==kind||packet.end!==end||packet.revision!==record.revision||
     !equal(packet.manuscriptHashes,record.manuscriptHashes))
    return 'R2_PACKET_MISMATCH_'+key(kind,end);
  if(!equal(hashes(root,plan,range(kind,end)),packet.manuscriptHashes))
    return 'R2_MANUSCRIPT_CHANGED_'+key(kind,end);
  if(hasR3Namespace(plan)){
    const snapIssue=verifyR3ManuscriptSnapshot(root,plan,kind,end,record,packet);
    if(snapIssue)return snapIssue+'_'+key(kind,end);
  }
  if(validate(report,packet).length||report.decision!=='pass_candidate')
    return 'R2_REPORT_INVALID_'+key(kind,end);
  return null;
}
export function checkGate(root,plan,chapter,finalize=false){
  const errs=[];
  if(plan.v3?.r2?.schemaVersion!==1){errs.push('R2_PROTOCOL_NOT_ENABLED');return errs;}
  const last=chapter-1;
  if(finalize&&(plan.chapters.length!==last||plan.chapters.some(c=>c.chapterNumber>last)))
    errs.push('R2_FINALIZE_NOT_LAST_CHAPTER');
  for(let n=1;n<=last;n++){
    const c=plan.chapters.find(c=>c.chapterNumber===n);
    if(!c||c.status!=='completed'||c.wordCountPass!==true)errs.push('R2_PREVIOUS_INCOMPLETE_'+n);
    const e=verify(root,plan,'chapter',n);if(e)errs.push(e);
  }
  for(let n=6;n<=last;n+=3){const e=verify(root,plan,'arc',n);if(e)errs.push(e);}
  return errs;
}
