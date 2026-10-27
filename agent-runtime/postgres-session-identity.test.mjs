import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPostgresSessionIdentity} from './postgres-session-identity.mjs';
const token='x'.repeat(48),hash=createHash('sha256').update(token).digest('hex');
test('private DB identity verifier rejects missing and browser-claimed sessions',async()=>{
 let n=0;const identity=createPostgresSessionIdentity({pool:{query:async()=>{n++;return {rowCount:1,rows:[{principal_id:'patrick-principal'}]}}}});
 for(const s of [null,{}, {serverValidated:false,opaque:token},{serverValidated:true,opaque:'short'}])
  assert.equal(await identity.authenticate(s),null);
 assert.equal(n,0);
});
test('valid server session is checked by hashed token, expiry and revocation query',async()=>{
 let sql='',params;
 const pool={query:async(s,a)=>{sql=s;params=a;return {rowCount:1,rows:[{principal_id:'patrick-principal'}]}}};
 const identity=createPostgresSessionIdentity({pool,clock:()=>new Date('2026-10-27T03:00:00Z')});
 assert.deepEqual(await identity.authenticate({serverValidated:true,opaque:token}),{authenticated:true,subject:'patrick-principal'});
 assert.equal(params[0],hash);assert.equal(params[1],'2026-10-27T03:00:00.000Z');
 assert.match(sql,/revoked_at IS NULL/);assert.match(sql,/expires_at>/);
 assert.equal(sql.includes(token),false);
});
test('expired or revoked session returns no trusted principal',async()=>{
 const identity=createPostgresSessionIdentity({pool:{query:async()=>({rowCount:0,rows:[]})}});
 assert.equal(await identity.authenticate({serverValidated:true,opaque:token}),null);
});
test('invalid DB principal cannot authenticate',async()=>{
 const identity=createPostgresSessionIdentity({pool:{query:async()=>({rowCount:1,rows:[{principal_id:'<invalid>'}]})}});
 assert.equal(await identity.authenticate({serverValidated:true,opaque:token}),null);
});
test('missing trusted DB denies identity construction',()=>{
 assert.throws(()=>createPostgresSessionIdentity(),e=>e.code==='IDENTITY_NOT_CONNECTED');
});
