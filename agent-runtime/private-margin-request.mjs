export function parseMarginScenarioRequest({body,contentLength}={}){
 if(typeof body!=='string'||Buffer.byteLength(body,'utf8')>4096||Buffer.byteLength(body,'utf8')!==contentLength)throw Error('BODY_INVALID');
 let x;try{x=JSON.parse(body)}catch{throw Error('JSON_INVALID')}
 if(!x||Array.isArray(x)||typeof x!=='object'||Object.keys(x).some(k=>!['agentId','entity','revenue','directCost','targetMarginPercent'].includes(k)))throw Error('FIELDS_INVALID');
 if(x.agentId!=='TSY-A0003'||x.entity!=='TSY Solutions Sdn Bhd')throw Error('SCOPE_DENIED');
 for(const k of ['revenue','directCost','targetMarginPercent'])if(typeof x[k]!=='number'||!Number.isFinite(x[k]))throw Error('NUMBER_INVALID');
 // The current TSY pilot has a fixed 45% management target. Financial values
 // are bounded to two-decimal MYR amounts and cannot silently change scope.
 if(x.targetMarginPercent!==45||x.revenue<=0||x.directCost<0||x.revenue>1e12||x.directCost>1e12)throw Error('FINANCIAL_SCOPE_INVALID');
 for(const k of ['revenue','directCost'])if(Math.abs(Math.round(x[k]*100)-x[k]*100)>0.00001)throw Error('CURRENCY_PRECISION_INVALID');
 return Object.freeze(x);
}
