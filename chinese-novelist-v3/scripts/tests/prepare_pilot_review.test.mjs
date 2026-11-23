import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../prepare_pilot_review.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'novelist-pilot-'));
try{
  const chapters=[];
  for(let i=1;i<=3;i++){
    fs.writeFileSync(path.join(root,'c'+i+'.md'),'正文'+i);
    chapters.push({chapterNumber:i,filePath:'c'+i+'.md',status:'completed',wordCountPass:true});
  }
  const plan={chapters,v3:{schemaVersion:1,storyPlanApproved:true,pilotGate:{status:'pending',revision:0}}};
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify(plan));
  const r=spawnSync(process.execPath,[script,root,'--json'],{encoding:'utf8'});
  assert.equal(r.status,0);
  const parsed=JSON.parse(r.stdout);
  assert.equal(parsed.chapters.length,3);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json'))).v3.pilotGate.status,'under_review');
  assert.ok(fs.existsSync(path.join(root,parsed.reviewInput)));
  console.log('PASS pilot review preparer: 4 assertions');
}finally{fs.rmSync(root,{recursive:true,force:true});}
