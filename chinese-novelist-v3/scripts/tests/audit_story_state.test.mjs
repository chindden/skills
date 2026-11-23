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
  console.log('PASS story state audit');
}finally{fs.rmSync(root,{recursive:true,force:true});}
