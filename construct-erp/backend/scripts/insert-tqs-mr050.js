#!/usr/bin/env node
/**
 * insert-tqs-mr050.js
 *
 * Inserts MR-050 (from MIS 114 page 2) directly into the DB for the TQS / DQS tower project.
 * Serial is forced to BCIM-TQS-BLR-MR050 (matching the physical document).
 *
 * Modes:
 *   node scripts/insert-tqs-mr050.js            # DRY RUN — shows what would be inserted
 *   node scripts/insert-tqs-mr050.js --create   # Actually inserts
 *
 * Run from the backend/ directory:
 *   DATABASE_URL="..." node scripts/insert-tqs-mr050.js --create
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'constructerp',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl:      false,
      }
);

const DO_CREATE = process.argv.includes('--create');

// ── MR data from MIS 114 page 2 (BCIM internal MR) ──────────────────────────
const SERIAL      = 'BCIM-DQS-BLR-MR050';   // ERP serial (DQS Towers prefix); physical doc showed BCIM-TQS-BLR-MR-050
const MR_DATE     = '2026-06-05';
const REQUIRED_BY = '2026-06-15';
const DEPARTMENT  = 'Projects';
const NARRATION   = 'Supply of Steel for Tower area work for BCIM (DC). Entered from MIS 114 (BCIM-TQS-BLR-MR-050 dated 05-06-2026). Requested by P Pavithra, approved by PM Ananthan N & GM Uday Kumar Antin.';

const ITEMS = [
  { material: 'Steel 8mm',  qty: 15, unit: 'MT' },
  { material: 'Steel 10mm', qty: 15, unit: 'MT' },
  { material: 'Steel 12mm', qty: 30, unit: 'MT' },
  { material: 'Steel 16mm', qty: 30, unit: 'MT' },
  { material: 'Steel 20mm', qty: 25, unit: 'MT' },
  { material: 'Steel 25mm', qty: 10, unit: 'MT' },
];

// Search terms to locate the project — tries TQS first, then DQS
const PROJECT_TERMS = ['tqs', 'quiet', 'dqs'];

(async () => {
  const client = await pool.connect();
  try {
    // 1. Find project
    const projRes = await client.query(
      `SELECT id, name, project_code, company_id, mrs_prefix
       FROM projects
       WHERE is_active = true
         AND (
           LOWER(name) LIKE '%tqs%' OR LOWER(name) LIKE '%quiet%' OR
           LOWER(project_code) LIKE '%tqs%' OR LOWER(name) LIKE '%dqs%' OR
           LOWER(project_code) LIKE '%dqs%'
         )
       ORDER BY name`
    );

    if (!projRes.rows.length) {
      console.error('❌ No project found matching TQS/Quiet/DQS. Check project names in DB.');
      process.exit(1);
    }
    if (projRes.rows.length > 1) {
      console.log('Multiple matches — using first. All matches:');
      projRes.rows.forEach(p => console.log(`  - "${p.name}"  code=${p.project_code}  id=${p.id}`));
    }
    const proj = projRes.rows[0];
    console.log(`\nTarget project: "${proj.name}"  (${proj.id})`);
    console.log(`  project_code=${proj.project_code}  mrs_prefix=${proj.mrs_prefix || '-'}`);

    // 2. Check for duplicate serial
    const dup = await client.query(
      `SELECT id, serial_no_formatted, status FROM material_requisitions WHERE serial_no_formatted = $1`,
      [SERIAL]
    );
    if (dup.rows.length) {
      console.log(`\n⚠️  An MR with serial "${SERIAL}" already exists:`);
      dup.rows.forEach(r => console.log(`  id=${r.id}  status=${r.status}`));
      if (!DO_CREATE) console.log('(DRY RUN — would abort due to duplicate)');
      else { console.error('❌ Aborting — duplicate serial.'); process.exit(1); }
      return;
    }

    // 3. Find the user to assign as "raised_by" — admin/super_admin of same company
    const userRes = await client.query(
      `SELECT id, name, email FROM users
       WHERE company_id = $1 AND is_active = true AND role IN ('super_admin','admin')
       ORDER BY created_at ASC LIMIT 1`,
      [proj.company_id]
    );
    if (!userRes.rows.length) {
      console.error('❌ No admin user found for this company.');
      process.exit(1);
    }
    const raisedBy = userRes.rows[0];
    console.log(`  raised_by: ${raisedBy.name} (${raisedBy.email})`);

    console.log(`\n─── MR to insert ───`);
    console.log(`  Serial      : ${SERIAL}`);
    console.log(`  Date        : ${MR_DATE}`);
    console.log(`  Required by : ${REQUIRED_BY}`);
    console.log(`  Department  : ${DEPARTMENT}`);
    console.log(`  Items       :`);
    ITEMS.forEach((it, i) => console.log(`    ${i + 1}. ${it.material}  ${it.qty} ${it.unit}`));
    console.log(`  Narration   : ${NARRATION.substring(0, 80)}...`);

    if (!DO_CREATE) {
      console.log('\n(DRY RUN — nothing inserted. Re-run with --create to commit.)\n');
      return;
    }

    // 4. Insert MR
    await client.query('BEGIN');
    const mrRes = await client.query(
      `INSERT INTO material_requisitions (
         project_id, mrs_number, serial_no_formatted, department,
         head_office_project_name, required_by, priority, remarks,
         raised_by, status, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10) RETURNING *`,
      [
        proj.id,
        SERIAL,              // mrs_number = serial (same as new logic)
        SERIAL,
        DEPARTMENT,
        proj.name,
        REQUIRED_BY,
        'medium',
        NARRATION,
        raisedBy.id,
        MR_DATE,
      ]
    );
    const mr = mrRes.rows[0];

    // 5. Insert items
    for (let i = 0; i < ITEMS.length; i++) {
      const { material, qty, unit } = ITEMS[i];
      await client.query(
        `INSERT INTO mrs_items (mrs_id, material_name, quantity, unit, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [mr.id, material, qty, unit, i + 1]
      );
    }

    await client.query('COMMIT');
    console.log(`\n✅ Inserted MR: ${mr.serial_no_formatted}  (id: ${mr.id})`);
    console.log(`   ${ITEMS.length} items inserted.`);
    console.log(`   Status: pending (awaiting stores approval in ERP)\n`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
