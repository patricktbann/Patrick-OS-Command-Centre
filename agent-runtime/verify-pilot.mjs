/** Validate a GitHub-hosted sandbox artifact. This is not Codex validation. */
export function verifyPilotArtifact(record,expected){
 const errors=[];
 if(!record||typeof record!=='object'||Array.isArray(record))return {ok:false,errors:['No JSON artifact']};
 if(!expected||typeof expected!=='object')return {ok:false,errors:['Expected run context missing']};
 for(const key of ['taskId','agentId','repository','headSha']){
  if(typeof expected[key]!=='string'||!expected[key])errors.push('Missing expected '+key);
 }
 if(record.taskId!==expected.taskId)errors.push('Task ID mismatch');
 if(record.agentId!==expected.agentId)errors.push('Agent ID mismatch');
 if(record.repository!==expected.repository)errors.push('Repository mismatch');
 if(record.headSha!==expected.headSha)errors.push('Commit SHA mismatch');
 if(String(record.workflowRunId)!==String(expected.workflowRunId))errors.push('Workflow run mismatch');
 if(record.executionClass!=='github-actions-sandbox-test')errors.push('Unexpected execution class');
 if(record.executorType!=='github-actions')errors.push('Unexpected executor');
 if(record.codexCloud!==false)errors.push('Must not claim Codex');
 if(record.success!==true||record.exitCode!==0)errors.push('Test execution unsuccessful');
 if(!Number.isFinite(Date.parse(record.startedAt))||!Number.isFinite(Date.parse(record.completedAt))||
    Date.parse(record.completedAt)<Date.parse(record.startedAt))errors.push('Invalid execution timestamps');
 if(!/^[0-9a-f]{40}$/.test(String(record.headSha)))errors.push('Invalid commit SHA');
 return {ok:errors.length===0,errors,
  classification:errors.length?'UNVERIFIED':'GITHUB_SANDBOX_TEST_VERIFIED',
  codexCloudVerified:false,
  autonomousAgentVerified:false};
}
