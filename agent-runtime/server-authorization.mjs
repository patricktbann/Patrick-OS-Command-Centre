/**
 * V3.5 server-only verification composition.
 * Never expose this module through client-side bundles.
 * Adapters MUST be constructed in trusted server code using authenticated sessions,
 * privileged storage, and an authenticated GitHub API.
 */
import {isDeepStrictEqual} from 'node:util';
import {validateAssignment} from './evidence.mjs';

export class AuthorizationError extends Error{
 constructor(code,message){super(message);this.name='AuthorizationError';this.code=code}
}
const fail=(code,message)=>{throw new AuthorizationError(code,message)};
const validNumber=x=>Number.isSafeInteger(x)&&x>0;

/**
 * Dependencies:
 * session.authenticate(context) -> {subject,authenticated,canDispatch}
 * registry.getTask(taskId) -> canonical immutable persisted assignment or null
 * approvalStore.getApproval(taskId) -> backend-recorded approval or null
 * github.getIssue(repository, issueNumber) -> GitHub API issue object
 * principalId -> server-configured principal, never request-provided
 *
 * Authorization flags on untrusted request are ignored. The returned trust flags
 * are derived solely from server-side checks; they are NOT portable credentials.
 */
export function makeServerDispatchVerifier({session,registry,approvalStore,github,principalId}={}){
 if(!session?.authenticate||!registry?.getTask||!approvalStore?.getApproval||!github?.getIssue||
    typeof principalId!=='string'||!principalId)
   throw new AuthorizationError('MISSING_DEPENDENCY','Server identity/registry/approval/GitHub adapters required');
 return async function verifyDispatch(untrusted){
   const taskId=untrusted?.task?.taskId;
   if(typeof taskId!=='string'||!taskId||taskId!==untrusted?.idempotencyKey)
     fail('INVALID_REQUEST','Exact task ID/idempotency binding required');
   // Identity is derived from server-authenticated request context held in closure,
   // NOT copied from untrusted.actor.
   const actor=await session.authenticate();
   if(!actor||actor.authenticated!==true||actor.canDispatch!==true||
      typeof actor.subject!=='string'||!actor.subject)
     fail('IDENTITY_DENIED','Authenticated authorized dispatcher required');
   const persisted=await registry.getTask(taskId);
   if(!persisted||!validateAssignment(persisted).ok||
      typeof persisted.revision!=='string'||!persisted.revision.trim())
     fail('UNKNOWN_TASK','Canonical assignment missing, unversioned or invalid');
   if(!isDeepStrictEqual(untrusted.task,persisted))
     fail('SCOPE_MISMATCH','Request does not match persisted approved assignment');
   const approval=await approvalStore.getApproval(taskId);
   if(!approval||approval.taskId!==taskId||approval.authorizedPrincipalId!==principalId||
      approval.decision!=='approve'||typeof approval.approvalId!=='string'||!approval.approvalId||
      !Number.isFinite(Date.parse(approval.approvedAt))||
      approval.repository!==persisted.repository||approval.agentId!==persisted.agentId||
      approval.assignmentRevision!==persisted.revision)
     fail('APPROVAL_DENIED','Approval missing, changed, or not principal-authorized');
   if(!validNumber(persisted.issueNumber))
     fail('ISSUE_MISSING','Persisted issue number required');
   const issue=await github.getIssue(persisted.repository,persisted.issueNumber);
   // Provider response must have been fetched through trusted authenticated GitHub adapter.
   if(!issue||issue.pull_request||issue.number!==persisted.issueNumber||
      issue.state!=='open'||issue.repository!==persisted.repository||
      typeof issue.body!=='string'||!issue.body.includes(persisted.taskId)||
      !issue.body.includes(persisted.agentId))
     fail('ISSUE_MISMATCH','GitHub issue does not match canonical assignment');
   return {
     task:structuredClone(persisted),
     actor:{authenticated:true,canDispatch:true,subject:actor.subject},
     idempotencyKey:taskId,
     approval:{trustedBackendVerified:true,taskId,authorizedPrincipalId:principalId,
       decision:'approve',approvalId:approval.approvalId,approvedAt:approval.approvedAt},
     verifiedIssue:{trustedBackendVerified:true,taskId,agentId:persisted.agentId,
       repository:persisted.repository,number:issue.number}
   };
 };
}
