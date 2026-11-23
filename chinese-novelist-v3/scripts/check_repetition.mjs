#!/usr/bin/env node
/** Heuristic repeated-paragraph scanner; NOT a semantic plot repetition detector. */
import fs from 'node:fs';
import path from 'node:path';

const dir=process.argv[2];
if(!dir){console.error('Usage: node check_repetition.mjs <project-dir> [--json]');process.exit(2);}
const asJson=process.argv.includes('--json');
const findings=[];
try {
  const root=fs.realpathSync(path.resolve(dir));
  const plan=JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json'),'utf8'));
  if(!Array.isArray(plan.chapters))throw new Error('Invalid chapters');
  const seen=new Map();
  for(const chapter of plan.chapters.sort((a,b)=>a.chapterNumber-b.chapterNumber)){
    const rel=chapter.filePath;
    if(typeof rel!=='string'||path.isAbsolute(rel))throw new Error('Unsafe file path');
    const file=path.resolve(root,rel);
    const relative=path.relative(root,file);
    if(!relative||relative==='..'||relative.startsWith('..'+path.sep))throw new Error('Unsafe file path');
    if(!fs.existsSync(file))continue;
    const real=fs.realpathSync(file), r=path.relative(root,real);
    if(!r||r==='..'||r.startsWith('..'+path.sep))throw new Error('Unsafe symlink');
    const text=fs.readFileSync(real,'utf8');
    const paragraphs=text.split(/\n\s*\n+/);
    for(let p=0;p<paragraphs.length;p++){
      const normal=paragraphs[p].replace(/\s+/g,'').replace(/[\p{P}\p{S}]/gu,'');
      if([...normal].length<60)continue;
      const first=seen.get(normal);
      if(first){findings.push({type:'DUPLICATE_PARAGRAPH',first,repeat:{chapter:chapter.chapterNumber,paragraph:p+1},length:[...normal].length});}
      else seen.set(normal,{chapter:chapter.chapterNumber,paragraph:p+1});
    }
  }
  const report={chapters:plan.chapters.length,findings,note:'仅检测较长段落字面重复；故事机制与角色行为模式重复必须由编辑审稿'};
  console.log(asJson?JSON.stringify(report,null,2):findings.length+' suspicious repeated paragraphs');
  process.exitCode=findings.length?1:0;
}catch(error){console.log(asJson?JSON.stringify({error:error.message}):error.message);process.exitCode=2;}
