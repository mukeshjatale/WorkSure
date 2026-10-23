// npm run check-db  -> tells you if the backend can talk to MySQL and if the tables exist.
require('dotenv').config();
const { query, pool } = require('../src/config/db');

(async () => {
  try {
    await query('SELECT 1');
    console.log('✔ Connected to MySQL.');
    const tables = await query('SHOW TABLES');
    const names = tables.map((t) => Object.values(t)[0]);
    const need = ['users', 'service_categories', 'services', 'worker_profiles', 'worker_services',
      'worker_availability', 'bookings', 'booking_status_history', 'reviews', 'admin_logs'];
    const missing = need.filter((n) => !names.includes(n));
    if (missing.length) console.log('✘ Missing tables (import schema.sql):', missing.join(', '));
    else console.log('✔ All %d WorkSure tables exist.', need.length);
    const cats = await query('SELECT COUNT(*) AS n FROM service_categories');
    console.log('  Categories in database:', cats[0].n, cats[0].n === 0 ? '(import seed.sql)' : '');
  } catch (err) {
    console.error('✘ Database check failed:', err.code || '', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
