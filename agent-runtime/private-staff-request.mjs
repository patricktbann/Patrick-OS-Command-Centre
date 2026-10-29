/** Bounded, same-origin JSON intake boundary for a private HTTPS adapter. */
import {DispatchError as StaffPilotError} from './dispatch.mjs';
const fail=(code)=>{throw new StaffPilotError(code,code)};
export function parsePrivateStaffRequest({method,origin,expectedOrigin,contentType,contentLength,body,csrfHeader,csrfCookie}={}){
 if(method!=='POST')fail('METHOD_DENIED');
 if(typeof expectedOrigin!=='string'||!expectedOrigin.startsWith('https://')||origin!==expectedOrigin)fail('ORIGIN_DENIED');
 if(contentType!=='application/json')fail('CONTENT_TYPE_DENIED');
 if(typeof body!=='string'||Buffer.byteLength(body,'utf8')>4096)fail('BODY_TOO_LARGE');
 if(!Number.isInteger(contentLength)||contentLength!==Buffer.byteLength(body,'utf8'))fail('BODY_LENGTH_INVALID');
 if(typeof csrfHeader!=='string'||!/^[-_A-Za-z0-9]{32,128}$/.test(csrfHeader)||csrfHeader!==csrfCookie)fail('CSRF_DENIED');
 let input;try{input=JSON.parse(body)}catch{fail('JSON_INVALID')}
 if(!input||Array.isArray(input)||typeof input!=='object')fail('JSON_INVALID');
 const keys=Object.keys(input);
 if(keys.some(k=>!['agentId','objective','repository'].includes(k)))fail('UNEXPECTED_FIELDS');
 return Object.freeze({agentId:input.agentId,objective:input.objective,repository:input.repository});
}
