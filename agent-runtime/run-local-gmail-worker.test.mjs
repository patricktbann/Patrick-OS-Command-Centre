import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const runner=path.join(path.dirname(fileURLToPath(import.meta.url)),'run-local-gmail-worker.mjs');
const clearEnv=()=>{
 const env={...process.env};
 for(const key of ['PATRICK_GMAIL_DB_PATH','PATRICK_GMAIL_TOKEN_PATH','PATRICK_GMAIL_CLIENT_PATH','PATRICK_GMAIL_MAX_CYCLES','PATRICK_GMAIL_INTERVAL_MS'])delete env[key];
 return env;
};
test('missing private configuration prevents startup',()=>{
 const result=spawnSync(process.execPath,[runner],{env:clearEnv(),encoding:'utf8',timeout:5000});
 assert.equal(result.status,2);
 assert.match(result.stderr,/PRIVATE_WORKER_CONFIGURATION_MISSING/);
});
test('invalid polling limits are denied before opening private files',()=>{
 const env={...clearEnv(),PATRICK_GMAIL_DB_PATH:'placeholder',PATRICK_GMAIL_TOKEN_PATH:'placeholder',PATRICK_GMAIL_CLIENT_PATH:'placeholder',PATRICK_GMAIL_MAX_CYCLES:'0'};
 const result=spawnSync(process.execPath,[runner],{env,encoding:'utf8',timeout:5000});
 assert.equal(result.status,2);
 assert.match(result.stderr,/INVALID_WORKER_LIMITS/);
});
