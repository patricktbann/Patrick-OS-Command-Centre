// TSY V3.5.1: public evidence-only verifier. No secrets, write calls or executor claims.
export const REPO='patricktbann/Patrick-OS-Command-Centre';
const endpoint='https://api.github.com/repos/'+REPO;
async function json(url){const r=await fetch(url,{headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw Error('GitHub API HTTP '+r.status);return r.json()}
export async function verifyTaskIssue(task,issueNumber){
 const n=Number(issueNumber);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid issue number');
 const i=await json(endpoint+'/issues/'+n);
 if(i.pull_request)throw Error('Expected an issue, received a pull request');
 const b=i.body||'';
 if(!task?.id||!task?.agent||!b.includes(task.id)||!b.includes(task.agent))throw Error('Task and agent IDs do not match the issue body');
 return {taskId:task.id,agentId:task.agent,issueNumber:i.number,issueUrl:i.html_url,issueState:i.state,verifiedAt:new Date().toISOString(),executionVerified:false,level:'ASSIGNED'};
}
export async function verifyPullRequest(prNumber){
 const n=Number(prNumber);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid PR number');
 const p=await json(endpoint+'/pulls/'+n);
 return {number:p.number,url:p.html_url,state:p.state,mergeCommitSha:p.merge_commit_sha||null,headSha:p.head?.sha||null,base:p.base?.ref||null,reviewVerified:false,qaVerified:false,executionVerified:false,checkedAt:new Date().toISOString()};
}
export function statusFromEvidence({issue,run,pr,qa,uat}={}){
 if(uat?.decision==='approved'&&qa?.passed===true&&pr?.url)return 'COMPLETE';
 if(uat?.decision==='rejected')return 'REJECTED';
 if(qa?.passed===false)return 'QA_FAILED';
 if(qa?.passed===true&&pr?.url)return 'UAT_PENDING';
 if(pr?.url)return 'OUTPUT_READY';
 if(run?.id&&run?.startedAt&&run?.verified===true)return 'EXECUTING';
 if(issue?.issueNumber)return 'ASSIGNED';
 return 'DRAFT';
}
