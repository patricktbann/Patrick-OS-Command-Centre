/**
 * Private server-only GitHub OAuth code-to-session issuer.
 * No web route is created. Never pass the OAuth client secret to the browser.
 * GitHub numeric account ID (not mutable handle or email) is allowlisted.
 * A user must explicitly authorize the GitHub OAuth app; no silent linking.
 * Account session is local to AI Office; this does NOT authenticate ChatGPT.
 */
import {randomBytes,createHash} from 'node:crypto';
import {DispatchError} from './dispatch.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(x);
const deny=(reason)=>{throw new DispatchError('OAUTH_DENIED',reason)};
export function createGitHubOAuthIssuer({pool,clientId,clientSecret,redirectUri,
 expectedGitHubUserId,principalId,fetchFn=globalThis.fetch,now=()=>new Date(),
 random=randomBytes}={}){
 if(typeof pool?.connect!=='function'||!clientId||!clientSecret||
    typeof redirectUri!=='string'||!redirectUri.startsWith('https://')||
    !Number.isSafeInteger(expectedGitHubUserId)||expectedGitHubUserId<=0||
    !id(principalId)||typeof fetchFn!=='function'||typeof now!=='function'||
    typeof random!=='function')
  throw new DispatchError('OAUTH_NOT_CONNECTED','Private GitHub OAuth configuration unavailable');
 const current=()=>{const d=now();if(!(d instanceof Date)||!Number.isFinite(d.getTime()))deny('Invalid server clock');return d};
 async function transaction(work){
  const conn=await pool.connect();
  try{await conn.query('BEGIN');const out=await work(conn);await conn.query('COMMIT');return out}
  catch(e){try{await conn.query('ROLLBACK')}catch{}throw e}
  finally{conn.release()}
 }
 const call=async(url,options)=>{
  const response=await fetchFn(url,options);
  if(!response?.ok)deny('GitHub identity provider rejected authentication');
  return response.json();
 };
 return Object.freeze({
  async beginLogin(){
   const state=random(32).toString('base64url');
   if(state.length<43)deny('Insufficient login-state randomness');
   const issued=current(),expires=new Date(issued.getTime()+5*60*1000);
   await transaction(c=>c.query('INSERT INTO agent_oauth_login_state(state_hash,issued_at,expires_at) VALUES($1,$2,$3)',
    [hash(state),issued.toISOString(),expires.toISOString()]));
   const url=new URL('https://github.com/login/oauth/authorize');
   url.searchParams.set('client_id',clientId);
   url.searchParams.set('redirect_uri',redirectUri);
   url.searchParams.set('state',state);
   // Identity only: no repository access or org scopes.
   url.searchParams.set('scope','');
   return Object.freeze({authorizationUrl:url.toString(),expiresAt:expires.toISOString()});
  },
  async completeLogin({code,state}={}){
   if(typeof code!=='string'||code.length<4||code.length>512||
      typeof state!=='string'||state.length<43||state.length>256)deny('Invalid callback');
   const session=await transaction(async c=>{
    // Consume state atomically BEFORE an external call. Lost response stays
    // consumed and requires a fresh login; no code/state replay.
    const consumed=await c.query(
     'UPDATE agent_oauth_login_state SET consumed_at=$2 WHERE state_hash=$1 AND consumed_at IS NULL AND issued_at<=$2 AND expires_at>$2 RETURNING state_hash',
     [hash(state),current().toISOString()]);
    if(consumed.rowCount!==1)deny('Expired, unknown or reused login state');
    return true;
   });
   if(!session)deny('No authenticated login state');
   const token=await call('https://github.com/login/oauth/access_token',{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirectUri})});
   if(typeof token.access_token!=='string'||!token.access_token||token.error)
     deny('Authorization code exchange failed');
   const profile=await call('https://api.github.com/user',{
    method:'GET',headers:{Authorization:'Bearer '+token.access_token,
     Accept:'application/vnd.github+json','User-Agent':'Patrick-OS-private-auth'}});
   if(profile?.id!==expectedGitHubUserId)deny('GitHub account is not the authorized Principal');
   const secret=random(32).toString('base64url');
   if(secret.length<43)deny('Insufficient session entropy');
   const issued=current(),expiry=new Date(issued.getTime()+30*60*1000);
   await transaction(c=>c.query(
    'INSERT INTO agent_private_session(session_hash,principal_id,issued_at,expires_at) VALUES($1,$2,$3,$4)',
    [hash(secret),principalId,issued.toISOString(),expiry.toISOString()]));
   // This is a private server-only result. Route handler must set the token
   // in an HttpOnly, Secure, SameSite=Strict cookie over HTTPS, with CSRF
   // protection and no logging. Never emit token to an HTML body.
   return Object.freeze({serverSessionSecret:secret,expiresAt:expiry.toISOString(),
    principalId,githubUserId:profile.id});
  },
  async revokeSession(secret){
   if(typeof secret!=='string'||secret.length<43)deny('Invalid session handle');
   const result=await transaction(c=>c.query(
    'UPDATE agent_private_session SET revoked_at=now() WHERE session_hash=$1 AND revoked_at IS NULL RETURNING session_hash',
    [hash(secret)]));
   return Object.freeze({revoked:result?.rowCount===1});
  }
 });
}
