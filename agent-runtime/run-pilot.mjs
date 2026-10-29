/**
 * TSY Group — isolated GitHub Actions pilot.
 * This runs deterministic Node contract tests only; it NEVER calls Codex.
 * GitHub job/run metadata are captured from the runner environment.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const task=JSON.parse(await readFile(new URL('./pilot-task.json',import.meta.url),'utf8'));
const allowed=['read-repo','run-tests'];
const repo=process.env.GITHUB_REPOSITORY;
if(process.env.GITHUB_ACTIONS!=='true'||repo!==task.repository)throw Error('Must execute inside matching GitHub Actions repository');
if(task.executionClass!=='github-actions-sandbox-test'||task.codexCloud!==false||task.authorizesDeployment!==false)
  throw Error('Pilot execution policy violated');
if(!task.allowedActions.every(a=>allowed.includes(a))||!task.allowedActions.includes('run-tests'))
  throw Error('Action list cannot execute non-test operations');
const started=new Date().toISOString();
const result=spawnSync(process.execPath,['--test','agent-runtime/evidence.test.mjs','agent-runtime/dispatch.test.mjs'],{cwd:process.cwd(),encoding:'utf8',timeout:120000,env:{...process.env,CI:'true'},maxBuffer:1024*1024*4});
const record={
 schemaVersion:'3.5.2',
 taskId:task.taskId,
 agentId:task.agentId,
 companyId:task.companyId,
 repository:repo,
 executionClass:'github-actions-sandbox-test',
 executorType:'github-actions',
 codexCloud:false,
 workflowRunId:process.env.GITHUB_RUN_ID||null,
 workflowRunAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
 jobName:process.env.GITHUB_JOB||null,
 headSha:process.env.GITHUB_SHA||null,
 ref:process.env.GITHUB_REF||null,
 startedAt:started,
 completedAt:new Date().toISOString(),
 exitCode:result.status,
 success:result.status===0&&!result.error,
 limitations:[
  'GitHub-hosted test runner; NOT a Codex Cloud agent run',
  'Output file is runner-generated evidence but still requires server-side verification',
  'No external agent workflow triggered, no PR created by this job, no approval recorded'
 ],
 stdoutTail:String(result.stdout||'').slice(-12000),
 stderrTail:String(result.stderr||result.error||'').slice(-6000)
};
await mkdir('agent-runtime/artifacts',{recursive:true});
await writeFile('agent-runtime/artifacts/pilot-evidence.json',JSON.stringify(record,null,2));
console.log('TSY pilot evidence:',JSON.stringify({taskId:record.taskId,runId:record.workflowRunId,success:record.success,exitCode:record.exitCode}));
if(!record.success)process.exitCode=1;
