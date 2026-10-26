import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileKnownExecutorRun} from './reconcile-run.mjs';
const request={taskId:'TSY-T-90',repository:'patricktbann/Patrick-OS-Command-Centre',runId:'codex-90',
 operator:{subject:'ops-1'},reason:'response timeout'};
const evidence={verifiedTransportResponse:true,runId:request.runId,taskId:request.taskId,
 repository:request.repository,executorType:'codex-cloud',status:'running'};
function deps(overrides={}){
 let started=0,recorded=0;
 const value={authorizeOperator:async()=>true,
  executor:{inspectRun:async()=>({...evidence})},
  store:{confirmReconciledRun:async()=>({recorded:true})}};
 return {...value,...overrides};
}
const reject=(promise,code)=>assert.rejects(promise,e=>e?.code===code);
test('confirmed run recovered without starting another executor',async()=>{
 const result=await reconcileKnownExecutorRun(request,deps());
 assert.equal(result.state,'EXECUTING');assert.equal(result.runId,'codex-90');
 assert.equal(result.approvalForRelease,false);
});
test('no recovery transport blocks',async()=>reject(reconcileKnownExecutorRun(request,{}),'RECOVERY_NOT_CONNECTED'));
test('unauthorized operator blocks before provider lookup',async()=>{
 let calls=0;const d=deps({authorizeOperator:async()=>false,executor:{inspectRun:async()=>{calls++}}});
 await reject(reconcileKnownExecutorRun(request,d),'RECOVERY_UNAUTHORIZED');assert.equal(calls,0);
});
test('forged or cross-task run response denied',async()=>{
 const d=deps({executor:{inspectRun:async()=>({...evidence,taskId:'other-task'})}});
 await reject(reconcileKnownExecutorRun(request,d),'RUN_EVIDENCE_REJECTED');
});
test('non-Codex provider evidence denied',async()=>{
 const d=deps({executor:{inspectRun:async()=>({...evidence,executorType:'github-actions'})}});
 await reject(reconcileKnownExecutorRun(request,d),'RUN_EVIDENCE_REJECTED');
});
test('failed provider runs not automatically recovered',async()=>{
 const d=deps({executor:{inspectRun:async()=>({...evidence,status:'failed'})}});
 await reject(reconcileKnownExecutorRun(request,d),'RUN_EVIDENCE_REJECTED');
});
test('database write failure reported; no false recovery',async()=>{
 const d=deps({store:{confirmReconciledRun:async()=>({recorded:false})}});
 await reject(reconcileKnownExecutorRun(request,d),'RECOVERY_NOT_RECORDED');
});
test('source verifies exact repository and run',async()=>{
 const d=deps({executor:{inspectRun:async()=>({...evidence,repository:'other/repo'})}});
 await reject(reconcileKnownExecutorRun(request,d),'RUN_EVIDENCE_REJECTED');
});
test('reconciled completed provider run still needs release approval',async()=>{
 const d=deps({executor:{inspectRun:async()=>({...evidence,status:'completed'})}});
 const result=await reconcileKnownExecutorRun(request,d);
 assert.equal(result.executionCompleted,true);assert.equal(result.approvalForRelease,false);
});
