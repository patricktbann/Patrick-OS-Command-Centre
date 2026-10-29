import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {GMAIL_READONLY_SCOPE} from './gmail-readonly-reader.mjs';
export async function enroll({credentialsPath,tokenPath,openBrowser}) {
 const config=JSON.parse(await readFile(credentialsPath,'utf8')).installed;
 if(config?.auth_uri!=='https://accounts.google.com/o/oauth2/auth'||config.token_uri!=='https://oauth2.googleapis.com/token')throw Error('INVALID_OAUTH_CONFIG');
 const state=randomBytes(32).toString('base64url'), verifier=randomBytes(64).toString('base64url');
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 let resolve,reject;
 const callback=new Promise((a,b)=>{resolve=a;reject=b});
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const received=url.searchParams.get('state')||'';
  const valid=req.method==='GET'&&url.pathname==='/callback'&&url.searchParams.getAll('state').length===1&&Buffer.byteLength(received)===Buffer.byteLength(state)&&timingSafeEqual(Buffer.from(received),Buffer.from(state));
  res.writeHead(valid?200:400,{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  res.end(valid?'Patrick OS consent received. You may close this tab.':'Invalid callback');
  if(valid){if(url.searchParams.getAll('code').length===1)resolve(url.searchParams.get('code'));else reject(Error('CONSENT_DENIED'));}
 });
 await new Promise((a,b)=>{server.once('error',b);server.listen(0,'127.0.0.1',a)});
 const redirect='http://127.0.0.1:'+server.address().port+'/callback';
 const timer=setTimeout(()=>reject(Error('CONSENT_TIMEOUT')),900000);
 try {
  await openBrowser(config.auth_uri+'?'+new URLSearchParams({client_id:config.client_id,redirect_uri:redirect,response_type:'code',scope:GMAIL_READONLY_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256',login_hint:'patricktbann@gmail.com'}));
  console.log('WAITING_FOR_PERSONAL_GOOGLE_CONSENT');
  const code=await callback;
  const r=await fetch(config.token_uri,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'})});
  if(!r.ok)throw Error('OAUTH_EXCHANGE_FAILED');
  const token=await r.json();
  if(token.scope!==GMAIL_READONLY_SCOPE||!token.access_token||!token.refresh_token)throw Error('INVALID_TOKEN_SCOPE_OR_RESPONSE');
  const profile=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token.access_token}});
  if(!profile.ok||(await profile.json()).emailAddress!=='patricktbann@gmail.com')throw Error('MAILBOX_NOT_AUTHORIZED');
  token.expires_at=Date.now()/1000+token.expires_in;
  await writeFile(tokenPath,JSON.stringify(token),{flag:'wx',mode:0o600});
  console.log('OAUTH_TOKEN_SAVED_PRIVATELY');
 }finally{clearTimeout(timer);server.close();}
}
if(process.argv[1]?.endsWith('gmail-readonly-oauth.mjs')) {
 const [credentialsPath,tokenPath]=process.argv.slice(2);
 if(!credentialsPath||!tokenPath)throw Error('PRIVATE_PATH_ARGUMENTS_REQUIRED');
 const openBrowser=url=>{
  if(process.platform!=='win32')throw Error('WINDOWS_BROWSER_REQUIRED');
  const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true});
  return new Promise((a,b)=>{child.once('error',b);child.once('spawn',a)});
 };
 enroll({credentialsPath,tokenPath,openBrowser}).catch(()=>{console.error('OAUTH_ENROLLMENT_FAILED');process.exitCode=1});
}
