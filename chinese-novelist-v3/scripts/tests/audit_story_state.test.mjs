import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const cmd=fileURLToPath(new URL('../audit_story_state.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-ledger-audit-'));
try{
  const chapters=Array.from({length:5},(_,i)=>({chapterNumber:i+1,filePath:'c'+(i+1)+'.md',status:'completed'}));
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify({chapters}));
  const m=(id,chapter)=>({id,chapter,goal:'阻止绑架',strategy:'与守卫谈判',opposition:'守卫拒绝',cost:'暴露身份',outcome:'双方妥协'});
  const ledger={schemaVersion:1,facts:[
    {id:'F1',chapter:1,kind:'established',subject:'钥匙',key:'归属',value:'甲',evidence:'第一章'},
    {id:'F2',chapter:4,kind:'established',subject:'钥匙',key:'归属',value:'乙',evidence:'第四章'}
  ],foreshadowing:[{id:'P1',chapter:2,status:'open',description:'三次敲钟'}],relationships:[],mechanisms:[m('M1',1),m('M2',4)]};
  fs.writeFileSync(path.join(root,'story-ledger.json'),JSON.stringify(ledger));
  const r=spawnSync(process.execPath,[cmd,root,'--upto','5','--write','--json'],{encoding:'utf8'});
  assert.equal(r.status,0);
  const j=JSON.parse(r.stdout);
  assert.ok(j.issues.some(x=>x.code==='FACT_CONFLICT_CANDIDATE'));
  assert.ok(j.issues.some(x=>x.code==='MECHANISM_LITERAL_REPEAT'));
  assert.ok(fs.existsSync(path.join(root,'audits/audit-ch005.json')));
  const twice=spawnSync(process.execPath,[cmd,root,'--upto','5','--write'],{encoding:'utf8'});
  assert.equal(twice.status,2,'audit snapshots are immutable');
  const run=(n,...args)=>{
    const result=spawnSync(process.execPath,[cmd,root,'--upto',String(n),'--handoff',...args],{encoding:'utf8'});
    return {code:result.status,data:JSON.parse(result.stdout)};
  };
  const ledgerFile=path.join(root,'story-ledger.json');
  const save=()=>fs.writeFileSync(ledgerFile,JSON.stringify(ledger));
  const first=run(0);
  assert.equal(first.code,0,'first chapter has no previous handoff');
  assert.equal(first.data.lastHandoff,null);
  assert.deepEqual(first.data.baseline,{asOf:null,facts:[]});
  assert.equal(run(1).data.error,'HANDOFF_MISSING_CHAPTER_1');
  ledger.handoffs=[{chapter:1,asOf:'D+0 19:00',events:[{when:'D+0 19:00',event:'甲收到钥匙'}],
    knowledge:[{character:'甲',change:'已知钥匙在自己手里'}]}];
  save();
  assert.equal(run(1).code,0);
  assert.equal(run(1).data.baseline.asOf,ledger.handoffs[0].asOf);
  assert.ok(!JSON.stringify(run(1).data).includes('第四章'),'future facts are not in the prewrite packet');
  assert.equal(run(2).data.error,'HANDOFF_MISSING_CHAPTER_2');
  const next={chapter:2,asOf:'D+1 08:30',events:[{when:'D+1 08:30',event:'走廊三次敲钟'}],knowledge:[]};
  ledger.handoffs.push(next);
  save();
  assert.equal(run(2).data.error,'HANDOFF_MISSING_MECHANISM_2');
  ledger.mechanisms.push({...m('M3',2),strategy:'守在走廊听动静'});
  ledger.handoffs[1].events[0].when='';
  save();
  assert.equal(run(2).data.error,'HANDOFF_INVALID_CHAPTER_2');
  ledger.handoffs[1].events[0].when='D+1 08:30';
  save();
  const sealed=fs.readFileSync(ledgerFile,'utf8');
  assert.deepEqual(run(2).data.lastHandoff.events,next.events);
  assert.equal(fs.readFileSync(ledgerFile,'utf8'),sealed,'handoff checks are read-only');
  assert.equal(run(2,'--write').code,2);
  const f=(id,chapter,subject,key,value,extra={})=>({id,chapter,kind:'established',subject,key,value,evidence:'原文证据',...extra});
  ledger.facts.push(
    f('WORLD',0,'旧楼','销户规则','销户需现场确认',{scope:'global'}),
    f('DATE',1,'停气','日期','周二'),
    f('OLD',1,'值班单','状态','未提交',{scope:'global',supersededBy:'NOW'}),
    f('NOW',2,'值班单','状态','已登记',{scope:'global',supersededBy:'FUTURE'}),
    f('FUTURE',3,'值班单','状态','未来注销',{scope:'global'}),
    f('KNOWN',2,'乙','知情','怀疑值班单被换',{scope:'global',kind:'character-belief'})
  );
  ledger.relationships.push({id:'REL',chapter:2,characters:['甲','乙'],change:'共同保管',consequence:'需双方到场'});
  save();
  assert.deepEqual(run(0).data.baseline.facts.map(f=>f.id),['WORLD']);
  assert.deepEqual(run(1).data.baseline.facts.map(f=>f.id),['WORLD','OLD']);
  const packet=run(2,'--anchor','DATE','--anchor','OLD');
  assert.equal(packet.code,0);
  assert.equal(packet.data.baseline.asOf,next.asOf);
  assert.deepEqual(packet.data.baseline.facts.map(f=>f.id),['WORLD','NOW','KNOWN']);
  assert.equal(packet.data.baseline.facts[2].kind,'character-belief');
  assert.equal(packet.data.lastHandoff.relationships[0].change,'共同保管');
  assert.deepEqual(packet.data.historyAnchors.map(f=>[f.id,f.superseded]),[['DATE',false],['OLD',true]]);
  assert.equal(run(2,'--anchor','FUTURE').data.error,'HANDOFF_ANCHOR_NOT_AVAILABLE_FUTURE');
  assert.equal(run(2,'--anchor','UNKNOWN').code,2);
  const historical=ledger.facts.find(f=>f.id==='OLD');
  historical.supersededBy='DATE';
  save();
  assert.equal(run(2).data.error,'HANDOFF_INVALID_SUPERSESSION_OLD');
  historical.supersededBy='NOW';
  const duplicate=f('CONFLICT',2,'值班单','状态','已注销',{scope:'global'});
  ledger.facts.push(duplicate);
  save();
  assert.equal(run(2).data.error,'HANDOFF_CONFLICTING_GLOBAL_FACT_CONFLICT');
  ledger.facts.pop();
  ledger.facts.push({id:'R0-SHAPE',chapter:3,type:'established',summary:'R0-style unstructured fact'});
  save();
  assert.equal(run(3).data.error,'INVALID_FACT_R0-SHAPE');
  const runbook=fs.readFileSync(new URL('../../references/v3/operational-runbook.md',import.meta.url),'utf8');
  const documented=JSON.parse(runbook.match(/\x60\x60\x60json\n([\s\S]*?)\n\x60\x60\x60/)[1]);
  fs.writeFileSync(ledgerFile,JSON.stringify(documented));
  assert.equal(run(1).code,0,'the writer-facing example follows the actual contract');
  chapters[1].status='pending';
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify({chapters}));
  assert.equal(run(2).data.error,'HANDOFF_CHAPTERS_NOT_COMPLETED');
  console.log('PASS story state audit');
}finally{fs.rmSync(root,{recursive:true,force:true});}
