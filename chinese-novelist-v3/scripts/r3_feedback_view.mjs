/** Read-only narrative feedback; warnings indicate review candidates, never quotas. */
export function momentum(feedback,ledger,upto){
  const open=new Map(),characters=new Map(),negative=new Set(),sparks=[];
  const signals=feedback.signals.filter(s=>s.chapter<=upto).sort((a,b)=>a.chapter-b.chapter);
  for(const s of signals){
    if(s.kind==='promise_open'||s.kind==='promise_progress'){
      const previous=open.get(s.id);
      open.set(s.id,{id:s.id,description:s.description,openedAt:previous?.openedAt??s.chapter,
        lastProgressChapter:s.chapter,evidence:s.quote,source:s.source});
    }else if(s.kind==='promise_paid')open.delete(s.id);
    else if(s.kind==='negative')negative.add(s.chapter);
    else if(s.kind==='spark')sparks.push(s);
    else if(s.kind==='character_progress')characters.set(s.id,s);
  }
  let consecutiveNegativeChapters=0;
  for(let n=upto;n>0&&negative.has(n);n--)consecutiveNegativeChapters++;
  const warnings=[];
  for(const f of ledger.foreshadowing??[]){
    if(f.chapter>upto||f.status!=='open'&&(f.payoffChapter??f.closureChapter??Infinity)<=upto)continue;
    const last=Math.max(f.chapter,...(f.progress??[]).filter(p=>p.chapter<=upto).map(p=>p.chapter));
    if(upto-last>=10)warnings.push({code:'LONG_OPEN_FORESHADOW',id:f.id,lastProgressChapter:last,
      age:upto-last,note:'长期未记录推进，仅提示编辑判断是否仍有追踪计划。'});
  }
  for(const s of open.values())if(upto-s.lastProgressChapter>=10)
    warnings.push({code:'LONG_OPEN_READER_PROMISE',id:s.id,lastProgressChapter:s.lastProgressChapter,
      age:upto-s.lastProgressChapter,note:'不是兑现期限或高潮配额。'});
  for(const c of characters.values())if(c.core===true&&upto-c.chapter>=10)
    warnings.push({code:'CORE_CHARACTER_TRACKING_DORMANT',id:c.id,lastProgressChapter:c.chapter,
      age:upto-c.chapter,note:'未记录角色进展，不等于角色实际缺席。'});
  return {openPromises:[...open.values()],consecutiveNegativeChapters,
    negativeChapters:[...negative].sort((a,b)=>a-b),emergentSparks:sparks,
    latestCharacterProgress:[...characters.values()],warnings,literaryStatus:'UNVERIFIED'};
}
export function cascadeWarnings(feedback,anchors){
  return feedback.deferredIssues.filter(i=>i.status==='open'&&anchors.some(f=>
    (i.factId&&f.id===i.factId)||(f.subject===i.subject&&f.key===i.key)))
    .map(i=>({code:'DEFERRED_CASCADE_RISK',trackingId:i.trackingId,chapter:i.chapter,
      subject:i.subject,key:i.key,factId:i.factId,reason:i.reason,
      note:'仅发现具体属性或事实依赖；语义复核决定是否升级，不按主体同名自动判错。'}));
}
