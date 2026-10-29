import { APPROVAL_ADDRESS } from './email-approval-policy.mjs';
// Adapter for authenticated provider results. No mailbox access or dispatch here.
export function createGmailApprovalAdapter({ queue, authenticatedMailbox, verifyMessage }) {
  if (!queue || authenticatedMailbox !== APPROVAL_ADDRESS || typeof verifyMessage !== 'function') throw new Error('MAILBOX_NOT_AUTHORIZED');
  const seen = new Set();
  return Object.freeze({
    process(message) {
      if (!message || typeof message.id !== 'string' || !message.id || seen.has(message.id)) return { status: 'DUPLICATE_OR_INVALID_MESSAGE' };
      // A displayed From header is not proof of identity: verifyMessage must use
      // authenticated provider evidence and must not trust message.body.
      if (verifyMessage(message) !== true) return { status: 'UNVERIFIED_MESSAGE' };
      const subject = String(message.subject || '');
      const ids = [...subject.matchAll(/TSY-AI-[0-9]{4,}/g)].map(m => m[0]);
      if (new Set(ids).size !== 1 || ids.length !== 1) return { status: 'AMBIGUOUS_REQUEST' };
      const id = ids[0];
      if (!queue.status(id)) return { status: 'UNKNOWN_REQUEST' };
      const result = queue.ingest(id, { from: message.from, subject, body: message.body, verifiedSender: true });
      if (['APPROVED','REJECTED','REVISION_REQUESTED','ALREADY_RESOLVED'].includes(result.status)) seen.add(message.id);
      return result;
    },
    processedCount() { return seen.size; }
  });
}
