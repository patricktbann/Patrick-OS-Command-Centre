import test from 'node:test';import assert from 'node:assert/strict';
import {sessionCsrfToken,verifySessionCsrf} from './private-session-csrf.mjs';
const s={serverValidated:true,opaque:'a'.repeat(48)};
test('verified server session receives stable opaque CSRF token',()=>{const t=sessionCsrfToken(s);assert.match(t,/^[A-Za-z0-9_-]{43}$/);assert.equal(t,sessionCsrfToken(s));assert.equal(verifySessionCsrf(s,t),true)});
test('other sessions and forged values cannot reuse token',()=>{const t=sessionCsrfToken(s);assert.equal(verifySessionCsrf({...s,opaque:'b'.repeat(48)},t),false);assert.equal(verifySessionCsrf(s,'x'.repeat(43)),false)});
test('unverified session cannot obtain or validate token',()=>{assert.equal(sessionCsrfToken({opaque:'a'.repeat(48)}),null);assert.equal(verifySessionCsrf(null,'x'.repeat(43)),false)});
