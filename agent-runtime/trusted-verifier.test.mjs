import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedVerifier,bindTrustedDispatch} from './trusted-verifier.mjs';
import {dispatchApprovedTask} from './dispatch.mjs';
const task={taskId:'TSY-T-901',agentId:'TSY-A0001',companyId:'TSY-GROUP',divisionId:'software',
 objective:'Safe test task',acceptanceCriteria:'Tests passed',repository:'patricktbann/Patrick-OS-Command-Centre',
 allowedActions:['read-repo','run-tests'],approvalRequired:true};
const policy={allowedRepositories:[task.repository],principalId:'patrick-id'};
const session={serverValidated:true,opaque:'server-session'};
function services(override={}){
 const state={identity:{authenticate:async()=>({subject:'approved-operator',authenticated:true})},
 registry:{loadAssignment:async()=>structuredClone(task),canDispatch:async()=>true},
 approvals:{findApprovedDecision:async()=>({status:'APPROVED',taskId:task.taskId,principalId:policy.principalId,approvalId:'decision-01',approvedAt:'2026-10-26T05:00:00Z',repository:task.repository})},
 github:{verifyIssue:async()=>({valid:true,taskId:task.taskId,agentId:task.agentId,repository:task.repository,number:4})}};
 return {...state,...override,policy};
}
const request={task:structuredClone(task),idempotencyKey:task.taskId,
 actor:{authenticated:true,subject:'attacker',canDispatch:true},
 approval:{trustedBackendVerified:true,authorizedPrincipalId:'attacker'},
 verifiedIssue:{trustedBackendVerified:true,repository:'other/repo'}};
const expectDenied=async(fn,code)=>assert.rejects(fn,e=>e?.code===code);
test('returns canonical server records, ignoring forged actor/approval/issue fields',async()=>{
 const v=createTrustedVerifier(services());
 const r=await v(request,session);
 assert.equal(r.actor.subject,'approved-operator');assert.equal(r.approval.authorizedPrincipalId,'patrick-id');
 assert.equal(r.verifiedIssue.repository,task.repository);assert.equal(r.task.taskId,task.taskId);
});
test('no server-held session denies request',async()=>{
 await expectDenied(createTrustedVerifier(services())(request,null),'SESSION_REQUIRED');
});
test('independent session authentication denied',async()=>{
 const v=createTrustedVerifier(services({identity:{authenticate:async()=>null}}));
 await expectDenied(v(request,session),'UNAUTHENTICATED');
});
test('task tamper denied before side effects',async()=>{
 const v=createTrustedVerifier(services());await expectDenied(v({...request,task:{...task,objective:'altered'}},session),'TASK_MISMATCH');
});
test('authorization scoped by company and division',async()=>{
 const v=createTrustedVerifier(services({registry:{loadAssignment:async()=>task,canDispatch:async()=>false}}));
 await expectDenied(v(request,session),'ROLE_DENIED');
});
test('no approved principal decision denies request',async()=>{
 const v=createTrustedVerifier(services({approvals:{findApprovedDecision:async()=>null}}));
 await expectDenied(v(request,session),'APPROVAL_MISSING');
});
test('mismatched GitHub issue denies request',async()=>{
 const v=createTrustedVerifier(services({github:{verifyIssue:async()=>({valid:true,number:4,taskId:task.taskId,agentId:'other',repository:task.repository})}}));
 await expectDenied(v(request,session),'ISSUE_UNVERIFIED');
});
test('repository scope cannot be crossed',async()=>{
 const v=createTrustedVerifier(services({policy:{...policy,allowedRepositories:['other/repo']}}));
 await expectDenied(v(request,session),'REPOSITORY_DENIED');
});
test('server-bound dispatcher accepts canonical records but uses mock executor only',async()=>{
 const verifyDispatch=bindTrustedDispatch(createTrustedVerifier(services()),async()=>session);
 let count=0;
 const store={reserve:async()=>({accepted:true}),markStarted:async()=>{}};
 const executor={start:async()=>{count++;return {accepted:true,runId:'synthetic-run-01',executorType:'unit-test'}}};
 const result=await dispatchApprovedTask(request,{policy,verifyDispatch,store,executor});
 assert.equal(result.status,'DISPATCH_ACCEPTED');assert.equal(count,1);
});
test('denied identity never reaches mock executor',async()=>{
 const verifyDispatch=bindTrustedDispatch(createTrustedVerifier(services({identity:{authenticate:async()=>null}})),async()=>session);
 let count=0;
 await expectDenied(dispatchApprovedTask(request,{policy,verifyDispatch,
 store:{reserve:async()=>{count++;return {accepted:true}},markStarted:async()=>{}},
 executor:{start:async()=>{count++;return {accepted:true}}}}),'UNAUTHENTICATED');
 assert.equal(count,0);
});
