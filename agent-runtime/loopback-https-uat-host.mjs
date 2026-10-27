/** Loopback-only HTTPS UAT listener. Not a public deployment.
 * Requires separately supplied TLS key/cert, OAuth issuer and private router.
 * Never listens on 0.0.0.0 or a public interface. No agent-dispatch routes.
 */
import {createServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {DispatchError} from './dispatch.mjs';
const allowedHosts=new Set(['127.0.0.1','::1']);
export function createLoopbackHttpsUatHost({router,hostname='127.0.0.1',port=8443,
 tlsKey,tlsCert,httpsServerFactory=createServer}={}){
 if(typeof router?.handle!=='function'||!allowedHosts.has(hostname)||
   !Number.isSafeInteger(port)||port<1024||port>65535||
   !tlsKey||!tlsCert||typeof httpsServerFactory!=='function')
  throw new DispatchError('UAT_HOST_DENIED','Private loopback, trusted TLS and router required');
 const server=httpsServerFactory({key:tlsKey,cert:tlsCert,
  minVersion:'TLSv1.2',requestCert:false},async(req,res)=>{
  try{
   const host=req.headers.host;
   const expected=hostname==='::1'?'[::1]:'+port:hostname+':'+port;
   if(host!==expected||req.headers['x-forwarded-host']||
      req.headers['x-forwarded-proto']||req.headers.forwarded||
      req.headers['transfer-encoding']||req.headers['content-length']||
      req.headers.cookie?.length>4096){
     res.writeHead(403,{'Cache-Control':'no-store','Content-Type':'text/plain'});
     res.end('Denied');return;
   }
   // Request reaches this callback only through our own HTTPS server.
   // The trust flag is never copied from HTTP headers or bodies.
   const result=await router.handle({method:req.method,url:'https://'+expected+req.url,
      headers:{host,...req.headers}}, {trustedHttps:true});
   if(!result||!Number.isInteger(result.status)||result.status<200||result.status>599)
     throw Error('Unverified route result');
   res.writeHead(result.status,result.headers||{});
   res.end(typeof result.body==='string'?result.body:'');
  }catch{
   if(!res.headersSent)res.writeHead(500,{'Cache-Control':'no-store','Content-Type':'text/plain'});
   res.end('Internal UAT error');
  }
 });
 return Object.freeze({
  start(){return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,hostname,()=>{
      server.removeListener('error',reject);
      resolve({status:'LOOPBACK_HTTPS_UAT_LISTENING',host:hostname,port,
        externalAccessEnabled:false,dispatchEndpointsEnabled:false});
    });
  })},
  close(){return new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
 });
}
/** Actual private launch is intentionally separate from module import.
 * Certificates must be provisioned locally; NEVER commit .key or .pem.
 */
export async function loadLocalTls({keyFile,certFile}={}){
 if(typeof keyFile!=='string'||typeof certFile!=='string'||!keyFile||!certFile)
  throw new DispatchError('UAT_TLS_MISSING','Local TLS files required');
 return {tlsKey:await readFile(keyFile),tlsCert:await readFile(certFile)};
}
