#!/usr/bin/env node
/**
 * Import the GreytHR "CTC Breakup Report" master into hr_employee_salaries.
 *
 * WHY THIS EXISTS
 * The ERP held salary rows for only 18 employees while the payroll master
 * covered 68, so an ERP payroll run silently omitted ~50 staff. This backfills
 * the real, currently-approved entitlement for every employee in the master.
 *
 * The master is authoritative: its per-employee amounts are used verbatim, NOT
 * recomputed through calculateCTCBreakup(). Only three relationships in that
 * function actually hold across the roster (gratuity 4.81%, LTA 8.33%, and the
 * special-allowance plug); HRA/washing/medical/project/accommodation/food/
 * transport are individually negotiated and match no formula, so deriving them
 * would overwrite real approved figures with invented ones.
 *
 * Employer PF nuance: the master's FULL EMPLOYER PF column reads 0 for 10
 * employees whose CTC nonetheless includes the standard ₹1,950
 * (PF 1,800 = 12% of the ₹15,000 ceiling, + EDLI 75 + EPF admin 75). Computing
 * it rather than trusting the column reconciles the special-allowance plug on
 * 67/68 rows; trusting the column reconciles only 58. So we compute.
 *
 * Usage:
 *   node scripts/import-ctc-master.js --file "path/to/CTC Breakup Report.xls"
 *   node scripts/import-ctc-master.js --file "..." --commit
 *
 * Dry-run by default: prints the full diff and writes nothing without --commit.
 */
const path = require('path');
const XLSX = require('xlsx');

// Load DATABASE_URL the same way the app does, falling back to the local
// dburl.txt used for one-off maintenance scripts.
if (!process.env.DATABASE_URL) {
  const fs = require('fs');
  const local = path.join(__dirname, '..', 'dburl.txt');
  if (fs.existsSync(local)) process.env.DATABASE_URL = fs.readFileSync(local, 'utf8').trim();
}
const { query } = require('../src/config/database');

const PF_WAGE_CEILING = 15000;
const EDLI = 75;
const EPF_ADMIN = 75;

const args = process.argv.slice(2);
const argVal = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const COMMIT = args.includes('--commit');
const FILE = argVal('--file');
const COMPANY_ID = argVal('--company') || '83b84668-7840-444e-8df9-350202e7bca0';

if (!FILE) {
  console.error('ERROR: --file "path/to/CTC Breakup Report.xls" is required');
  process.exit(1);
}

// Master column header → hr_employee_salaries column.
const COLUMN_MAP = {
  'FULL BASIC': 'basic',
  'FULL DA': 'vda',
  'FULL HRA': 'hra',
  'FULL CONVEYANCE': 'conveyance_allowance',
  'FULL SPECIAL ALLOWANCE': 'special_allowance',
  'FULL MEDICAL ALLOWANCE': 'medical',
  'FULL EDUCATION ALLOWANCE': 'education_allowance',
  'FULL Fixed Site Allowance': 'fixed_site_allowance',
  'FULL Variable Site Allowance': 'variable_site_allowance',
  'FULL WASHING ALLOWANCE': 'washing_allowance',
  'FULL LTA': 'lta',
  'FULL MOBILE ALLOWANCE': 'mobile_allowance',
  'FULL PROJECT SPECIAL ALLOWANCE': 'project_allowance',
  'FULL ACCOMMODATION ALLOWANCE': 'accommodation_allowance',
  'FULL FOOD': 'food_allowance',
  'FULL TRANSPORT': 'transport_allowance',
  'FULL EMPLOYER ESI': 'employer_esi',
  'FULL GRATUIY': 'gratuity',
  'FULL VALUE OF FOOD CONCESSION': 'value_of_food_concession',
  'FULL OUTSTATION ALLOWANCE': 'outstation_allowance',
  'FULL CITY SPECIAL ALLOWANCE': 'city_special_allowance',
};
// Earning components that make up gross pay (excludes employer-side CTC items,
// which are a cost to the company but never paid to the employee).
const EARNING_COLS = [
  'basic', 'vda', 'hra', 'conveyance_allowance', 'special_allowance', 'medical',
  'education_allowance', 'fixed_site_allowance', 'variable_site_allowance',
  'washing_allowance', 'lta', 'mobile_allowance', 'project_allowance',
  'accommodation_allowance', 'food_allowance', 'transport_allowance',
  'value_of_food_concession', 'outstation_allowance', 'city_special_allowance',
];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Excel serial date → JS Date (Excel epoch 1899-12-30, accounting for its
// non-existent 1900 leap day).
const excelDate = (serial) => {
  const n = parseFloat(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
};
const ymd = (d) => d.toISOString().slice(0, 10);

async function main() {
  const wb = XLSX.readFile(FILE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  // Layout: title rows 0-2, header row 3, data from row 4.
  const header = grid[3].map((h) => String(h || '').trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (const key of Object.keys(COLUMN_MAP)) {
    if (idx[key] === undefined) {
      console.error(`ERROR: expected column "${key}" not found in ${path.basename(FILE)}`);
      console.error('Found headers:', header.filter(Boolean).join(' | '));
      process.exit(1);
    }
  }

  const rows = grid.slice(4).filter((r) => r && String(r[idx['Name']] || '').trim());

  const results = { imported: [], unmatched: [], skipped: [] };

  for (const r of rows) {
    const name = String(r[idx['Name']]).trim();
    const rawCode = r[idx['Employee No']];
    const ctcMonthly = num(r[idx['MONTHLY CTC']]);

    // Placeholder/section rows carry a name but no CTC — never create a salary
    // record from one (the master has at least one, "Krishnagiri").
    if (!ctcMonthly) { results.skipped.push({ name, reason: 'no MONTHLY CTC' }); continue; }
    if (rawCode === undefined || rawCode === null || rawCode === '') {
      results.skipped.push({ name, reason: 'no Employee No' }); continue;
    }
    const empCode = String(parseInt(rawCode, 10));

    // users.employee_code is stored inconsistently — some zero-padded ("003"),
    // some not ("1"). Match either form. If that turns up MORE THAN ONE user
    // (confirmed to happen for employee_code "1": a duplicate "001"/active and
    // "1"/inactive record both exist), stop and surface it rather than silently
    // picking one — a script has no business resolving a data-duplication
    // question on its own.
    const u = await query(
      `SELECT id, name, is_active, employee_code FROM users
        WHERE company_id=$1 AND (employee_code = $2 OR employee_code = LPAD($2, 3, '0') OR employee_code::int = $2::int)`,
      [COMPANY_ID, empCode]
    ).catch(() => ({ rows: [] })); // employee_code::int cast fails for non-numeric codes elsewhere in the table — fall back below
    let candidates = u.rows;
    if (!candidates.length) {
      const fallback = await query(
        `SELECT id, name, is_active, employee_code FROM users
          WHERE company_id=$1 AND (employee_code = $2 OR employee_code = LPAD($2, 3, '0'))`,
        [COMPANY_ID, empCode]
      );
      candidates = fallback.rows;
    }
    if (!candidates.length) { results.unmatched.push({ name, empCode }); continue; }
    if (candidates.length > 1) {
      results.skipped.push({
        name,
        reason: `AMBIGUOUS — ${candidates.length} user records match code ${empCode}: ` +
          candidates.map((c) => `${c.employee_code}:${c.name}:${c.is_active ? 'active' : 'inactive'}`).join(', ') +
          ' — resolve the duplicate in the ERP first, then re-run',
      });
      continue;
    }
    const user = candidates[0];

    const vals = {};
    for (const [xlCol, dbCol] of Object.entries(COLUMN_MAP)) vals[dbCol] = num(r[idx[xlCol]]);

    // Employer PF computed, not read — see the header note on the 10 rows whose
    // column reads 0 while their CTC still carries the charge.
    vals.employer_pf = Math.round(Math.min(vals.basic, PF_WAGE_CEILING) * 0.12);
    vals.employee_pf = vals.employer_pf;
    vals.edli = EDLI;
    vals.epf_admin = EPF_ADMIN;

    vals.gross_monthly = EARNING_COLS.reduce((s, c) => s + (vals[c] || 0), 0);
    vals.ctc_annual = num(r[idx['ANNUAL CTC']]) || ctcMonthly * 12;

    const eff = excelDate(r[idx['Effective Date']]);
    const effectiveFrom = eff ? ymd(eff) : null;
    if (!effectiveFrom) { results.skipped.push({ name, reason: 'no Effective Date' }); continue; }

    const prior = await query(
      `SELECT id, basic, gross_monthly, effective_from FROM hr_employee_salaries
        WHERE user_id=$1 AND effective_from<=$2 AND (effective_to IS NULL OR effective_to>=$2)`,
      [user.id, effectiveFrom]
    );

    results.imported.push({
      name, empCode, userName: user.name, isActive: user.is_active,
      effectiveFrom, ctcMonthly,
      basic: vals.basic, gross: vals.gross_monthly,
      supersedes: prior.rows.map((p) => ({
        id: p.id, basic: num(p.basic), gross: num(p.gross_monthly),
        from: p.effective_from && ymd(new Date(p.effective_from)),
      })),
    });

    if (!COMMIT) continue;

    // Same versioning the salary-assignment endpoint uses: close any record in
    // force on the new effective date, then insert the new one.
    await query(
      `UPDATE hr_employee_salaries SET effective_to = ($1::date - INTERVAL '1 day')
        WHERE user_id=$2 AND effective_from<=$1 AND (effective_to IS NULL OR effective_to>=$1)`,
      [effectiveFrom, user.id]
    );

    const insertCols = ['user_id', 'effective_from', ...Object.keys(vals)];
    const insertVals = [user.id, effectiveFrom, ...Object.values(vals)];
    await query(
      `INSERT INTO hr_employee_salaries (${insertCols.join(',')})
       VALUES (${insertCols.map((_, i) => `$${i + 1}`).join(',')})`,
      insertVals
    );
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n${COMMIT ? 'IMPORTED' : 'DRY RUN — nothing written'}`);
  console.log(`File: ${path.basename(FILE)}`);
  console.log(`\nWould import / imported: ${results.imported.length}`);
  console.log(
    `${'Code'.padEnd(6)}${'Name'.padEnd(30)}${'EffFrom'.padEnd(12)}` +
    `${'CTC/mo'.padStart(10)}${'Basic'.padStart(9)}${'Gross'.padStart(10)}  Note`
  );
  for (const i of results.imported) {
    const notes = [];
    if (!i.isActive) notes.push('INACTIVE USER');
    if (i.supersedes.length) {
      notes.push(`supersedes ${i.supersedes.map((s) => `gross ${s.gross}→${i.gross}`).join('; ')}`);
    }
    console.log(
      `${i.empCode.padEnd(6)}${i.userName.slice(0, 29).padEnd(30)}${i.effectiveFrom.padEnd(12)}` +
      `${i.ctcMonthly.toFixed(0).padStart(10)}${i.basic.toFixed(0).padStart(9)}` +
      `${i.gross.toFixed(0).padStart(10)}  ${notes.join(' | ')}`
    );
  }

  if (results.unmatched.length) {
    console.log(`\n⚠ UNMATCHED — no users row for these employee codes (skipped, never guessed):`);
    for (const u of results.unmatched) console.log(`   ${u.empCode.padEnd(6)} ${u.name}`);
  }
  if (results.skipped.length) {
    console.log(`\nSkipped rows:`);
    for (const s of results.skipped) console.log(`   ${s.name} — ${s.reason}`);
  }
  const inactive = results.imported.filter((i) => !i.isActive);
  if (inactive.length) {
    console.log(
      `\nNote: ${inactive.length} imported employee(s) are is_active=false and will still be ` +
      `excluded from payroll runs by the is_active filter in POST /run:`
    );
    for (const i of inactive) console.log(`   ${i.empCode.padEnd(6)} ${i.userName}`);
  }
  if (!COMMIT) console.log(`\nRe-run with --commit to write.`);

  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
