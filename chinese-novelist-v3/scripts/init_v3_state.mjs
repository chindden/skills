#!/usr/bin/env node
/** Add safe V3 defaults to an existing, approved upstream writing-plan file. */
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot, readPlan, atomicWritePlan} from './v3_common.mjs';

const rootArg = process.argv[2], asJson = process.argv.includes('--json');
try {
  if (!rootArg || process.argv.slice(3).some(x=>x!=='--json')) throw new Error('Usage: init_v3_state.mjs <project-dir> [--json]');
  const root=projectRoot(rootArg), plan=readPlan(root);
  if (plan.v3) {
    if(plan.v3.schemaVersion !== 1)throw new Error('Existing unsupported v3 schemaVersion; refuse to overwrite');
    console.log(JSON.stringify({status:'unchanged',project:root}));
  } else {
    plan.v3={
      schemaVersion:1, creativeDecision:'pending', storyPlanApproved:false,
      pilotGate:{status:'pending', revision:0, reviewInputPath:null, reviewPath:null, reviewSha256:null,
        reviewedChapterHashes:{}, reviewDecision:null, approvedAt:null, approvalPath:null,
        approvalSha256:null, humanApproved:false},
      backup:{lastVerifiedSnapshot:null}
    };
    atomicWritePlan(root,plan);
    const ledgerFile=path.join(root,'story-ledger.json');
    if(!fs.existsSync(ledgerFile))fs.writeFileSync(ledgerFile,JSON.stringify({schemaVersion:1,facts:[],foreshadowing:[],relationships:[],mechanisms:[],handoffs:[]},null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'initialized',project:root,note:'Creative and story approval remain pending; do not auto-approve.'}));
  }
} catch(e){console.log(JSON.stringify({status:'error',error:e.message}));process.exitCode=2;}
