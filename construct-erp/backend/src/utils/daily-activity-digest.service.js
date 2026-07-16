// daily-activity-digest.service.js — once-daily email summarising the work
// logged across every department/module in the ERP (Procurement, Stores,
// QS & Billing, Finance, Planning/Site, HR, HSE, Quality, DMS, Assets).
const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');

const DEFAULT_RECIPIENTS = 'it@bcim.in';
const DEFAULT_CRON = '0 20 * * *'; // 8:00 PM IST daily

const parseEmails = (value, fallback = '') =>
  String(value || fallback || '')
    .split(/[;,]/)
    .map(v => v.trim())
    .filter(Boolean);

const inr = (value) =>
  Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');

const fmtTime = (value) =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trunc = (value, n = 70) => {
  const s = String(value || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// ── Per-department queries (everything created "today" for this company) ────
async function fetchDailyActivity(companyId, timezone, daysAgo = 0) {
  const today = (col) => `(${col} AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2 - (INTERVAL '1 day' * $3))::date`;
  const params = [companyId, timezone, daysAgo];

  const [
    pos, wos, grns, mins, mrses, pettyCash, measurements, raBills, scBills, vendorBills,
    payments, invoices, dprs, attendanceRows, incidents, permits,
    rfis, ncrs, documents, gfcRevisions, assetMoves,
  ] = await Promise.all([
    query(`
      SELECT po.po_number AS ref_no, po.grand_total AS amount, po.status, po.created_at,
             v.name AS party_name, p.name AS project_name, u.name AS by_name
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE p.company_id = $1 AND ${today('po.created_at')}
      ORDER BY po.created_at`, params),

    query(`
      SELECT wo.wo_number AS ref_no, COALESCE(wo.contract_amount, 0) AS amount, wo.status, wo.created_at,
             COALESCE(v.name, '-') AS party_name, p.name AS project_name, u.name AS by_name,
             wo.work_description AS detail
      FROM work_orders wo
      JOIN projects p ON p.id = wo.project_id
      LEFT JOIN vendors v ON v.id = wo.vendor_id
      LEFT JOIN users u ON u.id = wo.created_by
      WHERE p.company_id = $1 AND ${today('wo.created_at')}
      ORDER BY wo.created_at`, params),

    query(`
      SELECT g.grn_number AS ref_no, g.total_quantity AS amount, g.quality_status AS status, g.created_at,
             COALESCE(v.name, '-') AS party_name, p.name AS project_name, u.name AS by_name
      FROM grn g
      JOIN projects p ON p.id = g.project_id
      LEFT JOIN vendors v ON v.id = g.vendor_id
      LEFT JOIN users u ON u.id = g.received_by
      WHERE p.company_id = $1 AND ${today('g.created_at')}
      ORDER BY g.created_at`, params),

    query(`
      SELECT m.min_number AS ref_no, m.total_value AS amount, m.created_at,
             m.issued_to AS party_name, p.name AS project_name, u.name AS by_name
      FROM material_issue_notes m
      JOIN projects p ON p.id = m.project_id
      LEFT JOIN users u ON u.id = m.issued_by
      WHERE p.company_id = $1 AND ${today('m.created_at')}
      ORDER BY m.created_at`, params),

    query(`
      SELECT mr.mrs_number AS ref_no, mr.priority, mr.status, mr.created_at,
             p.name AS project_name, u.name AS by_name,
             (SELECT COUNT(*)::int FROM mrs_items mi WHERE mi.mrs_id = mr.id) AS item_count
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      WHERE p.company_id = $1 AND ${today('mr.created_at')}
      ORDER BY mr.created_at`, params),

    query(`
      SELECT e.pc_voucher_no AS ref_no, COALESCE(e.total_amount, e.amount, e.basic_amount, 0) AS amount, e.status,
             e.supplier AS party_name, p.name AS project_name, u.name AS by_name, e.created_at
      FROM stores_petty_cash_entries e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE e.company_id = $1 AND ${today('e.created_at')}
      ORDER BY e.created_at`, params),

    query(`
      SELECT ms.mb_number AS ref_no, ms.description AS detail, ms.net_quantity AS amount, ms.status, ms.created_at,
             p.name AS project_name, u.name AS by_name
      FROM measurements ms
      JOIN projects p ON p.id = ms.project_id
      LEFT JOIN users u ON u.id = ms.submitted_by
      WHERE p.company_id = $1 AND ${today('ms.created_at')}
      ORDER BY ms.created_at`, params),

    query(`
      SELECT rb.bill_number AS ref_no, rb.net_payable AS amount, rb.status, rb.created_at,
             COALESCE(rb.contractor_name, '-') AS party_name, p.name AS project_name, u.name AS by_name
      FROM ra_bills rb
      JOIN projects p ON p.id = rb.project_id
      LEFT JOIN users u ON u.id = COALESCE(rb.created_by, rb.submitted_by)
      WHERE p.company_id = $1 AND ${today('rb.created_at')}
      ORDER BY rb.created_at`, params),

    query(`
      SELECT sb.bill_number AS ref_no, sb.net_payable AS amount, sb.status, sb.current_stage AS detail, sb.created_at,
             COALESCE(sc.name, '-') AS party_name, p.name AS project_name, u.name AS by_name
      FROM sc_bills sb
      JOIN projects p ON p.id = sb.project_id
      LEFT JOIN sc_subcontractors sc ON sc.id = sb.sc_id
      LEFT JOIN users u ON u.id = COALESCE(sb.submitted_by, sb.created_by)
      WHERE sb.company_id = $1 AND ${today('sb.created_at')}
      ORDER BY sb.created_at`, params),

    query(`
      SELECT b.sl_number AS ref_no, b.total_amount AS amount, UPPER(COALESCE(b.bill_type, 'po')) AS status, b.created_at,
             b.vendor_name AS party_name, p.name AS project_name, u.name AS by_name
      FROM tqs_bills b
      LEFT JOIN projects p ON p.id = b.project_id
      LEFT JOIN users u ON u.id = b.created_by
      WHERE b.company_id = $1 AND b.is_deleted = FALSE AND ${today('b.created_at')}
      ORDER BY b.created_at`, params),

    query(`
      SELECT pm.entity_name AS party_name, pm.amount, pm.payment_type AS status, pm.payment_mode AS detail, pm.created_at,
             p.name AS project_name, u.name AS by_name
      FROM payments pm
      JOIN projects p ON p.id = pm.project_id
      LEFT JOIN users u ON u.id = pm.created_by
      WHERE p.company_id = $1 AND ${today('pm.created_at')}
      ORDER BY pm.created_at`, params),

    query(`
      SELECT inv.invoice_number AS ref_no, inv.total_amount AS amount, inv.status, inv.created_at,
             COALESCE(v.name, '-') AS party_name, p.name AS project_name, u.name AS by_name
      FROM invoices inv
      JOIN projects p ON p.id = inv.project_id
      LEFT JOIN vendors v ON v.id = inv.vendor_id
      LEFT JOIN users u ON u.id = inv.created_by
      WHERE p.company_id = $1 AND ${today('inv.created_at')}
      ORDER BY inv.created_at`, params),

    query(`
      SELECT COALESCE(d.dpr_number, '-') AS ref_no, d.report_date, d.weather AS detail, d.created_at,
             p.name AS project_name, u.name AS by_name
      FROM daily_progress_reports d
      JOIN projects p ON p.id = d.project_id
      LEFT JOIN users u ON u.id = d.submitted_by
      WHERE p.company_id = $1 AND ${today('d.created_at')}
      ORDER BY d.created_at`, params),

    query(`
      SELECT p.name AS project_name, a.status, COUNT(*)::int AS cnt, COALESCE(SUM(a.ot_hours), 0) AS ot_hours
      FROM attendance a
      JOIN projects p ON p.id = a.project_id
      WHERE p.company_id = $1 AND ${today('a.created_at')}
      GROUP BY p.name, a.status
      ORDER BY p.name`, params),

    query(`
      SELECT i.incident_number AS ref_no, i.incident_type AS status, i.severity AS detail, i.description, i.created_at,
             p.name AS project_name, u.name AS by_name
      FROM incidents i
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN users u ON u.id = i.reported_by
      WHERE p.company_id = $1 AND ${today('i.created_at')}
      ORDER BY i.created_at`, params),

    query(`
      SELECT pr.permit_number AS ref_no, pr.permit_type AS status, pr.location AS detail, pr.created_at,
             p.name AS project_name, u.name AS by_name
      FROM permits pr
      JOIN projects p ON p.id = pr.project_id
      LEFT JOIN users u ON u.id = pr.issued_by
      WHERE p.company_id = $1 AND ${today('pr.created_at')}
      ORDER BY pr.created_at`, params),

    query(`
      SELECT r.rfi_number AS ref_no, r.activity_name AS detail, r.location AS party_name, r.status, r.created_at,
             p.name AS project_name, u.name AS by_name
      FROM quality_rfis r
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN users u ON u.id = r.raised_by
      WHERE p.company_id = $1 AND ${today('r.created_at')}
      ORDER BY r.created_at`, params),

    query(`
      SELECT n.ncr_number AS ref_no, n.title AS detail, n.severity AS status, n.created_at,
             p.name AS project_name, u.name AS by_name
      FROM quality_ncrs n
      JOIN projects p ON p.id = n.project_id
      LEFT JOIN users u ON u.id = n.raised_by
      WHERE p.company_id = $1 AND ${today('n.created_at')}
      ORDER BY n.created_at`, params),

    query(`
      SELECT d.file_name AS ref_no, d.module AS status, d.doc_type AS detail, d.created_at,
             COALESCE(p.name, '-') AS project_name, u.name AS by_name
      FROM documents d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.company_id = $1 AND ${today('d.created_at')}
      ORDER BY d.created_at`, params),

    query(`
      SELECT gd.drawing_number AS ref_no, gd.title AS detail, gr.revision AS status, gr.created_at,
             p.name AS project_name, gr.issued_by AS by_name
      FROM gfc_drawing_revisions gr
      JOIN gfc_drawings gd ON gd.id = gr.drawing_id
      JOIN projects p ON p.id = gd.project_id
      WHERE p.company_id = $1 AND ${today('gr.created_at')}
      ORDER BY gr.created_at`, params),

    query(`
      SELECT a.asset_name AS ref_no, a.asset_code AS detail, am.reason AS status, am.created_at,
             COALESCE(pf.name, '-') || ' → ' || COALESCE(pt.name, '-') AS project_name, u.name AS by_name
      FROM asset_movements am
      JOIN assets a ON a.id = am.asset_id
      LEFT JOIN projects pf ON pf.id = am.from_project_id
      LEFT JOIN projects pt ON pt.id = am.to_project_id
      LEFT JOIN users u ON u.id = am.moved_by
      WHERE a.company_id = $1 AND ${today('am.created_at')}
      ORDER BY am.created_at`, params),
  ]);

  // Roll the per-status attendance rows up into one row per project
  const attendanceByProject = new Map();
  for (const r of attendanceRows.rows) {
    if (!attendanceByProject.has(r.project_name)) {
      attendanceByProject.set(r.project_name, { project_name: r.project_name, present: 0, absent: 0, half_day: 0, leave: 0, total: 0, ot_hours: 0 });
    }
    const row = attendanceByProject.get(r.project_name);
    row[r.status] = (row[r.status] || 0) + r.cnt;
    row.total += r.cnt;
    row.ot_hours += Number(r.ot_hours || 0);
  }

  return {
    pos: pos.rows, wos: wos.rows, grns: grns.rows, mins: mins.rows, mrses: mrses.rows,
    pettyCash: pettyCash.rows,
    measurements: measurements.rows, raBills: raBills.rows, scBills: scBills.rows, vendorBills: vendorBills.rows,
    payments: payments.rows, invoices: invoices.rows, dprs: dprs.rows,
    attendance: [...attendanceByProject.values()],
    incidents: incidents.rows, permits: permits.rows, rfis: rfis.rows, ncrs: ncrs.rows,
    documents: documents.rows, gfcRevisions: gfcRevisions.rows, assetMoves: assetMoves.rows,
  };
}

// ── Mail body ─────────────────────────────────────────────────────────────────
function buildMail({ companyName, data, dateLabel }) {
  const th = 'padding:8px;border:1px solid #dbe4f0;background:#0f2a52;color:#fff;font-size:11px;text-align:left;white-space:nowrap';
  const td = 'padding:7px 8px;border:1px solid #dbe4f0;font-size:11px;vertical-align:top;color:#10233f';

  const section = (title, rows, cols, renderRow) => {
    if (!rows.length) return '';
    const cap = 40;
    const shown = rows.slice(0, cap).map(renderRow).join('');
    const more = rows.length > cap
      ? `<tr><td colspan="${cols.length}" style="${td};text-align:center;font-style:italic;color:#64748b">...and ${rows.length - cap} more</td></tr>`
      : '';
    return `
      <p style="margin:18px 0 6px;font-size:13px;font-weight:800;color:#0f2a52;text-transform:uppercase;letter-spacing:0.04em">
        ${title} &mdash; ${rows.length}
      </p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${cols.map(c => `<th style="${th}">${c}</th>`).join('')}</tr></thead>
        <tbody>${shown}${more}</tbody>
      </table>`;
  };

  const poRows = section('Procurement &mdash; Purchase Orders Raised', data.pos,
    ['#', 'PO Number', 'Vendor', 'Project', 'Amount', 'Status', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const woRows = section('Procurement &mdash; Work Orders Raised', data.wos,
    ['#', 'WO Number', 'Contractor', 'Project', 'Amount', 'Status', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const grnRows = section('Stores &mdash; GRNs Received', data.grns,
    ['#', 'GRN Number', 'Vendor', 'Project', 'Quantity', 'QC Status', 'Received By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right">${Number(r.amount || 0)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const minRows = section('Stores &mdash; Material Issued to Site', data.mins,
    ['#', 'MIN Number', 'Issued To', 'Project', 'Value', 'Issued By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const mrsRows = section('Stores &mdash; Material Requisitions Raised', data.mrses,
    ['#', 'MRS Number', 'Project', 'Items', 'Priority', 'Status', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${r.item_count || 0}</td>
      <td style="${td}">${esc(r.priority)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const pettyCashRows = section('Stores &mdash; Petty Cash Entries', data.pettyCash || [],
    ['#', 'Voucher No', 'Supplier', 'Project', 'Amount', 'Status', 'Entered By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no || '-')}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name || '-')}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status || '-')}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const measurementRows = section('QS &mdash; Measurements Recorded', data.measurements,
    ['#', 'MB Number', 'Description', 'Project', 'Net Qty', 'Status', 'Recorded By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no || '-')}</td>
      <td style="${td}">${esc(trunc(r.detail))}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right">${Number(r.amount || 0)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const raBillRows = section('QS &mdash; RA Bills Submitted', data.raBills,
    ['#', 'Bill Number', 'Contractor', 'Project', 'Net Payable', 'Status', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const scBillRows = section('QS &mdash; Subcontractor Bills Raised for Approval', data.scBills || [],
    ['#', 'Bill Number', 'Subcontractor', 'Project', 'Net Payable', 'Status', 'Stage', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const vendorBillRows = section('QS &mdash; Vendor Bills Entered (Bill Tracker)', data.vendorBills,
    ['#', 'SL No', 'Vendor', 'Project', 'Amount', 'Type', 'Entered By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no || '-')}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name || '-')}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const paymentRows = section('Finance &mdash; Payments Made', data.payments,
    ['#', 'Paid To', 'Project', 'Amount', 'Mode', 'Type', 'Processed By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.status || '-')}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const invoiceRows = section('Finance &mdash; Invoices Processed', data.invoices,
    ['#', 'Invoice Number', 'Vendor', 'Project', 'Amount', 'Status', 'Entered By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.party_name)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const dprRows = section('Planning / Site &mdash; Daily Progress Reports Submitted', data.dprs,
    ['#', 'DPR Number', 'Project', 'Report Date', 'Weather', 'Submitted By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${fmtDate(r.report_date)}</td>
      <td style="${td}">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const attendanceRows = section('HR &mdash; Attendance Marked', data.attendance,
    ['#', 'Project', 'Present', 'Absent', 'Half Day', 'Leave', 'Total Marked', 'OT Hours'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td};text-align:right;color:#15803d;font-weight:700">${r.present || 0}</td>
      <td style="${td};text-align:right;color:#b91c1c;font-weight:700">${r.absent || 0}</td>
      <td style="${td};text-align:right">${r.half_day || 0}</td>
      <td style="${td};text-align:right">${r.leave || 0}</td>
      <td style="${td};text-align:right;font-weight:700">${r.total}</td>
      <td style="${td};text-align:right">${r.ot_hours}</td>
    </tr>`);

  const incidentRows = section('HSE &mdash; Incidents Reported', data.incidents,
    ['#', 'Incident Number', 'Type', 'Severity', 'Project', 'Description', 'Reported By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td};color:#b91c1c;font-weight:700">${esc(r.detail)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(trunc(r.description))}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const permitRows = section('HSE &mdash; Permits Issued', data.permits,
    ['#', 'Permit Number', 'Type', 'Location', 'Project', 'Issued By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const rfiRows = section('Quality &mdash; RFIs Raised', data.rfis,
    ['#', 'RFI Number', 'Activity', 'Location', 'Project', 'Status', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.party_name || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const ncrRows = section('Quality &mdash; NCRs Raised', data.ncrs,
    ['#', 'NCR Number', 'Title', 'Severity', 'Project', 'Raised By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(trunc(r.detail))}</td>
      <td style="${td};color:#b91c1c;font-weight:700">${esc(r.status)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const documentRows = section('DMS &mdash; Documents Uploaded', data.documents,
    ['#', 'File Name', 'Module', 'Type', 'Project', 'Uploaded By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td}">${esc(trunc(r.ref_no))}</td>
      <td style="${td}">${esc(r.status)}</td>
      <td style="${td}">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const gfcRows = section('DMS &mdash; GFC Drawing Revisions Issued', data.gfcRevisions,
    ['#', 'Drawing Number', 'Title', 'Revision', 'Project', 'Issued By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td}">${esc(trunc(r.detail))}</td>
      <td style="${td};font-weight:700">${esc(r.status)}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const assetRows = section('Assets &mdash; Movements / Transfers', data.assetMoves,
    ['#', 'Asset', 'Code', 'From → To', 'Reason', 'Moved By', 'Time'],
    (r, i) => `<tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-weight:700">${esc(r.ref_no)}</td>
      <td style="${td};font-family:monospace">${esc(r.detail || '-')}</td>
      <td style="${td}">${esc(r.project_name)}</td>
      <td style="${td}">${esc(r.status || '-')}</td>
      <td style="${td}">${esc(r.by_name || '-')}</td>
      <td style="${td}">${fmtTime(r.created_at)}</td>
    </tr>`);

  const attendanceTotal = data.attendance.reduce((s, r) => s + (r.total || 0), 0);

  const depts = [
    { label: 'Procurement', count: data.pos.length + data.wos.length },
    { label: 'Stores', count: data.grns.length + data.mins.length + data.mrses.length + (data.pettyCash?.length || 0) },
    { label: 'QS & Billing', count: data.measurements.length + data.raBills.length + (data.scBills?.length || 0) + data.vendorBills.length },
    { label: 'Finance', count: data.payments.length + data.invoices.length },
    { label: 'Planning / Site', count: data.dprs.length },
    { label: 'HR & Labour', count: attendanceTotal },
    { label: 'HSE', count: data.incidents.length + data.permits.length },
    { label: 'Quality', count: data.rfis.length + data.ncrs.length },
    { label: 'DMS', count: data.documents.length + data.gfcRevisions.length },
    { label: 'Assets', count: data.assetMoves.length },
  ];

  const totalItems = depts.reduce((s, d) => s + d.count, 0);
  const activeDepts = depts.filter(d => d.count > 0).length;

  const cardCell = (d) => `
    <td style="padding:10px;border:1px solid #dbe4f0;background:${d.count > 0 ? '#f6f9fc' : '#fafafa'};text-align:center">
      <div style="font-size:20px;font-weight:800;color:${d.count > 0 ? '#0f2a52' : '#94a3b8'}">${d.count}</div>
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;margin-top:2px">${d.label}</div>
    </td>`;

  const cardRows = [];
  for (let i = 0; i < depts.length; i += 5) {
    cardRows.push(`<tr>${depts.slice(i, i + 5).map(cardCell).join('')}</tr>`);
  }

  const subject = `Daily Activity Summary - ${dateLabel} - ${totalItems} update(s) across ${activeDepts} department(s)`;

  const allSections = [
    poRows, woRows, grnRows, minRows, mrsRows, pettyCashRows, measurementRows, raBillRows, scBillRows, vendorBillRows,
    paymentRows, invoiceRows, dprRows, attendanceRows, incidentRows, permitRows,
    rfiRows, ncrRows, documentRows, gfcRows, assetRows,
  ].join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:1180px;margin:0 auto;color:#10233f">
      <div style="background:linear-gradient(135deg,#0f2a52,#16386b);padding:18px 22px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;color:#fff;font-size:18px">Daily Activity Summary &mdash; All Departments</h2>
        <p style="margin:6px 0 0;color:#cfe0ff;font-size:12px">${companyName} &bull; ${dateLabel}</p>
      </div>
      <div style="padding:20px 22px;border:1px solid #dbe4f0;border-top:none;border-radius:0 0 8px 8px;background:#fff">
        <p style="margin:0 0 14px;font-size:13px">
          ${totalItems
            ? `A total of <strong>${totalItems}</strong> activity record(s) were logged in the ERP today across <strong>${activeDepts}</strong> of ${depts.length} departments.`
            : `No new activity records were logged in the ERP today.`}
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:4px">${cardRows.join('')}</table>
        ${allSections}
        <p style="margin:20px 0 0;font-size:12px">
          <a href="https://erp.bcim.in" style="display:inline-block;background:#0f2a52;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">
            Open BCIM ERP
          </a>
        </p>
        <p style="margin:16px 0 0;font-size:10px;color:#8aa0bf">Automated daily activity digest from BCIM ERP &mdash; sent every evening summarising the day's work across all departments.</p>
      </div>
    </div>`;

  const text = [
    `Daily Activity Summary - ${companyName} - ${dateLabel}`,
    '',
    totalItems
      ? `${totalItems} activity record(s) logged across ${activeDepts} of ${depts.length} departments:`
      : 'No new activity records were logged in the ERP today.',
    ...depts.filter(d => d.count > 0).map(d => `  ${d.label}: ${d.count}`),
    '',
    'View details at: https://erp.bcim.in',
  ].join('\n');

  return { subject, html, text };
}

async function runDailyActivityDigest({ manual = false, daysAgo = 0, overrideRecipients } = {}) {
  const recipients = overrideRecipients
    ? parseEmails(overrideRecipients)
    : parseEmails(process.env.DAILY_ACTIVITY_DIGEST_EMAILS, DEFAULT_RECIPIENTS);
  if (!recipients.length) return { ok: false, reason: 'No recipients configured' };

  const timezone = process.env.DAILY_ACTIVITY_DIGEST_TZ || process.env.TZ || 'Asia/Kolkata';
  const targetDate = new Date();
  if (daysAgo) targetDate.setDate(targetDate.getDate() - daysAgo);
  const dateLabel = targetDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone });

  const companies = await query(`SELECT id, name FROM companies WHERE COALESCE(is_active, TRUE) = TRUE`);

  const results = [];
  for (const company of companies.rows) {
    const data = await fetchDailyActivity(company.id, timezone, daysAgo);
    const mail = await sendMail({ to: recipients, ...buildMail({ companyName: company.name, data, dateLabel }) });
    const totalItems = Object.values(data).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    results.push({ company_id: company.id, company_name: company.name, items: totalItems, recipients, mail, manual });
  }

  return { ok: true, ran_at: new Date().toISOString(), companies_checked: companies.rows.length, results };
}

function initDailyActivityDigest() {
  const schedule = process.env.DAILY_ACTIVITY_DIGEST_CRON || DEFAULT_CRON;
  cron.schedule(schedule, () => {
    logger.info('Scheduled daily activity digest triggered');
    runDailyActivityDigest().catch(err => logger.error(`Daily activity digest failed: ${err.message}`));
  }, { timezone: process.env.DAILY_ACTIVITY_DIGEST_TZ || process.env.TZ || 'Asia/Kolkata' });

  logger.info(`Daily activity digest initialized (${schedule})`);


}

// ── Weekly / date-range summary ───────────────────────────────────────────────
// Queries all the same tables but for a date range (fromDate..toDate inclusive).
async function fetchRangeActivity(companyId, timezone, fromDate, toDate) {
  const inRange = (col) =>
    `(${col} AT TIME ZONE $2)::date BETWEEN ($3::date) AND ($4::date)`;
  const params = [companyId, timezone, fromDate, toDate];

  const [
    pos, wos, grns, mins, mrses, pettyCash, measurements, raBills, scBills, vendorBills,
    payments, invoices, dprs, attendanceRows, incidents, permits,
    rfis, ncrs, documents, gfcRevisions, assetMoves,
  ] = await Promise.all([
    query(`SELECT po.po_number AS ref_no, po.grand_total AS amount, po.status, po.created_at,
             v.name AS party_name, p.name AS project_name, u.name AS by_name
           FROM purchase_orders po JOIN projects p ON p.id = po.project_id
           LEFT JOIN vendors v ON v.id = po.vendor_id LEFT JOIN users u ON u.id = po.created_by
           WHERE p.company_id=$1 AND ${inRange('po.created_at')} ORDER BY po.created_at`, params),
    query(`SELECT wo.wo_number AS ref_no, COALESCE(wo.contract_amount,0) AS amount, wo.status, wo.created_at,
             COALESCE(v.name,'-') AS party_name, p.name AS project_name, u.name AS by_name
           FROM work_orders wo JOIN projects p ON p.id = wo.project_id
           LEFT JOIN vendors v ON v.id = wo.vendor_id LEFT JOIN users u ON u.id = wo.created_by
           WHERE p.company_id=$1 AND ${inRange('wo.created_at')} ORDER BY wo.created_at`, params),
    query(`SELECT g.grn_number AS ref_no, g.total_quantity AS amount, g.quality_status AS status, g.created_at,
             COALESCE(v.name,'-') AS party_name, p.name AS project_name, u.name AS by_name
           FROM grn g JOIN projects p ON p.id = g.project_id
           LEFT JOIN vendors v ON v.id = g.vendor_id LEFT JOIN users u ON u.id = g.received_by
           WHERE p.company_id=$1 AND ${inRange('g.created_at')} ORDER BY g.created_at`, params),
    query(`SELECT m.min_number AS ref_no, m.total_value AS amount, m.created_at,
             m.issued_to AS party_name, p.name AS project_name, u.name AS by_name
           FROM material_issue_notes m JOIN projects p ON p.id = m.project_id
           LEFT JOIN users u ON u.id = m.issued_by
           WHERE p.company_id=$1 AND ${inRange('m.created_at')} ORDER BY m.created_at`, params),
    query(`SELECT mr.mrs_number AS ref_no, mr.priority, mr.status, mr.created_at,
             p.name AS project_name, u.name AS by_name,
             (SELECT COUNT(*)::int FROM mrs_items mi WHERE mi.mrs_id=mr.id) AS item_count
           FROM material_requisitions mr JOIN projects p ON p.id = mr.project_id
           LEFT JOIN users u ON u.id = mr.raised_by
           WHERE p.company_id=$1 AND ${inRange('mr.created_at')} ORDER BY mr.created_at`, params),
    query(`SELECT e.pc_voucher_no AS ref_no, COALESCE(e.total_amount, e.amount, e.basic_amount, 0) AS amount, e.status,
             e.supplier AS party_name, p.name AS project_name, u.name AS by_name, e.created_at
           FROM stores_petty_cash_entries e LEFT JOIN projects p ON p.id = e.project_id
           LEFT JOIN users u ON u.id = e.created_by
           WHERE e.company_id=$1 AND ${inRange('e.created_at')} ORDER BY e.created_at`, params),
    query(`SELECT ms.mb_number AS ref_no, ms.description AS detail, ms.net_quantity AS amount, ms.status, ms.created_at,
             p.name AS project_name, u.name AS by_name
           FROM measurements ms JOIN projects p ON p.id = ms.project_id
           LEFT JOIN users u ON u.id = ms.submitted_by
           WHERE p.company_id=$1 AND ${inRange('ms.created_at')} ORDER BY ms.created_at`, params),
    query(`SELECT rb.bill_number AS ref_no, rb.net_payable AS amount, rb.status, rb.created_at,
             COALESCE(rb.contractor_name,'-') AS party_name, p.name AS project_name, u.name AS by_name
           FROM ra_bills rb JOIN projects p ON p.id = rb.project_id
           LEFT JOIN users u ON u.id = COALESCE(rb.created_by, rb.submitted_by)
           WHERE p.company_id=$1 AND ${inRange('rb.created_at')} ORDER BY rb.created_at`, params),
    query(`SELECT sb.bill_number AS ref_no, sb.net_payable AS amount, sb.status, sb.current_stage AS detail, sb.created_at,
             COALESCE(sc.name,'-') AS party_name, p.name AS project_name, u.name AS by_name
           FROM sc_bills sb JOIN projects p ON p.id = sb.project_id
           LEFT JOIN sc_subcontractors sc ON sc.id = sb.sc_id
           LEFT JOIN users u ON u.id = COALESCE(sb.submitted_by, sb.created_by)
           WHERE sb.company_id=$1 AND ${inRange('sb.created_at')} ORDER BY sb.created_at`, params),
    query(`SELECT b.sl_number AS ref_no, b.total_amount AS amount, UPPER(COALESCE(b.bill_type,'po')) AS status, b.created_at,
             b.vendor_name AS party_name, p.name AS project_name, u.name AS by_name
           FROM tqs_bills b LEFT JOIN projects p ON p.id = b.project_id
           LEFT JOIN users u ON u.id = b.created_by
           WHERE b.company_id=$1 AND b.is_deleted=FALSE AND ${inRange('b.created_at')} ORDER BY b.created_at`, params),
    query(`SELECT pm.entity_name AS party_name, pm.amount, pm.payment_type AS status, pm.payment_mode AS detail, pm.created_at,
             p.name AS project_name, u.name AS by_name
           FROM payments pm JOIN projects p ON p.id = pm.project_id
           LEFT JOIN users u ON u.id = pm.created_by
           WHERE p.company_id=$1 AND ${inRange('pm.created_at')} ORDER BY pm.created_at`, params),
    query(`SELECT inv.invoice_number AS ref_no, inv.total_amount AS amount, inv.status, inv.created_at,
             COALESCE(v.name,'-') AS party_name, p.name AS project_name, u.name AS by_name
           FROM invoices inv JOIN projects p ON p.id = inv.project_id
           LEFT JOIN vendors v ON v.id = inv.vendor_id LEFT JOIN users u ON u.id = inv.created_by
           WHERE p.company_id=$1 AND ${inRange('inv.created_at')} ORDER BY inv.created_at`, params),
    query(`SELECT COALESCE(d.dpr_number,'-') AS ref_no, d.report_date, d.weather AS detail, d.created_at,
             p.name AS project_name, u.name AS by_name
           FROM daily_progress_reports d JOIN projects p ON p.id = d.project_id
           LEFT JOIN users u ON u.id = d.submitted_by
           WHERE p.company_id=$1 AND ${inRange('d.created_at')} ORDER BY d.created_at`, params),
    query(`SELECT p.name AS project_name, a.status, COUNT(*)::int AS cnt, COALESCE(SUM(a.ot_hours),0) AS ot_hours
           FROM attendance a JOIN projects p ON p.id = a.project_id
           WHERE p.company_id=$1 AND ${inRange('a.created_at')}
           GROUP BY p.name, a.status ORDER BY p.name`, params),
    query(`SELECT i.incident_number AS ref_no, i.incident_type AS status, i.severity AS detail, i.description, i.created_at,
             p.name AS project_name, u.name AS by_name
           FROM incidents i JOIN projects p ON p.id = i.project_id
           LEFT JOIN users u ON u.id = i.reported_by
           WHERE p.company_id=$1 AND ${inRange('i.created_at')} ORDER BY i.created_at`, params),
    query(`SELECT pr.permit_number AS ref_no, pr.permit_type AS status, pr.location AS detail, pr.created_at,
             p.name AS project_name, u.name AS by_name
           FROM permits pr JOIN projects p ON p.id = pr.project_id
           LEFT JOIN users u ON u.id = pr.issued_by
           WHERE p.company_id=$1 AND ${inRange('pr.created_at')} ORDER BY pr.created_at`, params),
    query(`SELECT r.rfi_number AS ref_no, r.activity_name AS detail, r.location AS party_name, r.status, r.created_at,
             p.name AS project_name, u.name AS by_name
           FROM quality_rfis r JOIN projects p ON p.id = r.project_id
           LEFT JOIN users u ON u.id = r.raised_by
           WHERE p.company_id=$1 AND ${inRange('r.created_at')} ORDER BY r.created_at`, params),
    query(`SELECT n.ncr_number AS ref_no, n.title AS detail, n.severity AS status, n.created_at,
             p.name AS project_name, u.name AS by_name
           FROM quality_ncrs n JOIN projects p ON p.id = n.project_id
           LEFT JOIN users u ON u.id = n.raised_by
           WHERE p.company_id=$1 AND ${inRange('n.created_at')} ORDER BY n.created_at`, params),
    query(`SELECT d.file_name AS ref_no, d.module AS status, d.doc_type AS detail, d.created_at,
             COALESCE(p.name,'-') AS project_name, u.name AS by_name
           FROM documents d LEFT JOIN projects p ON p.id = d.project_id
           LEFT JOIN users u ON u.id = d.uploaded_by
           WHERE d.company_id=$1 AND ${inRange('d.created_at')} ORDER BY d.created_at`, params),
    query(`SELECT gd.drawing_number AS ref_no, gd.title AS detail, gr.revision AS status, gr.created_at,
             p.name AS project_name, gr.issued_by AS by_name
           FROM gfc_drawing_revisions gr JOIN gfc_drawings gd ON gd.id = gr.drawing_id
           JOIN projects p ON p.id = gd.project_id
           WHERE p.company_id=$1 AND ${inRange('gr.created_at')} ORDER BY gr.created_at`, params),
    query(`SELECT a.asset_name AS ref_no, a.asset_code AS detail, am.reason AS status, am.created_at,
             COALESCE(pf.name,'-') || ' → ' || COALESCE(pt.name,'-') AS project_name, u.name AS by_name
           FROM asset_movements am JOIN assets a ON a.id = am.asset_id
           LEFT JOIN projects pf ON pf.id = am.from_project_id
           LEFT JOIN projects pt ON pt.id = am.to_project_id
           LEFT JOIN users u ON u.id = am.moved_by
           WHERE a.company_id=$1 AND ${inRange('am.created_at')} ORDER BY am.created_at`, params),
  ]);

  const attendanceByProject = new Map();
  for (const r of attendanceRows.rows) {
    if (!attendanceByProject.has(r.project_name)) {
      attendanceByProject.set(r.project_name, { project_name: r.project_name, present: 0, absent: 0, half_day: 0, leave: 0, total: 0, ot_hours: 0 });
    }
    const row = attendanceByProject.get(r.project_name);
    row[r.status] = (row[r.status] || 0) + r.cnt;
    row.total += r.cnt;
    row.ot_hours += Number(r.ot_hours || 0);
  }

  return {
    pos: pos.rows, wos: wos.rows, grns: grns.rows, mins: mins.rows, mrses: mrses.rows,
    pettyCash: pettyCash.rows,
    measurements: measurements.rows, raBills: raBills.rows, scBills: scBills.rows, vendorBills: vendorBills.rows,
    payments: payments.rows, invoices: invoices.rows, dprs: dprs.rows,
    attendance: [...attendanceByProject.values()],
    incidents: incidents.rows, permits: permits.rows, rfis: rfis.rows, ncrs: ncrs.rows,
    documents: documents.rows, gfcRevisions: gfcRevisions.rows, assetMoves: assetMoves.rows,
  };
}

async function runWeeklySummary({ fromDate, toDate, overrideRecipients } = {}) {
  const recipients = overrideRecipients
    ? parseEmails(overrideRecipients)
    : parseEmails(process.env.DAILY_ACTIVITY_DIGEST_EMAILS, DEFAULT_RECIPIENTS);
  if (!recipients.length) return { ok: false, reason: 'No recipients configured' };

  const timezone = process.env.DAILY_ACTIVITY_DIGEST_TZ || process.env.TZ || 'Asia/Kolkata';

  // Default: Monday of this week → today
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  if (!fromDate) {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // prev Monday
    fromDate = monday.toISOString().slice(0, 10);
  }
  if (!toDate) {
    toDate = now.toISOString().slice(0, 10);
  }

  const fmtD = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const dateLabel = `${fmtD(fromDate)} – ${fmtD(toDate)}`;

  const companies = await query(`SELECT id, name FROM companies WHERE COALESCE(is_active, TRUE) = TRUE`);
  const results = [];
  for (const company of companies.rows) {
    const data = await fetchRangeActivity(company.id, timezone, fromDate, toDate);
    const mail = buildMail({ companyName: company.name, data, dateLabel });
    // Override subject for weekly
    const totalItems = Object.values(data).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    const activeDepts = [data.pos, data.wos, data.grns, data.mins, data.mrses, data.pettyCash, data.measurements,
      data.raBills, data.scBills, data.vendorBills, data.payments, data.invoices, data.dprs, data.attendance,
      data.incidents, data.permits, data.rfis, data.ncrs, data.documents, data.gfcRevisions, data.assetMoves,
    ].filter(arr => arr.length > 0).length;
    mail.subject = `Weekly Activity Summary (${dateLabel}) — ${totalItems} update(s) across ${activeDepts} department(s)`;
    await sendMail({ to: recipients, ...mail });
    results.push({ company_id: company.id, company_name: company.name, items: totalItems, recipients });
  }
  return { ok: true, ran_at: new Date().toISOString(), fromDate, toDate, results };
}

module.exports = { runDailyActivityDigest, initDailyActivityDigest, runWeeklySummary };
