/**
 * Private HTTPS OAuth callback handlers. No listener, router, public GitHub
 * Pages integration, or production deployment. Use only behind an explicitly
 * configured TLS-terminating private backend with origin/host validation.
 *
 * OAuth state cookie uses SameSite=Lax because GitHub returns via top-level
 * cross-site GET; the authenticated session uses SameSite=Strict.
 * Never log request URLs/cookies/tokens or expose session secrets in HTML.
 */
import {timingSafeEqual} from 'node:crypto';
import {DispatchError} from './dispatch.mjs';
const STATE_COOKIE='__Host-patrick_oauth_state';
const SESSION_COOKIE='__Host-patrick_session';
const safeEqual=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);
};
function cookieValue(request,name){
 const raw=request?.headers?.cookie;
 if(typeof raw!=='string'||raw.length>4096)return null;
 const vals=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 if(vals.length!==1)return null;
 const value=vals[0].slice(name.length+1);
 return /^[A-Za-z0-9_-]{43,512}$/.test(value)?value:null;
}
function requireSecure(request,method){
 // secureTransport is asserted only by a private server's trusted TLS adapter
 // after enforcing exact public hostname and HTTPS. Never take from HTTP body.
 if(request?.secureTransport!==true||request?.method!==method)
   throw new DispatchError('PRIVATE_HTTPS_REQUIRED','Trusted HTTPS request required');
}
const set=(name,value,tail)=>name+'='+value+'; Path=/; Secure; HttpOnly; '+tail;
const expire=name=>set(name,'','SameSite=Lax; Max-Age=0');
// Fixed, non-sensitive diagnostic categories. Never include code, state, tokens,
// cookie values, provider response bodies or raw exception messages.
const fail=(reason='OAUTH_DENIED')=>({status:403,headers:{'Cache-Control':'no-store',
 'Content-Type':'text/plain; charset=utf-8','X-UAT-Auth-Result':reason,
 'Referrer-Policy':'no-referrer'},body:'Authorization failed ('+reason+'). Start a new login.'});
export function createPrivateOAuthCallback({issuer,identity,origin,callbackPath='/auth/github/callback',landingPath='/ai-office'}={}){
 if(typeof issuer?.beginLogin!=='function'||typeof issuer?.completeLogin!=='function'||
 typeof issuer?.revokeSession!=='function'||typeof identity?.authenticate!=='function'||
 typeof origin!=='string'||!/^https:\/\/[^/]+$/.test(origin)||
 typeof callbackPath!=='string'||!callbackPath.startsWith('/')||
 !/^\/[a-z0-9/_-]+$/i.test(landingPath))
   throw new DispatchError('PRIVATE_OAUTH_NOT_CONFIGURED','Private HTTPS issuer, identity and paths required');
 const callbackUrl=origin+callbackPath;
 function requestUrl(request){
   try{
    const url=new URL(request?.url,origin);
    if(url.origin!==origin)return null;
    return url;
   }catch{return null}
 }
 return Object.freeze({
  async begin(request){
   requireSecure(request,'GET');
   const url=requestUrl(request);
   if(!url||url.pathname!=='/auth/github/start')return fail();
   const initiated=await issuer.beginLogin();
   const authorization=new URL(initiated.authorizationUrl);
   // Enforce exact configured callback and domain; no provider URL override.
   if(authorization.origin!=='https://github.com'||
      authorization.pathname!=='/login/oauth/authorize'||
      authorization.searchParams.get('redirect_uri')!==callbackUrl)return fail();
   const state=authorization.searchParams.get('state');
   if(typeof state!=='string'||!/^[-_A-Za-z0-9]{43,256}$/.test(state))return fail();
   return {status:303,headers:{
     Location:authorization.toString(),'Cache-Control':'no-store',
     'Set-Cookie':set(STATE_COOKIE,state,'SameSite=Lax; Max-Age=300')
   },body:''};
  },
  async callback(request){
   requireSecure(request,'GET');
   const url=requestUrl(request);
   if(!url||url.pathname!==callbackPath)return fail('CALLBACK_ROUTE_INVALID');
   const code=url.searchParams.getAll('code'),states=url.searchParams.getAll('state');
   const cookieState=cookieValue(request,STATE_COOKIE);
   if(code.length!==1||states.length!==1)return fail('CALLBACK_PARAMETERS_INVALID');
   if(!cookieState)return fail('STATE_COOKIE_MISSING');
   if(!safeEqual(cookieState,states[0]))return fail('STATE_MISMATCH');
   try{
    const issued=await issuer.completeLogin({code:code[0],state:states[0]});
    if(typeof issued?.serverSessionSecret!=='string'||issued.serverSessionSecret.length<43)return fail('SESSION_ISSUANCE_INVALID');
    return {status:303,headers:{
      Location:origin+landingPath,'Cache-Control':'no-store',
      'Referrer-Policy':'no-referrer',
      'Set-Cookie':[
        expire(STATE_COOKIE),
        set(SESSION_COOKIE,issued.serverSessionSecret,'SameSite=Strict; Max-Age=1800')
      ]
    },body:''};
   }catch(error){
     const safeReasons={
       OAUTH_LOGIN_STATE_REJECTED:'LOGIN_STATE_REJECTED',
       OAUTH_TOKEN_EXCHANGE_FAILED:'GITHUB_TOKEN_EXCHANGE_FAILED',
       OAUTH_PROFILE_LOOKUP_FAILED:'GITHUB_PROFILE_LOOKUP_FAILED',
       OAUTH_IDENTITY_DENIED:'GITHUB_IDENTITY_DENIED',
       OAUTH_DENIED:'PROVIDER_OR_STATE_EXCHANGE_DENIED'
     };
     return fail(safeReasons[error?.code]||'SESSION_BACKEND_FAILED');
   }
  },
  async sessionFromRequest(request){
   requireSecure(request,'GET');
   const token=cookieValue(request,SESSION_COOKIE);
   if(!token)return null;
   const session={serverValidated:true,opaque:token};
   const principal=await identity.authenticate(session);
   return principal?.authenticated===true?session:null;
  },
  async logout(request){
   requireSecure(request,'POST');
   // CSRF defense-in-depth: exact server-origin check (also Strict cookie).
   if(request?.headers?.origin!==origin)return fail();
   const token=cookieValue(request,SESSION_COOKIE);
   if(token)await issuer.revokeSession(token);
   return {status:303,headers:{Location:origin+landingPath,
     'Cache-Control':'no-store','Set-Cookie':set(SESSION_COOKIE,'','SameSite=Strict; Max-Age=0')},body:''};
  }
 });
}
