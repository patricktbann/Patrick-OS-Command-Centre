import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDispatch,dispatchApprovedTask,DispatchError} from './dispatch.mjs';
const task={taskId:'TSY-T-2044',agentId:'TSY-A0001',companyId:'TSY-GROUP',divisionId:'software',
 objective:'Test a harmless feature branch',acceptanceCriteria:'Tests pass',
 repository:'patricktbann/Patrick-OS-Command-Centre',allowedActions:['read-repo','run-tests'],approvalRequired:true};
const policy={allowedRepositories:[task.repository],principalId:'patrick-authenticated'};
const input={task,actor:{authenticated:true,subject:'ops-manager',canDispatch:true},idempotencyKey:task.taskId,
 approval:{trustedBackendVerified:true,taskId:task.taskId,authorizedPrincipalId:policy.principalId,
 decision:'approve',approvalId:'approval-44',approvedAt:'2026-10-26T06:00:00Z'},
 verifiedIssue:{trustedBackendVerified:true,taskId:task.taskId,agentId:task.agentId,repository:task.repository,number:2}};
const expectCode=(f,code)=>{assert.throws(f,e=>e instanceof DispatchError&&e.code===code)};
test('explicitly scoped and authorized pilot accepted by validator',()=>{
 assert.equal(validateDispatch(input,policy).taskId,task.taskId);
});
test('deny authentication bypass',()=>expectCode(()=>validateDispatch({...input,actor:{authenticated:false}},policy),'UNAUTHENTICATED'));
test('deny repository escalation',()=>expectCode(()=>validateDispatch({...input,task:{...task,repository:'other/private'}},policy),'REPOSITORY_DENIED'));
test('deny destructive action',()=>expectCode(()=>validateDispatch({...input,task:{...task,allowedActions:['deploy']}},policy),'ACTION_DENIED'));
test('deny unapproved task',()=>expectCode(()=>validateDispatch({...input,approval:null},policy),'APPROVAL_MISSING'));
test('deny forged issue context',()=>expectCode(()=>validateDispatch({...input,verifiedIssue:{...input.verifiedIssue,agentId:'TSY-A9999'}},policy),'ASSIGNMENT_UNVERIFIED'));
test('deny replay mismatch',()=>expectCode(()=>validateDispatch({...input,idempotencyKey:'another-task'},policy),'BAD_IDEMPOTENCY_KEY'));
test('deny missing executor/store, no hidden dispatch',async()=>{
 await assert.rejects(dispatchApprovedTask(input,{policy}),e=>e.code==='NOT_CONNECTED');
});
test('mock executor dispatch records authentic-looking but synthetic run ID only in test',async()=>{
 const events=[];const store={reserve:async id=>{events.push('reserve:'+id);return {accepted:true}},
  markStarted:async (id,data)=>events.push('start:'+id+':'+data.runId)};
 const executor={start:async()=>{events.push('executor');return {accepted:true,runId:'test-run-01',executorType:'test-stub'}}};
 const result=await dispatchApprovedTask(input,{policy,store,executor});
 assert.equal(result.status,'DISPATCH_ACCEPTED');assert.equal(result.executionCompleted,false);
 assert.deepEqual(events,['reserve:'+task.taskId,'executor','start:'+task.taskId+':test-run-01']);
});
test('duplicate reservation cannot start executor again',async()=>{
 let calls=0;const store={reserve:async()=>({accepted:false}),markStarted:async()=>{}};
 const executor={start:async()=>{calls++;return {accepted:true,runId:'x',executorType:'test-stub'}}};
 const result=await dispatchApprovedTask(input,{policy,store,executor});
 assert.equal(result.status,'NOT_DISPATCHED');assert.equal(calls,0);
});
test('missing run ID requires reconciliation and no blind retry',async()=>{
 const store={reserve:async()=>({accepted:true}),markStarted:async()=>{}};
 const executor={start:async()=>({accepted:false})};
 await assert.rejects(dispatchApprovedTask(input,{policy,store,executor}),e=>e.code==='RECONCILIATION_REQUIRED');
});
