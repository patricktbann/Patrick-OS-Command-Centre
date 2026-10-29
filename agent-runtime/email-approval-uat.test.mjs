import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalUat } from './email-approval-uat.mjs';
const expiresAt='2099-01-01T00:00:00Z';
const request={id:'TSY-AI-1001',taskId:'INTERNAL-DEMO',scope:'Produce synthetic internal report',risk:'LOW',expiresAt};
const message={id:'synthetic-msg-1',from:'patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-1001',body:'APPROVE TSY-AI-1001'};
test('full synthetic request -> email -> decision -> task completion',()=>{
 const uat=createApprovalUat({verifyMessage:()=>true});
 const {draft}=uat.request(request);
 assert.equal(draft.to,'patricktbann@gmail.com');
 assert.match(draft.body,/Produce synthetic internal report/);
 assert.throws(()=>uat.resume(request.id),/RELEASE_DENIED/);
 assert.equal(uat.receive(message).status,'APPROVED');
 assert.deepEqual(uat.resume(request.id),{taskId:'INTERNAL-DEMO',approvedScope:'Produce synthetic internal report',requestId:'TSY-AI-1001',result:'SYNTHETIC_TASK_COMPLETED'});
 assert.deepEqual(uat.report().audit.map(e=>e.action),['REQUESTED','APPROVED','RELEASED']);
 assert.throws(()=>uat.resume(request.id),/RELEASE_DENIED/);
});
test('unverified email never resumes',()=>{
 const uat=createApprovalUat({verifyMessage:()=>false});uat.request(request);
 assert.equal(uat.receive(message).status,'UNVERIFIED_MESSAGE');
 assert.throws(()=>uat.resume(request.id),/RELEASE_DENIED/);
 assert.equal(uat.report().tasks.length,0);
});
test('high risk remains blocked after email approval attempt',()=>{
 const uat=createApprovalUat({verifyMessage:()=>true});uat.request({...request,risk:'HIGH'});
 assert.equal(uat.receive(message).status,'STRONG_CONFIRMATION_REQUIRED');
 assert.throws(()=>uat.resume(request.id),/RELEASE_DENIED/);
});
test('rejected request never resumes',()=>{
 const uat=createApprovalUat({verifyMessage:()=>true});uat.request(request);
 assert.equal(uat.receive({...message,body:'REJECT TSY-AI-1001'}).status,'REJECTED');
 assert.throws(()=>uat.resume(request.id),/RELEASE_DENIED/);
});
