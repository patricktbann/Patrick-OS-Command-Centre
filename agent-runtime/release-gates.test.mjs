import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRelease,REQUIRED_GATES} from './release-gates.mjs';
const generic={status:'PASSED',verifiedAt:'2026-10-27T01:00:00Z',evidenceUrl:'https://github.com/patricktbann/Patrick-OS-Command-Centre/actions/runs/40349123304',verifier:'Brain QA'};
function complete(){
 const gates={};
 for(const key of REQUIRED_GATES)gates[key]={...generic};
 gates.codex_authenticated_live_run={...generic,sdkThreadId:'real-proof-required',isRealSdkRun:true,isCloudTask:false,repositoryCommit:'a'.repeat(40)};
 gates.patrick_uat_approved={...generic,approvedByPrincipal:true,approvalId:'principal-uat-1'};
 gates.patrick_deploy_approved={...generic,approvedByPrincipal:true,approvalId:'principal-deploy-1'};
 gates.nas_compatibility_verified={...generic,nasModel:'verified-model-placeholder'};
 return {gates};
}
test('no evidence never authorizes release or deployment',()=>{
 const r=evaluateRelease({});
 assert.equal(r.disposition,'HOLD');assert.equal(r.autoDeployAuthorized,false);
 assert.equal(Object.values(r.gates).filter(x=>x.status==='HOLD').length,REQUIRED_GATES.length);
});
test('CI-only evidence never equals live Codex and user UAT',()=>{
 const r=evaluateRelease({gates:{contract_ci_passed:generic,postgres_ephemeral_passed:generic}});
 assert.equal(r.gates.contract_ci_passed.status,'PASS');
 assert.equal(r.gates.codex_authenticated_live_run.status,'HOLD');
 assert.equal(r.disposition,'HOLD');
});
test('forged live Codex marker without genuine thread proof denied',()=>{
 const data=complete();delete data.gates.codex_authenticated_live_run.sdkThreadId;
 const r=evaluateRelease(data);assert.equal(r.disposition,'HOLD');
});
test('principal approval cannot be inferred from CI',()=>{
 const data=complete();delete data.gates.patrick_deploy_approved.approvedByPrincipal;
 assert.equal(evaluateRelease(data).disposition,'HOLD');
});
test('evidence URL must be link and timestamp valid',()=>{
 const data=complete();data.gates.nas_compatibility_verified.evidenceUrl='not-an-evidence-url';
 assert.equal(evaluateRelease(data).disposition,'HOLD');
});
test('all claimed evidence still requires manual deployment action',()=>{
 const r=evaluateRelease(complete());
 assert.equal(r.disposition,'READY_FOR_MANUAL_RELEASE_APPROVAL');
 assert.equal(r.autoMergeAuthorized,false);assert.equal(r.autoDeployAuthorized,false);
});
