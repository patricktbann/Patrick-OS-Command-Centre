import {readFileSync} from 'node:fs';
const uatScript=readFileSync(new URL('./private-staff-uat-client.js',import.meta.url),'utf8');
/**
 * Private AI Office UAT auth router. This is an inert request handler, NOT a
 * public HTTP server or a TLS terminator. It exposes NO task dispatch endpoint.
 *
 * A separately reviewed listener must validate TLS at its trust boundary and
 * pass trustedHttps=true out-of-band, never read that assertion from user input.
 * Host, origin, method and path checks are repeated here as defense-in-depth.
 */
import {createPrivateOAuthCallback} from './private-oauth-callback.mjs';
import {DispatchError} from './dispatch.mjs';
import {createAuthenticatedStaffIntake} from './authenticated-staff-intake.mjs';
import {parsePrivateStaffRequest} from './private-staff-request.mjs';
import {sessionCsrfToken,verifySessionCsrf} from './private-session-csrf.mjs';
const fixedHeaders=Object.freeze({
 'Cache-Control':'no-store',
 'Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
 'X-Frame-Options':'DENY'
});
const reply=(status,body='')=>({status,headers:{'Content-Type':'text/plain; charset=utf-8'},body});
function header(headers,name){
 const v=headers?.[name];return typeof v==='string'?v:null;
}
export function createPrivateUatAuthRouter({issuer,identity,origin,staffRegistry}={}){
 if(typeof origin!=='string'||!/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(origin))
  throw new DispatchError('PRIVATE_UAT_NOT_CONFIGURED','Exact approved HTTPS origin required');
 const originUrl=new URL(origin);
 const callback=createPrivateOAuthCallback({issuer,identity,origin});
 return Object.freeze({
  async handle(input,{trustedHttps=false}={}){
   // The edge TLS authority must supply this separately; an HTTP body/header
   // claiming that HTTPS is enabled is irrelevant.
   const method=input?.method;
   const h=input?.headers||{};
   const host=header(h,'host');
   if(trustedHttps!==true||host!==originUrl.host||
      header(h,'x-forwarded-host')!==null||header(h,'x-forwarded-proto')!==null)
     return {...reply(403,'Private HTTPS origin required'),headers:{...fixedHeaders,'Content-Type':'text/plain; charset=utf-8'}};
   let url;
   try{url=new URL(input?.url,origin)}catch{
     return {...reply(400,'Invalid request'),headers:{...fixedHeaders,'Content-Type':'text/plain; charset=utf-8'}};
   }
   if(url.origin!==origin||!['GET','POST'].includes(method))
     return {...reply(405,'Unsupported request'),headers:{...fixedHeaders,'Content-Type':'text/plain; charset=utf-8'}};
   const path=url.pathname;
   const req={method,url:url.toString(),headers:h,secureTransport:true};
   let response;
   if(path==='/auth/github/start'&&method==='GET')response=await callback.begin(req);
   else if(path==='/auth/github/callback'&&method==='GET')response=await callback.callback(req);
   else if(path==='/auth/session'&&method==='GET'){
     const session=await callback.sessionFromRequest(req);
     response={status:session?200:401,headers:{'Content-Type':'application/json; charset=utf-8'},
       body:JSON.stringify({authenticated:!!session,csrfToken:session?sessionCsrfToken(session):null})};
   }
   else if(path==='/ai-office/uat.js'&&method==='GET'){
     const session=await callback.sessionFromRequest(req);
     const principal=session?await identity.authenticate(session):null;
     const allowed=principal?.authenticated===true&&principal.subject==='patrick-principal';
     response=allowed?{status:200,headers:{'Content-Type':'application/javascript; charset=utf-8'},body:uatScript}:{status:401,headers:{'Content-Type':'text/plain; charset=utf-8'},body:'Unauthorized'};
   }
   else if(path==='/ai-office'&&method==='GET'){
     const session=await callback.sessionFromRequest(req);
     const principal=session?await identity.authenticate(session):null;
     const allowed=principal?.authenticated===true&&principal.subject==='patrick-principal';
     response=allowed?{status:200,headers:{'Content-Type':'text/html; charset=utf-8'},body:`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patrick OS Private UAT</title><body style="font:16px system-ui;margin:5vw;max-width:720px"><h1>Patrick OS — Private AI Staff UAT</h1><p>Authenticated private session verified.</p><p>This is the secure backend landing page, not the frozen V3.4 3D office.</p><p>AI staff task execution remains disabled.</p><p><button id="run-uat">Run authenticated draft-only UAT</button></p><pre id="result" aria-live="polite"></pre><script src="/ai-office/uat.js" defer></script></body></html>`}:{status:401,headers:{'Content-Type':'text/html; charset=utf-8'},body:`<!doctype html><html lang="en"><meta charset="utf-8"><title>Patrick OS Login Required</title><body style="font:16px system-ui;margin:5vw"><h1>Patrick OS Private UAT</h1><p>No active session. Login is manual to avoid repeated GitHub OAuth requests.</p><a href="/auth/github/start">Sign in with GitHub</a></body></html>`};
   }   else if(path==='/auth/logout'&&method==='POST')response=await callback.logout(req);
   else if(path==='/api/staff'&&method==='GET'){
     const session=await callback.sessionFromRequest(req);
     const principal=session?await identity.authenticate(session):null;
     const allowed=principal?.authenticated===true&&principal?.subject==='patrick-principal'&&typeof staffRegistry?.listStaff==='function';
     const staff=allowed?await staffRegistry.listStaff(principal):[];
     response={status:allowed?200:401,headers:{'Content-Type':'application/json; charset=utf-8'},
       body:JSON.stringify(allowed?{staff,executionEnabled:false}:{error:'SESSION_REQUIRED'})};
   }
   else if(path==='/api/staff/prepare'&&method==='POST'){
     try{
       const session=await callback.sessionFromRequest({...req,method:'GET'});
       const principal=session?await identity.authenticate(session):null;
       if(principal?.authenticated!==true||principal.subject!=='patrick-principal')throw Error('AUTH_DENIED');
       if(!verifySessionCsrf(session,header(h,'x-csrf-token')))throw Error('CSRF_DENIED');
       const task=parsePrivateStaffRequest({method,origin:header(h,'origin'),expectedOrigin:origin,
         contentType:header(h,'content-type'),contentLength:Number(header(h,'content-length')),
         body:input?.body,csrfHeader:header(h,'x-csrf-token'),csrfCookie:sessionCsrfToken(session)});
       const intake=createAuthenticatedStaffIntake({sessionProvider:async()=>session,identity,registry:staffRegistry});
       const draft=await intake.prepare(task);
       response={status:200,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(draft)};
     }catch{
       response={status:403,headers:{'Content-Type':'application/json; charset=utf-8'},
         body:JSON.stringify({error:'STAFF_PREPARE_DENIED',dispatchEnabled:false})};
     }
   }
   else response=reply(404,'Not found');
   // Never return request headers, OAuth codes or session secrets in the body.
   return Object.freeze({...response,headers:{...fixedHeaders,...response.headers}});
  }
 });
}
