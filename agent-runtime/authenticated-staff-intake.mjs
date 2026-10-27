/** V3.6 private read-only staff intake; no dispatch or persistence. */
import {prepareStaffTask} from './staff-task-pilot.mjs';
import {DispatchError} from './dispatch.mjs';
export function createAuthenticatedStaffIntake({sessionProvider,identity,registry}={}){
 if(typeof sessionProvider!=='function'||typeof identity?.authenticate!=='function'||typeof registry?.loadStaff!=='function')
  throw new DispatchError('INTAKE_NOT_CONFIGURED','Trusted private dependencies required');
 return Object.freeze({
  async prepare(input){
   const session=await sessionProvider();
   if(!session?.serverValidated)throw new DispatchError('SESSION_REQUIRED','Verified private session required');
   const principal=await identity.authenticate(session);
   if(principal?.authenticated!==true)throw new DispatchError('SESSION_DENIED','Authenticated principal required');
   const id=input?.agentId;
   if(typeof id!=='string'||!/^TSY-A\d{4}$/.test(id))throw new DispatchError('STAFF_SCOPE_INVALID','Valid staff ID required');
   const staff=await registry.loadStaff(id);
   if(!staff||staff.id!==id||staff.active!==true)throw new DispatchError('STAFF_NOT_FOUND','Active registered staff required');
   if(typeof registry.canPrepare!=='function'||await registry.canPrepare(principal,staff)!==true)
    throw new DispatchError('STAFF_ACCESS_DENIED','Principal lacks staff scope');
   const draft=prepareStaffTask({agent:staff,objective:input?.objective,repository:input?.repository});
   return Object.freeze({...draft,preparedForPrincipal:principal.id,executionStatus:'NOT_CONNECTED',dispatchEnabled:false});
  }
 });
}
