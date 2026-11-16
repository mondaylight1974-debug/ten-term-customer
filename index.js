require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(process.env.DB_PATH || path.join(__dirname, "..", "data", "ten-term.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 account_id TEXT UNIQUE NOT NULL,
 full_name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 phone TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 paystack_customer_code TEXT,
 dva_account_number TEXT,
 dva_bank_name TEXT,
 dva_account_name TEXT,
 withdrawal_bank_name TEXT,
 withdrawal_account_number TEXT,
 withdrawal_account_name TEXT,
 referral_code TEXT UNIQUE,
 referred_by TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS deposits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER NOT NULL,
 amount_kobo INTEGER NOT NULL,
 provider_reference TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS withdrawals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER NOT NULL,
 amount_kobo INTEGER NOT NULL,
 bank_name TEXT NOT NULL,
 account_number TEXT NOT NULL,
 account_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS webhook_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_key TEXT UNIQUE NOT NULL,
 event TEXT NOT NULL,
 received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
function addColumn(sql){try{db.exec(sql)}catch(e){if(!String(e.message).includes("duplicate column")) throw e}}
addColumn("ALTER TABLE customers ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
addColumn("ALTER TABLE customers ADD COLUMN paystack_customer_code TEXT");
addColumn("ALTER TABLE customers ADD COLUMN dva_account_number TEXT");
addColumn("ALTER TABLE customers ADD COLUMN dva_bank_name TEXT");
addColumn("ALTER TABLE customers ADD COLUMN dva_account_name TEXT");
addColumn("ALTER TABLE customers ADD COLUMN withdrawal_bank_name TEXT");
addColumn("ALTER TABLE customers ADD COLUMN withdrawal_account_number TEXT");
addColumn("ALTER TABLE customers ADD COLUMN withdrawal_account_name TEXT");
addColumn("ALTER TABLE customers ADD COLUMN referral_code TEXT");
addColumn("ALTER TABLE customers ADD COLUMN referred_by TEXT");

const insertCustomer = db.prepare(`INSERT INTO customers (account_id, full_name, email, phone, password_hash, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const findByEmail = db.prepare("SELECT * FROM customers WHERE email = ?");
const findById = db.prepare("SELECT * FROM customers WHERE id = ?");
const money = n => (n / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 });
const PLAN_AMOUNTS = [1500,2500,3500,10000,15000,3500];
const REFERRAL_REWARD_KOBO = 1000 * 100;

app.use(helmet({ contentSecurityPolicy: false }));
app.post("/api/paystack/webhook", express.raw({ type: "application/json", limit: "200kb" }), handlePaystackWebhook);
app.use(express.json({ limit: "30kb" }));
app.use(session({
 name: "ten_term_customer",
 secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
 resave:false, saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV === "production",maxAge:1000*60*60*8}
}));
app.use(express.static(path.join(__dirname,"..","public")));

function requireAuth(req,res,next){if(!req.session.customerId)return res.status(401).json({error:"Please log in to continue."});next()}
function newAccountId(){for(let i=0;i<12;i++){const id="TT-"+crypto.randomInt(10000000,99999999);if(!db.prepare("SELECT 1 FROM customers WHERE account_id=?").get(id))return id}throw new Error("Could not allocate a unique account ID.")}
function referralCode(){for(let i=0;i<12;i++){const c="TTREF-"+crypto.randomBytes(4).toString("hex").toUpperCase();if(!db.prepare("SELECT 1 FROM customers WHERE referral_code=?").get(c))return c}throw new Error("Could not allocate referral code.")}
function splitName(full){const p=full.trim().split(/\s+/);return {firstName:p[0],lastName:p.slice(1).join(" ")||p[0]}}
function normalizePhone(p){let x=String(p||"").replace(/[^0-9+]/g,"");if(/^0\d{10}$/.test(x))x="+234"+x.slice(1);if(/^234\d{10}$/.test(x))x="+"+x;return x}
async function paystack(pathname,options={}){
 const key=process.env.PAYSTACK_SECRET_KEY;
 if(!key)throw new Error("PAYSTACK_SECRET_KEY is not configured on the server.");
 const r=await fetch("https://api.paystack.co"+pathname,{...options,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",...(options.headers||{})}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok || data.status===false) throw new Error(data.message||`Paystack request failed (${r.status}).`);
 return data;
}
async function createPaystackCustomer(c){
 const {firstName,lastName}=splitName(c.full_name);
 const data=await paystack("/customer",{method:"POST",body:JSON.stringify({email:c.email,first_name:firstName,last_name:lastName,phone:c.phone,metadata:{ten_term_id:c.account_id}})});
 return data.data;
}
async function assignDva(c){
 const customerCode=c.paystack_customer_code;
 const preferred=process.env.PAYSTACK_PREFERRED_BANK || "titan-paystack";
 return paystack("/dedicated_account",{method:"POST",body:JSON.stringify({customer:customerCode,preferred_bank:preferred,first_name:splitName(c.full_name).firstName,last_name:splitName(c.full_name).lastName,phone:c.phone})});
}
function publicCustomer(c){return {id:c.id,account_id:c.account_id,full_name:c.full_name,email:c.email,phone:c.phone,referral_code:c.referral_code,referral_link:`${process.env.PUBLIC_APP_URL||""}/?ref=${encodeURIComponent(c.referral_code)}`,dva:c.dva_account_number?{account_number:c.dva_account_number,bank_name:c.dva_bank_name,account_name:c.dva_account_name}:null,withdrawal:{bank_name:c.withdrawal_bank_name||"",account_number:c.withdrawal_account_number||"",account_name:c.withdrawal_account_name||""},created_at:c.created_at}}
function dashboard(){const c=findById.get(this.customerId);const deposits=db.prepare("SELECT id,amount_kobo,status,provider_reference,created_at FROM deposits WHERE customer_id=? ORDER BY id DESC LIMIT 20").all(c.id);const withdrawals=db.prepare("SELECT id,amount_kobo,status,bank_name,account_number,account_name,created_at FROM withdrawals WHERE customer_id=? ORDER BY id DESC LIMIT 20").all(c.id);return {customer:publicCustomer(c),plans:PLAN_AMOUNTS.map((amount,i)=>({id:i+1,amount, label:`Plan ${i+1}`})),referral_reward:1000,deposits:deposits.map(d=>({...d,amount:money(d.amount_kobo)})),withdrawals:withdrawals.map(w=>({...w,amount:money(w.amount_kobo)}))}}
app.get("/api/health",(req,res)=>res.json({ok:true,service:"ten-term-customer",payment_provider:"paystack"}));
app.post("/api/register",async(req,res)=>{try{const fullName=String(req.body.fullName||"").trim();const email=String(req.body.email||"").trim().toLowerCase();const password=String(req.body.password||"");const phone=normalizePhone(req.body.phone);const referredBy=String(req.body.ref||req.body.referredBy||"").trim();if(fullName.length<2||fullName.length>80)return res.status(400).json({error:"Enter your full name."});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});if(!/^\+234\d{10}$/.test(phone))return res.status(400).json({error:"Enter a valid Nigerian phone number."});if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});if(findByEmail.get(email))return res.status(409).json({error:"An account with this email already exists."});const accountId=newAccountId();const hash=await bcrypt.hash(password,12);const result=insertCustomer.run(accountId,fullName,email,phone,hash,referralCode(),referredBy||null);req.session.customerId=Number(result.lastInsertRowid);const c=findById.get(req.session.customerId);try{const pc=await createPaystackCustomer(c);db.prepare("UPDATE customers SET paystack_customer_code=? WHERE id=?").run(pc.customer_code,c.id);const updated=findById.get(c.id);const dva=await assignDva(updated);if(dva.data?.account_number){db.prepare("UPDATE customers SET dva_account_number=?,dva_bank_name=?,dva_account_name=? WHERE id=?").run(dva.data.account_number,dva.data.bank?.name||"",dva.data.account_name||"",c.id)}}catch(e){console.error("Paystack provisioning:",e.message)}res.json({customer:publicCustomer(findById.get(c.id)),paystack_status:findById.get(c.id).dva_account_number?"ready":"pending"})}catch(e){console.error(e);res.status(500).json({error:"Registration could not be completed. Please try again."})}});
app.post("/api/login",async(req,res)=>{const email=String(req.body.email||"").trim().toLowerCase();const password=String(req.body.password||"");const c=findByEmail.get(email);if(!c||!(await bcrypt.compare(password,c.password_hash)))return res.status(401).json({error:"Email or password is incorrect."});req.session.customerId=c.id;res.json({customer:publicCustomer(c)})});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",requireAuth,(req,res)=>{try{res.json(dashboard.call({customerId:req.session.customerId}))}catch(e){console.error(e);res.status(500).json({error:"Could not load your dashboard."})}});
app.post("/api/profile/withdrawal",requireAuth,(req,res)=>{const bank=String(req.body.bankName||"").trim();const number=String(req.body.accountNumber||"").replace(/\D/g,"");const name=String(req.body.accountName||"").trim();if(!bank||!/^[0-9]{10}$/.test(number)||name.length<2)return res.status(400).json({error:"Enter a valid bank name, 10-digit account number and account name."});db.prepare("UPDATE customers SET withdrawal_bank_name=?,withdrawal_account_number=?,withdrawal_account_name=? WHERE id=?").run(bank,number,name,req.session.customerId);res.json({ok:true,message:"Withdrawal account saved securely."})});
app.post("/api/withdrawals",requireAuth,(req,res)=>{const amount=Number(req.body.amount);const bank=String(req.body.bankName||"").trim();const number=String(req.body.accountNumber||"").replace(/\D/g,"");const name=String(req.body.accountName||"").trim();if(!Number.isFinite(amount)||amount<1000)return res.status(400).json({error:"Minimum withdrawal request is ₦1,000."});if(!bank||!/^[0-9]{10}$/.test(number)||name.length<2)return res.status(400).json({error:"Save valid withdrawal bank details first."});const month=new Date().getMonth();const year=new Date().getFullYear();const count=db.prepare("SELECT COUNT(*) c FROM withdrawals WHERE customer_id=? AND status='pending' AND strftime('%m',created_at)=? AND strftime('%Y',created_at)=?").get(req.session.customerId,String(month+1).padStart(2,"0"),String(year)).c;if(count>0)return res.status(409).json({error:"You already have a pending withdrawal this month."});db.prepare("INSERT INTO withdrawals(customer_id,amount_kobo,bank_name,account_number,account_name,status) VALUES(?,?,?,?,?,'pending')").run(req.session.customerId,Math.round(amount*100),bank,number,name);res.json({ok:true,message:"Withdrawal request submitted for admin review. Payments are made manually by Ten Term."})});
app.get("/api/transactions",requireAuth,(req,res)=>{const rows=db.prepare("SELECT id,amount_kobo,status,created_at FROM deposits WHERE customer_id=? ORDER BY id DESC").all(req.session.customerId);res.json(rows.map(r=>({...r,amount:money(r.amount_kobo)})))});
async function handlePaystackWebhook(req,res){const raw=req.body;const signature=req.headers["x-paystack-signature"];const secret=process.env.PAYSTACK_SECRET_KEY;if(!secret||!signature)return res.status(401).send("Unauthorized");const hash=crypto.createHmac("sha512",secret).update(raw).digest("hex");if(!crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(String(signature))))return res.status(401).send("Invalid signature");let event;try{event=JSON.parse(raw.toString("utf8"))}catch{return res.status(400).send("Bad JSON")};const eventKey=String(event.data?.id||event.data?.reference||crypto.createHash("sha256").update(raw).digest("hex"));if(db.prepare("SELECT 1 FROM webhook_events WHERE event_key=?").get(eventKey))return res.status(200).send("OK");db.prepare("INSERT INTO webhook_events(event_key,event) VALUES(?,?)").run(eventKey,event.event||"unknown");if(event.event==="charge.success"){const d=event.data||{};const email=d.customer?.email||d.metadata?.email;const accountNumber=d.authorization?.receiver_bank_account_number||d.dedicated_account?.account_number||d.metadata?.account_number;const c=email?findByEmail.get(String(email).toLowerCase()):accountNumber?db.prepare("SELECT * FROM customers WHERE dva_account_number=?").get(accountNumber):null;if(c){const reference=String(d.reference||d.id||eventKey);const existing=db.prepare("SELECT id FROM deposits WHERE provider_reference=?").get(reference);if(!existing){db.prepare("INSERT INTO deposits(customer_id,amount_kobo,provider_reference,status) VALUES(?,?,?,'successful')").run(c.id,Number(d.amount||0),reference)}}}return res.status(200).send("OK")}
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"..","public","index.html")));
app.listen(PORT,()=>console.log(`Ten Term customer portal listening on ${PORT}`));
