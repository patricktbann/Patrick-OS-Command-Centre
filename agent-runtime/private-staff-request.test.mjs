import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrivateStaffRequest} from './private-staff-request.mjs';
const csrf='a'.repeat(48);const body=JSON.stringify({agentId:'TSY-A0003',objective:'Prepare a read-only risk review'});
const valid={method:'POST',origin:'https://127.0.0.1:18443',expectedOrigin:'https://127.0.0.1:18443',contentType:'application/json',contentLength:Buffer.byteLength(body),body,csrfHeader:csrf,csrfCookie:csrf};
test('valid bounded request yields only expected fields',()=>assert.equal(parsePrivateStaffRequest(valid).agentId,'TSY-A0003'));
test('cross-origin request denied',()=>assert.throws(()=>parsePrivateStaffRequest({...valid,origin:'https://evil.example'}),{code:'ORIGIN_DENIED'}));
test('CSRF mismatch denied',()=>assert.throws(()=>parsePrivateStaffRequest({...valid,csrfCookie:'b'.repeat(48)}),{code:'CSRF_DENIED'}));
test('unexpected authority fields denied',()=>{const changed=JSON.stringify({...JSON.parse(body),dispatchEnabled:true});assert.throws(()=>parsePrivateStaffRequest({...valid,body:changed,contentLength:Buffer.byteLength(changed)}),{code:'UNEXPECTED_FIELDS'})});
test('oversized and invalid lengths denied',()=>{assert.throws(()=>parsePrivateStaffRequest({...valid,body:'x'.repeat(4097),contentLength:4097}),{code:'BODY_TOO_LARGE'});assert.throws(()=>parsePrivateStaffRequest({...valid,contentLength:0}),{code:'BODY_LENGTH_INVALID'})});
