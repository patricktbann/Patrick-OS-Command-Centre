import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedApprovalService} from './authenticated-approvals.mjs';
const task={taskId:'TSY-APP-777',agentId:'TSY-A0001',repository:'patricktbann/Patrick-OS-Command-Centre',approvalRequired:true,objective:'Safe UAT'};
const principalId='patrick-auth';
const serverSession={serverValidated:true,opaque:'test-server-held-session'};
function fixture({actor={authenticated:true,subject:principalId},assignment=task}={}){
 const events=[];
 const service=createAuthenticatedApprovalService({
  identity:{authenticate:async()=>actor},registry:{loadAssignment:async()=>structuredClone(assignment)},
  approvals:{
   approve:async data=>{events.push({action:'approve',data});return {status:'APPROVED',approvalId:data.approvalId}},
   revoke:async data=>{events.push({action:'revoke',data});return {status:'REVOKED'}}
  },principalId,clock:()=>new Date('2026-10-26T12:00:00.000Z')});
 return {service,events};
}
const denied=(fn,code)=>assert.rejects(fn,e=>e?.code===code);
test('authenticates principal independently and approves canonical stored task only',async()=>{
 const {service,events}=fixture();
 const result=await service.approveTask({taskId:task.taskId,approvalId:'approval-777',principalId:'attacker',
  principalAuthenticated:true,task:{...task,objective:'forged'},approvedAt:'2000-01-01'},serverSession);
 assert.equal(result.status,'APPROVED');
 assert.equal(events[0].data.task.objective,task.objective);
 assert.equal(events[0].data.principalId,principalId);
 assert.equal(events[0].data.approvedAt,'2026-10-26T12:00:00.000Z');
});
test('rejects absent server session',async()=>{
 const {service,events}=fixture();await denied(service.approveTask({taskId:task.taskId,approvalId:'approval-777'},null),'APPROVAL_AUTH_REQUIRED');
 assert.equal(events.length,0);
});
test('attacker identity cannot approve even with forged flag',async()=>{
 const {service,events}=fixture({actor:{authenticated:true,subject:'attacker'}});
 await denied(service.approveTask({taskId:task.taskId,approvalId:'approval-777',principalAuthenticated:true},serverSession),'APPROVAL_FORBIDDEN');
 assert.equal(events.length,0);
});
test('denied identity cannot revoke',async()=>{
 const {service,events}=fixture({actor:null});
 await denied(service.revokeApproval({approvalId:'approval-777'},serverSession),'APPROVAL_FORBIDDEN');
 assert.equal(events.length,0);
});
test('approved revocation derives principal identity from server',async()=>{
 const {service,events}=fixture();await service.revokeApproval({approvalId:'approval-777',principalId:'attacker'},serverSession);
 assert.deepEqual(events[0].data,{approvalId:'approval-777',principalId,principalAuthenticated:true});
});
test('rejects task without approvalRequired policy',async()=>{
 const {service,events}=fixture({assignment:{...task,approvalRequired:false}});
 await denied(service.approveTask({taskId:task.taskId,approvalId:'approval-777'},serverSession),'INVALID_APPROVAL_REQUEST');
 assert.equal(events.length,0);
});
test('rejects wrong task from registry',async()=>{
 const {service,events}=fixture({assignment:{...task,taskId:'other-task'}});
 await denied(service.approveTask({taskId:task.taskId,approvalId:'approval-777'},serverSession),'INVALID_APPROVAL_REQUEST');
 assert.equal(events.length,0);
});
test('missing independent auth service is configuration failure',()=>assert.throws(
 ()=>createAuthenticatedApprovalService({principalId,clock:()=>new Date()}),e=>e.code==='APPROVAL_SERVICE_UNAVAILABLE'));
