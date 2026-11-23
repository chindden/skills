#!/usr/bin/env node
/** Seal chapter hashes and put a V3 project into independent editorial review. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [folder] = process.argv.slice(2);
const asJson=process.argv.includes('--json');
if(!folder){console.error('Usage: node prepare_pilot_review.mjs <project-directory> [--json]');process.exit(2);}
try {
  const root=fs.realpathSync(path.resolve(folder));
  const planPath=path.join(root,'02-写作计划.json');
  const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
  if(plan.v3?.schemaVersion!==1 || plan.v3?.storyPlanApproved!==true)throw new Error('V3 story plan is not approved');
  const chapters=[];
  for(let n=1;n<=3;n++){
    const c=plan.chapters?.find(item=>item.chapterNumber===n);
    if(!c || c.status!=='completed' || c.wordCountPass!==true)throw new Error('Pilot chapter '+n+' incomplete');
    if(typeof c.filePath!=='string'||path.isAbsolute(c.filePath))throw new Error('Invalid chapter path');
    const p=fs.realpathSync(path.join(root,c.filePath));
    const rel=path.relative(root,p);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Chapter path escapes project');
    const bytes=fs.readFileSync(p);
    chapters.push({chapterNumber:n,filePath:c.filePath,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const gate=plan.v3.pilotGate||{};
  const revision=(Number.isInteger(gate.revision)?gate.revision:0)+1;
  const reviewRel='reviews/pilot-input-v'+revision+'.json', reviewFile=path.join(root,reviewRel);
  fs.mkdirSync(path.dirname(reviewFile),{recursive:true});
  const packet={revision,createdAt:new Date().toISOString(),chapters,note:'Only factual manuscript package; editor must not be primed by the author self-rating.'};
  fs.writeFileSync(reviewFile,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
  gate.status='under_review';gate.revision=revision;gate.reviewPath=null;gate.reviewDecision=null;gate.humanApproved=false;gate.approvedAt=null;
  gate.reviewedChapterHashes=Object.fromEntries(chapters.map(c=>[String(c.chapterNumber),c.sha256]));
  plan.v3.pilotGate=gate;
  const temp=planPath+'.tmp-'+process.pid;
  fs.writeFileSync(temp,JSON.stringify(plan,null,2)+'\n');fs.renameSync(temp,planPath);
  const res={status:'under_review',reviewInput:reviewRel,revision,chapters};
  console.log(asJson?JSON.stringify(res,null,2):'Ready for independent review: '+reviewRel);
}catch(error){console.log(asJson?JSON.stringify({error:error.message}):error.message);process.exitCode=2;}
