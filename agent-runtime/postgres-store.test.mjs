import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresReservationStore} from './postgres-store.mjs';
function database(){
 const entries=new Map(),audit=[],traces=[];
 return {entries,audit,traces,pool:{async connect(){
  let pending=[],tx=false;
  return {release(){traces.push('release')},async query(sql,args=[]){
   traces.push(sql.split(/\s+/)[0]);
   if(sql==='BEGIN'){tx=true;pending=[];return {rowCount:0}};
   if(sql==='ROLLBACK'){tx=false;pending=[];return {rowCount:0}};
   if(sql==='COMMIT'){for(const fn of pending)fn();tx=false;pending=[];return {rowCount:0}};
   if(sql.startsWith('INSERT INTO agent_task_dispatch')){
    if(entries.has(args[0]))return {rowCount:0};
    pending.push(()=>entries.set(args[0],{state:'RESERVED'}));return {rowCount:1};
   }
   if(sql.startsWith('UPDATE agent_task_dispatch')){
    const row=entries.get(args[0]);if(!row||row.state!=='RESERVED')return {rowCount:0};
    pending.push(()=>entries.set(args[0],{state:'EXECUTING',runId:args[1]}));return {rowCount:1};
   }
   if(sql.startsWith('INSERT INTO agent_dispatch_audit')){
    pending.push(()=>audit.push({taskId:args[0],kind:sql.includes("'EXECUTING'")?'EXECUTING':'RESERVED'}));return {rowCount:1};
   }
   throw Error('Unknown SQL');
  }};
 }}};
}
test('reserve persists task and auditable event',async()=>{
 const d=database(),s=createPostgresReservationStore(d.pool);
 assert.deepEqual(await s.reserve('TSY-T-901'),{accepted:true});
 assert.equal(d.entries.get('TSY-T-901').state,'RESERVED');assert.equal(d.audit.length,1);
});
test('duplicate reservation returns rejected and preserves one audit event',async()=>{
 const d=database(),s=createPostgresReservationStore(d.pool);
 await s.reserve('TSY-T-901');
 assert.deepEqual(await s.reserve('TSY-T-901'),{accepted:false});assert.equal(d.audit.length,1);
});
test('start transition stores executor identity and event',async()=>{
 const d=database(),s=createPostgresReservationStore(d.pool);
 await s.reserve('TSY-T-901');
 await s.markStarted('TSY-T-901',{runId:'run-1',executorType:'test-executor',approvalId:'approval-01',startedAt:'2026-10-26T07:00:00Z'});
 assert.equal(d.entries.get('TSY-T-901').state,'EXECUTING');assert.equal(d.audit[1].kind,'EXECUTING');
});
test('unreserved start fails closed and rolls back',async()=>{
 const d=database(),s=createPostgresReservationStore(d.pool);
 await assert.rejects(s.markStarted('TSY-T-901',{runId:'run-1',executorType:'test-executor',approvalId:'approval-01',startedAt:'2026-10-26T07:00:00Z'}),e=>e.code==='INVALID_RESERVATION_STATE');
 assert.equal(d.audit.length,0);assert.ok(d.traces.includes('ROLLBACK'));
});
test('malformed identifiers rejected before accessing store',async()=>{
 const d=database(),s=createPostgresReservationStore(d.pool);
 await assert.rejects(s.reserve('!'),e=>e.code==='INVALID_TASK_ID');
 assert.equal(d.traces.length,0);
});
test('unconfigured database cannot silently accept reservation',async()=>{
 await assert.rejects(createPostgresReservationStore(null).reserve('TSY-T-901'),e=>e.code==='STORE_NOT_CONNECTED');
});
