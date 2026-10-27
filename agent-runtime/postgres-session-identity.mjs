/** Verify server-held opaque, expiring and revocable sessions against PostgreSQL.
 * This is a verifier ONLY. It does not log in or issue sessions. Issuance
 * requires a separately connected, trusted identity provider.
 * A request/body supplied "serverValidated" marker grants nothing alone.
 */
import {createHash} from 'node:crypto';
import {DispatchError} from './dispatch.mjs';
const id=s=>typeof s==='string'&&/^[A-Za-z0-9][\w.:-]{1,119}$/.test(s);
export function createPostgresSessionIdentity({pool,clock=()=>new Date()}={}){
 if(typeof pool?.query!=='function'||typeof clock!=='function')
   throw new DispatchError('IDENTITY_NOT_CONNECTED','Private session DB and clock required');
 return Object.freeze({
  async authenticate(session){
   // Session must be supplied only by the private server composition,
   // and the secret itself must never enter browser-visible logs.
   const token=session?.opaque;
   if(session?.serverValidated!==true||typeof token!=='string'||token.length<43||token.length>512)
      return null;
   const now=clock();
   if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
      throw new DispatchError('IDENTITY_CLOCK_INVALID','Invalid private server clock');
   const hash=createHash('sha256').update(token,'utf8').digest('hex');
   const r=await pool.query(
    'SELECT principal_id FROM agent_private_session WHERE session_hash=$1 AND expires_at>$2::timestamptz AND issued_at<=$2::timestamptz AND revoked_at IS NULL',
    [hash,now.toISOString()]);
   const principal=r?.rows?.[0]?.principal_id;
   return r?.rowCount===1&&id(principal)?Object.freeze({authenticated:true,subject:principal}):null;
  }
 });
}
