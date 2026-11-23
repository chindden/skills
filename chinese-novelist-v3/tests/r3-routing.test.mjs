import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const init = path.join(scripts, 'init_v3_state.mjs');
const gate = path.join(scripts, 'v3_gate.mjs');
const read = dir => JSON.parse(fs.readFileSync(path.join(dir,'02-写作计划.json'),'utf8'));
const basePlan = () => ({novelName:'R3 routing fixture', chapters:[{chapterNumber:1,filePath:'chapters/001.md',status:'pending'}]});

function fixture(t, state) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r3-route-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const plan=basePlan();
  if(state!==undefined)plan.v3=state;
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify(plan,null,2)+'\n');
  return root;
}
function cli(script,root,...args){
  const run=spawnSync(process.execPath,[script,root,...args],{encoding:'utf8'});
  if(run.error)throw run.error;
  let response=null;
  try{response=JSON.parse(run.stdout)}catch{throw new Error('Unexpected CLI output: '+run.stdout+' / '+run.stderr)}
  return {code:run.status,response,stderr:run.stderr};
}

test('default project initialization remains R2 and never silently enables R3',t=>{
  const root=fixture(t);
  const a=cli(init,root,'--json');
  assert.equal(a.code,0);
  assert.equal(a.response.status,'initialized');
  const plan=read(root);
  assert.equal(plan.v3.schemaVersion,1);
  assert.equal(Object.hasOwn(plan.v3,'r3'),false);
  assert.equal(plan.v3.storyPlanApproved,false);
  const g=cli(gate,root,'--chapter','1','--json');
  assert.equal(g.code,1);
  assert.ok(g.response.issues.some(i=>i.code==='CREATIVE_NOT_APPROVED'));
  assert.equal(g.response.issues.some(i=>i.code==='R3_CORE_NOT_APPROVED'),false);
});

test('new experimental project initializes in isolated namespace with no approvals',t=>{
  const root=fixture(t);
  const a=cli(init,root,'--enable-r3','--json');
  assert.equal(a.code,0);
  assert.equal(a.response.mode,'r3-experimental');
  const plan=read(root);
  assert.equal(plan.v3.schemaVersion,1);
  assert.equal(plan.v3.storyPlanApproved,false);
  assert.equal(plan.v3.r3.schemaVersion,1);
  assert.equal(plan.v3.r3.mode,'experimental');
  assert.equal(plan.v3.r3.status,'bootstrap');
  assert.equal(plan.v3.r3.reviewPolicy,'every_chapter');
  assert.equal(plan.v3.r3.corePlan.status,'pending');
  assert.deepEqual(plan.v3.r3.volumeCheckpoints,{});
  const g=cli(gate,root,'--chapter','1','--json');
  assert.equal(g.code,1);
  assert.deepEqual(g.response.issues.map(i=>i.code),['R3_CORE_NOT_APPROVED']);
  const fin=cli(gate,root,'--finalize','1','--json');
  assert.equal(fin.code,1);
  assert.deepEqual(fin.response.issues.map(i=>i.code),['R3_CORE_NOT_APPROVED']);
});

test('opt-in does not reuse R2 author approval or overwrite historical fields',t=>{
  const prior={schemaVersion:1,creativeDecision:'accepted',storyPlanApproved:true,
    planGate:{schemaVersion:1,status:'passed',approvalSha256:'legacy-hash'},
    pilotGate:{status:'passed',humanApproved:true}};
  const root=fixture(t,prior);
  const before=read(root).v3;
  const a=cli(init,root,'--enable-r3','--json');
  assert.equal(a.code,0);
  assert.deepEqual(a.response.added,['r3']);
  const after=read(root).v3;
  for(const key of Object.keys(before))assert.deepEqual(after[key],before[key]);
  assert.equal(after.r3.corePlan.status,'pending');
  assert.equal(cli(gate,root,'--chapter','1','--json').response.issues[0].code,'R3_CORE_NOT_APPROVED');
  const bytes=fs.readFileSync(path.join(root,'02-写作计划.json'));
  assert.equal(cli(init,root,'--enable-r3','--json').response.status,'unchanged');
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),bytes);
});

test('malformed R3 namespace is rejected rather than silently repaired or bypassed',t=>{
  const root=fixture(t,{schemaVersion:1,creativeDecision:'accepted',storyPlanApproved:true,r3:null});
  const before=fs.readFileSync(path.join(root,'02-写作计划.json'));
  const a=cli(init,root,'--enable-r3','--json');
  assert.equal(a.code,2);
  assert.equal(a.response.error,'R3_STATE_INVALID');
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),before);
  const g=cli(gate,root,'--chapter','1','--json');
  assert.equal(g.code,1);
  assert.equal(g.response.issues[0].code,'R3_STATE_INVALID');
});

test('unsupported V3 schema is not silently migrated',t=>{
  const root=fixture(t,{schemaVersion:2,creativeDecision:'accepted',storyPlanApproved:true});
  const before=fs.readFileSync(path.join(root,'02-写作计划.json'));
  const a=cli(init,root,'--enable-r3','--json');
  assert.equal(a.code,2);
  assert.match(a.response.error,/unsupported v3 schemaVersion/);
  assert.deepEqual(fs.readFileSync(path.join(root,'02-写作计划.json')),before);
});

test('legacy explicit flags and unknown-flag protection remain functional',t=>{
  const root=fixture(t,{schemaVersion:1,creativeDecision:'pending',storyPlanApproved:false});
  const a=cli(init,root,'--enable-plan-gate','--enable-r2','--json');
  assert.equal(a.code,0);
  assert.deepEqual(a.response.added,['r2','planGate']);
  assert.equal(Object.hasOwn(read(root).v3,'r3'),false);
  const bad=cli(init,root,'--unknown-flag','--json');
  assert.equal(bad.code,2);
  assert.match(bad.response.error,/Usage/);
});
