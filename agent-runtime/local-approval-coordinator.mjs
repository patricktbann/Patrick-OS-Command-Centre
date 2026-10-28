import { createLocalApprovalStore } from './local-approval-store.mjs';
import { APPROVAL_ADDRESS } from './email-approval-policy.mjs';
const normalize = value => {
  const raw=String(value||'').trim();
  const match=/<([^<>]+)>/.exec(raw);
  return (match?match[1]:raw.split(/\s+/).at(-1)).toLowerCase();
};
/**
 * Integrated local UAT coordinator. Provider verification is supplied by a
 * separately authenticated Gmail adapter; no unverified headers are trusted.
 * Execution is intentionally restricted to synthetic internal tasks.
 */
export function createLocalApprovalCoordinator({databasePath,verifyProviderMessage}) {
  if(typeof verifyProviderMessage!=='function')throw Error('PROVIDER_VERIFIER_REQUIRED');
  const store=createLocalApprovalStore(databasePath);
  const threadBindings=new Map();
  return Object.freeze({
    request(input,threadId) {
      if(!threadId||threadBindings.has(threadId))throw Error('INVALID_THREAD_BINDING');
      const saved=store.create(input);
      threadBindings.set(threadId,input.id);
      return saved;
    },
    receive(message) {
      if(!message?.id||!message.threadId||verifyProviderMessage(message)!==true) return {status:'UNVERIFIED_MESSAGE'};
      const id=threadBindings.get(message.threadId);
      if(!id)return {status:'UNBOUND_THREAD'};
      const request=store.get(id);
      if(!request||request.status!=='PENDING')return {status:'NOT_PENDING'};
      if(normalize(message.from)!==APPROVAL_ADDRESS)return {status:'UNVERIFIED_SENDER'};
      if(!String(message.subject||'').includes(id))return {status:'REQUEST_MISMATCH'};
      const first=String(message.body||'').trim().split(/\r?\n/,1)[0].trim();
      const match=/^(APPROVE|REJECT|REVISE)\s+([A-Z0-9-]+)(?:\s*:\s*(.+))?$/i.exec(first);
      let decision;
      if(match&&match[2]===id)decision=match[1].toUpperCase();
      else if(/^approved\.?$/i.test(first))decision='APPROVE';
      else if(/^rejected\.?$/i.test(first))decision='REJECT';
      else return {status:'INVALID_DECISION'};
      if(decision==='REVISE'&&!match?.[3])return {status:'REVISION_REQUIRED'};
      const status={APPROVE:'APPROVED',REJECT:'REJECTED',REVISE:'REVISION_REQUESTED'}[decision];
      try {return store.decide({id,status,messageId:message.id})}
      catch(e){return {status:'DECISION_DENIED',reason:e.message}}
    },
    completeSyntheticTask(id) {
      const ticket=store.release(id);
      if(!ticket.taskId.startsWith('SYNTHETIC-'))throw Error('EXECUTION_NOT_ENABLED');
      return {...ticket,result:'SYNTHETIC_TASK_COMPLETED'};
    },
    status(id){return store.get(id);},
    audit(id){return store.events(id);},
    close(){store.close();}
  });
}
