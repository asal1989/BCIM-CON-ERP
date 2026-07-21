const { query } = require('../config/database');

const round2 = value => Math.round(Number(value || 0));
const cleanBalance = value => {
  const rounded = round2(value);
  return Math.abs(rounded) <= 5 ? 0 : rounded;
};

const billOutstandingSql = (b = 'b', u = 'u') => `
  CASE
    WHEN ${u}.certified_net IS NOT NULL
    THEN GREATEST(${u}.certified_net - COALESCE(${u}.paid_amount, 0), 0)
    ELSE GREATEST(
      COALESCE(${b}.total_amount, 0)
        - COALESCE(${u}.tds_deduction, 0)
        - COALESCE(${u}.other_deductions, 0)
        - COALESCE(${u}.advance_recovered, 0)
        - COALESCE(${u}.paid_amount, 0),
      0
    )
  END
`;

const billCreditSql = (b = 'b', u = 'u', advanceCreditSql = `COALESCE(${u}.advance_recovered, 0)`) => `
  (${billOutstandingSql(b, u)})
  + COALESCE(${u}.paid_amount, 0)
  + COALESCE(${u}.tds_deduction, 0)
  + COALESCE(${u}.other_deductions, 0)
  + (${advanceCreditSql})
`;

const normalizeAccountType = value => {
  const v = String(value || 'all').toLowerCase();
  return v === 'po' || v === 'wo' || v === 'sc' ? v : 'all';
};

const advanceSourceSql = (accountType, alias = 'a') => {
  const isWo = `(
    NULLIF(TRIM(COALESCE(${alias}.wo_number, '')), '') IS NOT NULL
    OR UPPER(TRIM(COALESCE(${alias}.po_number, ''))) LIKE 'WO%'
  )`;
  if (accountType === 'wo') return isWo;
  if (accountType === 'po') return `NOT ${isWo}`;
  return '';
};

const billSourceSql = (accountType, alias = 'b') => {
  const isWo = `(
    LOWER(TRIM(COALESCE(${alias}.bill_type, ''))) = 'wo'
    OR NULLIF(TRIM(COALESCE(${alias}.wo_number, '')), '') IS NOT NULL
    OR UPPER(TRIM(COALESCE(${alias}.po_number, ''))) LIKE 'WO%'
  )`;
  if (accountType === 'wo') return isWo;
  if (accountType === 'po') {
    return `NOT ${isWo} AND (
      LOWER(COALESCE(${alias}.bill_type, 'po')) = 'po'
      OR NULLIF(TRIM(COALESCE(${alias}.po_number, '')), '') IS NOT NULL
      OR ${alias}.bill_type IS NULL
    )`;
  }
  return '';
};

async function getVendorLiabilitySummary({
  companyId,
  projectId,
  fromDate,
  toDate,
  search,
  sourceType,
  billType,
  vendorId,
  projectIds,
} = {}) {
  const accountType = normalizeAccountType(sourceType || billType);
  const params = [companyId];
  let idx = 2;

  const billConds = [`(b.company_id = $1 OR b.company_id IS NULL)`, `b.is_deleted = FALSE`];
  const advConds = [`a.company_id = $1`];
  // tqs_advance_vouchers (Procurement Advance Tracker) — only disbursed advances
  const avConds = [`av.company_id = $1`, `av.is_deleted = FALSE`, `COALESCE(av.paid_amount, 0) > 0`];

  if (projectId && String(projectId).trim()) {
    billConds.push(`b.project_id = $${idx}`);
    advConds.push(`a.project_id = $${idx}`);
    avConds.push(`av.project_id = $${idx}`);
    params.push(projectId);
    idx++;
  } else if (Array.isArray(projectIds)) {
    if (projectIds.length === 0) {
      billConds.push('FALSE');
      advConds.push('FALSE');
      avConds.push('FALSE');
    } else {
      billConds.push(`b.project_id = ANY($${idx}::uuid[])`);
      advConds.push(`a.project_id = ANY($${idx}::uuid[])`);
      avConds.push(`av.project_id = ANY($${idx}::uuid[])`);
      params.push(projectIds);
      idx++;
    }
  }
  if (accountType === 'po' || accountType === 'wo') {
    billConds.push(billSourceSql(accountType, 'b'));
    advConds.push(advanceSourceSql(accountType));
    avConds.push(advanceSourceSql(accountType, 'av'));
  } else if (accountType === 'sc') {
    // SC tab shows ONLY subcontractor bills — exclude all PO/WO rows.
    billConds.push('FALSE');
    advConds.push('FALSE');
    avConds.push('FALSE');
  }
  if (fromDate) {
    billConds.push(`b.inv_date >= $${idx}`);
    advConds.push(`a.payment_date >= $${idx}`);
    avConds.push(`av.pay_date >= $${idx}`);
    params.push(fromDate);
    idx++;
  }
  if (toDate) {
    billConds.push(`b.inv_date <= $${idx}`);
    advConds.push(`a.payment_date <= $${idx}`);
    avConds.push(`av.pay_date <= $${idx}`);
    params.push(toDate);
    idx++;
  }
  if (vendorId && String(vendorId).trim()) {
    billConds.push(`b.vendor_id = $${idx}`);
    advConds.push(`a.vendor_id = $${idx}`);
    avConds.push(`av.vendor_id = $${idx}`);
    params.push(vendorId);
    idx++;
  }
  if (search && String(search).trim()) {
    billConds.push(`(
      b.vendor_name ILIKE $${idx}
      OR b.inv_number ILIKE $${idx}
      OR b.po_number ILIKE $${idx}
      OR b.wo_number ILIKE $${idx}
      OR b.sl_number ILIKE $${idx}
    )`);
    advConds.push(`(
      a.vendor_name ILIKE $${idx}
      OR a.po_number ILIKE $${idx}
      OR a.wo_number ILIKE $${idx}
      OR a.reference_number ILIKE $${idx}
    )`);
    avConds.push(`(
      av.vendor_name ILIKE $${idx}
      OR av.po_number ILIKE $${idx}
      OR av.wo_number ILIKE $${idx}
      OR av.voucher_number ILIKE $${idx}
    )`);
    params.push(`%${search}%`);
    idx++;
  }

  // ── SC-module bills (subcontractor RA bills) ────────────────────────────────
  // Included in the unfiltered "All" view and the dedicated "SC" tab — SC bills
  // are neither PO nor WO, and a vendorId filter targets TQS vendor ids which
  // SC bills don't carry.
  const includeSc = (accountType === 'all' || accountType === 'sc') && !(vendorId && String(vendorId).trim());
  const scConds = [`sb.company_id = $1`, `LOWER(COALESCE(sb.status, '')) <> 'rejected'`];
  if (includeSc) {
    if (projectId && String(projectId).trim()) {
      scConds.push(`sb.project_id = $${idx}`);
      params.push(projectId);
      idx++;
    } else if (Array.isArray(projectIds)) {
      if (projectIds.length === 0) {
        scConds.push('FALSE');
      } else {
        scConds.push(`sb.project_id = ANY($${idx}::uuid[])`);
        params.push(projectIds);
        idx++;
      }
    }
    if (fromDate) { scConds.push(`sb.bill_date >= $${idx}`); params.push(fromDate); idx++; }
    if (toDate)   { scConds.push(`sb.bill_date <= $${idx}`); params.push(toDate);   idx++; }
    if (search && String(search).trim()) {
      scConds.push(`(sc.name ILIKE $${idx} OR sb.bill_number ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
  } else {
    scConds.push('FALSE');
  }
  const scOutstanding = `GREATEST(COALESCE(sb.net_payable, 0) - COALESCE(sb.paid_amount, 0), 0)`;

  const { rows } = await query(`
    WITH bill_agg AS (
      SELECT
        LOWER(TRIM(b.vendor_name)) AS vendor_key,
        MAX(b.vendor_name) AS vendor_name,
        MAX(b.vendor_id::text)::uuid AS vendor_id,
        COUNT(DISTINCT b.id) AS bill_count,
        COALESCE(SUM(COALESCE(b.total_amount, 0)), 0) AS total_invoiced,
        COALESCE(SUM(COALESCE(u.certified_net, 0)), 0) AS total_certified,
        COALESCE(SUM(COALESCE(u.tds_deduction, 0)), 0) AS total_tds,
        COALESCE(SUM(COALESCE(u.other_deductions, 0)), 0) AS total_other_deductions,
        COALESCE(SUM(COALESCE(u.advance_recovered, 0)), 0) AS total_advance_on_bills,
        COALESCE(SUM(COALESCE(u.paid_amount, 0)), 0) AS total_paid,
        COALESCE(SUM(${billOutstandingSql('b', 'u')}), 0) AS bill_balance,
        COALESCE(SUM(${billOutstandingSql('b', 'u')}) FILTER (
          WHERE ${billOutstandingSql('b', 'u')} > 0
            AND b.inv_date >= CURRENT_DATE - INTERVAL '30 days'
        ), 0) AS payable_0_30,
        COALESCE(SUM(${billOutstandingSql('b', 'u')}) FILTER (
          WHERE ${billOutstandingSql('b', 'u')} > 0
            AND b.inv_date < CURRENT_DATE - INTERVAL '30 days'
            AND b.inv_date >= CURRENT_DATE - INTERVAL '60 days'
        ), 0) AS payable_31_60,
        COALESCE(SUM(${billOutstandingSql('b', 'u')}) FILTER (
          WHERE ${billOutstandingSql('b', 'u')} > 0
            AND b.inv_date < CURRENT_DATE - INTERVAL '60 days'
            AND b.inv_date >= CURRENT_DATE - INTERVAL '90 days'
        ), 0) AS payable_61_90,
        COALESCE(SUM(${billOutstandingSql('b', 'u')}) FILTER (
          WHERE ${billOutstandingSql('b', 'u')} > 0
            AND b.inv_date < CURRENT_DATE - INTERVAL '90 days'
        ), 0) AS payable_90_plus,
        COUNT(CASE WHEN ${billOutstandingSql('b', 'u')} > 0 THEN 1 END) AS unpaid_bill_count,
        MAX(b.inv_date) AS last_bill_date,
        -- Effective invoice = certified value + deductions (NOT gross invoice)
        COALESCE(SUM(
          ${billOutstandingSql('b', 'u')}
          + COALESCE(u.paid_amount, 0)
          + COALESCE(u.tds_deduction, 0)
          + COALESCE(u.other_deductions, 0)
        ), 0) AS total_effective_invoiced,
        COUNT(CASE WHEN b.workflow_status = 'paid' THEN 1 END) AS paid_count,
        COUNT(CASE WHEN b.workflow_status = 'accounts' THEN 1 END) AS in_accounts_count
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE ${billConds.join(' AND ')}
      GROUP BY LOWER(TRIM(b.vendor_name))
    ),
    advance_agg AS (
      SELECT
        vendor_key,
        MAX(vendor_name) AS vendor_name,
        MAX(vendor_id::text)::uuid AS vendor_id,
        SUM(amount) AS total_advance_given,
        MAX(last_date) AS last_advance_date
      FROM (
        SELECT
          LOWER(TRIM(a.vendor_name)) AS vendor_key,
          a.vendor_name,
          a.vendor_id,
          COALESCE(a.amount, 0) AS amount,
          a.payment_date AS last_date
        FROM tqs_advances a
        WHERE ${advConds.filter(Boolean).join(' AND ')}

        UNION ALL

        -- Procurement Advance Tracker (tqs_advance_vouchers) — disbursed advances
        SELECT
          LOWER(TRIM(av.vendor_name)) AS vendor_key,
          av.vendor_name,
          av.vendor_id,
          COALESCE(av.paid_amount, 0) AS amount,
          av.pay_date AS last_date
        FROM tqs_advance_vouchers av
        WHERE ${avConds.join(' AND ')}
      ) _adv
      GROUP BY vendor_key
    ),
    sc_agg AS (
      SELECT
        LOWER(TRIM(sc.name)) AS vendor_key,
        MAX(sc.name) AS vendor_name,
        COUNT(DISTINCT sb.id) AS sc_bill_count,
        COALESCE(SUM(COALESCE(sb.net_payable, 0)), 0) AS sc_invoiced,
        COALESCE(SUM(COALESCE(sb.tds_amount, 0)), 0) AS sc_tds,
        COALESCE(SUM(COALESCE(sb.paid_amount, 0)), 0) AS sc_paid,
        COALESCE(SUM(${scOutstanding}), 0) AS sc_balance,
        COALESCE(SUM(${scOutstanding}) FILTER (
          WHERE ${scOutstanding} > 0 AND sb.bill_date >= CURRENT_DATE - INTERVAL '30 days'
        ), 0) AS sc_0_30,
        COALESCE(SUM(${scOutstanding}) FILTER (
          WHERE ${scOutstanding} > 0
            AND sb.bill_date < CURRENT_DATE - INTERVAL '30 days'
            AND sb.bill_date >= CURRENT_DATE - INTERVAL '60 days'
        ), 0) AS sc_31_60,
        COALESCE(SUM(${scOutstanding}) FILTER (
          WHERE ${scOutstanding} > 0
            AND sb.bill_date < CURRENT_DATE - INTERVAL '60 days'
            AND sb.bill_date >= CURRENT_DATE - INTERVAL '90 days'
        ), 0) AS sc_61_90,
        COALESCE(SUM(${scOutstanding}) FILTER (
          WHERE ${scOutstanding} > 0 AND sb.bill_date < CURRENT_DATE - INTERVAL '90 days'
        ), 0) AS sc_90_plus,
        COUNT(CASE WHEN ${scOutstanding} > 0 THEN 1 END) AS sc_unpaid_count,
        COUNT(CASE WHEN LOWER(sb.status) = 'paid' THEN 1 END) AS sc_paid_count,
        MAX(sb.bill_date) AS sc_last_date
      FROM sc_bills sb
      JOIN sc_subcontractors sc ON sc.id = sb.sc_id
      WHERE ${scConds.join(' AND ')}
      GROUP BY LOWER(TRIM(sc.name))
    )
    SELECT
      COALESCE(b.vendor_name, a.vendor_name, s.vendor_name) AS vendor_name,
      COALESCE(b.vendor_id, a.vendor_id) AS vendor_id,
      COALESCE(b.bill_count, 0) + COALESCE(s.sc_bill_count, 0) AS bill_count,
      COALESCE(b.total_invoiced, 0) + COALESCE(s.sc_invoiced, 0) AS total_invoiced,
      COALESCE(b.total_certified, 0) AS total_certified,
      COALESCE(b.total_tds, 0) + COALESCE(s.sc_tds, 0) AS total_tds,
      COALESCE(b.total_other_deductions, 0) AS total_other_deductions,
      COALESCE(b.total_advance_on_bills, 0) AS total_advance_on_bills,
      COALESCE(b.total_paid, 0) + COALESCE(s.sc_paid, 0) AS total_paid,
      COALESCE(a.total_advance_given, 0) AS total_advance_given,
      COALESCE(b.total_advance_on_bills, 0) AS total_advance_recovered,
      GREATEST(COALESCE(a.total_advance_given, 0) - COALESCE(b.total_advance_on_bills, 0), 0) AS total_advance_open,
      COALESCE(b.payable_0_30, 0)   + COALESCE(s.sc_0_30, 0)   AS payable_0_30,
      COALESCE(b.payable_31_60, 0)  + COALESCE(s.sc_31_60, 0)  AS payable_31_60,
      COALESCE(b.payable_61_90, 0)  + COALESCE(s.sc_61_90, 0)  AS payable_61_90,
      COALESCE(b.payable_90_plus, 0) + COALESCE(s.sc_90_plus, 0) AS payable_90_plus,
      COALESCE(b.unpaid_bill_count, 0) + COALESCE(s.sc_unpaid_count, 0) AS unpaid_bill_count,
      -- Cr = effective invoices (certified + deductions, no haircut); Dr = advances + tds + other + paid.
      -- SC bills add their net-payable outstanding (net_payable − paid) directly.
      COALESCE(b.total_effective_invoiced, 0)
        + LEAST(COALESCE(b.total_advance_on_bills, 0), COALESCE(a.total_advance_given, 0))
        - COALESCE(a.total_advance_given, 0)
        - COALESCE(b.total_tds, 0)
        - COALESCE(b.total_other_deductions, 0)
        - COALESCE(b.total_paid, 0)
        + COALESCE(s.sc_balance, 0) AS bill_balance,
      COALESCE(b.total_effective_invoiced, 0)
        + LEAST(COALESCE(b.total_advance_on_bills, 0), COALESCE(a.total_advance_given, 0))
        - COALESCE(a.total_advance_given, 0)
        - COALESCE(b.total_tds, 0)
        - COALESCE(b.total_other_deductions, 0)
        - COALESCE(b.total_paid, 0)
        + COALESCE(s.sc_balance, 0) AS net_balance,
      GREATEST(
        COALESCE(b.total_effective_invoiced, 0)
          + LEAST(COALESCE(b.total_advance_on_bills, 0), COALESCE(a.total_advance_given, 0))
          - COALESCE(a.total_advance_given, 0)
          - COALESCE(b.total_tds, 0)
          - COALESCE(b.total_other_deductions, 0)
          - COALESCE(b.total_paid, 0)
          + COALESCE(s.sc_balance, 0),
        0
      ) AS payable_balance,
      GREATEST(
        COALESCE(a.total_advance_given, 0)
          + COALESCE(b.total_tds, 0)
          + COALESCE(b.total_other_deductions, 0)
          + COALESCE(b.total_paid, 0)
          - LEAST(COALESCE(b.total_advance_on_bills, 0), COALESCE(a.total_advance_given, 0))
          - COALESCE(b.total_effective_invoiced, 0)
          - COALESCE(s.sc_balance, 0),
        0
      ) AS advance_balance_dr,
      COALESCE(b.paid_count, 0) + COALESCE(s.sc_paid_count, 0) AS paid_count,
      COALESCE(b.in_accounts_count, 0) AS in_accounts_count,
      GREATEST(
        COALESCE(b.last_bill_date, 'epoch'::date),
        COALESCE(a.last_advance_date, 'epoch'::date),
        COALESCE(s.sc_last_date, 'epoch'::date)
      ) AS last_activity_date
    FROM bill_agg b
    FULL OUTER JOIN advance_agg a ON a.vendor_key = b.vendor_key
    FULL OUTER JOIN sc_agg s ON s.vendor_key = COALESCE(b.vendor_key, a.vendor_key)
    WHERE COALESCE(b.vendor_name, a.vendor_name, s.vendor_name) IS NOT NULL
    ORDER BY net_balance DESC NULLS LAST, vendor_name ASC
  `, params);

  return rows.map(row => ({
    ...row,
    bill_count: Number(row.bill_count || 0),
    paid_count: Number(row.paid_count || 0),
    in_accounts_count: Number(row.in_accounts_count || 0),
    total_invoiced: round2(row.total_invoiced),
    total_certified: round2(row.total_certified),
    total_tds: round2(row.total_tds),
    total_other_deductions: round2(row.total_other_deductions),
    total_advance_on_bills: round2(row.total_advance_on_bills),
    total_paid: round2(row.total_paid),
    total_advance_given: round2(row.total_advance_given),
    total_advance_recovered: round2(row.total_advance_recovered),
    total_advance_open: round2(row.total_advance_open),
    payable_0_30: round2(row.payable_0_30),
    payable_31_60: round2(row.payable_31_60),
    payable_61_90: round2(row.payable_61_90),
    payable_90_plus: round2(row.payable_90_plus),
    unpaid_bill_count: Number(row.unpaid_bill_count || 0),
    bill_balance: cleanBalance(row.bill_balance),
    net_balance: cleanBalance(row.net_balance),
    payable_balance: cleanBalance(row.payable_balance),
    advance_balance_dr: cleanBalance(row.advance_balance_dr),
  }));
}

module.exports = {
  advanceSourceSql,
  billCreditSql,
  billOutstandingSql,
  billSourceSql,
  getVendorLiabilitySummary,
  normalizeAccountType,
};
