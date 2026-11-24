/** P1 review semantics. Deterministic checks cannot certify literary quality. */
import fs from 'node:fs';
import {safeFile,sha256,readJsonFile} from './v3_common.mjs';
const fail=x=>{throw new Error(x)};
export const nonempty=x=>typeof x==='string'&&!!x.trim();
export const digest=x=>sha256(Buffer.from(JSON.stringify(x)));
export function p1State(plan){
  const r=plan.v3?.r3;
  if(!r||!Object.hasOwn(r,'p1'))return null;
  const s=r.p1;
  if(!s||s.schemaVersion!==1||!Number.isSafeInteger(s.baselineUpto)||s.baselineUpto<0||
    !nonempty(s.projectId)||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(s.projectId)||
    !s.legacyReviews||typeof s.legacyReviews!=='object'||Array.isArray(s.legacyReviews)||
    !Array.isArray(s.reviewHistory))fail('R3_P1_STATE_INVALID');
  return s;
}
export const issueKey=i=>'I-'+digest([i.chapter,i.subject.trim(),i.key.trim(),i.factId??null,
  i.quote.replace(/\s+/g,' ').trim()]).slice(0,24);
export const scopeNumbers=(kind,end)=>kind==='chapter'?[end]:kind==='pilot'?[1,2,3]:[end-2,end-1,end];
function quoteValid(root,plan,n,quote,scope){
  if(!scope.includes(n)||!nonempty(quote))return false;
  const p=safeFile(root,plan.chapters.find(c=>c.chapterNumber===n)?.filePath);
  return !!p&&fs.readFileSync(p,'utf8').includes(quote);
}
export function readFeedback(root,plan,{upto=Infinity}={}){
  const state=p1State(plan),issues=new Map(),signals=[],strengths=[],seen=new Set();
  if(!state)return {deferredIssues:[],signals:[],strengths:[]};
  for(const item of state.reviewHistory){
    if(!item||!['chapter','arc','pilot'].includes(item.kind)||!Number.isSafeInteger(item.end)||
      !Number.isSafeInteger(item.revision)||item.revision<1||!nonempty(item.path))fail('R3_P1_HISTORY_INVALID');
    const k=item.kind+':'+item.end+':'+item.revision;
    if(seen.has(k))fail('R3_P1_DUPLICATE_HISTORY');seen.add(k);
    const f=safeFile(root,item.path);
    if(!f||sha256(fs.readFileSync(f))!==item.sha256)fail('R3_P1_HISTORY_CHANGED_'+k);
    const r=readJsonFile(root,item.path);
    if(r.revision!==item.revision||(item.kind!=='pilot'&&(r.kind!==item.kind||r.end!==item.end))||
      r.p1?.schemaVersion!==1||r.p1.literaryStatus!=='UNVERIFIED')fail('R3_P1_HISTORY_INVALID_'+k);
    if(item.end>upto||r.decision!=='pass_candidate')continue;
    const source={path:item.path,sha256:item.sha256,kind:item.kind,end:item.end,revision:item.revision};
    for(const f of r.p1.followUps){
      const old=issues.get(f.trackingId);
      if(!old){if(upto!==Infinity)continue;fail('R3_P1_UNKNOWN_FOLLOWUP_'+f.trackingId);}
      issues.set(f.trackingId,{...old,status:f.status,resolution:{...f,source}});
    }
    for(const i of r.issues){
      if(!['fix_in_arc','defer_to_final'].includes(i.disposition))continue;
      const id=issueKey(i),old=issues.get(id);
      const references=[...(old?.references??[]),source];
      issues.set(id,{trackingId:id,chapter:i.chapter,subject:i.subject,key:i.key,factId:i.factId??null,
        quote:i.quote,reason:i.reason,suggestion:i.suggestion,severity:i.severity,classification:i.classification,
        disposition:i.disposition,status:i.status==='resolved'?'resolved':'open',
        dueChapter:i.disposition==='fix_in_arc'?Math.ceil(i.chapter/3)*3:null,references});
    }
    const current=item.kind==='pilot'?plan.v3?.pilotGate:
      plan.v3?.r2?.[item.kind==='chapter'?'chapterReviews':'arcReviews']?.[String(item.end)];
    // Old review versions remain provenance for outstanding issues, but not
    // current literary signals or strengths after the underlying text changes.
    if(current?.reviewSha256===item.sha256&&current.revision===item.revision){
      signals.push(...r.p1.signals.map(x=>({...x,source})));
      strengths.push(...r.p1.preserveStrengths.map(x=>({...x,source})));
    }
  }
  return {deferredIssues:[...issues.values()],signals,strengths};
}
export function dueIssues(root,plan,upto){
  return readFeedback(root,plan,{upto}).deferredIssues.filter(i=>i.status==='open'&&
    i.disposition==='fix_in_arc'&&i.dueChapter<=upto);
}
export function p1GateIssues(root,plan,chapter,finalize=false){
  if(!p1State(plan))return [];
  const all=readFeedback(root,plan,{upto:chapter-1}).deferredIssues;
  return all.filter(i=>i.chapter<chapter&&i.status==='open'&&i.disposition==='fix_in_arc'&&
    (finalize||i.dueChapter<chapter)).map(i=>'R3_P1_ARC_FIX_DUE_'+i.trackingId);
}
export function p1PilotIssues(root,plan){
  const state=p1State(plan),gate=plan.v3?.pilotGate;
  if(!state||!['passed','awaiting_approval'].includes(gate?.status))return [];
  if(state.legacyPilot?.revision===gate.revision&&state.legacyPilot.reviewSha256===gate.reviewSha256)return [];
  const ip=safeFile(root,gate.reviewInputPath);
  if(!ip||sha256(fs.readFileSync(ip))!==gate.reviewInputSha256)return ['R3_P1_PILOT_INPUT_CHANGED'];
  const packet=readJsonFile(root,gate.reviewInputPath);
  if(packet.p1Protocol!==1||packet.revision!==gate.revision||
    !state.reviewHistory.some(h=>h.kind==='pilot'&&h.end===3&&h.revision===gate.revision&&
      h.path===gate.reviewPath&&h.sha256===gate.reviewSha256))
    return ['R3_P1_PILOT_HISTORY_MISSING'];
  return [];
}
export function checkP1Report(root,plan,report,kind,end,packet){
  const s=p1State(plan);if(!s)return;
  const p=report.p1,scope=scopeNumbers(kind,end),where=(n,q)=>quoteValid(root,plan,n,q,scope);
  if(p?.schemaVersion!==1||p.literaryStatus!=='UNVERIFIED'||!Array.isArray(p.preserveStrengths)||
    !Array.isArray(p.signals)||!Array.isArray(p.followUps)||!Array.isArray(p.revisionProtection))
    fail('R3_P1_REPORT_FIELDS_INVALID');
  if(kind!=='chapter'&&p.preserveStrengths.length!==3)fail('R3_P1_READER_STRENGTHS_REQUIRE_THREE_SLOTS');
  const strengthIds=new Set();
  for(const x of p.preserveStrengths){
    if(!nonempty(x?.id)||strengthIds.has(x.id)||!nonempty(x.reason)||
      !(x.status==='observed'&&where(x.chapter,x.quote)||
        x.status==='not_established'&&!x.quote))fail('R3_P1_STRENGTH_INVALID');
    strengthIds.add(x.id);
  }
  const keys=new Set();
  for(const [idx,i] of report.issues.entries()){
    const label='R3_P1_ISSUE_'+idx;
    if(!where(i.chapter,i.quote)||!['A','B','C','blank'].includes(i.classification)||
      !['explicit_conflict','causal_break','narrative_risk','reasonable_blank'].includes(i.evidenceLevel)||
      !['fix_now','fix_in_arc','defer_to_final','keep_as_blank'].includes(i.disposition))
      fail(label+'_EVIDENCE_OR_DISPOSITION');
    if(['BLOCKER','MAJOR'].includes(i.severity)&&
      !(nonempty(i.reverseDefense?.reason)&&where(i.reverseDefense.chapter,i.reverseDefense.quote)))
      fail(label+'_REVERSE_DEFENSE_REQUIRED');
    if(i.evidenceLevel==='causal_break'&&i.classification!=='A')fail(label+'_CAUSAL_BREAK_MUST_FIX_NOW');
    if(i.severity==='BLOCKER'||i.classification==='A'){
      if(i.classification!=='A'||i.severity==='MINOR'||i.disposition!=='fix_now'||i.status==='accepted'||
        (i.status==='open'&&report.decision==='pass_candidate'))fail(label+'_HARD_CAUSAL_FLOOR');
    }else if(i.classification==='B'){
      if(i.severity!=='MAJOR'||!['fix_now','fix_in_arc'].includes(i.disposition)||i.status==='accepted'||
        (i.status==='open'&&report.decision==='pass_candidate'&&
          (i.disposition==='fix_now'||kind!=='chapter')))fail(label+'_ARC_RISK');
    }else if(i.classification==='C'){
      if(i.severity!=='MINOR'||!['fix_now','defer_to_final'].includes(i.disposition)||
        (i.status!=='resolved'&&i.disposition==='fix_now'&&report.decision==='pass_candidate'))fail(label+'_LOCAL_RISK');
    }else if(i.disposition!=='keep_as_blank'||i.evidenceLevel!=='reasonable_blank'||
       i.status!=='accepted'||!nonempty(i.acceptanceReason))fail(label+'_BLANK');
    if(i.disposition==='fix_in_arc'||i.disposition==='defer_to_final'){
      if(!nonempty(i.subject)||!nonempty(i.key)||(i.factId!==undefined&&i.factId!==null&&!nonempty(i.factId)))
        fail(label+'_FACT_LINK_REQUIRED');
      const k=issueKey(i);if(keys.has(k))fail(label+'_DUPLICATE');keys.add(k);
      if(i.factId){
        const ledger=readJsonFile(root,'story-ledger.json');
        const fact=ledger.facts?.find(f=>f.id===i.factId);
        if(!fact||fact.subject!==i.subject||fact.key!==i.key||fact.chapter>end)fail(label+'_FACT_LINK_INVALID');
      }
    }
  }
  const known=readFeedback(root,plan).deferredIssues,followed=new Set();
  for(const f of p.followUps){
    const prior=known.find(i=>i.trackingId===f?.trackingId);
    if(!prior||prior.status!=='open'||prior.chapter>end||followed.has(f.trackingId)||keys.has(f.trackingId)||
      !['resolved','open'].includes(f.status)||!nonempty(f.reason)||!where(f.chapter,f.quote)||
      (f.status==='resolved'&&f.chapter<prior.chapter))fail('R3_P1_FOLLOWUP_INVALID');
    followed.add(f.trackingId);
  }
  if(report.decision==='pass_candidate'&&kind!=='chapter'){
    for(const i of known.filter(x=>x.status==='open'&&x.disposition==='fix_in_arc'&&x.dueChapter<=end)){
      if(!p.followUps.some(f=>f.trackingId===i.trackingId&&f.status==='resolved'))
        fail('R3_P1_ARC_FIX_DUE_'+i.trackingId);
    }
  }
  for(const x of p.signals){
    if(!['promise_open','promise_progress','promise_paid','negative','spark','character_progress'].includes(x?.kind)||
      !nonempty(x.id)||!nonempty(x.description)||!where(x.chapter,x.quote))
      fail('R3_P1_SIGNAL_INVALID');
  }
  const prior=packet?.priorStrengths??[];
  if(!Array.isArray(prior)||p.revisionProtection.length!==prior.length)fail('R3_P1_REVISION_PROTECTION_REQUIRED');
  const reviewed=new Set();
  for(const x of p.revisionProtection){
    if(!prior.some(y=>y.id===x.id)||reviewed.has(x.id)||!['preserved','changed','removed'].includes(x.status)||
      !nonempty(x.reason)||!where(x.chapter,x.quote))fail('R3_P1_REVISION_PROTECTION_INVALID');
    reviewed.add(x.id);
  }
}
export function priorStrengths(root,record){
  if(!record?.reviewPath)return [];
  const f=safeFile(root,record.reviewPath);
  if(!f||sha256(fs.readFileSync(f))!==record.reviewSha256)fail('R3_P1_PRIOR_REPORT_CHANGED');
  return (JSON.parse(fs.readFileSync(f,'utf8')).p1?.preserveStrengths??[]).filter(x=>x.status==='observed');
}
export function recordFeedback(plan,kind,end,revision,path,sha256){
  const s=p1State(plan);if(!s)return;
  if(s.reviewHistory.some(x=>x.kind===kind&&x.end===end&&x.revision===revision))fail('R3_P1_DUPLICATE_HISTORY');
  s.reviewHistory.push({kind,end,revision,path,sha256});
}
export function verifyP1Registration(root,plan,kind,end,record,packet){
  const s=p1State(plan);if(!s)return null;
  if(packet.p1Protocol!==1){
    const old=s.legacyReviews[kind+':'+end];
    if(!old||old.inputSha256!==record.inputSha256||old.reviewSha256!==record.reviewSha256)
      return 'R3_P1_UNREGISTERED_LEGACY_REVIEW';
    return null;
  }
  if(!s.reviewHistory.some(h=>h.kind===kind&&h.end===end&&h.revision===record.revision&&
    h.path===record.reviewPath&&h.sha256===record.reviewSha256))return 'R3_P1_REVIEW_HISTORY_MISSING';
  return null;
}
