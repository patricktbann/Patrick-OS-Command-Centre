import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalQueue } from './email-approval-queue.mjs';
import { createThreadBoundApprovalProcessor } from './gmail-thread-approval.mjs';
const requestId='TSY-AI-9001', threadId='1a1820834938384f';
function setup(verify=()=>true) {
 const queue=createApprovalQueue();
 queue.request({id:requestId,taskId:'EMAIL-TEST',scope:'Confirm delivery only',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'});
 const processor=createThreadBoundApprovalProcessor({queue,threadBindings:new Map([[threadId,requestId]]),verifyProviderMessage:verify});
 return {queue,processor};
}
const reply={id:'1a18209ec6f8845d',threadId,from:'Patrick Teo patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-9001',body:'Approved.\n\nOn Wed, Oct 28...'};
test('real-world natural reply format resolves bound low-risk request',()=>{
 const {queue,processor}=setup();
 assert.equal(processor.process(reply).status,'APPROVED');
 assert.equal(queue.status(requestId).status,'APPROVED');
 assert.equal(processor.process(reply).status,'DUPLICATE_OR_INVALID_MESSAGE');
});
test('different thread cannot authorize',()=>{const {processor}=setup();assert.equal(processor.process({...reply,threadId:'wrong'}).status,'UNBOUND_THREAD')});
test('display-name spoofing and unverified provider fail closed',()=>{
 const {processor}=setup();assert.equal(processor.process({...reply,from:'Patrick Teo attacker@example.com'}).status,'INVALID_SENDER_OR_THREAD');
 const second=setup(()=>false);assert.equal(second.processor.process(reply).status,'UNVERIFIED_MESSAGE');
});
test('unbound or mismatched subject cannot authorize',()=>{const {processor}=setup();assert.equal(processor.process({...reply,subject:'Re: other request'}).status,'REQUEST_MISMATCH')});
test('quoted approval text is not accepted as decision',()=>{const {processor}=setup();assert.equal(processor.process({...reply,body:'Thanks\n\nAPPROVE TSY-AI-9001'}).status,'INVALID_DECISION')});
test('natural reply cannot approve high-risk request',()=>{
 const queue=createApprovalQueue();queue.request({id:requestId,taskId:'HIGH',scope:'Contract',risk:'HIGH',expiresAt:'2099-01-01T00:00:00Z'});
 const processor=createThreadBoundApprovalProcessor({queue,threadBindings:new Map([[threadId,requestId]]),verifyProviderMessage:()=>true});
 assert.equal(processor.process(reply).status,'STRONG_CONFIRMATION_REQUIRED');
});
