/** V3.6 read-only staff task preparation. No execution, no authorization. */
import {StaffPilotError as DispatchError} from './staff-pilot-error.mjs';
const ALLOWED=new Set(['Group Command','Operations','Finance & Investment']);
const clean=x=>typeof x==='string'?x.trim():'';
export function prepareStaffTask({agent,objective,repository}={}){
 const name=clean(agent?.name),division=clean(agent?.division),id=clean(agent?.id);
 const goal=clean(objective),repo=clean(repository);
 if(!/^TSY-A\d{4}$/.test(id)||!name||!ALLOWED.has(division))
   throw new DispatchError('STAFF_SCOPE_INVALID','Known pilot staff and division required');
 if(goal.length<12||goal.length>1000)throw new DispatchError('OBJECTIVE_INVALID','Objective must be 12-1000 characters');
 if(repo && !/^patricktbann\/[A-Za-z0-9._-]+$/.test(repo))
   throw new DispatchError('REPOSITORY_INVALID','Repository outside approved namespace');
 return Object.freeze({kind:'STAFF_TASK_DRAFT',agentId:id,agentName:name,division,objective:goal,
   repository:repo||null,executionStatus:'NOT_CONNECTED',approvalStatus:'NOT_REQUESTED',
   dispatchEnabled:false,source:'UNTRUSTED_BROWSER_DRAFT'});
}
