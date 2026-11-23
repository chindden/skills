/** Independent R3 source snapshots for legacy-shaped chapter/arc reviews. */
import fs from 'node:fs';
import {safeFile,sha256} from './v3_common.mjs';
import {createSnapshot,verifySnapshot} from './r3_snapshots.mjs';
import {snapshotDiff} from './r3_diff.mjs';

const problem=x=>{throw new Error(x)};
const nums=(kind,end)=>kind==='chapter'?[end]:[end-2,end-1,end];
const fname=n=>'chapter-'+String(n).padStart(4,'0')+'.md';
function manuscriptFiles(root,plan,kind,end){
  if(!['chapter','arc'].includes(kind))problem('R3_MANUSCRIPT_KIND_INVALID');
  const files={};
  for(const n of nums(kind,end)){
    const c=plan.chapters.find(x=>x.chapterNumber===n),file=safeFile(root,c?.filePath);
    if(!file)problem('R3_MANUSCRIPT_FILE_MISSING');
    files[fname(n)]=fs.readFileSync(file,'utf8');
  }
  return files;
}
export function prepareR3ManuscriptSnapshot(root,plan,kind,end,revision,old){
  const files=manuscriptFiles(root,plan,kind,end);
  if(old?.revision){
    if(!old.r3Snapshot)problem('R3_PREVIOUS_REVIEW_LACKS_SNAPSHOT');
    const prior=verifySnapshot(root,old.r3Snapshot.path,old.r3Snapshot.sha256);
    files['diff.md']=snapshotDiff(
      Object.fromEntries(Object.keys(files).map(name=>[name,prior.files[name]??''])),files);
  }
  const rel='reviews/r3/manuscripts/'+(kind==='chapter'?'chapter':'arc')+'-'+end+'/v'+revision;
  const snap=createSnapshot(root,rel,files);
  return {path:rel,sha256:snap.sha256};
}
export function verifyR3ManuscriptSnapshot(root,plan,kind,end,record,packet=null){
  if(!record?.r3Snapshot?.path||!record.r3Snapshot.sha256)
    return 'R3_MANUSCRIPT_SNAPSHOT_MISSING';
  try{
    const prior=verifySnapshot(root,record.r3Snapshot.path,record.r3Snapshot.sha256);
    if(packet && JSON.stringify(packet.r3Snapshot)!==JSON.stringify(record.r3Snapshot))
      return 'R3_MANUSCRIPT_SNAPSHOT_PACKET_MISMATCH';
    const actual=manuscriptFiles(root,plan,kind,end);
    for(const [name,text] of Object.entries(actual)){
      if(prior.files[name]!==text)return 'R3_MANUSCRIPT_CHANGED';
    }
    if(Object.keys(prior.files).some(name=>name!=='diff.md'&&!Object.hasOwn(actual,name)))
      return 'R3_MANUSCRIPT_SNAPSHOT_EXTRA_FILE';
    return null;
  }catch(e){return e.message||'R3_MANUSCRIPT_SNAPSHOT_INVALID'}
}
