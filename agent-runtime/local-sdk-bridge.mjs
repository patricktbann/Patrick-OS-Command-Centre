/**
 * Local, operator-controlled Codex SDK read-only UAT bridge.
 * Unlike codex-executor.mjs, this is NOT a Codex Cloud transport and it cannot
 * satisfy a governed dispatch without server-side identity/approval composition.
 * Runs a fixed inspection prompt using the authenticated SDK pilot script.
 */
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const execFile=promisify(execFileCallback);
const REPO='patricktbann/Patrick-OS-Command-Centre';
const ORIGIN=/^(?:https:\/\/github[.]com\/|git@github[.]com:|ssh:\/\/git@github[.]com\/)patricktbann\/Patrick-OS-Command-Centre(?:[.]git)?$/;
const SHA=/^[a-f0-9]{40}$/i;
const THREAD=/^[A-Za-z0-9][A-Za-z0-9_.:-]{3,119}$/;
const forbidden={CI:'CI',OPENAI_API_KEY:'OPENAI_API_KEY'};
function gate(ok,message){if(!ok)throw Error('LOCAL_SDK_UAT_DENIED: '+message)}
async function command(bin,args,options){
 return (await execFile(bin,args,{windowsHide:true,timeout:30000,maxBuffer:128*1024,...options})).stdout.trim();
}
export async function verifyLocalSdkEvidence({evidence,context,cleanAfter}={}){
 gate(evidence?.schemaVersion==='3.5-official-sdk-pilot-1','unknown evidence schema');
 gate(evidence?.status==='CODEX_SDK_READONLY_TURN_COMPLETED','SDK did not finish');
 gate(evidence?.scope==='local-sdk-not-cloud-task' && evidence?.isCodexCloudTask===false,'Cloud spoofing');
 gate(evidence?.isApprovedForDeployment===false,'deployment flag must be false');
 gate(evidence?.repository===REPO && evidence?.branch===context?.branch,'repo/branch mismatch');
 gate(SHA.test(context?.sha??'') && evidence?.headShaBefore===context.sha &&
      evidence?.headShaAfter===context.sha,'commit changed or invalid');
 gate(THREAD.test(evidence?.threadId??''),'missing real SDK-format thread reference');
 gate(Number.isInteger(evidence?.itemsCount) && evidence.itemsCount>0,'empty execution');
 gate(typeof evidence?.finalResponse==='string' && evidence.finalResponse.trim().length>0,'empty final review');
 gate(cleanAfter===true,'dirty working tree after SDK');
 return Object.freeze({status:'COMPLETED_REQUIRES_HUMAN_QA',
   executorType:'codex-sdk-local',threadId:evidence.threadId,
   repository:REPO,branch:context.branch,commitSha:context.sha,
   itemsCount:evidence.itemsCount,cloudTask:false,approvedForDispatch:false,
   approvedForDeployment:false});
}
export async function runLocalCodexReadOnlyUat({repoRoot,pythonPath,execute=command,loadEvidence=readFile,removeEvidence=unlink,env=process.env}={}){
 gate(typeof repoRoot==='string'&&repoRoot.length>0&&typeof pythonPath==='string'&&pythonPath.length>0,'explicit private host paths required');
 gate(!env.OPENAI_API_KEY,'API-key billing not allowed');
 gate(!env.CI,'never run authenticated SDK UAT in CI');
 const root=resolve(repoRoot);
 const cmd=(bin,args,other={})=>execute(bin,args,{cwd:root,...other});
 const origin=await cmd('git',['remote','get-url','origin']);
 gate(ORIGIN.test(String(origin).trim()),'wrong repository origin');
 const branch=String(await cmd('git',['branch','--show-current'])).trim();
 gate(branch.startsWith('feature/v3.5-'),'non-feature branch denied');
 const sha=String(await cmd('git',['rev-parse','HEAD'])).trim();
 gate(SHA.test(sha),'unknown commit');
 gate(String(await cmd('git',['status','--porcelain'])).trim()==='','working tree is dirty');
 const filename='codex-pilot-evidence-'+randomUUID()+'.json';
 const path=join(root,filename);
 let started=false;
 try{
   started=true;
   // Only the fixed review task inside the pilot is executable. No objective,
   // credentials, actions or arbitrary shell command originate from browser input.
   await cmd(pythonPath,['agent-runtime/codex-sdk-readonly-pilot.py','--execute','--output',filename],
     {timeout:600000,maxBuffer:256*1024,env:{...env,OPENAI_API_KEY:''}});
   const evidence=JSON.parse(await loadEvidence(path,'utf8'));
   const after=String(await cmd('git',['status','--porcelain'])).trim()==='';
   const finalSha=String(await cmd('git',['rev-parse','HEAD'])).trim();
   return await verifyLocalSdkEvidence({evidence,context:{branch,sha},
      cleanAfter:after&&sha===finalSha});
 }finally{
   if(started){
     // Evidence contains model-generated review text; do not upload or commit.
     // Removal failure is a hard error, preventing accidental disclosure.
     await removeEvidence(path).catch(e=>{if(e.code!=='ENOENT')throw e});
   }
 }
}
