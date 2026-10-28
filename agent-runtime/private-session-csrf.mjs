/** Server-owned per-session CSRF tokens, never derived from browser claims. */
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const secret=randomBytes(32);
export function sessionCsrfToken(session){
 if(session?.serverValidated!==true||typeof session.opaque!=='string'||session.opaque.length<32)return null;
 return createHmac('sha256',secret).update('patrick-v36-staff-prepare\0').update(session.opaque).digest('base64url');
}
export function verifySessionCsrf(session,provided){
 const expected=sessionCsrfToken(session);
 if(!expected||typeof provided!=='string')return false;
 const a=Buffer.from(expected),b=Buffer.from(provided);
 return a.length===b.length&&timingSafeEqual(a,b);
}
