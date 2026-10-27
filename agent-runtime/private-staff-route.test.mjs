import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateUatAuthRouter} from './private-uat-auth-router.mjs';
import {createPrivateStaffRegistry} from './private-staff-registry.mjs';
const origin='https://127.0.0.1:18443';
const router=createPrivateUatAuthRouter({origin,issuer:{beginLogin:async()=>{},completeLogin:async()=>{},revokeSession:async()=>{}},identity:{authenticate:async()=>({authenticated:true,id:'patrick-principal'})},staffRegistry:createPrivateStaffRegistry()});
test('unauthenticated staff listing is denied',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443'}},{trustedHttps:true});assert.equal(r.status,401);assert.equal(JSON.parse(r.body).error,'SESSION_REQUIRED')});
test('verified cookie lists only registered staff without execution rights',async()=>{const r=await router.handle({method:'GET',url:origin+'/api/staff',headers:{host:'127.0.0.1:18443',cookie:'__Host-patrick_session='+'a'.repeat(43)}},{trustedHttps:true});assert.equal(r.status,200);const body=JSON.parse(r.body);assert.equal(body.staff.length,3);assert.equal(body.executionEnabled,false)});
