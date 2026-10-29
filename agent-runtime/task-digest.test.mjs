import test from 'node:test';
import assert from 'node:assert/strict';
import {taskDigest} from './task-digest.mjs';
test('same task independent of JSON field ordering has same digest',()=>{
 const one={taskId:'T1',scope:{repository:'org/repo',actions:['read','test']},objective:'x'};
 const two={objective:'x',scope:{actions:['read','test'],repository:'org/repo'},taskId:'T1'};
 assert.equal(taskDigest(one),taskDigest(two));
});
test('modified instructions or actions change approval digest',()=>{
 const task={taskId:'T1',objective:'read-only',allowedActions:['read-repo']};
 assert.notEqual(taskDigest(task),taskDigest({...task,objective:'deploy'}));
 assert.notEqual(taskDigest(task),taskDigest({...task,allowedActions:['deploy']}));
});
test('invalid canonical value cannot silently disappear',()=>{
 assert.throws(()=>taskDigest({taskId:'T1',change:undefined}));
});
