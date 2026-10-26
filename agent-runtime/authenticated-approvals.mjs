/**
 * Server-only principal approval gateway.
 * HTTP handlers must supply the session from their trusted server session context,
 * never from client-submitted JSON. Authentication/assignment stores are injected.
 */
import {DispatchError} from './dispatch.mjs';
import {taskDigest} from './task-digest.mjs';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(x);
const reject=(code,message)=>{throw new DispatchError(code,message)};
export function createAuthenticatedApprovalService({identity,registry,approvals,principalId,clock}={}){
 if(typeof identity?.authenticate!=='function'||typeof registry?.loadAssignment!=='function'||
    typeof approvals?.approve!=='function'||typeof approvals?.revoke!=='function'||
    !validId(principalId)||typeof clock!=='function')
   reject('APPROVAL_SERVICE_UNAVAILABLE','Authenticated approval components missing');
 const authenticatePrincipal=async session=>{
   if(!session||session.serverValidated!==true)
     reject('APPROVAL_AUTH_REQUIRED','Server-side session required');
   // Identity implementation MUST verify server-side session; marker alone is not proof.
   const actor=await identity.authenticate(session);
   if(!actor||actor.authenticated!==true||actor.subject!==principalId)
     reject('APPROVAL_FORBIDDEN','Only authenticated designated principal can approve');
   return actor.subject;
 };
 return Object.freeze({
  async approveTask({taskId,approvalId}={},serverSession){
   const principal=await authenticatePrincipal(serverSession);
   if(!validId(taskId)||!validId(approvalId))
     reject('INVALID_APPROVAL_REQUEST','Invalid task or approval ID');
   const assignment=await registry.loadAssignment(taskId);
   if(!assignment||assignment.taskId!==taskId||assignment.approvalRequired!==true)
     reject('INVALID_APPROVAL_REQUEST','No immutable approval-required task');
   if(!validId(assignment.agentId)||typeof assignment.repository!=='string')
     reject('INVALID_APPROVAL_REQUEST','Task assignment incomplete');
   const current=clock();
   if(!(current instanceof Date)||!Number.isFinite(current.getTime()))
     reject('APPROVAL_CLOCK_INVALID','Untrusted approval timestamp');
   // Caller cannot supply task, approval status, principal identity or timestamp.
   return approvals.approve({approvalId,task:structuredClone(assignment),
     principalId:principal,principalAuthenticated:true,approvedAt:current.toISOString()});
  },
  async revokeApproval({approvalId}={},serverSession){
   const principal=await authenticatePrincipal(serverSession);
   if(!validId(approvalId))reject('INVALID_APPROVAL_REQUEST','Invalid approval ID');
   return approvals.revoke({approvalId,principalId:principal,principalAuthenticated:true});
  },
  async getCurrentTaskDigest(taskId,serverSession){
   await authenticatePrincipal(serverSession);
   if(!validId(taskId))reject('INVALID_APPROVAL_REQUEST','Invalid task');
   const assignment=await registry.loadAssignment(taskId);
   if(!assignment||assignment.taskId!==taskId)
     reject('INVALID_APPROVAL_REQUEST','No task assignment');
   return {taskId,digest:taskDigest(assignment)};
  }
 });
}
