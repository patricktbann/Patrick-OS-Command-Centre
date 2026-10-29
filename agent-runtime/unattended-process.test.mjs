import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GMAIL_READONLY_SCOPE} from './gmail-readonly-reader.mjs';

const entry=path.join(path.dirname(fileURLToPath(import.meta.url)),'run-local-gmail-worker.mjs');
function run(env){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[entry],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='';
  child.stdout.on('data',chunk=>out+=chunk);
  child.stderr.on('data',chunk=>err+=chunk);
  child.once('error',reject);
  child.once('close',code=>resolve({code,out,err}));
 });
}
test('independent process starts with private fixture and exits safely on missing Gmail authorization',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'patrick-worker-process-'));
 try{
  const tokenPath=path.join(dir,'token.json'),credentialsPath=path.join(dir,'client.json');
  writeFileSync(tokenPath,JSON.stringify({scope:GMAIL_READONLY_SCOPE,access_token:'local-fixture-only',expires_at:Date.now()/1000+3600}));
  const env={...process.env,PATRICK_GMAIL_DB_PATH:path.join(dir,'approval.sqlite'),PATRICK_GMAIL_TOKEN_PATH:tokenPath,PATRICK_GMAIL_CLIENT_PATH:credentialsPath,PATRICK_GMAIL_MAX_CYCLES:'1',PATRICK_GMAIL_INTERVAL_MS:'1000'};
  // Empty SQLite has no bound threads; reader still checks authenticated profile.
  // No live credentials are present, so the worker must not claim healthy UAT.
  const result=await run(env);
  assert.equal(result.code,1);
  assert.match(result.out,/"state":"DEGRADED"/);
  assert.match(result.out,/"state":"FINISHED"/);
  assert.doesNotMatch(result.out,/local-fixture-only/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
