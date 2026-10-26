import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchApprovedTask} from './dispatch.mjs';
const task={taskId:'TSY-RECOVERY-001',agentId:'TSY-A0001',companyId:'TSY-GROUP',divisionId:'software',
 objective:'Safe recovery pilot',acceptanceCriteria:'No silent retry',repository:'patricktbann/Patrick-OS-Command-Centre',
 allowedActions:['run-tests'],approvalRequired:true};
const approval={trustedBackendVerified:true,taskId:task.taskId,authorizedPrincipalId:'patrick-id',decision:'approve',approvalId:'approval-1',approvedAt:'2026-10-26T02:00:00Z'};
const verifiedIssue={trustedBackendVerified:true,taskId:task.taskId,agentId:task.agentId,repository:task.repository,number:4};
const input={task,idempotencyKey:task.taskId,actor:{authenticated:true,subject:'authorized-operator',canDispatch:true},approval,verifiedIssue};
const policy={allowedRepositories:[task.repository],principalId:'patrick-id'};
const verifyDispatch=async()=>structuredClone(input);
test('ambiguous executor timeout records reconciliation and never retries',async()=>{
 const events=[];
 const store={reserve:async()=>{events.push('reserve');return {accepted:true}},markStarted:async()=>{events.push('started')},
  markReconciliationRequired:async(_,reason)=>{events.push('reconciliation:'+reason);return {recorded:true}}};
 const executor={start:async()=>{events.push('execute');throw Error('timeout after submission')}};
 await assert.rejects(dispatchApprovedTask(input,{policy,verifyDispatch,store,executor}),e=>e.code==='RECONCILIATION_REQUIRED');
 assert.deepEqual(events,['reserve','execute','reconciliation:executor_response_or_persistence_uncertain']);
});
test('failed reconciliation write fails closed and discloses missing audit',async()=>{
 const store={reserve:async()=>({accepted:true}),markStarted:async()=>{},
  markReconciliationRequired:async()=>{throw Error('storage outage')}};
 const executor={start:async()=>{throw Error('timeout')}};
 await assert.rejects(dispatchApprovedTask(input,{policy,verifyDispatch,store,executor}),
  e=>e.code==='RECONCILIATION_REQUIRED'&&e.message.includes('NOT confirmed'));
});
test('definitive successful execution does not request reconciliation',async()=>{
 let reconciliations=0;
 const store={reserve:async()=>({accepted:true}),markStarted:async()=>{},
  markReconciliationRequired:async()=>{reconciliations++}};
 const executor={start:async()=>({accepted:true,runId:'realistic-test-only',executorType:'stub'})};
 const r=await dispatchApprovedTask(input,{policy,verifyDispatch,store,executor});
 assert.equal(r.status,'DISPATCH_ACCEPTED');assert.equal(reconciliations,0);
});
