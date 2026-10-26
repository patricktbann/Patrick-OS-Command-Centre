import test from 'node:test';
import assert from 'node:assert/strict';
import {makePostgresDispatchStore} from './postgres-store.mjs';
test('missing server SQL client denied',()=>assert.throws(()=>makePostgresDispatchStore({}),TypeError));
test('atomic reserve returns accepted only for first insert',async()=>{
 let inserted=false;const seen=[];
 const store=makePostgresDispatchStore({query:async(sql,params)=>{
  seen.push({sql,params});if(!inserted){inserted=true;return {rows:[{task_id:params[0]}]}}return {rows:[]};
 }});
 assert.deepEqual(await store.reserve('TSY-T-1'),{accepted:true});
 assert.deepEqual(await store.reserve('TSY-T-1'),{accepted:false});
 assert.ok(seen[0].sql.includes('ON CONFLICT'));
 assert.deepEqual(seen[0].params,['TSY-T-1']);
});
test('store writes confirmed run and approval with SQL placeholders',async()=>{
 let captured;
 const store=makePostgresDispatchStore({query:async(sql,params)=>{captured={sql,params};return {rows:[{task_id:params[0]}]}}});
 await store.markStarted('TSY-T-1',{runId:'run-44',executorType:'codex',startedAt:'2026-10-26T08:00:00Z',approvalId:'approval-11'});
 assert.equal(captured.params[1],'run-44');
 assert.equal(captured.params[4],'approval-11');
 assert.ok(captured.sql.includes("state='reserved'"));
});
test('store rejects malformed acknowledgments without querying DB',async()=>{
 let called=false;
 const store=makePostgresDispatchStore({query:async()=>{called=true;return {rows:[]}}});
 await assert.rejects(store.markStarted('TSY-T-1',{runId:'x'}),TypeError);
 assert.equal(called,false);
});
test('store does not silently mark unreserved task started',async()=>{
 const store=makePostgresDispatchStore({query:async()=>({rows:[]})});
 await assert.rejects(store.markStarted('TSY-T-1',{runId:'r',executorType:'codex',approvalId:'approval',startedAt:'2026-10-26T08:00:00Z'}),/reconciliation required/);
});
test('getDispatch reads by exact task ID',async()=>{
 const store=makePostgresDispatchStore({query:async(sql,params)=>{assert.deepEqual(params,['TSY-T-1']);return {rows:[{state:'reserved'}]}}});
 assert.equal((await store.getDispatch('TSY-T-1')).state,'reserved');
});
