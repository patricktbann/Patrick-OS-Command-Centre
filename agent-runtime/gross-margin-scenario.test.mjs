import test from 'node:test';import assert from 'node:assert/strict';
import {calculateGrossMarginScenario as run} from './gross-margin-scenario.mjs';
test('45 percent example at target',()=>{const r=run({revenue:100000,directCost:55000});assert.equal(r.grossProfit,45000);assert.equal(r.actualMarginPercent,45);assert.equal(r.meetsTarget,true);assert.equal(r.costReductionRequired,0);assert.equal(r.dispatchEnabled,false)});
test('below target calculates required reduction',()=>{const r=run({revenue:100000,directCost:70000});assert.equal(r.actualMarginPercent,30);assert.equal(r.maximumDirectCost,55000);assert.equal(r.costReductionRequired,15000);assert.equal(r.meetsTarget,false)});
test('rejects invalid and unverified inputs',()=>{for(const x of [{revenue:0,directCost:1},{revenue:100,directCost:-1},{revenue:NaN,directCost:5},{revenue:100,directCost:50,targetMarginPercent:101}])assert.throws(()=>run(x),RangeError)});
