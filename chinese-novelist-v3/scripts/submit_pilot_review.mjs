#!/usr/bin/env node
/** Register a real independent-editor report for the exact submitted pilot revision. */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot,readPlan,safeFile,readJsonFile,atomicWritePlan,pilotHashes,sameHashes,sha256,structuredReportValid} from './v3_common.mjs';
import {assertR3PilotPrerequisites} from './r2_review_common.mjs';
const args=process.argv.slice(2),rootArg=args[0],sourceArg=args[1];
try {
  if(!rootArg||!sourceArg||args.slice(2).some(x=>x!=='--json'))throw new Error('Usage: submit_pilot_review.mjs <project> <editor-report.json-relative-path> [--json]');
  const root=projectRoot(rootArg),plan=readPlan(root),gate=plan.v3?.pilotGate;
  if(gate?.status!=='under_review'||!Number.isSafeInteger(gate.revision)||gate.revision<1)throw new Error('REVIEW_NOT_PREPARED');
  assertR3PilotPrerequisites(root,plan);
  const source=safeFile(root,sourceArg);
  if(!source)throw new Error('REPORT_MUST_BE_EXISTING_PROJECT_FILE');
  const packet=readJsonFile(root,gate.reviewInputPath);
  const hashes=pilotHashes(root,plan);
  if(packet.revision!==gate.revision||!sameHashes(packet.chapters &&
    Object.fromEntries(packet.chapters.map(c=>[String(c.chapterNumber),c.sha256])),hashes)||
     !sameHashes(gate.reviewedChapterHashes,hashes)) throw new Error('PREPARED_MANUSCRIPT_CHANGED');
  const bytes=fs.readFileSync(source),report=JSON.parse(bytes.toString('utf8'));
  const errors=structuredReportValid(report,gate.revision,hashes);
  if(errors.length)throw new Error('INVALID_EDITOR_REPORT: '+errors.join(','));
  const destinationRel='reviews/pilot-review-v'+gate.revision+'.json';
  const destination=path.join(root,destinationRel);
  if(path.resolve(source)===path.resolve(destination))throw new Error('REPORT_INPUT_MUST_BE_DISTINCT_FROM_CANONICAL_OUTPUT');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,bytes,{flag:'wx'});
  gate.status=report.decision==='pass_candidate'?'awaiting_approval':'revise';
  gate.reviewPath=destinationRel;
  gate.reviewSha256=sha256(bytes);
  gate.reviewDecision=report.decision;
  gate.humanApproved=false;gate.approvedAt=null;gate.approvalPath=null;gate.approvalSha256=null;
  plan.v3.pilotGate=gate;
  atomicWritePlan(root,plan);
  console.log(JSON.stringify({status:gate.status,revision:gate.revision,reviewPath:destinationRel,
    reviewerKind:report.reviewer.kind,decision:report.decision,issues:report.issues.length},null,2));
} catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
