import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../validate_project.mjs',import.meta.url));
const base=path.resolve(process.env.NOVEL_TEST_TEMP||os.tmpdir());await fs.mkdir(base,{recursive:true});
async function fixture(status='completed',body='正文足够长'){
  const root=await fs.mkdtemp(path.join(base,'novel-validate-'));
  const plan={status:'validating',minWordsPerChapter:3,custom:'保留',chapters:[{chapterNumber:1,title:'回家',filePath:'第01章.md',status,retryCount:2,wordCount:9999,wordCountPass:true}]};
  await fs.writeFile(root+'/02-写作计划.json',JSON.stringify(plan));if(body!==null)await fs.writeFile(root+'/第01章.md',body);
  return {root,plan,read:async()=>JSON.parse(await fs.readFile(root+'/02-写作计划.json','utf8')),close:async()=>{assert.equal(path.dirname(root),base);await fs.rm(root,{recursive:true,force:true});}};
}
function run(f,...args){const r=spawnSync(process.execPath,[cli,f.root,...args,'--json'],{encoding:'utf8'});assert(r.stdout,r.stderr);return {code:r.status,...JSON.parse(r.stdout)};}
const tests=[
  ['passes completed chapters using the existing wordcount script and preserves state',async()=>{const f=await fixture();try{const r=run(f);assert.equal(r.code,0);const p=await f.read();assert.equal(p.chapters[0].wordCount,5);assert.equal(p.chapters[0].validation.status,'passed');assert.equal(p.chapters[0].retryCount,2);assert.equal(p.chapters[0].status,'completed');assert.equal(p.status,'validating');assert.equal(p.custom,'保留');assert.equal(r.tasks.length,0);}finally{await f.close();}}],
  ['combines state and count problems into one worker task without promoting or failing status',async()=>{const f=await fixture('in_progress','字');try{const r=run(f);assert.equal(r.code,1);assert.equal(r.tasks.length,1);assert.deepEqual(r.tasks[0].issues.map(e=>e.type),['STATUS_NOT_FINAL','WORD_COUNT_LOW']);let p=await f.read();assert.equal(p.chapters[0].status,'in_progress');assert.equal(p.chapters[0].wordCountPass,false);assert.equal(p.chapters[0].wordCount,1);assert.equal(p.chapters[0].validation.status,'failed');run(f);p=await f.read();assert.equal(p.chapters[0].retryCount,2);assert(!('lastError' in p.chapters[0]));}finally{await f.close();}}],
  ['failed is terminal but still needs worker resolution even if words pass',async()=>{const f=await fixture('failed');try{const r=run(f);assert.equal(r.code,1);assert.deepEqual(r.tasks[0].issues.map(e=>e.type),['CHAPTER_FAILED']);assert.equal((await f.read()).chapters[0].wordCountPass,true);}finally{await f.close();}}],
  ['reading failure is a script error rather than zero words or an expansion task',async()=>{const f=await fixture('completed',null);try{const r=run(f);assert.equal(r.code,2);assert.deepEqual(r.tasks[0].issues.map(e=>e.type),['READ_ERROR']);const c=(await f.read()).chapters[0];assert.equal(c.wordCount,null);assert.equal(c.wordCountPass,null);assert.equal(c.validation.status,'error');assert.equal(c.status,'completed');assert.equal(c.retryCount,2);}finally{await f.close();}}],
  ['recheck clears obsolete validation annotations after worker repair',async()=>{const f=await fixture('completed','字');try{assert.equal(run(f).code,1);await fs.writeFile(f.root+'/第01章.md','现在正文已足够');assert.equal(run(f).code,0);assert.deepEqual((await f.read()).chapters[0].validation.issues,[]);}finally{await f.close();}}],
  ['validates only the requested milestone, leaving the future plan untouched',async()=>{const f=await fixture();try{
    const planned={chapterNumber:2,title:'续章',filePath:'第02章.md',status:'pending',retryCount:0};
    f.plan.chapters.push(planned);await fs.writeFile(f.root+'/02-写作计划.json',JSON.stringify(f.plan));
    const pilot=run(f,'--upto','1');assert.equal(pilot.code,0);assert.equal(pilot.summary.total,1);
    const updated=await f.read();assert.deepEqual(updated.chapters[1],planned);
    assert.equal(updated.chapters[0].validation.status,'passed');
    const full=run(f);assert.equal(full.code,2);assert.equal(full.tasks[0].chapterNumber,2);
  }finally{await f.close();}}],
  ['rejects an invalid milestone or a gap in its chapter range without writing',async()=>{const f=await fixture();try{
    const file=f.root+'/02-写作计划.json',original=await fs.readFile(file,'utf8');
    assert.equal(run(f,'--upto','1.5').code,2);assert.equal(run(f,'--upto','2').code,2);
    assert.equal(await fs.readFile(file,'utf8'),original);
  }finally{await f.close();}}],
  ['invalid plans return errors without overwriting the original plan',async()=>{const f=await fixture();try{const original='{broken';await fs.writeFile(f.root+'/02-写作计划.json',original);assert.equal(run(f).code,2);assert.equal(await fs.readFile(f.root+'/02-写作计划.json','utf8'),original);}finally{await f.close();}}],
];
let failures=0;for(const [name,test] of tests){try{await test();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name,e.message);}}console.log(`${tests.length-failures} passed, ${failures} failures`);if(failures)process.exitCode=1;
