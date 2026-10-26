/** Deterministic task fingerprint used for server-recorded approvals only. */
import {createHash} from 'node:crypto';
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'){
  if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('Plain task record required');
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 }
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid task value');
 if(value===undefined||typeof value==='function'||typeof value==='symbol')throw Error('Unsupported task value');
 return value;
}
export function taskDigest(task){
 if(!task||typeof task!=='object'||Array.isArray(task))throw Error('Task record required');
 return createHash('sha256').update(JSON.stringify(canonical(task))).digest('hex');
}
