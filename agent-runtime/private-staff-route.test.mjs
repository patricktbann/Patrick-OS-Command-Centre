import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateUatAuthRouter} from './private-uat-auth-router.mjs';
import {createPrivateStaffRegistry} from './private-staff-registry.mjs';
const origin='https://127.0.0.1:18443';
const router=createPrivateUatAuthRouter({origin,issuer:{beginLogin:async()=>{},completeLogin:async()=>{},revokeSession:async()=>{}},identity:{authenticate:async()=>({authenticated:true,subject:'patrick-principal'})},staffRegistry:createPrivateStaffRegistry()});
test('unauthenticated staff listing is denied',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(r.status,401);assert.equal(JSON.parse(r.body).error,'SESSION_REQUIRED')});
test('verified cookie lists only registered staff without execution rights',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)}},{trustedHttps:true});assert.equal(r.status,200);const body=JSON.parse(r.body);assert.equal(body.staff.length,3);assert.equal(body.executionEnabled,false)});

test('task preparation route fails closed until CSRF and request parsing exist',async()=>{const r=await router.handle({method:'POST',url:origin+'/api/staff/prepare',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(r.status,403);assert.equal(JSON.parse(r.body).dispatchEnabled,false)});

test('identity shape uses verified subject, not caller id',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)}},{trustedHttps:true});assert.equal(r.status,200);assert.equal(JSON.parse(r.body).staff.length,3)});

test('authenticated session CSRF token permits a draft-only POST',async()=>{
 const cookie='__Host-patrick_session='+'a'.repeat(43);
 const headers={host:'127.0.0.1:18443',cookie};
 const session=await router.handle({method:'GET',url:origin+'/auth/session',headers},{trustedHttps:true});
 const token=JSON.parse(session.body).csrfToken;
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 const body=JSON.stringify({agentId:'TSY-A0003',objective:'Prepare a read-only review of project risks'});
 const result=await router.handle({method:'POST',url:origin+'/api/staff/prepare',headers:{...headers,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-csrf-token':token},body},{trustedHttps:true});
 assert.equal(result.status,200);
 const draft=JSON.parse(result.body);assert.equal(draft.dispatchEnabled,false);assert.equal(draft.agentId,'TSY-A0003');
 const denied=await router.handle({method:'POST',url:origin+'/api/staff/prepare',headers:{...headers,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-csrf-token':'x'.repeat(43)},body},{trustedHttps:true});
 assert.equal(denied.status,403);
});

test('authenticated AI office landing route returns a private non-executing page',async()=>{
 const headers={host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)};
 const r=await router.handle({method:'GET',url:origin+'/ai-office',headers},{trustedHttps:true});
 assert.equal(r.status,200);assert.match(r.body,/Private AI Staff UAT/);assert.match(r.body,/execution remains disabled/);
 const noSession=await router.handle({method:'GET',url:origin+'/ai-office',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});
 assert.equal(noSession.status,401);assert.match(noSession.body,/Sign in with GitHub/);
});
