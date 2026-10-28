export const APPROVAL_ADDRESS = 'patricktbann@gmail.com';
export function parseApprovalReply({ from, subject, body, verifiedSender = false }, pending) {
  if (!verifiedSender || typeof from !== 'string' || from.trim().toLowerCase() !== APPROVAL_ADDRESS) return { status: 'UNVERIFIED_SENDER' };
  if (!pending || pending.status !== 'PENDING' || !pending.id || !pending.expiresAt) return { status: 'INVALID_REQUEST' };
  if (Date.now() > new Date(pending.expiresAt).getTime()) return { status: 'EXPIRED' };
  if (typeof subject !== 'string' || !subject.includes(pending.id)) return { status: 'REQUEST_MISMATCH' };
  const line = String(body || '').trim().split(/\r?\n/, 1)[0].trim();
  const match = /^(APPROVE|REJECT|REVISE)\s+([A-Z0-9-]+)(?:\s*:\s*(.*))?$/i.exec(line);
  if (!match || match[2] !== pending.id) return { status: 'INVALID_DECISION' };
  const action = match[1].toUpperCase();
  if (action === 'REVISE' && !match[3]?.trim()) return { status: 'REVISION_REQUIRED' };
  if (action === 'APPROVE' && pending.risk !== 'LOW') return { status: 'STRONG_CONFIRMATION_REQUIRED' };
  return { status: action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVISION_REQUESTED', requestId: pending.id, instructions: match[3]?.trim() || null };
}
