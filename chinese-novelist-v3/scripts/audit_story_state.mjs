#!/usr/bin/env node
/** Reviewable, deterministic continuity audit. Literary/semantic audit remains an editor task. */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot,readPlan,readJsonFile,sha256} from './v3_common.mjs';
const args=process.argv.slice(2),dir=args[0],hasText=x=>typeof x==='string'&&x.trim().length>0;
const usage='Usage: audit_story_state.mjs <project> --upto N [--write | --handoff [--anchor ID]...] [--json]';
try{
  let upto,handoff=false,write=false;
  const anchors=new Set();
  for(let i=1;i<args.length;i++){
    const flag=args[i];
    if(flag==='--json')continue;
    if(flag==='--write'){write=true;continue;}
    if(flag==='--handoff'){handoff=true;continue;}
    if(flag==='--upto'&&upto===undefined&&/^\d+$/.test(args[i+1]??'')){upto=Number(args[++i]);continue;}
    if(flag==='--anchor'&&hasText(args[i+1])&&!args[i+1].startsWith('--')){anchors.add(args[++i]);continue;}
    throw new Error(usage);
  }
  if(!dir||!Number.isSafeInteger(upto)||upto<(handoff?0:1)||(handoff&&write)||(!handoff&&anchors.size))
    throw new Error(usage);
  const root=projectRoot(dir),plan=readPlan(root),ledger=readJsonFile(root,'story-ledger.json');
  if(ledger.schemaVersion!==1 || !['facts','foreshadowing','relationships','mechanisms'].every(k=>Array.isArray(ledger[k])))
    throw new Error('INVALID_LEDGER_SCHEMA');
  const known=new Set(plan.chapters.map(c=>c.chapterNumber));
  const issues=[],warn=(code,details)=>issues.push({code,severity:'review',...details}),ids=new Set();
  const checkEntry=(entry,collection)=>{
    const initial=collection==='facts'&&entry?.chapter===0&&entry.scope==='global';
    if(!entry||typeof entry!=='object'||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id)
      ||(!initial&&!known.has(entry.chapter)))throw new Error('INVALID_LEDGER_ENTRY_'+collection);
    ids.add(entry.id);
  };
  const factsByKey=new Map();
  for(const fact of ledger.facts){
    checkEntry(fact,'facts');
    if(!['established','character-belief','provisional'].includes(fact.kind)||
      typeof fact.subject!=='string'||!fact.subject.trim()||typeof fact.key!=='string'||!fact.key.trim()||
      typeof fact.value!=='string'||!fact.value.trim()||typeof fact.evidence!=='string'||!fact.evidence.trim())
      throw new Error('INVALID_FACT_'+fact.id);
    if(fact.chapter>upto||fact.kind!=='established'||fact.supersededBy)continue;
    const key=fact.subject+'\\u0000'+fact.key,previous=factsByKey.get(key);
    if(previous&&previous.value!==fact.value)warn('FACT_CONFLICT_CANDIDATE',{ids:[previous.id,fact.id],subject:fact.subject,key:fact.key,
      note:'同一属性出现不同有效值：可能是状态变化或错误，须按正文时间线核查'});
    factsByKey.set(key,fact);
  }
  for(const f of ledger.foreshadowing){
    checkEntry(f,'foreshadowing');
    if(!['open','paid','dropped'].includes(f.status)||typeof f.description!=='string'||!f.description.trim())
      throw new Error('INVALID_FORESHADOWING_'+f.id);
    if(f.chapter<=upto&&f.status==='paid'&&(!Number.isSafeInteger(f.payoffChapter)||f.payoffChapter<f.chapter||f.payoffChapter>upto))
      warn('FORESHADOW_PAYOFF_MISMATCH',{id:f.id});
    if(f.chapter<=upto && f.status==='open' && upto-f.chapter>=10)
      warn('LONG_OPEN_FORESHADOW',{id:f.id,age:upto-f.chapter,note:'长期未兑现不一定错误，审查是否有追踪计划'});
  }
  for(const rel of ledger.relationships){
    checkEntry(rel,'relationships');
    if(!Array.isArray(rel.characters)||rel.characters.length<2||
       typeof rel.change!=='string'||!rel.change.trim()||
       typeof rel.consequence!=='string'||!rel.consequence.trim())
      throw new Error('INVALID_RELATIONSHIP_'+rel.id);
  }
  const mechanismSeen=new Map();
  for(const m of ledger.mechanisms){
    checkEntry(m,'mechanisms');
    if(!['goal','strategy','opposition','cost','outcome'].every(k=>typeof m[k]==='string'&&m[k].trim()))
      throw new Error('INVALID_MECHANISM_'+m.id);
    if(m.chapter>upto)continue;
    const fingerprint=[m.goal,m.strategy,m.opposition,m.cost,m.outcome].map(x=>x.replace(/\s+/g,'').toLowerCase()).join('|');
    const prior=mechanismSeen.get(fingerprint);
    if(prior)warn('MECHANISM_LITERAL_REPEAT',{ids:[prior.id,m.id],chapters:[prior.chapter,m.chapter],
      note:'仅识别描述字段的字面重复，换皮剧情仍需独立编辑做语义审查'});
    else mechanismSeen.set(fingerprint,m);
  }
  const complete=plan.chapters.filter(c=>c.chapterNumber<=upto&&c.status==='completed');
  const tracked=new Set(ledger.mechanisms.filter(m=>m.chapter<=upto).map(m=>m.chapter));
  if(handoff){
    if(complete.length!==upto)throw new Error('HANDOFF_CHAPTERS_NOT_COMPLETED');
    if(ledger.handoffs!==undefined&&!Array.isArray(ledger.handoffs))throw new Error('INVALID_HANDOFFS');
    const byChapter=new Map();
    for(const item of ledger.handoffs??[]){
      if(!item||!Number.isSafeInteger(item.chapter)||!known.has(item.chapter)||byChapter.has(item.chapter)||
        !hasText(item.asOf)||
        !Array.isArray(item.events)||item.events.length===0||item.events.some(e=>!hasText(e?.when)||!hasText(e?.event))||
        !Array.isArray(item.knowledge)||item.knowledge.some(k=>!hasText(k?.character)||!hasText(k?.change)))
        throw new Error('HANDOFF_INVALID_CHAPTER_'+(item?.chapter??'UNKNOWN'));
      byChapter.set(item.chapter,item);
    }
    for(let n=1;n<=upto;n++){
      if(!byChapter.has(n))throw new Error('HANDOFF_MISSING_CHAPTER_'+n);
      if(!tracked.has(n))throw new Error('HANDOFF_MISSING_MECHANISM_'+n);
    }
    // Resolve changes as of the last completed chapter, never from a future entry.
    const visible=new Map(ledger.facts.filter(f=>f.chapter<=upto).map(f=>[f.id,f]));
    const positions=new Map(ledger.facts.map((f,i)=>[f.id,i]));
    const factKey=f=>JSON.stringify([f.kind,f.subject,f.key]);
    for(const f of visible.values()){
      if(!f.supersededBy)continue;
      const index=positions.get(f.supersededBy),replacement=ledger.facts[index];
      if(!replacement||replacement.chapter<f.chapter||factKey(replacement)!==factKey(f)||
        (replacement.chapter===f.chapter&&index<=positions.get(f.id)))
        throw new Error('HANDOFF_INVALID_SUPERSESSION_'+f.id);
    }
    const superseded=f=>visible.has(f.supersededBy);
    const factView=({id,chapter,kind,subject,key,value,evidence})=>({id,chapter,kind,subject,key,value,evidence});
    const global=new Map();
    for(const f of visible.values()){
      if(f.scope!=='global'||f.kind==='provisional'||superseded(f))continue;
      const key=factKey(f),previous=global.get(key);
      if(previous&&previous.value!==f.value)throw new Error('HANDOFF_CONFLICTING_GLOBAL_FACT_'+f.id);
      global.set(key,f);
    }
    const baselineFacts=[...global.values()], baselineIds=new Set(baselineFacts.map(f=>f.id));
    const historyAnchors=[];
    for(const id of anchors){
      const f=visible.get(id);
      if(!f)throw new Error('HANDOFF_ANCHOR_NOT_AVAILABLE_'+id);
      if(!baselineIds.has(id))historyAnchors.push({...factView(f),superseded:superseded(f)});
    }
    const item=byChapter.get(upto);
    const lastHandoff=item?{chapter:item.chapter,events:item.events.map(({when,event})=>({when,event})),
      knowledge:item.knowledge.map(({character,change})=>({character,change})),
      relationships:ledger.relationships.filter(r=>r.chapter===upto)
        .map(({characters,change,consequence})=>({characters,change,consequence}))}:null;
    const baseline={asOf:item?.asOf??null,facts:baselineFacts.map(factView)};
    console.log(JSON.stringify({status:'ready',upto,baseline,lastHandoff,historyAnchors},null,2));
  }else{
    for(const c of complete.filter(c=>c.chapterNumber>Math.max(0,upto-5))){
      if(!tracked.has(c.chapterNumber))warn('MECHANISM_UNRECORDED',{chapter:c.chapterNumber,note:'本章故事机制尚未录入账本'});
    }
    const bytes=fs.readFileSync(path.join(root,'story-ledger.json'));
    const report={schemaVersion:1,upto,createdAt:new Date().toISOString(),ledgerSha256:sha256(bytes),
      summary:{chaptersReviewed:complete.length,issues:issues.length},issues,
      semanticReviewRequired:['人物的真实动机与关系推进','剧情机制是否仅语义换皮','线索公平性和读者追读动力']};
    if(write){
      const out=path.join(root,'audits','audit-ch'+String(upto).padStart(3,'0')+'.json');
      fs.mkdirSync(path.dirname(out),{recursive:true});
      fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
      report.savedTo=path.relative(root,out);
    }
    console.log(JSON.stringify(report,null,2));
  }
} catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
