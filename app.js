'use strict';
const $=s=>document.querySelector(s),toast=$("#toast"),authView=$("#authView"),dash=$("#dashboardView");
function notify(m){toast.textContent=m;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2800)}
function msg(m,ok=false){const e=$("#authMessage");e.textContent=m;e.style.color=ok?"#067a54":"#c54835"}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Something went wrong.");return d}
function tab(t){document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===t));$("#loginPanel").classList.toggle("hidden",t!=="login");$("#registerPanel").classList.toggle("hidden",t!=="register");msg("")}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
const params=new URLSearchParams(location.search);if(params.get("ref"))$("#refField").value=params.get("ref");
function copy(text,done){navigator.clipboard?.writeText(text).then(()=>notify(done)).catch(()=>notify(text))}
let dashboardNavReady=false;let currentDashboard=null;
function setupDashboardNavigation(){
 if(dashboardNavReady)return;dashboardNavReady=true;
 const nav=$("#mobileBottomNav"),welcome=dash.querySelector(".welcome"),stats=dash.querySelector(".stats"),payment=dash.querySelector(".payment-card"),cards=dash.querySelector(".grid"),plans=$("#plansPanel"),content=dash.querySelector(".content");
 const active=document.createElement("div");active.className="dashboard-page";active.id="page-active";
 const plansPage=document.createElement("div");plansPage.className="dashboard-page hidden";plansPage.id="page-plans";
 const tasksPage=document.createElement("div");tasksPage.className="dashboard-page hidden";tasksPage.id="page-tasks";
 const withdrawalPage=document.createElement("div");withdrawalPage.className="dashboard-page hidden";withdrawalPage.id="page-withdrawal";
 const profilePage=document.createElement("div");profilePage.className="dashboard-page hidden";profilePage.id="page-profile";
 [welcome,stats,payment,cards].forEach(n=>n&&active.append(n));
 const deposit=$("#depositPanel"),tasks=$("#tasksPanel"),withdraw=$("#withdrawPanel"),transactions=$("#transactionList")?.closest(".panel");
 [deposit,transactions].forEach(n=>n&&active.append(n));
 if(tasks)tasksPage.append(tasks);
 if(plans)plansPage.append(plans);
 if(withdraw)withdrawalPage.append(withdraw);
 const profile=document.createElement("section");profile.className="panel profile-panel";
 profile.innerHTML='<div class="panel-head"><div><div class="eyebrow">YOUR ACCOUNT</div><h2>Profile</h2><p>Your Ten Term account information and referral details.</p></div></div><div class="profile-details"><div><small>Full name</small><strong id="profileName">—</strong></div><div><small>Ten Term ID</small><strong id="profileId">—</strong></div><div><small>Account status</small><strong>Active</strong></div><div><small>Referral link</small><strong id="profileReferral">—</strong></div></div><button type="button" class="btn ghost" id="profileCopyReferral">Copy referral link</button>';
 profilePage.append(profile);[active,plansPage,tasksPage,withdrawalPage,profilePage].forEach(p=>dash.insertBefore(p,dash.querySelector("footer")));
 if(content&&!content.children.length)content.remove();
 nav?.classList.remove("hidden");
 nav?.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>showDashboardPage(b.dataset.page)));
 $("#profileCopyReferral")?.addEventListener("click",()=>copy($("#profileReferral").textContent,"Referral link copied."));
 showDashboardPage("active");
}
function showDashboardPage(name){
 const ids={active:"#page-active",tasks:"#page-tasks",plans:"#page-plans",withdrawal:"#page-withdrawal",profile:"#page-profile"};
 Object.entries(ids).forEach(([key,sel])=>$(sel)?.classList.toggle("hidden",key!==name));
 $("#mobileBottomNav")?.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
 window.scrollTo({top:0,behavior:"smooth"});
}
function enter(){authView.classList.add("hidden");dash.classList.remove("hidden");$("#logoutBtn").classList.remove("hidden");setupDashboardNavigation()}
function ensureFundingButton(hasAccount){
 const note=$("#fundingConsentNote"),btn=$("#createFundingAccount");
 note.hidden=hasAccount;btn.hidden=hasAccount;
 note.textContent=hasAccount?"A temporary Monnify account is active for the exact amount shown. Transfer before it expires.":"Enter your amount, then generate a temporary account. The account is unique to your deposit and expires in about 40 minutes.";
}
$("#createFundingAccount").onclick=async()=>{
 const btn=$("#createFundingAccount"),status=$("#payStatus"),bank=$("#payBank");
 btn.disabled=true;btn.textContent="Requesting account…";
 status.textContent="Contacting your secure payment provider. Please wait; do not make a transfer until an account number appears here.";
 try{
  const amount=Number($("#fundingAmount").value);if(!Number.isInteger(amount)||amount<100){throw new Error("Enter a whole-naira amount of at least ₦100.");}const d=await api("/api/funding-account/create",{method:"POST",body:JSON.stringify({consent:true,amount})});
  notify(d.message||"Funding account request completed.");
  render(await api("/api/me"));
 }catch(e){
  const detail=String(e.message||"Funding account request failed.");
  const unavailable=/Dedicated NUBAN is not available/i.test(detail);
  bank.textContent=unavailable?"Funding account unavailable":"Funding account not created";
  status.textContent=unavailable
   ?"Your personal funding account is not available yet. Please try again later. Do not transfer money until your account number appears here."
   :detail;
  notify(unavailable?"Your funding account is not available yet.":detail);
  btn.disabled=false;btn.textContent="Try again later";
 }
};
async function renderPlans(){
 const el=$("#planCards");if(!el)return;
 el.replaceChildren();
 const loading=document.createElement("div");loading.className="empty";loading.textContent="Loading plans…";el.append(loading);
 try{
  const d=await api("/api/plans"),plans=d.plans||[];el.replaceChildren();
  if(!plans.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No plans are currently available. Please check again later.";el.append(empty);return}
  plans.forEach(p=>{
   const card=document.createElement("article");
   card.style.cssText="border:1px solid rgba(130,150,170,.28);border-radius:18px;padding:18px;background:linear-gradient(145deg,rgba(70,85,150,.17),rgba(255,255,255,.035));box-shadow:0 10px 28px rgba(0,0,0,.16)";
   const label=document.createElement("div");label.style.cssText="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;margin-bottom:8px";label.textContent=p.name;
   const price=document.createElement("strong");price.style.cssText="display:block;font-size:27px;letter-spacing:-.7px";price.textContent="₦"+(Number(p.amount_kobo)/100).toLocaleString("en-NG");
   const detail=document.createElement("div");detail.style.cssText="margin-top:12px;font-size:13px;line-height:1.65";
   const count=document.createElement("div");count.textContent=(Number(p.tasks_per_day)||4)+" tasks every day";
   const reward=document.createElement("div");reward.textContent="₦"+(Number(p.reward_per_task_kobo||0)/100).toLocaleString("en-NG")+" per approved task";
   const daily=document.createElement("div");daily.style.cssText="font-weight:700;margin-top:5px";daily.textContent="Up to ₦"+((Number(p.reward_per_task_kobo||0)*Number(p.tasks_per_day||4))/100).toLocaleString("en-NG")+" per day if all tasks are approved";
   const caption=document.createElement("p");caption.style.cssText="font-size:11px;opacity:.65;margin:9px 0 0";caption.textContent=currentDashboard?.activation_enabled?"Rewards depend on approved tasks and available programme funding.":"Activation will open after programme reward funding has been verified.";
   detail.append(count,reward,daily);
   const active=currentDashboard?.subscription?.plan_code===p.plan_code;
   const btn=document.createElement("button");btn.type="button";btn.className="btn primary";btn.style.cssText="width:100%;margin-top:14px;padding:11px";
   btn.textContent=active?"Currently active":(currentDashboard?.subscription?"Another plan is active":(currentDashboard?.activation_enabled?"Activate for 31 days":"Activation temporarily unavailable"));
   btn.disabled=!currentDashboard?.activation_enabled||!!currentDashboard?.subscription||active;
   btn.onclick=async()=>{if(!confirm("Activate "+p.name+" for 31 days for ₦"+(Number(p.amount_kobo)/100).toLocaleString("en-NG")+"? The amount will be deducted from your wallet."))return;btn.disabled=true;btn.textContent="Activating…";try{await api("/api/plans/activate",{method:"POST",body:JSON.stringify({planCode:p.plan_code})});notify("Plan activated for 31 days.");render(await api("/api/me"))}catch(e){notify(e.message);btn.disabled=false;btn.textContent="Activate for 31 days"}};
   card.append(label,price,detail,caption,btn);el.append(card);
  });
 }catch(e){el.replaceChildren();const error=document.createElement("div");error.className="empty";error.textContent="Plans could not load. Please refresh the page.";el.append(error)}
}
function renderTasks(tasks,subscription,completions){
 const el=$("#taskList");if(!el)return;el.replaceChildren();
 const done=completions||[],today=new Date().toLocaleDateString("en-CA");
 const used=done.filter(x=>x.work_date===today&&["submitted","approved","approved_pending_funding"].includes(x.status)).length;
 const active=!!subscription;
 const note=document.createElement("p");note.className="message";note.textContent=active?"Your plan is active until "+new Date(subscription.expires_at).toLocaleDateString("en-NG")+". Today's submissions: "+used+"/"+(subscription.plan?.tasks_per_day||4)+".":"Activate a plan to unlock task submissions.";
 el.append(note);
 if(!tasks.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="There are no active tasks right now.";el.append(empty);return}
 tasks.forEach(t=>{
  const row=document.createElement("div");row.className="task";row.style.cssText="display:block;padding:16px 0";
  const top=document.createElement("div");top.style.cssText="display:flex;gap:12px;align-items:flex-start";
  const icon=document.createElement("div");icon.className="task-icon";icon.textContent="✓";
  const info=document.createElement("div");info.style.flex="1";
  const title=document.createElement("strong");title.textContent=t.title||"Available task";
  const rawDescription=String(t.description||"Follow the task instructions shown here.");
  const urlMatch=rawDescription.match(/https:\/\/t\.me\/[^\s]+/i);
  const taskUrl=urlMatch?urlMatch[0].replace(/[),.]+$/,""):null;
  const desc=document.createElement("p");desc.textContent=taskUrl?rawDescription.replace(taskUrl,"").trim()||"Open our Telegram channel.":rawDescription;
  const reward=document.createElement("span");reward.className="reward";reward.textContent=active?"₦"+(Number(subscription.plan?.reward_per_task_kobo||0)/100).toLocaleString("en-NG")+" per approved task":"Activate a plan to view reward";
  info.append(title,desc,reward);top.append(icon,info);row.append(top);
  const previous=done.find(x=>Number(x.task_id)===Number(t.id)&&x.work_date===today);
  if(previous){const state=document.createElement("p");state.className="message";state.textContent="Today's submission: "+previous.status.replaceAll("_"," ");row.append(state)}
  else if(taskUrl){
   const actions=document.createElement("div");actions.style.cssText="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 0 48px";
   const open=document.createElement("button");open.type="button";open.className="btn ghost";open.textContent="Open Telegram channel";open.disabled=!active||used>=Number(subscription?.plan?.tasks_per_day||4);
   const complete=document.createElement("button");complete.type="button";complete.className="btn primary";complete.textContent="Mark task complete";complete.hidden=true;complete.disabled=true;
   open.onclick=()=>{window.open(taskUrl,"_blank","noopener,noreferrer");complete.hidden=false;complete.disabled=false;open.textContent="Telegram opened";};
   complete.onclick=async()=>{complete.disabled=true;complete.textContent="Submitting…";try{await api("/api/tasks/"+t.id+"/submit",{method:"POST",body:JSON.stringify({proof:"Opened Telegram channel link: "+taskUrl})});notify("Telegram task submitted for review.");render(await api("/api/me"))}catch(err){notify(err.message);complete.disabled=false;complete.textContent="Mark task complete"}};
   actions.append(open,complete);row.append(actions);
   if(!active){const hint=document.createElement("p");hint.className="message";hint.textContent="Activate a plan to submit daily tasks.";row.append(hint)}
  }else{
   const form=document.createElement("form");form.style.cssText="margin:12px 0 0 48px";
   const proof=document.createElement("textarea");proof.required=true;proof.minLength=10;proof.maxLength=3000;proof.rows=3;proof.placeholder="Describe or paste proof of your completed task";proof.style.cssText="width:100%;border:1px solid #dfe8e3;border-radius:10px;padding:10px;font:inherit";proof.disabled=!active||used>=Number(subscription?.plan?.tasks_per_day||4);
   const submit=document.createElement("button");submit.type="submit";submit.className="btn primary";submit.style.cssText="margin-top:8px;padding:10px 14px";submit.textContent=!active?"Plan required":(used>=Number(subscription?.plan?.tasks_per_day||4)?"Daily limit reached":"Submit for review");submit.disabled=!active||used>=Number(subscription?.plan?.tasks_per_day||4);
   form.append(proof,submit);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;submit.textContent="Submitting…";try{await api("/api/tasks/"+t.id+"/submit",{method:"POST",body:JSON.stringify({proof:proof.value})});notify("Task sent to admin for review.");render(await api("/api/me"))}catch(err){notify(err.message);submit.disabled=false;submit.textContent="Submit for review"}};row.append(form);
  }
  el.append(row);
 });
}
function lastDayOfMonthLagos(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(x=>[x.type,x.value]));const day=Number(v.day),last=new Date(Date.UTC(Number(v.year),Number(v.month),0)).getUTCDate();return day===last;}
function renderReferral(d){const r=d.referrals||{},active=!!d.subscription,available=Number(r.available_kobo||0),btn=$("#referralWithdrawBtn"),summary=$("#referralSummary"),message=$("#referralMessage");if(summary)summary.textContent="Invited accounts: "+Number(r.count||0)+" • Total earned: "+(r.earned||"₦0.00")+" • Available: "+(r.available||"₦0.00");if(message){message.textContent=!active?"Activate a plan before referring new customers to earn the ₦1,000 referral reward. Referral earnings are separate from your wallet.":(lastDayOfMonthLagos()?"Today is the month-end referral withdrawal day. Save your bank details and request your available referral payout.":"Referral withdrawals open only on the last calendar day of each month. Your referral earnings are kept separate from your wallet.");}if(btn){btn.disabled=!active||available<100000||!lastDayOfMonthLagos();btn.textContent=!active?"Activate a plan first":(available<100000?"₦1,000 minimum required":(lastDayOfMonthLagos()?"Withdraw referral earnings":"Withdraw on month-end"));}}
function render(d){currentDashboard=d;renderPlans();$("#walletBalance").textContent=d.balance||"₦0.00";const c=d.customer;$("#profileName").textContent=c.full_name||"—";$("#profileId").textContent=c.account_id||"—";$("#profileReferral").textContent=c.referral_link||location.origin+"/?ref="+c.referral_code;$("#customerName").textContent=c.full_name.split(" ")[0];$("#accountId").textContent=c.account_id;$("#todayLabel").textContent=new Date().toLocaleDateString("en-NG",{weekday:"long",day:"numeric",month:"long",year:"numeric"});$("#refLink").textContent=c.referral_link||location.origin+"/?ref="+c.referral_code;renderReferral(d);const fa=d.funding_account;$("#payAccount").textContent=fa?.account_number||"No active transfer account";$("#payBank").textContent=fa?.bank_name||"Monnify transfer account";$("#payStatus").textContent=fa?"Account name: "+fa.account_name+" • Exact transfer: ₦"+Number(fa.amount).toLocaleString("en-NG")+" • Expires: "+new Date(fa.expires_at).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}):"Enter an amount and generate a fresh temporary account. Only transfer to the account shown here.";$("#funding-number").textContent=fa?.account_number||"No active account";$("#funding-bank").textContent=fa?.bank_name||"Your assigned bank";$("#funding-name").textContent=fa?.account_name||"Your assigned account name";$("#funding-status").textContent=fa?"Waiting for verified transfer":"Generate a temporary account to begin";ensureFundingButton(!!fa);$("#bankName").value=c.withdrawal.bank_name||"";$("#accountNumber").value=c.withdrawal.account_number||"";$("#accountName").value=c.withdrawal.account_name||"";renderTasks(d.tasks||[],d.subscription,d.task_completions||[]);renderTx(d.deposits||[],d.withdrawals||[])}
function renderTx(ds,ws){const rows=[...ds.map(x=>({type:"Deposit",...x})),...ws.map(x=>({type:"Withdrawal",...x}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));$("#transactionList").innerHTML=rows.length?rows.slice(0,15).map(x=>"<div class=\"row\"><div><strong>"+x.type+"</strong><small>"+new Date(x.created_at+"Z").toLocaleString()+"</small></div><div><strong>"+x.amount+"</strong><small class=\"status "+x.status+"\">"+x.status+"</small></div></div>").join(""):"<div class='empty'>No transactions yet.</div>"}
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});enter();render(await api("/api/me"))}catch(x){msg(x.message)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/register",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});enter();render(await api("/api/me"));notify("Account created successfully.")}catch(x){msg(x.message)}};
$("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
$("#copyIdBtn").onclick=()=>copy($("#accountId").textContent,"Ten Term ID copied.");$("#copyPayBtn").onclick=()=>copy($("#payAccount").textContent,"Payment account copied.");$("#copyRefBtn").onclick=()=>copy($("#refLink").textContent,"Referral link copied.");
$("#referralWithdrawBtn")?.addEventListener("click",async()=>{const b=$("#referralWithdrawBtn"),m=$("#referralMessage");b.disabled=true;b.textContent="Submitting…";try{const r=await api("/api/referrals/withdraw",{method:"POST",body:JSON.stringify({})});if(m)m.textContent=r.message||"Referral withdrawal submitted.";notify("Referral withdrawal submitted.");render(await api("/api/me"))}catch(e){if(m)m.textContent=e.message;notify(e.message);renderReferral(currentDashboard)}});
function jump(id){$(id).scrollIntoView({behavior:"smooth",block:"center"})}$("#openDeposit").onclick=()=>jump("#depositPanel");$("#openTasks").onclick=()=>jump("#tasksPanel");$("#openWithdraw").onclick=()=>jump("#withdrawPanel");
$("#bankForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile/withdrawal",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});notify("Bank details saved.")}catch(x){$("#withdrawMessage").textContent=x.message}};
$("#requestWithdraw").onclick=async()=>{try{const amount=Number($("#withdrawAmount").value);const body={amount,bankName:$("#bankName").value,accountNumber:$("#accountNumber").value,accountName:$("#accountName").value};const d=await api("/api/withdrawals",{method:"POST",body:JSON.stringify(body)});$("#withdrawMessage").textContent=d.message;notify("Withdrawal request submitted.");render(await api("/api/me"))}catch(x){$("#withdrawMessage").textContent=x.message}};
(async()=>{try{const d=await api("/api/me");enter();render(d)}catch{authView.classList.remove("hidden");dash.classList.add("hidden");$("#mobileBottomNav")?.classList.add("hidden");$("#logoutBtn")?.classList.add("hidden")}})();
