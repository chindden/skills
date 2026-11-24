#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {splitR3Markdown,inspectR3Plan} from '../r3_plan_sections.mjs';

const human = '# 人物档案\n## 核心人设\n主角有代价和私心。\n## 动态状态与远期弧线\n未来变化保持弹性。\n';
const outline = '# 长篇大纲\n## 核心契约\n故事承诺是经营与修仙耦合；终局须收回失落灵脉。\n### 规则边界\n鉴微不能读心。\n## 滚动卷纲\n### 第1卷\n卷一细纲：开办灵米坊。\n#### 弧一\n矛盾升级。\n### 第2卷\n卷二暂定：扩张青溪坊。\n### 第3卷\n卷三待定：探寻暗渠。\n';
const style = '# 文风\n## 文风指纹\n以人物行为推进叙事，保留烟火气。\n## 本书校准段落\n';
const parse = (text=outline,filename='01-大纲.md') => splitR3Markdown(filename,text);
function project(t,withR3=true){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r3-sections-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const plan={novelName:'试读样本',chapters:[{chapterNumber:1,filePath:'第1章.md'}]};
  if(withR3)plan.v3={schemaVersion:1,r3:{schemaVersion:1,mode:'experimental'}};
  for(const [name,text] of [['00-人物档案.md',human],['01-大纲.md',outline],['03-文风基准.md',style]])
    fs.writeFileSync(path.join(dir,name),text);
  fs.writeFileSync(path.join(dir,'02-写作计划.json'),JSON.stringify(plan));
  return dir;
}
test('split title/core/rolling, preserving per-volume text and SHA-256',()=>{
  const s=parse();
  assert.equal(s.filename,'01-大纲.md');
  assert.equal(s.volumes.length,3);
  assert.deepEqual(s.volumes.map(x=>x.volId),[1,2,3]);
  assert.ok(s.core.startsWith('# 长篇大纲'));
  assert.ok(s.core.includes('鉴微不能读心'));
  assert.ok(!s.core.includes('卷一细纲'));
  assert.ok(s.rolling.startsWith('## 滚动卷纲'));
  assert.match(s.volumes[0].text,/^### 第1卷/);
  assert.match(s.volumes[0].text,/#### 弧一/);
  assert.match(s.volumes[2].text,/卷三待定/);
  assert.match(s.coreSha256,/^[a-f0-9]{64}$/);
});
test('future changes alter volume fingerprint only; changing core, title or moving its text changes core fingerprint',()=>{
  const base=parse();
  const future=parse(outline.replace('探寻暗渠','联手挖渠'));
  assert.equal(future.coreSha256,base.coreSha256);
  assert.equal(future.volumes[0].sha256,base.volumes[0].sha256);
  assert.notEqual(future.volumes[2].sha256,base.volumes[2].sha256);
  assert.notEqual(parse(outline.replace('不能读心','不可读心')).coreSha256,base.coreSha256);
  assert.notEqual(parse(outline.replace('# 长篇大纲','# 修订大纲')).coreSha256,base.coreSha256);
  const moved=parse(outline.replace('鉴微不能读心。\n','').replace('卷二暂定：','鉴微不能读心。卷二暂定：'));
  assert.notEqual(moved.coreSha256,base.coreSha256);
});
test('00 and 03 partition correctly and permit empty mutable calibration',()=>{
  const p=splitR3Markdown('00-人物档案.md',human);
  const s=splitR3Markdown('03-文风基准.md',style);
  assert.match(p.core,/主角有代价/);
  assert.match(p.rolling,/未来变化/);
  assert.equal(p.volumes.length,0);
  assert.equal(s.volumes.length,0);
  assert.equal(s.rolling,'## 本书校准段落\n');
  assert.equal(splitR3Markdown('03-文风基准.md',style+'校准更新\n').coreSha256,s.coreSha256);
});
test('core and rolling markers must exist exactly once and in the correct order',()=>{
  assert.throws(()=>parse(outline.replace('## 核心契约\n','')),/R3_SECTION_ANCHORS_INVALID|R3_CORE_ANCHOR_MISSING_OR_ORDER/);
  assert.throws(()=>parse(outline.replace('## 滚动卷纲\n','')),/R3_SECTION_ANCHORS_INVALID/);
  assert.throws(()=>parse(outline.replace('## 核心契约','## 核心契约错误')),/R3_CORE_ANCHOR_MISSING_OR_ORDER/);
  assert.throws(()=>parse(outline.replace('## 滚动卷纲','## 滚动卷纲错误')),/R3_ROLLING_ANCHOR_MISSING_OR_ORDER/);
  assert.throws(()=>parse(outline.replace('## 核心契约\n','## 核心契约\n## 核心契约\n')),/R3_SECTION_ANCHORS_INVALID/);
  assert.throws(()=>parse(outline.replace('## 滚动卷纲\n','## 滚动卷纲\n## 滚动卷纲\n')),/R3_SECTION_ANCHORS_INVALID/);
  const swap=outline.replace('## 核心契约','## TEMP').replace('## 滚动卷纲','## 核心契约').replace('## TEMP','## 滚动卷纲');
  assert.throws(()=>parse(swap),/R3_CORE_ANCHOR_MISSING_OR_ORDER/);
});
test('fail closed on extra headings, missing title, misleading preamble and orphan rolling text',()=>{
  assert.throws(()=>parse(outline.replace('# 长篇大纲\n','')),/R3_TOP_TITLE_MISSING/);
  assert.throws(()=>parse('说明：这是不受审核的文字\n'+outline),/R3_PREAMBLE_NOT_ALLOWED/);
  assert.throws(()=>parse(outline.replace('## 滚动卷纲\n','## 滚动卷纲\n未归属文本\n')),/R3_ROLLING_ORPHAN_CONTENT/);
  assert.throws(()=>parse(outline.replace('### 第2卷','## 第2卷')),/R3_SECTION_ANCHORS_INVALID/);
  assert.throws(()=>parse(outline.replace('卷一细纲','## 额外标题\n卷一细纲')),/R3_SECTION_ANCHORS_INVALID/);
  assert.throws(()=>parse(outline.replace('## 滚动卷纲\n','## 滚动卷纲\n# 伪造顶层标题\n')),/R3_EXTRA_TOP_TITLE/);
});
test('volume boundaries are contiguous and exact, no skipped, repeated or empty volume',()=>{
  assert.throws(()=>parse(outline.replace('### 第2卷','### 第3卷')),/R3_VOLUME_NUMBER_OR_HEADING_INVALID/);
  assert.throws(()=>parse(outline.replace('### 第1卷','### 第0卷')),/R3_VOLUME_NUMBER_OR_HEADING_INVALID/);
  assert.throws(()=>parse(outline.replace('### 第2卷','### 新的剧情弧')),/R3_VOLUME_NUMBER_OR_HEADING_INVALID/);
  assert.throws(()=>parse(outline.replace('卷一细纲：开办灵米坊。\n#### 弧一\n矛盾升级。','')),/R3_VOLUME_CONTENT_EMPTY/);
  assert.throws(()=>parse(outline.split('## 滚动卷纲')[0]+'## 滚动卷纲\n'),/R3_VOLUMES_MISSING/);
});
test('fenced code cannot forge anchors; malformed fences are rejected',()=>{
  const extra='\n```md\n## 滚动卷纲\n### 第999卷\n```\n';
  const withFence=outline.replace('鉴微不能读心。\n','鉴微不能读心。\n'+extra);
  const parts=parse(withFence);
  assert.equal(parts.volumes.length,3);
  assert.notEqual(parts.coreSha256,parse().coreSha256);
  assert.throws(()=>parse(outline.replace('鉴微不能读心。\n','鉴微不能读心。\n```md\n')),/R3_UNCLOSED_CODE_FENCE/);
});
test('HTML comments are disallowed, including hidden anchors and comments in code',()=>{
  assert.throws(()=>parse(outline.replace('## 核心契约','<!-- hidden -->\n## 核心契约')),/R3_HTML_COMMENT_NOT_ALLOWED/);
  assert.throws(()=>parse(outline.replace('卷一细纲','<!-- note -->\n卷一细纲')),/R3_HTML_COMMENT_NOT_ALLOWED/);
});
test('preserves CRLF and rejects unsupported files and empty core',()=>{
  const crlf=parse(outline.replace(/\n/g,'\r\n'));
  assert.equal(crlf.volumes.length,3);
  assert.notEqual(crlf.coreSha256,parse().coreSha256);
  assert.throws(()=>splitR3Markdown('unexpected.md',outline),/R3_UNSUPPORTED_PLAN_FILE/);
  assert.throws(()=>parse(outline.replace('故事承诺是经营与修仙耦合；终局须收回失落灵脉。\n### 规则边界\n鉴微不能读心。\n','')),/R3_CORE_CONTENT_EMPTY/);
});
test('project inspector requires R3 namespace and reads three safe source files',t=>{
  const dir=project(t);
  const result=inspectR3Plan(dir);
  assert.equal(Object.keys(result).length,3);
  assert.equal(result['01-大纲.md'].volumes.length,3);
});
test('project inspector rejects R2-only project',t=>{
  const dir=project(t,false);
  assert.throws(()=>inspectR3Plan(dir),/R3_NOT_ENABLED/);
});
test('project inspector fails closed on missing or unsafe file',t=>{
  const dir=project(t);
  fs.rmSync(path.join(dir,'00-人物档案.md'));
  assert.throws(()=>inspectR3Plan(dir),/R3_PLAN_FILE_MISSING_OR_UNSAFE/);
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'r3-outside-'));
  t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
  const original=path.join(dir,'03-文风基准.md');
  fs.rmSync(original);
  const external=path.join(outside,'foreign.md');
  fs.writeFileSync(external,style);
  fs.symlinkSync(external,original);
  assert.throws(()=>inspectR3Plan(dir),/R3_PLAN_FILE_MISSING_OR_UNSAFE/);
});
test('CLI returns structured fingerprints without approving writing',t=>{
  const dir=project(t);
  const script=fileURLToPath(new URL('../r3_plan_sections.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script,dir,'--json'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const data=JSON.parse(run.stdout);
  assert.equal(data.status,'ready');
  assert.equal(data.literaryStatus,'UNVERIFIED');
  assert.equal(data.files['01-大纲.md'].volumes.length,3);
  assert.equal(data.files['00-人物档案.md'].rollingChars>0,true);
});
