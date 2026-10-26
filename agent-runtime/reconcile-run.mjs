/**
 * Server-only reconciliation. A quarantined task may be linked to an executor
 * run only after independent provider lookup; never starts or retries a run.
 */
import {DispatchError} from './dispatch.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(x);
export async function reconcileKnownExecutorRun({taskId,repository,runId,operator,reason},
  {executor,store,authorizeOperator}={}){
 if(!id(taskId)||!id(runId)||typeof repository!=='string'||!repository||
    !operator||typeof reason!=='string'||!reason.trim())
   throw new DispatchError('BAD_RECONCILIATION_REQUEST','Missing task, run, repository or operator context');
 if(typeof authorizeOperator!=='function'||typeof executor?.inspectRun!=='function'||
    typeof store?.confirmReconciledRun!=='function')
   throw new DispatchError('RECOVERY_NOT_CONNECTED','Server-authorized recovery services not configured');
 const permitted=await authorizeOperator(operator,{taskId,repository,action:'reconcile-known-run'});
 if(permitted!==true)
   throw new DispatchError('RECOVERY_UNAUTHORIZED','Operator not authorized for recovery');
 // inspectRun must use an independently authenticated provider transport.
 const evidence=await executor.inspectRun({runId,taskId,repository});
 if(!evidence||evidence.verifiedTransportResponse!==true||
    evidence.runId!==runId||evidence.taskId!==taskId||evidence.repository!==repository||
    evidence.executorType!=='codex-cloud'||!['queued','running','completed'].includes(evidence.status))
   throw new DispatchError('RUN_EVIDENCE_REJECTED','No matching independently retrieved active run');
 const recorded=await store.confirmReconciledRun(taskId,{
   runId,executorType:'codex-cloud',repository,status:evidence.status,
   operatorId:operator.subject,reason:reason.trim().slice(0,160)
 });
 if(!recorded||recorded.recorded!==true)
   throw new DispatchError('RECOVERY_NOT_RECORDED','Recovery was not durably confirmed');
 return Object.freeze({state:'EXECUTING',taskId,runId,providerStatus:evidence.status,
   recovered:true,approvalForRelease:false,executionCompleted:evidence.status==='completed'});
}
