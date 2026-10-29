import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalQueue } from './email-approval-queue.mjs';
const expiry='2099-01-01T00:00:00Z';
function setup(risk='LOW'){const q=createApprovalQueue();q.request({id:'TSY-AI-0002',taskId:'DEMO-1',scope:'Draft synthetic report only',risk,expiresAt:expiry});return q}
const reply={from:'patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-0002',body:'APPROVE TSY-AI-0002',verifiedSender:true};
test('draft and verified approval release only original scope',()=>{const q=setup();assert.equal(q.draft('TSY-AI-0002').to,'patricktbann@gmail.com');assert.equal(q.ingest('TSY-AI-0002',reply).status,'APPROVED');assert.deepEqual(q.release('TSY-AI-0002'),{taskId:'DEMO-1',approvedScope:'Draft synthetic report only',requestId:'TSY-AI-0002'});assert.deepEqual(q.audit().map(e=>e.action),['REQUESTED','APPROVED','RELEASED'])});
test('unverified sender and high risk cannot release',()=>{const q=setup();assert.equal(q.ingest('TSY-AI-0002',{...reply,verifiedSender:false}).status,'UNVERIFIED_SENDER');assert.throws(()=>q.release('TSY-AI-0002'),/RELEASE_DENIED/);const high=setup('HIGH');assert.equal(high.ingest('TSY-AI-0002',reply).status,'STRONG_CONFIRMATION_REQUIRED');assert.throws(()=>high.release('TSY-AI-0002'),/RELEASE_DENIED/)});
test('duplicate reply and duplicate release are rejected',()=>{const q=setup();q.ingest('TSY-AI-0002',reply);assert.equal(q.ingest('TSY-AI-0002',reply).status,'ALREADY_RESOLVED');q.release('TSY-AI-0002');assert.throws(()=>q.release('TSY-AI-0002'),/RELEASE_DENIED/)});
test('rejection prevents task release',()=>{const q=setup();assert.equal(q.ingest('TSY-AI-0002',{...reply,body:'REJECT TSY-AI-0002'}).status,'REJECTED');assert.throws(()=>q.release('TSY-AI-0002'),/RELEASE_DENIED/)});
