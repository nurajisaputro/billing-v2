import { pool } from './db.js';
import { logActivity } from './log.js';

const pad = (n) => String(n).padStart(2, '0');
function dateOnly(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function clampDay(year, monthIndex, day) { return Math.min(day, new Date(year, monthIndex + 1, 0).getDate()); }

export async function generateMonthlyInvoices(now = new Date(), force = false) {
  const [settingsRows] = await pool.execute('SELECT * FROM billing_settings WHERE id=1');
  const settings = settingsRows[0] || { invoice_generation_day: 1, payment_start_day: 1, payment_end_day: 13 };
  const defaultDay = Number(settings.invoice_generation_day || 1);
  const [customers] = await pool.execute(
    `SELECT c.id, c.package_id, c.invoice_day_override, c.payment_start_day_override, c.payment_end_day_override, p.price
     FROM customers c JOIN packages p ON p.id=c.package_id
     WHERE c.active=1 AND c.customer_status='active' AND p.active=1
       AND (?=1 OR COALESCE(c.invoice_day_override, ?) = ?)`,
    [force ? 1 : 0, defaultDay, now.getDate()]
  );
  let created = 0;
  for (const c of customers) {
    const year = now.getFullYear(); const month = now.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const invoiceDay = clampDay(year, month, Number(c.invoice_day_override || defaultDay));
    const paymentEndDay = clampDay(year, month, Number(c.payment_end_day_override || settings.payment_end_day || 13));
    const issue = new Date(year, month, invoiceDay);
    const due = new Date(year, month, paymentEndDay);
    try {
      await pool.execute(
        `INSERT INTO invoices (invoice_number, customer_id, package_id, period_start, period_end, issue_date, due_date, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`INV-${year}${pad(month + 1)}-${c.id}-${Date.now().toString().slice(-5)}`, c.id, c.package_id, dateOnly(start), dateOnly(end), dateOnly(issue), dateOnly(due), c.price]
      );
      created++;
    } catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
  }
  if (created) await logActivity('monthly_invoices_generated', 'invoice', null, { created, period: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` });
  return created;
}

export async function recordPayment({ invoiceId, amount, method, accountId, referenceNumber, notes, createdBy = 'admin' }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [invoices] = await conn.execute('SELECT * FROM invoices WHERE id=? FOR UPDATE', [invoiceId]);
    if (!invoices.length) throw new Error('Tagihan tidak ditemukan');
    const invoice = invoices[0];
    if (invoice.status === 'void') throw new Error('Tagihan dibatalkan');
    const outstanding = Number(invoice.amount) - Number(invoice.paid_amount);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > outstanding) throw new Error(`Nominal pembayaran harus lebih dari 0 dan maksimal ${outstanding}`);
    if (method === 'transfer') {
      if (!accountId) throw new Error('Pilih rekening tujuan untuk pembayaran transfer');
      const [accounts] = await conn.execute('SELECT id FROM bank_accounts WHERE id=? AND is_active=1', [accountId]);
      if (!accounts.length) throw new Error('Rekening tujuan tidak ditemukan atau nonaktif');
    } else {
      accountId = null;
    }
    const receipt = `PAY-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    await conn.execute(
      'INSERT INTO payments (receipt_number, invoice_id, amount, method, account_id, reference_number, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [receipt, invoiceId, value, method, accountId || null, referenceNumber || null, notes || null, createdBy]
    );
    const paid = Number(invoice.paid_amount) + value;
    const status = paid >= Number(invoice.amount) ? 'paid' : 'partial';
    await conn.execute('UPDATE invoices SET paid_amount=?, status=? WHERE id=?', [paid, status, invoiceId]);
    await conn.commit();
    await logActivity('payment_recorded', 'invoice', invoiceId, { receipt, amount: value, method, status }, createdBy);
    return { receiptNumber: receipt, invoiceId: Number(invoiceId), paidAmount: paid, outstanding: Number(invoice.amount) - paid, status };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export async function processIsolation() {
  const [settingsRows] = await pool.execute('SELECT * FROM billing_settings WHERE id=1');
  const settings = settingsRows[0] || { isolation_day_offset: 0, isolation_time: '00:01:00', grace_days: 2, auto_reactivate: 1 };
  const [overdue] = await pool.execute(
    `SELECT DISTINCT c.id, c.isolation_status FROM customers c
     JOIN invoices i ON i.customer_id=c.id
     WHERE c.active=1 AND c.customer_status='active' AND c.isolation_enabled=1 AND c.skip_mass_isolation=0
       AND i.status IN ('unpaid','partial')
       AND NOT EXISTS (SELECT 1 FROM invoices nx WHERE nx.customer_id=c.id AND nx.skip_isolation=1 AND nx.period_start=DATE_FORMAT(CURDATE(), '%Y-%m-01'))
       AND TIMESTAMP(DATE_ADD(i.due_date, INTERVAL (COALESCE(c.grace_days_override, NULLIF(c.due_grace_days,0), ?) + COALESCE(?,0) + 1) DAY), COALESCE(c.isolation_time_override, ?)) <= NOW()`,
    [Number(settings.grace_days ?? 2), Number(settings.isolation_day_offset || 0), settings.isolation_time || '00:01:00']
  );
  const { setCustomerProfile } = await import('./mikrotik.js');
  const results = [];
  for (const customer of overdue) {
    if (customer.isolation_status === 'isolated') continue;
    try { results.push({ customerId: customer.id, mode: 'isolate', ...(await setCustomerProfile(customer.id, 'isolate')) }); }
    catch (e) {
      await pool.execute("UPDATE customers SET isolation_status='error' WHERE id=?", [customer.id]);
      await logActivity('customer_isolation_failed', 'customer', customer.id, { error: e.message });
      results.push({ customerId: customer.id, ok: false, error: e.message });
    }
  }
  if (Number(settings.auto_reactivate) === 1) {
    const [paidIsolated] = await pool.execute(
      `SELECT c.id FROM customers c WHERE c.active=1 AND c.isolation_status='isolated' AND c.customer_status='active'
       AND (c.skip_mass_isolation=1 OR c.isolation_enabled=0 OR NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id=c.id AND i.status IN ('unpaid','partial')
         AND TIMESTAMP(DATE_ADD(i.due_date, INTERVAL (COALESCE(c.grace_days_override, NULLIF(c.due_grace_days,0), ?) + COALESCE(?,0) + 1) DAY), COALESCE(c.isolation_time_override, ?)) <= NOW()))`,
      [Number(settings.grace_days ?? 2), Number(settings.isolation_day_offset || 0), settings.isolation_time || '00:01:00']
    );
    for (const customer of paidIsolated) {
      try { results.push({ customerId: customer.id, mode: 'reactivate', ...(await setCustomerProfile(customer.id, 'reactivate')) }); }
      catch (e) { await logActivity('customer_reactivation_failed', 'customer', customer.id, { error: e.message }); results.push({ customerId: customer.id, ok: false, error: e.message }); }
    }
  }
  return results;
}

