import test from 'node:test';import assert from 'node:assert/strict';
import {parseMarginScenarioRequest as parse} from './private-margin-request.mjs';
const data={agentId:'TSY-A0003',entity:'TSY Solutions Sdn Bhd',revenue:100000,directCost:70000,targetMarginPercent:45};
const parseData=(x)=>{const body=JSON.stringify(x);return parse({body,contentLength:Buffer.byteLength(body)})};
test('accepts explicit TSY scenario',()=>assert.deepEqual(parseData(data),data));
test('rejects another company and staff',()=>{assert.throws(()=>parseData({...data,entity:'Another Company'}));assert.throws(()=>parseData({...data,agentId:'TSY-A0001'}))});
test('rejects authority fields and non-numeric inputs',()=>{assert.throws(()=>parseData({...data,approve:true}));assert.throws(()=>parseData({...data,revenue:'100000'}))});
test('rejects mismatched body length',()=>assert.throws(()=>parse({body:JSON.stringify(data),contentLength:2})));

test('pilot fixes target at 45 percent and rejects excessive precision',()=>{
 assert.throws(()=>parseData({...data,targetMarginPercent:30}));
 assert.throws(()=>parseData({...data,revenue:100.001}));
 assert.throws(()=>parseData({...data,directCost:2.999}));
});
test('pilot rejects negative and unbounded money values',()=>{
 assert.throws(()=>parseData({...data,revenue:-1}));
 assert.throws(()=>parseData({...data,directCost:-1}));
 assert.throws(()=>parseData({...data,revenue:1e13}));
});
