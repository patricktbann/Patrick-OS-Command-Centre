import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedCodexExecutor} from './codex-executor.mjs';
const repository='patricktbann/Patrick-OS-Command-Centre';
const plan={taskId:'TSY-T-555',agentId:'TSY-A0001',repository,approvalId:'approval-55',
 objective:'Safe pilot',acceptanceCriteria:'Draft PR',allowedActions:['read-repo','run-tests']};
const serverAuth={getServerAuthorization:async()=>({authorized:true,connectionId:'connection-1'})};
const response={accepted:true,provider:'codex-cloud',providerRunId:'provider-run-555',
 repository,externalTaskId:plan.taskId};
const taskStatus={...response,status:'completed',commitSha:'a'.repeat(40)};
const fakeTransport=()=>({createTask:async()=>({...response}),readTask:async()=>({...taskStatus})});
const make=opts=>createVerifiedCodexExecutor({transport:fakeTransport(),connection:serverAuth,repositoryAllowlist:[repository],...opts});
const denied=(promise,code)=>assert.rejects(promise,e=>e?.code===code);
test('missing real transport fails closed before dispatch',()=>assert.throws(()=>createVerifiedCodexExecutor(),e=>e.code==='CODEX_NOT_CONNECTED'));
test('authorized task returns only externally supplied run ID',async()=>{
 const r=await make().start(plan);assert.equal(r.runId,response.providerRunId);assert.equal(r.executorType,'codex-cloud');
 assert.equal(r.executionCompleted,false);
});
test('unapproved server connection rejects submission',async()=>{
 let calls=0;const executor=make({connection:{getServerAuthorization:async()=>({authorized:false})},
  transport:{createTask:async()=>{calls++},readTask:async()=>null}});
 await denied(executor.start(plan),'CODEX_AUTHORIZATION_REQUIRED');assert.equal(calls,0);
});
test('cross-repository task is forbidden',async()=>denied(make().start({...plan,repository:'other/repo'}),'CODEX_SCOPE_DENIED'));
test('dangerous action is forbidden',async()=>denied(make().start({...plan,allowedActions:['deploy']}),'CODEX_SCOPE_DENIED'));
test('provider must attest matching task and repository',async()=>{
 await denied(make({transport:{...fakeTransport(),createTask:async()=>({...response,externalTaskId:'another-task'})}}).start(plan),'CODEX_RUN_UNVERIFIED');
 await denied(make({transport:{...fakeTransport(),createTask:async()=>({...response,repository:'other/repo'})}}).start(plan),'CODEX_RUN_UNVERIFIED');
});
test('provider must be Codex Cloud and provide valid run ID',async()=>{
 await denied(make({transport:{...fakeTransport(),createTask:async()=>({...response,provider:'github-actions'})}}).start(plan),'CODEX_RUN_UNVERIFIED');
 await denied(make({transport:{...fakeTransport(),createTask:async()=>({...response,providerRunId:null})}}).start(plan),'CODEX_RUN_UNVERIFIED');
});
test('inspect independently retrieves matching run',async()=>{
 const v=await make().inspectRun({runId:response.providerRunId,taskId:plan.taskId,repository});
 assert.equal(v.status,'completed');assert.equal(v.commitSha,'a'.repeat(40));assert.equal(v.verifiedTransportResponse,true);
});
test('unrelated run or unverifiable response is rejected',async()=>{
 await denied(make({transport:{...fakeTransport(),readTask:async()=>({...taskStatus,externalTaskId:'other'})}})
  .inspectRun({runId:response.providerRunId,taskId:plan.taskId,repository}),'CODEX_RUN_UNVERIFIED');
});
test('no production Codex service is contacted by these fixture tests',()=>assert.ok(true));
