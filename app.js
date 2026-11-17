'use strict';
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
 const btn=$("#createFundingAccount"),status=$("#payStatus"),bank=$("#payBank");
 btn.disabled=true;btn.textContent="Requesting account…";
 status.textContent="Contacting Paystack securely. Please wait; do not make a transfer until an account number appears here.";
 try{
  const d=await api("/api/funding-account/create",{method:"POST",body:JSON.stringify({consent:true})});
  notify(d.message||"Funding account request completed.");
  render(await api("/api/me"));
 }catch(e){
  const detail=String(e.message||"Funding account request failed.");
  const unavailable=/Dedicated NUBAN is not available/i.test(detail);
  bank.textContent=unavailable?"Paystack activation required":"Funding account not created";
  status.textContent=unavailable
   ?"Paystack has not enabled Dedicated Virtual Accounts (Dedicated NUBAN) for this merchant account. The account cannot be generated yet. The business owner must contact support@paystack.com and request DVA/Dedicated NUBAN activation for this exact business account."
   :detail;
  notify(unavailable?"Paystack must activate Dedicated NUBAN first.":detail);
  btn.disabled=false;btn.textContent="Try again after Paystack activation";
 }
};
function renderPlans(){
 const el=$("#planCards");if(!el)return;
 const plans=[1500,2500,5000,15000];
 el.replaceChildren();
 plans.forEach((amount,index)=>{
  const card=document.createElement("article");
  card.style.cssText="border:1px solid rgba(130,150,170,.25);border-radius:14px;padding:18px;background:rgba(255,255,255,.035)";
  const label=document.createElement("div");label.style.cssText="font-size:12px;opacity:.72;margin-bottom:8px";label.textContent="PLAN "+(index+1);
  const price=document.createElement("strong");price.style.cssText="display:block;font-size:25px;letter-spacing:-.5px";price.textContent="₦"+amount.toLocaleString("en-NG");
  const caption=document.createElement("p");caption.style.cssText="font-size:12px;opacity:.7;margin:8px 0 0";caption.textContent="Plan amount";
  card.append(label,price,caption);el.append(card);
 });
}
function renderTasks(tasks){
 const el=$("#taskList");if(!el)return;el.replaceChildren();
 if(!tasks.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="There are no active task plans right now. Please check again later.";el.append(empty);return}
 tasks.forEach(t=>{
  const row=document.createElement("div");row.className="task";
  const icon=document.createElement("div");icon.className="task-icon";icon.textContent="✓";
  const info=document.createElement("div");
  const title=document.createElement("strong");title.textContent=t.title||"Available task";
  const desc=document.createElement("p");desc.textContent=t.description||"Follow the task instructions shown here.";
  const reward=document.createElement("span");reward.className="reward";reward.textContent=t.reward||"Reward pending";
  info.append(title,desc);row.append(icon,info,reward);el.append(row);
 });
}
function render(d){renderPlans();const c=d.customer;$("#customerName").textContent=c.full_name.split(" ")[0];$("#accountId").textContent=c.account_id;$("#todayLabel").textContent=new Date().toLocaleDateString("en-NG",{weekday:"long",day:"numeric",month:"long",year:"numeric"});$("#refLink").textContent=c.referral_link||location.origin+"/?ref="+c.referral_code;$("#payAccount").textContent=c.dva?.account_number||"Pending";$("#payBank").textContent=c.dva?.bank_name||"Funding account";$("#payStatus").textContent=c.dva?"Account name: "+c.dva.account_name:"Request your dedicated funding account below. Your name, email and phone will be shared securely with Paystack for account creation.";ensureFundingButton(!!c.dva);$("#bankName").value=c.withdrawal.bank_name||"";$("#accountNumber").value=c.withdrawal.account_number||"";$("#accountName").value=c.withdrawal.account_name||"";renderTasks(d.tasks||[]);renderTx(d.deposits||[],d.withdrawals||[])}
function renderTx(ds,ws){const rows=[...ds.map(x=>({type:"Deposit",...x})),...ws.map(x=>({type:"Withdrawal",...x}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));$("#transactionList").innerHTML=rows.length?rows.slice(0,15).map(x=>"<div class=\"row\"><div><strong>"+x.type+"</strong><small>"+new Date(x.created_at+"Z").toLocaleString()+"</small></div><div><strong>"+x.amount+"</strong><small class=\"status "+x.status+"\">"+x.status+"</small></div></div>").join(""):"<div class='empty'>No transactions yet.</div>"}
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});enter();render(await api("/api/me"))}catch(x){msg(x.message)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/register",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});enter();render(await api("/api/me"));notify("Account created successfully.")}catch(x){msg(x.message)}};
$("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
$("#copyIdBtn").onclick=()=>copy($("#accountId").textContent,"Ten Term ID copied.");$("#copyPayBtn").onclick=()=>copy($("#payAccount").textContent,"Payment account copied.");$("#copyRefBtn").onclick=()=>copy($("#refLink").textContent,"Referral link copied.");
function jump(id){$(id).scrollIntoView({behavior:"smooth",block:"center"})}$("#openDeposit").onclick=()=>jump("#depositPanel");$("#openTasks").onclick=()=>jump("#tasksPanel");$("#openWithdraw").onclick=()=>jump("#withdrawPanel");
$("#bankForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile/withdrawal",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});notify("Bank details saved.")}catch(x){$("#withdrawMessage").textContent=x.message}};
$("#requestWithdraw").onclick=async()=>{try{const amount=Number($("#withdrawAmount").value);const body={amount,bankName:$("#bankName").value,accountNumber:$("#accountNumber").value,accountName:$("#accountName").value};const d=await api("/api/withdrawals",{method:"POST",body:JSON.stringify(body)});$("#withdrawMessage").textContent=d.message;notify("Withdrawal request submitted.");render(await api("/api/me"))}catch(x){$("#withdrawMessage").textContent=x.message}};
(async()=>{try{enter();render(await api("/api/me"))}catch{authView.classList.remove("hidden");dash.classList.add("hidden")}})();
