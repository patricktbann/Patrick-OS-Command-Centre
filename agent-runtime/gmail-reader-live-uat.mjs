import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGmailReadonlyReader, loadGmailReadonlyToken } from './gmail-readonly-reader.mjs';
import { createLocalApprovalCoordinator } from './local-approval-coordinator.mjs';

// Supervised one-shot UAT only. No email sends, scheduler, or business executor.
const [tokenPath, credentialsPath, privateOutputDirectory, ...options] = process.argv.slice(2);
const requestId=options.find(value=>value.startsWith('--request-id='))?.slice('--request-id='.length);
if (!tokenPath || !credentialsPath || !privateOutputDirectory) throw Error('PRIVATE_PATH_ARGUMENTS_REQUIRED');
try {
  const accessToken = await loadGmailReadonlyToken({tokenPath, credentialsPath,forceRefresh:options.includes('--refresh')});
  const reader = await createGmailReadonlyReader({accessToken});
  const threads = await reader.findUatThreads({requestId});
  console.log(JSON.stringify({check:'LIVE_GMAIL_PROFILE_AND_SEARCH',pass:true,uatThreads:threads.length}));
  let eligible = 0;
  for (const threadId of threads) {
    const messages = await reader.listThreadMessages(threadId);
    for (const message of messages) {
      if (!reader.verifyMessage(message)) continue;
      const ids = [...message.subject.matchAll(/TSY-AI-[0-9]{4,}/g)].map(m=>m[0]);
      if (ids.length !== 1 || (requestId ? ids[0]!==requestId : !/\b(UAT|test)\b/i.test(message.subject))) continue;
      const line = message.body.trim().split(/\r?\n/)[0].trim();
      if (!/^(APPROVE|REJECT|REVISE)\s+TSY-AI-\d{4,}(?:\s*:\s*.+)?$/i.test(line) && !/^(approved|rejected)\.?$/i.test(line)) continue;
      eligible++;
      await mkdir(privateOutputDirectory, {recursive:true, mode:0o700});
      const databasePath = join(privateOutputDirectory, `gmail-uat-${randomUUID()}.sqlite`);
      let coordinator = createLocalApprovalCoordinator({databasePath,verifyProviderMessage:reader.verifyMessage});
      const id = ids[0];
      coordinator.request({id,taskId:'SYNTHETIC-GMAIL-UAT',scope:'Internal synthetic UAT only; no business commitment',risk:'LOW',expiresAt:new Date(Date.now()+3600000).toISOString()}, threadId);
      const forged = coordinator.receive({...message});
      if (forged.status !== 'UNVERIFIED_MESSAGE') throw Error('FORGED_MESSAGE_ACCEPTED');
      const decision = coordinator.receive(message);
      if (!['APPROVED','REJECTED','REVISION_REQUESTED'].includes(decision.status)) throw Error('LIVE_DECISION_NOT_PARSED');
      coordinator.close();
      coordinator = createLocalApprovalCoordinator({databasePath,verifyProviderMessage:reader.verifyMessage});
      if (coordinator.status(id).status !== decision.status) throw Error('RESTART_PERSISTENCE_FAILED');
      if (coordinator.receive(message).status !== 'NOT_PENDING') throw Error('REPLAY_ACCEPTED');
      let completed=false;
      if (decision.status === 'APPROVED') {
        completed=coordinator.completeSyntheticTask(id).result === 'SYNTHETIC_TASK_COMPLETED';
        let denied=false;
        try { coordinator.completeSyntheticTask(id); } catch { denied=true; }
        if (!completed || !denied) throw Error('SINGLE_RELEASE_FAILED');
      } else {
        let denied=false;
        try { coordinator.completeSyntheticTask(id); } catch { denied=true; }
        if (!denied) throw Error('UNAPPROVED_RELEASE_ACCEPTED');
      }
      coordinator.close();
      console.log(JSON.stringify({check:'LIVE_GMAIL_SYNTHETIC_REPLAY_UAT',pass:true,decision:decision.status,syntheticCompleted:completed,forgeryDenied:true,replayDenied:true,restartPersistence:true,businessExecution:false}));
      break;
    }
    if (eligible) break;
  }
  if (!eligible) {
    console.log(JSON.stringify({check:'APPROVAL_ROUND_TRIP',pass:false,blocker:'NO_EXISTING_OWNER_SENT_UAT_DECISION',emailSent:false}));
    process.exitCode=2;
  }
} catch (error) {
  console.error(JSON.stringify({check:'LIVE_UAT',pass:false,error:error.message}));
  process.exitCode=1;
}
