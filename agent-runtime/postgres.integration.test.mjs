import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createPostgresReservationStore} from './postgres-store.mjs';

const required=['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'];
for(const k of required)if(!process.env[k])throw new Error('Disposable Postgres test environment missing '+k);
if(process.env.GITHUB_ACTIONS!=='true'||!['127.0.0.1','localhost'].includes(process.env.PGHOST)||
   process.env.PGDATABASE!=='tsy_agents_ci'||process.env.TSY_EPHEMERAL_CI_DB!=='yes')
 throw new Error('Refusing database integration tests outside isolated GitHub Actions Postgres service');

const pool=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT),
 user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,max:20,
 connectionTimeoutMillis:5000});
const schema=await readFile(new URL('./sql/001-agent-dispatch.sql',import.meta.url),'utf8');
try{await pool.query(schema)}catch(e){await pool.end();throw e}
const store=createPostgresReservationStore(pool);
const tag='it-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT;
const taskId=tag+'-concurrent';
const start={runId:tag+'-run',executorType:'github-actions-test',approvalId:tag+'-approval',
 startedAt:new Date().toISOString()};
after(async()=>{await pool.end()});
 test('real PostgreSQL: twenty concurrent reservations permit exactly one dispatch',async()=>{
  const results=await Promise.all(Array.from({length:20},()=>store.reserve(taskId)));
  assert.equal(results.filter(x=>x.accepted).length,1);
  assert.equal(results.filter(x=>!x.accepted).length,19);
  const {rows}=await pool.query('SELECT task_id,state FROM agent_task_dispatch WHERE task_id=$1',[taskId]);
  assert.equal(rows.length,1);assert.equal(rows[0].state,'RESERVED');
  const events=await pool.query('SELECT event_type FROM agent_dispatch_audit WHERE task_id=$1',[taskId]);
  assert.deepEqual(events.rows.map(x=>x.event_type),['RESERVED']);
 });
 test('real PostgreSQL: execution update persists run and audit evidence',async()=>{
  await store.markStarted(taskId,start);
  const row=await pool.query('SELECT state,executor_run_id,executor_type,approval_id FROM agent_task_dispatch WHERE task_id=$1',[taskId]);
  assert.deepEqual(row.rows[0],{state:'EXECUTING',executor_run_id:start.runId,
   executor_type:start.executorType,approval_id:start.approvalId});
  const events=await pool.query('SELECT event_type FROM agent_dispatch_audit WHERE task_id=$1 ORDER BY event_id',[taskId]);
  assert.deepEqual(events.rows.map(x=>x.event_type),['RESERVED','EXECUTING']);
 });
 test('real PostgreSQL: repeated start is rejected without another audit event',async()=>{
  await assert.rejects(store.markStarted(taskId,{...start,runId:tag+'-duplicate'}),e=>e.code==='INVALID_RESERVATION_STATE');
  const row=await pool.query('SELECT count(*)::integer AS count FROM agent_dispatch_audit WHERE task_id=$1',[taskId]);
  assert.equal(row.rows[0].count,2);
 });
 test('real PostgreSQL: failed start does not create row or audit',async()=>{
  const missing=tag+'-unreserved';
  await assert.rejects(store.markStarted(missing,{...start,runId:tag+'-unreserved-run'}),e=>e.code==='INVALID_RESERVATION_STATE');
  const row=await pool.query('SELECT count(*)::integer AS count FROM agent_dispatch_audit WHERE task_id=$1',[missing]);
  assert.equal(row.rows[0].count,0);
 });
 test('real PostgreSQL: executor run ID uniqueness is enforced across tasks',async()=>{
  const first=tag+'-unique-a',second=tag+'-unique-b',runId=tag+'-unique-run';
  assert.deepEqual(await store.reserve(first),{accepted:true});
  assert.deepEqual(await store.reserve(second),{accepted:true});
  await store.markStarted(first,{...start,runId});
  await assert.rejects(store.markStarted(second,{...start,runId}),e=>e.code==='23505');
  const row=await pool.query('SELECT state,executor_run_id FROM agent_task_dispatch WHERE task_id=$1',[second]);
  assert.equal(row.rows[0].state,'RESERVED');
  assert.equal(row.rows[0].executor_run_id,null);
  const events=await pool.query('SELECT event_type FROM agent_dispatch_audit WHERE task_id=$1 ORDER BY event_id',[second]);
  assert.deepEqual(events.rows.map(x=>x.event_type),['RESERVED']);
 });
 test('real PostgreSQL: transaction failure does not create a dispatch record',async()=>{
  const other=tag+'-rollback';
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("INSERT INTO agent_task_dispatch(task_id,state) VALUES($1,'RESERVED')",[other]);
   await assert.rejects(client.query('SELECT 1/0'),e=>e.code==='22012');
   await client.query('ROLLBACK');
  }finally{client.release()}
  const row=await pool.query('SELECT state FROM agent_task_dispatch WHERE task_id=$1',[other]);
  assert.equal(row.rows.length,0);
  const events=await pool.query('SELECT event_id FROM agent_dispatch_audit WHERE task_id=$1',[other]);
  assert.equal(events.rows.length,0);
 });

 test('real PostgreSQL: ambiguous dispatch is durably quarantined and audited',async()=>{
  const ambiguous=tag+'-uncertain';
  assert.deepEqual(await store.reserve(ambiguous),{accepted:true});
  assert.deepEqual(await store.markReconciliationRequired(ambiguous,'executor_timeout'),{recorded:true});
  const row=await pool.query('SELECT state,executor_run_id FROM agent_task_dispatch WHERE task_id=$1',[ambiguous]);
  assert.equal(row.rows[0].state,'RECONCILIATION_REQUIRED');
  assert.equal(row.rows[0].executor_run_id,null);
  const audit=await pool.query('SELECT event_type,details FROM agent_dispatch_audit WHERE task_id=$1 ORDER BY event_id',[ambiguous]);
  assert.deepEqual(audit.rows.map(x=>x.event_type),['RESERVED','RECONCILIATION_REQUIRED']);
  assert.equal(audit.rows[1].details.reason,'executor_timeout');
  assert.deepEqual(await store.reserve(ambiguous),{accepted:false});
  await assert.rejects(store.markStarted(ambiguous,{...start,runId:tag+'-bad-resume'}),e=>e.code==='INVALID_RESERVATION_STATE');
 });

test('real PostgreSQL: independently verified recovery records single audit and blocks replay',async()=>{
 const quarantined=tag+'-codex-recovery';
 assert.deepEqual(await store.reserve(quarantined),{accepted:true});
 assert.deepEqual(await store.markReconciliationRequired(quarantined,'timed_out'),{recorded:true});
 const recovery={runId:tag+'-authentic-run-fixture',executorType:'codex-cloud',
  repository:'patricktbann/Patrick-OS-Command-Centre',status:'running',
  operatorId:'authorized-operator',reason:'server-verified-run'};
 assert.deepEqual(await store.confirmReconciledRun(quarantined,recovery),{recorded:true});
 const row=await pool.query('SELECT state,executor_run_id,executor_type FROM agent_task_dispatch WHERE task_id=$1',[quarantined]);
 assert.deepEqual(row.rows[0],{state:'EXECUTING',executor_run_id:recovery.runId,executor_type:'codex-cloud'});
 const audit=await pool.query('SELECT event_type FROM agent_dispatch_audit WHERE task_id=$1 ORDER BY event_id',[quarantined]);
 assert.deepEqual(audit.rows.map(x=>x.event_type),['RESERVED','RECONCILIATION_REQUIRED','RECONCILED_RUN']);
 await assert.rejects(store.confirmReconciledRun(quarantined,{...recovery,runId:tag+'-duplicate'}),e=>e.code==='INVALID_RECONCILIATION_STATE');
 assert.deepEqual(await store.reserve(quarantined),{accepted:false});
 const count=await pool.query('SELECT count(*)::integer AS n FROM agent_dispatch_audit WHERE task_id=$1',[quarantined]);
 assert.equal(count.rows[0].n,3);
});
