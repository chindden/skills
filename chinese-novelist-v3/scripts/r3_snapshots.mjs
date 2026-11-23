/**
 * R3 content-addressed immutable-ish project snapshots.
 * "wx" protects against accidental overwrite, not malicious filesystem mutation.
 * Every read revalidates SHA-256 and a manifest; approved gate records bind the digest.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {sha256} from './v3_common.mjs';

const problem = code => {throw new Error(code)};
const plain=o=>o && typeof o==='object' && !Array.isArray(o);
const safeKey=x=>typeof x==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(x) &&
  x!=='.' && x!=='..' && !x.includes('..');
const stable=(x)=>JSON.stringify(x,null,2)+'\n';
export const snapshotDigest=manifest=>sha256(Buffer.from(stable(manifest)));
export const snapshotText=stable;

export function verifySnapshot(root,rel,expectedDigest=null){
  if(typeof rel!=='string'||!/^reviews\/r3\/[a-zA-Z0-9/_-]+$/.test(rel)||
    rel.includes('//')||rel.includes('..'))problem('R3_SNAPSHOT_PATH_INVALID');
  const dir=path.resolve(root,rel),rr=fs.realpathSync(root);
  if(!dir.startsWith(rr+path.sep))problem('R3_SNAPSHOT_PATH_INVALID');
  const stat=fs.lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
    !fs.realpathSync(dir).startsWith(rr+path.sep))problem('R3_SNAPSHOT_UNSAFE');
  const manifestFile=path.join(dir,'manifest.json');
  if(!fs.lstatSync(manifestFile).isFile())problem('R3_SNAPSHOT_MANIFEST_INVALID');
  const bytes=fs.readFileSync(manifestFile);
  let m;try{m=JSON.parse(bytes)}catch{problem('R3_SNAPSHOT_MANIFEST_INVALID')}
  if(m?.schemaVersion!==1||!plain(m.files)||!Object.keys(m.files).length ||
    !Object.keys(m.files).every(safeKey))problem('R3_SNAPSHOT_MANIFEST_INVALID');
  if(!Object.values(m.files).every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))
    problem('R3_SNAPSHOT_MANIFEST_INVALID');
  if(!Buffer.from(stable(m)).equals(bytes))problem('R3_SNAPSHOT_MANIFEST_INVALID');
  const digest=sha256(bytes);
  if(expectedDigest && digest!==expectedDigest)problem('R3_SNAPSHOT_HASH_MISMATCH');
  const actual=fs.readdirSync(dir).sort();
  if(JSON.stringify(actual)!==JSON.stringify([...Object.keys(m.files),'manifest.json'].sort()))
    problem('R3_SNAPSHOT_EXTRA_OR_MISSING_FILE');
  const files={};
  for(const [name,hash] of Object.entries(m.files)){
    const file=path.join(dir,name);
    const st=fs.lstatSync(file);
    if(!st.isFile()||st.isSymbolicLink())problem('R3_SNAPSHOT_UNSAFE');
    const data=fs.readFileSync(file);
    if(sha256(data)!==hash)problem('R3_SNAPSHOT_HASH_MISMATCH');
    files[name]=data.toString('utf8');
  }
  return {manifest:m,manifestSha256:digest,files};
}

/**
 * Prepare content under a staging directory on the same filesystem. Commit
 * via rename; if a matching final directory exists after a crash, adopt it.
 * Never remove/replace an existing committed snapshot.
 */
export function createSnapshot(root,rel,files){
  if(typeof rel!=='string'||!/^reviews\/r3\/[a-zA-Z0-9/_-]+$/.test(rel)||
     rel.includes('//')||rel.includes('..'))problem('R3_SNAPSHOT_PATH_INVALID');
  if(!plain(files)||!Object.keys(files).length||!Object.keys(files).every(safeKey))
    problem('R3_SNAPSHOT_FILE_INVALID');
  const content=Object.fromEntries(Object.entries(files).map(([k,v])=>{
    if(typeof v!=='string')problem('R3_SNAPSHOT_FILE_INVALID');
    return [k,v];
  }));
  const manifest={schemaVersion:1,files:Object.fromEntries(
    Object.entries(content).map(([name,data])=>[name,sha256(Buffer.from(data))]))};
  const wanted=stable(manifest),expected=sha256(Buffer.from(wanted));
  const dest=path.join(root,rel),parent=path.dirname(dest);
  // Create one verified ancestor at a time: never follow an attacker-supplied
  // symlink to an external directory, even during initial mkdir.
  const realRoot=fs.realpathSync(root);
  let current=realRoot;
  for(const segment of path.relative(realRoot,parent).split(path.sep)){
    if(!segment||segment==='.'||segment==='..')problem('R3_SNAPSHOT_PATH_INVALID');
    current=path.join(current,segment);
    if(fs.existsSync(current)){
      const stat=fs.lstatSync(current);
      if(!stat.isDirectory()||stat.isSymbolicLink())problem('R3_SNAPSHOT_UNSAFE');
    }else fs.mkdirSync(current);
  }
  const realParent=fs.realpathSync(parent);
  if(!realParent.startsWith(realRoot+path.sep))problem('R3_SNAPSHOT_UNSAFE');
  if(fs.existsSync(dest)){
    const prior=verifySnapshot(root,rel);
    if(prior.manifestSha256!==expected)problem('R3_SNAPSHOT_CONFLICT');
    return {path:rel,sha256:expected,reused:true};
  }
  const stage=path.join(parent,'.stage-'+path.basename(dest)+'-'+process.pid+'-'+crypto.randomBytes(5).toString('hex'));
  fs.mkdirSync(stage,{mode:0o700});
  try{
    for(const [name,data] of Object.entries(content))
      fs.writeFileSync(path.join(stage,name),data,{flag:'wx'});
    fs.writeFileSync(path.join(stage,'manifest.json'),wanted,{flag:'wx'});
    // No overwrites: an external writer racing the rename is a hard error.
    if(fs.existsSync(dest))problem('R3_SNAPSHOT_CONFLICT');
    fs.renameSync(stage,dest);
  }finally{
    if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});
  }
  const checked=verifySnapshot(root,rel,expected);
  return {path:rel,sha256:checked.manifestSha256,reused:false};
}
