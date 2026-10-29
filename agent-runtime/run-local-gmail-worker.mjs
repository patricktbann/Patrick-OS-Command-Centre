import {createLocalGmailWorker} from './local-gmail-worker.mjs';

/** Operator-launched, bounded local worker. Never installs a service.
 * Configuration is supplied via environment, not CLI arguments or git files.
 */
const required=['PATRICK_GMAIL_DB_PATH','PATRICK_GMAIL_TOKEN_PATH','PATRICK_GMAIL_CLIENT_PATH'];
const missing=required.filter(key=>!process.env[key]);
if(missing.length) {
 console.error('PRIVATE_WORKER_CONFIGURATION_MISSING');
 process.exitCode=2;
}else{
 const maxCycles=Number(process.env.PATRICK_GMAIL_MAX_CYCLES||'3');
 const intervalMs=Number(process.env.PATRICK_GMAIL_INTERVAL_MS||'60000');
 if(!Number.isInteger(maxCycles)||maxCycles<1||maxCycles>60||
    !Number.isInteger(intervalMs)||intervalMs<1000){
  console.error('INVALID_WORKER_LIMITS');
  process.exitCode=2;
 }else{
  let worker;
  try{
   worker=await createLocalGmailWorker({
    databasePath:process.env.PATRICK_GMAIL_DB_PATH,
    tokenPath:process.env.PATRICK_GMAIL_TOKEN_PATH,
    credentialsPath:process.env.PATRICK_GMAIL_CLIENT_PATH,
    intervalMs,
    healthSink:event=>console.log(JSON.stringify({
     timestamp:event.timestamp,state:event.state,sequence:event.sequence,
     completed:event.completed,errors:event.errors,decisions:event.decisions
    }))
   });
   const stop=()=>worker.stop();
   process.once('SIGINT',stop);process.once('SIGTERM',stop);
   const result=await worker.start({maxCycles});
   if(result.errors)process.exitCode=1;
   console.log(JSON.stringify({state:'FINISHED',...result}));
  }catch(error){
   console.error('WORKER_FAILED',String(error?.code||'ERROR'));
   process.exitCode=1;
  }finally{if(worker&&!worker.running)worker.close()}
 }
}
