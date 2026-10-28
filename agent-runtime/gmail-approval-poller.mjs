import { createThreadBoundApprovalProcessor } from './gmail-thread-approval.mjs';
/**
 * Provider-independent inbox poller. Gmail retrieval is injected, not mocked as
 * proof of identity. No unattended scheduler or worker is started by this module.
 */
export function createApprovalInboxPoller({ queue, threadBindings, listThreadMessages, verifyProviderMessage, recordDecision }) {
  if(typeof listThreadMessages!=='function' || typeof recordDecision!=='function') throw Error('INVALID_CONFIGURATION');
  const processor=createThreadBoundApprovalProcessor({queue,threadBindings,verifyProviderMessage});
  const seen=new Set();
  return Object.freeze({
    async poll() {
      const results=[];
      for(const [threadId,requestId] of threadBindings) {
        const request=queue.status(requestId);
        if(!request || request.status!=='PENDING') continue;
        const messages=await listThreadMessages(threadId);
        if(!Array.isArray(messages)) throw Error('INVALID_PROVIDER_RESPONSE');
        for(const message of messages) {
          if(!message?.id || seen.has(message.id)) continue;
          const result=processor.process(message);
          if(['APPROVED','REJECTED','REVISION_REQUESTED'].includes(result.status)) {
            try {
              await recordDecision({requestId,providerMessageId:message.id,status:result.status});
              seen.add(message.id);
              results.push({requestId,status:result.status,messageId:message.id});
            } catch(error) {
              // Fail closed: local in-memory approval must not authorize release
              // if durable write fails. This poller cannot safely reset queue state.
              throw new Error('DURABLE_DECISION_FAILED_REQUIRES_RECONCILIATION',{cause:error});
            }
          }
        }
      }
      return results;
    }
  });
}
