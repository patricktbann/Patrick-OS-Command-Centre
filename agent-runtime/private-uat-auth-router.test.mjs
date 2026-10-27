import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateUatAuthRouter} from './private-uat-auth-router.mjs';
const origin='https://office.example.test';
const state='s'.repeat(43),token='t'.repeat(43);
function fixture(){
 const calls=[];
 const issuer={
  beginLogin:async()=>({authorizationUrl:'https://github.com/login/oauth/authorize?client_id=ci&redirect_uri='+encodeURIComponent(origin+'/auth/github/callback')+'&state='+state}),
  completeLogin:async({code,state:provided})=>{calls.push('complete');assert.equal(provided,state);assert.equal(code,'testcode');return {serverSessionSecret:token}},
  revokeSession:async()=>{calls.push('logout');return {revoked:true}}
 };
 const identity={authenticate:async(session)=>session.opaque===token?{authenticated:true,subject:'patrick'}:null};
 const router=createPrivateUatAuthRouter({issuer,identity,origin});
 const req=(url,method='GET',headers={})=>({url,method,headers:{host:'office.example.test',...headers}});
 const handle=(r,trust=true)=>router.handle(r,{trustedHttps:trust});
 return {router,req,handle,calls};
}
test('private router denies a spoofed TLS flag from user request',async()=>{
 const f=fixture();
 const r=await f.handle({...f.req('/auth/github/start'),trustedHttps:true},false);
 assert.equal(r.status,403);assert.equal(f.calls.length,0);
});
test('private router denies host and forwarded-header confusion',async()=>{
 const f=fixture();
 for(const headers of [{host:'evil.example.test'},{'x-forwarded-host':'office.example.test'},{'x-forwarded-proto':'https'}]){
  const r=await f.handle(f.req('/auth/github/start','GET',headers));
  assert.equal(r.status,403);
 }
});
test('OAuth login route sets no-store, frame denial and state cookie',async()=>{
 const f=fixture(),r=await f.handle(f.req('/auth/github/start'));
 assert.equal(r.status,303);assert.match(r.headers.Location,/github.com\/login\/oauth\/authorize/);
 assert.match(r.headers['Set-Cookie'],/SameSite=Lax/);
 assert.equal(r.headers['Cache-Control'],'no-store');
 assert.equal(r.headers['X-Frame-Options'],'DENY');
});
test('OAuth callback issues secure strict session cookie, not secrets in body',async()=>{
 const f=fixture(),r=await f.handle(f.req('/auth/github/callback?code=testcode&state='+state,'GET',
 {cookie:'__Host-patrick_oauth_state='+state}));
 assert.equal(r.status,303);assert.equal(r.body,'');
 assert.match(r.headers['Set-Cookie'][1],/SameSite=Strict/);
 assert.deepEqual(f.calls,['complete']);
});
test('session probe only reports boolean, does not disclose identity or token',async()=>{
 const f=fixture();
 let r=await f.handle(f.req('/auth/session'));assert.equal(r.status,401);
 r=await f.handle(f.req('/auth/session','GET',{cookie:'__Host-patrick_session='+token}));
 assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.body),{authenticated:true});
 assert.equal(r.body.includes(token),false);assert.equal(r.body.includes('patrick'),false);
});
test('logout requires exact Origin and is POST only',async()=>{
 const f=fixture();
 let r=await f.handle(f.req('/auth/logout','GET',{origin}));assert.equal(r.status,404);
 r=await f.handle(f.req('/auth/logout','POST',{origin:'https://evil.example.test',cookie:'__Host-patrick_session='+token}));
 assert.equal(r.status,403);assert.deepEqual(f.calls,[]);
 r=await f.handle(f.req('/auth/logout','POST',{origin,cookie:'__Host-patrick_session='+token}));
 assert.equal(r.status,303);assert.deepEqual(f.calls,['logout']);
});
test('no dispatcher, approval or arbitrary route can be called',async()=>{
 const f=fixture();
 for(const url of ['/api/dispatch','/api/approve','/agents/execute','/auth/issue-session']){
  const r=await f.handle(f.req(url));
  assert.equal(r.status,404);
 }
});
test('foreign full URL, unknown method and invalid request are rejected',async()=>{
 const f=fixture();
 assert.equal((await f.handle(f.req('https://evil.example.test/auth/session'))).status,405);
 assert.equal((await f.handle(f.req('/auth/session','PUT'))).status,405);
 assert.equal((await f.handle(f.req('https://%'))).status,400);
});
