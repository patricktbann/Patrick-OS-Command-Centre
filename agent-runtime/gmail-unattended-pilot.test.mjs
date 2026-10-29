import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGmailUnattendedPilot} from './gmail-unattended-pilot.mjs';
import {GMAIL_READONLY_SCOPE} from './gmail-readonly-reader.mjs';

test('authenticated Gmail reader polls a bound pending thread and records approval once',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'patrick-gmail-pilot-'));
 try{
  const tokenPath=path.join(dir,'token.json'),credentialsPath=path.join(dir,'client.json');
  fs.writeFileSync(tokenPath,JSON.stringify({scope:GMAIL_READONLY_SCOPE,access_token:'test-token',expires_at:Date.now()/1000+3600}));
  const decisions=[];const health=[];
  let status='PENDING';
  const coordinator={
   bindings:()=>[{threadId:'abc123',requestId:'TSY-AI-9001'}],
   status:()=>({status}),
   receive:message=>{decisions.push(message.id);status='APPROVED';return {status}},
  };
  const pilot=await createGmailUnattendedPilot({
   coordinator,tokenPath,credentialsPath,healthSink:e=>health.push(e),
   intervalMs:1000,sleep:async()=>{},
   readerFactory:async()=>({
    listThreadMessages:async()=>[{id:'message1',threadId:'abc123'}],
    verifyMessage:()=>true
   })
  });
  assert.deepEqual(await pilot.start({maxCycles:2}),{completed:2,errors:0,stopped:false});
  assert.deepEqual(decisions,['message1']);
  assert.deepEqual(health.map(x=>x.state),['HEALTHY','HEALTHY','STOPPED']);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('rejects missing durable coordinator',async()=>{
 await assert.rejects(()=>createGmailUnattendedPilot({coordinator:{},healthSink:()=>{}}),/DURABLE_COORDINATOR_REQUIRED/);
});
