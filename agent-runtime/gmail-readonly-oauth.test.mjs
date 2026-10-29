import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {enroll} from './gmail-readonly-oauth.mjs';import {GMAIL_READONLY_SCOPE} from './gmail-readonly-reader.mjs';
test('Node OAuth checks state and PKCE, verifies mailbox, saves private token without Python',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'node-oauth-'));const realFetch=globalThis.fetch;
 try {
 const credentialsPath=join(dir,'client.json'),tokenPath=join(dir,'token.json');
 await writeFile(credentialsPath,JSON.stringify({installed:{auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token',client_id:'fixture',client_secret:'fixture'}}));
 let challenge;
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1'))return realFetch(url,options);
  if(url==='https://oauth2.googleapis.com/token'){
   const {createHash}=await import('node:crypto');
   assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'),challenge);
   return {ok:true,json:async()=>({scope:GMAIL_READONLY_SCOPE,access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600})};
  }
  return {ok:true,json:async()=>({emailAddress:'patricktbann@gmail.com'})};
 };
 await enroll({credentialsPath,tokenPath,openBrowser:async url=>{
  const u=new URL(url);challenge=u.searchParams.get('code_challenge');assert.equal(u.searchParams.get('scope'),GMAIL_READONLY_SCOPE);
  const callback=new URL(u.searchParams.get('redirect_uri'));
  callback.searchParams.set('state','invalid');assert.equal((await realFetch(callback)).status,400);
  callback.searchParams.set('state',u.searchParams.get('state'));callback.searchParams.set('code','fixture-code');assert.equal((await realFetch(callback)).status,200);
 }});
 assert.equal(JSON.parse(await readFile(tokenPath,'utf8')).scope,GMAIL_READONLY_SCOPE);
 }finally{globalThis.fetch=realFetch;await rm(dir,{recursive:true,force:true})}
});
