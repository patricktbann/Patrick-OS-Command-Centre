/** V3.5 release readiness. No automatic green based on CI alone.
 * Evidence is explicit and reviewed outside this tool. Never store secrets here.
 */
export const REQUIRED_GATES=Object.freeze([
 'stacked_prs_reviewed','contract_ci_passed','postgres_ephemeral_passed',
 'codex_authenticated_live_run','backend_identity_verified',
 'approval_persistence_verified','recovery_uat_passed',
 'patrick_uat_approved','nas_compatibility_verified',
 'production_security_reviewed','patrick_deploy_approved'
]);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/i.test(x);
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const ref=x=>typeof x==='string'&&x.length>8&&x.length<=512&&/^https:\/\//.test(x);
const evidenceValid=(key,record)=>{
 if(!record||record.status!=='PASSED'||!time(record.verifiedAt)||!ref(record.evidenceUrl))return false;
 if(typeof record.verifier!=='string'||!record.verifier.trim())return false;
 if(key==='codex_authenticated_live_run')return typeof record.sdkThreadId==='string'&&record.sdkThreadId.length>3&&
  record.isRealSdkRun===true&&record.isCloudTask!==true&&sha(record.repositoryCommit);
 if(key==='patrick_uat_approved'||key==='patrick_deploy_approved')return record.approvedByPrincipal===true&&
  typeof record.approvalId==='string'&&record.approvalId.length>2;
 if(key==='nas_compatibility_verified')return typeof record.nasModel==='string'&&record.nasModel.length>2;
 return true;
};
export function evaluateRelease(evidence,version='V3.5'){
 const gates={};
 for(const key of REQUIRED_GATES){
  const valid=evidenceValid(key,evidence?.gates?.[key]);
  gates[key]={status:valid?'PASS':'HOLD',reason:valid?'Recorded evidence':'Missing or insufficient verified evidence'};
 }
 const eligible=Object.values(gates).every(x=>x.status==='PASS');
 return Object.freeze({schemaVersion:'1',release:version,
  disposition:eligible?'READY_FOR_MANUAL_RELEASE_APPROVAL':'HOLD',
  autoDeployAuthorized:false,autoMergeAuthorized:false,
  gates});
}
