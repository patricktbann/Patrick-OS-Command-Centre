/**
 * Server-only authorization composition.
 * Creates canonical dispatch records from authenticated independent services.
 * NEVER pass request-supplied authentication booleans or approvals through.
 */
import {isDeepStrictEqual} from 'node:util';
import {DispatchError} from './dispatch.mjs';
import {taskDigest} from './task-digest.mjs';
const ID=/^[A-Za-z0-9][\w.:-]{1,119}$/;
const validId=s=>typeof s==='string'&&ID.test(s);
function deny(code,detail){throw new DispatchError(code,detail)}
function assertService(s,methods){for(const m of methods)if(typeof s?.[m]!=='function')deny('BACKEND_NOT_READY','Missing trusted '+m+' service')}
export function createTrustedVerifier({identity,registry,approvals,github,policy}={}){
 assertService(identity,['authenticate']);
 assertService(registry,['loadAssignment','canDispatch']);
 assertService(approvals,['findApprovedDecision']);
 assertService(github,['verifyIssue']);
 if(!policy||!Array.isArray(policy.allowedRepositories)||!validId(policy.principalId))
   deny('BACKEND_NOT_READY','Missing governed repository and principal policy');
 return async function verifyDispatch(request,session){
   // 'session' must be a server-held authenticated session handle, not request JSON.
   if(!session||typeof session!=='object'||session.serverValidated!==true)
     deny('SESSION_REQUIRED','Verified server session required');
   const auth=await identity.authenticate(session);
   if(!auth||auth.authenticated!==true||!validId(auth.subject))
     deny('UNAUTHENTICATED','Independent session authentication failed');
   const requestedId=request?.task?.taskId;
   if(!validId(requestedId)||request.idempotencyKey!==requestedId)
     deny('TASK_MISMATCH','Task identity mismatch');
   const stored=await registry.loadAssignment(requestedId);
   if(!stored||stored.taskId!==requestedId||!isDeepStrictEqual(stored,request.task))
     deny('TASK_MISMATCH','Immutable task record does not match the request');
   if(!policy.allowedRepositories.includes(stored.repository))
     deny('REPOSITORY_DENIED','Repository not approved');
   if(await registry.canDispatch(auth.subject,stored.companyId,stored.divisionId)!==true)
     deny('ROLE_DENIED','Dispatcher is not authorized for company and division');
   const decision=await approvals.findApprovedDecision(stored.taskId,policy.principalId);
   if(!decision||decision.status!=='APPROVED'||decision.taskId!==stored.taskId||
      decision.principalId!==policy.principalId||!validId(decision.approvalId)||
      decision.taskDigest!==taskDigest(stored)||
      !Number.isFinite(Date.parse(decision.approvedAt))||
      (decision.repository&&decision.repository!==stored.repository))
     deny('APPROVAL_MISSING','No recorded principal approval for this task');
   const issue=await github.verifyIssue(stored.taskId,stored.agentId,stored.repository);
   if(!issue||issue.valid!==true||!Number.isSafeInteger(issue.number)||issue.number<1||
      issue.taskId!==stored.taskId||issue.agentId!==stored.agentId||
      issue.repository!==stored.repository)
     deny('ISSUE_UNVERIFIED','No matching server-verified GitHub assignment');
   // Source authoritative records; client actor/approval/issue booleans are discarded.
   return {
     task:structuredClone(stored),idempotencyKey:stored.taskId,
     actor:{subject:auth.subject,authenticated:true,canDispatch:true},
     approval:{trustedBackendVerified:true,taskId:stored.taskId,authorizedPrincipalId:decision.principalId,
       decision:'approve',approvalId:decision.approvalId,approvedAt:decision.approvedAt,
       taskDigest:decision.taskDigest},
     verifiedIssue:{trustedBackendVerified:true,taskId:stored.taskId,agentId:stored.agentId,
       repository:stored.repository,number:issue.number}
   };
 };
}
/** Only server-side composition passes session to the verifier. */
export function bindTrustedDispatch(verifier,sessionProvider){
 if(typeof verifier!=='function'||typeof sessionProvider!=='function')deny('BACKEND_NOT_READY','Session composition missing');
 return async request=>verifier(request,await sessionProvider());
}
