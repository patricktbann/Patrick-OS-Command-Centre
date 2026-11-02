/** Durable atomic approval + task reservation, PostgreSQL only.
 * Caller must already have independently authenticated the principal,
 * verified the GitHub issue, and computed the immutable task digest.
 * No client-supplied "authenticated" boolean is accepted here.
 */
import {DispatchError} from './dispatch.mjs';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(v);
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const repo=v=>typeof v==='string'&&/^[\w.-]+\/[\w.-]+$/.test(v);
// Capture authorization scope before the first await. A caller must not be able to
// mutate a task digest or allowed actions while the DB connection is pending.
function snapshotBinding(binding){
 checkBinding(binding);
 return Object.freeze({...binding,allowedActions:Object.freeze([...binding.allowedActions])});
}
function checkBinding(x){
 if(!id(x?.taskId)||!repo(x?.repository)||!id(x?.approvalId)||
 !digest(x?.taskDigest)||!id(x?.principalId)||!id(x?.operatorId)||
 !Array.isArray(x?.allowedActions)||x.allowedActions.length!==1||x.allowedActions[0]!=='read-repo')
 throw new DispatchError('SDK_BINDING_DENIED','Complete, read-only, trusted task binding required');
}
async function tx(pool,work){
 if(typeof pool?.connect!=='function')throw new DispatchError('SDK_DB_UNAVAILABLE','No PostgreSQL transaction pool');
 const c=await pool.connect();
 try{await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const out=await work(c);await c.query('COMMIT');return out}
 catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
 finally{c.release()}
}
export function createAtomicSdkReservationStore(pool){
 return Object.freeze({
  async reserveWithCurrentApproval(binding){
   const b=snapshotBinding(binding);
   try{return await tx(pool,async c=>{
    // UPDATE/revoke must acquire the same approval row lock. FOR UPDATE
    // yields a clear commit-time cutoff against concurrent revocation.
    const a=await c.query(
      "SELECT approval_id FROM agent_task_approval WHERE approval_id=$1 AND task_id=$2 AND repository=$3 AND principal_id=$4 AND task_digest=$5 AND status='APPROVED' FOR UPDATE",
      [b.approvalId,b.taskId,b.repository,b.principalId,b.taskDigest]);
    if(a.rowCount!==1)return {accepted:false};
    const row=await c.query(
      "INSERT INTO agent_task_dispatch(task_id,state,approval_id,repository,task_digest,principal_id,operator_id,allowed_actions) VALUES($1,'RESERVED',$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(task_id) DO NOTHING RETURNING task_id",
      [b.taskId,b.approvalId,b.repository,b.taskDigest,b.principalId,
       b.operatorId,JSON.stringify(b.allowedActions)]);
    if(row.rowCount!==1)return {accepted:false};
    await c.query("INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'RESERVED_APPROVED_SDK',$2::jsonb)",
      [b.taskId,JSON.stringify({repository:b.repository,taskDigest:b.taskDigest,
        approvalId:b.approvalId,principalId:b.principalId,operatorId:b.operatorId})]);
    return {accepted:true};
   });}catch(e){
    // Serializable conflicts (40001) are not evidence of approval. Fail closed,
    // never dispatch or retry implicitly; caller may explicitly re-evaluate.
    if(e?.code==='40001')return {accepted:false};
    throw e;
   }
  },
  async recordOutcome(binding,result){
   const b=snapshotBinding(binding);
   const evidence=Object.freeze({...result});
   if(!id(evidence?.threadId)||evidence.executorType!=='codex-sdk-local'||
      !/^[a-f0-9]{40}$/i.test(evidence?.commitSha??'')||evidence.status!=='UAT_QA_PENDING')
    throw new DispatchError('SDK_RUN_UNVERIFIED','Unsupported SDK evidence');
   return tx(pool,async c=>{
    const row=await c.query(
      "UPDATE agent_task_dispatch SET state='EXECUTING',executor_run_id=$2,executor_type='codex-sdk-local',started_at=now(),updated_at=now() WHERE task_id=$1 AND state='RESERVED' AND approval_id=$3 AND repository=$4 AND task_digest=$5 AND principal_id=$6 AND operator_id=$7 AND allowed_actions=$8::jsonb RETURNING task_id",
      [b.taskId,evidence.threadId,b.approvalId,b.repository,b.taskDigest,b.principalId,b.operatorId,JSON.stringify(b.allowedActions)]);
    if(row.rowCount!==1)throw new DispatchError('SDK_RESERVATION_MISMATCH','Durable task authorization changed');
    await c.query("INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'SDK_QA_PENDING',$2::jsonb)",
      [b.taskId,JSON.stringify({threadId:evidence.threadId,commitSha:evidence.commitSha,approvalId:b.approvalId})]);
    return {recorded:true};
   });
  },
  async quarantine(binding,{reason}={}){
   const b=snapshotBinding(binding);
   if(reason!=='SDK_OUTCOME_UNCERTAIN')throw new DispatchError('SDK_RECOVERY_DENIED','Unexpected quarantine reason');
   return tx(pool,async c=>{
    const row=await c.query(
      "UPDATE agent_task_dispatch SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE task_id=$1 AND state='RESERVED' AND approval_id=$2 AND task_digest=$3 AND repository=$4 AND principal_id=$5 AND operator_id=$6 AND allowed_actions=$7::jsonb RETURNING task_id",
      [b.taskId,b.approvalId,b.taskDigest,b.repository,b.principalId,b.operatorId,JSON.stringify(b.allowedActions)]);
    if(row.rowCount!==1)throw new DispatchError('SDK_RECOVERY_DENIED','Task cannot be quarantined');
    await c.query("INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'RECONCILIATION_REQUIRED',$2::jsonb)",
      [b.taskId,JSON.stringify({reason})]);
    return {recorded:true};
   });
  }
 });
}
