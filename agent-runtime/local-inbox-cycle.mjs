/**
 * One-cycle inbox integration, with a caller-supplied authenticated provider.
 * It never schedules itself, sends email, or executes a real-world task.
 */
export function createLocalInboxCycle({coordinator,listThreadMessages,threadBindings,verifyProviderMessage}) {
  if(!coordinator || typeof listThreadMessages!=='function' || typeof verifyProviderMessage!=='function' || typeof threadBindings!=='function') throw Error('INVALID_CONFIGURATION');
  return Object.freeze({
    async runOnce() {
      const results=[];
      for(const {threadId,requestId} of threadBindings()) {
        if(coordinator.status(requestId)?.status!=='PENDING')continue;
        const messages=await listThreadMessages(threadId);
        if(!Array.isArray(messages))throw Error('INVALID_PROVIDER_RESPONSE');
        for(const message of messages) {
          if(message?.threadId!==threadId || !verifyProviderMessage(message))continue;
          const result=coordinator.receive(message);
          results.push({requestId,messageId:message.id,status:result.status});
          if(result.status==='APPROVED' || result.status==='REJECTED' || result.status==='REVISION_REQUESTED')break;
        }
      }
      return results;
    }
  });
}
