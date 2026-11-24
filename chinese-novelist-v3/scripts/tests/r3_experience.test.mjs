import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cmd=fileURLToPath(new URL('../r3_experience.mjs',import.meta.url));
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r3-experience-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {root,lib:path.join(root,'library'),input:path.join(root,'input.json')};
}
const call=(action,dir,...flags)=>spawnSync(process.execPath,[cmd,action,dir,...flags],{encoding:'utf8'});
const ok=r=>{assert.equal(r.status,0,r.stdout+' '+r.stderr);return JSON.parse(r.stdout)};
const bad=(r,pat)=>{assert.equal(r.status,2,r.stdout+' '+r.stderr);assert.match(r.stdout,pat)};
const entry=(id,extra={})=>({schemaVersion:1,id,revision:1,scope:'global',status:'candidate',
  title:'人物主动选择',method:'保留角色实际选择，不用误会强推剧情。',applicability:'人物弧',
  cautions:'反例：无实际代价时，不必增加牺牲桥段。',changeReason:'卷末回顾候选',
  tags:['人物','选择'],evidence:[{projectId:'book-a',kind:'self_observation',source:'review/1',
    observation:'待验证的经验'}],...extra});
function write(f,e,expected=0,project){
  fs.writeFileSync(f.input,JSON.stringify(e));
  return call('upsert',f.lib,'--input',f.input,'--expected',String(expected),...(project?['--project-id',project]:[]));
}
const strong=(projectId='book-a')=>[{projectId,kind:'independent_review',source:'review/2',
  observation:'有明确的编辑原文证据，但仍不是客观文学证明'}];
test('P1-08: candidate not injected by default; maturity needs evidence; update replaces same identity',t=>{
  const f=setup(t),e=entry('choice');
  ok(write(f,e));
  assert.equal(ok(call('search',f.lib,'--query','人物')).entries.length,0);
  assert.equal(ok(call('search',f.lib,'--query','人物','--include-candidates')).entries.length,1);
  bad(write(f,{...e,revision:2,status:'supported'},1),/NOT_SUPPORTED/);
  bad(write(f,{...e,revision:2,status:'mature',evidence:strong()},1),/NOT_MATURE/);
  const v2={...e,revision:2,status:'supported',method:'只有选择有真实代价时才值得放大。',
    evidence:strong(),changeReason:'独立编辑支持'};
  ok(write(f,v2,1));
  bad(write(f,v2,1),/VERSION_CONFLICT/);
  const hit=ok(call('search',f.lib,'--query','选择')).entries;
  assert.equal(hit.length,1);assert.equal(hit[0].entry.revision,2);
  assert.equal(hit[0].entry.method,v2.method);
  const v3={...v2,revision:3,status:'retired',changeReason:'后续反例显示适用范围过窄'};
  ok(write(f,v3,2));
  assert.equal(ok(call('search',f.lib,'--query','选择','--include-candidates')).entries.length,0);
  assert.equal(ok(call('index',f.lib)).withdrawn[0].revision,3);
  bad(write(f,{...v3,revision:4,status:'supported'},3),/RETIRED_USE_NEW_ID/);
});
test('P1-08: same character/theme in separate project scopes cannot leak via search, direct get or export',t=>{
  const f=setup(t);
  const a=entry('a-same',{scope:'project',projectId:'book-a',status:'supported',evidence:strong('book-a')});
  const b=entry('b-same',{scope:'project',projectId:'book-b',status:'supported',evidence:strong('book-b')});
  bad(write(f,a),/SCOPE_DENIED/);ok(write(f,a,0,'book-a'));ok(write(f,b,0,'book-b'));
  assert.equal(ok(call('search',f.lib,'--query','选择')).entries.length,0);
  assert.deepEqual(ok(call('search',f.lib,'--query','选择','--project-id','book-a')).entries.map(x=>x.entry.id),['a-same']);
  bad(call('get',f.lib,'--id','b-same','--project-id','book-a'),/SCOPE_DENIED/);
  bad(write(f,{...a,scope:'global',projectId:null,revision:2},1,'book-a'),/SCOPE_IMMUTABLE/);
  const dest=path.join(f.root,'export-a');ok(call('export',f.lib,'--out',dest,'--project-id','book-a'));
  assert.deepEqual(fs.readdirSync(dest).sort(),['a-same.md','manifest.json']);
});
test('P1-08: portable Markdown export preserves revisions and rejects tampering; restore is independently usable',t=>{
  const f=setup(t),e=entry('choice');ok(write(f,e));
  const v2={...e,revision:2,status:'mature',evidence:[...strong('book-a'),...strong('book-b')],
    changeReason:'两个作品的独立观察'};
  ok(write(f,v2,1));
  const exported=path.join(f.root,'export'),restored=path.join(f.root,'restored');
  ok(call('export',f.lib,'--out',exported,'--all'));
  assert.equal(ok(call('verify',exported)).files,2);
  ok(call('restore',exported,'--out',restored));
  assert.deepEqual(ok(call('get',restored,'--id','choice')).entry,v2);
  const restoredFixture={...f,lib:restored};ok(write(restoredFixture,{...v2,revision:3,changeReason:'后续修订'},2));
  bad(call('restore',exported,'--out',restored),/RESTORE_NEW_DIRECTORY_REQUIRED/);
  fs.appendFileSync(path.join(exported,'.history','choice-v1.md'),'tamper');
  bad(call('verify',exported),/MARKDOWN_CHANGED|HASH_MISMATCH/);
});
test('P1-08: optional remote sync receipt must match current local source; unavailable remains nonblocking',t=>{
  const f=setup(t),e=entry('choice',{status:'supported',evidence:strong()});
  ok(write(f,e));const ix=ok(call('index',f.lib)).entries[0];
  const receipt={id:'choice',revision:1,sourceSha256:ix.sha256,provider:'notebook',status:'verified',
    remoteId:'fixture-only',observedRevision:1,observedSourceSha256:ix.sha256,detail:'测试宿主声明'};
  fs.writeFileSync(f.input,JSON.stringify({...receipt,observedRevision:0}));
  bad(call('receipt',f.lib,'--input',f.input),/SYNC_RECEIPT_INVALID/);
  fs.writeFileSync(f.input,JSON.stringify(receipt));
  assert.equal(ok(call('receipt',f.lib,'--input',f.input)).independentRemoteVerification,false);
  fs.writeFileSync(f.input,JSON.stringify({...receipt,status:'unavailable',remoteId:null,detail:'没有宿主接口'}));
  assert.equal(ok(call('receipt',f.lib,'--input',f.input)).remoteStatus,'unavailable');
  assert.equal(ok(call('search',f.lib,'--query','选择')).entries.length,1);
});
