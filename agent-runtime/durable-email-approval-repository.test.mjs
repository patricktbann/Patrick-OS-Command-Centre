import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableApprovalRepository } from './durable-email-approval-repository.mjs';
function mockPool({ updateCount=1, failAudit=false }={}) {
 const queries=[];let released=0;
 const pool={async connect(){return {async query(sql,params){queries.push({sql,params});if(failAudit && sql.includes('INSERT INTO ai_email_approval_event')) throw Error('AUDIT_FAILED');if(sql.startsWith('UPDATE')) return {rowCount:updateCount,rows:[{task_id:'DEMO-1',scope_text:'Draft only'}]};return {rowCount:1,rows:[]}},release(){released++}}}};
 return {pool,queries,get released(){return released}};
}
test('creates request and audit in one transaction',async()=>{const m=mockPool();const repo=createDurableApprovalRepository(m.pool);await repo.create({id:'TSY-AI-0005',taskId:'DEMO-1',scope:'Draft only',risk:'LOW',expiresAt:'2099-01-01',principalEmail:'patricktbann@gmail.com'});assert.equal(m.queries[0].sql,'BEGIN');assert.equal(m.queries.at(-1).sql,'COMMIT');assert.equal(m.released,1)});
test('atomic release returns immutable approved scope',async()=>{const m=mockPool();const result=await createDurableApprovalRepository(m.pool).release('TSY-AI-0005');assert.equal(result.approvedScope,'Draft only');assert.match(m.queries[1].sql,/status='APPROVED' AND risk='LOW' AND expires_at>now\(\)/)});
test('failed release rolls back and closes client',async()=>{const m=mockPool({updateCount:0});await assert.rejects(()=>createDurableApprovalRepository(m.pool).release('TSY-AI-0005'),/RELEASE_DENIED/);assert.equal(m.queries.at(-1).sql,'ROLLBACK');assert.equal(m.released,1)});
test('failed audit rolls back approval decision',async()=>{const m=mockPool({failAudit:true});await assert.rejects(()=>createDurableApprovalRepository(m.pool).decide({id:'TSY-AI-0005',status:'APPROVED',providerMessageId:'gmail-1'}),/AUDIT_FAILED/);assert.equal(m.queries.at(-1).sql,'ROLLBACK')});
test('high-risk approval denied at SQL boundary',async()=>{const m=mockPool({updateCount:0});await assert.rejects(()=>createDurableApprovalRepository(m.pool).decide({id:'TSY-AI-0005',status:'APPROVED',providerMessageId:'gmail-1'}),/NOT_PENDING_OR_NOT_AUTHORIZED/);assert.match(m.queries[1].sql,/risk='LOW'/)});
