import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateUatAuthRouter} from './private-uat-auth-router.mjs';
import {createPrivateStaffRegistry} from './private-staff-registry.mjs';
const origin='https://127.0.0.1:18443';
const router=createPrivateUatAuthRouter({origin,issuer:{beginLogin:async()=>{},completeLogin:async()=>{},revokeSession:async()=>{}},identity:{authenticate:async()=>({authenticated:true,subject:'patrick-principal'})},staffRegistry:createPrivateStaffRegistry()});
test('unauthenticated staff listing is denied',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(r.status,401);assert.equal(JSON.parse(r.body).error,'SESSION_REQUIRED')});
test('verified cookie lists only registered staff without execution rights',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)}},{trustedHttps:true});assert.equal(r.status,200);const body=JSON.parse(r.body);assert.equal(body.staff.length,3);assert.equal(body.executionEnabled,false)});

test('task preparation route fails closed until CSRF and request parsing exist',async()=>{const r=await router.handle({method:'POST',url:origin+'/api/staff/prepare',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(r.status,403);assert.equal(JSON.parse(r.body).dispatchEnabled,false)});

test('identity shape uses verified subject, not caller id',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)}},{trustedHttps:true});assert.equal(r.status,200);assert.equal(JSON.parse(r.body).staff.length,3)});

test('authenticated session CSRF token permits a draft-only POST',async()=>{
 const cookie='__Host-patrick_session='+'a'.repeat(43);
 const headers={host:'127.0.0.1:18443',cookie};
 const session=await router.handle({method:'GET',url:origin+'/auth/session',headers},{trustedHttps:true});
 const token=JSON.parse(session.body).csrfToken;
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 const body=JSON.stringify({agentId:'TSY-A0003',objective:'Prepare a read-only review of project risks'});
 const result=await router.handle({method:'POST',url:origin+'/api/staff/prepare',headers:{...headers,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-csrf-token':token},body},{trustedHttps:true});
 assert.equal(result.status,200);
 const draft=JSON.parse(result.body);assert.equal(draft.dispatchEnabled,false);assert.equal(draft.agentId,'TSY-A0003');
 const denied=await router.handle({method:'POST',url:origin+'/api/staff/prepare',headers:{...headers,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-csrf-token':'x'.repeat(43)},body},{trustedHttps:true});
 assert.equal(denied.status,403);
});

test('authenticated AI office landing route returns a private non-executing page',async()=>{
 const headers={host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)};
 const r=await router.handle({method:'GET',url:origin+'/ai-office',headers},{trustedHttps:true});
 assert.equal(r.status,200);assert.match(r.body,/Private AI Staff UAT/);assert.match(r.body,/execution remains disabled/);
 const noSession=await router.handle({method:'GET',url:origin+'/ai-office',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});
 assert.equal(noSession.status,401);assert.match(noSession.body,/Sign in with GitHub/);
});

test('UAT client script requires authentication and contains draft-only checks',async()=>{
 const host='127.0.0.1:18443';
 const denied=await router.handle({method:'GET',url:origin+'/ai-office/uat.js',headers:{host}},{trustedHttps:true});
 assert.equal(denied.status,401);
 const ok=await router.handle({method:'GET',url:origin+'/ai-office/uat.js',headers:{host,cookie:'__Host-patrick_session='+'a'.repeat(43)}},{trustedHttps:true});
 assert.equal(ok.status,200);assert.match(ok.body,/dispatchEnabled/);assert.match(ok.body,/invalid/);
});

test('authenticated margin scenario calculates 45 percent target and rejects forged CSRF',async()=>{
 const cookie='__Host-patrick_session='+'a'.repeat(43),headers={host:'127.0.0.1:18443',cookie};
 const sr=await router.handle({method:'GET',url:origin+'/auth/session',headers},{trustedHttps:true});
 const token=JSON.parse(sr.body).csrfToken;
 const payload={agentId:'TSY-A0003',entity:'TSY Solutions Sdn Bhd',revenue:100000,directCost:70000,targetMarginPercent:45};
 const body=JSON.stringify(payload);
 const req={method:'POST',url:origin+'/api/staff/margin-scenario',headers:{...headers,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-csrf-token':token},body};
 const ok=await router.handle(req,{trustedHttps:true});assert.equal(ok.status,200);
 const data=JSON.parse(ok.body);assert.equal(data.grossProfit,30000);assert.equal(data.costReductionRequired,15000);assert.equal(data.meetsTarget,false);assert.equal(data.dispatchEnabled,false);
 const denied=await router.handle({...req,headers:{...req.headers,'x-csrf-token':'invalid'}},{trustedHttps:true});assert.equal(denied.status,403);
 const cross=await router.handle({...req,headers:{...req.headers,origin:'https://evil.example'}},{trustedHttps:true});assert.equal(cross.status,403);
 const other=JSON.stringify({...payload,entity:'Other Company'});
 const wrong=await router.handle({...req,body:other,headers:{...req.headers,'content-length':String(Buffer.byteLength(other))}},{trustedHttps:true});assert.equal(wrong.status,403);
});

test('frozen V3.4 office is served only to authenticated principal without visual modification',async()=>{
 const headers={host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)};
 const ok=await router.handle({method:'GET',url:origin+'/ai-office/3d',headers},{trustedHttps:true});
 assert.equal(ok.status,200);assert.match(ok.body,/THREE/);assert.match(ok.body,/Operations/);
 const {readFileSync}=await import('node:fs');
 const baseline=readFileSync(new URL('../tsy-group-office-v3-4-visual-preview.html',import.meta.url),'utf8');
 assert.equal(ok.body,baseline);
 const denied=await router.handle({method:'GET',url:origin+'/ai-office/3d',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(denied.status,401);
});

test('V3.8 headquarters requires authentication and exposes controlled staff desks',async()=>{
 const headers={host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)};
 const ok=await router.handle({method:'GET',url:origin+'/ai-office/headquarters',headers},{trustedHttps:true});
 assert.equal(ok.status,200);assert.match(ok.body,/Investment Research Desk/);assert.match(ok.body,/Software Development Desk/);assert.match(ok.body,/Business Development Desk/);assert.match(ok.body,/ai-office\/3d/);
 const script=await router.handle({method:'GET',url:origin+'/ai-office/headquarters.js',headers},{trustedHttps:true});assert.equal(script.status,200);assert.match(script.body,/api\/staff\/prepare/);
 const denied=await router.handle({method:'GET',url:origin+'/ai-office/headquarters',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(denied.status,401);
});
