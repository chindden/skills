#!/usr/bin/env node
/** Portable, private Markdown experience library. No mandatory remote service. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256} from './v3_common.mjs';
const fail=x=>{throw new Error(x)},out=x=>console.log(JSON.stringify(x,null,2));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(x);
const text=x=>typeof x==='string'&&!!x.trim();
const evidenceKinds=['self_observation','independent_review','author_feedback','reader_feedback','controlled_comparison'];
function validate(e){
  if(e?.schemaVersion!==1||!id(e.id)||!Number.isSafeInteger(e.revision)||e.revision<1||
    !['global','project'].includes(e.scope)||(e.scope==='project'?!id(e.projectId):e.projectId!=null)||
    !['candidate','supported','mature','retired'].includes(e.status)||
    !['title','method','applicability','cautions','changeReason'].every(k=>text(e[k]))||
    !Array.isArray(e.tags)||!e.tags.every(text)||!Array.isArray(e.evidence)||!e.evidence.length)
    fail('EXPERIENCE_INVALID');
  for(const x of e.evidence)
    if(!id(x.projectId)||!evidenceKinds.includes(x.kind)||!text(x.source)||!text(x.observation)||
      (e.scope==='project'&&x.projectId!==e.projectId))fail('EXPERIENCE_EVIDENCE_INVALID');
  const supported=e.evidence.filter(x=>x.kind!=='self_observation');
  if(['supported','mature'].includes(e.status)&&!supported.length)fail('EXPERIENCE_NOT_SUPPORTED');
  if(e.status==='mature'&&new Set(supported.map(x=>x.projectId)).size<2)fail('EXPERIENCE_NOT_MATURE');
  return e;
}
function markdown(e){
  return '# '+e.title.replace(/[\r\n]/g,' ')+'\n\n'+
    '<!-- r3-experience-v1\n'+JSON.stringify(e,null,2).replace(/-->/g,'--\\u003e')+'\n-->\n\n'+
    '## 方法\n'+e.method+'\n\n## 适用范围\n'+e.applicability+'\n\n## 慎用与反例\n'+e.cautions+
    '\n\n## 证据\n'+e.evidence.map(x=>'- '+x.projectId+' / '+x.kind+' / '+x.source+'：'+x.observation).join('\n')+
    '\n\n## 状态与版本\n'+e.status+' / v'+e.revision+'\n'+e.changeReason+'\n';
}
function read(file){
  const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())fail('EXPERIENCE_UNSAFE_FILE');
  const raw=fs.readFileSync(file,'utf8'),m=raw.match(/<!-- r3-experience-v1\n([\s\S]*?)\n-->/);
  if(!m)fail('EXPERIENCE_METADATA_MISSING');
  const e=validate(JSON.parse(m[1]));
  if(markdown(e)!==raw)fail('EXPERIENCE_MARKDOWN_CHANGED_USE_UPSERT');
  return e;
}
function rootDir(p,create=false){
  const r=path.resolve(p);
  if(create&&!fs.existsSync(r))fs.mkdirSync(r,{recursive:true,mode:0o700});
  if(!fs.lstatSync(r).isDirectory()||fs.lstatSync(r).isSymbolicLink())fail('EXPERIENCE_UNSAFE_DIR');
  return fs.realpathSync(r);
}
const canRead=(e,project)=>e.scope==='global'||e.projectId===project;
const filename=(root,key)=>{if(!id(key))fail('EXPERIENCE_ID_INVALID');return path.join(root,key+'.md')};
function records(root){
  return fs.readdirSync(root,{withFileTypes:true}).filter(f=>f.name.endsWith('.md')).map(f=>{
    const e=read(path.join(root,f.name));if(f.name!==e.id+'.md')fail('EXPERIENCE_FILENAME_MISMATCH');return e;
  }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
function writeExclusive(file,data){fs.writeFileSync(file,data,{flag:'wx',mode:0o600})}
function publish(root,e,expected,project){
  validate(e);if(!canRead(e,project))fail('EXPERIENCE_SCOPE_DENIED');
  const dst=filename(root,e.id),lock=path.join(root,'.write-lock');
  const fd=fs.openSync(lock,'wx',0o600);
  let temp;
  try{
    const exists=fs.existsSync(dst),old=exists?read(dst):null;
    if((old?.revision??0)!==expected||e.revision!==expected+1)fail('EXPERIENCE_VERSION_CONFLICT');
    if(old&&(old.scope!==e.scope||old.projectId!==e.projectId))fail('EXPERIENCE_SCOPE_IMMUTABLE');
    if(old?.status==='retired'&&e.status!=='retired')fail('EXPERIENCE_RETIRED_USE_NEW_ID');
    if(old){
      const dir=path.join(root,'.history');
      if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});
      if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())fail('EXPERIENCE_HISTORY_UNSAFE');
      const prior=path.join(dir,e.id+'-v'+old.revision+'.md'),bytes=fs.readFileSync(dst);
      if(fs.existsSync(prior)){
        if(!fs.lstatSync(prior).isFile()||!fs.readFileSync(prior).equals(bytes))fail('EXPERIENCE_HISTORY_CONFLICT');
      }else writeExclusive(prior,bytes);
    }
    temp=path.join(root,'.tmp-'+randomUUID());
    writeExclusive(temp,markdown(e));fs.renameSync(temp,dst);
  }finally{if(temp&&fs.existsSync(temp))fs.unlinkSync(temp);fs.closeSync(fd);fs.unlinkSync(lock)}
  return {status:'saved',id:e.id,revision:e.revision,scope:e.scope,sha256:sha256(fs.readFileSync(dst))};
}
function inventory(root,project,includeCandidates){
  return records(root).filter(e=>canRead(e,project)&&e.status!=='retired'&&(includeCandidates||e.status!=='candidate'));
}
function pack(root,dst,project,all){
  if(fs.existsSync(dst))fail('EXPERIENCE_EXPORT_EXISTS');
  const realParent=fs.realpathSync(path.dirname(path.resolve(dst)));
  const target=path.join(realParent,path.basename(dst));
  if(target===root||target.startsWith(root+path.sep))fail('EXPERIENCE_EXPORT_OUTSIDE_LIBRARY');
  const entries=records(root).filter(e=>all||canRead(e,project));
  const temp=fs.mkdtempSync(path.join(realParent,'.experience-export-'));
  try{
    const files=[];
    const copy=(src,rel)=>{
      const data=fs.readFileSync(src);
      if(rel.startsWith('.history/')&&!fs.existsSync(path.join(temp,'.history')))fs.mkdirSync(path.join(temp,'.history'));
      writeExclusive(path.join(temp,rel),data);files.push({path:rel,sha256:sha256(data),bytes:data.length});
    };
    for(const e of entries){
      copy(filename(root,e.id),e.id+'.md');
      for(let n=1;n<e.revision;n++){
        const rel='.history/'+e.id+'-v'+n+'.md',src=path.join(root,rel);
        const old=read(src);if(old.id!==e.id||old.revision!==n||old.scope!==e.scope||old.projectId!==e.projectId)
          fail('EXPERIENCE_HISTORY_INVALID');
        copy(src,rel);
      }
    }
    writeExclusive(path.join(temp,'manifest.json'),JSON.stringify({schemaVersion:1,kind:'r3-experience-export',files},null,2)+'\n');
    verifyPack(temp);
    if(fs.existsSync(target))fail('EXPERIENCE_EXPORT_EXISTS');
    fs.renameSync(temp,target);return {status:'exported',entries:entries.length,files:files.length,directory:target};
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true})}
}
function verifyPack(root){
  const manifestFile=path.join(root,'manifest.json');
  if(!fs.lstatSync(manifestFile).isFile())fail('EXPERIENCE_MANIFEST_UNSAFE');
  const m=JSON.parse(fs.readFileSync(manifestFile,'utf8')),seen=new Set();
  if(m?.schemaVersion!==1||m.kind!=='r3-experience-export'||!Array.isArray(m.files))fail('EXPERIENCE_MANIFEST_INVALID');
  for(const f of m.files){
    if(!/^(?:[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.md|\.history\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}-v[1-9]\d*\.md)$/.test(f.path)||seen.has(f.path))
      fail('EXPERIENCE_MANIFEST_PATH_INVALID');
    seen.add(f.path);const p=path.join(root,f.path);read(p);
    const b=fs.readFileSync(p);if(b.length!==f.bytes||sha256(b)!==f.sha256)fail('EXPERIENCE_EXPORT_HASH_MISMATCH');
  }
  const entries=records(root),expected=new Set();
  for(const e of entries){
    expected.add(e.id+'.md');
    for(let n=1;n<e.revision;n++){
      const rel='.history/'+e.id+'-v'+n+'.md';expected.add(rel);
      const old=read(path.join(root,rel));
      if(old.id!==e.id||old.revision!==n||old.scope!==e.scope||old.projectId!==e.projectId)fail('EXPERIENCE_HISTORY_INVALID');
    }
  }
  if(expected.size!==seen.size||[...expected].some(x=>!seen.has(x)))fail('EXPERIENCE_EXPORT_FILE_SET_MISMATCH');
  const physical=fs.readdirSync(root).filter(x=>x!=='manifest.json'&&x!=='.history');
  if(physical.some(x=>!seen.has(x)))fail('EXPERIENCE_EXPORT_EXTRA_FILE');
  const history=path.join(root,'.history');
  if(fs.existsSync(history)){
    if(!fs.lstatSync(history).isDirectory()||fs.lstatSync(history).isSymbolicLink())fail('EXPERIENCE_HISTORY_UNSAFE');
    if(fs.readdirSync(history).some(x=>!seen.has('.history/'+x)))fail('EXPERIENCE_EXPORT_EXTRA_HISTORY');
  }
  return {status:'verified',entries:entries.length,files:seen.size};
}
try{
  const [action,dir,...args]=process.argv.slice(2);
  const allowed={upsert:['--input','--expected','--project-id'],get:['--id','--project-id'],
    search:['--query','--project-id','--include-candidates'],index:['--project-id'],
    export:['--out','--project-id','--all'],verify:[]};
  if(!dir||!Object.hasOwn(allowed,action))fail('Usage: r3_experience.mjs upsert|get|search|index|export|verify LIBRARY [options]');
  const opts=new Map();
  for(let i=0;i<args.length;i++){
    const k=args[i];if(!allowed[action].includes(k)||opts.has(k))fail('EXPERIENCE_BAD_ARGS');
    if(['--all','--include-candidates'].includes(k))opts.set(k,true);
    else{const v=args[++i];if(!v||v.startsWith('--'))fail('EXPERIENCE_BAD_ARGS');opts.set(k,v)}
  }
  const project=opts.get('--project-id');if(project!==undefined&&!id(project))fail('EXPERIENCE_PROJECT_ID_INVALID');
  const root=rootDir(dir,action==='upsert');
  if(action==='upsert'){
    const expected=opts.get('--expected');
    if(!/^\d+$/.test(expected??'')||!Number.isSafeInteger(Number(expected))||!opts.get('--input'))fail('EXPERIENCE_EXPECTED_REVISION_REQUIRED');
    out(publish(root,JSON.parse(fs.readFileSync(opts.get('--input'),'utf8')),Number(expected),project));
  }else if(action==='get'){
    const e=read(filename(root,opts.get('--id')));
    if(!canRead(e,project))fail('EXPERIENCE_SCOPE_DENIED');
    out({entry:e,usable:e.status!=='retired',note:'Candidate evidence is provisional; never a writing obligation.'});
  }else if(action==='search'){
    const q=opts.get('--query');if(!text(q))fail('EXPERIENCE_QUERY_REQUIRED');
    const terms=q.toLowerCase().split(/\s+/).filter(Boolean);
    const entries=inventory(root,project,opts.has('--include-candidates')).map(e=>({entry:e,
      score:terms.filter(t=>[e.title,e.method,e.applicability,e.cautions,...e.tags].join(' ').toLowerCase().includes(t)).length}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id,'en')).slice(0,5);
    out({status:'local_keyword_search',entries,optional:true,semanticRetrieval:false});
  }else if(action==='index'){
    out({status:'local_index',entries:inventory(root,project,false).map(e=>({id:e.id,revision:e.revision,title:e.title,
      scope:e.scope,projectId:e.projectId??null,status:e.status,sourceFile:filename(root,e.id),sha256:sha256(fs.readFileSync(filename(root,e.id)))})),
      note:'Optional host sync only; no remote update is claimed. Recheck local revision after any remote recall.'});
  }else if(action==='export'){
    if(!opts.get('--out')||opts.has('--all')&&project!==undefined)fail('EXPERIENCE_EXPORT_ARGS');
    out(pack(root,opts.get('--out'),project,opts.has('--all')));
  }else out(verifyPack(root));
}catch(e){out({status:'error',error:e.message});process.exitCode=2}
