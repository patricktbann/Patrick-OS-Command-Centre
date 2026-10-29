import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedGmailThreadProvider} from './verified-gmail-provider.mjs';
test('accepts only provider-verified messages in the bound thread', async()=>{
 const p=createVerifiedGmailThreadProvider({readThread:async()=>[{id:'1',threadId:'thread-1',verified:true},{id:'2',threadId:'thread-2',verified:true},{id:'3',threadId:'thread-1',verified:false}],verifyMessage:m=>m.verified===true});
 assert.deepEqual((await p.listThreadMessages('thread-1')).map(m=>m.id),['1']);
});
test('fails closed on malformed response',async()=>{
 const p=createVerifiedGmailThreadProvider({readThread:async()=>null,verifyMessage:()=>true});
 await assert.rejects(()=>p.listThreadMessages('thread-1'),/INVALID_PROVIDER_RESPONSE/);
});
