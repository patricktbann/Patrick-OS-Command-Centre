import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalGmailWorker} from './local-gmail-worker.mjs';
import {GMAIL_READONLY_SCOPE} from './gmail-readonly-reader.mjs';

test('worker starts, stops, and reopens the same durable database',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'patrick-worker-'));
 const databasePath=path.join(dir,'approvals.sqlite'),tokenPath=path.join(dir,'token.json'),credentialsPath=path.join(dir,'client.json');
 writeFileSync(tokenPath,JSON.stringify({scope:GMAIL_READONLY_SCOPE,access_token:'fixture',expires_at:Date.now()/1000+3600}));
 try{
  const events=[];
  const config={databasePath,tokenPath,credentialsPath,healthSink:e=>events.push(e),intervalMs:1000,sleep:async()=>{},readerFactory:async()=>({verifyMessage:()=>false,listThreadMessages:async()=>[]})};
  const first=await createLocalGmailWorker(config);
  assert.deepEqual(await first.start({maxCycles:2}),{completed:2,errors:0,stopped:false});
  first.close();
  const second=await createLocalGmailWorker(config);
  assert.deepEqual(await second.start({maxCycles:1}),{completed:1,errors:0,stopped:false});
  second.close();
  assert.equal(events.filter(e=>e.state==='HEALTHY').length,3);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('private paths are required',async()=>{
 await assert.rejects(()=>createLocalGmailWorker({}),/PRIVATE_PATHS_REQUIRED/);
});
