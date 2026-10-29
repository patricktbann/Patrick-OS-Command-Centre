import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createGmailApprovalWorker} from './gmail-approval-worker.mjs';
import {createLocalApprovalCoordinator} from './local-approval-coordinator.mjs';
test('poll failure retries, persists decision, then restart does not replay',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worker-'));let c;
 try{
 const message=Object.freeze({id:'m1',threadId:'abcd',from:'patricktbann@gmail.com',subject:'UAT TSY-AI-9001',body:'Approved.'});
 const open=()=>createLocalApprovalCoordinator({databasePath:join(dir,'test.sqlite'),verifyProviderMessage:m=>m===message});
 c=open();c.request({id:'TSY-AI-9001',taskId:'SYNTHETIC-TEST',scope:'Test only',expiresAt:new Date(Date.now()+60000).toISOString()},'abcd');
 let fail=true;
 const openReader=async()=>{if(fail){fail=false;throw Error('NETWORK_UNAVAILABLE')}return {listThreadMessages:async()=>[message],verifyMessage:m=>m===message}};
 let worker=createGmailApprovalWorker({openReader,coordinator:c});
 await assert.rejects(()=>worker.poll(),/NETWORK_UNAVAILABLE/);assert.equal(c.status('TSY-AI-9001').status,'PENDING');
 assert.equal((await worker.poll())[0].status,'APPROVED');c.close();c=open();
 worker=createGmailApprovalWorker({openReader,coordinator:c});assert.deepEqual(await worker.poll(),[]);
 assert.equal(c.completeSyntheticTask('TSY-AI-9001').result,'SYNTHETIC_TASK_COMPLETED');
 assert.throws(()=>c.completeSyntheticTask('TSY-AI-9001'),/RELEASE_DENIED/);
 }finally{c?.close();rmSync(dir,{recursive:true,force:true})}
});
test('failed durable decision is retried rather than marked seen',async()=>{
 let pending=true,fail=true;
 const coordinator={bindings:()=>[{requestId:'r',threadId:'t'}],status:()=>({status:pending?'PENDING':'APPROVED'}),receive:()=>{if(fail){fail=false;throw Error('DISK_FAILURE')}pending=false;return {status:'APPROVED'}}};
 const m={threadId:'t'};
 const worker=createGmailApprovalWorker({coordinator,openReader:async()=>({listThreadMessages:async()=>[m],verifyMessage:()=>true})});
 await assert.rejects(()=>worker.poll(),/DISK_FAILURE/);assert.equal(pending,true);
 assert.equal((await worker.poll())[0].status,'APPROVED');
});
test('concurrent polls are denied and lock recovers after provider failure',async()=>{
 let reject;const first=new Promise((_,r)=>reject=r);
 const worker=createGmailApprovalWorker({coordinator:{bindings:()=>[]},openReader:()=>first});
 const poll=worker.poll();await assert.rejects(()=>worker.poll(),/POLL_ALREADY_RUNNING/);
 reject(Error('REVOKED'));await assert.rejects(()=>poll,/REVOKED/);
 await assert.rejects(()=>worker.poll(),/REVOKED/);
});
