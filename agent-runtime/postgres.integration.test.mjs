import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createPostgresReservationStore} from './postgres-store.mjs';

const required=['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'];
for(const k of required)if(!process.env[k])throw new Error('Disposable Postgres test environment missing '+k);
if(process.env.GITHUB_ACTIONS!=='true'||process.env.PGHOST!=='127.0.0.1'||
   process.env.PGDATABASE!=='tsy_agent_integration_test')
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
try{
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
 test('real PostgreSQL: transaction failure does not create a dispatch record',async()=>{
  const other=tag+'-rollback';
  await store.reserve(other);
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query('DELETE FROM agent_task_dispatch WHERE task_id=$1',[other]);await client.query('ROLLBACK')}
  finally{client.release()}
  const row=await pool.query('SELECT state FROM agent_task_dispatch WHERE task_id=$1',[other]);
  assert.equal(row.rows[0].state,'RESERVED');
 });
}finally{
 process.on('beforeExit',()=>{if(!pool.ended)void pool.end()});
}
