import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGmailReadonlyReader, loadGmailReadonlyToken, GMAIL_READONLY_SCOPE } from './gmail-readonly-reader.mjs';

const response = body => ({ok:true,json:async()=>body});
const raw = (extra={}) => ({id:'cdef',threadId:'abcd',labelIds:['SENT'],internalDate:'123',payload:{
  mimeType:'text/plain',headers:[{name:'From',value:'Patrick <patricktbann@gmail.com>'},{name:'Subject',value:'UAT TSY-AI-9901'}],
  body:{data:Buffer.from('APPROVE TSY-AI-9901').toString('base64url')},
},...extra});
function setup(messages=[raw()], profile='patricktbann@gmail.com') {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/profile'))return response({emailAddress:profile});
    if(url.includes('?q='))return response({threads:[{id:'abcd'}]});
    return response({id:'abcd',messages});
  };
  return {calls,open:()=>createGmailReadonlyReader({accessToken:'fixture-secret',fetchImpl})};
}
test('live reader authenticates mailbox, decodes plain MIME, and accepts only original immutable objects',async()=>{
  const {open,calls}=setup(); const reader=await open();
  assert.deepEqual(await reader.findUatThreads(),['abcd']);
  const [message]=await reader.listThreadMessages('abcd');
  assert.equal(message.body,'APPROVE TSY-AI-9901');
  assert.equal(reader.verifyMessage(message),true);
  assert.equal(reader.verifyMessage({...message}),false);
  assert.throws(()=>{message.body='REJECT TSY-AI-9901'},TypeError);
  assert(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'));
  assert(calls.every(c=>c.url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/')));
});
test('wrong mailbox fails closed before reading any mail',async()=>{
  const {open,calls}=setup([], 'somebody@example.com');
  await assert.rejects(open,/MAILBOX_NOT_AUTHORIZED/); assert.equal(calls.length,1);
});
test('incoming spoof, drafts, wrong thread, HTML, attachments and duplicate From cannot verify',async()=>{
  const base=raw();
  const cases=[raw({labelIds:['INBOX']}),raw({labelIds:['SENT','DRAFT']}),raw({threadId:'ffff'}),
    raw({payload:{...base.payload,mimeType:'text/html'}}),raw({payload:{...base.payload,filename:'attachment.txt'}}),
    raw({payload:{...base.payload,headers:[...base.payload.headers,{name:'From',value:'patricktbann@gmail.com'}]}}),
    raw({payload:{mimeType:'multipart/mixed',parts:[base.payload,base.payload],headers:base.payload.headers}})];
  const reader=await setup(cases).open();
  for(const message of await reader.listThreadMessages('abcd'))assert.equal(reader.verifyMessage(message),false);
  await assert.rejects(()=>reader.listThreadMessages('../profile'),/INVALID_THREAD_ID/);
});
test('network failures and thread mismatch expose no provider payload or token',async()=>{
  const reader=await createGmailReadonlyReader({accessToken:'fixture-secret',fetchImpl:async url=>url.endsWith('/profile')?response({emailAddress:'patricktbann@gmail.com'}):{ok:false,status:403,json:async()=>({secret:'should-not-escape'})}});
  await assert.rejects(()=>reader.listThreadMessages('abcd'),/^Error: GMAIL_READ_FAILED_403$/);
});
test('private token refresh uses pinned endpoint and retains refresh token atomically',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gmail-test-'));
  try {
    const tokenPath=join(dir,'token.json'),credentialsPath=join(dir,'client.json');
    await writeFile(tokenPath,JSON.stringify({scope:GMAIL_READONLY_SCOPE,refresh_token:'refresh-fixture',expires_at:0}));
    await writeFile(credentialsPath,JSON.stringify({installed:{token_uri:'https://oauth2.googleapis.com/token',client_id:'client-fixture',client_secret:'secret-fixture'}}));
    const fetchImpl=async(url,options)=>{
      assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
      return response({access_token:'new-fixture',expires_in:3600});
    };
    assert.equal(await loadGmailReadonlyToken({tokenPath,credentialsPath,fetchImpl}),'new-fixture');
    const saved=JSON.parse(await readFile(tokenPath,'utf8')); assert.equal(saved.refresh_token,'refresh-fixture');
    assert.equal(await loadGmailReadonlyToken({tokenPath,credentialsPath,fetchImpl:()=>{throw Error('UNEXPECTED_FETCH')}}),'new-fixture');
    await writeFile(tokenPath,JSON.stringify({...saved,scope:'https://mail.google.com/'}));
    await assert.rejects(()=>loadGmailReadonlyToken({tokenPath,credentialsPath,fetchImpl}),/UNEXPECTED_GRANTED_SCOPE/);
  } finally {await rm(dir,{recursive:true,force:true})}
});
