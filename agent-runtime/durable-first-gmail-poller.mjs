/**
 * Durable-first approval polling orchestration. The Gmail adapter only parses
 * an already provider-verified reply. No worker is released in this module.
 * Decision is persisted BEFORE in-memory state changes.
 */
export function createDurableFirstApprovalPoller({ queue, threadBindings, listThreadMessages, verifyProviderMessage, parseDecision, durableRepository }) {
  if (!queue || !(threadBindings instanceof Map) || typeof listThreadMessages !== 'function' || typeof verifyProviderMessage !== 'function' || typeof parseDecision !== 'function' || !durableRepository || typeof durableRepository.decide !== 'function') throw Error('INVALID_CONFIGURATION');
  return Object.freeze({
    async poll() {
      const outcomes=[];
      for(const [threadId,requestId] of threadBindings) {
        const request=queue.status(requestId);
        if(!request || request.status!=='PENDING') continue;
        const messages=await listThreadMessages(threadId);
        if(!Array.isArray(messages)) throw Error('INVALID_PROVIDER_RESPONSE');
        for(const message of messages) {
          if(!message?.id || message.threadId!==threadId || verifyProviderMessage(message)!==true) continue;
          const decision=parseDecision(message,request);
          if(!decision || !['APPROVED','REJECTED','REVISION_REQUESTED'].includes(decision.status)) continue;
          // Durable state is the authority; a failed write must not approve memory.
          await durableRepository.decide({id:requestId,status:decision.status,providerMessageId:message.id});
          outcomes.push({requestId,status:decision.status,providerMessageId:message.id,durable:true});
          // Stop processing this thread; refresh queue from database before next poll.
          break;
        }
      }
      return outcomes;
    }
  });
}
