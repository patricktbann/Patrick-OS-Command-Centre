import {createGmailReadonlyReader,loadGmailReadonlyToken} from './gmail-readonly-reader.mjs';
import {createLocalApprovalCoordinator} from './local-approval-coordinator.mjs';
import {createGmailApprovalWorker} from './gmail-approval-worker.mjs';
const [tokenPath,credentialsPath,databasePath]=process.argv.slice(2);
let reader;
const openReader=async()=>reader=await createGmailReadonlyReader({accessToken:await loadGmailReadonlyToken({tokenPath,credentialsPath,forceRefresh:true})});
await openReader();
const coordinator=createLocalApprovalCoordinator({databasePath,verifyProviderMessage:m=>reader.verifyMessage(m)});
try {
 if(!coordinator.bindings().length){
  const threads=await reader.findUatThreads({requestId:'TSY-AI-9001'});
  if(threads.length!==1)throw Error('CONTROLLED_FIXTURE_NOT_UNIQUE');
  coordinator.request({id:'TSY-AI-9001',taskId:'SYNTHETIC-RECOVERY-UAT',scope:'Controlled historical test replay only',expiresAt:new Date(Date.now()+3600000).toISOString()},threads[0]);
 }
 let injectFailure=true;
 const worker=createGmailApprovalWorker({coordinator,openReader:async()=>{if(injectFailure){injectFailure=false;throw Error('INJECTED_NETWORK_FAILURE')}return openReader()}});
 try {await worker.poll();throw Error('FAILURE_NOT_INJECTED')}catch(e){if(e.message!=='INJECTED_NETWORK_FAILURE')throw e}
 const before=coordinator.status('TSY-AI-9001').status;
 const results=await worker.poll();
 if(before==='PENDING'&&coordinator.status('TSY-AI-9001').status!=='APPROVED')throw Error('APPROVAL_FAILED');
 if(before==='RELEASED'&&results.length)throw Error('REPLAY_AFTER_PROCESS_RESTART');
 if(coordinator.status('TSY-AI-9001').status==='APPROVED')coordinator.completeSyntheticTask('TSY-AI-9001');
 let denied=false;try{coordinator.completeSyntheticTask('TSY-AI-9001')}catch{denied=true}
 if(!denied)throw Error('DUPLICATE_RELEASE');
 console.log(JSON.stringify({pass:true,before,after:coordinator.status('TSY-AI-9001').status,networkRecovery:true,duplicateDenied:true,audit:coordinator.audit('TSY-AI-9001').map(e=>e.action),businessExecution:false}));
}finally{coordinator.close()}
