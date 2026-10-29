import {createGmailReadonlyReader,loadGmailReadonlyToken} from './gmail-readonly-reader.mjs';
import {createLocalInboxCycle} from './local-inbox-cycle.mjs';
import {createUnattendedPilotHarness} from './unattended-pilot-harness.mjs';

/** Binds the authenticated Gmail transport to durable pending-thread polling.
 * No OS service is installed and no real task is executed by this composition.
 */
export async function createGmailUnattendedPilot({
 coordinator,tokenPath,credentialsPath,healthSink,intervalMs=60000,
 fetchImpl,readerFactory=createGmailReadonlyReader,sleep
}) {
 if(!coordinator || typeof coordinator.bindings!=='function' || typeof coordinator.receive!=='function')
  throw Error('DURABLE_COORDINATOR_REQUIRED');
 if(typeof healthSink!=='function')throw Error('HEALTH_SINK_REQUIRED');
 const cycle={
  async runOnce(){
   const token=await loadGmailReadonlyToken({tokenPath,credentialsPath,...(fetchImpl?{fetchImpl}:{})});
   const reader=await readerFactory({accessToken:token,...(fetchImpl?{fetchImpl}:{})});
   const inbox=createLocalInboxCycle({
    coordinator,
    listThreadMessages:threadId=>reader.listThreadMessages(threadId),
    threadBindings:()=>coordinator.bindings(),
    verifyProviderMessage:message=>reader.verifyMessage(message)
   });
   return inbox.runOnce();
  }
 };
 return createUnattendedPilotHarness({cycle,healthSink,intervalMs,...(sleep?{sleep}:{})});
}
