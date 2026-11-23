#!/usr/bin/env node
/** Add safe V3 defaults to an existing, approved upstream writing-plan file. */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot, readPlan, atomicWritePlan} from './v3_common.mjs';
import {r2State} from './r2_review_common.mjs';
import {planGateState} from './plan_review_common.mjs';

const rootArg = process.argv[2], asJson = process.argv.includes('--json');
const enableR2 = process.argv.includes('--enable-r2');
const enablePlanGate = process.argv.includes('--enable-plan-gate');
try {
  if (!rootArg || process.argv.slice(3).some(x=>!['--json','--enable-r2','--enable-plan-gate'].includes(x))) throw new Error('Usage: init_v3_state.mjs <project-dir> [--json]');
  const root=projectRoot(rootArg), plan=readPlan(root);
  if (plan.v3) {
    if(plan.v3.schemaVersion !== 1)throw new Error('Existing unsupported v3 schemaVersion; refuse to overwrite');
    const added=[];
    if(enableR2 && !plan.v3.r2){plan.v3.r2=r2State();added.push('r2');}
    // Existing plans must opt in explicitly; never fabricate historical plan reviews.
    if(enablePlanGate && !plan.v3.planGate){plan.v3.planGate=planGateState();plan.v3.storyPlanApproved=false;added.push('planGate');}
    if(added.length)atomicWritePlan(root,plan);
    console.log(JSON.stringify({status:added.length?'enabled':'unchanged',added,project:root,
      note:'Only fresh, source-backed plan review and author approval may pass an enabled plan gate.'}));
  } else {
    plan.v3={
      schemaVersion:1, creativeDecision:'pending', storyPlanApproved:false,
      pilotGate:{status:'pending', revision:0, reviewInputPath:null, reviewPath:null, reviewSha256:null,
        reviewedChapterHashes:{}, reviewDecision:null, approvedAt:null, approvalPath:null,
        approvalSha256:null, humanApproved:false},
      r2:r2State(),
      planGate:planGateState(),
      backup:{lastVerifiedSnapshot:null}
    };
    atomicWritePlan(root,plan);
    const ledgerFile=path.join(root,'story-ledger.json');
    if(!fs.existsSync(ledgerFile))fs.writeFileSync(ledgerFile,JSON.stringify({schemaVersion:1,facts:[],foreshadowing:[],relationships:[],mechanisms:[],handoffs:[]},null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'initialized',project:root,note:'Creative and story approval remain pending; do not auto-approve.'}));
  }
} catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
