import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {renderTheme,parseTheme,buildIndex,renderIndex,parseIndex,resolve,prepare,checkRef,confirmBase,seal,verify,restore} from '../r3_experience_drive.mjs';
const n1='01-character-relation-v1.md',n2='01-character-relation-v2.md',i1='00-INDEX-v1.md',i2='00-INDEX-v2.md';
const evidence={projectId:'book_a',kind:'independent_review',source:'review/1',observation:'原文与反馈：有代价的选择'};
const entry=(id,status='supported')=>({id,title:'人物选择',revision:1,status,scope:'global',tags:['人物','选择'],applicability:'低烈度时慎用',method:'动作 | 选择 _ 对话，保留 C:\\work',cautions:'避免强制5–8章冷却',evidence:[evidence],changeReason:'初次归纳'});
const theme={title:'主题01：人物',entries:[entry('EXP_CR-01'),entry('EXP-CR-02','candidate'),entry('EXP-CR-03','retired')]};
const updated={...theme,entries:[theme.entries[0],{...theme.entries[1],revision:2,status:'supported',changeReason:'新增审稿证据',evidence:[evidence,{...evidence,projectId:'book_b'}]},theme.entries[2]]};
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r3-drive-exp-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'library');fs.mkdirSync(root);fs.mkdirSync(path.join(root,'archive'));fs.mkdirSync(path.join(root,'staging'));
  const put=(name,data)=>fs.writeFileSync(path.join(root,name),data);
  put(n1,renderTheme(theme));put(i1,renderIndex(buildIndex(1,{[n1]:theme})));
  return {root,dir,put};
}
const plan=f=>prepare(f.root,i1,n1,n2,renderTheme(updated),['EXP-CR-02']);
const commit=(f,p)=>{f.put(n2,renderTheme(updated));f.put(i2,p.indexText)};
const archive=f=>{for(const n of [i1,n1])fs.renameSync(path.join(f.root,n),path.join(f.root,'archive',n))};
test('visible structured fields round-trip; actual Docs escaped pipes and underscores do not contaminate IDs',()=>{
  assert.deepEqual(parseTheme(renderTheme(theme)),theme);
  const exported='# 主题 01：人物\n\n## EXP-CR-05 \\| 沉默替代辩白法 \\| v2 \\| supported\n\n- **标签**：人物,对话  \n- **适用条件**：误解冲突  \n- **核心方法**：回应 \\+ 行动  \n- **慎用与反例**：\\<500字  \n- **验证证据**：单次观察\n';
  const e=parseTheme(exported,{experimental:true}).entries[0];
  assert.equal(e.id,'EXP-CR-05');assert.equal(e.title,'沉默替代辩白法');assert.equal(e.revision,2);assert.equal(e.fields['核心方法'],'回应 + 行动');assert.equal(e.unverified,true);
  assert.throws(()=>parseTheme(exported),/DRIVE_EXP_FIELDS/);
  const ix=buildIndex(1,{[n1]:theme});assert.deepEqual(parseIndex(renderIndex(ix)),ix);
});
test('strict evidence, maturity, visible field completeness, global scope and unique identity',()=>{
  assert.throws(()=>renderTheme({...theme,entries:[{...entry('A','mature')}]}),/NOT_MATURE/);
  assert.throws(()=>renderTheme({...theme,entries:[{...entry('A'),scope:'project'}]}),/INVALID/);
  assert.throws(()=>renderTheme({...theme,entries:[{...entry('A'),evidence:[{...evidence,kind:'self_observation'}]}]}),/NOT_SUPPORTED/);
  assert.throws(()=>renderTheme({...theme,entries:[entry('A'),entry('A')]}),/DUP_ID/);
  assert.throws(()=>parseTheme(renderTheme(theme).replace(/- \*\*修订原因\*\*：[^\n]+\n/,'')),/FIELDS/);
  assert.throws(()=>buildIndex(1,{[n1]:theme,'02-other-v1.md':theme}),/DUP_ID/);
});
test('selective reading excludes candidate and retired; fails on stale index metadata or theme',t=>{
  const f=fixture(t),r=resolve(f.root);
  assert.deepEqual(r.usable.map(e=>e.id),['EXP_CR-01']);
  const ix=renderIndex(r.index);
  assert.equal(checkRef(ix,n1,renderTheme(theme)).entries.length,1);
  assert.throws(()=>checkRef(ix,n2,renderTheme(updated)),/UNPUBLISHED/);
  assert.throws(()=>checkRef(ix,n1,renderTheme(updated)),/INCONSISTENT/);
  const wrong={...r.index,entries:r.index.entries.map(e=>({...e,revision:9}))};
  assert.throws(()=>checkRef(renderIndex(wrong),n1,renderTheme(theme)),/INCONSISTENT/);
});
test('A/B/C/D: prepare is read-only, missing entry or unrelated edit refused, staged or moved candidate cannot publish itself',t=>{
  const f=fixture(t),p=plan(f);
  assert.equal(resolve(f.root).name,i1);
  const broken={...updated,entries:updated.entries.slice(0,2)};
  assert.throws(()=>prepare(f.root,i1,n1,n2,renderTheme(broken),['EXP-CR-02']),/ENTRY_LOST/);
  const unrelated={...updated,entries:[{...updated.entries[0],method:'changed'},...updated.entries.slice(1)]};
  assert.throws(()=>prepare(f.root,i1,n1,n2,renderTheme(unrelated),['EXP-CR-02']),/REVISION/);
  f.put('staging/01-candidate.md',renderTheme(updated));assert.equal(resolve(f.root).name,i1);
  // Exact failure window missing in Gemini D: candidate is already in root but index not created.
  f.put(n2,renderTheme(updated));assert.equal(resolve(f.root).name,i1);
  assert.equal(resolve(f.root).index.entries.find(e=>e.id==='EXP-CR-02').status,'candidate');
  confirmBase(f.root,i1,p.baseSha256);
});
test('E/F/G: published version wins before archive; stale base rejected; cleanup keeps complete history',t=>{
  const f=fixture(t),p=plan(f);commit(f,p);
  assert.equal(resolve(f.root).name,i2);assert.equal(resolve(f.root).usable.length,2);
  assert.throws(()=>plan(f),/BASE_CONFLICT/);assert.throws(()=>confirmBase(f.root,i1,p.baseSha256),/BASE_CONFLICT/);
  archive(f);assert.equal(resolve(f.root).name,i2);
  assert.equal(resolve(f.root).themes[n2].entries[2].status,'retired');
});
test('bad newest index or missing referenced theme fails closed, never silently resurrects old advice',t=>{
  const f=fixture(t),p=plan(f);f.put(i2,p.indexText);
  assert.throws(()=>resolve(f.root));f.put(n2,renderTheme(updated));assert.equal(resolve(f.root).name,i2);
  f.put(i2,'# R3 经验索引 v2\nbroken');assert.throws(()=>resolve(f.root),/BAD_FIELD/);
});
test('reject revisions without reason, evidence loss, unexpected updates and resurrection',t=>{
  const f=fixture(t);
  const lost={...updated,entries:[theme.entries[0],{...updated.entries[1],evidence:[{...evidence,projectId:'new'}]},theme.entries[2]]};
  assert.throws(()=>prepare(f.root,i1,n1,n2,renderTheme(lost),['EXP-CR-02']),/EVIDENCE_LOST/);
  const resurrected={...theme,entries:[...theme.entries.slice(0,2),{...theme.entries[2],revision:2,status:'supported'}]};
  assert.throws(()=>prepare(f.root,i1,n1,n2,renderTheme(resurrected),['EXP-CR-03']),/REVISION_OR_RETIRED/);
  assert.throws(()=>prepare(f.root,i1,n1,n2,renderTheme(updated),['EXP_CR-01']),/UNEXPECTED_CHANGES/);
  assert.throws(()=>renderTheme({...theme,entries:[{...entry('A'),changeReason:''}]}),/INVALID/);
});
test('complete portable backup verifies manifest, history and rebuilt index; independent restore and tamper detection',t=>{
  const f=fixture(t);commit(f,plan(f));archive(f);
  const m=seal(f.root);assert.equal(m.files.length,4);assert.equal(verify(f.root).entries,3);
  const dst=path.join(f.dir,'restore');assert.equal(restore(f.root,dst).entries,3);
  assert.deepEqual(resolve(dst).index,resolve(f.root).index);
  assert.throws(()=>restore(f.root,dst),/RESTORE_TARGET/);
  fs.appendFileSync(path.join(dst,'archive',n1),'changed');
  assert.throws(()=>verify(dst));
  fs.unlinkSync(path.join(f.root,'archive',i1));assert.throws(()=>verify(f.root),/HISTORY_GAP/);
});
test('unpublished root content or staged data cannot enter clean backup, even if syntactically valid',t=>{
  const f=fixture(t);f.put(n2,renderTheme(updated));assert.throws(()=>seal(f.root),/UNCOMMITTED/);
  fs.unlinkSync(path.join(f.root,n2));f.put('staging/test.md',renderTheme(updated));assert.throws(()=>seal(f.root),/UNCOMMITTED/);
});
