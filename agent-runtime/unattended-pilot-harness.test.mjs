import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnattendedPilotHarness} from './unattended-pilot-harness.mjs';

test('bounded pilot emits health and completes without deployment',async()=>{
 const health=[];
 const pilot=createUnattendedPilotHarness({cycle:{runOnce:async()=>[]},healthSink:e=>health.push(e),intervalMs:1000,sleep:async()=>{}});
 const result=await pilot.start({maxCycles:2});
 assert.deepEqual(result,{completed:2,errors:0,stopped:false});
 assert.deepEqual(health.map(x=>x.state),['HEALTHY','HEALTHY','STOPPED']);
 assert.deepEqual(health.map(x=>x.sequence),[1,2,3]);
 assert.equal(pilot.running,false);
});
test('temporary provider failure is observable and next cycle recovers',async()=>{
 let count=0;
 const health=[];
 const pilot=createUnattendedPilotHarness({cycle:{runOnce:async()=>{if(++count===1)throw Error('offline');return []}},healthSink:e=>health.push(e),intervalMs:1000,sleep:async()=>{}});
 assert.deepEqual(await pilot.start({maxCycles:2}),{completed:2,errors:1,stopped:false});
 assert.deepEqual(health.map(x=>x.state),['DEGRADED','HEALTHY','STOPPED']);
});
test('missing health sink fails closed',()=>{
 assert.throws(()=>createUnattendedPilotHarness({cycle:{runOnce:async()=>[]}}),/HEALTH_SINK_REQUIRED/);
});
