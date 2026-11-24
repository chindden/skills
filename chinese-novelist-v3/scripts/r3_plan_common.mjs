/** R3 plan hashes and evidence verification; independent from R2 plan gate. */
import fs from 'node:fs';
import {readPlan,safeFile,sha256} from './v3_common.mjs';
import {inspectR3Plan} from './r3_plan_sections.mjs';
import {verifySnapshot,snapshotText} from './r3_snapshots.mjs';

const err=code=>{throw new Error(code)};
export const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const coreNames=['00-core.md','01-core.md','03-core.md','02-meta.json'];
export const coreFiles={'00-core.md':'00-人物档案.md','01-core.md':'01-大纲.md','03-core.md':'03-文风基准.md'};
export const coreRoles=['architecture','reader'];
export const coreChecks={
  architecture:['world_rules_and_power','character_causality','foreshadowing_and_finale'],
  reader:['genre_promise','opening_and_rewards','protagonist_agency']
};
export const text=x=>typeof x==='string'&&x.trim().length>0;
export function meta(plan){
  return {novelName:plan.novelName??null,writingMode:plan.writingMode??null,
    minWordsPerChapter:plan.minWordsPerChapter??null};
}
export function frozenCoreFiles(root,plan=null){
  if(!plan)plan=readPlan(root);
  const parts=inspectR3Plan(root);
  return {
    '00-core.md':parts['00-人物档案.md'].core,
    '01-core.md':parts['01-大纲.md'].core,
    '03-core.md':parts['03-文风基准.md'].core,
    '02-meta.json':snapshotText(meta(plan))
  };
}
export function volumeFile(root,volId,plan=null){
  if(!plan)plan=readPlan(root);
  const parts=inspectR3Plan(root)['01-大纲.md'];
  const vol=parts.volumes.find(v=>v.volId===volId);
  if(!vol)err('R3_VOLUME_NOT_IN_OUTLINE');
  return vol.text;
}
export function chapterSlots(plan,start,end){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start)
    err('R3_VOLUME_BOUNDARY_INVALID');
  const out=[];
  for(let n=start;n<=end;n++){
    const ch=plan.chapters.find(c=>c.chapterNumber===n);
    if(!ch)err('R3_VOLUME_CHAPTER_MISSING_'+n);
    if(typeof ch.filePath!=='string'||!ch.filePath.trim()||
      ch.filePath.startsWith('/')||ch.filePath.includes('\\')||
      ch.filePath.split('/').some(x=>!x||x==='.'||x==='..'))
      err('R3_VOLUME_FILEPATH_UNSAFE');
    out.push({chapterNumber:n,filePath:ch.filePath});
  }
  return out;
}
function match(files,actual){
  const keys=Object.keys(files).sort();
  return keys.every(name=>files[name]===actual[name]) &&
    Object.keys(actual).every(name=>keys.includes(name)||name==='diff.md');
}
export function readRecordedInput(root,rel,expected){
  const file=safeFile(root,rel);
  if(!file||!rel.startsWith('reviews/r3/'))err('R3_INPUT_MISSING');
  const bytes=fs.readFileSync(file);
  if(sha256(bytes)!==expected)err('R3_INPUT_HASH_MISMATCH');
  let packet;try{packet=JSON.parse(bytes)}catch{err('R3_INPUT_INVALID')}
  return packet;
}
export function verifyCore(root,plan=readPlan(root)){
  const c=plan.v3?.r3?.corePlan;
  if(c?.status!=='passed')err('R3_CORE_NOT_APPROVED');
  const input=readRecordedInput(root,c.inputPath,c.inputSha256);
  if(input.kind!=='r3_core'||input.revision!==c.revision||input.snapshotSha256!==c.snapshotSha256)
    err('R3_CORE_INPUT_MISMATCH');
  const snapshot=verifySnapshot(root,input.snapshotPath,c.snapshotSha256);
  if(!match(frozenCoreFiles(root,plan),snapshot.files))err('CORE_PLAN_CHANGED');
  let previousReport=null;
  for(const role of coreRoles){
    const rec=c.reviews?.[role];
    const file=safeFile(root,rec?.path);
    if(!file||!rec?.sha256)err('R3_CORE_REVIEW_MISSING');
    const bytes=fs.readFileSync(file);
    if(sha256(bytes)!==rec.sha256)err('R3_CORE_REVIEW_CHANGED');
    let report;try{report=JSON.parse(bytes)}catch{err('R3_CORE_REVIEW_INVALID')}
    if(!validCoreReview(report,input,role,previousReport,snapshot.files)||report.decision!=='pass_candidate')
      err('R3_CORE_REVIEW_INVALID');
    previousReport=report;
  }
  const ap=safeFile(root,c.approvalPath);
  if(!ap)err('R3_CORE_APPROVAL_MISSING');
  const bytes=fs.readFileSync(ap);
  if(sha256(bytes)!==c.approvalSha256)err('R3_CORE_APPROVAL_CHANGED');
  let approval;try{approval=JSON.parse(bytes)}catch{err('R3_CORE_APPROVAL_INVALID')}
  if(!validApproval(approval,'r3_core',{revision:c.revision,inputSha256:c.inputSha256,
    reviewSha256:Object.fromEntries(coreRoles.map(role=>[role,c.reviews[role].sha256]))}))
    err('R3_CORE_APPROVAL_INVALID');
  return {revision:c.revision,inputSha256:c.inputSha256,approvalSha256:c.approvalSha256};
}
export function validApproval(a,kind,expected){
  return a?.schemaVersion===1 && a.kind===kind && a.approved===true &&
    Object.entries(expected).every(([k,v])=>JSON.stringify(a[k])===JSON.stringify(v)) &&
    text(a.source)&&text(a.quote)&&text(a.approvedAt) &&
    Number.isFinite(Date.parse(a.approvedAt));
}
export function validCoreReview(report,packet,role,other=null,sourceFiles=null){
  if(report?.schemaVersion!==1||report?.kind!=='r3_core'||report?.role!==role||
    report.revision!==packet.revision||report.snapshotSha256!==packet.snapshotSha256||
    !text(report.summary)||!Array.isArray(report.issues)||!Array.isArray(report.checks)||
    !['pass_candidate','revise','reject'].includes(report.decision))return false;
  const reviewer=report?.reviewer;
  if(reviewer?.kind!=='independent_agent'||!text(reviewer.runId)||!text(reviewer.contextId)||
    reviewer.runId===packet.planner?.runId||reviewer.contextId===packet.planner?.contextId||
    (other&&(reviewer.runId===other.reviewer.runId||reviewer.contextId===other.reviewer.contextId)))
    return false;
  if(coreChecks[role].some(id=>!report.checks.some(c=>c.id===id && text(c.evidence) &&
    ['pass','issue','not_applicable'].includes(c.status))))return false;
  if(role==='reader'&&(!Array.isArray(report.preserveStrengths)||
    report.preserveStrengths.length!==3||!report.preserveStrengths.every(text)))return false;
  const ids=new Set();
  for(const item of report.issues){
    if(!text(item.id)||ids.has(item.id)||!['BLOCKER','MAJOR','MINOR'].includes(item.severity)||
      !['open','resolved','accepted'].includes(item.status)||!coreNames.includes(item.artifact)||
      !text(item.quote)||!text(item.reason)||!text(item.suggestion)||
      !['explicit_conflict','causal_break','narrative_risk','reasonable_blank'].includes(item.evidenceLevel)||
      (['BLOCKER','MAJOR'].includes(item.severity)&&!text(item.reverseDefense))||
      (item.status==='accepted'&&!text(item.acceptanceReason)))
      return false;
    ids.add(item.id);
    if(sourceFiles && !sourceFiles[item.artifact]?.includes(item.quote))return false;
    if(report.decision==='pass_candidate' && ((item.status==='open'&&
      ['BLOCKER','MAJOR'].includes(item.severity)) || (item.status==='accepted'&&item.severity==='BLOCKER')))
      return false;
  }
  return true;
}
export function verifyVolume(root,plan,volId,core=null){
  const record=plan.v3?.r3?.volumeCheckpoints?.[String(volId)];
  if(record?.status!=='passed')err('R3_VOLUME_NOT_APPROVED_'+volId);
  const input=readRecordedInput(root,record.inputPath,record.inputSha256);
  if(input.kind!=='r3_volume'||input.volId!==volId||input.revision!==record.revision ||
    input.snapshotSha256!==record.snapshotSha256)err('R3_VOLUME_INPUT_MISMATCH');
  const snap=verifySnapshot(root,input.snapshotPath,record.snapshotSha256);
  const slots=chapterSlots(plan,input.startChapter,input.endChapter);
  if(snap.files['volume.md']!==volumeFile(root,volId,plan)||
    snap.files['slots.json']!==snapshotText(slots))err('VOLUME_CHECKPOINT_CHANGED');
  core=core||verifyCore(root,plan);
  if(input.coreInputSha256!==core.inputSha256)err('R3_VOLUME_CORE_REVISION_MISMATCH');
  const approvalPath=safeFile(root,record.approvalPath);
  if(!approvalPath)err('R3_VOLUME_APPROVAL_MISSING');
  const bytes=fs.readFileSync(approvalPath);
  if(sha256(bytes)!==record.approvalSha256)err('R3_VOLUME_APPROVAL_CHANGED');
  let approval;try{approval=JSON.parse(bytes)}catch{err('R3_VOLUME_APPROVAL_INVALID')}
  if(!validApproval(approval,'r3_volume',{volId,revision:record.revision,
    inputSha256:record.inputSha256,coreInputSha256:core.inputSha256}))
    err('R3_VOLUME_APPROVAL_INVALID');
  return {volId,startChapter:input.startChapter,endChapter:input.endChapter};
}
export function verifyR3Plan(root,plan=readPlan(root),chapter=null){
  const issues=[];
  if(!plan.v3?.r3||plan.v3.r3.mode!=='experimental')return ['R3_NOT_ENABLED'];
  let core;
  try{core=verifyCore(root,plan)}catch(e){issues.push(e.message);return issues}
  const cps=plan.v3.r3.volumeCheckpoints||{};
  const vols=Object.keys(cps).map(Number).sort((a,b)=>a-b);
  if(!vols.length)return ['R3_VOLUME_NOT_APPROVED'];
  let previousEnd=0,chapterCovered=false;
  for(let i=0;i<vols.length;i++){
    const n=vols[i];
    if(n!==i+1){issues.push('R3_VOLUME_SEQUENCE_INVALID');break}
    try{
      const record=verifyVolume(root,plan,n,core);
      if(record.startChapter!==previousEnd+1)issues.push('R3_VOLUME_RANGE_GAP');
      previousEnd=record.endChapter;
      if(chapter!==null&&chapter>=record.startChapter&&chapter<=record.endChapter)chapterCovered=true;
    }catch(e){issues.push(e.message)}
  }
  if(chapter!==null&&!chapterCovered)issues.push('R3_VOLUME_NOT_APPROVED_FOR_CHAPTER_'+chapter);
  return issues;
}
