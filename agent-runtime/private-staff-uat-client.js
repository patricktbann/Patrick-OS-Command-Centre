const out=document.getElementById('result');const button=document.getElementById('run-uat');
button.addEventListener('click',async()=>{button.disabled=true;out.textContent='Running...';try{
const sr=await fetch('/auth/session',{credentials:'same-origin'});if(!sr.ok)throw Error('Session denied');const session=await sr.json();
const r=await fetch('/api/staff',{credentials:'same-origin'});if(!r.ok)throw Error('Staff denied');const staff=await r.json();if(staff.executionEnabled!==false||!staff.staff.some(x=>x.id==='TSY-A0003'))throw Error('Registry invalid');
const body=JSON.stringify({agentId:'TSY-A0003',objective:'Prepare a read-only review of project risks'});
const headers={'Content-Type':'application/json','X-CSRF-Token':session.csrfToken};const p=await fetch('/api/staff/prepare',{method:'POST',credentials:'same-origin',headers,body});const draft=await p.json();if(!p.ok||draft.agentId!=='TSY-A0003'||draft.dispatchEnabled!==false||draft.executionStatus!=='NOT_CONNECTED')throw Error('Draft invalid');
const bad=await fetch('/api/staff/prepare',{method:'POST',credentials:'same-origin',headers:{...headers,'X-CSRF-Token':'invalid'},body});if(bad.status!==403)throw Error('CSRF check failed');out.textContent='PASS: Authenticated staff draft prepared; execution disabled; invalid CSRF denied.';
}catch(e){out.textContent='FAIL: '+e.message}finally{button.disabled=false}});
