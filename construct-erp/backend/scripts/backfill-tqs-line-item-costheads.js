/**
 * Backfill cost_head on tqs_bill_line_items where it is NULL,
 * using classifyItemCostHead() based on item_name.
 *
 * Safe to run multiple times (only updates NULL rows).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const { classifyItemCostHead } = require('../src/constants/boqCostHeads');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'construct_erp', user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '' }
);

(async () => {
  const c = await pool.connect();
  try {
    const rows = await c.query(`SELECT id, item_name FROM tqs_bill_line_items WHERE cost_head IS NULL`);
    console.log(`Found ${rows.rows.length} line items with NULL cost_head`);

    let updated = 0;
    for (const row of rows.rows) {
      const head = classifyItemCostHead(row.item_name);
      await c.query(`UPDATE tqs_bill_line_items SET cost_head=$1 WHERE id=$2`, [head, row.id]);
      console.log(`  ${row.item_name.substring(0, 60).padEnd(60)} → ${head}`);
      updated++;
    }
    console.log(`\nDone. Updated ${updated} rows.`);
  } finally {
    c.release();
    await pool.end();
  }
})();
