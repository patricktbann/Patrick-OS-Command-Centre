import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupervisedInboxService} from './supervised-inbox-service.mjs';
test('runs bounded cycles and emits health',async()=>{
 let calls=0;const health=[];
 const service=createSupervisedInboxService({cycle:{runOnce:async()=>{calls++;return []}},intervalMs:1000,sleep:async()=>{},onHealth:h=>health.push(h)});
 assert.deepEqual(await service.run({maxCycles:3}),{completed:3,errors:0,stopped:false});
 assert.equal(calls,3);assert.deepEqual(health.map(h=>h.state),['HEALTHY','HEALTHY','HEALTHY','STOPPED']);
});
test('provider error degrades but next cycle recovers',async()=>{
 let calls=0;const health=[];
 const service=createSupervisedInboxService({cycle:{runOnce:async()=>{if(++calls===1)throw Error('GMAIL_UNAVAILABLE');return [{status:'APPROVED'}]}},intervalMs:1000,sleep:async()=>{},onHealth:h=>health.push(h)});
 assert.deepEqual(await service.run({maxCycles:2}),{completed:2,errors:1,stopped:false});
 assert.deepEqual(health.map(h=>h.state),['DEGRADED','HEALTHY','STOPPED']);
});
test('explicit stop prevents further polling',async()=>{
 let calls=0;let service;
 service=createSupervisedInboxService({cycle:{runOnce:async()=>{calls++;service.stop();return []}},intervalMs:1000,sleep:async()=>{}});
 assert.equal((await service.run({maxCycles:10})).stopped,true);assert.equal(calls,1);
});
test('rejects invalid interval and overlapping run',async()=>{
 assert.throws(()=>createSupervisedInboxService({cycle:{runOnce:async()=>[]},intervalMs:1}),/INVALID_SERVICE_CONFIGURATION/);
 let release;const gate=new Promise(resolve=>release=resolve);
 const service=createSupervisedInboxService({cycle:{runOnce:()=>gate},intervalMs:1000});
 const first=service.run({maxCycles:1});
 await assert.rejects(()=>service.run({maxCycles:1}),/ALREADY_RUNNING/);
 release([]);await first;
});
