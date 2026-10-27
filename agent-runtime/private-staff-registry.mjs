/** Server-owned pilot registry. Never trust browser-supplied staff identity or roles. */
const pilot=Object.freeze([
 Object.freeze({id:'TSY-A0001',name:'Group CEO',division:'Group Command',active:true}),
 Object.freeze({id:'TSY-A0003',name:'Operations Director',division:'Operations',active:true}),
 Object.freeze({id:'TSY-A0005',name:'Investment Analyst',division:'Finance & Investment',active:true})
]);
export function createPrivateStaffRegistry(){return Object.freeze({
 loadStaff:async id=>pilot.find(x=>x.id===id)||null,
 canPrepare:async(principal,staff)=>principal?.authenticated===true&&principal.id==='patrick-principal'&&pilot.some(x=>x.id===staff?.id),
 listStaff:async principal=>principal?.authenticated===true&&principal.id==='patrick-principal'?pilot.map(({id,name,division})=>({id,name,division})):[]
});}
