#!/usr/bin/env node
/** V3 writing gate: deterministic prerequisites, not a literary-quality judge. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const numIndex = args.indexOf('--chapter');
const requested = numIndex >= 0 ? Number(args[numIndex + 1]) : NaN;
const folder = args[0];
const issues = [];
const fail = (code, message) => issues.push({code, message});
const output = (status, chapter, project, detail={}) => {
  const report={status, chapter, project, issues, ...detail};
  process.stdout.write(asJson ? JSON.stringify(report,null,2)+'\n' : status+' chapter='+chapter+' '+issues.map(i=>i.code+': '+i.message).join('; ')+'\n');
  process.exitCode = status==='allowed'?0:status==='blocked'?1:2;
};
const safeFile = (root, relative) => {
  if(typeof relative!=='string'||!relative.trim()||path.isAbsolute(relative)) return null;
  const candidate = path.resolve(root,relative);
  const rel = path.relative(root,candidate);
  if(!rel || rel==='..' || rel.startsWith('..'+path.sep) || path.isAbsolute(rel)) return null;
  let physical;
  try{physical=fs.realpathSync(candidate);}catch{return null;}
  const physicalRel=path.relative(root,physical);
  if(!physicalRel || physicalRel==='..' || physicalRel.startsWith('..'+path.sep) || path.isAbsolute(physicalRel))return null;
  try{return fs.statSync(physical).isFile()?physical:null;}catch{return null;}
};

if(!folder || !Number.isSafeInteger(requested) || requested<1 || (numIndex===-1) || args.some(a=>a.startsWith('--') && !['--json','--chapter'].includes(a))){
  fail('BAD_ARGS','用法: node scripts/v3_gate.mjs <项目目录> --chapter <正整数> [--json]');
  output('error',requested,folder||null);
}else{
  let root, plan;
  try{
    root=fs.realpathSync(path.resolve(folder));
    if(!fs.statSync(root).isDirectory())throw new Error('not directory');
    plan=JSON.parse(fs.readFileSync(path.join(root,'02-写作计划.json'),'utf8'));
  }catch(e){
    fail('READ_ERROR','无法读取项目目录或写作计划: '+e.message);
    output('error',requested,folder);
  }
  if(plan){
    const v3=plan.v3;
    if(!v3 || v3.schemaVersion!==1) fail('NO_V3_STATE','缺失 V3 状态或版本错误');
    if(v3?.creativeDecision!=='accepted')fail('CREATIVE_NOT_APPROVED','创意方向尚未确认');
    if(v3?.storyPlanApproved!==true)fail('STORY_PLAN_NOT_APPROVED','故事蓝图尚未确认');
    if(requested>=4){
      const g=v3?.pilotGate||{};
      if(g.status!=='passed')fail('PILOT_NOT_PASSED','前三章审稿未通过');
      if(g.reviewDecision!=='pass_candidate')fail('NO_POSITIVE_REVIEW','缺少审核候选通过结论');
      if(g.humanApproved!==true || !g.approvedAt || Number.isNaN(Date.parse(g.approvedAt)))fail('NO_HUMAN_APPROVAL','缺少有日期的作者批准记录');
      const reportPath=safeFile(root,g.reviewPath);
      if(!reportPath || fs.statSync(reportPath).size===0)fail('REVIEW_MISSING','独立审稿报告不存在或为空');
      for(let n=1;n<=3;n++){
        const c=Array.isArray(plan.chapters)?plan.chapters.find(x=>x.chapterNumber===n):undefined;
        if(!c || c.status!=='completed' || c.wordCountPass!==true){fail('PILOT_CHAPTER_INCOMPLETE','第'+n+'章状态或字数未通过');continue;}
        const file=safeFile(root,c.filePath);
        if(!file){fail('PILOT_FILE_INVALID','第'+n+'章文件不存在或路径越界');continue;}
        const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if(g.reviewedChapterHashes?.[String(n)]!==sha)fail('STALE_REVIEW','第'+n+'章正文已变更或审稿哈希缺失');
      }
    }
    output(issues.length?'blocked':'allowed',requested,root);
  }
}