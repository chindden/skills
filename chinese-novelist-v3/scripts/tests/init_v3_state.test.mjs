import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../init_v3_state.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-init-'));
try{
  const plan={version:1,novelName:'测试小说',minWordsPerChapter:3000,chapters:[{chapterNumber:1,filePath:'c1.md',status:'pending'}],extra:'preserved'};
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify(plan));
  const run=()=>spawnSync(process.execPath,[script,root,'--json'],{encoding:'utf8'});
  assert.equal(run().status,0);
  let changed=JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json')));
  assert.equal(changed.extra,'preserved');
  assert.equal(changed.v3.pilotGate.humanApproved,false);
  assert.equal(changed.v3.creativeDecision,'pending');
  assert.equal(run().status,0);
  changed=JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json')));
  assert.equal(changed.v3.pilotGate.revision,0);
  assert.ok(fs.existsSync(path.join(root,'story-ledger.json')));
  console.log('PASS v3 state init');
}finally{fs.rmSync(root,{recursive:true,force:true});}
