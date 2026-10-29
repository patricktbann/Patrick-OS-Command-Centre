import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalApprovalCoordinator} from './local-approval-coordinator.mjs';
import {createLocalInboxCycle} from './local-inbox-cycle.mjs';
const request={id:'TSY-AI-4001',taskId:'SYNTHETIC-REPORT',scope:'Internal only',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'};
const reply={id:'gmail-reply-4001',threadId:'thread-4001',from:'Patrick Teo patricktbann@gmail.com',subject:'Re: [Patrick OS] Approval Required — TSY-AI-4001',body:'Approved.',providerVerified:true};
test('one inbox cycle persists approved decision, duplicate cycle is inert',async()=>{
 const coordinator=createLocalApprovalCoordinator({databasePath:':memory:',verifyProviderMessage:m=>m.providerVerified===true});
 coordinator.request(request,'thread-4001');
 const cycle=createLocalInboxCycle({coordinator,threadBindings:()=>coordinator.bindings(),listThreadMessages:async()=>[reply],verifyProviderMessage:m=>m.providerVerified===true});
 assert.equal((await cycle.runOnce())[0].status,'APPROVED');
 assert.deepEqual(await cycle.runOnce(),[]);
 assert.equal(coordinator.completeSyntheticTask(request.id).result,'SYNTHETIC_TASK_COMPLETED');
 coordinator.close();
});
test('provider verification failure cannot change approval',async()=>{
 const coordinator=createLocalApprovalCoordinator({databasePath:':memory:',verifyProviderMessage:m=>m.providerVerified===true});
 coordinator.request(request,'thread-4001');
 const cycle=createLocalInboxCycle({coordinator,threadBindings:()=>coordinator.bindings(),listThreadMessages:async()=>[{...reply,providerVerified:false}],verifyProviderMessage:m=>m.providerVerified===true});
 assert.deepEqual(await cycle.runOnce(),[]);
 assert.equal(coordinator.status(request.id).status,'PENDING');
 coordinator.close();
});
test('provider outage rejects cycle without decision',async()=>{
 const coordinator=createLocalApprovalCoordinator({databasePath:':memory:',verifyProviderMessage:()=>true});
 coordinator.request(request,'thread-4001');
 const cycle=createLocalInboxCycle({coordinator,threadBindings:()=>coordinator.bindings(),listThreadMessages:async()=>{throw Error('GMAIL_UNAVAILABLE')},verifyProviderMessage:()=>true});
 await assert.rejects(()=>cycle.runOnce(),/GMAIL_UNAVAILABLE/);
 assert.equal(coordinator.status(request.id).status,'PENDING');
 coordinator.close();
});
