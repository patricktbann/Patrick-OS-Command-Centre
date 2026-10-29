import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalSdkEvidence,runLocalCodexReadOnlyUat} from './local-sdk-bridge.mjs';
const sha='e252d866eb5c8a837d7359e1754f816309edfe42';
const branch='feature/v3.5-sdk-local-readonly-bridge';
const base={schemaVersion:'3.5-official-sdk-pilot-1',status:'CODEX_SDK_READONLY_TURN_COMPLETED',
 scope:'local-sdk-not-cloud-task',isCodexCloudTask:false,isApprovedForDeployment:false,
 repository:'patricktbann/Patrick-OS-Command-Centre',branch,headShaBefore:sha,headShaAfter:sha,
 threadId:'01a17b48-7ab2-7cc1-9742-cef97d2e9e95',itemsCount:11,finalResponse:'Scoped security review'};
const validate=(e)=>verifyLocalSdkEvidence({evidence:e,context:{branch,sha},cleanAfter:true});
test('local SDK proof requires independent QA and is never Cloud dispatch',async()=>{
 const r=await validate(base);assert.equal(r.executorType,'codex-sdk-local');
 assert.equal(r.approvedForDispatch,false);assert.equal(r.approvedForDeployment,false);
 assert.equal(r.status,'COMPLETED_REQUIRES_HUMAN_QA');
});
for(const [label,mutate] of [
 ['cloud spoof',e=>{e.isCodexCloudTask=true}],
 ['deployment spoof',e=>{e.isApprovedForDeployment=true}],
 ['wrong repository',e=>{e.repository='different/repository'}],
 ['wrong branch',e=>{e.branch='main'}],
 ['dirty commit',e=>{e.headShaAfter='b'.repeat(40)}],
 ['empty thread',e=>{e.threadId=''}],
 ['empty response',e=>{e.finalResponse=''}],
 ['zero items',e=>{e.itemsCount=0}]
])test('reject '+label,async()=>{
 const v=structuredClone(base);mutate(v);
 await assert.rejects(validate(v),/LOCAL_SDK_UAT_DENIED/);
});
test('cannot run with API key or CI environment',async()=>{
 for(const env of [{OPENAI_API_KEY:'dummy'}, {CI:'true'}])
 await assert.rejects(runLocalCodexReadOnlyUat({repoRoot:'C:\\test',pythonPath:'python',env}),/LOCAL_SDK_UAT_DENIED/);
});
test('bridge runs only fixed SDK pilot and cleans evidence',async()=>{
 let invocations=[],deleted=[];
 const result=await runLocalCodexReadOnlyUat({
  repoRoot:'/tmp/v3.5-readonly-bridge-unit',pythonPath:'/path/to/private/python',
  env:{HOME:'/tmp'},execute:async(bin,args)=>{
   invocations.push({bin,args});
   if(bin==='git'){
    if(args[0]==='remote')return 'https://github.com/patricktbann/Patrick-OS-Command-Centre.git';
    if(args[0]==='branch')return branch;
    if(args[0]==='rev-parse')return sha;
    if(args[0]==='status')return '';
   }
   if(bin==='/path/to/private/python')return 'SDK task completed';
   throw Error('unexpected command');
  },
  loadEvidence:async()=>JSON.stringify(base),
  removeEvidence:async(p)=>{deleted.push(p)}
 });
 assert.equal(result.executorType,'codex-sdk-local');assert.equal(result.approvedForDispatch,false);
 const launch=invocations.find(v=>v.bin==='/path/to/private/python');
 assert.deepEqual(launch.args.slice(0,2),['agent-runtime/codex-sdk-readonly-pilot.py','--execute']);
 assert.equal(deleted.length,1);assert.match(deleted[0],/codex-pilot-evidence-/);
});
test('failure remains failure and evidence is removed',async()=>{
 const seen=[];
 await assert.rejects(runLocalCodexReadOnlyUat({
  repoRoot:'/tmp/v3.5-readonly-bridge-unit',pythonPath:'python',env:{},
  execute:async(bin,args)=>{
   if(bin==='git'){
    if(args[0]==='remote')return 'git@github.com:patricktbann/Patrick-OS-Command-Centre.git';
    if(args[0]==='branch')return branch;
    if(args[0]==='rev-parse')return sha;
    if(args[0]==='status')return '';
   }
   throw Error('SDK process failed');
  },removeEvidence:async p=>seen.push(p)
 }),/SDK process failed/);
 assert.equal(seen.length,1);
});
