import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalQueue } from './email-approval-queue.mjs';
import { createDurableFirstApprovalPoller } from './durable-first-gmail-poller.mjs';
function setup(decide) {
 const queue=createApprovalQueue(),id='TSY-AI-9003',threadId='test-thread';
 queue.request({id,taskId:'INTERNAL',scope:'Synthetic only',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'});
 const poller=createDurableFirstApprovalPoller({queue,threadBindings:new Map([[threadId,id]]),listThreadMessages:async()=>[{id:'gmail-3',threadId}],verifyProviderMessage:()=>true,parseDecision:()=>({status:'APPROVED'}),durableRepository:{decide}});
 return {queue,poller,id};
}
test('durable approval recorded before reporting success',async()=>{let writes=0;const {poller}=setup(async()=>{writes++});const result=await poller.poll();assert.equal(writes,1);assert.equal(result[0].durable,true)});
test('failed database write never changes in-memory approval',async()=>{const {queue,poller,id}=setup(async()=>{throw Error('DB_FAIL')});await assert.rejects(()=>poller.poll(),/DB_FAIL/);assert.equal(queue.status(id).status,'PENDING');assert.throws(()=>queue.release(id),/RELEASE_DENIED/)});
test('unverified provider reply cannot be persisted',async()=>{let writes=0;const queue=createApprovalQueue(),id='TSY-AI-9004';queue.request({id,taskId:'DEMO',scope:'Synthetic',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'});const poller=createDurableFirstApprovalPoller({queue,threadBindings:new Map([['t',id]]),listThreadMessages:async()=>[{id:'msg',threadId:'t'}],verifyProviderMessage:()=>false,parseDecision:()=>({status:'APPROVED'}),durableRepository:{decide:async()=>writes++}});assert.deepEqual(await poller.poll(),[]);assert.equal(writes,0)});
