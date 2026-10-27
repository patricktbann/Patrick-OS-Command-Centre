import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStaffTask} from './staff-task-pilot.mjs';
const agent={id:'TSY-A0003',name:'Operations Director',division:'Operations'};
test('draft is non-executable and requires approval',()=>{const x=prepareStaffTask({agent,objective:'Review current project risks and prepare an exception report'});assert.equal(x.dispatchEnabled,false);assert.equal(x.executionStatus,'NOT_CONNECTED');assert.equal(x.approvalStatus,'NOT_REQUESTED');});
test('rejects unknown staff and divisions',()=>{assert.throws(()=>prepareStaffTask({agent:{...agent,division:'Unknown'},objective:'Review current project risks'}));});
test('rejects missing objectives and foreign repositories',()=>{assert.throws(()=>prepareStaffTask({agent,objective:'short'}));assert.throws(()=>prepareStaffTask({agent,objective:'Review current project risks',repository:'someoneelse/repo'}));});
