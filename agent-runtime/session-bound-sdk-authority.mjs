/** Server-only session-bound authority for governed local SDK inspection.
 * Session comes exclusively from a private server session provider.
 * Never accept session, identity or approval values from request JSON.
 * The identity.authenticate() implementation must independently verify an
 * expiring/revocable server-held session backed by a trusted identity source.
 */
import {createTrustedVerifier} from './trusted-verifier.mjs';
import {DispatchError} from './dispatch.mjs';
export function createSessionBoundSdkAuthority({identity,registry,approvals,github,policy,sessionProvider}={}){
 if(typeof sessionProvider!=='function')
  throw new DispatchError('SESSION_SERVICE_UNAVAILABLE','Private session provider not configured');
 const verify=createTrustedVerifier({identity,registry,approvals,github,policy});
 return Object.freeze({
  async verifyAndBind(request){
   // Prevent accidental auth from a browser-provided session object.
   const session=await sessionProvider();
   if(!session || session.serverValidated!==true)
     throw new DispatchError('SESSION_REQUIRED','Server-held session required');
   return verify(structuredClone(request),session);
  }
 });
}
