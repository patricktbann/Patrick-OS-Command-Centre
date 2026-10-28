import { parseApprovalReply, APPROVAL_ADDRESS } from './email-approval-policy.mjs';
export function createApprovalQueue() {
  const requests = new Map();
  const events = [];
  function log(id, action) { events.push(Object.freeze({ requestId: id, action, sequence: events.length + 1 })); }
  return Object.freeze({
    request({ id, taskId, scope, risk = 'LOW', expiresAt }) {
      if (!/^[A-Z0-9-]{6,64}$/.test(id || '') || !taskId || !scope || !['LOW','MEDIUM','HIGH'].includes(risk) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now() || requests.has(id)) throw new Error('INVALID_APPROVAL_REQUEST');
      const item = { id, taskId, scope, risk, expiresAt, status: 'PENDING', recipient: APPROVAL_ADDRESS };
      requests.set(id, item); log(id, 'REQUESTED');
      return { ...item };
    },
    draft(id) {
      const item = requests.get(id);
      if (!item) throw new Error('NOT_FOUND');
      return { to: item.recipient, subject: '[Patrick OS] Approval Required — ' + item.id, body: ['Task: ' + item.taskId, 'Scope: ' + item.scope, 'Risk: ' + item.risk, 'Expires: ' + item.expiresAt, 'Reply: APPROVE ' + item.id + ' / REJECT ' + item.id + ' / REVISE ' + item.id + ': instructions', 'High-risk actions require stronger confirmation.'].join('\n') };
    },
    ingest(id, message) {
      const item = requests.get(id);
      if (!item) return { status: 'NOT_FOUND' };
      if (item.status !== 'PENDING') return { status: 'ALREADY_RESOLVED' };
      const result = parseApprovalReply(message, item);
      if (['APPROVED','REJECTED','REVISION_REQUESTED'].includes(result.status)) {
        item.status = result.status;
        log(id, result.status);
      }
      return result;
    },
    release(id) {
      const item = requests.get(id);
      if (!item || item.status !== 'APPROVED' || item.risk !== 'LOW' || Date.now() > Date.parse(item.expiresAt)) throw new Error('RELEASE_DENIED');
      item.status = 'RELEASED'; log(id, 'RELEASED');
      return { taskId: item.taskId, approvedScope: item.scope, requestId: id };
    },
    status(id) { const item = requests.get(id); return item ? { ...item } : null; },
    audit() { return events.map(e => ({ ...e })); }
  });
}
