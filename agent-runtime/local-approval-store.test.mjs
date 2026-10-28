import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalApprovalStore } from './local-approval-store.mjs';
test('local approval survives restart, releases once, and audits',()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrick-approval-')),file=join(dir,'approval.sqlite');
 try {
  let store=createLocalApprovalStore(file);
  store.create({id:'TSY-AI-2001',taskId:'SYNTHETIC',scope:'Internal test only',risk:'LOW',expiresAt:'2099-01-01T00:00:00Z'});
  store.close();
  store=createLocalApprovalStore(file);
  assert.equal(store.get('TSY-AI-2001').status,'PENDING');
  store.decide({id:'TSY-AI-2001',status:'APPROVED',messageId:'gmail-test-1'});
  assert.equal(store.release('TSY-AI-2001').approvedScope,'Internal test only');
  assert.throws(()=>store.release('TSY-AI-2001'),/RELEASE_DENIED/);
  assert.deepEqual(store.events('TSY-AI-2001').map(e=>e.action),['REQUESTED','APPROVED','RELEASED']);
  store.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('duplicate message ID rolls back second decision',()=>{
 const store=createLocalApprovalStore(':memory:');
 for(let i=1;i<=2;i++)store.create({id:'TSY-AI-200'+i,taskId:'SYNTHETIC',scope:'Internal',expiresAt:'2099-01-01T00:00:00Z'});
 store.decide({id:'TSY-AI-2001',status:'APPROVED',messageId:'same-message'});
 assert.throws(()=>store.decide({id:'TSY-AI-2002',status:'APPROVED',messageId:'same-message'}));
 assert.equal(store.get('TSY-AI-2002').status,'PENDING');store.close();
});
test('high-risk approval denied',()=>{
 const store=createLocalApprovalStore(':memory:');
 store.create({id:'TSY-AI-2003',taskId:'CONTRACT',scope:'High-risk',risk:'HIGH',expiresAt:'2099-01-01T00:00:00Z'});
 assert.throws(()=>store.decide({id:'TSY-AI-2003',status:'APPROVED',messageId:'test-3'}),/DECISION_DENIED/);
 store.close();
});
