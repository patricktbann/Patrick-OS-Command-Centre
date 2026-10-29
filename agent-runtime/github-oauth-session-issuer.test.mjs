import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGitHubOAuthIssuer} from './github-oauth-session-issuer.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const STATE='a'.repeat(43),TOKEN='b'.repeat(43),USER=316092977;
function fixture({identityId=USER,failExchange=false}={}){
 const states=new Map(),sessions=new Map(),events=[],requests=[];
 const pool={connect:async()=>({query:async(sql,args=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO agent_oauth_login_state')){
   states.set(args[0],{from:args[1],until:args[2],consumed:false});events.push('begin');return {rowCount:1,rows:[]};
  }
  if(sql.startsWith('UPDATE agent_oauth_login_state')){
   const s=states.get(args[0]);if(!s||s.consumed||args[1]>=s.until)return {rowCount:0,rows:[]};
   s.consumed=true;events.push('consume');return {rowCount:1,rows:[{state_hash:args[0]}]};
  }
  if(sql.startsWith('INSERT INTO agent_private_session')){
   sessions.set(args[0],{principal:args[1],expiry:args[3]});events.push('session');return {rowCount:1,rows:[]};
  }
  if(sql.startsWith('UPDATE agent_private_session')){
   const s=sessions.get(args[0]);if(!s||s.revoked)return {rowCount:0,rows:[]};
   s.revoked=true;return {rowCount:1,rows:[{session_hash:args[0]}]};
  }
  throw Error('Unexpected SQL');
 },release(){}})};
 const fetchFn=async(url,options)=>{
  requests.push({url,options});
  if(url.includes('/access_token'))return {ok:!failExchange,json:async()=>({access_token:'test-access-token'})};
  return {ok:true,json:async()=>({id:identityId,login:'patricktbann'})};
 };
 const random=()=>Buffer.from('z'.repeat(32));
 const issuer=createGitHubOAuthIssuer({pool,clientId:'configured-client',clientSecret:'private-client-secret',
 redirectUri:'https://localhost.example/callback',expectedGitHubUserId:USER,principalId:'patrick-principal',
 fetchFn,now:()=>new Date('2026-10-27T03:00:00Z'),random});
 return {issuer,states,sessions,events,requests};
}
test('unconfigured issuer fails closed',()=>{
 assert.throws(()=>createGitHubOAuthIssuer(),e=>e.code==='OAUTH_NOT_CONNECTED');
});
test('begin login creates 5-minute single-use challenge and identity-only URL',async()=>{
 const f=fixture(),r=await f.issuer.beginLogin(),u=new URL(r.authorizationUrl);
 assert.equal(u.hostname,'github.com');assert.equal(u.searchParams.get('client_id'),'configured-client');
 assert.equal(u.searchParams.get('state').length,43);
 assert.equal(u.searchParams.get('scope'),'');
 assert.equal(f.states.size,1);assert.equal(r.expiresAt,'2026-10-27T03:05:00.000Z');
 assert.equal(r.authorizationUrl.includes('private-client-secret'),false);
});
test('verified numeric GitHub account issues hashed session, never stores raw token',async()=>{
 const f=fixture();const {authorizationUrl}=await f.issuer.beginLogin();
 const state=new URL(authorizationUrl).searchParams.get('state');
 const r=await f.issuer.completeLogin({code:'github-code',state});
 assert.equal(r.principalId,'patrick-principal');assert.equal(r.githubUserId,USER);
 assert.equal(f.sessions.size,1);assert.ok(f.sessions.has(hash(r.serverSessionSecret)));
 assert.equal(f.sessions.has(r.serverSessionSecret),false);
 assert.deepEqual(f.events,['begin','consume','session']);
 assert.equal(f.requests.length,2);
 assert.equal(f.requests[0].options.body.includes('private-client-secret'),true);
 assert.equal(f.requests[1].options.headers.Authorization,'Bearer test-access-token');
 assert.deepEqual(await f.issuer.revokeSession(r.serverSessionSecret),{revoked:true});
 assert.deepEqual(await f.issuer.revokeSession(r.serverSessionSecret),{revoked:false});
});
test('reusing one OAuth state cannot issue another session',async()=>{
 const f=fixture();const {authorizationUrl}=await f.issuer.beginLogin();
 const state=new URL(authorizationUrl).searchParams.get('state');
 await f.issuer.completeLogin({code:'github-code',state});
 await assert.rejects(f.issuer.completeLogin({code:'github-code',state}),e=>e.code==='OAUTH_LOGIN_STATE_REJECTED');
 assert.equal(f.sessions.size,1);
});
test('wrong GitHub user ID cannot become Patrick even with same username',async()=>{
 const f=fixture({identityId:USER+1});const {authorizationUrl}=await f.issuer.beginLogin();
 await assert.rejects(f.issuer.completeLogin({code:'github-code',state:new URL(authorizationUrl).searchParams.get('state')}),e=>e.code==='OAUTH_IDENTITY_DENIED');
 assert.equal(f.sessions.size,0);
});
test('failed token exchange consumes challenge without session issuance',async()=>{
 const f=fixture({failExchange:true});const {authorizationUrl}=await f.issuer.beginLogin();
 await assert.rejects(f.issuer.completeLogin({code:'github-code',state:new URL(authorizationUrl).searchParams.get('state')}),e=>e.code==='OAUTH_TOKEN_EXCHANGE_FAILED');
 assert.equal(f.sessions.size,0);
});
test('unrecognized state is rejected before contacting GitHub',async()=>{
 const f=fixture();
 await assert.rejects(f.issuer.completeLogin({code:'github-code',state:STATE}),e=>e.code==='OAUTH_LOGIN_STATE_REJECTED');
 assert.equal(f.requests.length,0);
});
