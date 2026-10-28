const marginButton=document.getElementById('margin-run');
marginButton.addEventListener('click',async()=>{marginButton.disabled=true;const output=document.getElementById('margin-result');output.textContent='Calculating...';try{
 const revenue=Number(document.getElementById('margin-revenue').value),directCost=Number(document.getElementById('margin-cost').value);
 if(!document.getElementById('margin-revenue').value||!document.getElementById('margin-cost').value||!Number.isFinite(revenue)||revenue<=0||!Number.isFinite(directCost)||directCost<0)throw Error('Enter valid revenue and direct cost');
 const sr=await fetch('/auth/session',{credentials:'same-origin'});if(!sr.ok)throw Error('Session expired');const session=await sr.json();
 const body=JSON.stringify({agentId:'TSY-A0003',entity:'TSY Solutions Sdn Bhd',revenue,directCost,targetMarginPercent:45});
 const response=await fetch('/api/staff/margin-scenario',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body});const result=await response.json();
 if(!response.ok||result.dispatchEnabled!==false||result.kind!=='READ_ONLY_GROSS_MARGIN_SCENARIO')throw Error('Scenario denied');output.textContent=JSON.stringify(result,null,2);
 }catch(e){output.textContent='Not calculated: '+e.message}finally{marginButton.disabled=false}});
