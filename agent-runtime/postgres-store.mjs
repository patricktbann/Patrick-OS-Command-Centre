/**
 * PostgreSQL-backed atomic task reservation adapter.
 * Requires pre-provisioned schema sql/001-agent-task-ledger.sql and a private
 * server-side SQL client with query(sql, params). No DB is provisioned here.
 */
export function makePostgresDispatchStore(db){
 if(typeof db?.query!=='function')throw new TypeError('Private PostgreSQL query adapter required');
 return Object.freeze({
  async reserve(taskId){
   if(typeof taskId!=='string'||!taskId)throw new TypeError('taskId required');
   // Unique PK means concurrent attempts cannot both reserve, including across hosts.
   const res=await db.query(
    "INSERT INTO tsy_agent_dispatches (task_id,state) VALUES ($1,'reserved') ON CONFLICT (task_id) DO NOTHING RETURNING task_id",
    [taskId]);
   return {accepted:res.rows?.length===1};
  },
  async markStarted(taskId,{runId,executorType,startedAt,approvalId}={}){
   if(!taskId||!runId||!executorType||!approvalId||!Number.isFinite(Date.parse(startedAt)))
     throw new TypeError('Complete verified run and approval references required');
   const res=await db.query(
    "UPDATE tsy_agent_dispatches SET state='started',run_id=$2,executor_type=$3,started_at=$4,approval_id=$5 WHERE task_id=$1 AND state='reserved' RETURNING task_id",
    [taskId,runId,executorType,startedAt,approvalId]);
   if(res.rows?.length!==1)throw new Error('Dispatch reconciliation required; task reservation not available');
  },
  async getDispatch(taskId){
   const res=await db.query(
    'SELECT task_id,state,run_id,executor_type,approval_id,reserved_at,started_at FROM tsy_agent_dispatches WHERE task_id=$1',[taskId]);
   return res.rows?.[0]||null;
  }
 });
}
