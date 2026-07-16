// Usage: node src/config/migrations/run_036_uppercase_bill_numbers.js
require('dotenv').config();
const { pool } = require('../database');

async function run() {
  const client = await pool.connect();
  try {
    console.log('▶ Migration 036: Uppercase inv_number in tqs_bills + bill_number in ra_bills...');

    const r1 = await client.query(`
      UPDATE tqs_bills
      SET inv_number = UPPER(TRIM(inv_number))
      WHERE inv_number IS NOT NULL
        AND TRIM(inv_number) <> ''
        AND inv_number <> UPPER(TRIM(inv_number))
    `);
    console.log(`  ✅ tqs_bills: ${r1.rowCount} row(s) updated`);

    const r2 = await client.query(`
      UPDATE ra_bills
      SET bill_number = UPPER(TRIM(bill_number))
      WHERE bill_number IS NOT NULL
        AND TRIM(bill_number) <> ''
        AND bill_number <> UPPER(TRIM(bill_number))
    `);
    console.log(`  ✅ ra_bills:  ${r2.rowCount} row(s) updated`);

    console.log('\n✅ Migration 036 complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
