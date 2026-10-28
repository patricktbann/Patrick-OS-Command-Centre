export function createDemoStore() {
  const requests = new Map();
  const audit = [];
  let nextId = 1;
  const roles = Object.freeze({ requester: 'requester', approver: 'approver', auditor: 'auditor' });
  function requireRole(actor, allowed) {
    if (!actor || !allowed.includes(actor.role) || !actor.id) throw new Error('FORBIDDEN');
  }
  function record(action, actor, request) {
    audit.push(Object.freeze({ sequence: audit.length + 1, action, actorId: actor.id, requestId: request.id }));
  }
  return Object.freeze({
    roles,
    submit(actor, { title, amount }) {
      requireRole(actor, ['requester']);
      if (typeof title !== 'string' || !title.trim() || title.length > 120 || !Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('INVALID_REQUEST');
      const request = { id: 'DEMO-' + nextId++, title: title.trim(), amount, requesterId: actor.id, status: 'PENDING', approverId: null };
      requests.set(request.id, request);
      record('SUBMITTED', actor, request);
      return { ...request };
    },
    decide(actor, id, decision) {
      requireRole(actor, ['approver']);
      const request = requests.get(id);
      if (!request) throw new Error('NOT_FOUND');
      if (request.status !== 'PENDING') throw new Error('ALREADY_DECIDED');
      if (request.requesterId === actor.id) throw new Error('SELF_APPROVAL_DENIED');
      if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('INVALID_DECISION');
      request.status = decision;
      request.approverId = actor.id;
      record(decision, actor, request);
      return { ...request };
    },
    list(actor) {
      requireRole(actor, ['requester', 'approver', 'auditor']);
      return [...requests.values()].filter(r => actor.role !== 'requester' || r.requesterId === actor.id).map(r => ({ ...r }));
    },
    audit(actor) {
      requireRole(actor, ['auditor']);
      return audit.map(event => ({ ...event }));
    }
  });
}
