const $=s=>document.querySelector(s),toast=$("#toast"),authView=$("#authView"),dash=$("#dashboardView");
function notify(m){toast.textContent=m;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2800)}
function msg(m,ok=false){const e=$("#authMessage");e.textContent=m;e.style.color=ok?"#067a54":"#c54835"}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Something went wrong.");return d}
function tab(t){document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===t));$("#loginPanel").classList.toggle("hidden",t!=="login");$("#registerPanel").classList.toggle("hidden",t!=="register");msg("")}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
const params=new URLSearchParams(location.search);if(params.get("ref"))$("#refField").value=params.get("ref");
function copy(text,done){navigator.clipboard?.writeText(text).then(()=>notify(done)).catch(()=>notify(text))}
function enter(){authView.classList.add("hidden");dash.classList.remove("hidden");$("#logoutBtn").classList.remove("hidden")}

function ensureFundingButton(hasAccount){
 const note=$("#fundingConsentNote"),btn=$("#createFundingAccount");
 note.hidden=hasAccount;btn.hidden=hasAccount;
 note.textContent=hasAccount?"Your dedicated funding account is ready. Use the account number above to fund your wallet.":"Tap once to consent to sharing your name, email and phone securely with Paystack so your personal funding account can be assigned.";
}
$("#createFundingAccount").onclick=async()=>{
 const btn=$("#createFundingAccount");btn.disabled=true;btn.textContent="Requesting account…";
 try{const d=await api("/api/funding-account/create",{method:"POST",body:JSON.stringify({consent:true})});notify(d.message||"Funding account request completed.");render(await api("/api/me"));}
 catch(e){notify(e.message);btn.disabled=false;btn.textContent="Create my funding account";}
};
function render(d){const c=d.customer;$("#customerName").textContent=c.full_name.split(" ")[0];$("#accountId").textContent=c.account_id;$("#todayLabel").textContent=new Date().toLocaleDateString("en-NG",{weekday:"long",day:"numeric",month:"long",year:"numeric"});$("#refLink").textContent=c.referral_link||location.origin+"/?ref="+c.referral_code;$("#payAccount").textContent=c.dva?.account_number||"Pending";$("#payBank").textContent=c.dva?.bank_name||"Funding account";$("#payStatus").textContent=c.dva?`Account name: ${c.dva.account_name}`:"Request your dedicated funding account below. Your name, email and phone will be shared securely with Paystack for account creation.";ensureFundingButton(!!c.dva);$("#bankName").value=c.withdrawal.bank_name||"";$("#accountNumber").value=c.withdrawal.account_number||"";$("#accountName").value=c.withdrawal.account_name||"";renderTx(d.deposits||[],d.withdrawals||[])}
function renderTx(ds,ws){const rows=[...ds.map(x=>({type:"Deposit",...x})),...ws.map(x=>({type:"Withdrawal",...x}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));$("#transactionList").innerHTML=rows.length?rows.slice(0,15).map(x=>`<div class="row"><div><strong>${x.type}</strong><small>${new Date(x.created_at+"Z").toLocaleString()}</small></div><div><strong>${x.amount}</strong><small class="status ${x.status}">${x.status}</small></div></div>`).join(""):"<div class='empty'>No transactions yet.</div>"}
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});enter();render(await api("/api/me"))}catch(x){msg(x.message)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/register",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});enter();render(await api("/api/me"));notify("Account created successfully.")}catch(x){msg(x.message)}};
$("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
$("#copyIdBtn").onclick=()=>copy($("#accountId").textContent,"Ten Term ID copied.");$("#copyPayBtn").onclick=()=>copy($("#payAccount").textContent,"Payment account copied.");$("#copyRefBtn").onclick=()=>copy($("#refLink").textContent,"Referral link copied.");
function jump(id){$(id).scrollIntoView({behavior:"smooth",block:"center"})}$("#openDeposit").onclick=()=>jump("#depositPanel");$("#openTasks").onclick=()=>jump("#tasksPanel");$("#openWithdraw").onclick=()=>jump("#withdrawPanel");
$("#bankForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile/withdrawal",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});notify("Bank details saved.")}catch(x){$("#withdrawMessage").textContent=x.message}};
$("#requestWithdraw").onclick=async()=>{try{const amount=Number($("#withdrawAmount").value);const body={amount,bankName:$("#bankName").value,accountNumber:$("#accountNumber").value,accountName:$("#accountName").value};const d=await api("/api/withdrawals",{method:"POST",body:JSON.stringify(body)});$("#withdrawMessage").textContent=d.message;notify("Withdrawal request submitted.");render(await api("/api/me"))}catch(x){$("#withdrawMessage").textContent=x.message}};
(async()=>{try{enter();render(await api("/api/me"))}catch{authView.classList.remove("hidden");dash.classList.add("hidden")}})();
