import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { encryptSecret } from './crypto.js';
import { logActivity } from './log.js';
import { testRouter, listPppSecrets, listPppProfiles, listActivePppSessions, setCustomerProfile, getKvIsolirStatus, configureKvIsolirProfile } from './mikrotik.js';
import { generateMonthlyInvoices, processIsolation, recordPayment } from './billing.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, service: 'billing-rt-rwnet-api', timezone: process.env.APP_TIMEZONE || 'Asia/Jakarta' });
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [[customers]] = await pool.query("SELECT COUNT(*) total, SUM(customer_status='active') active, SUM(isolation_status='isolated') isolated FROM customers");
  const [[invoices]] = await pool.query("SELECT COUNT(*) total, SUM(status IN ('unpaid','partial')) unpaid_count, COALESCE(SUM(CASE WHEN status IN ('unpaid','partial') THEN amount-paid_amount ELSE 0 END),0) outstanding FROM invoices WHERE status <> 'void'");
  const [[payments]] = await pool.query("SELECT COALESCE(SUM(amount),0) today_total FROM payments WHERE DATE(paid_at)=CURDATE()");
  res.json({ customers, invoices, payments });
}));

// Hitung terisolir berdasarkan profile Secret yang dibaca langsung dari MikroTik.
app.get('/api/dashboard/isolation-status', asyncRoute(async (_req, res) => {
  res.json(await getKvIsolirStatus());
}));

app.get('/api/customers', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`SELECT c.*, p.name package_name, p.price package_price, r.name router_name, r.host router_host, p.router_id package_router_id
    FROM customers c LEFT JOIN packages p ON p.id=c.package_id LEFT JOIN routers r ON r.id=c.router_id ORDER BY c.id DESC`);
  res.json(rows);
}));

// Status pelanggan dicek dari router online dan sesi PPP aktif. Router/API gagal atau sesi tidak aktif ditampilkan Offline.
app.get('/api/customers/status', asyncRoute(async (_req, res) => {
  const [routers] = await pool.query('SELECT id, name FROM routers WHERE enabled=1 ORDER BY id');
  const [customers] = await pool.query(`SELECT id, router_id, pppoe_username FROM customers WHERE router_id IS NOT NULL AND pppoe_username IS NOT NULL AND pppoe_username <> ''`);
  const statuses = {};
  for (const customer of customers) statuses[customer.id] = { status: 'offline', ip: null, router_status: 'offline' };
  for (const router of routers) {
    try {
      const active = await listActivePppSessions(router.id);
      const byName = new Map(active.map(session => [session.name, session]));
      for (const customer of customers) {
        if (Number(customer.router_id) !== Number(router.id)) continue;
        const session = byName.get(customer.pppoe_username);
        statuses[customer.id] = { status: session ? 'online' : 'offline', ip: session?.address || null, router_status: 'online', router_name: router.name };
      }
    } catch (error) {
      await pool.execute("UPDATE routers SET last_status='offline', last_checked_at=NOW() WHERE id=?", [router.id]).catch(() => {});
      for (const customer of customers) if (Number(customer.router_id) === Number(router.id)) statuses[customer.id] = { status: 'offline', ip: null, router_status: 'offline', router_name: router.name };
    }
  }
  res.json({ checkedAt: new Date().toISOString(), statuses });
}));
app.post('/api/customers', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.customer_code || !b.name) return res.status(400).json({ error: 'Kode pelanggan dan nama wajib diisi' });
  const serviceType=b.service_type||'internet';
  if(serviceType==='tv_cable' && (b.router_id || b.pppoe_username)) return res.status(400).json({error:'Pelanggan TV kabel tidak memerlukan router atau username PPPoE'});
  if(serviceType!=='tv_cable' && (!b.router_id || !b.pppoe_username)) return res.status(400).json({error:'Pelanggan internet/bundle wajib memilih router dan username PPPoE'});
  if(serviceType!=='tv_cable' && b.package_id){const [pkgs]=await pool.execute('SELECT router_id FROM packages WHERE id=?',[b.package_id]);if(pkgs[0]?.router_id&&b.router_id&&Number(pkgs[0].router_id)!==Number(b.router_id))return res.status(400).json({error:'Router pelanggan harus sama dengan router pada paket yang dipilih'});}
  const [result] = await pool.execute(`INSERT INTO customers
    (customer_code,name,phone,address,service_type,package_id,router_id,pppoe_username,billing_day,due_grace_days,isolation_enabled,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [b.customer_code,b.name,b.phone||null,b.address||null,serviceType,b.package_id||null,serviceType==='tv_cable'?null:(b.router_id||null),serviceType==='tv_cable'?null:(b.pppoe_username||null),Math.min(31,Math.max(1,Number(b.billing_day||1))),Math.max(0,Number(b.due_grace_days||0)),b.isolation_enabled===false?0:1,b.notes||null]);
  await logActivity('customer_created','customer',result.insertId,{customerCode:b.customer_code});
  res.status(201).json({ id: result.insertId });
}));
app.put('/api/customers/:id', asyncRoute(async (req,res) => {
  const b=req.body; const serviceType=b.service_type||'internet';
  if(serviceType==='tv_cable' && (b.router_id || b.pppoe_username)) return res.status(400).json({error:'Pelanggan TV kabel tidak memerlukan router atau username PPPoE'});
  if(serviceType!=='tv_cable' && (!b.router_id || !b.pppoe_username)) return res.status(400).json({error:'Pelanggan internet/bundle wajib memilih router dan username PPPoE'});
  if(serviceType!=='tv_cable' && b.package_id){const [pkgs]=await pool.execute('SELECT router_id FROM packages WHERE id=?',[b.package_id]);if(pkgs[0]?.router_id&&b.router_id&&Number(pkgs[0].router_id)!==Number(b.router_id))return res.status(400).json({error:'Router pelanggan harus sama dengan router pada paket yang dipilih'});}
  await pool.execute(`UPDATE customers SET name=?,phone=?,address=?,service_type=?,package_id=?,router_id=?,pppoe_username=?,billing_day=?,due_grace_days=?,isolation_enabled=?,customer_status=?,notes=? WHERE id=?`,
    [b.name,b.phone||null,b.address||null,serviceType,b.package_id||null,serviceType==='tv_cable'?null:(b.router_id||null),serviceType==='tv_cable'?null:(b.pppoe_username||null),Math.min(31,Math.max(1,Number(b.billing_day||1))),Math.max(0,Number(b.due_grace_days||0)),b.isolation_enabled?1:0,b.customer_status||'active',b.notes||null,req.params.id]);
  await logActivity('customer_updated','customer',Number(req.params.id),{}); res.json({ok:true});
}));

app.get('/api/packages', asyncRoute(async (_req,res)=>{ const [rows]=await pool.query('SELECT p.*, r.name router_name, r.host router_host FROM packages p LEFT JOIN routers r ON r.id=p.router_id ORDER BY p.name'); res.json(rows); }));
app.get('/api/routers/:id/ppp-profiles', asyncRoute(async(req,res)=>{
  const profiles = await listPppProfiles(req.params.id);
  res.json({ router_id: Number(req.params.id), profiles: profiles.map(p => p.name).filter(Boolean).sort((a,b)=>a.localeCompare(b)) });
}));
app.post('/api/packages', asyncRoute(async (req,res)=>{
  const b=req.body; const serviceType=b.service_type||'internet';
  if(!b.name || !Number.isFinite(Number(b.price)) || Number(b.price)<0) return res.status(400).json({error:'Nama paket dan harga yang valid wajib diisi'});
  if(serviceType!=='tv_cable'&&!b.router_id) return res.status(400).json({error:'Pilih router MikroTik untuk paket internet atau bundling'});
  if(serviceType!=='tv_cable'&&!b.ppp_profile) return res.status(400).json({error:'Pilih PPP Profile dari router yang dipilih'});
  if(serviceType==='tv_cable'&&(b.router_id||b.ppp_profile)) return res.status(400).json({error:'Paket TV kabel tidak menggunakan router atau PPP Profile MikroTik'});
  if(serviceType!=='tv_cable'&&b.ppp_profile){const profiles=await listPppProfiles(b.router_id);if(!profiles.some(p=>p.name===b.ppp_profile))return res.status(400).json({error:'PPP Profile tidak ditemukan pada router yang dipilih'});}
  const [r]=await pool.execute('INSERT INTO packages (name,service_type,price,ppp_profile,router_id,active) VALUES (?,?,?,?,?,?)',[b.name,serviceType,Number(b.price),b.ppp_profile||null,serviceType==='tv_cable'?null:Number(b.router_id),b.active===false?0:1]);
  await logActivity('package_created','package',r.insertId,{name:b.name}); res.status(201).json({id:r.insertId});
}));
app.put('/api/packages/:id', asyncRoute(async(req,res)=>{
  const b=req.body; const serviceType=b.service_type||'internet';
  if(!b.name || !Number.isFinite(Number(b.price)) || Number(b.price)<0) return res.status(400).json({error:'Nama paket dan harga tidak valid'});
  if(serviceType!=='tv_cable'&&!b.router_id)return res.status(400).json({error:'Pilih router MikroTik untuk paket internet atau bundling'});
  if(serviceType!=='tv_cable'&&!b.ppp_profile)return res.status(400).json({error:'Pilih PPP Profile dari router yang dipilih'});
  if(serviceType==='tv_cable'&&(b.router_id||b.ppp_profile))return res.status(400).json({error:'Paket TV kabel tidak menggunakan router atau PPP Profile MikroTik'});
  if(serviceType!=='tv_cable'&&b.ppp_profile){const profiles=await listPppProfiles(b.router_id);if(!profiles.some(p=>p.name===b.ppp_profile))return res.status(400).json({error:'PPP Profile tidak ditemukan pada router yang dipilih'});}
  await pool.execute('UPDATE packages SET name=?,service_type=?,price=?,ppp_profile=?,router_id=?,active=? WHERE id=?',[b.name,serviceType,Number(b.price),b.ppp_profile||null,serviceType==='tv_cable'?null:Number(b.router_id),b.active?1:0,req.params.id]);
  await logActivity('package_updated','package',Number(req.params.id),{name:b.name});res.json({ok:true});
}));

app.get('/api/bank-accounts', asyncRoute(async (_req,res)=>{ const [rows]=await pool.query('SELECT * FROM bank_accounts ORDER BY is_active DESC, bank_name, account_name'); res.json(rows); }));
app.post('/api/bank-accounts', asyncRoute(async(req,res)=>{
  const b=req.body;
  if(!b.bank_name?.trim()||!b.account_name?.trim()||!b.account_number?.trim()) return res.status(400).json({error:'Nama bank, nama pemilik, dan nomor rekening wajib diisi'});
  const [r]=await pool.execute('INSERT INTO bank_accounts (bank_name,account_name,account_number,branch,notes,is_active) VALUES (?,?,?,?,?,?)',[b.bank_name.trim(),b.account_name.trim(),b.account_number.trim(),b.branch||null,b.notes||null,b.is_active===false?0:1]);
  await logActivity('bank_account_created','bank_account',r.insertId,{bankName:b.bank_name,accountNumber:b.account_number}); res.status(201).json({id:r.insertId});
}));
app.put('/api/bank-accounts/:id', asyncRoute(async(req,res)=>{
  const b=req.body;
  if(!b.bank_name?.trim()||!b.account_name?.trim()||!b.account_number?.trim()) return res.status(400).json({error:'Nama bank, nama pemilik, dan nomor rekening wajib diisi'});
  await pool.execute('UPDATE bank_accounts SET bank_name=?,account_name=?,account_number=?,branch=?,notes=?,is_active=? WHERE id=?',[b.bank_name.trim(),b.account_name.trim(),b.account_number.trim(),b.branch||null,b.notes||null,b.is_active?1:0,req.params.id]);
  await logActivity('bank_account_updated','bank_account',Number(req.params.id),{bankName:b.bank_name}); res.json({ok:true});
}));

app.get('/api/routers', asyncRoute(async (_req,res)=>{const [rows]=await pool.query('SELECT id,name,host,port,username,isolation_profile,enabled,last_status,last_checked_at FROM routers ORDER BY name');res.json(rows);}));
app.post('/api/routers', asyncRoute(async(req,res)=>{const b=req.body;if(!b.name||!b.host||!b.username||!b.password)return res.status(400).json({error:'Nama, host, username, dan password router wajib diisi'});const [r]=await pool.execute('INSERT INTO routers (name,host,port,username,password_enc,isolation_profile) VALUES (?,?,?,?,?,?)',[b.name,b.host,Number(b.port||8728),b.username,encryptSecret(b.password),'KV-ISOLIR']);await logActivity('router_created','router',r.insertId,{name:b.name});res.status(201).json({id:r.insertId});}));
app.post('/api/routers/:id/test', asyncRoute(async(req,res)=>res.json(await testRouter(req.params.id))));
app.post('/api/routers/:id/use-kv-isolir', asyncRoute(async(req,res)=>res.json(await configureKvIsolirProfile(req.params.id))));
app.get('/api/routers/:id/ppp-secrets', asyncRoute(async(req,res)=>res.json(await listPppSecrets(req.params.id))));

app.get('/api/invoices', asyncRoute(async(_req,res)=>{const [rows]=await pool.query(`SELECT i.*,c.customer_code,c.name customer_name,c.phone FROM invoices i JOIN customers c ON c.id=i.customer_id ORDER BY i.due_date DESC,i.id DESC LIMIT 1000`);res.json(rows);}));
app.get('/api/payments', asyncRoute(async (req, res) => {
  const defaultMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(new Date());
  const month = String(req.query.month || defaultMonth);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Format bulan harus YYYY-MM' });
  const [rows] = await pool.execute(
    `SELECT p.id, p.receipt_number, p.invoice_id, p.amount, p.method, p.account_id,
            p.reference_number, p.notes, p.paid_at, p.created_by,
            i.invoice_number, c.customer_code, c.name AS customer_name,
            ba.bank_name, ba.account_name, ba.account_number
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN bank_accounts ba ON ba.id = p.account_id
     WHERE p.paid_at >= ? AND p.paid_at < DATE_ADD(?, INTERVAL 1 MONTH)
     ORDER BY p.paid_at DESC, p.id DESC`, [`${month}-01`, `${month}-01`]
  );
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  res.json({ month, count: rows.length, total, rows });
}));
app.post('/api/invoices/generate', asyncRoute(async(req,res)=>{const count=await generateMonthlyInvoices(new Date());res.json({ok:true,created:count});}));
app.post('/api/payments', asyncRoute(async(req,res)=>{const b=req.body;if(!b.invoice_id||!b.amount||!['cash','transfer'].includes(b.method))return res.status(400).json({error:'Tagihan, nominal, dan metode cash/transfer wajib diisi'});if(b.method==='transfer'&&!b.account_id)return res.status(400).json({error:'Pilih rekening tujuan untuk pembayaran transfer'});res.status(201).json(await recordPayment({invoiceId:b.invoice_id,amount:b.amount,method:b.method,accountId:b.account_id,referenceNumber:b.reference_number,notes:b.notes,createdBy:b.created_by||'admin'}));}));
app.post('/api/customers/:id/isolate', asyncRoute(async(req,res)=>res.json(await setCustomerProfile(req.params.id,'isolate'))));
app.post('/api/customers/:id/reactivate', asyncRoute(async(req,res)=>res.json(await setCustomerProfile(req.params.id,'reactivate'))));

app.get('/api/settings/billing', asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM billing_settings WHERE id=1');res.json(rows[0]);}));
app.put('/api/settings/billing', asyncRoute(async(req,res)=>{const b=req.body;await pool.execute('UPDATE billing_settings SET invoice_generation_day=?,isolation_day_offset=?,isolation_time=?,auto_reactivate=? WHERE id=1',[Math.min(28,Math.max(1,Number(b.invoice_generation_day||1))),Math.max(0,Number(b.isolation_day_offset||0)),b.isolation_time||'00:05:00',b.auto_reactivate?1:0]);await logActivity('billing_settings_updated','settings',1,b);res.json({ok:true});}));
app.get('/api/logs', asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 200');res.json(rows);}));

app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:err.message||'Kesalahan server'});});
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`Billing API listening on :${port}`));

if(process.env.SCHEDULER_ENABLED==='true'){
  process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  let busy=false;
  const tick = async () => {
    if(busy)return;busy=true;
    try {
      const [rows] = await pool.query('SELECT invoice_generation_day FROM billing_settings WHERE id=1');
      const generationDay = Number(rows[0]?.invoice_generation_day || 1);
      if (new Date().getDate() === generationDay) {
        const count = await generateMonthlyInvoices(new Date());
        if (count) console.log(`Generated ${count} invoices`);
      }
      await processIsolation();
    } catch(e) { console.error('Billing scheduler error:',e.message); }
    finally { busy=false; }
  };
  setInterval(tick,60_000);
  setTimeout(tick,5_000);
  console.log(`Billing scheduler enabled; timezone ${process.env.TZ}; checks every 60 seconds`);
}
