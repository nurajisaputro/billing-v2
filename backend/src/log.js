import { pool } from './db.js';
export async function logActivity(action, entityType, entityId = null, details = {}, actor = 'system') {
  await pool.execute(
    'INSERT INTO activity_logs (actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [actor, action, entityType, entityId, JSON.stringify(details)]
  );
}
