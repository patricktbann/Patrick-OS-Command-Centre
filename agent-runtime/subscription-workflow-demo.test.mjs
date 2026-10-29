import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from './subscription-workflow-demo.mjs';
const requester = { id: 'user-a', role: 'requester' };
const approver = { id: 'user-b', role: 'approver' };
const auditor = { id: 'user-c', role: 'auditor' };
test('submit, approve, and audit a synthetic workflow', () => {
  const store = createDemoStore();
  const request = store.submit(requester, { title: 'Demo maintenance approval', amount: 250 });
  assert.equal(request.status, 'PENDING');
  assert.equal(store.decide(approver, request.id, 'APPROVED').status, 'APPROVED');
  assert.deepEqual(store.audit(auditor).map(e => e.action), ['SUBMITTED', 'APPROVED']);
});
test('requesters only see their own records', () => {
  const store = createDemoStore();
  store.submit(requester, { title: 'Demo request', amount: 10 });
  assert.equal(store.list({ id: 'user-x', role: 'requester' }).length, 0);
  assert.equal(store.list(requester).length, 1);
});
test('self approval, repeat decisions and unauthorized audit are rejected', () => {
  const store = createDemoStore();
  const request = store.submit(requester, { title: 'Demo request', amount: 10 });
  assert.throws(() => store.decide({ id: 'user-a', role: 'approver' }, request.id, 'APPROVED'), /SELF_APPROVAL_DENIED/);
  store.decide(approver, request.id, 'REJECTED');
  assert.throws(() => store.decide(approver, request.id, 'APPROVED'), /ALREADY_DECIDED/);
  assert.throws(() => store.audit(requester), /FORBIDDEN/);
});
test('invalid amounts, decisions and roles are rejected', () => {
  const store = createDemoStore();
  assert.throws(() => store.submit(requester, { title: 'Bad', amount: -1 }), /INVALID_REQUEST/);
  assert.throws(() => store.submit({ id: 'x', role: 'auditor' }, { title: 'Bad', amount: 1 }), /FORBIDDEN/);
  const request = store.submit(requester, { title: 'Demo', amount: 1 });
  assert.throws(() => store.decide(approver, request.id, 'PAID'), /INVALID_DECISION/);
});
