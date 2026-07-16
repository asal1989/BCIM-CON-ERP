// Usage: node src/config/migrations/run_037_sc_attendance_unique.js
require('dotenv').config();
const { pool } = require('../database');

async function run() {
  const client = await pool.connect();
  try {
    console.log('▶ Migration 037: Add UNIQUE(worker_id, attendance_date) to sc_attendance...');
    await client.query(`
      ALTER TABLE sc_attendance
        ADD CONSTRAINT IF NOT EXISTS sc_attendance_worker_date_unique
        UNIQUE (worker_id, attendance_date)
    `);
    console.log('  ✅ Constraint added (or already existed).');
    console.log('\n✅ Migration 037 complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
