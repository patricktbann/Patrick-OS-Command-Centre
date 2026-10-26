import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTaskStatus,validateAssignment,makeEvidenceSnapshot,STATES} from './evidence.mjs';
const task={taskId:'TSY-T-200001',agentId:'TSY-A0001',companyId:'TSY-GROUP',
 divisionId:'software',objective:'Validate public task state machine',
 acceptanceCriteria:'All deterministic unit tests pass',repository:'patricktbann/Patrick-OS-Command-Centre',
 allowedActions:['read-repo','create-branch'],approvalRequired:true};
const issue={verified:true,taskId:task.taskId,agentId:task.agentId,
 url:'https://github.com/patricktbann/Patrick-OS-Command-Centre/issues/2',number:2,checkedAt:'2026-10-26T02:00:00Z'};
const run={verified:true,taskId:task.taskId,agentId:task.agentId,
 executorRunId:'codex-run-123',executorType:'codex-cloud',startedAt:'2026-10-26T02:03:00Z',started:true};
const output={verified:true,taskId:task.taskId,executorRunId:run.executorRunId,
 commitSha:'a'.repeat(40),pullRequestUrl:'https://github.com/patricktbann/Patrick-OS-Command-Centre/pull/3'};
const qa={verified:true,taskId:task.taskId,reviewedAt:'2026-10-26T02:15:00Z',
 reviewerId:'brain-qa',passed:true,testResults:[{name:'Unit tests',passed:true}]};
const approval={verified:true,taskId:task.taskId,approver:'Patrick',explicit:true,approvedAt:'2026-10-26T02:20:00Z'};
const state=e=>deriveTaskStatus(task,e).state;
test('valid task contract',()=>assert.equal(validateAssignment(task).ok,true));
test('malformed or incomplete tasks blocked',()=>{
 assert.equal(deriveTaskStatus(null).state,STATES.BLOCKED);
 assert.equal(deriveTaskStatus({...task,approvalRequired:undefined}).state,STATES.BLOCKED);
});
test('no issue means draft',()=>assert.equal(state({}),STATES.DRAFT));
test('issue only is assigned, never executing',()=>assert.equal(state({issue}),STATES.ASSIGNED));
test('mismatched issue agent is ignored',()=>assert.equal(state({issue:{...issue,agentId:'TSY-A9999'}}),STATES.DRAFT));
test('issue + unverified executor remains assigned',()=>assert.equal(state({issue,run:{...run,verified:false}}),STATES.ASSIGNED));
test('verified run without output is executing',()=>assert.equal(state({issue,run}),STATES.EXECUTING));
test('wrong run linkage blocks output readiness',()=>{
 assert.equal(state({issue,run,output:{...output,executorRunId:'another-run'}}),STATES.EXECUTING);
});
test('verified PR and commit without independent QA remains output ready',()=>assert.equal(state({issue,run,output}),STATES.OUTPUT_READY));
test('QA failed never advances to UAT',()=>{
 assert.equal(state({issue,run,output,qa:{...qa,passed:false}}),STATES.QA_FAILED);
 assert.equal(state({issue,run,output,qa:{...qa,testResults:[{name:'Unit tests',passed:false}]}}),STATES.QA_FAILED);
});
test('QA pass without principal approval requires UAT',()=>assert.equal(state({issue,run,output,qa}),STATES.UAT_PENDING));
test('approval must be explicit and attributed to Patrick',()=>{
 assert.equal(state({issue,run,output,qa,approval:{...approval,approver:'someone-else'}}),STATES.UAT_PENDING);
 assert.equal(state({issue,run,output,qa,approval:{...approval,explicit:false}}),STATES.UAT_PENDING);
});
test('complete only after verified entire chain',()=>assert.equal(state({issue,run,output,qa,approval}),STATES.COMPLETE));
test('snapshot never invents missing executor data',()=>{
 const s=makeEvidenceSnapshot(task,{issue});
 assert.equal(s.executorRunId,null);assert.equal(s.pullRequestUrl,null);assert.equal(s.actionRequired,true);
});
