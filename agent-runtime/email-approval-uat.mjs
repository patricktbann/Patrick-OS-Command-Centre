import { createApprovalQueue } from './email-approval-queue.mjs';
import { createGmailApprovalAdapter } from './gmail-approval-adapter.mjs';

/** Offline UAT only: injected verifier and synthetic message, no Gmail/network/worker. */
export function createApprovalUat({ verifyMessage }) {
  const queue = createApprovalQueue();
  const gmail = createGmailApprovalAdapter({
    queue, authenticatedMailbox: 'patricktbann@gmail.com', verifyMessage
  });
  const completed = [];
  return Object.freeze({
    request(input) { const request = queue.request(input); return { request, draft: queue.draft(input.id) }; },
    receive(message) { return gmail.process(message); },
    resume(requestId) {
      const ticket = queue.release(requestId);
      // Explicitly limited to synthetic execution; never call a real worker.
      completed.push(Object.freeze({ ...ticket, result: 'SYNTHETIC_TASK_COMPLETED' }));
      return completed.at(-1);
    },
    report() { return { tasks: completed.map(item => ({ ...item })), audit: queue.audit() }; }
  });
}
