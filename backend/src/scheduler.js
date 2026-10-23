import 'dotenv/config';
import { generateMonthlyInvoices, processIsolation } from './billing.js';
import { pool } from './db.js';
import { testRouter } from './mikrotik.js';

const timezone = process.env.APP_TIMEZONE || 'Asia/Jakarta';
process.env.TZ = timezone;
let billingBusy = false;
let routerCheckBusy = false;
let intervalHandle;
let routerIntervalHandle;

export async function runBillingSchedulerTick() {
  if (billingBusy) return { skipped: true, reason: 'previous billing tick still running' };
  billingBusy = true;
  const startedAt = new Date();
  try {
    const generated = await generateMonthlyInvoices(new Date(), false);
    const isolationResults = await processIsolation();
    const isolated = isolationResults.filter((r) => r.status === 'isolated' || r.mode === 'isolate' || r.action === 'isolate').length;
    const failures = isolationResults.filter((r) => r.ok === false).length;
    console.log(`[scheduler] billing tick OK at ${startedAt.toISOString()} timezone=${timezone}; invoices=${generated}; isolation_actions=${isolationResults.length}; failures=${failures}`);
    return { generated, isolationResults, failures };
  } catch (error) {
    console.error(`[scheduler] billing tick FAILED at ${startedAt.toISOString()}:`, error?.stack || error);
    throw error;
  } finally {
    billingBusy = false;
  }
}

export async function runRouterHealthCheck() {
  if (routerCheckBusy) return;
  routerCheckBusy = true;
  try {
    const [routers] = await pool.query('SELECT id, name FROM routers WHERE enabled=1 ORDER BY id');
    for (const router of routers) {
      try {
        await testRouter(router.id);
      } catch (error) {
        await pool.execute("UPDATE routers SET last_status='error', last_checked_at=NOW() WHERE id=?", [router.id]).catch(() => {});
        console.error(`[scheduler] router health check failed (${router.name}): ${error.message}`);
      }
    }
  } catch (error) {
    console.error('[scheduler] router health check failed:', error?.stack || error);
  } finally {
    routerCheckBusy = false;
  }
}

export function startScheduler() {
  if (String(process.env.SCHEDULER_ENABLED).toLowerCase() !== 'true') {
    console.log('[scheduler] disabled (SCHEDULER_ENABLED is not true)');
    return;
  }
  if (intervalHandle) return;
  console.log(`[scheduler] enabled; timezone=${timezone}; billing/isolation interval=60s; router health interval=120s`);
  // Start immediately after startup, then retry every minute. A single failure is logged and won't stop future ticks.
  setTimeout(() => runBillingSchedulerTick().catch(() => {}), 3_000);
  intervalHandle = setInterval(() => runBillingSchedulerTick().catch(() => {}), 60_000);
  setTimeout(() => runRouterHealthCheck().catch(() => {}), 8_000);
  routerIntervalHandle = setInterval(() => runRouterHealthCheck().catch(() => {}), 120_000);
}

export function stopScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  if (routerIntervalHandle) clearInterval(routerIntervalHandle);
  intervalHandle = undefined;
  routerIntervalHandle = undefined;
}
