import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateOAuthCallback} from './private-oauth-callback.mjs';
const origin='https://ai-office.example.test',callback=origin+'/auth/github/callback';
const state='a'.repeat(43),secret='b'.repeat(43);
function fixture(){
 const calls=[];
 const issuer={
  beginLogin:async()=>({authorizationUrl:'https://github.com/login/oauth/authorize?client_id=ci&redirect_uri='+encodeURIComponent(callback)+'&state='+state}),
  completeLogin:async args=>{calls.push(['complete',args]);return {serverSessionSecret:secret}},
  revokeSession:async token=>{calls.push(['revoke',token]);return {revoked:true}}
 };
 const identity={authenticate:async s=>s.opaque===secret?{authenticated:true,subject:'principal'}:null};
 const app=createPrivateOAuthCallback({issuer,identity,origin});
 const req=(path,headers={},method='GET')=>({url:origin+path,method,secureTransport:true,headers});
 return {app,req,calls};
}
test('GET login binds OAuth state to secure HttpOnly Lax browser cookie',async()=>{
 const {app,req}=fixture(),r=await app.begin(req('/auth/github/start'));
 assert.equal(r.status,303);assert.match(r.headers.Location,/^https:\/\/github.com\/login\/oauth\/authorize/);
 assert.match(r.headers['Set-Cookie'],/^__Host-patrick_oauth_state=/);
 assert.match(r.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Lax; Max-Age=300/);
 assert.equal(r.body,'');
});
test('valid callback exchanges code and issues strict host-only session cookie without leaking token into response',async()=>{
 const {app,req,calls}=fixture();
 const r=await app.callback(req('/auth/github/callback?state='+state+'&code=ci-code',
   {cookie:'__Host-patrick_oauth_state='+state}));
 assert.equal(r.status,303);
 assert.equal(r.headers.Location,origin+'/ai-office');
 assert.ok(Array.isArray(r.headers['Set-Cookie']));
 assert.match(r.headers['Set-Cookie'][1],/Secure; HttpOnly; SameSite=Strict; Max-Age=1800/);
 assert.equal(r.body,'');
 assert.deepEqual(calls,[['complete',{code:'ci-code',state}]]);
});
test('forged state and missing browser state do not call OAuth issuer',async()=>{
 const {app,req,calls}=fixture();
 for(const cookie of ['', '__Host-patrick_oauth_state='+'c'.repeat(43)]){
 const r=await app.callback(req('/auth/github/callback?state='+state+'&code=ci-code',{cookie}));
 assert.equal(r.status,403);}
 assert.deepEqual(calls,[]);
});
test('duplicate callback query parameters rejected before token exchange',async()=>{
 const {app,req,calls}=fixture();
 const r=await app.callback(req('/auth/github/callback?state='+state+'&state='+state+'&code=ci-code',
 {cookie:'__Host-patrick_oauth_state='+state}));
 assert.equal(r.status,403);assert.equal(calls.length,0);
});
test('request must have server-asserted HTTPS and correct method',async()=>{
 const {app,req}=fixture();
 await assert.rejects(app.begin({...req('/auth/github/start'),secureTransport:false}),e=>e.code==='PRIVATE_HTTPS_REQUIRED');
 await assert.rejects(app.callback({...req('/auth/github/callback'),method:'POST'}),e=>e.code==='PRIVATE_HTTPS_REQUIRED');
});
test('wrong public origin denied, no callback issued',async()=>{
 const {app,req,calls}=fixture();
 const r=await app.callback({...req('/auth/github/callback?state='+state+'&code=ci'),url:'https://evil.example/auth/github/callback',
 headers:{cookie:'__Host-patrick_oauth_state='+state}});
 assert.equal(r.status,403);assert.equal(calls.length,0);
});
test('private session obtained only from valid cookie with independent identity verifier',async()=>{
 const {app,req}=fixture();
 assert.equal(await app.sessionFromRequest(req('/ai-office')),null);
 assert.equal(await app.sessionFromRequest(req('/ai-office',{cookie:'__Host-patrick_session='+'d'.repeat(43)})),null);
 assert.deepEqual(await app.sessionFromRequest(req('/ai-office',{cookie:'__Host-patrick_session='+secret})),
 {serverValidated:true,opaque:secret});
});
test('logout requires matching origin and revokes session secret',async()=>{
 const {app,req,calls}=fixture();
 const bad=await app.logout(req('/auth/logout',{origin:'https://evil.example',cookie:'__Host-patrick_session='+secret},'POST'));
 assert.equal(bad.status,403);
 const good=await app.logout(req('/auth/logout',{origin,cookie:'__Host-patrick_session='+secret},'POST'));
 assert.equal(good.status,303);assert.deepEqual(calls,[['revoke',secret]]);
});
test('malconfigured issuer or invalid origin refuses to build',()=>{
 assert.throws(()=>createPrivateOAuthCallback({origin:'http://localhost'}),e=>e.code==='PRIVATE_OAUTH_NOT_CONFIGURED');
});

test('safe diagnostic: missing state cookie is distinguished without OAuth code leakage',async()=>{
 const {app,req}=fixture();
 const r=await app.callback(req('/auth/github/callback?state='+state+'&code=super-sensitive-code'));
 assert.equal(r.status,403);assert.equal(r.headers['X-UAT-Auth-Result'],'STATE_COOKIE_MISSING');
 assert.equal(JSON.stringify(r).includes('super-sensitive-code'),false);
});
test('safe diagnostic: cookie/state mismatch is distinguished without echoing tokens',async()=>{
 const {app,req}=fixture();
 const r=await app.callback(req('/auth/github/callback?state='+state+'&code=secret-code',
 {cookie:'__Host-patrick_oauth_state='+'q'.repeat(43)}));
 assert.equal(r.headers['X-UAT-Auth-Result'],'STATE_MISMATCH');
 assert.equal(JSON.stringify(r).includes('secret-code'),false);
});
test('safe diagnostic: provider denial is generic, no thrown provider detail',async()=>{
 const issuer={beginLogin:async()=>({}),completeLogin:async()=>{const e=Error('SECRET ACCESS TOKEN');e.code='OAUTH_DENIED';throw e},
 revokeSession:async()=>({})};
 const app=createPrivateOAuthCallback({issuer,identity:{authenticate:async()=>null},origin:origin});
 const req=(path,headers={})=>({url:origin+path,method:'GET',secureTransport:true,headers});
 const r=await app.callback(req('/auth/github/callback?state='+state+'&code=ci-code',
 {cookie:'__Host-patrick_oauth_state='+state}));
 assert.equal(r.headers['X-UAT-Auth-Result'],'PROVIDER_OR_STATE_EXCHANGE_DENIED');
 assert.equal(JSON.stringify(r).includes('SECRET ACCESS TOKEN'),false);
});
test('safe diagnostic: unexpected database failure is categorized without its message',async()=>{
 const issuer={beginLogin:async()=>({}),completeLogin:async()=>{throw Error('db password secret')},revokeSession:async()=>({})};
 const app=createPrivateOAuthCallback({issuer,identity:{authenticate:async()=>null},origin});
 const r=await app.callback({url:origin+'/auth/github/callback?state='+state+'&code=ci-code',
 method:'GET',secureTransport:true,headers:{cookie:'__Host-patrick_oauth_state='+state}});
 assert.equal(r.headers['X-UAT-Auth-Result'],'SESSION_BACKEND_FAILED');
 assert.equal(JSON.stringify(r).includes('db password secret'),false);
});

test('safe diagnostic: only allowlisted GitHub failure reasons are exposed',async()=>{
 for(const [code,reason] of [
  ['OAUTH_LOGIN_STATE_REJECTED','LOGIN_STATE_REJECTED'],
  ['OAUTH_TOKEN_EXCHANGE_FAILED','GITHUB_TOKEN_EXCHANGE_FAILED'],
  ['OAUTH_PROFILE_LOOKUP_FAILED','GITHUB_PROFILE_LOOKUP_FAILED'],
  ['OAUTH_IDENTITY_DENIED','GITHUB_IDENTITY_DENIED']]){
  const issuer={beginLogin:async()=>({}),completeLogin:async()=>{const e=Error('raw provider secret');e.code=code;throw e},
   revokeSession:async()=>({})};
  const app=createPrivateOAuthCallback({issuer,identity:{authenticate:async()=>null},origin});
  const r=await app.callback({url:origin+'/auth/github/callback?state='+state+'&code=private-code',
   method:'GET',secureTransport:true,headers:{cookie:'__Host-patrick_oauth_state='+state}});
  assert.equal(r.headers['X-UAT-Auth-Result'],reason);
  assert.equal(JSON.stringify(r).includes('private-code'),false);
  assert.equal(JSON.stringify(r).includes('raw provider secret'),false);
 }
});
