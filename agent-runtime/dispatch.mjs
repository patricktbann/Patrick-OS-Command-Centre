/**
 * TSY Group V3.5 — server-side dispatch gate.
 * Inert until a real authenticated executor and durable store are injected.
 * Do NOT import this module into public GitHub Pages.
 */
import {isDeepStrictEqual} from 'node:util';
import {validateAssignment} from './evidence.mjs';
const ALLOWED=new Set(['read-repo','create-branch','edit-feature-branch','run-tests','open-draft-pr']);
const RESTRICTED=new Set(['merge-pr','deploy','modify-production','delete-data','spend-money','sign-contract','transfer-ip']);
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(x);
export class DispatchError extends Error{constructor(code,message){super(message);this.name='DispatchError';this.code=code}}
// Structural checks only: this helper does not authenticate caller-supplied fields.
export function validateDispatch(input,policy){
  const assignment=input?.task,actor=input?.actor,approval=input?.approval;
  const v=validateAssignment(assignment);
  if(!v.ok)throw new DispatchError('INVALID_TASK',v.errors.join('; '));
  if(!policy||!Array.isArray(policy.allowedRepositories)||!policy.allowedRepositories.includes(assignment.repository))
    throw new DispatchError('REPOSITORY_DENIED','Repository not explicitly allowed');
  if(!actor||actor.authenticated!==true||!safeId(actor.subject)||actor.canDispatch!==true)
    throw new DispatchError('UNAUTHENTICATED','Authenticated dispatcher with explicit role required');
  if(!safeId(input.idempotencyKey)||input.idempotencyKey!==assignment.taskId)
    throw new DispatchError('BAD_IDEMPOTENCY_KEY','Use exact task ID as idempotency key');
  if(!Array.isArray(assignment.allowedActions)||assignment.allowedActions.length===0||
      assignment.allowedActions.some(a=>!ALLOWED.has(a)||RESTRICTED.has(a)))
    throw new DispatchError('ACTION_DENIED','At least one explicitly permitted non-destructive action required');
  if(assignment.approvalRequired!==true)
    throw new DispatchError('APPROVAL_POLICY','Pilot requires explicit principal approval');
  if(!approval||approval.trustedBackendVerified!==true||approval.taskId!==assignment.taskId||
     approval.authorizedPrincipalId!==policy.principalId||approval.decision!=='approve'||
     !safeId(approval.approvalId)||!Number.isFinite(Date.parse(approval.approvedAt)))
    throw new DispatchError('APPROVAL_MISSING','Server-verified Patrick approval required');
  if(!input.verifiedIssue||input.verifiedIssue.taskId!==assignment.taskId||
     input.verifiedIssue.agentId!==assignment.agentId||
     input.verifiedIssue.repository!==assignment.repository||
     input.verifiedIssue.trustedBackendVerified!==true)
    throw new DispatchError('ASSIGNMENT_UNVERIFIED','Trusted repository issue verification required');
  return Object.freeze({taskId:assignment.taskId,agentId:assignment.agentId,
    repository:assignment.repository,objective:assignment.objective,
    acceptanceCriteria:assignment.acceptanceCriteria,
    allowedActions:Object.freeze([...assignment.allowedActions]),approvalId:approval.approvalId,
    issueNumber:input.verifiedIssue.number});
}
/**
 * Transport methods must be supplied by authenticated server:
 * store.reserve(taskId), store.markStarted(taskId,result), executor.start(plan).
 * Stores must atomically reserve and durably commit. Never use browser localStorage.
 */
export async function dispatchApprovedTask(input,{policy,store,executor,verifyDispatch}={}){
 // Snapshot before awaiting: callers cannot change scope during verification.
 const request=structuredClone(input);
 if(typeof verifyDispatch!=='function')
   throw new DispatchError('VERIFIER_REQUIRED','Independent server authorization verifier required');
 // This dependency belongs to the server composition root, never request JSON.
 // It must authenticate the session and load approval + issue + assignment from
 // authoritative storage. Returning the request unchanged is NOT verification.
 const verified=structuredClone(await verifyDispatch(structuredClone(request)));
 if(!verified||!isDeepStrictEqual(verified.task,request?.task)||
    verified.idempotencyKey!==request?.idempotencyKey)
   throw new DispatchError('VERIFICATION_DENIED','Authoritative assignment does not match request');
 const plan=validateDispatch(verified,policy);
 if(typeof store?.reserve!=='function'||typeof store?.markStarted!=='function'||
    typeof executor?.start!=='function')
   throw new DispatchError('NOT_CONNECTED','Durable store and authenticated executor missing');
 const reserve=await store.reserve(plan.taskId);
 if(!reserve||reserve.accepted!==true)
   return {status:'NOT_DISPATCHED',reason:'Task already reserved or not accepted',taskId:plan.taskId};
 // Failure intentionally stays reserved for explicit reconciliation: do not silently retry.
 try{
   const run=await executor.start(plan);
   if(!run||run.accepted!==true||!safeId(run.runId)||!safeId(run.executorType))
      throw new DispatchError('EXECUTOR_UNCONFIRMED','Executor did not return accepted run ID');
   await store.markStarted(plan.taskId,{runId:run.runId,executorType:run.executorType,
     startedAt:new Date().toISOString(),approvalId:plan.approvalId});
   return {status:'DISPATCH_ACCEPTED',taskId:plan.taskId,runId:run.runId,
     executorType:run.executorType,executionCompleted:false};
 }catch(error){
   // Caller must inspect durable reservation and reconcile remote run before retry.
   throw new DispatchError('RECONCILIATION_REQUIRED',
     'Reserved task cannot be safely retried without checking executor: '+String(error.message||error));
 }
}
