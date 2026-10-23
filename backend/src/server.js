import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import cors from 'cors';
import { pool } from './db.js';
import { encryptSecret } from './crypto.js';
import { logActivity } from './log.js';
import { testRouter, listPppSecrets, listPppProfiles, listActivePppSessions, setCustomerProfile, getKvIsolirStatus, configureKvIsolirProfile } from './mikrotik.js';
import { generateMonthlyInvoices, recordPayment } from './billing.js';
import { startScheduler } from './scheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sessions = new Map();
const roleAccess = {
  superadmin: () => true,
  admin: (path, method) => !path.startsWith('/settings') && !path.startsWith('/brand') && (!path.startsWith('/routers') || method === 'GET'),
  kolektor: (path, method) => path.startsWith('/customers') || path.startsWith('/invoices') || path.startsWith('/payments') || path.startsWith('/reports/monthly') || path.startsWith('/profile') || (path === '/brand' && method === 'GET') || (['/bank-accounts','/packages','/routers'].includes(path) && method === 'GET') || (/^\/routers\/\d+\/ppp-profiles$/.test(path) && method === 'GET')
};
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  try { const [salt, hash] = String(stored).split(':'); return crypto.timingSafeEqual(crypto.scryptSync(String(password), salt, 64), Buffer.from(hash, 'hex')); }
  catch { return false; }
}
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/bootstrap' || (req.path === '/brand' && req.method === 'GET')) return next();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = sessions.get(token);
  if (!user) return res.status(401).json({ error: 'Sesi berakhir. Silakan login kembali.' });
  req.user = user;
  if (!(roleAccess[user.role]?.(req.path, req.method) ?? false)) return res.status(403).json({ error: 'Akses ditolak untuk role Anda.' });
  next();
});
app.get('/api/auth/bootstrap', asyncRoute(async (_req,res) => {
  const [[row]] = await pool.query('SELECT COUNT(*) total FROM users');
  res.json({ needsSetup: Number(row.total) === 0 });
}));
app.post('/api/auth/bootstrap', asyncRoute(async (req,res) => {
  const [[row]] = await pool.query('SELECT COUNT(*) total FROM users');
  if (Number(row.total)) return res.status(409).json({ error: 'Setup awal sudah dilakukan.' });
  const name=String(req.body.name||'Super Admin').trim(), username=String(req.body.username||'admin').trim(), password=String(req.body.password||'');
  if (!name || !username || password.length < 8) return res.status(400).json({error:'Nama, username, dan password minimal 8 karakter wajib diisi.'});
  const [r] = await pool.execute("INSERT INTO users (name,username,password_hash,role,active) VALUES (?,?,?,'superadmin',1)",[name,username,hashPassword(password)]);
  const token=crypto.randomBytes(32).toString('hex'), user={id:r.insertId,name,username,role:'superadmin'};
  sessions.set(token,user); res.status(201).json({token,user});
}));
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const [rows]=await pool.execute('SELECT id,name,username,password_hash,role,active FROM users WHERE username=? LIMIT 1',[String(req.body.username||'').trim()]);
  const u=rows[0];
  if(!u||!u.active||!verifyPassword(req.body.password||'',u.password_hash))return res.status(401).json({error:'Username atau password salah.'});
  const token=crypto.randomBytes(32).toString('hex'), user={id:u.id,name:u.name,username:u.username,role:u.role};
  sessions.set(token,user);res.json({token,user});
}));
app.post('/api/auth/logout',(req,res)=>{sessions.delete(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''));res.json({ok:true})});
app.get('/api/profile',(req,res)=>res.json(req.user));
app.put('/api/profile',asyncRoute(async(req,res)=>{
  const name=String(req.body.name||'').trim(), password=String(req.body.password||'');
  if(!name)return res.status(400).json({error:'Nama wajib diisi.'});
  if(password&&password.length<8)return res.status(400).json({error:'Password baru minimal 8 karakter.'});
  if(password)await pool.execute('UPDATE users SET name=?,password_hash=? WHERE id=?',[name,hashPassword(password),req.user.id]);
  else await pool.execute('UPDATE users SET name=? WHERE id=?',[name,req.user.id]);
  for(const [token,u] of sessions)if(u.id===req.user.id)sessions.set(token,{...u,name});
  res.json({ok:true,name});
}));
app.get('/api/users',asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT id,name,username,role,active,created_at FROM users ORDER BY id');res.json(rows)}));
app.post('/api/users',asyncRoute(async(req,res)=>{
  const b=req.body,name=String(b.name||'').trim(),username=String(b.username||'').trim(),password=String(b.password||'');
  if(!name||!username||password.length<8||!['superadmin','admin','kolektor'].includes(b.role))return res.status(400).json({error:'Nama, username, role, dan password minimal 8 karakter wajib diisi.'});
  if(req.user.role==='admin'&&b.role==='superadmin')return res.status(403).json({error:'Admin tidak dapat membuat akun superadmin.'});
  try{const [r]=await pool.execute('INSERT INTO users (name,username,password_hash,role,active) VALUES (?,?,?,?,1)',[name,username,hashPassword(password),b.role]);res.status(201).json({id:r.insertId})}
  catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Username sudah digunakan.'});throw e}
}));
app.put('/api/users/:id',asyncRoute(async(req,res)=>{
  const b=req.body,id=Number(req.params.id);
  if(id===req.user.id&&b.active===false)return res.status(400).json({error:'Anda tidak dapat menonaktifkan akun sendiri.'});
  if(!['superadmin','admin','kolektor'].includes(b.role))return res.status(400).json({error:'Role tidak valid.'});
  const [[cnt]]=await pool.query("SELECT COUNT(*) total FROM users WHERE role='superadmin' AND active=1");
  const [target]=await pool.execute('SELECT role,active FROM users WHERE id=?',[id]);
  if(!target.length)return res.status(404).json({error:'User tidak ditemukan.'});
  if(req.user.role==='admin'&&(b.role==='superadmin'||target[0].role==='superadmin'))return res.status(403).json({error:'Admin tidak dapat mengubah akun superadmin.'});
  if(target[0].role==='superadmin'&&target[0].active&&(b.role!=='superadmin'||b.active===false)&&Number(cnt.total)<=1)return res.status(400).json({error:'Minimal harus ada satu superadmin aktif.'});
  await pool.execute('UPDATE users SET role=?,active=? WHERE id=?',[b.role,b.active===false?0:1,id]);res.json({ok:true});
}));
app.get('/api/brand',asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT brand_name FROM app_settings WHERE id=1');res.json({brand_name:rows[0]?.brand_name||'BillingNet'})}));
app.put('/api/brand',asyncRoute(async(req,res)=>{const name=String(req.body.brand_name||'').trim();if(!name)return res.status(400).json({error:'Nama brand wajib diisi.'});await pool.execute('UPDATE app_settings SET brand_name=? WHERE id=1',[name]);res.json({ok:true,brand_name:name})}));
app.get('/api/reports/monthly',asyncRoute(async(req,res)=>{
  const month=String(req.query.month||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date()));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Format bulan harus YYYY-MM'});
  const [rows]=await pool.execute(`SELECT p.id,p.amount,p.paid_at,p.method,p.receipt_number,i.invoice_number,c.customer_code,c.name customer_name
  FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=i.customer_id
  WHERE p.paid_at>=? AND p.paid_at<DATE_ADD(?,INTERVAL 1 MONTH) ORDER BY p.paid_at DESC`,[`${month}-01`,`${month}-01`]);
  res.json({month,totalUsers:new Set(rows.map(r=>String(r.customer_code))).size,totalRevenue:rows.reduce((sum,r)=>sum+Number(r.amount||0),0),rows});
}));
app.get('/api/expenses',asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM expenses ORDER BY expense_date DESC,id DESC');res.json(rows)}));
app.post('/api/expenses',asyncRoute(async(req,res)=>{
  const b=req.body;if(!b.description||!Number(b.amount)||Number(b.amount)<=0||!b.expense_date)return res.status(400).json({error:'Deskripsi, nominal, dan tanggal pengeluaran wajib diisi.'});
  const [r]=await pool.execute('INSERT INTO expenses (description,category,amount,expense_date,payment_method,notes,created_by) VALUES (?,?,?,?,?,?,?)',[b.description,b.category||'Lainnya',Number(b.amount),b.expense_date,b.payment_method||'cash',b.notes||null,req.user.username]);res.status(201).json({id:r.insertId});
}));
app.put('/api/expenses/:id',asyncRoute(async(req,res)=>{
  const b=req.body;if(!b.description||!Number(b.amount)||Number(b.amount)<=0||!b.expense_date)return res.status(400).json({error:'Deskripsi, nominal, dan tanggal wajib diisi.'});
  await pool.execute('UPDATE expenses SET description=?,category=?,amount=?,expense_date=?,payment_method=?,notes=? WHERE id=?',[b.description,b.category||'Lainnya',Number(b.amount),b.expense_date,b.payment_method||'cash',b.notes||null,req.params.id]);res.json({ok:true});
}));
app.get('/api/assets',asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM assets ORDER BY id DESC');res.json(rows)}));
app.post('/api/assets',asyncRoute(async(req,res)=>{
  const b=req.body,type=b.asset_type==='ont'?'ont':'other';if(!b.name||!b.serial_number)return res.status(400).json({error:'Nama aset dan nomor seri wajib diisi.'});
  try{const [r]=await pool.execute('INSERT INTO assets (asset_type,name,serial_number,brand,model,quantity,condition_status,location,notes) VALUES (?,?,?,?,?,?,?,?,?)',[type,b.name,b.serial_number,b.brand||null,b.model||null,Math.max(1,Number(b.quantity||1)),b.condition_status||'baik',b.location||null,b.notes||null]);res.status(201).json({id:r.insertId})}
  catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Nomor seri sudah terdaftar.'});throw e}
}));
app.put('/api/assets/:id',asyncRoute(async(req,res)=>{
  const b=req.body;if(!b.name||!b.serial_number)return res.status(400).json({error:'Nama aset dan nomor seri wajib diisi.'});
  await pool.execute('UPDATE assets SET name=?,serial_number=?,brand=?,model=?,quantity=?,condition_status=?,location=?,notes=? WHERE id=?',[b.name,b.serial_number,b.brand||null,b.model||null,Math.max(1,Number(b.quantity||1)),b.condition_status||'baik',b.location||null,b.notes||null,req.params.id]);res.json({ok:true});
}));


app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, service: 'billing-rt-rwnet-api', timezone: process.env.APP_TIMEZONE || 'Asia/Jakarta' });
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [[customers]] = await pool.query("SELECT COUNT(*) total, SUM(active=1 AND customer_status='active' AND isolation_status<>'isolated') active, SUM(isolation_status='isolated') isolated, SUM(active=0) inactive FROM customers");
  const [[invoices]] = await pool.query("SELECT COUNT(*) total, SUM(status IN ('unpaid','partial')) unpaid_count, COALESCE(SUM(CASE WHEN status IN ('unpaid','partial') THEN amount-paid_amount ELSE 0 END),0) outstanding FROM invoices WHERE status <> 'void'");
  const [[payments]] = await pool.query("SELECT COALESCE(SUM(amount),0) today_total FROM payments WHERE DATE(paid_at)=CURDATE()");
  res.json({ customers, invoices, payments });
}));

// Hitung terisolir berdasarkan profile Secret yang dibaca langsung dari MikroTik.
app.get('/api/dashboard/isolation-status', asyncRoute(async (_req, res) => {
  res.json(await getKvIsolirStatus());
}));

app.get('/api/customers', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`SELECT c.*, p.name package_name, p.price package_price, r.name router_name, r.host router_host, p.router_id package_router_id, u.name collector_name,
      COALESCE(c.invoice_day_override,bs.invoice_generation_day) invoice_day_effective, COALESCE(c.payment_start_day_override,bs.payment_start_day) payment_start_day_effective,
      COALESCE(c.payment_end_day_override,bs.payment_end_day) payment_end_day_effective, COALESCE(c.grace_days_override,NULLIF(c.due_grace_days,0),bs.grace_days) grace_days_effective,
      COALESCE(c.isolation_time_override,bs.isolation_time) isolation_time_effective
    FROM customers c LEFT JOIN packages p ON p.id=c.package_id LEFT JOIN routers r ON r.id=c.router_id LEFT JOIN users u ON u.id=c.collector_id CROSS JOIN billing_settings bs WHERE bs.id=1 ORDER BY c.id DESC`);
  res.json(rows);
}));

app.put('/api/customers/collector/bulk', asyncRoute(async(req,res)=>{
  const ids=Array.isArray(req.body.customer_ids)?req.body.customer_ids.map(Number).filter(Number.isInteger):[];
  const collectorId=req.body.collector_id?Number(req.body.collector_id):null;
  if(!ids.length)return res.status(400).json({error:'Pilih minimal satu pelanggan.'});
  if(collectorId){const [u]=await pool.execute("SELECT id FROM users WHERE id=? AND role='kolektor' AND active=1",[collectorId]);if(!u.length)return res.status(400).json({error:'Kolektor tidak ditemukan atau tidak aktif.'});}
  const marks=ids.map(()=>'?').join(',');
  const [r]=await pool.execute(`UPDATE customers SET collector_id=? WHERE id IN (${marks})`,[collectorId,...ids]);
  res.json({ok:true,updated:r.affectedRows});
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
  if(b.payment_start_day_override&&b.payment_end_day_override&&Number(b.payment_end_day_override)<Number(b.payment_start_day_override))return res.status(400).json({error:'Tanggal akhir masa pembayaran harus sama atau setelah tanggal mulai.'});
  if(b.collector_id){const [collector]=await pool.execute("SELECT id FROM users WHERE id=? AND role='kolektor' AND active=1",[b.collector_id]);if(!collector.length)return res.status(400).json({error:'Kolektor tidak ditemukan atau tidak aktif.'});}
  if(serviceType==='tv_cable' && (b.router_id || b.pppoe_username)) return res.status(400).json({error:'Pelanggan TV kabel tidak memerlukan router atau username PPPoE'});
  if(serviceType!=='tv_cable' && (!b.router_id || !b.pppoe_username)) return res.status(400).json({error:'Pelanggan internet/bundle wajib memilih router dan username PPPoE'});
  if(serviceType!=='tv_cable' && b.package_id){const [pkgs]=await pool.execute('SELECT router_id FROM packages WHERE id=?',[b.package_id]);if(pkgs[0]?.router_id&&b.router_id&&Number(pkgs[0].router_id)!==Number(b.router_id))return res.status(400).json({error:'Router pelanggan harus sama dengan router pada paket yang dipilih'});}
  const [result] = await pool.execute(`INSERT INTO customers
    (customer_code,name,phone,address,service_type,package_id,router_id,pppoe_username,billing_day,invoice_day_override,payment_start_day_override,payment_end_day_override,grace_days_override,isolation_time_override,collector_id,due_grace_days,active,skip_mass_isolation,isolation_enabled,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [b.customer_code,b.name,b.phone||null,b.address||null,serviceType,b.package_id||null,serviceType==='tv_cable'?null:(b.router_id||null),serviceType==='tv_cable'?null:(b.pppoe_username||null),Math.min(31,Math.max(1,Number(b.billing_day||1))),b.invoice_day_override?Math.min(31,Math.max(1,Number(b.invoice_day_override))):null,b.payment_start_day_override?Math.min(31,Math.max(1,Number(b.payment_start_day_override))):null,b.payment_end_day_override?Math.min(31,Math.max(1,Number(b.payment_end_day_override))):null,b.grace_days_override!==''&&b.grace_days_override!==null&&b.grace_days_override!==undefined?Math.max(0,Number(b.grace_days_override)):null,b.isolation_time_override||null,b.collector_id||null,Math.max(0,Number(b.due_grace_days||0)),b.active===false?0:1,b.skip_mass_isolation?1:0,(b.isolation_enabled===false||b.skip_mass_isolation)?0:1,b.notes||null]);
  await logActivity('customer_created','customer',result.insertId,{customerCode:b.customer_code});
  res.status(201).json({ id: result.insertId });
}));
app.put('/api/customers/:id', asyncRoute(async (req,res) => {
  const b=req.body; const serviceType=b.service_type||'internet';
  if(b.payment_start_day_override&&b.payment_end_day_override&&Number(b.payment_end_day_override)<Number(b.payment_start_day_override))return res.status(400).json({error:'Tanggal akhir masa pembayaran harus sama atau setelah tanggal mulai.'});
  if(b.collector_id){const [collector]=await pool.execute("SELECT id FROM users WHERE id=? AND role='kolektor' AND active=1",[b.collector_id]);if(!collector.length)return res.status(400).json({error:'Kolektor tidak ditemukan atau tidak aktif.'});}
  if(serviceType==='tv_cable' && (b.router_id || b.pppoe_username)) return res.status(400).json({error:'Pelanggan TV kabel tidak memerlukan router atau username PPPoE'});
  if(serviceType!=='tv_cable' && (!b.router_id || !b.pppoe_username)) return res.status(400).json({error:'Pelanggan internet/bundle wajib memilih router dan username PPPoE'});
  if(serviceType!=='tv_cable' && b.package_id){const [pkgs]=await pool.execute('SELECT router_id FROM packages WHERE id=?',[b.package_id]);if(pkgs[0]?.router_id&&b.router_id&&Number(pkgs[0].router_id)!==Number(b.router_id))return res.status(400).json({error:'Router pelanggan harus sama dengan router pada paket yang dipilih'});}
  await pool.execute(`UPDATE customers SET name=?,phone=?,address=?,service_type=?,package_id=?,router_id=?,pppoe_username=?,billing_day=?,invoice_day_override=?,payment_start_day_override=?,payment_end_day_override=?,grace_days_override=?,isolation_time_override=?,collector_id=?,due_grace_days=?,active=?,skip_mass_isolation=?,isolation_enabled=?,customer_status=?,notes=? WHERE id=?`,
    [b.name,b.phone||null,b.address||null,serviceType,b.package_id||null,serviceType==='tv_cable'?null:(b.router_id||null),serviceType==='tv_cable'?null:(b.pppoe_username||null),Math.min(31,Math.max(1,Number(b.billing_day||1))),b.invoice_day_override?Math.min(31,Math.max(1,Number(b.invoice_day_override))):null,b.payment_start_day_override?Math.min(31,Math.max(1,Number(b.payment_start_day_override))):null,b.payment_end_day_override?Math.min(31,Math.max(1,Number(b.payment_end_day_override))):null,b.grace_days_override!==''&&b.grace_days_override!==null&&b.grace_days_override!==undefined?Math.max(0,Number(b.grace_days_override)):null,b.isolation_time_override||null,b.collector_id||null,Math.max(0,Number(b.due_grace_days||0)),b.active===false?0:1,b.skip_mass_isolation?1:0,(b.isolation_enabled===false||b.skip_mass_isolation)?0:1,b.customer_status||'active',b.notes||null,req.params.id]);
  await logActivity('customer_updated','customer',Number(req.params.id),{}); res.json({ok:true});
}));
app.delete('/api/customers/:id', asyncRoute(async(req,res)=>{
  const [existing]=await pool.execute('SELECT id,name FROM customers WHERE id=?',[req.params.id]);
  if(!existing.length)return res.status(404).json({error:'Pelanggan tidak ditemukan.'});
  const [[counts]]=await pool.execute('SELECT COUNT(*) total FROM invoices WHERE customer_id=?',[req.params.id]);
  if(Number(counts.total)>0)return res.status(409).json({error:'Pelanggan memiliki riwayat tagihan. Nonaktifkan pelanggan agar riwayat keuangan tetap aman.'});
  await pool.execute('DELETE FROM customers WHERE id=?',[req.params.id]);
  await logActivity('customer_deleted','customer',Number(req.params.id),{name:existing[0].name});
  res.json({ok:true});
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

app.delete('/api/packages/:id', asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);
  const [rows]=await pool.execute('SELECT id,name FROM packages WHERE id=?',[id]);
  if(!rows.length)return res.status(404).json({error:'Paket tidak ditemukan.'});
  // FK pada pelanggan dan invoice menggunakan ON DELETE SET NULL, sehingga riwayat tagihan tetap aman.
  await pool.execute('DELETE FROM packages WHERE id=?',[id]);
  await logActivity('package_deleted','package',id,{name:rows[0].name});
  res.json({ok:true});
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
app.put('/api/routers/:id', asyncRoute(async(req,res)=>{
  const id=Number(req.params.id); const b=req.body;
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'ID router tidak valid.'});
  if(!String(b.name||'').trim()||!String(b.host||'').trim()||!String(b.username||'').trim())return res.status(400).json({error:'Nama, host, dan username router wajib diisi.'});
  const port=Number(b.port||8728);if(!Number.isInteger(port)||port<1||port>65535)return res.status(400).json({error:'Port API harus antara 1 sampai 65535.'});
  const [exists]=await pool.execute('SELECT id,name FROM routers WHERE id=?',[id]);if(!exists.length)return res.status(404).json({error:'Router tidak ditemukan.'});
  if(String(b.password||'').trim()){
    await pool.execute('UPDATE routers SET name=?,host=?,port=?,username=?,password_enc=?,isolation_profile=? WHERE id=?',[String(b.name).trim(),String(b.host).trim(),port,String(b.username).trim(),encryptSecret(b.password),'KV-ISOLIR',id]);
  }else{
    await pool.execute('UPDATE routers SET name=?,host=?,port=?,username=?,isolation_profile=? WHERE id=?',[String(b.name).trim(),String(b.host).trim(),port,String(b.username).trim(),'KV-ISOLIR',id]);
  }
  await logActivity('router_updated','router',id,{name:String(b.name).trim()});res.json({ok:true});
}));
app.delete('/api/routers/:id', asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'ID router tidak valid.'});
  const [rows]=await pool.execute('SELECT id,name FROM routers WHERE id=?',[id]);if(!rows.length)return res.status(404).json({error:'Router tidak ditemukan.'});
  const [[customerCount]]=await pool.execute('SELECT COUNT(*) AS total FROM customers WHERE router_id=?',[id]);
  const [[packageCount]]=await pool.execute('SELECT COUNT(*) AS total FROM packages WHERE router_id=?',[id]);
  if(Number(customerCount.total)>0||Number(packageCount.total)>0)return res.status(409).json({error:`Router tidak dapat dihapus karena masih digunakan ${customerCount.total} pelanggan dan ${packageCount.total} paket. Pindahkan pelanggan/paket ke router lain terlebih dahulu.`});
  await pool.execute('DELETE FROM routers WHERE id=?',[id]);await logActivity('router_deleted','router',id,{name:rows[0].name});res.json({ok:true});
}));

app.post('/api/routers/:id/test', asyncRoute(async(req,res)=>res.json(await testRouter(req.params.id))));
app.post('/api/routers/:id/use-kv-isolir', asyncRoute(async(req,res)=>res.json(await configureKvIsolirProfile(req.params.id))));
app.get('/api/routers/:id/ppp-secrets', asyncRoute(async(req,res)=>res.json(await listPppSecrets(req.params.id))));

app.get('/api/invoices', asyncRoute(async(_req,res)=>{const [rows]=await pool.query(`SELECT i.*,c.customer_code,c.name customer_name,c.phone FROM invoices i JOIN customers c ON c.id=i.customer_id ORDER BY i.due_date DESC,i.id DESC LIMIT 1000`);res.json(rows);}));

app.put('/api/invoices/:id/nunggak', asyncRoute(async(req,res)=>{
  const id=Number(req.params.id); const skip=req.body?.skip===false?0:1;
  const [rows]=await pool.execute('SELECT id,customer_id,period_start,status FROM invoices WHERE id=?',[id]);
  if(!rows.length)return res.status(404).json({error:'Tagihan tidak ditemukan.'});
  await pool.execute('UPDATE invoices SET skip_isolation=? WHERE id=?',[skip,id]);
  // NUNGGAK berarti melewati isolir untuk periode invoice ini; invoice dan status pembayaran tidak dihapus.
  if(skip){
    const [customerRows]=await pool.execute("SELECT isolation_status FROM customers WHERE id=?",[rows[0].customer_id]);
    if(customerRows[0]?.isolation_status==='isolated'){
      const { setCustomerProfile }=await import('./mikrotik.js');
      await setCustomerProfile(rows[0].customer_id,'reactivate');
    }
  }
  await logActivity(skip?'invoice_nunggak_enabled':'invoice_nunggak_disabled','invoice',id,{period_start:rows[0].period_start});
  res.json({ok:true,skip_isolation:Boolean(skip)});
}));
app.delete('/api/invoices/:id', asyncRoute(async(req,res)=>{
  if(!['superadmin','admin'].includes(req.user?.role))return res.status(403).json({error:'Hanya admin atau superadmin yang dapat menghapus tagihan.'});
  const id=Number(req.params.id); const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.execute('SELECT id,invoice_number,customer_id FROM invoices WHERE id=? FOR UPDATE',[id]);
    if(!rows.length){await conn.rollback();return res.status(404).json({error:'Tagihan tidak ditemukan.'});}
    // Penghapusan tagihan memang menghapus transaksi pembayaran terkait sesuai permintaan operator.
    await conn.execute('DELETE FROM payments WHERE invoice_id=?',[id]);
    await conn.execute('DELETE FROM invoices WHERE id=?',[id]);
    await conn.commit();
    await logActivity('invoice_deleted','invoice',id,{invoice_number:rows[0].invoice_number,customer_id:rows[0].customer_id,deleted_payments:true});
    res.json({ok:true});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}));

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
app.post('/api/invoices/generate', asyncRoute(async(req,res)=>{const count=await generateMonthlyInvoices(new Date(),true);res.json({ok:true,created:count});}));
app.post('/api/payments', asyncRoute(async(req,res)=>{const b=req.body;if(!b.invoice_id||!b.amount||!['cash','transfer'].includes(b.method))return res.status(400).json({error:'Tagihan, nominal, dan metode cash/transfer wajib diisi'});if(b.method==='transfer'&&!b.account_id)return res.status(400).json({error:'Pilih rekening tujuan untuk pembayaran transfer'});res.status(201).json(await recordPayment({invoiceId:b.invoice_id,amount:b.amount,method:b.method,accountId:b.account_id,referenceNumber:b.reference_number,notes:b.notes,createdBy:b.created_by||'admin'}));}));
app.post('/api/customers/:id/isolate', asyncRoute(async(req,res)=>{
  if(!['superadmin','admin'].includes(req.user?.role))return res.status(403).json({error:'Hanya admin atau superadmin yang dapat mengisolir pelanggan.'});
  const [rows]=await pool.execute('SELECT id,name,active,customer_status,service_type FROM customers WHERE id=?',[req.params.id]);
  if(!rows.length)return res.status(404).json({error:'Pelanggan tidak ditemukan.'});
  if(!rows[0].active || rows[0].customer_status!=='active')return res.status(400).json({error:'Pelanggan nonaktif atau ditangguhkan tidak dapat diisolir.'});
  if(rows[0].service_type==='tv_cable')return res.status(400).json({error:'Pelanggan TV kabel tidak menggunakan MikroTik.'});
  res.json(await setCustomerProfile(req.params.id,'isolate'));
}));
app.post('/api/customers/:id/reactivate', asyncRoute(async(req,res)=>{
  if(!['superadmin','admin'].includes(req.user?.role))return res.status(403).json({error:'Hanya admin atau superadmin yang dapat mengaktifkan kembali pelanggan.'});
  const [rows]=await pool.execute('SELECT id,service_type FROM customers WHERE id=?',[req.params.id]);
  if(!rows.length)return res.status(404).json({error:'Pelanggan tidak ditemukan.'});
  if(rows[0].service_type==='tv_cable')return res.status(400).json({error:'Pelanggan TV kabel tidak menggunakan MikroTik.'});
  res.json(await setCustomerProfile(req.params.id,'reactivate'));
}));

app.get('/api/settings/billing', asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM billing_settings WHERE id=1');res.json(rows[0]);}));
app.put('/api/settings/billing', asyncRoute(async(req,res)=>{const b=req.body;const start=Math.min(31,Math.max(1,Number(b.payment_start_day||1)));const end=Math.min(31,Math.max(start,Number(b.payment_end_day||13)));await pool.execute('UPDATE billing_settings SET invoice_generation_day=?,payment_start_day=?,payment_end_day=?,grace_days=?,isolation_day_offset=?,isolation_time=?,auto_reactivate=? WHERE id=1',[Math.min(31,Math.max(1,Number(b.invoice_generation_day||1))),start,end,Math.max(0,Number(b.grace_days??2)),Math.max(0,Number(b.isolation_day_offset||0)),b.isolation_time||'00:01:00',b.auto_reactivate?1:0]);await logActivity('billing_settings_updated','settings',1,b);res.json({ok:true});}));
app.get('/api/logs', asyncRoute(async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 200');res.json(rows);}));

app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:err.message||'Kesalahan server'});});
const port=Number(process.env.PORT||3000);
app.listen(port, () => {
  console.log(`Billing API listening on :${port}`);
  startScheduler();
});
