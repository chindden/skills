#!/usr/bin/env node
/** Deterministic chapter gate. It verifies artifacts, not literary merit or true user identity. */
import fs from 'node:fs';
import {projectRoot,readPlan,safeFile,pilotHashes,sameHashes,sha256,structuredReportValid} from './v3_common.mjs';

const args=process.argv.slice(2),folder=args[0],chapterIndex=args.indexOf('--chapter');
const chapter=chapterIndex<0?NaN:Number(args[chapterIndex+1]);
const issues=[];
const fail=(code,message)=>issues.push({code,message});
const done=(status,root)=>{
  const result={status,chapter,project:root,issues};
  console.log(args.includes('--json')?JSON.stringify(result,null,2):status+': '+issues.map(x=>x.code).join(','));
  process.exitCode=status==='allowed'?0:status==='blocked'?1:2;
};
if(!folder||!Number.isSafeInteger(chapter)||chapter<1 ||
  args.slice(1).some((x,i)=>x.startsWith('--')&&!['--json','--chapter'].includes(x))) {
  fail('BAD_ARGS','Usage: v3_gate.mjs <project-dir> --chapter N [--json]');
  done('error',folder||null);
}else {
  let root,plan;
  try {root=projectRoot(folder);plan=readPlan(root);}
  catch(e){fail('READ_ERROR',e.message);done('error',folder);}
  if(plan){
    if(plan.v3?.schemaVersion!==1)fail('NO_V3_STATE','V3 状态缺失或版本不符');
    if(plan.v3?.creativeDecision!=='accepted')fail('CREATIVE_NOT_APPROVED','创意未确认');
    if(plan.v3?.storyPlanApproved!==true)fail('STORY_PLAN_NOT_APPROVED','蓝图未确认');
    if(chapter>=4){
      const gate=plan.v3?.pilotGate||{};
      if(gate.status!=='passed')fail('PILOT_NOT_PASSED','前三章门禁未通过');
      if(gate.reviewDecision!=='pass_candidate')fail('NO_POSITIVE_REVIEW','审稿结果未通过');
      if(gate.humanApproved!==true||!gate.approvedAt||!Number.isFinite(Date.parse(gate.approvedAt)))
        fail('NO_HUMAN_APPROVAL','缺少用户明确批准记录');
      let hashes=null;
      try {hashes=pilotHashes(root,plan);}catch(e){fail('PILOT_CHAPTER_INCOMPLETE',e.message);}
      if(hashes&&!sameHashes(gate.reviewedChapterHashes,hashes))fail('STALE_REVIEW','正文与提交审稿稿件不一致');
      const reviewFile=safeFile(root,gate.reviewPath);
      let report=null,reviewSha=null;
      if(!reviewFile)fail('REVIEW_MISSING','审稿报告缺失或路径无效');
      else {
        const bytes=fs.readFileSync(reviewFile);
        reviewSha=sha256(bytes);
        if(reviewSha!==gate.reviewSha256)fail('REVIEW_CHANGED','审稿报告内容被修改');
        try {report=JSON.parse(bytes.toString('utf8'));}
        catch {fail('INVALID_REVIEW','审稿报告不是有效 JSON');}
        if(report){
          const errors=structuredReportValid(report,gate.revision,hashes||{});
          for(const err of errors)fail(err,'审稿报告结构或稿件版本不符合');
          if(report.decision!=='pass_candidate')fail('REVIEW_REJECTED','审稿尚未通过');
        }
      }
      const approvalFile=safeFile(root,gate.approvalPath);
      if(!approvalFile)fail('APPROVAL_RECORD_MISSING','没有用户确认凭据文件');
      else{
        const approvalBytes=fs.readFileSync(approvalFile);
        if(sha256(approvalBytes)!==gate.approvalSha256)fail('APPROVAL_CHANGED','批准记录已变更');
        try {
          const approval=JSON.parse(approvalBytes.toString('utf8'));
          if(approval.schemaVersion!==1||approval.approved!==true||
            approval.revision!==gate.revision||approval.reviewSha256!==reviewSha||
            approval.approvedAt!==gate.approvedAt||typeof approval.source!=='string'||!approval.source.trim()||
            typeof approval.quote!=='string'||approval.quote.trim().length<2)
            fail('APPROVAL_RECORD_INVALID','批准证据与当前稿件不对应');
        }catch(e){if(e instanceof SyntaxError)fail('APPROVAL_RECORD_INVALID','批准文件 JSON 无效');else throw e;}
      }
    }
    done(issues.length?'blocked':'allowed',root);
  }
}
