import {createSupervisedInboxService} from './supervised-inbox-service.mjs';

/**
 * Development-only unattended loop harness. It never reads credentials,
 * registers an OS service, sends mail or executes business actions.
 */
export function createUnattendedPilotHarness({cycle,healthSink,intervalMs=60000,sleep}) {
 if(typeof healthSink!=='function')throw Error('HEALTH_SINK_REQUIRED');
 let sequence=0;
 const service=createSupervisedInboxService({
  cycle,intervalMs,...(sleep?{sleep}:{}),
  onHealth:event=>healthSink(Object.freeze({
   sequence:++sequence,
   timestamp:new Date().toISOString(),
   ...event
  }))
 });
 return Object.freeze({
  start:({maxCycles}={})=>service.run({maxCycles}),
  stop:()=>service.stop(),
  get running(){return service.running}
 });
}
