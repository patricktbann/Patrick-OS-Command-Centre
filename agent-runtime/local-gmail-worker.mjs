import {createLocalApprovalCoordinator} from './local-approval-coordinator.mjs';
import {createGmailUnattendedPilot} from './gmail-unattended-pilot.mjs';

/** One-process owner-controlled Gmail UAT runner.
 * Credentials and database paths are provided by the operator, outside git.
 * Never registers a service or executes a real business task.
 */
export async function createLocalGmailWorker({
 databasePath,tokenPath,credentialsPath,healthSink,intervalMs=60000,
 readerFactory,fetchImpl,sleep
}) {
 if(!databasePath || !tokenPath || !credentialsPath)throw Error('PRIVATE_PATHS_REQUIRED');
 let currentVerifier=()=>false;
 const coordinator=createLocalApprovalCoordinator({
  databasePath,verifyProviderMessage:message=>currentVerifier(message)
 });
 try{
  const pilot=await createGmailUnattendedPilot({
   coordinator,tokenPath,credentialsPath,healthSink,intervalMs,
   ...(fetchImpl?{fetchImpl}:{}),...(sleep?{sleep}:{}),
   ...(readerFactory?{readerFactory:async options=>{
    const reader=await readerFactory(options);
    currentVerifier=message=>reader.verifyMessage(message);
    return reader;
   }}:{readerFactory:async options=>{
    const {createGmailReadonlyReader}=await import('./gmail-readonly-reader.mjs');
    const reader=await createGmailReadonlyReader(options);
    currentVerifier=message=>reader.verifyMessage(message);
    return reader;
   }})
  });
  return Object.freeze({
   start:options=>pilot.start(options),
   stop:()=>pilot.stop(),
   close:()=>{if(pilot.running)throw Error('WORKER_STILL_RUNNING');coordinator.close()},
   get running(){return pilot.running}
  });
 }catch(error){coordinator.close();throw error}
}
