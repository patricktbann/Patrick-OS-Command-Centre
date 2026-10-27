/** Live loopback TLS socket test, local operator only.
 * Uses temporary key/cert paths supplied by the caller.
 * No OAuth client, session database, GitHub login or task dispatch.
 */
import https from 'node:https';
import assert from 'node:assert/strict';
import {loadLocalTls,createLoopbackHttpsUatHost} from './loopback-https-uat-host.mjs';
const [keyFile,certFile]=process.argv.slice(2);
if(!keyFile||!certFile)throw Error('Pass temporary local TLS key and certificate paths');
const {tlsKey,tlsCert}=await loadLocalTls({keyFile,certFile});
const port=18443;
let calls=0;
const host=createLoopbackHttpsUatHost({tlsKey,tlsCert,port,router:{
 async handle(req,context){
  calls++;
  assert.equal(context.trustedHttps,true);
  return {status:200,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},
   body:JSON.stringify({socket:'real-https',dispatch:false,login:false})};
 }
}});
function get(headers={}){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:'127.0.0.1',port,path:'/auth/session',method:'GET',
   rejectUnauthorized:false,headers:{host:'127.0.0.1:'+port,...headers},timeout:5000},res=>{
   let body='';res.on('data',chunk=>body+=chunk);
   res.on('end',()=>resolve({status:res.statusCode,body}));
  });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('UAT socket timeout')));req.end();
 });
}
try{
 const status=await host.start();
 assert.equal(status.externalAccessEnabled,false);
 assert.equal(status.dispatchEndpointsEnabled,false);
 const ok=await get();
 assert.equal(ok.status,200);
 assert.deepEqual(JSON.parse(ok.body),{socket:'real-https',dispatch:false,login:false});
 const bad=await get({'x-forwarded-host':'attacker.invalid'});
 assert.equal(bad.status,403);
 assert.equal(calls,1);
 console.log(JSON.stringify({status:'LIVE_LOOPBACK_TLS_UAT_PASS',port,
  realHttpsRequest:true,untrustedForwardedHostRejected:true,
  dispatchEnabled:false,oauthAuthenticated:false,handlerCalls:calls},null,2));
}finally{await host.close()}
