/**
 * Server-only PostgreSQL approvals. Identity verification is an external prerequisite:
 * never pass caller-supplied principalId directly to approve or revoke.
 */
import {taskDigest} from './task-digest.mjs';
import {DispatchError} from './dispatch.mjs';
const id=s=>typeof s==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(s);
async function tx(pool,action){
 if(typeof pool?.connect!=='function')throw new DispatchError('APPROVAL_DB_UNAVAILABLE','No connected approval database');
 const c=await pool.connect();
 try{await c.query('BEGIN');const v=await action(c);await c.query('COMMIT');return v}
 catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
 finally{c.release()}
}
export function createPostgresApprovals(pool){
 return {
  async approve({approvalId,task,principalId,principalAuthenticated,approvedAt}={}){
   if(!id(approvalId)||!id(principalId)||principalAuthenticated!==true||
      !id(task?.taskId)||typeof task.repository!=='string'||!Number.isFinite(Date.parse(approvedAt)))
    throw new DispatchError('UNAUTHORIZED_APPROVAL','Authenticated principal and canonical task required');
   const digest=taskDigest(task);
   return tx(pool,async c=>{
    const result=await c.query(
     "INSERT INTO agent_task_approval(approval_id,task_id,repository,principal_id,task_digest,status,approved_at) VALUES($1,$2,$3,$4,$5,'APPROVED',$6) ON CONFLICT DO NOTHING RETURNING approval_id",
     [approvalId,task.taskId,task.repository,principalId,digest,approvedAt]);
    if(result.rowCount!==1)throw new DispatchError('APPROVAL_ALREADY_EXISTS','Approval already recorded for task fingerprint');
    await c.query("INSERT INTO agent_approval_audit(approval_id,event_type,details) VALUES($1,'APPROVED',$2::jsonb)",
     [approvalId,JSON.stringify({taskDigest:digest,principalId})]);
    return {approvalId,taskId:task.taskId,taskDigest:digest,status:'APPROVED'};
   });
  },
  async findApprovedDecision(taskId,principalId){
   if(!id(taskId)||!id(principalId))return null;
   if(typeof pool?.query!=='function')throw new DispatchError('APPROVAL_DB_UNAVAILABLE','No approval database');
   const r=await pool.query(
    "SELECT approval_id,task_id,principal_id,repository,task_digest,status,approved_at FROM agent_task_approval WHERE task_id=$1 AND principal_id=$2 AND status='APPROVED' LIMIT 1",
    [taskId,principalId]);
   const x=r.rows?.[0];
   return x?{approvalId:x.approval_id,taskId:x.task_id,principalId:x.principal_id,
     repository:x.repository,taskDigest:x.task_digest,status:x.status,
     approvedAt:new Date(x.approved_at).toISOString()}:null;
  },
  async revoke({approvalId,principalId,principalAuthenticated}={}){
   if(!id(approvalId)||!id(principalId)||principalAuthenticated!==true)
    throw new DispatchError('UNAUTHORIZED_REVOCATION','Authenticated principal required');
   return tx(pool,async c=>{
    const r=await c.query(
     "UPDATE agent_task_approval SET status='REVOKED',revoked_at=now() WHERE approval_id=$1 AND principal_id=$2 AND status='APPROVED' RETURNING approval_id",
     [approvalId,principalId]);
    if(r.rowCount!==1)throw new DispatchError('APPROVAL_NOT_ACTIVE','No active approval to revoke');
    await c.query("INSERT INTO agent_approval_audit(approval_id,event_type,details) VALUES($1,'REVOKED',$2::jsonb)",
     [approvalId,JSON.stringify({principalId})]);
    return {approvalId,status:'REVOKED'};
   });
  }
 };
}
