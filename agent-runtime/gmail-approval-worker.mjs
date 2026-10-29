/** Supervised polling only; no scheduler and no executor. Reconstruct reader per
 * poll so token refresh and mailbox authentication are checked after recovery. */
export function createGmailApprovalWorker({openReader,coordinator}) {
 if(typeof openReader!=='function'||!coordinator)throw Error('INVALID_WORKER_CONFIG');
 let busy=false;
 return Object.freeze({async poll(){
  if(busy)throw Error('POLL_ALREADY_RUNNING');
  busy=true;
  try {
   const reader=await openReader(); const results=[];
   for(const binding of coordinator.bindings()) {
    if(coordinator.status(binding.requestId)?.status!=='PENDING')continue;
    for(const message of await reader.listThreadMessages(binding.threadId)) {
     if(message.threadId!==binding.threadId||!reader.verifyMessage(message))continue;
     const result=coordinator.receive(message);
     results.push({requestId:binding.requestId,status:result.status});
     if(['APPROVED','REJECTED','REVISION_REQUESTED'].includes(result.status))break;
    }
   }
   return results;
  }finally{busy=false;}
 }});
}
