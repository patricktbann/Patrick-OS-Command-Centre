/**
 * TSY Group AI Office V3.5 — Governed task evidence model.
 * Pure, deterministic logic. Not a Codex executor or a grant of tool permissions.
 * No secrets and no network access. Source-of-truth evidence comes from a trusted backend.
 */
export const STATES=Object.freeze({
  DRAFT:'DRAFT',ASSIGNED:'ASSIGNED',EXECUTING:'EXECUTING',
  OUTPUT_READY:'OUTPUT_READY',QA_FAILED:'QA_FAILED',QA_PASSED:'QA_PASSED',
  UAT_PENDING:'UAT_PENDING',APPROVED:'APPROVED',REJECTED:'REJECTED',
  COMPLETE:'COMPLETE',BLOCKED:'BLOCKED'
});
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(x);
const url=x=>typeof x==='string'&&/^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/[1-9][0-9]*$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-fA-F0-9]{40}$/.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function validateAssignment(task){
  const errors=[];
  if(!task||typeof task!=='object')return {ok:false,errors:['Missing task']};
  for(const k of ['taskId','agentId','companyId','divisionId','objective','acceptanceCriteria','repository']){
    if(typeof task[k]!=='string'||!task[k].trim())errors.push('Required: '+k);
  }
  if(task.taskId&&!id(task.taskId))errors.push('Invalid taskId');
  if(task.agentId&&!id(task.agentId))errors.push('Invalid agentId');
  if(task.repository&&!/^[\w.-]+\/[\w.-]+$/.test(task.repository))errors.push('Invalid repository');
  if(task.allowedActions&&!Array.isArray(task.allowedActions))errors.push('allowedActions must be an array');
  if(task.approvalRequired!==true&&task.approvalRequired!==false)errors.push('Explicit approvalRequired boolean needed');
  return {ok:errors.length===0,errors};
}
function validIssue(e,t){return !!(e?.verified===true&&id(e.taskId)&&e.taskId===t.taskId&&e.agentId===t.agentId&&url(e.url)&&Number.isSafeInteger(e.number)&&e.number>0&&date(e.checkedAt))}
function validRun(e,t){return !!(e?.verified===true&&e.taskId===t.taskId&&e.agentId===t.agentId&&id(e.executorRunId)&&id(e.executorType)&&date(e.startedAt)&&e.started===true)}
function validOutput(e,t){return !!(e?.verified===true&&e.taskId===t.taskId&&sha(e.commitSha)&&url(e.pullRequestUrl)&&id(e.executorRunId))}
function validQa(e,t){return !!(e?.verified===true&&e.taskId===t.taskId&&date(e.reviewedAt)&&id(e.reviewerId)&&Array.isArray(e.testResults)&&e.testResults.length>0&&e.testResults.every(x=>typeof x.name==='string'&&typeof x.passed==='boolean'))}
function validApproval(e,t){return !!(e?.verified===true&&e.taskId===t.taskId&&e.approver==='Patrick'&&date(e.approvedAt)&&e.explicit===true)}
export function deriveTaskStatus(task,evidence={}){
  const valid=validateAssignment(task);
  if(!valid.ok)return {state:STATES.BLOCKED,reason:valid.errors.join('; ')};
  const issue=evidence.issue,run=evidence.run,output=evidence.output,qa=evidence.qa,approval=evidence.approval;
  if(!validIssue(issue,task))return {state:STATES.DRAFT,reason:'No verified GitHub assignment'};
  if(!validRun(run,task))return {state:STATES.ASSIGNED,reason:'No verified executor run'};
  if(!validOutput(output,task)||output.executorRunId!==run.executorRunId)return {state:STATES.EXECUTING,reason:'Executor began; no linked verified PR and commit'};
  if(!validQa(qa,task))return {state:STATES.OUTPUT_READY,reason:'PR/commit present; independent QA absent'};
  if(qa.testResults.some(x=>x.passed===false)||qa.passed!==true)return {state:STATES.QA_FAILED,reason:'QA failed or not passed'};
  if(!validApproval(approval,task))return {state:STATES.UAT_PENDING,reason:'QA passed; Patrick approval not recorded'};
  return {state:STATES.COMPLETE,reason:'Verified task, run, output, QA and explicit principal approval'};
}
export function makeEvidenceSnapshot(task,evidence={}){
 const status=deriveTaskStatus(task,evidence);
 return {taskId:task?.taskId||null,agentId:task?.agentId||null,status:status.state,reason:status.reason,
  issueUrl:validIssue(evidence.issue,task)?evidence.issue.url:null,
  pullRequestUrl:validOutput(evidence.output,task)?evidence.output.pullRequestUrl:null,
  executorRunId:validRun(evidence.run,task)?evidence.run.executorRunId:null,
  actionRequired:status.state!==STATES.COMPLETE};
}
