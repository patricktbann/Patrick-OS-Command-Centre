/**
 * Local-only private GitHub OAuth UAT server. No task/approval/dispatch routes.
 * Requires secrets injected by user-local Windows DPAPI launcher, not chat.
 * Does not expose stored secrets, query strings, cookies or access tokens.
 */
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createGitHubOAuthIssuer} from './github-oauth-session-issuer.mjs';
import {createPostgresSessionIdentity} from './postgres-session-identity.mjs';
import {createPrivateUatAuthRouter} from './private-uat-auth-router.mjs';
import {createLoopbackHttpsUatHost,loadLocalTls} from './loopback-https-uat-host.mjs';
const root=process.env.LOCALAPPDATA;
if(!root)throw Error('Missing local profile');
const require=createRequire(join(root,'PatrickOS','UAT','node-runtime','package.json'));
const {Pool}=require('pg');
const origin='https://127.0.0.1:18443';
const requireText=(name)=>{
 const val=process.env[name];
 if(typeof val!=='string'||val.length<8)throw Error('Missing private configuration: '+name);
 return val;
};
const oauthSecret=requireText('PATRICK_UAT_OAUTH_SECRET');
const dbPassword=requireText('PATRICK_UAT_PG_PASSWORD');
const clientId=requireText('PATRICK_UAT_OAUTH_CLIENT_ID');
const expectedGitHubUserId=316092977;
const tlsDir=join(root,'PatrickOS','UAT','tls');
const {tlsKey,tlsCert}=await loadLocalTls({
 keyFile:join(tlsDir,'localhost.key'),certFile:join(tlsDir,'localhost.crt')});
const pool=new Pool({host:'127.0.0.1',port:55432,user:'uat_oauth_runtime',
 password:dbPassword,database:'patrickos_uat',max:4,
 connectionTimeoutMillis:4000,idleTimeoutMillis:5000});
let host;
try{
 const proof=await pool.query('SELECT current_database() AS db, current_user AS role');
 if(proof.rows[0]?.db!=='patrickos_uat'||proof.rows[0]?.role!=='uat_oauth_runtime')
  throw Error('Untrusted UAT PostgreSQL identity');
 const issuer=createGitHubOAuthIssuer({pool,clientId,clientSecret:oauthSecret,
  redirectUri:origin+'/auth/github/callback',expectedGitHubUserId,
  principalId:'patrick-principal'});
 const identity=createPostgresSessionIdentity({pool});
 const router=createPrivateUatAuthRouter({issuer,identity,origin});
 host=createLoopbackHttpsUatHost({router,port:18443,tlsKey,tlsCert});
 await host.start();
 console.log('PATRICK_OS_REAL_GITHUB_OAUTH_UAT_READY');
 console.log('LOCAL_URL='+origin+'/auth/github/start');
 console.log('DATABASE_ROLE=uat_oauth_runtime');
 console.log('TASK_DISPATCH=DISABLED');
 console.log('NO_SECRETS_PRINTED');
 const cleanup=async()=>{
  try{await host.close()}catch{}
  await pool.end();process.exit(0);
 };
 process.once('SIGINT',()=>{void cleanup()});
 process.once('SIGTERM',()=>{void cleanup()});
}catch(e){
 await pool.end();
 console.error('UAT startup denied: '+(e?.code||'CONFIGURATION_ERROR'));
 process.exitCode=1;
}
