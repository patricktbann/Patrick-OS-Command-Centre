/**
 * Explicit operator-run integration UAT: real loopback HTTPS socket +
 * private OAuth router. GitHub responses and session store are TEST STUBS.
 * No personal OAuth consent, no database, no real GitHub callback, no dispatch.
 */
import https from 'node:https';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadLocalTls,createLoopbackHttpsUatHost} from './loopback-https-uat-host.mjs';
import {createPrivateUatAuthRouter} from './private-uat-auth-router.mjs';
const [keyFile,certFile]=process.argv.slice(2);
if(!keyFile||!certFile)throw Error('Temporary TLS key and certificate paths required');
const port=18443,origin='https://127.0.0.1:'+port;
const state=randomBytes(32).toString('base64url');
const sessionToken=randomBytes(32).toString('base64url');
let consumed=false,revoked=false,started=0,completed=0;
const issuer={
 async beginLogin(){
  started++;
  const url=new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id','LOCAL-MOCK-ONLY');
  url.searchParams.set('redirect_uri',origin+'/auth/github/callback');
  url.searchParams.set('state',state);
  return {authorizationUrl:url.toString()};
 },
 async completeLogin({code,state:provided}){
  assert.equal(provided,state);assert.equal(code,'LOCAL-FAKE-CODE');
  if(consumed)throw Error('replay');
  consumed=true;completed++;
  return {serverSessionSecret:sessionToken};
 },
 async revokeSession(token){
  if(token===sessionToken){revoked=true;return {revoked:true}}
  return {revoked:false};
 }
};
const identity={async authenticate(session){
 return !revoked&&session?.opaque===sessionToken
 ?{authenticated:true,subject:'LOCAL-TEST-PRINCIPAL'}:null;
}};
const {tlsKey,tlsCert}=await loadLocalTls({keyFile,certFile});
const router=createPrivateUatAuthRouter({issuer,identity,origin});
const host=createLoopbackHttpsUatHost({tlsKey,tlsCert,port,router});
function request(path,{method='GET',cookie='',originHeader='',headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:'127.0.0.1',port,path,method,
   rejectUnauthorized:false,timeout:5000,
   headers:{host:'127.0.0.1:'+port,...(cookie?{cookie}:{}),
    ...(originHeader?{origin:originHeader}:{}),...headers}},res=>{
    let body='';res.on('data',part=>body+=part);
    res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
   });
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Timed out')));
  req.end();
 });
}
try{
 await host.start();
 const login=await request('/auth/github/start');
 assert.equal(login.status,303);
 assert.equal(new URL(login.headers.location).hostname,'github.com');
 const stateCookie=login.headers['set-cookie']?.[0]?.split(';')[0];
 assert.ok(stateCookie?.startsWith('__Host-patrick_oauth_state='));
 assert.match(login.headers['set-cookie'][0],/HttpOnly/);
 const callback=await request('/auth/github/callback?code=LOCAL-FAKE-CODE&state='+state,
  {cookie:stateCookie});
 assert.equal(callback.status,303);
 const sessionSet=callback.headers['set-cookie']?.find(x=>x.startsWith('__Host-patrick_session='));
 assert.ok(sessionSet);assert.match(sessionSet,/SameSite=Strict/);
 const sessionCookie=sessionSet.split(';')[0];
 const status=await request('/auth/session',{cookie:sessionCookie});
 assert.equal(status.status,200);
 assert.deepEqual(JSON.parse(status.body),{authenticated:true});
 const replay=await request('/auth/github/callback?code=LOCAL-FAKE-CODE&state='+state,
  {cookie:stateCookie});
 assert.equal(replay.status,403);
 const forged=await request('/auth/session',{cookie:sessionCookie,
  headers:{'x-forwarded-host':'untrusted.example'}});
 assert.equal(forged.status,403);
 const logout=await request('/auth/logout',{method:'POST',cookie:sessionCookie,originHeader:origin});
 assert.equal(logout.status,303);
 const after=await request('/auth/session',{cookie:sessionCookie});
 assert.equal(after.status,401);
 const dispatch=await request('/api/dispatch',{cookie:sessionCookie});
 assert.equal(dispatch.status,404);
 console.log(JSON.stringify({
  status:'REAL_TLS_MOCK_OAUTH_END_TO_END_PASS',host:'127.0.0.1',port,
  realHttpsSocket:true,oauthProvider:'MOCK_NOT_GITHUB',
  loginStarted:started,callbackCompleted:completed,replayDenied:true,
  forgedHostDenied:true,sessionAuthenticatedBeforeLogout:true,
  sessionDeniedAfterLogout:true,dispatchRouteExposed:false
 },null,2));
}finally{await host.close()}
