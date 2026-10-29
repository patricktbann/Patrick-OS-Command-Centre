import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionBoundSdkAuthority} from './session-bound-sdk-authority.mjs';
import {taskDigest} from './task-digest.mjs';
const task={taskId:'TSY-T-956',agentId:'TSY-A0001',companyId:'TSY-GROUP',divisionId:'software',
 objective:'Fixed read-only inspection',acceptanceCriteria:'No writes',repository:'patricktbann/Patrick-OS-Command-Centre',
 allowedActions:['read-repo'],approvalRequired:true};
const policy={allowedRepositories:[task.repository],principalId:'patrick-principal'};
const request={task:structuredClone(task),idempotencyKey:task.taskId,
 actor:{authenticated:true,subject:'forged-browser',canDispatch:true},
 approval:{approvalId:'forged',taskDigest:'b'.repeat(64),trustedBackendVerified:true}};
const session=Object.freeze({serverValidated:true,opaque:'server-session'});
function make(options={}){
 let authCalls=0;
 const services={
 identity:{authenticate:async s=>{authCalls++;return s===session?{subject:'trusted-operator',authenticated:true}:null}},
 registry:{loadAssignment:async()=>structuredClone(task),canDispatch:async()=>true},
 approvals:{findApprovedDecision:async()=>({status:'APPROVED',taskId:task.taskId,principalId:policy.principalId,
  approvalId:'real-approval',taskDigest:taskDigest(task),approvedAt:'2026-10-27T04:00:00Z',repository:task.repository})},
 github:{verifyIssue:async()=>({valid:true,taskId:task.taskId,agentId:task.agentId,repository:task.repository,number:18})},
 sessionProvider:async()=>session,policy,...options};
 return {authority:createSessionBoundSdkAuthority(services),calls:()=>authCalls};
}
test('trusted server session binds canonical digest, discards forged browser claims',async()=>{
 const {authority,calls}=make();
 const verified=await authority.verifyAndBind(request);
 assert.equal(calls(),1);assert.equal(verified.actor.subject,'trusted-operator');
 assert.equal(verified.approval.taskDigest,taskDigest(task));
 assert.equal(verified.approval.approvalId,'real-approval');
 assert.notEqual(verified.approval.taskDigest,request.approval.taskDigest);
});
test('no configured session provider is denied',()=>{
 assert.throws(()=>createSessionBoundSdkAuthority({policy}),e=>e.code==='SESSION_SERVICE_UNAVAILABLE');
});
test('expired/missing server-held session is denied',async()=>{
 const {authority}=make({sessionProvider:async()=>null});
 await assert.rejects(authority.verifyAndBind(request),e=>e.code==='SESSION_REQUIRED');
});
test('client-supplied session marker is irrelevant and denied by independent identity',async()=>{
 const {authority}=make({sessionProvider:async()=>({serverValidated:true,opaque:'browser-copy'})});
 await assert.rejects(authority.verifyAndBind({...request,session}),e=>e.code==='UNAUTHENTICATED');
});
test('changed immutable assignment is denied',async()=>{
 const {authority}=make();
 await assert.rejects(authority.verifyAndBind({...request,task:{...task,objective:'changed'}}),e=>e.code==='TASK_MISMATCH');
});
test('revoked principal approval denies before SDK execution',async()=>{
 const {authority}=make({approvals:{findApprovedDecision:async()=>null}});
 await assert.rejects(authority.verifyAndBind(request),e=>e.code==='APPROVAL_MISSING');
});
test('unauthorized division actor cannot dispatch',async()=>{
 const {authority}=make({registry:{loadAssignment:async()=>task,canDispatch:async()=>false}});
 await assert.rejects(authority.verifyAndBind(request),e=>e.code==='ROLE_DENIED');
});
