import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalApprovalCoordinator} from './local-approval-coordinator.mjs';
const request={id:'TSY-AI-3001',taskId:'SYNTHETIC-REPORT',scope:'Internal report only',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'};
const message={id:'gmail-message-3001',threadId:'gmail-thread-3001',from:'Patrick Teo patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-3001',body:'Approved.'};
test('authenticated email -> durable decision -> synthetic completion -> audit',()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrick-uat-'));
 try{
  const uat=createLocalApprovalCoordinator({databasePath:join(dir,'uat.sqlite'),verifyProviderMessage:m=>m.providerVerified===true});
  uat.request(request,message.threadId);
  assert.equal(uat.receive({...message,providerVerified:true}).status,'APPROVED');
  assert.equal(uat.completeSyntheticTask(request.id).result,'SYNTHETIC_TASK_COMPLETED');
  assert.equal(uat.status(request.id).status,'RELEASED');
  assert.deepEqual(uat.audit(request.id).map(e=>e.action),['REQUESTED','APPROVED','RELEASED']);
  assert.throws(()=>uat.completeSyntheticTask(request.id),/RELEASE_DENIED/);
  uat.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('unverified Gmail reply never authorizes',()=>{
 const uat=createLocalApprovalCoordinator({databasePath:':memory:',verifyProviderMessage:m=>m.providerVerified===true});
 uat.request(request,message.threadId);
 assert.equal(uat.receive(message).status,'UNVERIFIED_MESSAGE');
 assert.throws(()=>uat.completeSyntheticTask(request.id),/RELEASE_DENIED/);uat.close();
});
test('non-synthetic task never executes',()=>{
 const uat=createLocalApprovalCoordinator({databasePath:':memory:',verifyProviderMessage:()=>true});
 uat.request({...request,taskId:'REAL-WORKER'},message.threadId);
 assert.equal(uat.receive(message).status,'APPROVED');
 assert.throws(()=>uat.completeSyntheticTask(request.id),/EXECUTION_NOT_ENABLED/);assert.equal(uat.status(request.id).status,'APPROVED');assert.deepEqual(uat.audit(request.id).map(e=>e.action),['REQUESTED','APPROVED']);uat.close();
});

