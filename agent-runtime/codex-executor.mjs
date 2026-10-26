/**
 * Server-side Codex transport boundary. Inert until a real officially supported
 * Codex execution transport is authenticated and injected by server composition.
 * No Codex URL, API route, plan entitlement, or run ID is presumed.
 */
import {DispatchError} from './dispatch.mjs';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v);
function fail(code,message){throw new DispatchError(code,message)}
export function createVerifiedCodexExecutor({transport,connection,repositoryAllowlist}={}){
 if(typeof connection?.getServerAuthorization!=='function'||
    typeof transport?.createTask!=='function'||typeof transport?.readTask!=='function'||
    !Array.isArray(repositoryAllowlist)||!repositoryAllowlist.length)
   fail('CODEX_NOT_CONNECTED','Authenticated Codex task transport is not configured');
 const allowed=new Set(repositoryAllowlist);
 return Object.freeze({
  async start(plan){
   if(!plan||!id(plan.taskId)||!id(plan.agentId)||!allowed.has(plan.repository)||
      !id(plan.approvalId)||!Array.isArray(plan.allowedActions))
     fail('CODEX_SCOPE_DENIED','Missing authoritative task and repository scope');
   if(plan.allowedActions.some(x=>!['read-repo','create-branch','edit-feature-branch','run-tests','open-draft-pr'].includes(x)))
     fail('CODEX_SCOPE_DENIED','Unsafe action');
   // Authorization must be obtained on each call from a private server vault/session,
   // not passed as a request field or stored in browser localStorage.
   const auth=await connection.getServerAuthorization();
   if(!auth||auth.authorized!==true||!id(auth.connectionId))
     fail('CODEX_AUTHORIZATION_REQUIRED','No independently authorized Codex connection');
   const payload=Object.freeze({externalTaskId:plan.taskId,agentId:plan.agentId,
      repository:plan.repository,approvalId:plan.approvalId,objective:plan.objective,
      acceptanceCriteria:plan.acceptanceCriteria,allowedActions:[...plan.allowedActions]});
   const result=await transport.createTask(payload,auth);
   if(!result||result.accepted!==true||!id(result.providerRunId)||
     result.repository!==plan.repository||result.externalTaskId!==plan.taskId||
     result.provider!=='codex-cloud')
      fail('CODEX_RUN_UNVERIFIED','Codex did not return a matching confirmed run reference');
   return Object.freeze({accepted:true,runId:result.providerRunId,
     executorType:'codex-cloud',executionCompleted:false});
  },
  async inspectRun({runId,taskId,repository}={}){
   if(!id(runId)||!id(taskId)||!allowed.has(repository))
     fail('CODEX_SCOPE_DENIED','Missing task/run reference or repository scope');
   const auth=await connection.getServerAuthorization();
   if(!auth||auth.authorized!==true||!id(auth.connectionId))
     fail('CODEX_AUTHORIZATION_REQUIRED','Missing current authorized connection');
   const run=await transport.readTask(runId,auth);
   if(!run||run.provider!=='codex-cloud'||run.providerRunId!==runId||
      run.externalTaskId!==taskId||run.repository!==repository)
     fail('CODEX_RUN_UNVERIFIED','Executor run did not match independently retrieved task');
   const status=['queued','running','completed','failed','cancelled'].includes(run.status)?run.status:'unknown';
   if(status==='unknown')fail('CODEX_RUN_UNVERIFIED','Unknown provider status');
   if(run.commitSha!=null&&!hex(run.commitSha))fail('CODEX_RUN_UNVERIFIED','Invalid commit hash');
   return Object.freeze({verifiedTransportResponse:true,executorType:'codex-cloud',
     runId,taskId,repository,status,commitSha:run.commitSha||null,
     draftPullRequestUrl:typeof run.draftPullRequestUrl==='string'?run.draftPullRequestUrl:null});
  }
 });
}
