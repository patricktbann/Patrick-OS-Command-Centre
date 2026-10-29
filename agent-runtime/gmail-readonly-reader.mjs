import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { APPROVAL_ADDRESS } from './email-approval-policy.mjs';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const api = 'https://gmail.googleapis.com/gmail/v1/users/me';
const mailbox = value => /^(?:patricktbann@gmail\.com|[^<>\r\n]+ <patricktbann@gmail\.com>)$/i.test(String(value || '').trim());

function header(payload, name) {
  const matches = (payload?.headers || []).filter(h => h.name?.toLowerCase() === name.toLowerCase());
  return matches.length === 1 ? matches[0].value : '';
}
function plainText(part) {
  if (!part || part.filename || part.body?.attachmentId) return [];
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return [Buffer.from(part.body.data, 'base64url').toString('utf8')];
  }
  return (part.parts || []).flatMap(plainText);
}

/** Read-only Gmail adapter. Verification applies only to immutable objects
 * returned by this reader, from the authenticated owner's SENT mail.
 * Imported mail/compromised mailbox remain outside this pilot's trust boundary.
 * HTML-only and ambiguous MIME messages cannot authorize a decision.
 */
export async function createGmailReadonlyReader({ accessToken, fetchImpl = fetch }) {
  if (!accessToken || typeof fetchImpl !== 'function') throw Error('GMAIL_TOKEN_REQUIRED');
  const trusted = new WeakSet();
  async function get(path) {
    const response = await fetchImpl(api + path, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw Error(`GMAIL_READ_FAILED_${response.status}`);
    return response.json();
  }
  const profile = await get('/profile');
  if (profile.emailAddress?.toLowerCase() !== APPROVAL_ADDRESS) throw Error('MAILBOX_NOT_AUTHORIZED');
  return Object.freeze({
    authenticatedMailbox: APPROVAL_ADDRESS,
    verifyMessage: message => trusted.has(message),
    async findUatThreads({requestId} = {}) {
      if (requestId && !/^TSY-AI-\d{4,}$/.test(requestId)) throw Error('INVALID_UAT_REQUEST_ID');
      const query = requestId ? `in:sent newer_than:30d subject:${requestId}` : 'in:sent newer_than:30d {subject:UAT subject:test} "TSY-AI"';
      const data = await get('/threads?' + new URLSearchParams({ q: query, maxResults: '20' }));
      return (data.threads || []).map(t => t.id).filter(id => /^[a-f0-9]+$/i.test(id));
    },
    async listThreadMessages(threadId) {
      if (!/^[a-f0-9]+$/i.test(threadId || '')) throw Error('INVALID_THREAD_ID');
      const thread = await get(`/threads/${threadId}?format=full`);
      if (thread.id !== threadId || !Array.isArray(thread.messages)) throw Error('INVALID_GMAIL_THREAD');
      return thread.messages.map(raw => {
        const bodies = plainText(raw.payload);
        const message = Object.freeze({ id: raw.id, threadId: raw.threadId,
          from: header(raw.payload, 'From'), subject: header(raw.payload, 'Subject'),
          body: bodies.length === 1 ? bodies[0] : '', internalDate: Number(raw.internalDate),
        });
        if (raw.id && raw.threadId === threadId && mailbox(message.from) && bodies.length === 1 &&
            raw.labelIds?.includes('SENT') && !raw.labelIds.includes('DRAFT')) trusted.add(message);
        return message;
      });
    },
  });
}

/** Private files must be outside the checkout and restricted to the OS user. */
export async function loadGmailReadonlyToken({ tokenPath, credentialsPath, forceRefresh = false, fetchImpl = fetch }) {
  const token = JSON.parse(await readFile(tokenPath, 'utf8'));
  if (token.scope !== GMAIL_READONLY_SCOPE) throw Error('UNEXPECTED_GRANTED_SCOPE');
  if (!forceRefresh && token.access_token && token.expires_at > Date.now() / 1000 + 60) return token.access_token;
  const config = JSON.parse(await readFile(credentialsPath, 'utf8')).installed;
  if (!config || config.token_uri !== 'https://oauth2.googleapis.com/token' || !token.refresh_token) throw Error('INVALID_REFRESH_CONFIGURATION');
  const response = await fetchImpl(config.token_uri, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refresh_token,
      client_id: config.client_id, client_secret: config.client_secret }),
  });
  if (!response.ok) throw Error(`GMAIL_REFRESH_FAILED_${response.status}`);
  const refreshed = await response.json();
  if (!refreshed.access_token || !Number.isFinite(refreshed.expires_in) || refreshed.expires_in <= 0 ||
      (refreshed.scope && refreshed.scope !== GMAIL_READONLY_SCOPE)) throw Error('INVALID_REFRESH_RESPONSE');
  const saved = { ...token, ...refreshed, expires_at: Date.now() / 1000 + refreshed.expires_in };
  const temp = tokenPath + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(saved), { mode: 0o600, flag: 'wx' });
    await rename(temp, tokenPath);
  } finally { await unlink(temp).catch(() => {}); }
  return saved.access_token;
}
