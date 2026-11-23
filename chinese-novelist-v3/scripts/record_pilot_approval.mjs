#!/usr/bin/env node
/** Record a user-confirmation artifact after a pass-candidate independent review.
 * The CLI cannot independently prove a user utterance is authentic.
 */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot,readPlan,safeFile,readJsonFile,atomicWritePlan,pilotHashes,sameHashes,sha256,structuredReportValid} from './v3_common.mjs';
const args=process.argv.slice(2),rootArg=args[0],idx=args.indexOf('--evidence');
try {
  if(!rootArg||idx<0||typeof args[idx+1]!=='string'||args.some((x,i)=>x.startsWith('--')&&!['--json','--evidence'].includes(x))) {
    throw new Error('Usage: record_pilot_approval.mjs <project> --evidence <user-confirmation.json-relative-path> [--json]');
  }
  const root=projectRoot(rootArg),plan=readPlan(root),gate=plan.v3?.pilotGate;
  if(gate?.status!=='awaiting_approval'||gate.reviewDecision!=='pass_candidate')throw new Error('NO_PASS_CANDIDATE_REVIEW');
  const reviewFile=safeFile(root,gate.reviewPath);
  if(!reviewFile)throw new Error('REVIEW_MISSING');
  const bytes=fs.readFileSync(reviewFile);
  if(sha256(bytes)!==gate.reviewSha256)throw new Error('REVIEW_CHANGED');
  const report=JSON.parse(bytes.toString('utf8')),hashes=pilotHashes(root,plan);
  if(structuredReportValid(report,gate.revision,hashes).length || !sameHashes(gate.reviewedChapterHashes,hashes)
    || report.decision!=='pass_candidate') throw new Error('REVIEW_NOT_VALID_FOR_CURRENT_MANUSCRIPT');
  const evidenceFile=safeFile(root,args[idx+1]);
  if(!evidenceFile)throw new Error('CONFIRMATION_FILE_MISSING');
  const evidenceBytes=fs.readFileSync(evidenceFile),evidence=JSON.parse(evidenceBytes.toString('utf8'));
  if(evidence.schemaVersion!==1||evidence.approved!==true||evidence.revision!==gate.revision||
     evidence.reviewSha256!==gate.reviewSha256||typeof evidence.quote!=='string'||evidence.quote.trim().length<2||
     typeof evidence.source!=='string'||!evidence.source.trim()||typeof evidence.approvedAt!=='string'||
     !Number.isFinite(Date.parse(evidence.approvedAt)))throw new Error('INVALID_USER_CONFIRMATION');
  gate.approvalPath=path.relative(root,evidenceFile);
  gate.approvalSha256=sha256(evidenceBytes);
  gate.approvedAt=evidence.approvedAt;
  gate.humanApproved=true;
  gate.status='passed';
  plan.v3.pilotGate=gate;
  atomicWritePlan(root,plan);
  console.log(JSON.stringify({status:'passed',revision:gate.revision,approvalPath:gate.approvalPath,note:'Recorded confirmation evidence; true user intent must still be confirmed in host conversation.'},null,2));
}catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
