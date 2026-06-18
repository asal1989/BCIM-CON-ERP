/**
 * fix-schema-gaps.js — One-time migration for missing tables & columns
 * Run: node src/scripts/fix-schema-gaps.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     process.env.DB_PORT     || 5432,
        database: process.env.DB_NAME     || 'constructerp',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
);

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running schema gap fixes...\n');

    const fixes = [
      // ── GRN missing columns ───────────────────────────────────────────────
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS material_name VARCHAR(200)`,         'GRN: material_name'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(12,3)`,    'GRN: quantity_received'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`,                   'GRN: unit'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(30)`,         'GRN: vehicle_number'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)`,           'GRN: driver_name'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS challan_number VARCHAR(50)`,         'GRN: challan_number'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)`,         'GRN: invoice_number'],
      [`ALTER TABLE grn ADD COLUMN IF NOT EXISTS serial_no_formatted VARCHAR(100)`,   'GRN: serial_no_formatted'],

      // ── PO missing column ─────────────────────────────────────────────────
      [`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery DATE`,  'PO: expected_delivery (alias for delivery_date)'],

      // ── Tenders missing company_id ────────────────────────────────────────
      [`ALTER TABLE tenders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)`, 'Tenders: company_id'],

      // ── Project-specific MRS prefix & per-project serial numbering ─────────
      [`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mrs_prefix VARCHAR(80)`,        'Projects: mrs_prefix (custom MRS serial prefix per project)'],
      // LANCO Hills LH10 → MR-LANCHO-HYD-LH10-xxx
      [`UPDATE projects SET mrs_prefix = 'MR-LANCHO-HYD-LH10'
        WHERE mrs_prefix IS NULL
          AND (name ILIKE '%lanco%' OR name ILIKE '%lancho%')
          AND (name ILIKE '%lh%10%' OR name ILIKE '%lh10%' OR project_code ILIKE '%LH-10%' OR project_code ILIKE '%LH10%')`,
        'Projects: mrs_prefix = MR-LANCHO-HYD-LH10 for LANCO Hills LH10'],
      // Residential Yelahanka → BCIM-DQS-BLR-MRxxx (no dash before number)
      [`UPDATE projects SET mrs_prefix = 'BCIM-DQS-BLR-MR'
        WHERE mrs_prefix IS NULL
          AND (name ILIKE '%yelahanka%' OR name ILIKE '%yelkhan%' OR project_code ILIKE '%DQS%BLR%' OR project_code ILIKE '%DQS-BLR%')`,
        'Projects: mrs_prefix = BCIM-DQS-BLR-MR for Residential Yelahanka'],
      [`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mrs_start_seq INTEGER NOT NULL DEFAULT 1`,
        'Projects: mrs_start_seq (seed MRS numbering from a specific number)'],
      [`UPDATE projects SET mrs_start_seq = 53
        WHERE (name ILIKE '%yelahanka%' OR name ILIKE '%yelkhan%' OR name ILIKE '%DQS Towers%'
               OR project_code ILIKE '%DQS%BLR%' OR project_code ILIKE '%DQS-BLR%' OR project_code ILIKE '%DQSTWR%')
          AND mrs_start_seq = 1`,
        'Projects: mrs_start_seq = 53 for DQS Towers/Yelahanka (physical MRs 001–052 pre-date ERP)'],
      // Renumber the two pre-existing Yelahanka MRs from the dashed -001/-002 format
      // to the legacy continuous serials 053/054 (kept, not deleted).
      [`UPDATE material_requisitions SET serial_no_formatted = 'BCIM-DQS-BLR-MR053', mrs_number = 'BCIM-DQS-BLR-MR053', updated_at = NOW()
        WHERE serial_no_formatted = 'BCIM-DQS-BLR-MR-001'
          AND NOT EXISTS (SELECT 1 FROM material_requisitions m2 WHERE m2.serial_no_formatted = 'BCIM-DQS-BLR-MR053')`,
        'MRS: BCIM-DQS-BLR-MR-001 → BCIM-DQS-BLR-MR053 (Yelahanka)'],
      [`UPDATE material_requisitions SET serial_no_formatted = 'BCIM-DQS-BLR-MR054', mrs_number = 'BCIM-DQS-BLR-MR054', updated_at = NOW()
        WHERE serial_no_formatted = 'BCIM-DQS-BLR-MR-002'
          AND NOT EXISTS (SELECT 1 FROM material_requisitions m2 WHERE m2.serial_no_formatted = 'BCIM-DQS-BLR-MR054')`,
        'MRS: BCIM-DQS-BLR-MR-002 → BCIM-DQS-BLR-MR054 (Yelahanka)'],

      // ── Finance columns (already in route guards, belt-and-suspenders) ───
      [`ALTER TABLE payments ADD COLUMN IF NOT EXISTS cost_head VARCHAR(100)`,        'Payments: cost_head'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(200)`,  'RA Bills: contractor_name'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_gstin VARCHAR(15)`,  'RA Bills: contractor_gstin'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_pan VARCHAR(10)`,    'RA Bills: contractor_pan'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS work_description TEXT`,         'RA Bills: work_description'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS price_escalation NUMERIC(15,2) DEFAULT 0`, 'RA Bills: price_escalation'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS certified_by UUID`,             'RA Bills: certified_by'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS certified_date TIMESTAMPTZ`,    'RA Bills: certified_date'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS client_tds_amount NUMERIC(15,2) DEFAULT 0`, 'RA Bills: client_tds_amount'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS amount_received NUMERIC(15,2) DEFAULT 0`,   'RA Bills: amount_received'],
      [`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS company_id UUID`,               'RA Bills: company_id'],

      // ── Document-number uniqueness guards (prevents duplicate serials under ──
      //    concurrent inserts; pairs with MAX-based number generation in routes) ─
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_grn_number              ON grn(grn_number)`,                                       'Unique: GRN number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_je_entry_no            ON journal_entries(company_id, entry_no)`,                  'Unique: Journal entry_no'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_cn_number              ON credit_notes(company_id, cn_number)`,                    'Unique: Credit note number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_dn_number              ON debit_notes(company_id, dn_number)`,                     'Unique: Debit note number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_car_proforma_no        ON client_advance_requests(company_id, proforma_no)`,       'Unique: Client advance proforma_no'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_vo_number              ON variation_orders(vo_number)`,                            'Unique: Variation order number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_code                ON sc_subcontractors(company_id, sc_code)`,                 'Unique: SC code'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_wo_number           ON sc_work_orders(company_id, wo_number)`,                  'Unique: SC work-order number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_bill_number         ON sc_bills(company_id, bill_number)`,                      'Unique: SC bill number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_mb_number           ON sc_mb_entries(company_id, mb_number)`,                   'Unique: SC MB number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_adv_number          ON sc_advances(company_id, adv_number)`,                    'Unique: SC advance number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_rr_number           ON sc_retention_releases(company_id, rr_number)`,           'Unique: SC retention-release number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_fb_number           ON sc_final_bills(company_id, fb_number)`,                  'Unique: SC final-bill number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_nmr_number          ON sc_nmr(company_id, nmr_number)`,                         'Unique: SC NMR number'],
      [`CREATE UNIQUE INDEX IF NOT EXISTS uq_amd_no                 ON po_amendments(company_id, amendment_no)`,                'Unique: PO amendment_no'],
    ];

    for (const [sql, label] of fixes) {
      try {
        await client.query(sql);
        console.log(`   ✔ ${label}`);
      } catch (e) {
        console.log(`   ⚠  ${label} — ${e.message}`);
      }
    }

    // ── snag_items table ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS snag_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES projects(id),
        snag_code VARCHAR(50),
        title VARCHAR(200) NOT NULL,
        description TEXT,
        zone VARCHAR(200),
        trade VARCHAR(50),
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
        status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open','in_progress','rectified','closed')),
        photos JSONB,
        due_date DATE,
        assigned_to_name VARCHAR(200),
        assigned_user_id UUID REFERENCES users(id),
        rectification_notes TEXT,
        qa_remarks TEXT,
        qa_signed_off_by UUID REFERENCES users(id),
        qa_signed_off_at TIMESTAMPTZ,
        closed_by UUID REFERENCES users(id),
        closed_at TIMESTAMPTZ,
        raised_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('   ✔ snag_items table');

    // ── invoice_items table ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
        material_name VARCHAR(200),
        unit VARCHAR(20),
        quantity_on_grn NUMERIC(12,3),
        quantity_invoiced NUMERIC(12,3) NOT NULL,
        rate_on_po NUMERIC(12,2),
        rate_invoiced NUMERIC(12,2) NOT NULL,
        tax_percent NUMERIC(5,2) DEFAULT 18,
        tax_amount NUMERIC(15,2) DEFAULT 0,
        net_amount NUMERIC(15,2),
        sort_order INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('   ✔ invoice_items table');

    // ── retention tables ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS retention_releases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        project_id UUID NOT NULL,
        release_number TEXT NOT NULL,
        contractor_name TEXT NOT NULL,
        release_date DATE NOT NULL,
        milestone TEXT NOT NULL DEFAULT 'partial',
        release_amount NUMERIC(15,2) NOT NULL,
        remarks TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by UUID,
        approved_at TIMESTAMPTZ,
        rejection_remarks TEXT,
        payment_date DATE,
        payment_ref TEXT,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS retention_release_seq (
        company_id UUID PRIMARY KEY,
        fiscal_year TEXT NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0
      )
    `);
    console.log('   ✔ retention_releases + retention_release_seq tables');

    // ── material_requisitions (MRS) tables ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS material_requisitions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES projects(id),
        mrs_number VARCHAR(30) UNIQUE NOT NULL,
        site_incharge VARCHAR(100),
        required_by DATE NOT NULL,
        priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        status VARCHAR(20) DEFAULT 'pending',
        raised_by UUID REFERENCES users(id),
        approved_by UUID REFERENCES users(id),
        approved_on TIMESTAMPTZ,
        remarks TEXT,
        department VARCHAR(100),
        serial_no_formatted VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mrs_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        mrs_id UUID REFERENCES material_requisitions(id) ON DELETE CASCADE,
        material_name VARCHAR(200) NOT NULL,
        quantity NUMERIC(12,3) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        purpose TEXT,
        sort_order INTEGER DEFAULT 1
      )
    `);
    console.log('   ✔ material_requisitions + mrs_items tables');

    // ── HR Leave tables ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_leave_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id),
        name TEXT NOT NULL,
        code TEXT,
        days_per_year NUMERIC(5,1) DEFAULT 0,
        carry_forward BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_leave_balances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        leave_type_id UUID REFERENCES hr_leave_types(id),
        year INT NOT NULL,
        opening_balance NUMERIC(5,1) DEFAULT 0,
        accrued NUMERIC(5,1) DEFAULT 0,
        taken NUMERIC(5,1) DEFAULT 0,
        carry_forwarded NUMERIC(5,1) DEFAULT 0,
        closing_balance NUMERIC(5,1) DEFAULT 0,
        UNIQUE(user_id, leave_type_id, year)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_leave_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id),
        user_id UUID REFERENCES users(id),
        leave_type_id UUID REFERENCES hr_leave_types(id),
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        days NUMERIC(4,1),
        half_day BOOLEAN DEFAULT FALSE,
        half_day_session TEXT,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        actioned_by UUID REFERENCES users(id),
        actioned_at TIMESTAMPTZ,
        rejection_reason TEXT
      )
    `);
    console.log('   ✔ hr_leave_types + hr_leave_balances + hr_leave_requests tables');

    console.log('\n✅  All schema gaps fixed successfully!');
    console.log('   Now run: pm2 restart 0\n');

  } catch (err) {
    console.error('❌  Fatal error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
