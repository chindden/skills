import fs from 'node:fs';
import {safeFile,sha256} from './v3_common.mjs';

// The author-facing plan remains three standard documents + the stable fields of the writing plan.
// Do not hash v3 metadata or chapter completion statuses: reviews update the plan file itself.
export const planFiles=['00-人物档案.md','01-大纲.md','03-文风基准.md'];
export const planGateState=()=>({schemaVersion:1,status:'pending',revision:0,
  inputPath:null,inputSha256:null,artifactHashes:{},reviews:{},approvalPath:null,
  approvalSha256:null,approvedAt:null,humanApproved:false});
export const roles=['architecture','reader'];
export const checkIds={
  architecture:['resources_and_numbers','timeline_and_progression','world_rules_and_power','character_causality','foreshadowing_and_finale'],
  reader:['genre_promise','opening_and_rewards','midgame_pacing','protagonist_agency','relationships_and_emotion']
};
export const hashEqual=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&
  Object.keys(b).every(k=>a[k]===b[k]&&/^[0-9a-f]{64}$/.test(a[k]));
export function fingerprint(root,plan){
  const out={};
  for(const name of planFiles){
    const file=safeFile(root,name);
    if(!file)throw new Error('PLAN_REQUIRED_FILE_MISSING_'+name);
    const bytes=fs.readFileSync(file);
    if(bytes.length<50)throw new Error('PLAN_REQUIRED_FILE_TOO_SHORT_'+name);
    out[name]=sha256(bytes);
  }
  const stable={novelName:plan.novelName??null,totalChapters:plan.totalChapters??plan.chapters.length,
    minWordsPerChapter:plan.minWordsPerChapter??null,
    chapters:plan.chapters.map(c=>({chapterNumber:c.chapterNumber,title:c.title??null,filePath:c.filePath}))};
  out['02-写作计划.json#outline']=sha256(Buffer.from(JSON.stringify(stable)));
  return out;
}
const norm=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
export function validatePlanReview(root,report,packet,role,other=null){
  const errors=[];
  if(report?.schemaVersion!==1||report?.kind!=='plan'||report?.role!==role||
    report?.revision!==packet.revision)errors.push('PLAN_REVIEW_SCOPE_MISMATCH');
  if(!hashEqual(report?.artifactHashes,packet.artifactHashes))errors.push('PLAN_REVIEW_HASH_MISMATCH');
  const reviewer=report?.reviewer;
  if(reviewer?.kind!=='independent_agent'||!norm(reviewer?.runId)||!norm(reviewer?.contextId))
    errors.push('PLAN_REVIEWER_PROVENANCE_MISSING');
  if(reviewer?.runId===packet?.planner?.runId||reviewer?.contextId===packet?.planner?.contextId||
    (other&&(reviewer?.runId===other?.reviewer?.runId||reviewer?.contextId===other?.reviewer?.contextId)))
    errors.push('PLAN_SELF_OR_DUPLICATE_REVIEW');
  if(!['pass_candidate','revise','reject'].includes(report?.decision)||!norm(report?.summary)||
    !Array.isArray(report?.issues))errors.push('PLAN_REPORT_STRUCTURE_INVALID');
  const expected=checkIds[role]||[];
  if(!Array.isArray(report?.checks)||expected.some(id=>
    !report.checks.some(c=>c?.id===id&&['pass','issue','not_applicable'].includes(c.status)&&norm(c.evidence).length>=12)))
    errors.push('PLAN_CHECKLIST_INCOMPLETE');
  if(Array.isArray(report?.issues)){
    const ids=new Set();
    for(const i of report.issues){
      const bad=!norm(i?.id)||ids.has(i.id)||!['BLOCKER','MAJOR','MINOR'].includes(i.severity)||
        !['open','resolved','accepted'].includes(i.status)||!norm(i.artifact)||!norm(i.quote)||
        !norm(i.reason)||!norm(i.suggestion)||
        (i.status==='accepted'&&!norm(i.acceptanceReason));
      if(bad){errors.push('PLAN_ISSUE_INVALID');break;}
      ids.add(i.id);
      const source=safeFile(root,i.artifact);
      if(!planFiles.includes(i.artifact)||!source||!norm(fs.readFileSync(source,'utf8')).includes(norm(i.quote))){
        errors.push('PLAN_ISSUE_QUOTE_UNVERIFIED');break;
      }
    }
    if(report?.decision==='pass_candidate'&&report.issues.some(i=>
      (i.status==='open'&&['BLOCKER','MAJOR'].includes(i.severity))||
      (i.status==='accepted'&&i.severity==='BLOCKER')))
      errors.push('PLAN_UNRESOLVED_SEVERE_ISSUES');
  }
  return errors;
}
export function verifyPlanGate(root,plan){
  const g=plan.v3?.planGate,errors=[];
  if(g?.schemaVersion!==1)return ['PLAN_GATE_NOT_ENABLED'];
  if(g.status!=='passed'||g.humanApproved!==true||!g.approvedAt)
    errors.push('PLAN_REVIEW_NOT_APPROVED');
  const ip=safeFile(root,g.inputPath);
  if(!ip)return [...errors,'PLAN_REVIEW_PACKET_MISSING'];
  const inputBytes=fs.readFileSync(ip);
  if(sha256(inputBytes)!==g.inputSha256)return [...errors,'PLAN_REVIEW_PACKET_CHANGED'];
  let packet;
  try{packet=JSON.parse(inputBytes);}catch{return [...errors,'PLAN_REVIEW_PACKET_INVALID'];}
  if(packet.schemaVersion!==1||packet.kind!=='plan'||packet.revision!==g.revision||
    !hashEqual(packet.artifactHashes,g.artifactHashes))errors.push('PLAN_REVIEW_PACKET_INVALID');
  try{if(!hashEqual(fingerprint(root,plan),packet.artifactHashes))errors.push('PLAN_BLUEPRINT_CHANGED');}
  catch{errors.push('PLAN_BLUEPRINT_MISSING');}
  let previous=null;
  for(const role of roles){
    const rec=g.reviews?.[role],rp=safeFile(root,rec?.path);
    if(!rec||!rp){errors.push('PLAN_'+role.toUpperCase()+'_REVIEW_MISSING');continue;}
    const bytes=fs.readFileSync(rp);
    if(sha256(bytes)!==rec.sha256){errors.push('PLAN_'+role.toUpperCase()+'_REVIEW_CHANGED');continue;}
    try{
      const report=JSON.parse(bytes);
      if(validatePlanReview(root,report,packet,role,previous).length||
        report.decision!=='pass_candidate')errors.push('PLAN_'+role.toUpperCase()+'_REVIEW_INVALID');
      previous=report;
    }catch{errors.push('PLAN_'+role.toUpperCase()+'_REVIEW_INVALID');}
  }
  const ap=safeFile(root,g.approvalPath);
  if(!ap){errors.push('PLAN_APPROVAL_RECORD_MISSING');return errors;}
  const bytes=fs.readFileSync(ap);
  if(sha256(bytes)!==g.approvalSha256){errors.push('PLAN_APPROVAL_RECORD_CHANGED');return errors;}
  try{
    const a=JSON.parse(bytes);
    if(a.schemaVersion!==1||a.kind!=='plan'||a.approved!==true||a.revision!==g.revision||
      a.inputSha256!==g.inputSha256||!norm(a.source)||norm(a.quote).length<2||
      a.approvedAt!==g.approvedAt||!Number.isFinite(Date.parse(a.approvedAt))||
      roles.some(role=>a.reviewSha256?.[role]!==g.reviews?.[role]?.sha256))
      errors.push('PLAN_APPROVAL_RECORD_INVALID');
  }catch{errors.push('PLAN_APPROVAL_RECORD_INVALID');}
  return errors;
}
