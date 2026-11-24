/** Version-bound projection of the existing story ledger; no secondary synopsis. */
import fs from 'node:fs';
import {readJsonFile,safeFile,sha256} from './v3_common.mjs';
import {p1State,nonempty} from './r3_p1_common.mjs';
import {structuredChecks} from './r3_structured_checks.mjs';
const fail=x=>{throw new Error(x)};
const kinds=['facts','foreshadowing','relationships','mechanisms','handoffs'];
const without=(o,keys)=>Object.fromEntries(Object.entries(o).filter(([k])=>!keys.includes(k)));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const projectionHash=x=>sha256(Buffer.from(JSON.stringify(canonical(x))));
export function ledgerProjection(ledger,chapter){
  if(ledger?.schemaVersion!==1||kinds.some(k=>!Array.isArray(ledger[k])))fail('R3_LEDGER_SCHEMA_INVALID');
  const all=new Map(),rows=[],handoffs=new Set();
  const add=(id,content)=>rows.push({id,content});
  for(const kind of kinds){
    for(const x of ledger[kind]){
      if(!x||!Number.isSafeInteger(x.chapter)||x.chapter<0||
        (x.chapter===0&&(kind!=='facts'||x.scope!=='global')))fail('R3_LEDGER_ENTRY_INVALID_'+kind);
      if(kind==='handoffs'){
        if(handoffs.has(x.chapter))fail('R3_LEDGER_DUPLICATE_HANDOFF_'+x.chapter);
        handoffs.add(x.chapter);
        if(x.chapter===chapter)add('handoff:'+chapter,x);
        continue;
      }
      if(!nonempty(x.id)||all.has(x.id))fail('R3_LEDGER_DUPLICATE_OR_EMPTY_ID');
      all.set(x.id,{kind,x});
      if(x.chapter===chapter)add(kind+':'+x.id,kind==='facts'?without(x,['supersededBy']):
        kind==='foreshadowing'?without(x,['status','payoffChapter','closureChapter','closureQuote','closureReason','progress']):x);
    }
  }
  const facts=ledger.facts,positions=new Map(facts.map((f,i)=>[f.id,i]));
  for(const f of facts){
    if(!f.supersededBy)continue;
    const other=all.get(f.supersededBy),n=other?.x;
    if(other?.kind!=='facts'||n.chapter<f.chapter||
      n.subject!==f.subject||n.key!==f.key||n.kind!==f.kind||
      (n.chapter===f.chapter&&positions.get(n.id)<=positions.get(f.id)))
      fail('R3_LEDGER_SUPERSESSION_INVALID_'+f.id);
    if(n.chapter===chapter)add('supersession:'+f.id,{from:f.id,to:n.id,chapter:n.chapter});
  }
  for(const f of ledger.foreshadowing){
    if(!['open','paid','dropped'].includes(f.status))fail('R3_LEDGER_PROMISE_STATUS_'+f.id);
    if(f.status!=='open'){
      const n=f.status==='paid'?f.payoffChapter:f.closureChapter;
      if(!Number.isSafeInteger(n)||n<f.chapter||!nonempty(f.closureQuote)||!nonempty(f.closureReason))
        fail('R3_LEDGER_PROMISE_CLOSURE_EVIDENCE_'+f.id);
      if(n===chapter)add('closure:'+f.id,{status:f.status,chapter:n,quote:f.closureQuote,reason:f.closureReason});
    }
    if(f.progress!==undefined&&!Array.isArray(f.progress))fail('R3_LEDGER_PROMISE_PROGRESS_'+f.id);
    let last=f.chapter-1;
    for(const p of f.progress??[]){
      const closure=f.status==='paid'?f.payoffChapter:f.status==='dropped'?f.closureChapter:Infinity;
      if(!Number.isSafeInteger(p?.chapter)||p.chapter<f.chapter||p.chapter<=last||p.chapter>closure||
        !nonempty(p.quote)||!nonempty(p.note))fail('R3_LEDGER_PROMISE_PROGRESS_'+f.id);
      last=p.chapter;
      if(p.chapter===chapter)add('progress:'+f.id,p);
    }
  }
  // Explicit arithmetic/calendar evidence is part of the chapter's projection.
  structuredChecks(ledger,Infinity);
  for(const c of ledger.r3Checks??[])if(c.chapter===chapter)add('check:'+c.id,c);
  return rows.sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
export function bindingInput(root,plan,ledger,n){
  const rows=ledgerProjection(ledger,n);
  let sourceHash,reviewHash,sourceText;
  if(n===0){
    const core=plan.v3?.r3?.corePlan;
    if(core?.status!=='passed'||!nonempty(core.inputSha256))fail('R3_LEDGER_CORE_NOT_APPROVED');
    sourceHash=core.inputSha256;
    reviewHash=core.approvalSha256;
    const coreFiles=['00-core.md','01-core.md','03-core.md'];
    sourceText=coreFiles.map(name=>{
      const f=safeFile(root,core.snapshotPath+'/'+name);
      if(!f)fail('R3_LEDGER_CORE_SOURCE_MISSING');
      return fs.readFileSync(f,'utf8');
    }).join('\n');
  }else{
    const chapter=plan.chapters.find(c=>c.chapterNumber===n),review=plan.v3?.r2?.chapterReviews?.[String(n)];
    const file=safeFile(root,chapter?.filePath);
    if(chapter?.status!=='completed'||chapter.wordCountPass!==true||!file||review?.status!=='passed')
      fail('R3_LEDGER_CHAPTER_NOT_REVIEWED_'+n);
    const bytes=fs.readFileSync(file);
    sourceHash=sha256(bytes);reviewHash=review.reviewSha256;sourceText=bytes.toString('utf8');
    if(review.manuscriptHashes?.[String(n)]!==sourceHash||!nonempty(reviewHash))
      fail('R3_LEDGER_REVIEW_STALE_'+n);
    if(!rows.some(r=>r.id==='handoff:'+n)||!rows.some(r=>r.id.startsWith('mechanisms:')))
      fail('R3_LEDGER_HANDOFF_OR_MECHANISM_MISSING_'+n);
  }
  return {chapter:n,sourceHash,reviewHash,projectionSha256:projectionHash(rows),rows,sourceText};
}
export function verifyBinding(input,b){
  if(!b||b.schemaVersion!==1||b.chapter!==input.chapter||b.sourceHash!==input.sourceHash||
    b.reviewHash!==input.reviewHash||b.projectionSha256!==input.projectionSha256||
    !nonempty(b.checkedBy?.runId)||!nonempty(b.checkedBy?.contextId)||!nonempty(b.reviewNote)||
    !b.anchors||typeof b.anchors!=='object'||Array.isArray(b.anchors)||
    Object.keys(b.anchors).length!==input.rows.length||
    !input.rows.every(r=>nonempty(b.anchors[r.id])&&input.sourceText.includes(b.anchors[r.id])&&
      (!r.id.startsWith('closure:')&&!r.id.startsWith('progress:')&&!r.id.startsWith('check:')||
        input.sourceText.includes(r.content.quote))))
    fail('R3_LEDGER_BINDING_STALE_OR_MISSING_'+input.chapter);
}
export function continuityIssues(root,plan,upto,ledger=null){
  if(!p1State(plan)||upto<0)return [];
  try{
    const l=ledger??readJsonFile(root,'story-ledger.json'),issues=[];
    // Global facts are version-bound to the approved core; later transitions
    // are projected onto the chapter where the new value actually appears.
    const start=ledgerProjection(l,0).length?0:1;
    for(let n=start;n<=upto;n++){
      try{verifyBinding(bindingInput(root,plan,l,n),l.r3Bindings?.[String(n)])}
      catch(e){issues.push(e.message)}
    }
    const validChapters=new Set(plan.chapters.map(c=>c.chapterNumber));
    for(const kind of [...kinds,'r3Checks'])
      for(const row of l[kind]??[])
        if(row.chapter!==0&&!validChapters.has(row.chapter))issues.push('R3_LEDGER_UNKNOWN_CHAPTER_'+row.chapter);
    for(const f of l.foreshadowing){
      const closure=f.status==='paid'?f.payoffChapter:f.status==='dropped'?f.closureChapter:null;
      if(closure!==null&&!validChapters.has(closure))issues.push('R3_LEDGER_UNKNOWN_PROMISE_CLOSURE_'+f.id);
      for(const p of f.progress??[])if(!validChapters.has(p.chapter))issues.push('R3_LEDGER_UNKNOWN_PROMISE_PROGRESS_'+f.id);
    }
    // A global fact conflict cannot be safely handed to the writer as two
    // simultaneously valid values. Provisional and character-belief remain distinct.
    const visible=new Map(l.facts.filter(f=>f.chapter<=upto).map(f=>[f.id,f]));
    const global=new Map();
    for(const f of visible.values()){
      if(f.scope!=='global'||f.kind==='provisional'||visible.has(f.supersededBy))continue;
      const key=JSON.stringify([f.kind,f.subject,f.key]);
      if(global.has(key)&&global.get(key)!==f.value)issues.push('R3_LEDGER_CONFLICTING_GLOBAL_FACT_'+f.id);
      global.set(key,f.value);
    }
    for(const issue of structuredChecks(l,upto))if(issue.impact==='hard')issues.push(issue.code+'_'+issue.id);
    return [...new Set(issues)];
  }catch(e){return [e.message]}
}
export function recentSources(root,plan,upto,count=3){
  return plan.chapters.filter(c=>c.chapterNumber<=upto&&c.chapterNumber>upto-count)
    .sort((a,b)=>a.chapterNumber-b.chapterNumber).map(c=>{
      const f=safeFile(root,c.filePath);
      if(!f)fail('R3_LEDGER_SOURCE_MISSING_'+c.chapterNumber);
      return {chapter:c.chapterNumber,filePath:c.filePath,sha256:sha256(fs.readFileSync(f))};
    });
}
