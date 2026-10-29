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
// Synthetic server fixture: never an identity verifier for production.
const verifyDispatch=async()=>structuredClone(input);
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
 await assert.rejects(dispatchApprovedTask(input,{verifyDispatch,policy}),e=>e.code==='NOT_CONNECTED');
});
test('mock executor dispatch records authentic-looking but synthetic run ID only in test',async()=>{
 const events=[];const store={reserve:async id=>{events.push('reserve:'+id);return {accepted:true}},
  markStarted:async (id,data)=>events.push('start:'+id+':'+data.runId)};
 const executor={start:async()=>{events.push('executor');return {accepted:true,runId:'test-run-01',executorType:'test-stub'}}};
 const result=await dispatchApprovedTask(input,{verifyDispatch,policy,store,executor});
 assert.equal(result.status,'DISPATCH_ACCEPTED');assert.equal(result.executionCompleted,false);
 assert.deepEqual(events,['reserve:'+task.taskId,'executor','start:'+task.taskId+':test-run-01']);
});
test('duplicate reservation cannot start executor again',async()=>{
 let calls=0;const store={reserve:async()=>({accepted:false}),markStarted:async()=>{}};
 const executor={start:async()=>{calls++;return {accepted:true,runId:'x',executorType:'test-stub'}}};
 const result=await dispatchApprovedTask(input,{verifyDispatch,policy,store,executor});
 assert.equal(result.status,'NOT_DISPATCHED');assert.equal(calls,0);
});
test('missing run ID requires reconciliation and no blind retry',async()=>{
 const store={reserve:async()=>({accepted:true}),markStarted:async()=>{}};
 const executor={start:async()=>({accepted:false})};
 await assert.rejects(dispatchApprovedTask(input,{verifyDispatch,policy,store,executor}),e=>e.code==='RECONCILIATION_REQUIRED');
});

// Request booleans must not authorize execution without independent verification.
test('forged flags cannot reach store or executor without verifier',async()=>{
 let calls=0;
 const store={reserve:async()=>{calls++;return {accepted:true}},markStarted:async()=>{calls++}};
 const executor={start:async()=>{calls++;return {accepted:true,runId:'forged-run',executorType:'test-stub'}}};
 await assert.rejects(dispatchApprovedTask(structuredClone(input),{policy,store,executor}),e=>e.code==='VERIFIER_REQUIRED');
 assert.equal(calls,0);
});

test('server rejection overrides forged client flags before side effects',async()=>{
 let calls=0;
 await assert.rejects(dispatchApprovedTask(input,{policy,
  verifyDispatch:async()=>null,store:{reserve:async()=>{calls++}},executor:{start:async()=>{calls++}}}),e=>e.code==='VERIFICATION_DENIED');
 assert.equal(calls,0);
});
for(const [name,change,code] of [
 ['unauthorized principal',v=>{v.approval.authorizedPrincipalId='attacker'},'APPROVAL_MISSING'],
 ['cross-task approval',v=>{v.approval.taskId='other-task'},'APPROVAL_MISSING'],
 ['cross-repository issue',v=>{v.verifiedIssue.repository='other/repo'},'ASSIGNMENT_UNVERIFIED'],
 ['cross-task assignment',v=>{v.task.taskId='other-task'},'VERIFICATION_DENIED'],
 ['cross-repository assignment',v=>{v.task.repository='other/repo'},'VERIFICATION_DENIED'],
 ['unauthorized dispatcher',v=>{v.actor.canDispatch=false},'UNAUTHENTICATED']
])test('authoritative verifier denies '+name,async()=>{
 let calls=0;const verified=structuredClone(input);change(verified);
 await assert.rejects(dispatchApprovedTask(input,{policy,verifyDispatch:async()=>verified,
  store:{reserve:async()=>{calls++}},executor:{start:async()=>{calls++}}}),e=>e.code===code);
 assert.equal(calls,0);
});
test('same verified request replay starts executor only once',async()=>{
 const reserved=new Set();let calls=0;
 const store={reserve:async id=>{if(reserved.has(id))return {accepted:false};reserved.add(id);return {accepted:true}},markStarted:async()=>{}};
 const executor={start:async()=>{calls++;return {accepted:true,runId:'test-run-01',executorType:'test-stub'}}};
 const results=await Promise.all([1,2].map(()=>dispatchApprovedTask(input,{policy,verifyDispatch,store,executor})));
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='NOT_DISPATCHED').length,1);
});
