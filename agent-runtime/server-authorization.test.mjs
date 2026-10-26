import test from 'node:test';
import assert from 'node:assert/strict';
import {makeServerDispatchVerifier,AuthorizationError} from './server-authorization.mjs';
import {dispatchApprovedTask} from './dispatch.mjs';
const task={taskId:'TSY-T-3001',agentId:'TSY-A0001',companyId:'TSY-GROUP',divisionId:'software',
 repository:'patricktbann/Patrick-OS-Command-Centre',objective:'Test authorization',
 acceptanceCriteria:'Safe task',allowedActions:['run-tests'],approvalRequired:true,
 issueNumber:4,revision:'rev-001'};
const policy={allowedRepositories:[task.repository],principalId:'patrick-server-user'};
const approval={approvalId:'approval-001',taskId:task.taskId,agentId:task.agentId,
 authorizedPrincipalId:policy.principalId,repository:task.repository,assignmentRevision:task.revision,
 decision:'approve',approvedAt:'2026-10-26T08:00:00Z'};
const issue={number:4,repository:task.repository,state:'open',body:'Task ID TSY-T-3001 Assigned agent ID TSY-A0001'};
const input={task:structuredClone(task),idempotencyKey:task.taskId,
 actor:{authenticated:true,subject:'attacker',canDispatch:true},
 approval:{trustedBackendVerified:true,decision:'approve'},verifiedIssue:{trustedBackendVerified:true}};
function setup(changes={}){
 let calls=[];
 const deps={principalId:policy.principalId,
 session:{authenticate:async()=>{calls.push('session');return {subject:'server-operator',authenticated:true,canDispatch:true}}},
 registry:{getTask:async()=>{calls.push('task');return structuredClone(task)}},
 approvalStore:{getApproval:async()=>{calls.push('approval');return structuredClone(approval)}},
 github:{getIssue:async()=>{calls.push('github');return structuredClone(issue)}}};
 for(const [k,v] of Object.entries(changes))deps[k]=v;
 return {verify:makeServerDispatchVerifier(deps),calls};
}
test('successful authorization creates canonical records ignoring browser trust flags',async()=>{
 const {verify}=setup();const actual=await verify(input);
 assert.equal(actual.actor.subject,'server-operator');
 assert.equal(actual.approval.trustedBackendVerified,true);
 assert.equal(actual.task.taskId,task.taskId);
});
test('client booleans do not provide authentication',async()=>{
 const {verify}=setup({session:{authenticate:async()=>({authenticated:false,canDispatch:true,subject:'attacker'})}});
 await assert.rejects(verify(input),e=>e.code==='IDENTITY_DENIED');
});
test('independent role denies dispatch',async()=>{
 const {verify}=setup({session:{authenticate:async()=>({authenticated:true,canDispatch:false,subject:'operator'})}});
 await assert.rejects(verify(input),e=>e.code==='IDENTITY_DENIED');
});
test('reject missing server dependency',()=>assert.throws(()=>makeServerDispatchVerifier({}),e=>e.code==='MISSING_DEPENDENCY'));
test('reject altered task scope',async()=>{
 const {verify}=setup();await assert.rejects(verify({...input,task:{...task,allowedActions:['deploy']}}),e=>e.code==='SCOPE_MISMATCH');
});
test('reject principal impersonation',async()=>{
 const {verify}=setup({approvalStore:{getApproval:async()=>({...approval,authorizedPrincipalId:'attacker'})}});
 await assert.rejects(verify(input),e=>e.code==='APPROVAL_DENIED');
});
test('reject changed approval revision',async()=>{
 const {verify}=setup({approvalStore:{getApproval:async()=>({...approval,assignmentRevision:'rev-older'})}});
 await assert.rejects(verify(input),e=>e.code==='APPROVAL_DENIED');
});
test('reject approval for wrong agent or repository',async()=>{
 for(const change of [{agentId:'TSY-A0999'},{repository:'other/repo'}]){
  const {verify}=setup({approvalStore:{getApproval:async()=>({...approval,...change})}});
  await assert.rejects(verify(input),e=>e.code==='APPROVAL_DENIED');
 }
});
test('reject GitHub mismatch or pull request masquerading as issue',async()=>{
 for(const change of [{repository:'other/repo'},{pull_request:{}},{number:5},{body:'unrelated'}]){
  const {verify}=setup({github:{getIssue:async()=>({...issue,...change})}});
  await assert.rejects(verify(input),e=>e.code==='ISSUE_MISMATCH');
 }
});
test('reject altered idempotency task ID',async()=>{
 const {verify}=setup();await assert.rejects(verify({...input,idempotencyKey:'other'}),e=>e.code==='INVALID_REQUEST');
});
test('end-to-end dispatch requires backend verifier and only invokes test executor once',async()=>{
 const {verify}=setup();const calls=[];
 const store={reserve:async x=>{calls.push('reserve');return {accepted:true}},markStarted:async()=>{calls.push('record')}};
 const executor={start:async()=>{calls.push('execute');return {accepted:true,runId:'mock-run',executorType:'test-stub'}}};
 const result=await dispatchApprovedTask(input,{verifyDispatch:verify,policy,store,executor});
 assert.equal(result.status,'DISPATCH_ACCEPTED');
 assert.deepEqual(calls,['reserve','execute','record']);
});
test('server verifier denial causes no reservation or execution',async()=>{
 const {verify}=setup({session:{authenticate:async()=>null}});
 let touched=false;
 await assert.rejects(dispatchApprovedTask(input,{verifyDispatch:verify,policy,
  store:{reserve:async()=>{touched=true},markStarted:async()=>{touched=true}},
  executor:{start:async()=>{touched=true}}}),e=>e.code==='IDENTITY_DENIED');
 assert.equal(touched,false);
});
