// One-off: enter RA-01/RA-02/RA-03 client bills for project WDIRY0151 —
// Residential Apartments - Yelahanka (Retaining Wall & STP) — client:
// Divyashree (Divyasree) Infrastructure Projects Pvt Ltd. Source:
// WDIRY0151-BCIM Engineering Pvt Ltd-RA0{2,3}.xlsx, sheet "Abstract- RA0{2,3}".
//
// Each bill's figures are reconciled exactly against its sheet's "Total" /
// "Total for Deductions" / "Total Net Certified" rows for both the
// cumulative-upto-previous-bill and present-bill columns. "Steel
// Deductions" and "Steel Advance (BCIM Supply)" are combined into a single
// net material_recovery_steel figure per confirmed instruction (advance
// nets against the deduction, increasing amount owed). RA-03 additionally
// has a "Material advance (Swell bar)" line with the same net-addition
// treatment, mapped to material_recovery_cement since no dedicated field
// exists.
//
// Skips any bill whose number (or known alternate, e.g. RA-01 entered
// manually as just "RA-01") already exists for this project — safe to
// re-run.
require('dotenv').config();

const { pool, withTransaction } = require('../src/config/database');

const PROJECT_CODE = 'WDIRY0151';
const CLIENT_NAME = 'Divyashree Infrastructure Projects Pvt Ltd';
const RETENTION_PCT = 5;
const GST_RATE = 18;

const BILLS = [
  {
    bill_number: 'WDIRY0151-RA-01',
    alt_numbers: ['RA-01'], // may already exist under this name from manual entry
    bill_date: '2026-01-06', // confirmed by user
    gross_amount: 5491450.081653, // items (cum upto prev) + RMC esc (67332.734153) + Steel esc (-33673)
    mobilization_advance_recovery: 1098290.016331,
    material_recovery_steel: 1803929.956, // no Steel Advance yet
    material_recovery_cement: 0,
    other_deductions: 0,
    status: 'certified',
    items: {
      '01.36.61.01.25.56.95':  { prev: 0, present: 135.46918 },
      '01.36.61.01.25.56.96':  { prev: 0, present: 25.10475 },
      '01.36.61.01.25.56.97':  { prev: 0, present: 87.8865 },
      '01.36.61.01.25.56.98':  { prev: 0, present: 263.13185 },
      '01.36.61.01.25.56.99':  { prev: 0, present: 4.1325 },
      '01.36.61.01.25.56.100': { prev: 0, present: 126.9965 },
      '01.36.61.01.25.56.101': { prev: 0, present: 32.55 },
      '01.36.61.01.25.56.102': { prev: 0, present: 33.673 },
      '01.36.61.01.25.56.103': { prev: 0, present: 268.86075 },
    },
  },
  {
    bill_number: 'WDIRY0151-RA-02',
    alt_numbers: [],
    bill_date: '2026-02-25', // confirmed by user
    gross_amount: 10107122.396124, // items (present) + RMC esc (140434.859068) + Steel esc (-13669.95)
    mobilization_advance_recovery: 2021424.479225,
    material_recovery_steel: -1411845.068, // net: Steel Deductions 1,936,494.932 minus Steel Advance 3,348,340
    material_recovery_cement: 0,
    other_deductions: 250000, // Hold for quality issue (Retaining wall)
    status: 'submitted',
    items: {
      '01.36.61.01.25.56.95':  { prev: 135.46918,    present: 242.05068 },
      '01.36.61.01.25.56.96':  { prev: 25.10475,     present: 159.8923794780 },
      '01.36.61.01.25.56.97':  { prev: 87.8865,      present: 37.118925 },
      '01.36.61.01.25.56.98':  { prev: 263.13185,    present: 341.528575 },
      '01.36.61.01.25.56.99':  { prev: 4.1325,       present: 289.117715 },
      '01.36.61.01.25.56.100': { prev: 126.9965,     present: 262.4185 },
      '01.36.61.01.25.56.101': { prev: 32.55,        present: 1575.4826 },
      '01.36.61.01.25.56.102': { prev: 33.673,       present: 38.523 },
      '01.36.61.01.25.56.103': { prev: 268.86075,    present: 634.46949 },
    },
  },
  {
    bill_number: 'WDIRY0151-RA-03',
    alt_numbers: ['RA-03'],
    bill_date: '2026-04-17', // confirmed by user
    gross_amount: 6805856.082283, // items (present) + RMC esc (61499.690448) + Steel esc (16204.65)
    mobilization_advance_recovery: 1361171.216457,
    material_recovery_steel: 1254415.132, // net: Steel Deductions 1,857,116.332 minus Steel Advance 602,701.2 (still a net deduction this period, unlike RA-02)
    material_recovery_cement: -419682, // Material advance (Swell bar) — net addition to payable
    other_deductions: 0, // Hold for quality issue carries forward unchanged this period (no new amount)
    status: 'submitted',
    items: {
      '01.36.61.01.25.56.95':  { prev: 377.5198600000001,    present: 4041.439732261798 },
      '01.36.61.01.25.56.96':  { prev: 184.99712947799924,   present: 278.4444846479998 },
      '01.36.61.01.25.56.97':  { prev: 125.00542500000643,   present: 3.836250000000149 },
      '01.36.61.01.25.56.98':  { prev: 604.6604250000019,    present: 58.19401000000022 },
      '01.36.61.01.25.56.99':  { prev: 293.2502149999996,    present: 180.80177999999984 },
      '01.36.61.01.25.56.100': { prev: 389.41500000000156,   present: 49.005600000000186 },
      '01.36.61.01.25.56.101': { prev: 1608.0325999999982,   present: 1241.3233999999982 },
      '01.36.61.01.25.56.102': { prev: 72.196,               present: 31.613000000000014 },
      '01.36.61.01.25.56.103': { prev: 903.3302400000017,    present: 15.11 },
      '01.36.61.01.25.56.109': { prev: 0,                    present: 609 }, // Tie rod Hole Treatment — first movement
    },
  },
  {
    bill_number: 'WDIRY0151-RA-04',
    alt_numbers: ['RA-04'],
    bill_date: '2026-06-10', // "Date : 10-06-2026" on the RA-04 sheet
    gross_amount: 3997179.070137, // items (present) + RMC esc (0) + Steel esc (8030.0)
    mobilization_advance_recovery: 0, // none this period
    material_recovery_steel: 649455.244, // Steel Deductions only — no Steel Advance offset this period
    material_recovery_cement: 0,
    other_deductions: 0, // Hold for quality issue carries forward unchanged
    status: 'submitted',
    items: {
      '01.36.61.01.25.56.95':  { prev: 4418.9595922618,    present: 1872.9246499999974 },
      '01.36.61.01.25.56.98':  { prev: 662.854435000002,   present: 15.40696500000007 },
      '01.36.61.01.25.56.99':  { prev: 474.05199499999947, present: 145.88146624999987 },
      '01.36.61.01.25.56.100': { prev: 438.42060000000174, present: 14.575400000000059 },
      '01.36.61.01.25.56.101': { prev: 2849.355999999996,  present: 884.7811299999988 },
      '01.36.61.01.25.56.102': { prev: 103.80900000000001, present: 12.015 },
      '01.36.61.01.25.56.109': { prev: 609,                present: 572 },
      '01.36.61.01.25.56.110': { prev: 0,                  present: 470.796 }, // Construction joint treatment — first movement
    },
  },
];

async function insertRaBill(client, cfg, companyId, projectId, userId, boqBySrNo) {
  const retention_amount = cfg.gross_amount * (RETENTION_PCT / 100);
  const gst_amount = cfg.gross_amount * (GST_RATE / 100);
  const gross_with_gst = cfg.gross_amount + gst_amount;
  const total_deductions =
    retention_amount +
    cfg.mobilization_advance_recovery +
    cfg.material_recovery_steel +
    cfg.material_recovery_cement +
    cfg.other_deductions;
  const net_payable = gross_with_gst - total_deductions;

  const header = await client.query(
    `INSERT INTO ra_bills
       (project_id, company_id, bill_number, bill_date, work_description,
        gross_amount, gst_rate, gst_amount, gross_with_gst,
        retention_pct, retention_amount,
        mobilization_advance_recovery, material_recovery_steel, material_recovery_cement,
        other_deductions, tds_rate, tds_amount,
        total_deductions, net_payable, status, created_by,
        contractor_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,0,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      projectId, companyId, cfg.bill_number, cfg.bill_date,
      'Civil works for Retaining wall and STP',
      cfg.gross_amount, GST_RATE, gst_amount, gross_with_gst,
      RETENTION_PCT, retention_amount,
      cfg.mobilization_advance_recovery, cfg.material_recovery_steel, cfg.material_recovery_cement,
      cfg.other_deductions,
      total_deductions, net_payable, cfg.status, userId,
      CLIENT_NAME,
    ]
  );
  const billId = header.rows[0].id;

  for (const [srNo, qtys] of Object.entries(cfg.items)) {
    const boq = boqBySrNo.get(srNo);
    if (!boq) throw new Error(`BOQ item ${srNo} not found for project`);
    if (!qtys.present) continue;
    await client.query(
      `INSERT INTO ra_bill_items (ra_bill_id, boq_item_id, prev_certified_qty, current_qty, cumulative_qty, rate)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [billId, boq.id, qtys.prev, qtys.present, qtys.prev + qtys.present, boq.rate]
    );
  }

  return header.rows[0];
}

async function main() {
  const userRes = await pool.query(`SELECT id, company_id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1`);
  const { id: userId, company_id: companyId } = userRes.rows[0];

  const projRes = await pool.query(`SELECT id FROM projects WHERE project_code = $1 AND company_id = $2`, [PROJECT_CODE, companyId]);
  if (!projRes.rows.length) throw new Error(`Project ${PROJECT_CODE} not found`);
  const projectId = projRes.rows[0].id;

  const existing = await pool.query(`SELECT bill_number FROM ra_bills WHERE project_id = $1`, [projectId]);
  const existingNumbers = new Set(existing.rows.map(r => r.bill_number));

  const boqRes = await pool.query(`SELECT id, sr_no, rate FROM boq_items WHERE project_id = $1`, [projectId]);
  const boqBySrNo = new Map(boqRes.rows.map(r => [r.sr_no, r]));

  const results = {};
  await withTransaction(async (client) => {
    for (const cfg of BILLS) {
      const alreadyThere = existingNumbers.has(cfg.bill_number) || cfg.alt_numbers.some(a => existingNumbers.has(a));
      if (alreadyThere) {
        results[cfg.bill_number] = 'skipped (already exists)';
        continue;
      }
      const row = await insertRaBill(client, cfg, companyId, projectId, userId, boqBySrNo);
      results[cfg.bill_number] = { net_payable: row.net_payable, status: row.status };
    }
  });

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
