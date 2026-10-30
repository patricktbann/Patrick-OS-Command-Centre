import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtomicSdkReservationStore} from './postgres-sdk-reservation.mjs';

const binding = Object.freeze({
 taskId:'TSY-AI-9902',repository:'patricktbann/Patrick-OS-Command-Centre',
 approvalId:'approval-001',taskDigest:'a'.repeat(64),
 principalId:'patrick-001',operatorId:'operator-001',allowedActions:['read-repo']
});
function fakePool({updateAccepted=true,serializeAt=null}={}){
 const calls=[];
 const client={
  async query(sql,params=[]){
   calls.push({sql,params});
   if(serializeAt && sql.includes(serializeAt))throw Object.assign(new Error('serialization conflict'),{code:'40001'});
   if(sql.includes('SELECT approval_id'))return {rowCount:1};
   if(sql.includes('UPDATE agent_task_dispatch'))return {rowCount:updateAccepted?1:0};
   return {rowCount:1};
  },
  release(){calls.push({sql:'RELEASE',params:[]})}
 };
 return {calls,async connect(){return client}};
}
test('SDK reservation uses serializable transaction and checks current approval',async()=>{
 const pool=fakePool(),store=createAtomicSdkReservationStore(pool);
 assert.deepEqual(await store.reserveWithCurrentApproval(binding),{accepted:true});
 assert.equal(pool.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.match(pool.calls.find(x=>x.sql.includes('SELECT approval_id')).sql,/FOR UPDATE/);
 assert.equal(pool.calls.find(x=>x.sql.includes('INSERT INTO agent_task_dispatch')).params[7],JSON.stringify(['read-repo']));
 assert.ok(pool.calls.some(x=>x.sql==='COMMIT'));
});
test('SDK recorded outcome binds approval, repository, principal, operator and allowed actions',async()=>{
 const pool=fakePool(),store=createAtomicSdkReservationStore(pool);
 assert.deepEqual(await store.recordOutcome(binding,{
  threadId:'01a18747-fc42-7193-9d69-0eaf9915b45c',
  executorType:'codex-sdk-local',commitSha:'b'.repeat(40),status:'UAT_QA_PENDING'
 }),{recorded:true});
 const q=pool.calls.find(x=>x.sql.includes('UPDATE agent_task_dispatch'));
 assert.match(q.sql,/approval_id=\$3 AND repository=\$4 AND task_digest=\$5 AND principal_id=\$6 AND operator_id=\$7 AND allowed_actions=\$8::jsonb/);
 assert.deepEqual(q.params.slice(2),[binding.approvalId,binding.repository,binding.taskDigest,binding.principalId,binding.operatorId,JSON.stringify(binding.allowedActions)]);
});
test('SDK quarantine binds the complete authorized scope before changing state',async()=>{
 const pool=fakePool(),store=createAtomicSdkReservationStore(pool);
 assert.deepEqual(await store.quarantine(binding,{reason:'SDK_OUTCOME_UNCERTAIN'}),{recorded:true});
 const q=pool.calls.find(x=>x.sql.includes('UPDATE agent_task_dispatch'));
 assert.match(q.sql,/approval_id=\$2 AND task_digest=\$3 AND repository=\$4 AND principal_id=\$5 AND operator_id=\$6 AND allowed_actions=\$7::jsonb/);
 assert.deepEqual(q.params,[binding.taskId,binding.approvalId,binding.taskDigest,binding.repository,binding.principalId,binding.operatorId,JSON.stringify(binding.allowedActions)]);
});
test('SDK outcome mismatch fails closed and rolls back',async()=>{
 const pool=fakePool({updateAccepted:false}),store=createAtomicSdkReservationStore(pool);
 await assert.rejects(store.recordOutcome(binding,{
  threadId:'thread-123',executorType:'codex-sdk-local',commitSha:'c'.repeat(40),status:'UAT_QA_PENDING'
 }),{code:'SDK_RESERVATION_MISMATCH'});
 assert.ok(pool.calls.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!pool.calls.some(x=>x.sql==='COMMIT'));
});

test('SDK reservation returns denied on serialization conflict and rolls back',async()=>{
 const pool=fakePool({serializeAt:'INSERT INTO agent_task_dispatch'});
 const store=createAtomicSdkReservationStore(pool);
 assert.deepEqual(await store.reserveWithCurrentApproval(binding),{accepted:false});
 assert.ok(pool.calls.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!pool.calls.some(x=>x.sql==='COMMIT'));
});
test('SDK reservation does not mask unrelated database errors',async()=>{
 const pool={async connect(){return {async query(sql){if(sql.includes('SELECT approval_id'))throw Object.assign(new Error('database down'),{code:'08006'});return {rowCount:1}},release(){}}}};
 await assert.rejects(createAtomicSdkReservationStore(pool).reserveWithCurrentApproval(binding),{code:'08006'});
});
