import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalQueue } from './email-approval-queue.mjs';
import { createGmailApprovalAdapter } from './gmail-approval-adapter.mjs';
function setup(verifyMessage=()=>true){
 const queue=createApprovalQueue();
 queue.request({id:'TSY-AI-0003',taskId:'DEMO-3',scope:'Internal demo only',expiresAt:'2099-01-01T00:00:00Z'});
 const adapter=createGmailApprovalAdapter({queue,authenticatedMailbox:'patricktbann@gmail.com',verifyMessage});
 return {queue,adapter};
}
const msg={id:'gmail-msg-001',from:'patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-0003',body:'APPROVE TSY-AI-0003'};
test('verified message resolves exactly one pending request',()=>{const {queue,adapter}=setup();assert.equal(adapter.process(msg).status,'APPROVED');assert.equal(queue.status('TSY-AI-0003').status,'APPROVED');assert.equal(adapter.process(msg).status,'DUPLICATE_OR_INVALID_MESSAGE')});
test('unverified message cannot approve',()=>{const {queue,adapter}=setup(()=>false);assert.equal(adapter.process(msg).status,'UNVERIFIED_MESSAGE');assert.equal(queue.status('TSY-AI-0003').status,'PENDING')});
test('wrong mailbox and ambiguous subjects are rejected',()=>{assert.throws(()=>createGmailApprovalAdapter({queue:{},authenticatedMailbox:'other@example.com',verifyMessage:()=>true}),/MAILBOX_NOT_AUTHORIZED/);const {adapter}=setup();assert.equal(adapter.process({...msg,subject:msg.subject+' TSY-AI-0004'}).status,'AMBIGUOUS_REQUEST')});
test('spoofed from header is rejected even with provider verifier',()=>{const {adapter}=setup();assert.equal(adapter.process({...msg,from:'attacker@example.com'}).status,'UNVERIFIED_SENDER')});
