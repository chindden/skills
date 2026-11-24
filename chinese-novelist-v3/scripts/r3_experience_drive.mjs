#!/usr/bin/env node
/** P1-08 Drive authority: deterministic OFFLINE checks, never a Drive API or writing gate. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const fail=x=>{throw new Error(x)}, hash=x=>createHash('sha256').update(x).digest('hex');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(x);
const str=x=>typeof x==='string'&&x.trim().length>0&&!/[\r\n]/.test(x);
const int=x=>Number.isSafeInteger(x)&&x>0;
const statuses=['candidate','supported','mature','retired'];
const kinds=['self_observation','independent_review','author_feedback','reader_feedback','controlled_comparison'];
const themeName=/^\d{2}-[a-z][a-z0-9-]*-v([1-9]\d*)\.md$/;
const indexName=/^00-INDEX-v([1-9]\d*)\.md$/;
const canon=x=>JSON.stringify(x);
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b,'en')));
// Only decode Markdown punctuation escapes, not arbitrary backslashes or literal JSON escapes.
const unescapeMd=s=>s.replace(/\\([\\!"#$%&'()*+,\-./:;<=>?@\[\]^_{}|~])/g,'$1');
const escapeMd=s=>s.replace(/[\\!"#$%&'()*+,\-./:;<=>?@\[\]^_{}|~]/g,'\\$&');
const lines=s=>s.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trimEnd()).filter(x=>x.trim());
const heading=(s,p)=>unescapeMd(s).match(p);
function field(line){
  const m=line.match(/^\s*[-*]\s+\*\*([^*]+)\*\*\s*[：:]\s*(.+)$/);
  if(!m)fail('DRIVE_EXP_BAD_FIELD');
  return [m[1],unescapeMd(m[2].trim())];
}
function fields(ls){
  const f={};for(const line of ls){const [k,v]=field(line);if(Object.hasOwn(f,k))fail('DRIVE_EXP_DUP_FIELD_'+k);f[k]=v}return f;
}
function json(s){try{return JSON.parse(s)}catch{fail('DRIVE_EXP_BAD_JSON_FIELD')}}
const keys=(o,ks)=>Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k));
export function validate(e){
  if(!e||!keys(e,['id','title','revision','status','scope','tags','applicability','method','cautions','evidence','changeReason'])||
    !id(e.id)||!int(e.revision)||!statuses.includes(e.status)||e.scope!=='global'||
    !['title','applicability','method','cautions','changeReason'].every(k=>str(e[k]))||e.title.includes('|')||
    !Array.isArray(e.tags)||!e.tags.every(str)||new Set(e.tags).size!==e.tags.length||!Array.isArray(e.evidence)||!e.evidence.length)
    fail('DRIVE_EXP_INVALID');
  for(const x of e.evidence)if(!x||!keys(x,['projectId','kind','source','observation'])||!id(x.projectId)||!kinds.includes(x.kind)||!str(x.source)||!str(x.observation))fail('DRIVE_EXP_EVIDENCE_INVALID');
  const strong=e.evidence.filter(x=>x.kind!=='self_observation');
  if(['supported','mature'].includes(e.status)&&!strong.length)fail('DRIVE_EXP_NOT_SUPPORTED');
  if(e.status==='mature'&&new Set(strong.map(x=>x.projectId)).size<2)fail('DRIVE_EXP_NOT_MATURE');
  return {id:e.id,title:e.title,revision:e.revision,status:e.status,scope:e.scope,tags:e.tags,applicability:e.applicability,method:e.method,cautions:e.cautions,evidence:e.evidence.map(x=>({projectId:x.projectId,kind:x.kind,source:x.source,observation:x.observation})),changeReason:e.changeReason};
}
const fl=(k,v)=>'- **'+k+'**：'+escapeMd(v);
export function renderTheme(theme){
  if(!str(theme.title)||!Array.isArray(theme.entries))fail('DRIVE_EXP_THEME_INVALID');
  const seen=new Set();
  return '# '+escapeMd(theme.title)+'\n\n'+theme.entries.map(raw=>{
    const e=validate(raw);if(seen.has(e.id))fail('DRIVE_EXP_DUP_ID');seen.add(e.id);
    return '## '+escapeMd(e.id+' | '+e.title+' | v'+e.revision+' | '+e.status)+'\n\n'+[
      fl('作用域',e.scope),fl('标签',canon(e.tags)),fl('适用条件',e.applicability),fl('核心方法',e.method),fl('慎用与反例',e.cautions),fl('验证证据',canon(e.evidence)),fl('修订原因',e.changeReason)
    ].join('\n')+'\n';
  }).join('\n');
}
export function parseTheme(s,{experimental=false}={}){
  const ls=lines(s),title=ls.shift()?.match(/^# (.+)$/)?.[1];if(!title)fail('DRIVE_EXP_THEME_HEADER');
  const entries=[],seen=new Set();
  while(ls.length){
    const m=heading(ls.shift(),/^## ([A-Za-z0-9][A-Za-z0-9_-]{0,79}) \| ([^|]+) \| v([1-9]\d*) \| (candidate|supported|mature|retired)$/);
    if(!m||seen.has(m[1])||!int(Number(m[3])))fail('DRIVE_EXP_ENTRY_HEADER_OR_DUP');
    seen.add(m[1]);const body=[];while(ls.length&&!ls[0].startsWith('## '))body.push(ls.shift());
    const f=fields(body),base={id:m[1],title:m[2],revision:Number(m[3]),status:m[4]};
    if(experimental){
      if(!keys(f,['标签','适用条件','核心方法','慎用与反例','验证证据']))fail('DRIVE_EXP_EXPERIMENT_FIELDS');
      entries.push({...base,fields:f,unverified:true});continue;
    }
    if(!keys(f,['作用域','标签','适用条件','核心方法','慎用与反例','验证证据','修订原因']))fail('DRIVE_EXP_FIELDS');
    entries.push(validate({...base,scope:f['作用域'],tags:json(f['标签']),applicability:f['适用条件'],method:f['核心方法'],cautions:f['慎用与反例'],evidence:json(f['验证证据']),changeReason:f['修订原因']}));
  }
  return {title:unescapeMd(title),entries};
}
const digestTheme=t=>hash(canon(t));
export function checkTransition(old,next,changed){
  if(old.title!==next.title||!Array.isArray(changed)||!changed.length||new Set(changed).size!==changed.length||!changed.every(id))fail('DRIVE_EXP_CHANGE_SET');
  const before=new Map(old.entries.map(e=>[e.id,e])),after=new Map(next.entries.map(e=>[e.id,e])),actual=[];
  for(const [key,e] of before){
    const n=after.get(key);if(!n)fail('DRIVE_EXP_ENTRY_LOST_'+key);
    if(canon(e)===canon(n))continue;
    if(n.revision!==e.revision+1||e.status==='retired'&&n.status!=='retired')fail('DRIVE_EXP_REVISION_OR_RETIRED_'+key);
    // A new revision must record a reason; previously recorded evidence cannot silently disappear.
    if(e.evidence.some(x=>!n.evidence.some(y=>canon(x)===canon(y))))fail('DRIVE_EXP_EVIDENCE_LOST_'+key);
    actual.push(key);
  }
  for(const [key,e] of after)if(!before.has(key)){if(e.revision!==1)fail('DRIVE_EXP_NEW_REVISION');actual.push(key)}
  if(canon(actual.sort())!==canon([...changed].sort()))fail('DRIVE_EXP_UNEXPECTED_CHANGES');
  return {changed:actual,entries:next.entries.length};
}
function checkThemeNames(names){
  if(!names.length||names.some(n=>!themeName.test(n)||!int(Number(n.match(themeName)[1]))))fail('DRIVE_EXP_THEME_NAME');
  const logical=names.map(n=>n.replace(/-v\d+\.md$/,''));
  if(new Set(logical).size!==names.length||names.some(n=>n.startsWith('00-')))fail('DRIVE_EXP_DUP_THEME');
}
export function buildIndex(version,themes){
  if(!int(version))fail('DRIVE_EXP_INDEX_VERSION');
  const names=Object.keys(themes).sort();checkThemeNames(names);
  const seen=new Set(),entries=[],refs=[];
  for(const name of names){
    const t=themes[name];refs.push({file:name,sha256:digestTheme(t)});
    for(const raw of t.entries){const e=validate(raw);if(seen.has(e.id))fail('DRIVE_EXP_DUP_ID_'+e.id);seen.add(e.id);
      entries.push({id:e.id,title:e.title,revision:e.revision,status:e.status,tags:e.tags,applicability:e.applicability,file:name})}
  }
  return {version,refs,entries:entries.sort((a,b)=>a.id.localeCompare(b.id,'en'))};
}
export function renderIndex(ix){
  return '# R3 经验索引 v'+ix.version+'\n\n'+ix.refs.map(x=>fl('主题',canon(x))).join('\n')+'\n\n'+ix.entries.map(x=>fl('经验',canon(x))).join('\n')+'\n';
}
export function parseIndex(s){
  const ls=lines(s),m=ls.shift()?.match(/^# R3 经验索引 v([1-9]\d*)$/);if(!m||!int(Number(m[1])))fail('DRIVE_EXP_INDEX_HEADER');
  const refs=[],entries=[];
  for(const l of ls){const [k,v]=field(l);if(k==='主题')refs.push(json(v));else if(k==='经验')entries.push(json(v));else fail('DRIVE_EXP_INDEX_FIELD')}
  if(refs.some(r=>!r||!keys(r,['file','sha256'])||typeof r.file!=='string'||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)))fail('DRIVE_EXP_INDEX_REF');
  checkThemeNames(refs.map(r=>r.file));
  const seen=new Set(),refNames=new Set(refs.map(r=>r.file));
  for(const e of entries){
    if(!e||!keys(e,['id','title','revision','status','tags','applicability','file'])||
      !id(e.id)||seen.has(e.id)||!str(e.title)||!int(e.revision)||!statuses.includes(e.status)||
      !Array.isArray(e.tags)||!e.tags.every(str)||new Set(e.tags).size!==e.tags.length||
      !str(e.applicability)||!refNames.has(e.file))fail('DRIVE_EXP_INDEX_ENTRY');
    seen.add(e.id);
  }
  return {version:Number(m[1]),refs,entries};
}
function safeDir(p){if(!fs.lstatSync(p).isDirectory()||fs.lstatSync(p).isSymbolicLink())fail('DRIVE_EXP_UNSAFE_DIR');return fs.realpathSync(p)}
function safeRead(p){if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())fail('DRIVE_EXP_UNSAFE_FILE');return fs.readFileSync(p)}
const readText=p=>safeRead(p).toString('utf8');
function themesAt(root,names){checkThemeNames(names);return sorted(Object.fromEntries(names.map(n=>[n,parseTheme(readText(path.join(root,n)))])))}
export function resolve(dir){
  const root=safeDir(dir),names=fs.readdirSync(root),versions=names.filter(n=>indexName.test(n)).sort((a,b)=>Number(b.match(indexName)[1])-Number(a.match(indexName)[1]));
  if(!versions.length)fail('DRIVE_EXP_NO_INDEX');
  const name=versions[0],ix=parseIndex(readText(path.join(root,name)));
  if(ix.version!==Number(name.match(indexName)[1]))fail('DRIVE_EXP_INDEX_NAME_MISMATCH');
  const themes=themesAt(root,ix.refs.map(r=>r.file)),expected=buildIndex(ix.version,themes);
  if(canon(ix)!==canon(expected))fail('DRIVE_EXP_INDEX_INCONSISTENT');
  // No automatic fallback to a lower index: a corrupted latest publication may have withdrawn old advice.
  return {name,index:expected,themes,usable:expected.entries.filter(e=>['supported','mature'].includes(e.status))};
}
export function prepare(root,base,oldName,newName,candidate,changed){
  const r=resolve(root);if(r.name!==base||!r.themes[oldName])fail('DRIVE_EXP_BASE_CONFLICT');
  if(!themeName.test(newName)||newName.replace(/-v\d+\.md$/,'')!==oldName.replace(/-v\d+\.md$/,'')||
    Number(newName.match(themeName)[1])!==Number(oldName.match(themeName)[1])+1)fail('DRIVE_EXP_THEME_REVISION');
  const t=parseTheme(candidate);const delta=checkTransition(r.themes[oldName],t,changed);
  const themes={...r.themes};delete themes[oldName];themes[newName]=t;
  const index=buildIndex(r.index.version+1,themes);
  return {base,baseSha256:hash(canon(r.index)),candidateSha256:digestTheme(t),name:'00-INDEX-v'+index.version+'.md',indexText:renderIndex(index),...delta};
}
// Selective read: index is a locator only; compare the complete selected theme with its referenced digest and metadata.
export function checkRef(indexText,filename,themeText){
  const ix=parseIndex(indexText),ref=ix.refs.find(r=>r.file===filename);
  if(!ref)fail('DRIVE_EXP_UNPUBLISHED_THEME');
  const t=parseTheme(themeText),single=buildIndex(ix.version,{[filename]:t});
  if(ref.sha256!==single.refs[0].sha256||canon(ix.entries.filter(e=>e.file===filename))!==canon(single.entries))fail('DRIVE_EXP_INDEX_INCONSISTENT');
  return {entries:t.entries.filter(e=>['supported','mature'].includes(e.status)),excluded:t.entries.filter(e=>['candidate','retired'].includes(e.status)).map(e=>e.id)};
}
export function confirmBase(root,name,digest){
  const r=resolve(root);if(r.name!==name||hash(canon(r.index))!==digest)fail('DRIVE_EXP_BASE_CONFLICT');return {status:'base_matches',name};
}
function walk(root,rel=''){
  const dir=rel?path.join(root,rel):root;safeDir(dir);
  return fs.readdirSync(dir).sort().flatMap(n=>{
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(n)||n==='.'||n==='..')fail('DRIVE_EXP_PATH');
    const r=rel?rel+'/'+n:n,p=path.join(root,r),st=fs.lstatSync(p);
    if(st.isSymbolicLink())fail('DRIVE_EXP_UNSAFE_FILE');
    return st.isDirectory()?walk(root,r):st.isFile()?[r]:fail('DRIVE_EXP_UNSAFE_FILE');
  });
}
const manifestName='manifest.json';
function verifyHistory(root,current,files){
  const all=[...files],lookup=new Map();
  for(const n of all){
    const base=path.basename(n);
    if(!themeName.test(base)&&!indexName.test(base))continue;
    if(lookup.has(base))fail('DRIVE_EXP_DUP_HISTORY_FILE');
    lookup.set(base,n);
  }
  const indexes=[...lookup.keys()].filter(n=>indexName.test(n)).sort((a,b)=>Number(a.match(indexName)[1])-Number(b.match(indexName)[1]));
  if(indexes.length!==current.index.version)fail('DRIVE_EXP_HISTORY_GAP');
  let prior=null;
  const referenced=new Set(indexes);
  for(let i=0;i<indexes.length;i++){
    const name=indexes[i],ix=parseIndex(readText(path.join(root,lookup.get(name))));
    if(ix.version!==i+1||name!=='00-INDEX-v'+(i+1)+'.md')fail('DRIVE_EXP_HISTORY_GAP');
    const themes={};
    for(const ref of ix.refs){const loc=lookup.get(ref.file);if(!loc)fail('DRIVE_EXP_HISTORY_THEME_MISSING');referenced.add(ref.file);themes[ref.file]=parseTheme(readText(path.join(root,loc)))}
    if(canon(ix)!==canon(buildIndex(ix.version,themes)))fail('DRIVE_EXP_HISTORY_INDEX_INCONSISTENT');
    if(prior){
      const before=new Map(Object.values(prior).flatMap(t=>t.entries.map(e=>[e.id,e])));
      const after=new Map(Object.values(themes).flatMap(t=>t.entries.map(e=>[e.id,e])));
      for(const [id,e] of before){
        const n=after.get(id);if(!n)fail('DRIVE_EXP_HISTORY_ENTRY_LOST');
        if(canon(e)!==canon(n)&&(n.revision!==e.revision+1||e.status==='retired'&&n.status!=='retired'||e.evidence.some(x=>!n.evidence.some(y=>canon(x)===canon(y)))))fail('DRIVE_EXP_HISTORY_REVISION');
      }
      for(const [id,e] of after)if(!before.has(id)&&e.revision!==1)fail('DRIVE_EXP_HISTORY_REVISION');
    }
    prior=themes;
  }
  if([...lookup.keys()].some(n=>!referenced.has(n)))fail('DRIVE_EXP_HISTORY_UNREFERENCED');
}
function backupFiles(root){
  const current=resolve(root),files=walk(root).filter(n=>n!==manifestName);
  // Export only clean, committed root and history; never accidentally include staging candidates.
  const allowed=new Set([current.name,...current.index.refs.map(r=>r.file),'README.md']);
  if(files.some(n=>!allowed.has(n)&&!/^archive\/[A-Za-z0-9][A-Za-z0-9_.-]*\.md$/.test(n)))fail('DRIVE_EXP_BACKUP_UNCOMMITTED_OR_EXTRA');
  verifyHistory(root,current,files);
  return files.map(n=>{const b=safeRead(path.join(root,n));return {path:n,bytes:b.length,sha256:hash(b)}});
}
export function seal(dir){
  const root=safeDir(dir),m={schemaVersion:2,kind:'r3-drive-experience-export',files:backupFiles(root)};
  fs.writeFileSync(path.join(root,manifestName),canon(m)+'\n',{flag:'wx'});return m;
}
export function verify(dir){
  const root=safeDir(dir),m=json(readText(path.join(root,manifestName))),files=backupFiles(root);
  if(!m||m.schemaVersion!==2||m.kind!=='r3-drive-experience-export'||canon(m.files)!==canon(files))fail('DRIVE_EXP_MANIFEST_MISMATCH');
  return {files:files.length,entries:resolve(root).index.entries.length};
}
export function restore(dir,dst){
  const root=safeDir(dir);verify(root);
  const target=path.resolve(dst),parent=safeDir(path.dirname(target));
  if(fs.existsSync(target)||parent===root||parent.startsWith(root+path.sep))fail('DRIVE_EXP_RESTORE_TARGET');
  const temp=fs.mkdtempSync(path.join(parent,'.r3-exp-restore-'));
  try{
    for(const n of walk(root)){const p=path.join(temp,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,safeRead(path.join(root,n)),{flag:'wx'})}
    const result=verify(temp);if(fs.existsSync(target))fail('DRIVE_EXP_RESTORE_TARGET');fs.renameSync(temp,target);return result;
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true})}
}
function main(){
  const [a,p,...args]=process.argv.slice(2);let result;
  if(a==='render-theme'&&p&&!args.length)result=renderTheme(json(readText(p)));
  else if(a==='validate'&&p&&!args.length)result=parseTheme(readText(p));
  else if(a==='inspect-experiment'&&p&&!args.length)result=parseTheme(readText(p),{experimental:true});
  else if(a==='index'&&p&&args.length>=2)result=renderIndex(buildIndex(Number(args[0]),themesAt(safeDir(p),args.slice(1))));
  else if(a==='resolve'&&p&&!args.length)result=resolve(p);
  else if(a==='check-ref'&&p&&args.length===2)result=checkRef(readText(p),args[0],readText(args[1]));
  else if(a==='confirm-base'&&p&&args.length===2)result=confirmBase(p,args[0],args[1]);
  else if(a==='prepare'&&p&&args.length>=5)result=prepare(p,args[0],args[1],args[2],readText(args[3]),args.slice(4));
  else if(a==='seal'&&p&&!args.length)result=seal(p);
  else if(a==='verify'&&p&&!args.length)result=verify(p);
  else if(a==='restore'&&p&&args.length===1)result=restore(p,args[0]);
  else fail('Usage: render-theme JSON | validate FILE | inspect-experiment FILE | index DIR VERSION THEME... | resolve DIR | check-ref INDEX THEME_NAME THEME_FILE | confirm-base DIR INDEX DIGEST | prepare DIR BASE_INDEX OLD_THEME NEW_THEME CANDIDATE CHANGED_ID... | seal DIR | verify DIR | restore DIR NEW_DIR');
  console.log(typeof result==='string'?result:JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{main()}catch(e){console.error(e.message);process.exitCode=2}}
