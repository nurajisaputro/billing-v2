import { RouterOSAPI } from 'node-routeros';
import { pool } from './db.js';
import { logActivity } from './log.js';
import { decryptSecret } from './crypto.js';

async function withRouter(routerId, fn) {
  const [rows] = await pool.execute('SELECT * FROM routers WHERE id = ? AND enabled = 1', [routerId]);
  if (!rows.length) throw new Error('Router tidak ditemukan atau sedang dinonaktifkan');
  const router = rows[0];
  const api = new RouterOSAPI({ host: router.host, user: router.username, password: decryptSecret(router.password_enc), port: Number(router.port), timeout: 8000 });
  try {
    await api.connect();
    await pool.execute("UPDATE routers SET last_status='online', last_checked_at=NOW() WHERE id=?", [routerId]);
    return await fn(api, router);
  } catch (error) {
    await pool.execute("UPDATE routers SET last_status='error', last_checked_at=NOW() WHERE id=?", [routerId]).catch(() => {});
    throw error;
  } finally {
    try { await api.close(); } catch {}
  }
}

export async function testRouter(routerId) {
  return withRouter(routerId, async (api) => {
    const identity = await api.write('/system/identity/print');
    return { ok: true, identity: identity?.[0]?.name || 'MikroTik', message: 'Koneksi berhasil' };
  });
}

export async function listPppSecrets(routerId) {
  return withRouter(routerId, async (api) => api.write('/ppp/secret/print'));
}

export async function listPppProfiles(routerId) {
  return withRouter(routerId, async (api) => api.write('/ppp/profile/print'));
}

export async function listActivePppSessions(routerId) {
  return withRouter(routerId, async (api) => api.write('/ppp/active/print'));
}

export async function setCustomerProfile(customerId, mode) {
  const [rows] = await pool.execute(
    `SELECT c.*, r.isolation_profile FROM customers c JOIN routers r ON r.id=c.router_id WHERE c.id=?`, [customerId]
  );
  if (!rows.length) throw new Error('Pelanggan atau router belum dikonfigurasi');
  const customer = rows[0];
  if (!customer.pppoe_username) throw new Error('Username PPPoE belum diisi');

  return withRouter(customer.router_id, async (api, router) => {
    if (mode === 'isolate') {
      if (router.isolation_profile !== 'KV-ISOLIR') {
        throw new Error('Profil isolir router belum divalidasi. Buka menu MikroTik lalu klik Validasi KV-ISOLIR.');
      }
      const profiles = await api.write('/ppp/profile/print');
      if (!profiles.some((profile) => profile.name === 'KV-ISOLIR')) {
        throw new Error('PPP Profile KV-ISOLIR tidak ditemukan di MikroTik; isolir dibatalkan demi keamanan.');
      }
    }
    const secrets = await api.write('/ppp/secret/print', [`?name=${customer.pppoe_username}`]);
    const secret = secrets.find((item) => item.name === customer.pppoe_username);
    if (!secret) throw new Error(`Secret PPPoE '${customer.pppoe_username}' tidak ditemukan di router`);

    let targetProfile;
    if (mode === 'isolate') {
      if (secret.profile !== router.isolation_profile) {
        await pool.execute('UPDATE customers SET original_ppp_profile=? WHERE id=? AND (original_ppp_profile IS NULL OR original_ppp_profile=\'\')', [secret.profile, customerId]);
      }
      targetProfile = router.isolation_profile;
    } else {
      const [saved] = await pool.execute('SELECT original_ppp_profile FROM customers WHERE id=?', [customerId]);
      targetProfile = saved[0]?.original_ppp_profile;
      if (!targetProfile) throw new Error('Profil asli belum tersimpan; demi keamanan, profil tidak diubah otomatis');
    }

    if (secret.profile !== targetProfile) {
      await api.write('/ppp/secret/set', [`=.id=${secret['.id']}`, `=profile=${targetProfile}`]);
    }
    const active = await api.write('/ppp/active/print', [`?name=${customer.pppoe_username}`]);
    for (const session of active) {
      await api.write('/ppp/active/remove', [`=.id=${session['.id']}`]);
    }

    const status = mode === 'isolate' ? 'isolated' : 'not_isolated';
    await pool.execute('UPDATE customers SET isolation_status=? WHERE id=?', [status, customerId]);
    await logActivity(mode === 'isolate' ? 'customer_isolated' : 'customer_reactivated', 'customer', customerId, { routerId: customer.router_id, username: customer.pppoe_username, profile: targetProfile });
    return { ok: true, username: customer.pppoe_username, profile: targetProfile, disconnectedSessions: active.length, status };
  });
}


/**
 * Validasi langsung ke PPP Secret pada setiap router. Hitungan hanya memasukkan
 * pelanggan yang Secret-nya benar-benar memakai profile persis KV-ISOLIR.
 * Router yang gagal diakses dilaporkan sebagai gagal, bukan dianggap nol isolir.
 */
export async function getKvIsolirStatus() {
  const [routers] = await pool.query('SELECT id, name FROM routers WHERE enabled = 1 ORDER BY name');
  const [customers] = await pool.query(
    `SELECT id, name, customer_code, router_id, pppoe_username
     FROM customers
     WHERE router_id IS NOT NULL AND pppoe_username IS NOT NULL AND pppoe_username <> ''
       AND customer_status <> 'terminated'`
  );
  const isolatedIds = new Set();
  const checkedRouters = [];
  const failedRouters = [];

  for (const router of routers) {
    try {
      const result = await withRouter(router.id, async (api) => {
        const [profiles, secrets] = await Promise.all([
          api.write('/ppp/profile/print'),
          api.write('/ppp/secret/print'),
        ]);
        return { profiles, secrets };
      });
      const profileExists = result.profiles.some((profile) => profile.name === 'KV-ISOLIR');
      if (!profileExists) {
        failedRouters.push({ id: Number(router.id), name: router.name, error: 'PPP Profile KV-ISOLIR tidak ditemukan di MikroTik' });
        continue;
      }
      const byName = new Map(result.secrets.map((secret) => [secret.name, secret]));
      for (const customer of customers) {
        if (Number(customer.router_id) !== Number(router.id)) continue;
        const secret = byName.get(customer.pppoe_username);
        if (secret?.profile === 'KV-ISOLIR') isolatedIds.add(Number(customer.id));
      }
      checkedRouters.push({ id: Number(router.id), name: router.name, profileExists: true });
    } catch (error) {
      failedRouters.push({ id: Number(router.id), name: router.name, error: error.message });
    }
  }

  return {
    profile: 'KV-ISOLIR',
    count: isolatedIds.size,
    checkedAt: new Date().toISOString(),
    totalRouters: routers.length,
    checkedRouters,
    failedRouters,
    complete: failedRouters.length === 0
  };
}


export async function configureKvIsolirProfile(routerId) {
  return withRouter(routerId, async (api, router) => {
    const profiles = await api.write('/ppp/profile/print');
    const exists = profiles.some((profile) => profile.name === 'KV-ISOLIR');
    if (!exists) throw new Error(`PPP Profile KV-ISOLIR tidak ditemukan di router ${router.name}. Buat profil tersebut di RouterOS terlebih dahulu.`);
    await pool.execute("UPDATE routers SET isolation_profile='KV-ISOLIR' WHERE id=?", [routerId]);
    await logActivity('router_isolation_profile_validated', 'router', Number(routerId), { profile: 'KV-ISOLIR' });
    return { ok: true, router: router.name, profile: 'KV-ISOLIR', message: 'Profile tersedia dan konfigurasi billing diperbarui' };
  });
}
