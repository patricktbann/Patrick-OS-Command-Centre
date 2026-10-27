import test from 'node:test';
import assert from 'node:assert/strict';
import {createGovernedLocalInspection} from './governed-sdk-inspection.mjs';
const task={taskId:'UAT-READ-1',agentId:'TSY-A0001',companyId:'TSY-GROUP',divisionId:'software',
 objective:'Read-only repository assessment',acceptanceCriteria:'Review and no modifications',
 repository:'patricktbann/Patrick-OS-Command-Centre',allowedActions:['read-repo'],approvalRequired:true};
const policy={principalId:'patrick-principal',allowedRepositories:[task.repository]};
const inp={task,actor:{authenticated:true,subject:'private-operator',canDispatch:true},
 idempotencyKey:task.taskId,approval:{trustedBackendVerified:true,taskId:task.taskId,
 authorizedPrincipalId:policy.principalId,decision:'approve',
 approvalId:'approval-a1',approvedAt:'2026-10-27T02:00:00Z',taskDigest:'a'.repeat(64)},
 verifiedIssue:{trustedBackendVerified:true,taskId:task.taskId,agentId:task.agentId,
 repository:task.repository,number:15}};
function fixture(overrides={}){
 let events=[];
 const authority={verifyAndBind:async()=>structuredClone(inp)};
 const store={reserveWithCurrentApproval:async()=>{events.push('reserve');return {accepted:true}},
 recordOutcome:async()=>events.push('record'),quarantine:async()=>events.push('quarantine')};
 const runSdk=async()=>{events.push('sdk');return {status:'COMPLETED_REQUIRES_HUMAN_QA',
 executorType:'codex-sdk-local',cloudTask:false,approvedForDeployment:false,
 approvedForDispatch:false,repository:task.repository,threadId:'sdk-thread-1',commitSha:'b'.repeat(40)}};
 return {events,instance:createGovernedLocalInspection({policy,authority,store,runSdk,paths:{},...overrides})};
}
test('no privileged services means connection denied',()=>{
 assert.throws(()=>createGovernedLocalInspection({policy}),e=>e.code==='GOVERNED_SDK_NOT_CONNECTED');
});
test('server verified plan -> atomic approval reservation -> genuine SDK-shaped result -> QA pending',async()=>{
 const {events,instance}=fixture();
 const r=await instance.inspect(inp);assert.equal(r.status,'UAT_QA_PENDING');
 assert.equal(r.productionExecutionAuthorized,false);
 assert.deepEqual(events,['reserve','sdk','record']);
});
test('revoked or previously consumed approval does not execute',async()=>{
 const {events,instance}=fixture({store:{reserveWithCurrentApproval:async()=>({accepted:false}),
 recordOutcome:async()=>events.push('bad'),quarantine:async()=>events.push('bad')}});
 assert.equal((await instance.inspect(inp)).status,'NOT_DISPATCHED');assert.deepEqual(events,[]);
});
test('dangerous actions cannot reach reservation or executor',async()=>{
 let calls=0;const {instance}=fixture({authority:{verifyAndBind:async()=>({...inp,task:{...task,allowedActions:['deploy']}})},
 runSdk:async()=>{calls++}});
 await assert.rejects(instance.inspect({...inp,task:{...task,allowedActions:['deploy']}}),e=>e.code==='ACTION_DENIED');
 assert.equal(calls,0);
});
test('client-supplied approval cannot authenticate absent private authority',async()=>{
 const {instance}=fixture({authority:{verifyAndBind:async()=>null}});
 await assert.rejects(instance.inspect(inp),e=>e.code==='AUTHORITY_DENIED');
});
test('missing immutable task digest blocks execution',async()=>{
 const bad=structuredClone(inp);delete bad.approval.taskDigest;
 const {instance}=fixture({authority:{verifyAndBind:async()=>bad}});
 await assert.rejects(instance.inspect({...inp,approval:bad.approval}),e=>e.code==='APPROVAL_BINDING_MISSING');
});
test('SDK error results in quarantine and prohibits automatic retry',async()=>{
 const {events,instance}=fixture({runSdk:async()=>{events.push('sdk');throw Error('connection lost')}});
 await assert.rejects(instance.inspect(inp),e=>e.code==='RECONCILIATION_REQUIRED');
 assert.deepEqual(events,['reserve','sdk','quarantine']);
});
test('SDK pretending to be Cloud cannot mark completed',async()=>{
 const {events,instance}=fixture({runSdk:async()=>({status:'COMPLETED_REQUIRES_HUMAN_QA',
 executorType:'codex-cloud',repository:task.repository})});
 await assert.rejects(instance.inspect(inp),e=>e.code==='RECONCILIATION_REQUIRED');
 assert.deepEqual(events,['reserve','quarantine']);
});
