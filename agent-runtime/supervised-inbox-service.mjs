/**
 * Supervised inbox loop. No autonomous execution or scheduler registration.
 * Callers must supply an authenticated inbox cycle and explicit start signal.
 */
export function createSupervisedInboxService({cycle,intervalMs=60000,onHealth=()=>{},sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);
 const abort=()=>{clearTimeout(timer);reject(new Error('STOPPED'))};
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
})}) {
 if(typeof cycle?.runOnce!=='function'||!Number.isInteger(intervalMs)||intervalMs<1000||typeof onHealth!=='function')throw Error('INVALID_SERVICE_CONFIGURATION');
 let running=false,stopRequested=false;
 return Object.freeze({
  async run({maxCycles=Infinity}={}) {
   if(running)throw Error('ALREADY_RUNNING');
   if(!(maxCycles===Infinity||Number.isInteger(maxCycles)&&maxCycles>0))throw Error('INVALID_CYCLE_LIMIT');
   running=true;stopRequested=false;
   let completed=0,errors=0;
   try{
    while(!stopRequested&&completed<maxCycles){
     try {
      const results=await cycle.runOnce();
      completed++;
      onHealth({state:'HEALTHY',completed,errors,decisions:results.length});
     }catch(error){
      errors++;
      completed++;
      onHealth({state:'DEGRADED',completed,errors,error:String(error?.message||error)});
     }
     if(!stopRequested&&completed<maxCycles)await sleep(intervalMs);
    }
    return {completed,errors,stopped:stopRequested};
   }finally{running=false;onHealth({state:'STOPPED',completed,errors})}
  },
  stop(){stopRequested=true},
  get running(){return running}
 });
}
