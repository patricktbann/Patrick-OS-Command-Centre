import {readFile} from 'node:fs/promises';
import {verifyPilotArtifact} from './verify-pilot.mjs';
const record=JSON.parse(await readFile('agent-runtime/artifacts/pilot-evidence.json','utf8'));
const task=JSON.parse(await readFile('agent-runtime/pilot-task.json','utf8'));
const context={taskId:task.taskId,agentId:task.agentId,repository:process.env.GITHUB_REPOSITORY,headSha:process.env.GITHUB_SHA,workflowRunId:process.env.GITHUB_RUN_ID};
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Independent runner context unavailable');
const validation=verifyPilotArtifact(record,context);
console.log(JSON.stringify(validation));
if(!validation.ok)process.exitCode=1;
