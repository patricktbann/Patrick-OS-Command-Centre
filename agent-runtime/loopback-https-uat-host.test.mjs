import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLoopbackHttpsUatHost} from './loopback-https-uat-host.mjs';
function setup({response={status:200,headers:{'Content-Type':'text/plain'},body:'ok'}}={}){
 let listener,bind,opts,handled=[],written=[],ended=[];
 const server=new EventEmitter();
 server.listen=(p,h,cb)=>{bind=[p,h];cb()};
 server.close=cb=>cb();
 const factory=(config,fn)=>{opts=config;listener=fn;return server};
 const router={handle:async(...args)=>{handled.push(args);return response}};
 const host=createLoopbackHttpsUatHost({router,tlsKey:'mock-key',tlsCert:'mock-cert',
  httpsServerFactory:factory});
 const req=(url='/auth/session',headers={})=>({method:'GET',url,headers:{host:'127.0.0.1:8443',...headers}});
 const run=async request=>{
  written.length=0;ended.length=0;
  const res={headersSent:false,writeHead:(status,headers)=>{written.push({status,headers});res.headersSent=true},
   end:text=>ended.push(text)};
  await listener(request,res);
  return {status:written[0]?.status,body:ended[0]};
 };
 return {host,req,run,handled,opts,getBind:()=>bind};
}
test('host can listen only on loopback with local TLS material',()=>{
 for(const hostname of ['0.0.0.0','192.168.1.2','localhost','example.com'])
 assert.throws(()=>createLoopbackHttpsUatHost({router:{handle(){}},hostname,
 tlsKey:'x',tlsCert:'x'}),e=>e.code==='UAT_HOST_DENIED');
 assert.throws(()=>createLoopbackHttpsUatHost({router:{handle(){}},hostname:'127.0.0.1'}),e=>e.code==='UAT_HOST_DENIED');
});
test('valid loopback HTTPS listener requires TLSv1.2 and no dispatch endpoint',async()=>{
 const f=setup(),status=await f.host.start();
 assert.equal(status.externalAccessEnabled,false);
 assert.equal(status.dispatchEndpointsEnabled,false);
 assert.deepEqual(f.getBind(),[8443,'127.0.0.1']);
 assert.equal(f.opts.minVersion,'TLSv1.2');
 assert.equal((await f.run(f.req('/auth/session'))).status,200);
 assert.equal(f.handled[0][0].url,'https://127.0.0.1:8443/auth/session');
 assert.equal(f.handled[0][1].trustedHttps,true);
 await f.host.close();
});
test('reject forwarded and invalid host claims before invoking router',async()=>{
 const f=setup();
 for(const headers of [{host:'evil.test:8443'},{'x-forwarded-host':'127.0.0.1:8443'},
  {'x-forwarded-proto':'https'},{forwarded:'host=evil'},{'content-length':'10'},
  {'transfer-encoding':'chunked'},{cookie:'c'.repeat(4100)}]){
  const result=await f.run(f.req('/auth/session',headers));
  assert.equal(result.status,403);
 }
 assert.equal(f.handled.length,0);
});
test('route failure emits generic response and no private error details',async()=>{
 const f=setup({response:{status:NaN}}),r=await f.run(f.req());
 assert.equal(r.status,500);assert.equal(r.body,'Internal UAT error');
});

test('allow empty logout POST but reject nonempty Content-Length request bodies',async()=>{
 const f=setup();
 const empty=await f.run({...f.req('/auth/logout'),method:'POST',headers:{host:'127.0.0.1:8443','content-length':'0'}});
 assert.equal(empty.status,200);
 const payload=await f.run({...f.req('/auth/logout'),method:'POST',headers:{host:'127.0.0.1:8443','content-length':'1'}});
 assert.equal(payload.status,403);
 assert.equal(f.handled.length,1);
});

test('bounded POST body is forwarded only on staff prepare route',async()=>{
 const f=setup();
 const body='{"agentId":"TSY-A0003"}';
 const request={...f.req('/api/staff/prepare',{'content-length':String(Buffer.byteLength(body))}),method:'POST',
  [Symbol.asyncIterator]:async function*(){yield Buffer.from(body)}};
 const result=await f.run(request);
 assert.equal(result.status,200);
 assert.equal(f.handled[0][0].body,body);
 assert.equal(f.handled[0][1].trustedHttps,true);
});
test('oversized staff POST is denied before router',async()=>{
 const f=setup();
 const request={...f.req('/api/staff/prepare',{'content-length':'4097'}),method:'POST'};
 assert.equal((await f.run(request)).status,403);
 assert.equal(f.handled.length,0);
});
