/** Private-host V3.5 task-to-SDK UAT composition.
 * No HTTP endpoint, browser flags, credentials, or production startup.
 * The connection is FAIL-CLOSED until identity, approval and durable audit
 * services are genuinely supplied by a trusted private server.
 */
import {isDeepStrictEqual} from 'node:util';
import {validateDispatch,DispatchError} from './dispatch.mjs';
import {runLocalCodexReadOnlyUat} from './local-sdk-bridge.mjs';
const deny=(code,message)=>{throw new DispatchError(code,message)};
const EXACT_ACTIONS=['read-repo'];
export function createGovernedLocalInspection({policy,authority,store,runSdk=runLocalCodexReadOnlyUat,paths}={}){
 if(!policy?.allowedRepositories?.includes('patricktbann/Patrick-OS-Command-Centre')||
    !policy?.principalId||typeof authority?.verifyAndBind!=='function'||
    typeof store?.reserveWithCurrentApproval!=='function'||
    typeof store?.recordOutcome!=='function'||
    typeof store?.quarantine!=='function'||
    typeof runSdk!=='function')
   deny('GOVERNED_SDK_NOT_CONNECTED','Trusted identity, atomic approval reservation, and durable audit required');
 return Object.freeze({
  async inspect(request){
   const snapshot=structuredClone(request);
   // In contrast to ordinary validateDispatch, server authorization must
   // load the principal and original assignment and independently bind them.
   const verified=await authority.verifyAndBind(structuredClone(snapshot));
   if(!verified||!isDeepStrictEqual(verified.task,snapshot?.task)||
      verified.idempotencyKey!==snapshot?.idempotencyKey)
     deny('AUTHORITY_DENIED','Authoritative assignment mismatch');
   const plan=validateDispatch(verified,policy);
   if(!isDeepStrictEqual(plan.allowedActions,EXACT_ACTIONS))
     deny('ACTION_DENIED','Only a single read-repo action is allowed for SDK UAT');
   if(typeof verified?.approval?.taskDigest!=='string'||
      !/^[a-f0-9]{64}$/i.test(verified.approval.taskDigest)||
      typeof verified?.actor?.subject!=='string'||
      typeof verified?.approval?.approvalId!=='string')
     deny('APPROVAL_BINDING_MISSING','Durable task digest/principal binding required');
   // The authoritative store MUST compare live approval version/status and
   // current assignment digest IN THE SAME SERIALIZABLE TRANSACTION
   // that claims the task. An independent client boolean cannot satisfy this.
   const binding=Object.freeze({taskId:plan.taskId,repository:plan.repository,
    approvalId:plan.approvalId,taskDigest:verified.approval.taskDigest,
    principalId:policy.principalId,operatorId:verified.actor.subject,
    allowedActions:[...plan.allowedActions]});
   const reservation=await store.reserveWithCurrentApproval(binding);
   if(reservation?.accepted!==true)
     return Object.freeze({status:'NOT_DISPATCHED',taskId:plan.taskId,
       reason:'Not authorized, revoked, or previously reserved'});
   try{
    // The SDK runner is fixed read-only; no task text or shell command passed in.
    const outcome=await runSdk(paths);
    if(outcome?.status!=='COMPLETED_REQUIRES_HUMAN_QA'||
       outcome?.executorType!=='codex-sdk-local'||
       outcome?.cloudTask!==false||outcome?.approvedForDeployment!==false||
       outcome?.approvedForDispatch!==false||
       outcome?.repository!==plan.repository)
      throw new Error('SDK proof failed independent scope checks');
    await store.recordOutcome(binding,{threadId:outcome.threadId,
      executorType:'codex-sdk-local',commitSha:outcome.commitSha,
      status:'UAT_QA_PENDING'});
    return Object.freeze({status:'UAT_QA_PENDING',taskId:plan.taskId,
      threadId:outcome.threadId,executorType:'codex-sdk-local',
      productionExecutionAuthorized:false,releaseApproved:false});
   }catch(error){
    try{await store.quarantine(binding,{reason:'SDK_OUTCOME_UNCERTAIN'})}
    catch(_){/* reservation must stay consumed; manual investigation required */}
    throw new DispatchError('RECONCILIATION_REQUIRED',
      'SDK execution/reservation outcome uncertain; automatic retry prohibited');
   }
  }
 });
}
