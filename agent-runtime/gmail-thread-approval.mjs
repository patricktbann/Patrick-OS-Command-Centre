import { APPROVAL_ADDRESS } from './email-approval-policy.mjs';
import { createGmailApprovalAdapter } from './gmail-approval-adapter.mjs';

function normalizeSender(from) {
  const value=String(from||'').trim();
  const bracket=/<([^<>]+)>$/.exec(value);
  const email=(bracket?bracket[1]:value.split(/\s+/).at(-1)).toLowerCase();
  return email===APPROVAL_ADDRESS?email:null;
}
/**
 * Only use after provider authentication has been independently verified.
 * Match a known thread and exact request ID. Never execute actions here.
 */
export function createThreadBoundApprovalProcessor({queue,threadBindings,verifyProviderMessage}) {
  if(!queue || !(threadBindings instanceof Map) || typeof verifyProviderMessage!=='function') throw Error('INVALID_CONFIGURATION');
  const adapter=createGmailApprovalAdapter({
    queue,authenticatedMailbox:APPROVAL_ADDRESS,
    verifyMessage:message=>verifyProviderMessage(message)===true
  });
  return Object.freeze({
    process(message) {
      if(!message || !message.id || !message.threadId || !normalizeSender(message.from)) return {status:'INVALID_SENDER_OR_THREAD'};
      const requestId=threadBindings.get(message.threadId);
      if(!requestId || !queue.status(requestId)) return {status:'UNBOUND_THREAD'};
      if(verifyProviderMessage(message)!==true) return {status:'UNVERIFIED_MESSAGE'};
      const subject=String(message.subject||'');
      if(!subject.includes(requestId)) return {status:'REQUEST_MISMATCH'};
      const first=String(message.body||'').trim().split(/\r?\n/,1)[0].trim();
      let command=first;
      if(/^approved\.?$/i.test(first)) command='APPROVE '+requestId;
      else if(/^rejected\.?$/i.test(first)) command='REJECT '+requestId;
      else if(/^revise\.?$/i.test(first)) return {status:'REVISION_REQUIRED'};
      // Require the bound request ID in the subject; do not accept another ID.
      return adapter.process({...message,from:APPROVAL_ADDRESS,subject,body:command});
    }
  });
}
