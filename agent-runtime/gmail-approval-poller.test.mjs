import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalQueue } from './email-approval-queue.mjs';
import { createApprovalInboxPoller } from './gmail-approval-poller.mjs';
const threadId='test-thread-1',requestId='TSY-AI-9002';
function setup({verify=true,record=async()=>{}}={}) {
 const queue=createApprovalQueue();
 queue.request({id:requestId,taskId:'INTERNAL-ONLY',scope:'Synthetic report',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'});
 const messages=[{id:'provider-message-1',threadId,from:'Patrick Teo patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-9002',body:'Approved.'}];
 const poller=createApprovalInboxPoller({queue,threadBindings:new Map([[threadId,requestId]]),listThreadMessages:async()=>messages,verifyProviderMessage:()=>verify,recordDecision:record});
 return {queue,poller,messages};
}
test('polls bound thread, records approval, and does not process twice',async()=>{const recorded=[];const {queue,poller}=setup({record:async d=>recorded.push(d)});assert.equal((await poller.poll())[0].status,'APPROVED');assert.equal(recorded.length,1);assert.equal((await poller.poll()).length,0);assert.equal(queue.status(requestId).status,'APPROVED')});
test('unverified messages never record decisions',async()=>{let writes=0;const {queue,poller}=setup({verify:false,record:async()=>writes++});assert.equal((await poller.poll()).length,0);assert.equal(writes,0);assert.equal(queue.status(requestId).status,'PENDING')});
test('durable write failure blocks success and demands reconciliation',async()=>{const {poller}=setup({record:async()=>{throw Error('DB unavailable')}});await assert.rejects(()=>poller.poll(),/DURABLE_DECISION_FAILED_REQUIRES_RECONCILIATION/)});
test('invalid provider response fails closed',async()=>{const queue=createApprovalQueue();queue.request({id:requestId,taskId:'DEMO',scope:'Draft',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'});const poller=createApprovalInboxPoller({queue,threadBindings:new Map([[threadId,requestId]]),listThreadMessages:async()=>null,verifyProviderMessage:()=>true,recordDecision:async()=>{}});await assert.rejects(()=>poller.poll(),/INVALID_PROVIDER_RESPONSE/)});
