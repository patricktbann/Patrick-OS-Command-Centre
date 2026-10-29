import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('./sql/006-email-approval-draft.sql',import.meta.url),'utf8');
test('draft separates email approval from existing engineering approval',()=>assert.match(sql,/CREATE TABLE IF NOT EXISTS ai_email_approval_request/));
test('draft records provider message ID uniquely',()=>assert.match(sql,/UNIQUE\(provider_message_id\)/));
test('draft restricts release to low-risk and approved unexpired records',()=>{assert.match(sql,/status='APPROVED' AND risk='LOW' AND expires_at>now\(\)/);assert.match(sql,/status='RELEASED' AND released_at IS NOT NULL AND risk='LOW'/)});
test('draft is not an applied migration',()=>assert.match(sql,/Do not apply without explicit approval/));
