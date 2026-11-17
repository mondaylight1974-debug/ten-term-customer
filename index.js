'use strict';
require('dotenv').config();
const express=require('express'),session=require('express-session'),helmet=require('helmet'),bcrypt=require('bcryptjs'),crypto=require('crypto'),path=require('path');
const {rateLimit}=require('express-rate-limit');
const app=express(),PORT=process.env.PORT||3000;
const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,''),KEY=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET=process.env.SESSION_SECRET,APP_URL=(process.env.PUBLIC_APP_URL||'').replace(/\/$/,'');
const PAY_KEY=process.env.PAYSTACK_SECRET_KEY,PAY_ON=process.env.PAYSTACK_ENABLED==='true';
const ADMIN=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),ADMIN_HASH=process.env.ADMIN_PASSWORD_HASH||'';
if(!SECRET||SECRET.length<32){console.error('Set SESSION_SECRET to at least 32 random characters.');process.exit(1);}
const ready=!!(URL&&KEY);
async function db(pathname,method='GET',body,headers={}){
 if(!ready)throw Error('Database is not configured.');
 const r=await fetch(URL+'/rest/v1/'+pathname,{method,headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await r.text();let d=null;try{d=raw?JSON.parse(raw):null}catch{d=raw;}
 if(!r.ok)throw Error((d&&(d.message||d.hint))||('Database error '+r.status));return d;
}
class Store extends session.Store{
 get(id,cb){db('sessions?sid=eq.'+encodeURIComponent(id)+'&select=sess,expire').then(a=>{const x=a&&a[0];cb(null,!x||new Date(x.expire)<=new Date()?null:x.sess)}).catch(cb)}
 set(id,s,cb=()=>{}){const exp=s.cookie&&s.cookie.expires||new Date(Date.now()+28800000);db('sessions?on_conflict=sid','POST',{sid:id,sess:s,expire:new Date(exp).toISOString()},{Prefer:'resolution=merge-duplicates,return=minimal'}).then(()=>cb()).catch(cb)}
 touch(id,s,cb=()=>{}){const exp=s.cookie&&s.cookie.expires||new Date(Date.now()+28800000);db('sessions?sid=eq.'+encodeURIComponent(id),'PATCH',{expire:new Date(exp).toISOString()},{Prefer:'return=minimal'}).then(()=>cb()).catch(cb)}
 destroy(id,cb=()=>{}){db('sessions?sid=eq.'+encodeURIComponent(id),'DELETE',undefined,{Prefer:'return=minimal'}).then(()=>cb()).catch(cb)}
}
app.set('trust proxy',1);app.use(helmet({contentSecurityPolicy:false}));
app.use((req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.path!='/api/paystack/webhook'){const o=req.get('origin');if(o){try{if(new globalThis.URL(o).host!==req.get('host'))return res.status(403).json({error:'Request origin is not allowed.'})}catch{return res.status(403).json({error:'Invalid request origin.'})}}}next()});
app.post('/api/paystack/webhook',express.raw({type:'application/json',limit:'200kb'}),webhook);
app.use(express.json({limit:'30kb'}));
app.use(session({name:'ten_term.sid',secret:SECRET,store:new Store(),resave:false,saveUninitialized:false,rolling:true,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000}}));
app.use(express.static(path.join(__dirname,'public'),{index:false}));
const limiter=rateLimit({windowMs:900000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many attempts. Wait and try again.'}});
const writes=rateLimit({windowMs:60000,limit:25,standardHeaders:'draft-7',legacyHeaders:false});
const dbReady=(q,s,n)=>ready?n():s.status(503).json({error:'Ten Term database is not configured yet.'});
const auth=(q,s,n)=>q.session&&q.session.customerId?n():s.status(401).json({error:'Please log in to continue.'});
const admin=(q,s,n)=>q.session&&q.session.adminAuthenticated===true?n():s.status(401).json({error:'Admin login required.'});
const money=n=>'₦'+(Number(n||0)/100).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
const phone=v=>{let p=String(v||'').replace(/[^0-9+]/g,'');if(/^0\d{10}$/.test(p))p='+234'+p.slice(1);if(/^234\d{10}$/.test(p))p='+'+p;return p};
const randomId=()=> 'TT-'+crypto.randomInt(10000000,99999999);
const refCode=()=> 'TTREF-'+crypto.randomBytes(4).toString('hex').toUpperCase();
const names=n=>{const a=n.trim().split(/\s+/);return {first_name:a[0],last_name:a.slice(1).join(' ')||a[0]}};
async function pay(pathname,body){if(!PAY_KEY)throw Error('Paystack is not configured.');const r=await fetch('https://api.paystack.co'+pathname,{method:'POST',headers:{Authorization:'Bearer '+PAY_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.status===false)throw Error(d.message||'Paystack request failed.');return d.data;}
async function payGet(pathname){if(!PAY_KEY)throw Error('Paystack is not configured.');const r=await fetch('https://api.paystack.co'+pathname,{headers:{Authorization:'Bearer '+PAY_KEY}});const d=await r.json().catch(()=>({}));if(!r.ok||d.status===false)throw Error(d.message||'Paystack request failed.');return d.data;}
async function provisionDva(c){
 if(!PAY_KEY)throw Error('Paystack secret key is not configured on the server.');
 if(c.dva_account_number)return c;
 let code=c.paystack_customer_code;
 if(!code){
  try{const existing=await payGet('/customer/'+encodeURIComponent(c.email));code=existing&&existing.customer_code;}
  catch(e){if(!/not found|does not exist|could not be found|no customer/i.test(e.message))throw e;}
  if(!code){const pc=await pay('/customer',{email:c.email,...names(c.full_name),phone:c.phone,metadata:{ten_term_id:c.account_id}});code=pc&&pc.customer_code;}
  if(!code)throw Error('Paystack did not return a customer code.');
  await db('customers?id=eq.'+encodeURIComponent(c.id),'PATCH',{paystack_customer_code:code},{Prefer:'return=minimal'});
 }
 const dva=await pay('/dedicated_account',{customer:code,preferred_bank:process.env.PAYSTACK_PREFERRED_BANK||'titan-paystack',...names(c.full_name),phone:c.phone});
 if(!dva||!dva.account_number)throw Error('Paystack accepted the request but has not returned an account number yet. Check your Paystack DVA eligibility and assignment status.');
 await db('customers?id=eq.'+encodeURIComponent(c.id),'PATCH',{dva_account_number:String(dva.account_number),dva_bank_name:dva.bank&&dva.bank.name||'',dva_account_name:dva.account_name||''},{Prefer:'return=minimal'});
 return await customer(c.id);
}
async function customer(id){const a=await db('customers?id=eq.'+encodeURIComponent(id)+'&select=id,account_id,full_name,email,phone,referral_code,dva_account_number,dva_bank_name,dva_account_name,withdrawal_bank_name,withdrawal_account_number,withdrawal_account_name,created_at');return a&&a[0];}
function safeCustomer(c){return {id:c.id,account_id:c.account_id,full_name:c.full_name,email:c.email,phone:c.phone,referral_code:c.referral_code,referral_link:APP_URL+'/?ref='+encodeURIComponent(c.referral_code),dva:c.dva_account_number?{account_number:c.dva_account_number,bank_name:c.dva_bank_name,account_name:c.dva_account_name}:null,withdrawal:{bank_name:c.withdrawal_bank_name||'',account_number:c.withdrawal_account_number||'',account_name:c.withdrawal_account_name||''},created_at:c.created_at};}
async function dashboard(id){
 const c=await customer(id);if(!c)throw Error('Customer not found.');
 const [ds,ws,ls,ts,subs,comps]=await Promise.all([
 db('deposits?customer_id=eq.'+id+'&select=id,amount_kobo,status,provider_reference,created_at&order=created_at.desc&limit=20'),
 db('withdrawals?customer_id=eq.'+id+'&select=id,amount_kobo,status,bank_name,account_number,account_name,created_at&order=created_at.desc&limit=20'),
 db('wallet_ledger?customer_id=eq.'+id+'&select=amount_kobo'),
 db('tasks?is_active=eq.true&select=id,title,description,reward_kobo&order=id.asc'),
 db('plan_subscriptions?customer_id=eq.'+id+'&status=eq.active&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id,plan_code,amount_kobo,started_at,expires_at&order=expires_at.desc&limit=1'),
 db('task_completions?customer_id=eq.'+id+'&select=id,task_id,status,proof,reward_kobo,work_date,created_at&order=created_at.desc&limit=50')
 ]);
 const bal=(ls||[]).reduce((n,x)=>n+Number(x.amount_kobo),0);
 const sub=subs&&subs[0]||null;
 const plan=sub?await db('plans?plan_code=eq.'+encodeURIComponent(sub.plan_code)+'&select=plan_code,name,tasks_per_day,reward_per_task_kobo&limit=1'):null;
 return {customer:safeCustomer(c),balance:money(bal),balance_kobo:bal,referral_reward:1000,deposits:(ds||[]).map(x=>({...x,amount:money(x.amount_kobo)})),withdrawals:(ws||[]).map(x=>({...x,amount:money(x.amount_kobo)})),tasks:(ts||[]).map(x=>({...x,reward:money(x.reward_kobo)})),subscription:sub?{...sub,plan:plan&&plan[0]||null}:null,task_completions:comps||[],funding_enabled:PAY_ON&&!!c.dva_account_number};
}
app.post('/api/plans/activate',dbReady,auth,writes,async(q,s)=>{try{const code=String(q.body.planCode||'');if(!/^[a-z0-9][a-z0-9-]{1,39}$/.test(code))return s.status(400).json({error:'Choose a valid plan.'});const result=await db('rpc/activate_customer_plan','POST',{p_customer_id:q.session.customerId,p_plan_code:code});s.status(201).json({ok:true,subscription:result,message:'Your plan is active for 31 days.'})}catch(e){const m=e.message||'';if(/Insufficient wallet balance/i.test(m))return s.status(400).json({error:'Your wallet balance is not enough. Fund your wallet first.'});if(/already have an active plan/i.test(m))return s.status(409).json({error:m});if(/not available/i.test(m))return s.status(404).json({error:m});console.error('Plan activation:',m);s.status(500).json({error:'Could not activate this plan.'})}});
app.post('/api/tasks/:id/submit',dbReady,auth,writes,async(q,s)=>{try{const id=Number(q.params.id),proof=String(q.body.proof||'');if(!Number.isSafeInteger(id)||id<1)return s.status(400).json({error:'Invalid task.'});const result=await db('rpc/submit_customer_task','POST',{p_customer_id:q.session.customerId,p_task_id:id,p_proof:proof});s.status(201).json({ok:true,submission:result,message:'Task submitted for admin review.'})}catch(e){const m=e.message||'';if(/Activate a plan|daily task limit|already submitted|proof|not available/i.test(m))return s.status(400).json({error:m});console.error('Task submission:',m);s.status(500).json({error:'Could not submit this task.'})}});
app.get('/api/plans',dbReady,async(q,s)=>{try{const rows=await db('plans?is_active=eq.true&select=plan_code,name,amount_kobo,description,sort_order,tasks_per_day,reward_per_task_kobo&order=sort_order.asc');s.json({plans:rows||[]})}catch(e){console.error('Public plans:',e.message);s.status(500).json({error:'Could not load plans.'})}});
app.get('/api/health',async(q,s)=>{if(!ready)return s.json({ok:true,service:'ten-term',database:'not_configured',payments_enabled:false});try{await db('customers?select=id&limit=1');s.json({ok:true,service:'ten-term',database:'connected',payments_enabled:PAY_ON})}catch(e){s.status(503).json({ok:false,database:'unavailable'})}});
app.post('/api/register',dbReady,limiter,async(q,s)=>{
 try{
 const full=String(q.body.fullName||'').trim(),email=String(q.body.email||'').trim().toLowerCase(),pass=String(q.body.password||''),tel=phone(q.body.phone);
 if(full.length<2||full.length>80)return s.status(400).json({error:'Enter your full name.'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return s.status(400).json({error:'Enter a valid email address.'});
 if(!/^\+234\d{10}$/.test(tel))return s.status(400).json({error:'Enter a valid Nigerian phone number.'});
 if(pass.length<10)return s.status(400).json({error:'Password must contain at least 10 characters.'});
 const hash=await bcrypt.hash(pass,12),rows=await db('customers','POST',{account_id:randomId(),full_name:full,email,phone:tel,password_hash:hash,referral_code:refCode(),referred_by:String(q.body.ref||'').trim().toUpperCase()||null},{Prefer:'return=representation'});
 const c=rows&&rows[0];if(!c)return s.status(409).json({error:'Could not create this account. The email may already be registered.'});
 await new Promise((ok,no)=>q.session.regenerate(e=>e?no(e):ok()));q.session.customerId=c.id;
 const status='consent_required';
 s.status(201).json({customer:safeCustomer(await customer(c.id)),paystack_status:status});
 }catch(e){console.error('Registration:',e.message);s.status(e.message&&e.message.includes('duplicate')?409:500).json({error:e.message&&e.message.includes('duplicate')?'This email is already registered.':'Registration could not be completed.'})}
});
app.post('/api/login',dbReady,limiter,async(q,s)=>{try{const a=await db('customers?email=eq.'+encodeURIComponent(String(q.body.email||'').trim().toLowerCase())+'&select=id,password_hash&limit=1'),c=a&&a[0];if(!c||!(await bcrypt.compare(String(q.body.password||''),c.password_hash)))return s.status(401).json({error:'Email or password is incorrect.'});await new Promise((ok,no)=>q.session.regenerate(e=>e?no(e):ok()));q.session.customerId=c.id;s.json({ok:true})}catch(e){console.error('Login:',e.message);s.status(500).json({error:'Login could not be completed.'})}});
app.post('/api/logout',(q,s)=>q.session.destroy(e=>{if(e)return s.status(500).json({error:'Could not log out.'});s.clearCookie('ten_term.sid');s.json({ok:true})}));
app.get('/api/me',dbReady,auth,async(q,s)=>{try{s.json(await dashboard(q.session.customerId))}catch(e){console.error('Dashboard:',e.message);s.status(500).json({error:'Could not load your dashboard.'})}});
app.post('/api/funding-account/create',dbReady,auth,writes,async(q,s)=>{
 try{
  if(q.body.consent!==true)return s.status(400).json({error:'Please confirm consent before requesting a funding account.'});
  const c=await customer(q.session.customerId);if(!c)return s.status(404).json({error:'Customer not found.'});
  if(c.dva_account_number)return s.json({ok:true,customer:safeCustomer(c),message:'Your funding account is already active.'});
  const updated=await provisionDva(c);
  s.json({ok:true,customer:safeCustomer(updated),message:'Your funding account has been created.'});
 }catch(e){console.error('Funding account provisioning:',e.message);s.status(502).json({error:e.message||'Could not create your funding account. Please try again later.'})}
});
app.post('/api/profile/withdrawal',dbReady,auth,writes,async(q,s)=>{const bank=String(q.body.bankName||'').trim(),num=String(q.body.accountNumber||'').replace(/\D/g,''),name=String(q.body.accountName||'').trim();if(!bank||!/^\d{10}$/.test(num)||name.length<2)return s.status(400).json({error:'Enter valid bank details.'});try{await db('customers?id=eq.'+q.session.customerId,'PATCH',{withdrawal_bank_name:bank,withdrawal_account_number:num,withdrawal_account_name:name},{Prefer:'return=minimal'});s.json({ok:true,message:'Bank details saved securely.'})}catch(e){s.status(500).json({error:'Could not save bank details.'})}});
app.post('/api/withdrawals',dbReady,auth,writes,async(q,s)=>{try{const amount=Number(q.body.amount),bank=String(q.body.bankName||''),num=String(q.body.accountNumber||'').replace(/\D/g,''),name=String(q.body.accountName||'');if(!Number.isSafeInteger(Math.round(amount*100))||amount<1000)return s.status(400).json({error:'Minimum withdrawal request is ₦1,000.'});const r=await db('rpc/request_withdrawal','POST',{p_customer_id:q.session.customerId,p_amount_kobo:Math.round(amount*100),p_bank_name:bank,p_account_number:num,p_account_name:name});s.status(201).json({ok:true,message:'Withdrawal request submitted. The amount is reserved from your wallet.',withdrawal:r})}catch(e){const m=e.message||'';if(/insufficient wallet balance/i.test(m))return s.status(400).json({error:'Your wallet balance is not enough.'});if(/pending withdrawal/i.test(m))return s.status(409).json({error:'You already have a pending withdrawal this month.'});if(/invalid withdrawal/i.test(m))return s.status(400).json({error:'Check your bank details and withdrawal amount.'});console.error('Withdrawal:',m);s.status(500).json({error:'Could not submit withdrawal request.'})}});
async function webhook(q,s){
 try{
 if(!PAY_ON||!PAY_KEY)return s.status(503).send('Payments disabled');
 const raw=q.body,sig=q.get('x-paystack-signature');if(!Buffer.isBuffer(raw)||!sig)return s.status(401).send('Unauthorized');
 const expected=crypto.createHmac('sha512',PAY_KEY).update(raw).digest('hex'),a=Buffer.from(expected),b=Buffer.from(sig);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return s.status(401).send('Invalid signature');
 const event=JSON.parse(raw.toString('utf8')),d=event.data||{},key=(event.event||'unknown')+':'+(d.id||d.reference||crypto.createHash('sha256').update(raw).digest('hex'));
 const old=await db('webhook_events?event_key=eq.'+encodeURIComponent(key)+'&select=id,processed_at&limit=1');if(old&&old[0]&&old[0].processed_at)return s.send('OK');
 if(!old||!old[0])await db('webhook_events','POST',{event_key:key,event_type:String(event.event||'unknown'),payload:event},{Prefer:'return=minimal'});
 if(event.event==='charge.success'){
 if(String(d.status||'').toLowerCase()!=='success'||String(d.currency||'NGN').toUpperCase()!=='NGN'||!Number.isSafeInteger(Number(d.amount))||Number(d.amount)<=0)return s.status(400).send('Invalid charge');
 const code=d.customer&&d.customer.customer_code,acct=d.authorization&&d.authorization.receiver_bank_account_number||d.dedicated_account&&d.dedicated_account.account_number;let cs=[];
 if(code)cs=await db('customers?paystack_customer_code=eq.'+encodeURIComponent(code)+'&select=id&limit=1');
 if((!cs||!cs[0])&&acct)cs=await db('customers?dva_account_number=eq.'+encodeURIComponent(acct)+'&select=id&limit=1');
 if(cs&&cs[0])await db('rpc/record_verified_deposit','POST',{p_customer_id:cs[0].id,p_amount_kobo:Number(d.amount),p_reference:String(d.reference||d.id),p_payload:d});
 else console.warn('Verified Paystack charge not matched to a customer.');
 }
 await db('webhook_events?event_key=eq.'+encodeURIComponent(key),'PATCH',{processed_at:new Date().toISOString()},{Prefer:'return=minimal'});s.send('OK');
 }catch(e){console.error('Paystack webhook:',e.message);s.status(500).send('Webhook processing failed')}
}
app.get('/admin',(q,s)=>s.sendFile(path.join(__dirname,'public','admin.html')));
app.post('/api/admin/login',dbReady,limiter,async(q,s)=>{try{const email=String(q.body.email||'').trim().toLowerCase();if(!ADMIN||!ADMIN_HASH)return s.status(503).json({error:'Admin access is not configured.'});if(email!==ADMIN||!(await bcrypt.compare(String(q.body.password||''),ADMIN_HASH)))return s.status(401).json({error:'Admin email or password is incorrect.'});await new Promise((ok,no)=>q.session.regenerate(e=>e?no(e):ok()));q.session.adminAuthenticated=true;q.session.adminEmail=ADMIN;s.json({ok:true})}catch(e){s.status(500).json({error:'Admin login failed.'})}});
app.get('/api/admin/overview',dbReady,admin,async(q,s)=>{try{
 const [cs,ws,ds,ls]=await Promise.all([db('customers?select=id,account_id,full_name,email,phone,created_at,dva_bank_name,dva_account_number&order=created_at.desc&limit=250'),db('withdrawals?select=id,customer_id,amount_kobo,bank_name,account_number,account_name,status,created_at,customers(full_name,account_id,email)&order=created_at.desc&limit=250'),db('deposits?select=id,amount_kobo,status&limit=10000'),db('wallet_ledger?select=customer_id,amount_kobo&limit=10000')]);
 const bal={};(ls||[]).forEach(x=>bal[x.customer_id]=(bal[x.customer_id]||0)+Number(x.amount_kobo));const good=(ds||[]).filter(x=>x.status==='successful'),total=good.reduce((n,x)=>n+Number(x.amount_kobo),0);
 s.json({customers:(cs||[]).map(c=>({...c,wallet_balance:money(bal[c.id]||0)})),withdrawals:(ws||[]).map(w=>({...w,...(w.customers||{}),amount:money(w.amount_kobo)})),stats:{customers:(cs||[]).length,deposits:good.length,deposit_total:money(total),pending_withdrawals:(ws||[]).filter(x=>x.status==='pending').length}});
 }catch(e){console.error('Admin overview:',e.message);s.status(500).json({error:'Could not load admin overview.'})}});
app.get('/api/admin/plans',dbReady,admin,async(q,s)=>{try{const rows=await db('plans?select=plan_code,name,amount_kobo,description,is_active,sort_order,updated_at,tasks_per_day,reward_per_task_kobo&order=sort_order.asc');s.json({plans:rows||[]})}catch(e){console.error('Admin plans:',e.message);s.status(500).json({error:'Could not load plans.'})}});
app.post('/api/admin/plans',dbReady,admin,writes,async(q,s)=>{try{const name=String(q.body.name||'').trim(),description=String(q.body.description||'').trim(),amount=Number(q.body.amount_naira),code=String(q.body.plan_code||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).slice(0,40);if(!/^[a-z0-9][a-z0-9-]{1,39}$/.test(code)||name.length<2||name.length>60||description.length>300||!Number.isFinite(amount)||amount<=0||amount>10000000)return s.status(400).json({error:'Enter a valid plan name and amount.'});const rows=await db('plans','POST',{plan_code:code,name,description,amount_kobo:Math.round(amount*100),is_active:q.body.is_active!==false,sort_order:Number.isInteger(Number(q.body.sort_order))?Number(q.body.sort_order):100},{Prefer:'return=representation'});s.status(201).json({plan:rows&&rows[0]})}catch(e){console.error('Create plan:',e.message);s.status(400).json({error:'Could not create plan. Check that its plan code is unique.'})}});
app.patch('/api/admin/plans/:code',dbReady,admin,writes,async(q,s)=>{try{const code=String(q.params.code||'');if(!/^[a-z0-9][a-z0-9-]{1,39}$/.test(code))return s.status(400).json({error:'Invalid plan.'});const patch={updated_at:new Date().toISOString()};if(typeof q.body.is_active==='boolean')patch.is_active=q.body.is_active;if(q.body.name!==undefined){const v=String(q.body.name).trim();if(v.length<2||v.length>60)return s.status(400).json({error:'Plan name must be 2–60 characters.'});patch.name=v}if(q.body.description!==undefined){const v=String(q.body.description).trim();if(v.length>300)return s.status(400).json({error:'Plan description is too long.'});patch.description=v}if(q.body.amount_naira!==undefined){const v=Number(q.body.amount_naira);if(!Number.isFinite(v)||v<=0||v>10000000)return s.status(400).json({error:'Plan amount must be greater than ₦0.'});patch.amount_kobo=Math.round(v*100)}if(q.body.sort_order!==undefined){const v=Number(q.body.sort_order);if(!Number.isInteger(v)||v<0||v>10000)return s.status(400).json({error:'Invalid display order.'});patch.sort_order=v}if(q.body.tasks_per_day!==undefined){const v=Number(q.body.tasks_per_day);if(!Number.isInteger(v)||v<1||v>20)return s.status(400).json({error:'Tasks per day must be 1–20.'});patch.tasks_per_day=v}if(q.body.reward_per_task_naira!==undefined){const v=Number(q.body.reward_per_task_naira);if(!Number.isFinite(v)||v<0||v>1000000)return s.status(400).json({error:'Enter a valid reward per task.'});patch.reward_per_task_kobo=Math.round(v*100)}if(Object.keys(patch).length===1)return s.status(400).json({error:'No plan changes supplied.'});const rows=await db('plans?plan_code=eq.'+encodeURIComponent(code),'PATCH',patch,{Prefer:'return=representation'});if(!rows||!rows.length)return s.status(404).json({error:'Plan not found.'});s.json({plan:rows[0]})}catch(e){console.error('Update plan:',e.message);s.status(400).json({error:'Could not update plan.'})}});
app.get('/api/admin/tasks',dbReady,admin,async(q,s)=>{try{const rows=await db('tasks?select=id,title,description,reward_kobo,is_active,created_at,updated_at&order=id.asc');s.json({tasks:rows||[]})}catch(e){console.error('Admin tasks:',e.message);s.status(500).json({error:'Could not load tasks.'})}});
app.post('/api/admin/tasks',dbReady,admin,writes,async(q,s)=>{try{const title=String(q.body.title||'').trim(),description=String(q.body.description||'').trim(),reward=Number(q.body.reward_naira);if(title.length<3||title.length>100||description.length>1000||!Number.isFinite(reward)||reward<0||reward>1000000)return s.status(400).json({error:'Enter a title, description and a reward from ₦0 to ₦1,000,000.'});const rows=await db('tasks','POST',{title,description,reward_kobo:Math.round(reward*100),is_active:q.body.is_active!==false},{Prefer:'return=representation'});s.status(201).json({task:rows&&rows[0]})}catch(e){console.error('Create task:',e.message);s.status(400).json({error:'Could not create task.'})}});
app.patch('/api/admin/tasks/:id',dbReady,admin,writes,async(q,s)=>{try{const id=Number(q.params.id);if(!Number.isSafeInteger(id)||id<1)return s.status(400).json({error:'Invalid task.'});const patch={};if(typeof q.body.is_active==='boolean')patch.is_active=q.body.is_active;if(q.body.title!==undefined){const v=String(q.body.title).trim();if(v.length<3||v.length>100)return s.status(400).json({error:'Task title must be 3–100 characters.'});patch.title=v}if(q.body.description!==undefined){const v=String(q.body.description).trim();if(v.length>1000)return s.status(400).json({error:'Description is too long.'});patch.description=v}if(q.body.reward_naira!==undefined){const v=Number(q.body.reward_naira);if(!Number.isFinite(v)||v<0||v>1000000)return s.status(400).json({error:'Reward must be between ₦0 and ₦1,000,000.'});patch.reward_kobo=Math.round(v*100)}if(!Object.keys(patch).length)return s.status(400).json({error:'No task changes supplied.'});const rows=await db('tasks?id=eq.'+id,'PATCH',patch,{Prefer:'return=representation'});if(!rows||!rows.length)return s.status(404).json({error:'Task not found.'});s.json({task:rows[0]})}catch(e){console.error('Update task:',e.message);s.status(400).json({error:'Could not update task.'})}});
app.get('/api/admin/task-submissions',dbReady,admin,async(q,s)=>{try{const rows=await db('task_completions?select=id,customer_id,task_id,status,proof,reward_kobo,plan_code,work_date,created_at,reviewed_by,reviewed_at&order=created_at.desc&limit=300');const ids=[...new Set((rows||[]).map(x=>x.customer_id))],tids=[...new Set((rows||[]).map(x=>x.task_id))];const [cs,ts]=await Promise.all([ids.length?db('customers?id=in.('+ids.join(',')+')&select=id,full_name,account_id,email'):[],tids.length?db('tasks?id=in.('+tids.join(',')+')&select=id,title'):[]]);const cm=new Map((cs||[]).map(x=>[x.id,x])),tm=new Map((ts||[]).map(x=>[x.id,x]));s.json({submissions:(rows||[]).map(x=>({...x,customer:cm.get(x.customer_id)||{},task:tm.get(x.task_id)||{}}))})}catch(e){console.error('Task submissions:',e.message);s.status(500).json({error:'Could not load task submissions.'})}});
app.post('/api/admin/task-submissions/:id/review',dbReady,admin,writes,async(q,s)=>{try{const id=Number(q.params.id),status=String(q.body.status||''),note=String(q.body.note||'').slice(0,500);if(!Number.isSafeInteger(id)||id<1||!['approved_pending_funding','rejected'].includes(status))return s.status(400).json({error:'Invalid review action.'});const result=await db('rpc/review_customer_task','POST',{p_completion_id:id,p_status:status,p_admin_email:q.session.adminEmail,p_note:note});s.json({ok:true,result,message:status==='rejected'?'Submission rejected.':'Task approved, but reward is pending verified programme funding.'})}catch(e){console.error('Task review:',e.message);s.status(400).json({error:'Could not review this submission. It may already have been reviewed.'})}});
app.post('/api/admin/withdrawals/:id/status',dbReady,admin,writes,async(q,s)=>{try{const id=Number(q.params.id),status=String(q.body.status||'');if(!Number.isSafeInteger(id)||id<1||!['paid','rejected'].includes(status))return s.status(400).json({error:'Invalid withdrawal update.'});await db('rpc/review_withdrawal','POST',{p_withdrawal_id:id,p_status:status,p_admin_email:q.session.adminEmail,p_note:String(q.body.note||'').slice(0,500)||null});s.json({ok:true})}catch(e){console.error('Review withdrawal:',e.message);s.status(400).json({error:/pending withdrawal/i.test(e.message)?'Pending withdrawal not found.':'Could not update withdrawal.'})}});
app.post('/api/admin/logout',admin,(q,s)=>q.session.destroy(e=>{if(e)return s.status(500).json({error:'Could not log out.'});s.clearCookie('ten_term.sid');s.json({ok:true})}));
app.get('*',(q,s)=>s.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('Ten Term listening on '+PORT+'; database '+(ready?'configured':'not configured')+'; Paystack '+(PAY_ON?'enabled':'disabled')));
