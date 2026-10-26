/**
 * PostgreSQL reservation adapter; no credentials and no implicit database creation.
 * pool.connect() must return an authorized pg-compatible transaction client.
 * Schema: sql/001-agent-dispatch.sql (requires separately approved migration).
 */
import {DispatchError} from './dispatch.mjs';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(x);
async function transaction(pool,action){
 if(typeof pool?.connect!=='function')throw new DispatchError('STORE_NOT_CONNECTED','PostgreSQL pool is not configured');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const result=await action(client);
  await client.query('COMMIT');
  return result;
 }catch(e){
  try{await client.query('ROLLBACK')}catch{} 
  throw e;
 }finally{client.release()}
}
export function createPostgresReservationStore(pool){
 return {
  async reserve(taskId){
   if(!validId(taskId))throw new DispatchError('INVALID_TASK_ID','Invalid task reservation ID');
   return transaction(pool,async client=>{
    const row=await client.query(
     "INSERT INTO agent_task_dispatch(task_id,state) VALUES($1,'RESERVED') ON CONFLICT(task_id) DO NOTHING RETURNING task_id",
     [taskId]);
    if(row.rowCount!==1)return {accepted:false};
    await client.query("INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'RESERVED',$2::jsonb)",
     [taskId,JSON.stringify({version:1})]);
    return {accepted:true};
   });
  },
  async markReconciliationRequired(taskId,reason){
   if(!validId(taskId)||typeof reason!=='string'||!reason.trim())
    throw new DispatchError('INVALID_RECONCILIATION','Task ID and reason required');
   return transaction(pool,async client=>{
    const updated=await client.query(
     "UPDATE agent_task_dispatch SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE task_id=$1 AND state='RESERVED' RETURNING task_id",
     [taskId]);
    if(updated.rowCount!==1)throw new DispatchError('INVALID_RESERVATION_STATE','Task not in reserved state');
    await client.query("INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'RECONCILIATION_REQUIRED',$2::jsonb)",
     [taskId,JSON.stringify({reason:reason.slice(0,160)})]);
    return {recorded:true};
   });
  },
  async confirmReconciledRun(taskId,data){
   if(!validId(taskId)||!validId(data?.runId)||data?.executorType!=='codex-cloud'||
      !validId(data?.operatorId)||typeof data?.reason!=='string'||!data.reason.trim()||
      typeof data?.repository!=='string'||!data.repository.trim())
    throw new DispatchError('INVALID_RECOVERY_EVIDENCE','Incomplete server-verified recovery record');
   return transaction(pool,async client=>{
    const row=await client.query(
     "UPDATE agent_task_dispatch SET state='EXECUTING',executor_run_id=$2,executor_type=$3,updated_at=now() WHERE task_id=$1 AND state='RECONCILIATION_REQUIRED' AND executor_run_id IS NULL RETURNING task_id",
     [taskId,data.runId,data.executorType]);
    if(row.rowCount!==1)
     throw new DispatchError('INVALID_RECONCILIATION_STATE','Task must be quarantined and have no assigned run');
    await client.query(
     "INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'RECONCILED_RUN',$2::jsonb)",
     [taskId,JSON.stringify({runId:data.runId,executorType:data.executorType,
       repository:data.repository,status:data.status,operatorId:data.operatorId,reason:data.reason.slice(0,160)})]);
    return {recorded:true};
   });
  },
    async markStarted(taskId,data){
   if(!validId(taskId)||!validId(data?.runId)||!validId(data?.executorType)||!validId(data?.approvalId))
    throw new DispatchError('INVALID_RUN_EVIDENCE','Missing valid started-run identifiers');
   if(!Number.isFinite(Date.parse(data.startedAt)))
    throw new DispatchError('INVALID_RUN_EVIDENCE','Invalid start timestamp');
   return transaction(pool,async client=>{
    const updated=await client.query(
     "UPDATE agent_task_dispatch SET state='EXECUTING',executor_run_id=$2,executor_type=$3,approval_id=$4,started_at=$5,updated_at=now() WHERE task_id=$1 AND state='RESERVED' RETURNING task_id",
     [taskId,data.runId,data.executorType,data.approvalId,data.startedAt]);
    if(updated.rowCount!==1)
      throw new DispatchError('INVALID_RESERVATION_STATE','Task is not in reserved state');
    await client.query("INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES($1,'EXECUTING',$2::jsonb)",
     [taskId,JSON.stringify({runId:data.runId,executorType:data.executorType,approvalId:data.approvalId})]);
   });
  }
 };
}
